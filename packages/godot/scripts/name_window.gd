class_name NameWindow
extends CanvasLayer
## "Vad ska Höna heta?": the window that opens when you pet an animal nobody has named (the `open` change with ui
## nameAnimal). The server already gave it a name; OK sends the one in the box (`nameAnimal`), so a pad with no keyboard
## can press OK and keep the suggestion. Escape closes without naming, as the browser's window does.

signal closed

var _root: Control
var _title: Label
var _input: LineEdit
var _ok: Button
var _animal := -1
var _open := false
var _opened_at := 0


func _ready() -> void:
	layer = 9
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
	_root.add_child(centre)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.12, 0.1, 0.09, 0.97)
	sb.set_corner_radius_all(12)
	sb.set_border_width_all(3)
	sb.border_color = Color("8a6a3a")
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 18
	sb.content_margin_bottom = 18
	panel.add_theme_stylebox_override("panel", sb)
	centre.add_child(panel)
	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(380, 0)
	stack.add_theme_constant_override("separation", 12)
	panel.add_child(stack)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 22)
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(_title)
	_input = LineEdit.new()
	_input.max_length = 14
	_input.custom_minimum_size = Vector2(0, 40)
	_input.text_submitted.connect(func(_t: String) -> void: _submit())
	stack.add_child(_input)
	_ok = Button.new()
	_ok.text = Strings.t("ok")
	_ok.custom_minimum_size = Vector2(0, 44)
	BagWindow.style_button(_ok)
	_ok.pressed.connect(_submit)
	stack.add_child(_ok)


func is_open() -> bool:
	return _open


func open_for(animal_id: int, species: String, current_name: String) -> void:
	_animal = animal_id
	_title.text = Strings.t("nameAnimal", {"species": Strings.species(species)})
	_input.text = current_name
	_open = true
	_opened_at = Time.get_ticks_msec()
	visible = true
	_input.grab_focus()
	_input.select_all()


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false
	closed.emit()


func _submit() -> void:
	var name_text := _input.text.strip_edges()
	if name_text != "" and _animal >= 0:
		Net.send({"t": "nameAnimal", "id": _animal, "name": name_text})
	close()


func _unhandled_input(event: InputEvent) -> void:
	if _open and Time.get_ticks_msec() - _opened_at > 250 and (event.is_action_pressed("ui_cancel") or event.is_action_pressed("menu")):
		close()
		get_viewport().set_input_as_handled()
