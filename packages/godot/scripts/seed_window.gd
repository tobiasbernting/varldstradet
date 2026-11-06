class_name SeedWindow
extends GameWindow
## The sagaträd (`open` with ui "seed", the prompt on the Yggdrasil shoot; GAME.md section 3.1): the three branches (Hjälten,
## Gemenskapen, Gården) with their 18 nodes, each planted, plantable or locked, and my sagafrön. Planting is `seed plant`; the
## server answers with a `seed` change that redraws this, and with the shoot's new variant on the farm.

const BRANCH_EMOJI := {"hjalte": "🛡️", "gemenskap": "👥", "gard": "🌾"}
const BRANCH_ORDER := ["hjalte", "gemenskap", "gard"]

var _branch := "hjalte"


func _init() -> void:
	title_text = "🌳 " + Strings.t("treeTitle")
	body_height = 400


func _purse_text(_me: Dictionary) -> String:
	return "🌱 %d" % int(model.tree.get("seeds", 0))


func _on_open() -> void:
	_set_tabs()


func _set_tabs() -> void:
	clear_tabs()
	var names: Dictionary = Data.run.get("branches", {})
	for id in BRANCH_ORDER:
		add_tab("%s %s" % [BRANCH_EMOJI.get(id, ""), names.get(id, id)], id == _branch, _view.bind(id))


func _view(id: String) -> void:
	_branch = id
	_set_tabs()
	refresh()


func _fill() -> void:
	var planted: Array = model.tree.get("tree", [])
	var seeds := int(model.tree.get("seeds", 0))
	var l := add_label("🌳 " + Strings.t("treeStage", {"n": planted.size()}), 16, GOOD)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for n in Data.run.get("tree", []):
		if not (n is Dictionary) or str(n.get("branch", "")) != _branch:
			continue
		var id := str(n.get("id", ""))
		var cost := int(n.get("cost", 0))
		var needs := str(n.get("needs", ""))
		var is_planted := planted.has(id)
		var locked := needs != "" and not planted.has(needs)
		var title := "%s %s" % ["✓" if is_planted else ("🔒" if locked else "🌱"), str(n.get("name", id))]
		var sub := str(n.get("text", ""))
		var buttons: Array = []
		if is_planted:
			sub = coloured(Strings.t("treePlanted"), true) + "  ·  " + sub
		elif locked:
			sub = coloured(Strings.t("treeNeeds", {"name": str(Data.tree_node(needs).get("name", needs))}), false) + "  ·  " + sub
		else:
			var b := make_button("%s  🌱 %d" % [Strings.t("treePlant"), cost], _plant.bind(id), "plant:" + id)
			b.disabled = seeds < cost
			buttons.append(b)
			sub = (coloured("🌱 %d / %d" % [seeds, cost], seeds >= cost)) + "  ·  " + sub
		add_row(null, title, sub, buttons, is_planted or locked)


func _plant(id: String) -> void:
	Net.send({"t": "seed", "a": "plant", "node": id})
	Sfx.play("target")
