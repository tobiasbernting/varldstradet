class_name ChatUi
extends CanvasLayer
## Chat with everyone in the world (the `chat` messages: 80 characters, the ready-made phrases from sv.ts), the
## browser's ui/social.ts on a native screen: a small log in the bottom-left corner that fades after a while, and
## a box with the phrases and a line to type in, opened with Enter or T (or the gamepad's Back button). The
## bubbles over heads are the actors' (world.gd puts them there). A boss's shouts land in the log too.

signal toggled(open: bool)

const LOG_MS := 15000.0
const LOG_LINES := 5

var _log: VBoxContainer
var _box: PanelContainer
var _input: LineEdit
var _phrases: GridContainer
var _lines: Array = [] ## {label, at}
var _open := false


func _ready() -> void:
	layer = 8
	_log = VBoxContainer.new()
	_log.anchor_top = 1.0
	_log.anchor_bottom = 1.0
	_log.offset_left = 16
	_log.offset_right = 420
	_log.offset_top = -330
	_log.offset_bottom = -150
	_log.alignment = BoxContainer.ALIGNMENT_END
	_log.add_theme_constant_override("separation", 2)
	_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_log)
	_box = PanelContainer.new()
	_box.anchor_top = 1.0
	_box.anchor_bottom = 1.0
	_box.offset_left = 16
	_box.offset_right = 520
	_box.offset_top = -150
	_box.offset_bottom = -20
	_box.visible = false
	add_child(_box)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 6)
	_box.add_child(stack)
	var title := Label.new()
	title.text = Strings.t("chatTitle")
	title.add_theme_font_size_override("font_size", 14)
	title.modulate = Color(1, 1, 1, 0.8)
	stack.add_child(title)
	_phrases = GridContainer.new()
	_phrases.columns = 4
	_phrases.add_theme_constant_override("h_separation", 4)
	_phrases.add_theme_constant_override("v_separation", 4)
	stack.add_child(_phrases)
	for p in Data.chat_phrases:
		var b := Button.new()
		b.text = str(p)
		b.add_theme_font_size_override("font_size", 13)
		b.pressed.connect(func() -> void: send(str(p)))
		_phrases.add_child(b)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	stack.add_child(row)
	_input = LineEdit.new()
	_input.max_length = int(Data.constant("CHAT_MAX_LEN", 80))
	_input.placeholder_text = Strings.t("chatPlaceholder")
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.text_submitted.connect(func(text: String) -> void: send(text))
	row.add_child(_input)
	var send_button := Button.new()
	send_button.text = Strings.t("chatSend")
	send_button.pressed.connect(func() -> void: send(_input.text))
	row.add_child(send_button)
	var close_button := Button.new()
	close_button.text = "✕"
	close_button.pressed.connect(close)
	row.add_child(close_button)


func is_open() -> bool:
	return _open


## Makes room in the middle of a narrow screen (hud.gd's `centre_busy`): the small log in the corner is hidden for a while.
func set_log_hidden(on: bool) -> void:
	_log.modulate.a = 0.0 if on else 1.0


func open() -> void:
	if _open:
		return
	_open = true
	_box.visible = true
	_fade()
	toggled.emit(true)
	_input.grab_focus()


func close() -> void:
	if not _open:
		return
	_open = false
	_box.visible = false
	_input.release_focus()
	_input.text = ""
	_fade()
	toggled.emit(false)


func toggle() -> void:
	if _open:
		close()
	else:
		open()


func send(text: String) -> void:
	var t := text.strip_edges()
	if t != "":
		Net.send({"t": "chat", "text": t})
	close()


func reset() -> void:
	for l in _lines:
		l["label"].queue_free()
	_lines = []
	close()


## A `chat` change (or a boss's shout as the browser forwards it: `name` "⚔️ Boss").
func add_line(c: Dictionary, me: String) -> void:
	var mine := str(c.get("from", "")) == me
	var old := bool(c.get("old", false))
	var l := Label.new()
	l.text = "%s: %s" % [str(c.get("name", "")), str(c.get("text", ""))]
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_outline_color", Color("2b2419"))
	l.add_theme_constant_override("outline_size", 5)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if mine:
		l.add_theme_color_override("font_color", Color("ffe9a8"))
	_log.add_child(l)
	_lines.append({"label": l, "at": 0.0 if old else Time.get_ticks_msec()})
	while _lines.size() > 30:
		var gone: Dictionary = _lines.pop_front()
		gone["label"].queue_free()
	if not old and not mine:
		Sfx.play("chat")
	_fade()


## Old lines fade out unless the box is open; only the last few show.
func _fade() -> void:
	var now := Time.get_ticks_msec()
	var keep := 12 if _open else LOG_LINES
	for i in range(_lines.size()):
		var recent := i >= _lines.size() - keep
		var l: Label = _lines[i]["label"]
		l.visible = recent and (_open or now - float(_lines[i]["at"]) <= LOG_MS)


func _process(_delta: float) -> void:
	if Engine.get_process_frames() % 30 == 0:
		_fade()


func _unhandled_input(event: InputEvent) -> void:
	if _open and event.is_action_pressed("menu"):
		close()
		get_viewport().set_input_as_handled()
