class_name RouteView
extends CanvasLayer
## The route in the client (GAME2.md section 2): the väg-runor in the exit room with the picture of the stop each one leads to and the
## names of the players standing on it (and a ring that fills while I stand on one), the compass over the Stigfinnare's head (the
## player who breaks a tie, rotating each row), and the full map of the route (the `route_map` key, R, or the pad's misc button):
## ten columns for the ten rows, up to three lanes, the stops walked in gold, the one we are on ringed, the ways on lit. The server
## owns the vote (runsim.ts tickRoute); this only shows it. The rail along the HUD is RunHud's.

const GOLD := Color("f2c33a")
const GREEN := Color("8fe08a")
const DIM := Color(1, 1, 1, 0.35)

var model: WorldModel
var world: Node ## the World: the hero's place and the camera

var _marks: Dictionary = {} ## node id -> {root, icon, names, ring}
var _compass: Label
var _wait: Label
var _map: Control
var _map_canvas: RouteMapCanvas
var _map_title: Label
var _map_hint: Label
var _map_key := ""
var _dwell := 0.0 ## how long I have stood on the same rune (s)
var _dwell_on := -1


func _ready() -> void:
	layer = 6
	_compass = Label.new()
	_compass.text = "🧭"
	_compass.add_theme_font_size_override("font_size", 26)
	_compass.visible = false
	_compass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_compass)
	_wait = Label.new()
	_wait.add_theme_font_size_override("font_size", 24)
	_wait.add_theme_color_override("font_color", GOLD)
	_wait.add_theme_color_override("font_outline_color", Color("2b2419"))
	_wait.add_theme_constant_override("outline_size", 8)
	_wait.anchor_left = 0.0
	_wait.anchor_right = 1.0
	_wait.offset_top = 150
	_wait.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_wait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wait.visible = false
	add_child(_wait)
	_build_map()


func _build_map() -> void:
	_map = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.1, 0.09, 0.08, 0.93)
	sb.set_corner_radius_all(16)
	sb.set_border_width_all(3)
	sb.border_color = GOLD
	sb.content_margin_left = 28
	sb.content_margin_right = 28
	sb.content_margin_top = 18
	sb.content_margin_bottom = 18
	(_map as PanelContainer).add_theme_stylebox_override("panel", sb)
	_map.anchor_left = 0.5
	_map.anchor_right = 0.5
	_map.anchor_top = 0.5
	_map.anchor_bottom = 0.5
	_map.offset_left = -480
	_map.offset_right = 480
	_map.offset_top = -250
	_map.offset_bottom = 250
	_map.mouse_filter = Control.MOUSE_FILTER_STOP
	_map.visible = false
	add_child(_map)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	_map.add_child(col)
	_map_title = Label.new()
	_map_title.add_theme_font_size_override("font_size", 30)
	_map_title.add_theme_color_override("font_color", GOLD)
	_map_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_map_title)
	_map_canvas = RouteMapCanvas.new()
	_map_canvas.custom_minimum_size = Vector2(900, 360)
	_map_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(_map_canvas)
	_map_hint = Label.new()
	_map_hint.add_theme_font_size_override("font_size", 16)
	_map_hint.modulate = Color(1, 1, 1, 0.6)
	_map_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_map_hint)


func is_map_open() -> bool:
	return _map != null and _map.visible


## Opens or closes the map (the key; the bot calls it too).
func toggle_map() -> void:
	set_map_open(not _map.visible)


func set_map_open(open: bool) -> void:
	if open and not _live():
		return
	_map.visible = open
	if open:
		_map_title.text = "🗺  " + Strings.t("runMapTitle")
		_map_hint.text = Strings.t("runMapHint", {"key": "R"})
		_map_key = ""
		_refresh_map()
		Sfx.play("target")


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("route_map"):
		toggle_map()
		get_viewport().set_input_as_handled()
	elif _map.visible and (event.is_action_pressed("menu") or event.is_action_pressed("act")):
		set_map_open(false)
		get_viewport().set_input_as_handled()


func _live() -> bool:
	return model != null and model.in_run() and model.run is Dictionary


func _process(delta: float) -> void:
	if not _live():
		_hide_all()
		return
	var run: Dictionary = model.run
	_update_marks(run, delta)
	_update_compass(run)
	if _map.visible:
		_refresh_map()


func _hide_all() -> void:
	_compass.visible = false
	_wait.visible = false
	_map.visible = false
	for id in _marks.keys():
		(_marks[id]["root"] as Control).visible = false
	_dwell = 0.0
	_dwell_on = -1


## The runes: a picture, the names of those on it, and my ring.
func _update_marks(run: Dictionary, delta: float) -> void:
	var choices: Array = run.get("choices", []) if str(run.get("phase", "")) == "route" else []
	var cam := get_viewport().get_camera_3d()
	var seen := {}
	var mine := -1
	for c in choices:
		if not (c is Dictionary):
			continue
		var id := int(c.get("node", -1))
		seen[id] = true
		var mark: Dictionary = _marks.get(id, {})
		if mark.is_empty():
			mark = _make_mark(str(c.get("kind", "flock")))
			_marks[id] = mark
		var on: Array = c.get("on", [])
		var names: Array = []
		for pid in on:
			var p: Variant = model.players().get(str(pid))
			names.append(str(p.get("name", "?")) if p is Dictionary else "?")
			if str(pid) == model.me:
				mine = id
		(mark["names"] as Label).text = "\n".join(names)
		var root: Control = mark["root"]
		root.visible = cam != null
		if cam != null:
			var at := Vector3(float(c.get("x", 0)) + 0.5, 1.7, float(c.get("y", 0)) + 0.5)
			root.visible = not cam.is_position_behind(at)
			root.position = cam.unproject_position(at) - Vector2(root.size.x / 2.0, root.size.y)
	for id in _marks.keys():
		if not seen.has(id):
			(_marks[id]["root"] as Control).visible = false
	# the ring fills while I stand on the same rune
	if mine >= 0 and mine == _dwell_on:
		_dwell += delta
	else:
		_dwell = 0.0
		_dwell_on = mine
	var dwell_s := Data.run_const("routeDwellMs", 1000.0) / 1000.0
	for id in _marks.keys():
		var ring: ProgressBar = _marks[id]["ring"]
		ring.visible = id == mine
		ring.value = minf(1.0, _dwell / dwell_s)
	# a line while the others are awaited: how long until the clock decides
	var left := float(run.get("routeLeft", -1))
	_wait.visible = not choices.is_empty()
	if _wait.visible:
		_wait.text = Strings.t("runRouteWait", {"n": int(ceil(left / 1000.0))}) if left >= 0.0 else Strings.t("runRoutePick")


func _make_mark(kind: String) -> Dictionary:
	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.alignment = BoxContainer.ALIGNMENT_END
	root.add_theme_constant_override("separation", 0)
	var names := Label.new()
	names.add_theme_font_size_override("font_size", 16)
	names.add_theme_color_override("font_outline_color", Color("2b2419"))
	names.add_theme_constant_override("outline_size", 6)
	names.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	names.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(names)
	var icon := Label.new()
	icon.text = Data.stop_icon(kind)
	icon.add_theme_font_size_override("font_size", 40)
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon.tooltip_text = str(Data.stop_kind(kind).get("word", ""))
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(icon)
	var word := Label.new()
	word.text = str(Data.stop_kind(kind).get("word", ""))
	word.add_theme_font_size_override("font_size", 16)
	word.add_theme_color_override("font_outline_color", Color("2b2419"))
	word.add_theme_constant_override("outline_size", 6)
	word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	word.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(word)
	var ring := ProgressBar.new()
	ring.custom_minimum_size = Vector2(70, 8)
	ring.show_percentage = false
	ring.max_value = 1.0
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ring)
	add_child(root)
	root.custom_minimum_size = Vector2(110, 0)
	return {"root": root, "icon": icon, "names": names, "ring": ring}


## The compass over the head of the Stigfinnare (shown when more than one human is in the run).
func _update_compass(run: Dictionary) -> void:
	var finder := str(run.get("finder", ""))
	var humans := 0
	for m in run.get("party", []):
		if m is Dictionary and not bool(m.get("bot", false)):
			humans += 1
	var cam := get_viewport().get_camera_3d()
	var at := Vector2.ZERO
	var have := false
	if finder != "" and humans >= 2 and cam != null and world != null:
		if finder == model.me and world.hero != null:
			at = Vector2(world.hero.px, world.hero.py)
			have = true
		else:
			var snap: Variant = model.player_snaps.get(finder)
			if snap is Dictionary:
				at = Vector2(float(snap.get("x", 0)), float(snap.get("y", 0)))
				have = true
	_compass.visible = have
	if have:
		var tile := Data.tile()
		var pos := Vector3(at.x / tile, 2.6, at.y / tile)
		_compass.visible = not cam.is_position_behind(pos)
		_compass.position = cam.unproject_position(pos) - Vector2(_compass.size.x / 2.0, _compass.size.y)
		_compass.tooltip_text = Strings.t("runFinder")


## The map: redrawn when the run's path, row or phase changes.
func _refresh_map() -> void:
	var run: Dictionary = model.run
	var key := "%s|%s|%s" % [str(run.get("path", [])), str(run.get("phase", "")), str(run.get("choices", []))]
	if key == _map_key:
		return
	_map_key = key
	var ways: Array = []
	if str(run.get("phase", "")) == "route":
		for c in run.get("choices", []):
			ways.append(int((c as Dictionary).get("node", -1)))
	_map_canvas.show_route(run.get("route", []), run.get("path", []), int(run.get("node", 0)), ways)


## What the map shows now, as text (the run pair bot checks it): the number of stops drawn and the ones lit as ways on.
func map_summary() -> Dictionary:
	return {"nodes": _map_canvas.node_count(), "ways": _map_canvas.way_count(), "open": is_map_open()}


## The map itself: lines and rings drawn by hand, one label for each stop's picture.
class RouteMapCanvas:
	extends Control

	var _route: Array = []
	var _path: Array = []
	var _here := 0
	var _ways: Array = []
	var _labels: Array[Label] = []
	var _pos: Dictionary = {} ## node id -> Vector2

	func show_route(route: Array, path: Array, here: int, ways: Array) -> void:
		_route = route
		_path = path
		_here = here
		_ways = ways
		for l in _labels:
			remove_child(l)
			l.queue_free()
		_labels = []
		_layout()
		for n in _route:
			if not (n is Dictionary):
				continue
			var l := Label.new()
			l.text = Data.stop_icon(str(n.get("kind", "")))
			l.add_theme_font_size_override("font_size", 26)
			l.tooltip_text = str(Data.stop_kind(str(n.get("kind", ""))).get("word", ""))
			l.mouse_filter = Control.MOUSE_FILTER_PASS
			add_child(l)
			var at: Vector2 = _pos.get(int(n.get("id", -1)), Vector2.ZERO)
			l.position = at - Vector2(17, 20)
			_labels.append(l)
		queue_redraw()

	func node_count() -> int:
		return _labels.size()

	func way_count() -> int:
		return _ways.size()

	func _layout() -> void:
		_pos = {}
		var rows := int(Data.run_const("rows", 10.0))
		var w := maxf(size.x, 900.0)
		var h := maxf(size.y, 360.0)
		for n in _route:
			if not (n is Dictionary):
				continue
			var row := int(n.get("row", 1))
			var lanes := maxi(1, int(n.get("lanes", 1)))
			var lane := int(n.get("lane", 0))
			var x := 50.0 + (w - 100.0) * float(row - 1) / float(rows - 1)
			var y := 54.0 + (h - 90.0) * (float(lane) + 0.5) / float(lanes)
			_pos[int(n.get("id", -1))] = Vector2(x, y)

	func _draw() -> void:
		var wings: Array = Data.run.get("wings", [])
		var rows := int(Data.run_const("rows", 10.0))
		var w := maxf(size.x, 900.0)
		# the three wings as captions over their columns
		for wing in range(3):
			var lo := 1 if wing == 0 else (5 if wing == 1 else 9)
			var hi := 4 if wing == 0 else (8 if wing == 1 else 10)
			var x0 := 50.0 + (w - 100.0) * float(lo - 1) / float(rows - 1) - 24.0
			var x1 := 50.0 + (w - 100.0) * float(hi - 1) / float(rows - 1) + 24.0
			draw_rect(Rect2(x0, 6, x1 - x0, 26), Color(1, 1, 1, 0.07), true)
			var f := ThemeDB.fallback_font
			if wing < wings.size():
				draw_string(f, Vector2(x0 + 8, 25), str(wings[wing]), HORIZONTAL_ALIGNMENT_LEFT, x1 - x0 - 12, 16, Color(1, 1, 1, 0.7))
		# the lines: walked in gold, the rest faint
		for n in _route:
			if not (n is Dictionary):
				continue
			var a: Vector2 = _pos.get(int(n.get("id", -1)), Vector2.ZERO)
			for m in n.get("next", []):
				var b: Vector2 = _pos.get(int(m), Vector2.ZERO)
				var walked := _path.has(int(n.get("id", -1))) and _path.has(int(m))
				var way := int(n.get("id", -1)) == _here and _ways.has(int(m))
				draw_line(a, b, Color("f2c33a") if walked else (Color("8fe08a") if way else Color(1, 1, 1, 0.18)), 4.0 if walked or way else 2.0, true)
		# the rings
		for n in _route:
			if not (n is Dictionary):
				continue
			var id := int(n.get("id", -1))
			var at: Vector2 = _pos.get(id, Vector2.ZERO)
			var fill := Color(0.16, 0.14, 0.12, 0.95)
			var edge := Color(1, 1, 1, 0.3)
			var thick := 2.0
			if _path.has(id):
				edge = Color("f2c33a")
				thick = 3.0
			if _ways.has(id):
				edge = Color("8fe08a")
				thick = 4.0
			if id == _here:
				edge = Color("ffffff")
				thick = 5.0
			draw_circle(at, 22.0, fill)
			draw_arc(at, 22.0, 0.0, TAU, 32, edge, thick, true)
