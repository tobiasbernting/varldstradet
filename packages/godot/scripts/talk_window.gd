class_name TalkWindow
extends GameWindow
## A villager's window (renderNpc, renderTalk and Völvan's story in the browser's ui/menus.ts and ui/saga.ts): their
## greeting with a face, "Prata!" for the conversation (dialogue.gd: stories, questions, jokes, riddles, sten sax påse),
## the day's önskningar (what they want, what I have, the reward, and "Lämna" that sends `quest`), and the saga's
## quests for them (`saga quest`). Völvan Sigrun's window is the same with the chapter as a story told line by line:
## "Jag hjälper dig!" (`saga chapter`), "Ta emot belöningen", and a way to the class stone.

signal class_asked
## Smed-Stina's window has a button to her forge (forge_window.gd).
signal forge_asked

const FAR_TILES := 5.0

var npc := ""
var _talk: Variant = null
var _said := ""
var _tab := "story"
var _line := 0
var _line_key := ""
var _rnd := RandomNumberGenerator.new()
var _far_in := 0.0


func _init() -> void:
	body_height = 400
	_rnd.randomize()


func _purse_text(_me: Dictionary) -> String:
	return ""


func open_npc(id: String) -> void:
	npc = id
	_talk = null
	_said = ""
	_tab = "story"
	_line = 0
	_line_key = ""
	set_title(str(Data.npcs.get(id, {}).get("name", id)))
	_set_tabs()
	open_window()


func _set_tabs() -> void:
	clear_tabs()
	if npc != Data.volva:
		return
	add_tab(Strings.t("sagaStoryTab"), _tab == "story", _set_tab.bind("story"))
	add_tab(Strings.t("sagaTalk"), _tab == "talk", _set_tab.bind("talk"))


func _set_tab(t: String) -> void:
	_tab = t
	if t == "talk":
		_say("start", "")
	else:
		_talk = null
	_set_tabs()
	refresh()


func _fill() -> void:
	if not Data.npcs.has(npc):
		close()
		return
	var me := model.my_player()
	if _talk != null:
		_fill_talk(me)
	elif npc == Data.volva and _tab == "story":
		_fill_story(me)
	else:
		_fill_front(me)


## The villager's own window: a greeting, the chat, the saga's quests and the day's wishes.
func _fill_front(me: Dictionary) -> void:
	var def: Dictionary = Data.npcs.get(npc, {})
	var wishes := _wishes(me)
	var saga := SagaState.quests_of(me, npc)
	var greetings: Array = def.get("greeting", ["Hej!"])
	var line := str(greetings[(model.day + str(def.get("name", "")).length()) % greetings.size()]) if (not wishes.is_empty() or not saga.is_empty()) else Strings.t("questAllDone")
	add_bubble(npc_portrait(npc), line)
	var chat := make_button(Strings.t("talkChat"), _say.bind("start", ""), "chat")
	_body.add_child(chat)
	_add_forge_button()
	for pair in saga:
		_saga_row(me, pair[0], str(pair[1]))
	for q in wishes:
		_wish_row(me, q)


## Stina's forge, for everyone (anyone can own gear): a button in her window, as the browser's forgeButton.
func _add_forge_button() -> void:
	if npc == str(Data.gear.get("smith", "stina")):
		_body.add_child(make_button(Strings.t("forgeBtn"), func() -> void:
			close()
			forge_asked.emit(), "forge"))


func _wishes(me: Dictionary) -> Array:
	var out: Array = []
	var done: Array = me.get("questsDone", [])
	for q in model.quests():
		if str(q.get("npc", "")) == npc and not done.has(str(q.get("id", ""))):
			out.append(q)
	return out


func _wish_row(me: Dictionary, q: Dictionary) -> void:
	var want: Dictionary = q.get("want", {})
	var item := str(want.get("item", ""))
	var have := model.count_item(item)
	var ok := have >= int(want.get("count", 1))
	var sub := "%s: %d %s (%s)\n%s: %s" % [Strings.t("questWant"), int(want.get("count", 1)), Data.item_name(item).to_lower(), Strings.t("questHave", {"n": have}), Strings.t("questReward"), SagaState.reward_text(q.get("reward", {}))]
	var b := make_button(Strings.t("questGive"), _give.bind(str(q.get("id", ""))), "q:" + str(q.get("id", "")))
	b.disabled = not ok
	add_row(Data.item_icon(item), str(q.get("text", "")), coloured(sub, ok), [b], not ok)


func _give(id: String) -> void:
	Net.send({"t": "quest", "id": id})


func _saga_row(me: Dictionary, q: Dictionary, st: String) -> void:
	var title := "%s %s" % [("❓" if st == "ready" else ("❗" if st == "offer" else "📜")), str(q.get("title", ""))]
	var lines: Array = q.get("tell", []) if st == "offer" else (q.get("done", []) if st == "ready" else [])
	var sub := " ".join(lines)
	if st != "ready":
		sub += ("\n" if sub != "" else "") + "🎯 " + str(q.get("goal", ""))
	if st != "offer":
		sub += "\n" + Strings.t("sagaQuestAt", {"n": SagaState.quest_count(me, q), "count": int(q.get("count", 1))})
	sub += "\n" + Strings.t("sagaReward", {"reward": SagaState.reward_text(q.get("reward", {}))})
	var buttons: Array = []
	if st == "offer":
		buttons.append(make_button(Strings.t("sagaQuestRowOffer"), _saga_quest.bind(str(q.get("id", ""))), "sq:" + str(q.get("id", ""))))
	elif st == "ready":
		buttons.append(make_button(Strings.t("sagaQuestRowReady"), _saga_quest.bind(str(q.get("id", ""))), "sq:" + str(q.get("id", ""))))
	add_row(Data.icon("ui_box"), title, sub, buttons)


func _saga_quest(id: String) -> void:
	Net.send({"t": "saga", "a": "quest", "id": id})


## The conversation.
func _fill_talk(me: Dictionary) -> void:
	if _said != "":
		add_label(Strings.t("talkYou", {"text": _said}), 14, Color(1, 1, 1, 0.6))
	add_bubble(npc_portrait(npc), str(_talk.get("say", "")))
	var i := 0
	for o in _talk.get("options", []):
		var go := str(o.get("go", ""))
		var b := make_button(str(o.get("text", "")), _say.bind(go, str(o.get("text", ""))), "o:%d" % i)
		_body.add_child(b)
		i += 1
	if not _wishes(me).is_empty() or not SagaState.quests_of(me, npc).is_empty():
		_body.add_child(make_button(Strings.t("talkQuests"), _to_front, "front"))
	_add_forge_button()


func _to_front() -> void:
	_talk = null
	_said = ""
	if npc == Data.volva:
		_tab = "story"
		_set_tabs()
	refresh()


func _say(node: String, said: String) -> void:
	if node == "":
		_to_front()
		close()
		return
	var me := model.my_player()
	var pets: Array = []
	for a in model.world_for(model.my_area_key()).get("animals", {}).values():
		if a is Dictionary and str(a.get("owner", "")) == model.me and str(a.get("name", "")) != "" and (bool(Data.animals.get(str(a.get("species", "")), {}).get("pet", false)) or Data.animals.get(str(a.get("species", "")), {}).has("mount") or str(a.get("species", "")) == "horse"):
			pets.append({"name": str(a.get("name", "")), "species": str(a.get("species", ""))})
	var weather := ""
	if model.weather is Dictionary and model.my_area_key() == "farm":
		weather = str(model.weather.get("kind", ""))
	var ctx := {"name": str(me.get("name", "")), "weather": weather, "dayFraction": fmod(model.time_ms, Data.constant("DAY_LENGTH_MS", 600000.0)) / Data.constant("DAY_LENGTH_MS", 600000.0), "season": model.season, "pets": pets, "rnd": _rnd}
	_talk = Dialogue.talk_node(npc, node, ctx)
	_said = said
	Sfx.play("target")
	refresh()


## Völvan's chapter as a story, line by line.
func _fill_story(me: Dictionary) -> void:
	var ch := SagaState.chapter(me)
	var face := npc_portrait(npc)
	if ch.is_empty():
		add_bubble(face, Strings.t("sagaAllDone"))
		return
	var mode := "tell" if not SagaState.heard(me) else ("done" if SagaState.chapter_done(me) else "goal")
	var tell: Array = ch.get("tell", [])
	var lines: Array = tell if mode == "tell" else (ch.get("done", []) if mode == "done" else [tell[tell.size() - 1]])
	var key := "%d:%s" % [SagaState.chapter_index(me), mode]
	if key != _line_key:
		_line_key = key
		_line = 0
	var idx := SagaState.chapter_index(me)
	var heading := str(ch.get("title", "")) if idx == 0 else Strings.t("sagaChapter", {"n": idx, "title": str(ch.get("title", ""))})
	add_label("📜 " + heading, 20, GOLD)
	var said: Array = []
	for k in range(mini(_line + 1, lines.size())):
		said.append(str(lines[k]))
	add_bubble(face, "\n\n".join(said))
	var reward := Strings.t("sagaReward", {"reward": SagaState.reward_text(ch.get("reward", {}))})
	if _line < lines.size() - 1:
		_body.add_child(make_button(Strings.t("sagaMore"), _more, "more"))
	elif mode == "tell":
		add_label("🎯 %s: %s" % [Strings.t("sagaGoal"), str(ch.get("goal", ""))], 16)
		add_label(reward, 16, GOLD)
		_body.add_child(make_button(Strings.t("sagaPromise"), _chapter, "chapter"))
	elif mode == "done":
		add_label(reward, 18, GOLD)
		_body.add_child(make_button("🎁 " + Strings.t("sagaTakeReward"), _chapter, "chapter"))
	else:
		add_label("🎯 %s: %s" % [Strings.t("sagaGoal"), str(ch.get("goal", ""))], 16)
		if Gear.cls_of(me) == "":
			_body.add_child(make_button(Strings.t("sagaChooseWay"), func() -> void:
				close()
				class_asked.emit(), "way"))


func _more() -> void:
	_line += 1
	Sfx.play("target")
	refresh()


func _chapter() -> void:
	Net.send({"t": "saga", "a": "chapter"})


func _process(delta: float) -> void:
	if not is_open():
		return
	_far_in -= delta
	if _far_in > 0.0:
		return
	_far_in = 0.25
	var n: Variant = model.npc_snaps.get(npc)
	if n is Dictionary:
		var tile := Data.tile()
		if Vector2(float(n.get("x", 0)) - hero.px, float(n.get("y", 0)) - hero.py).length() / tile > FAR_TILES:
			close()
