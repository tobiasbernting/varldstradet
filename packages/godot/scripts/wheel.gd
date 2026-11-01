class_name Wheel
extends CanvasLayer
## A radial wheel for the kids' gamepads: a ring of pictures around the middle of the screen, the stick (or the
## mouse) leans towards one, and letting go of the button picks it. Used for the emotes (hjärta, skratt, hej,
## hjälp, titta, sova) and, when the setting says so, for the four spells on one button. Drawn in code.

signal picked(id: String)

const RADIUS := 120.0
const SLICE := 76.0

var _root: Control
var _slices: Array = [] ## {id, panel, style, icon, label, angle}
var _title: Label
var _open := false
var _chosen := -1
var _hold_action := ""
var _mouse_mode := false


func _ready() -> void:
	layer = 9
	visible = false
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 18)
	_title.add_theme_color_override("font_outline_color", Color("2b2419"))
	_title.add_theme_constant_override("outline_size", 6)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.anchor_left = 0.5
	_title.anchor_right = 0.5
	_title.anchor_top = 0.5
	_title.anchor_bottom = 0.5
	_title.offset_left = -200
	_title.offset_right = 200
	_title.offset_top = -14
	_title.offset_bottom = 14
	_root.add_child(_title)


func is_open() -> bool:
	return _open


## Opens with a list of {id, icon (Texture2D), name}; `hold_action` is the action whose release picks (""
## means a second press of the stick/A picks and the menu key closes).
func open(title: String, entries: Array, hold_action := "") -> void:
	for s in _slices:
		s["panel"].queue_free()
	_slices = []
	_title.text = title
	_hold_action = hold_action
	_chosen = -1
	_mouse_mode = false
	var n := entries.size()
	for i in range(n):
		var e: Dictionary = entries[i]
		var ang := -PI / 2.0 + TAU * i / n
		var panel := PanelContainer.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.1, 0.08, 0.08, 0.85)
		sb.set_corner_radius_all(12)
		sb.set_border_width_all(3)
		sb.border_color = Color(0.5, 0.45, 0.4)
		panel.add_theme_stylebox_override("panel", sb)
		panel.anchor_left = 0.5
		panel.anchor_right = 0.5
		panel.anchor_top = 0.5
		panel.anchor_bottom = 0.5
		panel.offset_left = cos(ang) * RADIUS - SLICE / 2.0
		panel.offset_top = sin(ang) * RADIUS - SLICE / 2.0
		panel.offset_right = panel.offset_left + SLICE
		panel.offset_bottom = panel.offset_top + SLICE + 18
		_root.add_child(panel)
		var stack := VBoxContainer.new()
		panel.add_child(stack)
		var icon := TextureRect.new()
		icon.texture = e.get("icon")
		icon.custom_minimum_size = Vector2(SLICE - 16, SLICE - 24)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		stack.add_child(icon)
		var label := Label.new()
		label.text = str(e.get("name", ""))
		label.add_theme_font_size_override("font_size", 11)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.clip_text = true
		stack.add_child(label)
		_slices.append({"id": str(e.get("id", "")), "panel": panel, "style": sb, "icon": icon, "label": label, "angle": ang})
	_open = true
	visible = true


func close() -> void:
	_open = false
	visible = false


func _process(_delta: float) -> void:
	if not _open:
		return
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if dir.length() < 0.5:
		var centre := get_viewport().get_visible_rect().size / 2.0
		var m := get_viewport().get_mouse_position() - centre
		if m.length() > 40.0:
			dir = m
			_mouse_mode = true
		else:
			dir = Vector2.ZERO
	if dir.length() >= 0.5:
		var ang := atan2(dir.y, dir.x)
		var best := -1
		var best_d := INF
		for i in range(_slices.size()):
			var d := absf(angle_difference(ang, float(_slices[i]["angle"])))
			if d < best_d:
				best_d = d
				best = i
		_choose(best)
	if _hold_action != "" and not Input.is_action_pressed(_hold_action):
		_pick()


func _choose(i: int) -> void:
	if i == _chosen:
		return
	_chosen = i
	for k in range(_slices.size()):
		var sb: StyleBoxFlat = _slices[k]["style"]
		var on := k == i
		sb.border_color = Color(1.0, 0.9, 0.5) if on else Color(0.5, 0.45, 0.4)
		sb.bg_color = Color(0.3, 0.25, 0.15, 0.95) if on else Color(0.1, 0.08, 0.08, 0.85)
		_slices[k]["panel"].scale = Vector2(1.1, 1.1) if on else Vector2.ONE
		_slices[k]["panel"].pivot_offset = Vector2(SLICE / 2.0, SLICE / 2.0 + 9)
	if i >= 0:
		Sfx.play("target")


func _pick() -> void:
	var id := str(_slices[_chosen]["id"]) if _chosen >= 0 and _chosen < _slices.size() else ""
	close()
	if id != "":
		picked.emit(id)


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	if event.is_action_pressed("menu"):
		close()
		get_viewport().set_input_as_handled()
	elif _hold_action == "" and (event.is_action_pressed("act") or event.is_action_pressed("emote") or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)):
		_pick()
		get_viewport().set_input_as_handled()
