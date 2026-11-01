class_name ClassWindow
extends GameWindow
## Kämpastenen (`saga class`, renderClass in the browser's ui/saga.ts): the four classes, one looked at closely with its
## blurb and its four spells, and the one I have. The pick is what lets the arch in the forest open; the server gives
## the class's outfit and the first chapter's goal.

var _look := ""


func _init() -> void:
	title_text = "🗿 " + Strings.t("sagaStoneTitle")
	body_height = 400


func _purse_text(_me: Dictionary) -> String:
	return ""


func _on_open() -> void:
	_look = Gear.cls_of(model.my_player())
	if _look == "":
		_look = str(Data.classes.keys()[0])
	_set_tabs()


func _set_tabs() -> void:
	clear_tabs()
	var mine := Gear.cls_of(model.my_player())
	for id in Data.classes.keys():
		var c: Dictionary = Data.classes[id]
		add_tab("%s %s%s" % [c.get("emoji", ""), c.get("name", ""), " ✓" if str(id) == mine else ""], str(id) == _look, _view.bind(str(id)))


func _view(id: String) -> void:
	_look = id
	_set_tabs()
	refresh()


func _fill() -> void:
	var mine := Gear.cls_of(model.my_player())
	add_label(Strings.t("sagaStoneIntro"), 15)
	var c: Dictionary = Data.classes.get(_look, {})
	var colour := Color.html(str(c.get("color", "#ffffff")))
	add_label("%s %s · %s   ❤️ %s" % [c.get("emoji", ""), c.get("name", ""), c.get("roleName", ""), Strings.t("sagaHealth", {"hp": int(c.get("hp", 0))})], 20, colour)
	add_label(str(c.get("blurb", "")), 16)
	add_label(Strings.t("sagaSpellsTitle"), 16, GOLD)
	var n := 1
	for sid in c.get("spells", []):
		var sp := Data.spell(str(sid))
		var sub := "%s\n%s" % [str(sp.get("text", "")), "[color=#aaaaaa]%d[/color]" % n]
		add_row(Data.icon("spell_" + str(sid)), "%s %s" % [sp.get("icon", ""), sp.get("name", "")], str(sp.get("text", "")), [])
		n += 1
	var pick := make_button(("✓ " + Strings.t("sagaMine")) if _look == mine else ("%s: %s %s" % [Strings.t("sagaPick"), c.get("emoji", ""), c.get("name", "")]), _pick.bind(_look), "pick")
	pick.disabled = _look == mine
	_body.add_child(pick)


func _pick(id: String) -> void:
	Net.send({"t": "saga", "a": "class", "cls": id})
	Sfx.play("target")
	_set_tabs()
	await get_tree().create_timer(0.35).timeout
	close()
