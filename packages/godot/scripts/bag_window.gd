class_name BagWindow
extends CanvasLayer
## The bag, and a chest beside it when one is open: the browser's inventory window (ui/menus.ts, renderInventory).
## The hotbar's eight squares and the backpack's twenty-four, search and filter chips that dim what does not
## match, "pick one square, then another to move it" (the `swap` message; the server merges stacks and swaps
## places), Sortera (`sort`, the backpack past the hotbar or the chest), Lägg i kistan (`quickStack`), Håll (`select`),
## and Lägg ner 1 / alla (`drop`). The server owns everything: this only sends the intent and redraws from my record
## when the server sends it back. Mouse, keyboard and gamepad (the d-pad or stick moves the highlight, A presses,
## B closes) all work, because the squares are buttons.

signal closed

## A chest further away than this (tiles) closes the window: the server refuses a swap past REACH + 1.5.
const CHEST_FAR := 3.2

var model: WorldModel
var hero: Hero
var _root: Control
var _coins: Label
var _search: LineEdit
var _chips: Dictionary = {}
var _bag_slots: Array[ItemSlot] = []
var _chest_slots: Array[ItemSlot] = []
var _chest_box: VBoxContainer
var _chest_sort: Button
var _hold: Button
var _drop1: Button
var _drop_all: Button
var _sort: Button
var _stack: Button
var _picked_name: Label
var _hint: Label
var _picked := {} ## {chest: int (-1 = my bag), slot: int} or {}
var _chest_id := -1
var _filter := "all"
var _query := ""
var _open := false
var _opened_at := 0


func _ready() -> void:
	layer = 8
	visible = false
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	var dim := ColorRect.new()
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.color = Color(0, 0, 0, 0.5)
	_root.add_child(dim)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(centre)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.12, 0.1, 0.09, 0.97)
	sb.set_corner_radius_all(12)
	sb.set_border_width_all(3)
	sb.border_color = Color("8a6a3a")
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", sb)
	centre.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	panel.add_child(stack)

	var head := HBoxContainer.new()
	stack.add_child(head)
	var title := Label.new()
	title.text = "🎒 " + Strings.t("inventory")
	title.add_theme_font_size_override("font_size", 26)
	head.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(spacer)
	_coins = Label.new()
	_coins.add_theme_font_size_override("font_size", 20)
	_coins.add_theme_color_override("font_color", Color("e8b830"))
	head.add_child(_coins)

	# search and the filter chips
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 6)
	stack.add_child(bar)
	_search = LineEdit.new()
	_search.placeholder_text = Strings.t("search")
	_search.custom_minimum_size = Vector2(200, 36)
	_search.clear_button_enabled = true
	_search.text_changed.connect(func(t: String) -> void:
		_query = t.strip_edges().to_lower()
		refresh())
	bar.add_child(_search)
	_add_chip(bar, "all", Strings.t("filterAll"), Strings.t("filterAll"))
	for f in Data.filters:
		_add_chip(bar, str(f.get("id", "")), str(f.get("emoji", "")), str(f.get("name", "")))

	# the chest (when one is open) beside the bag
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 24)
	stack.add_child(cols)
	_chest_box = VBoxContainer.new()
	_chest_box.add_theme_constant_override("separation", 6)
	cols.add_child(_chest_box)
	var chest_head := HBoxContainer.new()
	_chest_box.add_child(chest_head)
	var chest_title := Label.new()
	chest_title.text = Strings.t("chest")
	chest_title.add_theme_font_size_override("font_size", 18)
	chest_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chest_head.add_child(chest_title)
	_chest_sort = _button(Strings.t("sort") + " " + Strings.t("chest").to_lower(), _on_sort_chest)
	chest_head.add_child(_chest_sort)
	var chest_grid := _grid()
	_chest_box.add_child(chest_grid)
	for i in range(int(Data.constant("CHEST_SIZE", 32.0))):
		_chest_slots.append(_make_slot(chest_grid, i, true))

	var bag_box := VBoxContainer.new()
	bag_box.add_theme_constant_override("separation", 6)
	cols.add_child(bag_box)
	var bag_title := Label.new()
	bag_title.text = Strings.t("inventory")
	bag_title.add_theme_font_size_override("font_size", 18)
	bag_box.add_child(bag_title)
	var bag_grid := _grid()
	bag_box.add_child(bag_grid)
	var hotbar_n := int(Data.constant("HOTBAR_SIZE", 8.0))
	for i in range(int(Data.constant("INVENTORY_SIZE", 32.0))):
		var s := _make_slot(bag_grid, i, false)
		if i < hotbar_n:
			s.set_key(str(i + 1))
		_bag_slots.append(s)

	# what is picked, and what can be done with it
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	stack.add_child(actions)
	_picked_name = Label.new()
	_picked_name.add_theme_font_size_override("font_size", 16)
	_picked_name.add_theme_color_override("font_color", ItemSlot.PICKED)
	_picked_name.custom_minimum_size = Vector2(170, 0)
	actions.add_child(_picked_name)
	_hold = _button("", _on_hold)
	_drop1 = _button(Strings.t("dropOne"), _on_drop.bind(1))
	_drop_all = _button(Strings.t("dropAll"), _on_drop.bind(99))
	_sort = _button(Strings.t("sort"), _on_sort)
	_stack = _button(Strings.t("quickStack"), _on_stack)
	var close_button := _button(Strings.t("ok"), close)
	for b in [_hold, _drop1, _drop_all, _sort, _stack, close_button]:
		actions.add_child(b)
	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", 14)
	_hint.modulate = Color(1, 1, 1, 0.75)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.custom_minimum_size = Vector2(640, 36)
	stack.add_child(_hint)


func _grid() -> GridContainer:
	var g := GridContainer.new()
	g.columns = 8
	g.add_theme_constant_override("h_separation", 4)
	g.add_theme_constant_override("v_separation", 4)
	return g


func _button(text: String, call: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 40)
	b.pressed.connect(call)
	return b


func _add_chip(parent: Control, id: String, text: String, tip: String) -> void:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.toggle_mode = true
	b.custom_minimum_size = Vector2(44, 36)
	b.button_pressed = id == "all"
	b.pressed.connect(func() -> void:
		_filter = id
		for k in _chips.keys():
			_chips[k].button_pressed = k == id
		refresh())
	parent.add_child(b)
	_chips[id] = b


func _make_slot(grid: GridContainer, i: int, in_chest: bool) -> ItemSlot:
	var s := ItemSlot.new()
	s.slot = i
	s.chest = 0 if in_chest else -1 # (the chest's real id is set when it opens)
	s.pressed.connect(_tap.bind(s))
	s.focus_entered.connect(_describe.bind(s))
	s.mouse_entered.connect(_describe.bind(s))
	grid.add_child(s)
	return s


func is_open() -> bool:
	return _open


## Opens the bag; with a chest id, the chest beside it.
func open_bag(chest_id := -1) -> void:
	_chest_id = chest_id
	_chest_box.visible = chest_id >= 0
	_chest_sort.visible = chest_id >= 0
	_stack.visible = chest_id >= 0
	for s in _chest_slots:
		s.chest = chest_id
	_picked = {}
	_query = ""
	_search.text = ""
	_filter = "all"
	for k in _chips.keys():
		_chips[k].button_pressed = k == "all"
	_open = true
	_opened_at = Time.get_ticks_msec()
	visible = true
	refresh()
	_hint.text = Strings.t("bagMoveHint")
	var sel := clampi(int(model.my_player().get("selected", 0)), 0, _bag_slots.size() - 1)
	_bag_slots[sel].grab_focus()
	Sfx.play("target")


func close() -> void:
	if not _open:
		return
	_open = false
	_picked = {}
	_chest_id = -1
	visible = false
	closed.emit()


func _stack_at(chest_id: int, slot: int) -> Variant:
	if chest_id < 0:
		var inv: Array = model.my_player().get("inventory", [])
		return inv[slot] if slot < inv.size() else null
	var items: Variant = model.chest(chest_id).get("items")
	if items is Array and slot < items.size():
		return items[slot]
	return null


func _matches(stack: Variant) -> bool:
	if not (stack is Dictionary):
		return true
	var id := str(stack.get("item", ""))
	if _filter != "all" and Data.filter_of(id) != _filter:
		return false
	return _query == "" or Data.item_name(id).to_lower().contains(_query)


func _is_picked(chest_id: int, slot: int) -> bool:
	return not _picked.is_empty() and int(_picked["chest"]) == chest_id and int(_picked["slot"]) == slot


## Redraws every square from my record and the chest; the squares only change what differs.
func refresh() -> void:
	if not _open:
		return
	var me := model.my_player()
	var inv: Array = me.get("inventory", [])
	var selected := int(me.get("selected", 0))
	var filtering := _filter != "all" or _query != ""
	for i in range(_bag_slots.size()):
		var st: Variant = inv[i] if i < inv.size() else null
		_bag_slots[i].show_stack(st, i == selected, _is_picked(-1, i), filtering and st is Dictionary and not _matches(st))
	if _chest_id >= 0:
		var items: Variant = model.chest(_chest_id).get("items")
		for i in range(_chest_slots.size()):
			var st: Variant = items[i] if items is Array and i < items.size() else null
			_chest_slots[i].show_stack(st, false, _is_picked(_chest_id, i), filtering and st is Dictionary and not _matches(st))
	_coins.text = "%d %s" % [int(me.get("coins", 0)), Strings.t("coins")]
	var picked: Variant = _stack_at(int(_picked["chest"]), int(_picked["slot"])) if not _picked.is_empty() else null
	if not (picked is Dictionary):
		_picked = {}
		picked = null
	var mine: bool = picked != null and int(_picked["chest"]) < 0
	_picked_name.text = "" if picked == null else Strings.t("bagPicked", {"item": Data.item_name(str(picked.get("item", ""))) + (" × %d" % int(picked.get("count", 1)) if int(picked.get("count", 1)) > 1 else "")})
	_hold.visible = mine
	_drop1.visible = mine
	_drop_all.visible = mine
	if mine:
		_hold.text = Strings.t("hold", {"item": Data.item_name(str(picked.get("item", "")))})


func _describe(s: ItemSlot) -> void:
	var st: Variant = _stack_at(s.chest, s.slot)
	if not (st is Dictionary):
		_hint.text = Strings.t("bagMoveHint")
		return
	var id := str(st.get("item", ""))
	var text := Data.item_name(id)
	if int(st.get("count", 1)) > 1:
		text += " × %d" % int(st.get("count", 1))
	if st.has("charges"):
		text += "   " + Strings.t("canCharges", {"n": int(st.get("charges", 0)), "max": int(Data.constant("WATERING_CAN_CHARGES", 20.0))})
	var info := str(Data.item(id).get("text", ""))
	_hint.text = text + ("   ·   " + info if info != "" else "")


func _tap(s: ItemSlot) -> void:
	var chest_id := s.chest
	var st: Variant = _stack_at(chest_id, s.slot)
	if _picked.is_empty():
		if not (st is Dictionary):
			return
		if (_filter != "all" or _query != "") and not _matches(st):
			return
		_picked = {"chest": chest_id, "slot": s.slot}
		Sfx.play("target")
	elif _is_picked(chest_id, s.slot):
		_picked = {}
	else:
		Net.send({"t": "swap", "a": _ref(int(_picked["chest"]), int(_picked["slot"])), "b": _ref(chest_id, s.slot)})
		_picked = {}
	refresh()


static func _ref(chest_id: int, slot: int) -> Dictionary:
	if chest_id < 0:
		return {"slot": slot}
	return {"chest": chest_id, "slot": slot}


func _on_hold() -> void:
	if _picked.is_empty() or int(_picked["chest"]) >= 0:
		return
	var slot := int(_picked["slot"])
	model.my_player()["selected"] = slot
	Net.send({"t": "select", "slot": slot})
	close()


func _on_drop(qty: int) -> void:
	if _picked.is_empty() or int(_picked["chest"]) >= 0:
		return
	Net.send({"t": "drop", "slot": int(_picked["slot"]), "qty": qty})
	_picked = {}


func _on_sort() -> void:
	Net.send({"t": "sort"})


func _on_sort_chest() -> void:
	if _chest_id >= 0:
		Net.send({"t": "sort", "chest": _chest_id})


func _on_stack() -> void:
	if _chest_id >= 0:
		Net.send({"t": "quickStack", "chest": _chest_id})


func _process(_delta: float) -> void:
	if not _open or _chest_id < 0:
		return
	# walked away from the chest, or someone took it down
	var c := model.chest(_chest_id)
	if c.is_empty():
		close()
		return
	var def := Data.object_def(str(c.get("kind", "")))
	var tile := Data.tile()
	var cx := (float(c.get("x", 0)) + float(def.get("w", 1)) / 2.0) * tile
	var cy := (float(c.get("y", 0)) + float(def.get("h", 1)) / 2.0) * tile
	if Vector2(cx - hero.px, cy - hero.py).length() / tile > CHEST_FAR:
		close()


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	var late := Time.get_ticks_msec() - _opened_at > 250
	if late and (event.is_action_pressed("menu") or event.is_action_pressed("bag") or event.is_action_pressed("ui_cancel")):
		close()
		get_viewport().set_input_as_handled()
