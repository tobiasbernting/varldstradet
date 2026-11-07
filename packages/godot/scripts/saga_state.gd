class_name SagaState
extends RefCounted
## Where my saga stands, read from my player record the way shared/src/sagasim.ts reads it: Völvan's chapter (told or
## not, done or not) and the villagers' saga quests (to take, going on, to hand in). The server decides; this is for
## what the Völvan's and the villagers' windows say and which buttons they offer.


static func chapter(me: Dictionary) -> Dictionary:
	var prog := Gear.progress(me)
	var i := int(prog.get("chapter", 0))
	var list: Array = Data.chapters
	return list[i] if i >= 0 and i < list.size() else {}


static func chapter_index(me: Dictionary) -> int:
	return int(Gear.progress(me).get("chapter", 0))


static func heard(me: Dictionary) -> bool:
	return bool(Gear.progress(me).get("heard", false))


static func field_count(me: Dictionary) -> int:
	var q: Variant = Gear.progress(me).get("quests")
	return int(q.get("field:%d" % chapter_index(me), 0)) if q is Dictionary else 0


## chapterDone: every part of the chapter Völvan has told is done.
static func chapter_done(me: Dictionary) -> bool:
	var ch := chapter(me)
	if ch.is_empty():
		return false
	var prog := Gear.progress(me)
	var dungeon: Variant = ch.get("dungeon")
	var field: Variant = ch.get("field")
	if dungeon == null and field == null:
		return str(prog.get("cls", "")) != ""
	var cleared: Array = prog.get("cleared", [])
	return (dungeon == null or cleared.has(str(dungeon))) and (field == null or field_count(me) >= int(field.get("count", 0)))


## "locked", "offer", "active", "ready" or "done" for a saga quest.
static func quest_state(me: Dictionary, q: Dictionary) -> String:
	var prog := Gear.progress(me)
	var qid := str(q.get("id", ""))
	if (prog.get("done", []) as Array).has(qid):
		return "done"
	var going: Dictionary = prog.get("quests", {}) if prog.get("quests") is Dictionary else {}
	if going.has(qid):
		return "ready" if quest_count(me, q) >= int(q.get("count", 1)) else "active"
	var ch := int(Data.dungeon(str(q.get("dungeon", ""))).get("chapter", 0))
	var here := int(prog.get("chapter", 0))
	if (prog.get("cleared", []) as Array).has(str(q.get("dungeon", ""))) or here > ch or (here == ch and bool(prog.get("heard", false))):
		return "offer"
	return "locked"


static func quest_count(me: Dictionary, q: Dictionary) -> int:
	if str(q.get("kind", "")) == "collect":
		var n := 0
		for st in me.get("inventory", []):
			if st is Dictionary and str(st.get("item", "")) == str(q.get("target", "")):
				n += int(st.get("count", 0))
		return n
	var going: Variant = Gear.progress(me).get("quests")
	return int(going.get(str(q.get("id", "")), 0)) if going is Dictionary else 0


## "20 kr + Flowerbox + 2 ⭐" of a reward.
static func reward_text(r: Dictionary) -> String:
	var parts: Array = []
	if int(r.get("coins", 0)) > 0:
		parts.append("%d %s" % [int(r["coins"]), Strings.t("coins")])
	if r.get("item") != null:
		var it: Variant = r["item"]
		parts.append(Data.item_name(str(it.get("item", ""))) if it is Dictionary else Data.item_name(str(it)))
	if int(r.get("stars", 0)) > 0:
		parts.append("%d ⭐" % int(r["stars"]))
	if r.get("title") != null:
		parts.append("👑 " + str(r["title"]))
	return " + ".join(parts)


## A villager's saga quests that are worth showing (to take, going on, or to hand in).
static func quests_of(me: Dictionary, npc: String) -> Array:
	var out: Array = []
	for q in Data.saga_quests:
		if str(q.get("npc", "")) == npc:
			var st := quest_state(me, q)
			if st == "offer" or st == "active" or st == "ready":
				out.append([q, st])
	return out


## The mark over a villager (sagaMarker in the browser's client/src/saga.ts): "hand" (a quest of the saga to hand in, or Völvan's
## chapter done), "offer" (something new to take, or Völvan has a chapter to tell), "busy" (it goes on), or "".
static func marker(me: Dictionary, npc: String) -> String:
	var prog := Gear.progress(me)
	var offer := false
	var hand := false
	var busy := false
	if npc == Data.volva and chapter_index(me) >= 0 and chapter_index(me) < Data.chapters.size():
		if not bool(prog.get("heard", false)):
			offer = true
		elif chapter_done(me):
			hand = true
		else:
			busy = true
	for q in Data.saga_quests:
		if str(q.get("npc", "")) != npc:
			continue
		match quest_state(me, q):
			"ready":
				hand = true
			"offer":
				offer = true
			"active":
				busy = true
	return "hand" if hand else ("offer" if offer else ("busy" if busy else ""))


## Has this player started the saga (heard Völvan, picked a class, or got past the first chapter)? sagaStarted in the browser.
static func started(me: Dictionary) -> bool:
	var prog := Gear.progress(me)
	return str(prog.get("cls", "")) != "" or bool(prog.get("heard", false)) or int(prog.get("chapter", 0)) > 0


## showsLevel: the level chip is shown from level 2 or with a class.
static func shows_level(me: Dictionary) -> bool:
	return not me.is_empty() and (Gear.level_of(me) >= 2 or Gear.cls_of(me) != "")


## A clear time as m:ss (the browser's clock()).
static func clock(ms: float) -> String:
	var sec := maxi(0, roundi(ms / 1000.0))
	return "%d:%02d" % [sec / 60, sec % 60]


## A chapter of Act II in its parts, for the tracker and the journal (chapterParts in the browser): the task out in the world and the
## dungeon, as [{text, done}]; [] for a chapter with one part only (its goal line says it all).
static func chapter_parts(me: Dictionary, index: int) -> Array:
	var list: Array = Data.chapters
	if index < 0 or index >= list.size():
		return []
	var ch: Dictionary = list[index]
	if not (ch.get("field") is Dictionary):
		return []
	var prog := Gear.progress(me)
	var field: Dictionary = ch["field"]
	var count := int(field.get("count", 0))
	var n := mini(count, field_count(me) if index == int(prog.get("chapter", 0)) else count)
	var field_done := n >= count
	var parts: Array = [{"text": Strings.t("sagaFieldDone", {"text": str(field.get("text", ""))}) if field_done else "🗡️ " + Strings.t("sagaFieldProgress", {"text": str(field.get("text", "")), "n": n, "count": count}), "done": field_done}]
	if ch.get("dungeon") != null:
		var d := Data.dungeon(str(ch["dungeon"]))
		var done: bool = (prog.get("cleared", []) as Array).has(str(ch["dungeon"]))
		var boss := str(Data.boss(str(d.get("boss", ""))).get("name", d.get("boss", "")))
		parts.append({"text": "%s %s" % ["✅" if done else "⚔️", Strings.t("sagaDungeonLine", {"boss": boss, "dungeon": str(d.get("name", ""))})], "done": done})
	return parts


## The lines of the quest tracker: [{text, done}] for my chapter and the saga quests that go on (renderTracker in the browser).
static func tracker_lines(me: Dictionary) -> Array:
	var out: Array = []
	var prog := Gear.progress(me)
	var ch := chapter(me)
	if not ch.is_empty():
		var heard_it := bool(prog.get("heard", false))
		var parts: Array = chapter_parts(me, chapter_index(me)) if heard_it and not chapter_done(me) else []
		if not parts.is_empty():
			out.append_array(parts)
		else:
			var line := Strings.t("sagaVisitVolva") if not heard_it else (Strings.t("sagaBackToVolva") if chapter_done(me) else str(ch.get("goal", "")))
			out.append({"text": ("🎯 " if heard_it else "❗ ") + line, "done": heard_it and chapter_done(me)})
	for q in Data.saga_quests:
		var st := quest_state(me, q)
		if st != "active" and st != "ready":
			continue
		var npc := str(Data.npcs.get(str(q.get("npc", "")), {}).get("name", q.get("npc", "")))
		var tail := Strings.t("sagaQuestReadyAt", {"npc": npc}) if st == "ready" else Strings.t("sagaQuestAt", {"n": mini(int(q.get("count", 1)), quest_count(me, q)), "count": int(q.get("count", 1))})
		out.append({"text": "%s: %s" % [str(q.get("title", "")), tail], "done": st == "ready"})
	return out
