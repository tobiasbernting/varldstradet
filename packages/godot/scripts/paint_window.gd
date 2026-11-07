class_name PaintWindow
extends GameWindow
## The paper-to-picture paint screen (PaintBoard in the browser's ui/paint.ts), opened by the server's `open` `paint` when I
## use a paper on nothing: a 16 × 16 canvas, the twelve colours, a brush, a fill and an eraser, "Rensa", "Avbryt" and "Klar",
## which sends `{t:'paint', pixels}` (the server turns a paper into a painted tavla for my bag; an empty drawing is refused
## there and here). Mouse and touchpad: press and drag on the canvas (a right press erases); keyboard and gamepad: the
## arrows or the d-pad move the cursor on the canvas, Enter, space or A paints (held, it draws a line), the focus moves from the canvas's
## edge to the colours and the tools, and the shoulder buttons (or the mouse wheel over the canvas) step through the colours.
## Redrawing the body when my record changes would throw the picture away, so `refresh` leaves it alone.

var canvas: PaintCanvas
var _swatches: Dictionary = {}
var _tools: Dictionary = {}
var _built := false


func _init() -> void:
	title_text = "🎨 " + Strings.t("paint")
	body_height = 400
	width = 600


func _purse_text(_me: Dictionary) -> String:
	return ""


func open_paint() -> void:
	_built = false
	open_window()


func refresh() -> void:
	if not _open:
		return
	if not _built:
		_built = true
		_remember_focus_noop()
		for c in _body.get_children():
			_body.remove_child(c)
			c.queue_free()
		_fill()
		_focus_canvas.call_deferred()


func _remember_focus_noop() -> void:
	pass


func _focus_canvas() -> void:
	if _open and canvas != null:
		canvas.grab_focus()


func _fit() -> void:
	super._fit()
	if canvas != null and is_inside_tree():
		var view := get_viewport().get_visible_rect().size
		canvas.set_cell_size(clampi(floori((view.y - 340.0) / PaintArt.size()), 10, 20))
		# the whole picture and the buttons under it stay in view (the body would scroll them away); UiFit shrinks the panel instead
		_scroll.custom_minimum_size.y = maxf(_scroll.custom_minimum_size.y, float(canvas.cell * PaintArt.size()) + 64.0)


func _fill() -> void:
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 18)
	_body.add_child(top)
	canvas = PaintCanvas.new()
	top.add_child(canvas)
	var side := VBoxContainer.new()
	side.add_theme_constant_override("separation", 10)
	top.add_child(side)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	side.add_child(grid)
	_swatches.clear()
	var ch := PaintArt.chars()
	for i in range(ch.length()):
		var b := Button.new()
		b.custom_minimum_size = Vector2(44, 40)
		b.toggle_mode = true
		b.set_meta("k", "c:" + ch[i])
		b.tooltip_text = str(i + 1)
		var col := Color.html(str(PaintArt.palette()[i]))
		for st in ["normal", "hover", "pressed", "focus", "hover_pressed", "disabled"]:
			var sb := StyleBoxFlat.new()
			sb.bg_color = col
			sb.set_corner_radius_all(6)
			sb.set_border_width_all(4 if st in ["pressed", "hover_pressed", "focus"] else 2)
			sb.border_color = Color("e8b830") if st in ["pressed", "hover_pressed"] else (Color.WHITE if st == "focus" else Color(0, 0, 0, 0.5))
			b.add_theme_stylebox_override(st, sb)
		b.pressed.connect(_pick_colour.bind(ch[i]))
		grid.add_child(b)
		_swatches[ch[i]] = b
	_tools.clear()
	for t in [["brush", "🖌️ " + Strings.t("paintBrush")], ["fill", "🪣 " + Strings.t("paintFill")], ["eraser", "🧽 " + Strings.t("paintEraser")]]:
		var tb := make_button(str(t[1]), _pick_tool.bind(str(t[0])), "tool:" + str(t[0]))
		tb.toggle_mode = true
		side.add_child(tb)
		_tools[str(t[0])] = tb
	var hint := Label.new()
	hint.text = "←↑↓→  ·  ⏎ / A"
	hint.add_theme_font_size_override("font_size", 13)
	hint.modulate = Color(1, 1, 1, 0.5)
	side.add_child(hint)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	_body.add_child(actions)
	actions.add_child(make_button(Strings.t("paintClear"), _clear, "clear"))
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(sp)
	actions.add_child(make_button("✔ " + Strings.t("paintOk"), _done, "ok"))
	# the focus walks canvas -> colours -> tools -> the buttons below
	canvas.focus_neighbor_right = _swatches["0"].get_path()
	canvas.focus_neighbor_bottom = actions.get_child(0).get_path()
	_pick_colour(canvas.colour if canvas.colour != "" else "0")
	_pick_tool("brush")
	_fit()


func _on_open() -> void:
	var close_b: Node = _foot.get_node_or_null("Close")
	if close_b is Button:
		close_b.text = Strings.t("paintCancel")
	if canvas != null:
		canvas.clear_cells()
		canvas.cursor = Vector2i(0, 0)


func _pick_colour(ch: String) -> void:
	canvas.colour = ch
	if canvas.mode == "eraser":
		canvas.mode = "brush"
	_sync_tools()


func _pick_tool(m: String) -> void:
	canvas.mode = m
	_sync_tools()


func _sync_tools() -> void:
	for ch in _swatches.keys():
		(_swatches[ch] as Button).set_pressed_no_signal(ch == canvas.colour and canvas.mode != "eraser")
	for m in _tools.keys():
		(_tools[m] as Button).set_pressed_no_signal(m == canvas.mode)


func _clear() -> void:
	canvas.clear_cells()
	Sfx.play("target")


## "Klar": the drawing goes to the server, which keeps one paper's worth and gives me the tavla.
func _done() -> void:
	var px := canvas.pixels()
	if not PaintArt.valid(px):
		model.toast.emit(Strings.t("paintEmpty"))
		return
	Net.send({"t": "paint", "pixels": px})
	close()


func _unhandled_input(event: InputEvent) -> void:
	if _open and canvas != null:
		if event.is_action_pressed("slot_next"):
			_step_colour(1)
			get_viewport().set_input_as_handled()
			return
		if event.is_action_pressed("slot_prev"):
			_step_colour(-1)
			get_viewport().set_input_as_handled()
			return
	super._unhandled_input(event)


func _step_colour(d: int) -> void:
	var ch := PaintArt.chars()
	_pick_colour(ch[posmod(ch.find(canvas.colour) + d, ch.length())])
	Sfx.play("target")
