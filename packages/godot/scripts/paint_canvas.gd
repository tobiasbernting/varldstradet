class_name PaintCanvas
extends Control
## The drawing area of the paint screen: 16 × 16 cells you paint with the mouse or a touchpad (press and drag; a right
## press erases), or with the keyboard and a pad (the arrows or the d-pad / stick move a cursor, Enter, space or A paints,
## held while moving it draws a line; at an edge the focus moves on to the palette). The cells are a list of the
## palette's characters ("." is paper); the window owns the colour and the tool and reads `cells` when it is done.

signal changed
## The mouse wheel over the canvas: +1 / -1 steps through the colours (the window owns the colour).
signal colour_step(d: int)

var cells: Array = []
var cell := 20
var colour := "0"
var mode := "brush" ## brush, fill or eraser
var cursor := Vector2i(0, 0)
var _down := false
var _last := Vector2i(-1, -1)


func _init() -> void:
	focus_mode = Control.FOCUS_ALL
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN # (the row would stretch it taller than wide: the cells are square)
	mouse_filter = Control.MOUSE_FILTER_STOP
	clear_cells()
	focus_entered.connect(queue_redraw)
	focus_exited.connect(queue_redraw)


func clear_cells() -> void:
	cells = []
	for i in range(PaintArt.size() * PaintArt.size()):
		cells.append(".")
	queue_redraw()


func pixels() -> String:
	return "".join(cells)


func set_cell_size(n: int) -> void:
	cell = n
	custom_minimum_size = Vector2(n, n) * PaintArt.size()
	queue_redraw()


func _draw() -> void:
	var n := PaintArt.size()
	draw_rect(Rect2(Vector2.ZERO, Vector2(n, n) * cell), PaintArt.PAPER)
	for i in range(cells.size()):
		var c: Variant = PaintArt.colour_of(cells[i])
		if c is Color:
			draw_rect(Rect2(Vector2(i % n, i / n) * cell, Vector2(cell, cell)), c)
	# a faint grid so the cells can be told apart
	for k in range(n + 1):
		draw_line(Vector2(k * cell, 0), Vector2(k * cell, n * cell), Color(0, 0, 0, 0.12))
		draw_line(Vector2(0, k * cell), Vector2(n * cell, k * cell), Color(0, 0, 0, 0.12))
	draw_rect(Rect2(Vector2.ZERO, Vector2(n, n) * cell), PaintArt.FRAME_DARK, false, 2.0)
	if has_focus():
		draw_rect(Rect2(Vector2(cursor) * cell, Vector2(cell, cell)), Color(1, 1, 1, 0.95), false, 3.0)
		draw_rect(Rect2(Vector2(cursor) * cell + Vector2(2, 2), Vector2(cell - 4, cell - 4)), Color(0, 0, 0, 0.9), false, 1.0)


func _cell_at(p: Vector2) -> Vector2i:
	var n := PaintArt.size()
	var c := Vector2i(floori(p.x / cell), floori(p.y / cell))
	return c if c.x >= 0 and c.y >= 0 and c.x < n and c.y < n else Vector2i(-1, -1)


## Paints (or fills, or erases) one cell with the current colour and tool; a stroke joins to the cell before it.
func paint_at(c: Vector2i, erase := false) -> void:
	if c.x < 0:
		return
	var n := PaintArt.size()
	if mode == "fill" and not erase:
		PaintArt.flood(cells, c.x, c.y, colour)
	else:
		var to := "." if (erase or mode == "eraser") else colour
		if _last.x >= 0 and _last != c:
			var d := c - _last
			var steps := maxi(absi(d.x), absi(d.y))
			for s in range(1, steps):
				var m := Vector2i(roundi(_last.x + float(d.x) * s / steps), roundi(_last.y + float(d.y) * s / steps))
				cells[m.y * n + m.x] = to
		cells[c.y * n + c.x] = to
	_last = c
	queue_redraw()
	changed.emit()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.pressed and (b.button_index == MOUSE_BUTTON_WHEEL_DOWN or b.button_index == MOUSE_BUTTON_WHEEL_UP):
			colour_step.emit(1 if b.button_index == MOUSE_BUTTON_WHEEL_DOWN else -1)
			accept_event()
		elif b.button_index == MOUSE_BUTTON_LEFT or b.button_index == MOUSE_BUTTON_RIGHT:
			_down = b.pressed
			_last = Vector2i(-1, -1)
			if b.pressed:
				cursor = _cell_at(b.position) if _cell_at(b.position).x >= 0 else cursor
				grab_focus()
				paint_at(_cell_at(b.position), b.button_index == MOUSE_BUTTON_RIGHT)
			accept_event()
	elif event is InputEventMouseMotion and _down:
		var mm := event as InputEventMouseMotion
		var c := _cell_at(mm.position)
		if c.x >= 0:
			cursor = c
			paint_at(c, (mm.button_mask & MOUSE_BUTTON_MASK_RIGHT) != 0)
		accept_event()
	elif event.is_action_pressed("ui_accept"):
		_last = Vector2i(-1, -1)
		paint_at(cursor)
		accept_event()
	elif event.is_action_released("ui_accept"):
		_last = Vector2i(-1, -1)
		accept_event()
	else:
		for pair in [["ui_left", Vector2i(-1, 0), SIDE_LEFT], ["ui_right", Vector2i(1, 0), SIDE_RIGHT], ["ui_up", Vector2i(0, -1), SIDE_TOP], ["ui_down", Vector2i(0, 1), SIDE_BOTTOM]]:
			if event.is_action_pressed(pair[0], true):
				_move(pair[1], pair[2])
				accept_event()
				return


## The cursor steps one cell; off the edge the focus goes to the neighbour on that side (the palette and the tools).
func _move(d: Vector2i, side: int) -> void:
	var n := PaintArt.size()
	var to := cursor + d
	if to.x < 0 or to.y < 0 or to.x >= n or to.y >= n:
		var next := find_valid_focus_neighbor(side)
		if next != null:
			next.grab_focus()
		return
	cursor = to
	if Input.is_action_pressed("ui_accept"):
		paint_at(cursor)
	queue_redraw()
