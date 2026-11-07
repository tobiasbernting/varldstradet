class_name RunHud
extends CanvasLayer
## The run's HUD (M5c, GAME.md sections 1 and 8; the route rail is GAME2.md section 2): the clock drawn against the 30 minutes the run
## is tuned to (a soft target: past it the clock keeps counting in a warmer colour, never a "time's up"), the route rail (a dot with
## a picture for each of the ten rows: the stops walked, the one now, the fixed ones to come), and the runor taken as small pictures. The party's hearts are the dungeon HUD's party list (the hired Hirdmannen is in it), and the server's
## banners ("Snart dags att gå hem", the zone's name, the pick result) arrive as banner changes the HUD already shows.

const COOL := Color("7fe0c8")
const WARN := Color("f2c33a")
const LATE := Color("ff9a4a")

var model: WorldModel
var _panel: PanelContainer
var _clock: Label
var _max: Label
var _bar: ProgressBar
var _fill: StyleBoxFlat
var _zone: Label
var _rail: HBoxContainer ## the route rail: one label for each row
var _rail_key := ""
var _runor: HBoxContainer
var _spirit_row: HBoxContainer
var _star: Label
var _spirit: Label
var _spirit_shown := -1
var _level_shown := -1
var _runor_key := ""
var _shown_sec := -1


func _ready() -> void:
	layer = 5
	_panel = PanelContainer.new()
	_panel.anchor_left = 1.0
	_panel.anchor_right = 1.0
	_panel.offset_left = -290
	_panel.offset_right = -16
	_panel.offset_top = 40
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.07, 0.06, 0.72)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	_panel.add_theme_stylebox_override("panel", sb)
	add_child(_panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	_panel.add_child(col)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	col.add_child(row)
	var icon := Label.new()
	icon.text = "⏱"
	icon.add_theme_font_size_override("font_size", 22)
	row.add_child(icon)
	_clock = Label.new()
	_clock.add_theme_font_size_override("font_size", 26)
	row.add_child(_clock)
	_max = Label.new()
	_max.add_theme_font_size_override("font_size", 16)
	_max.modulate = Color(1, 1, 1, 0.6)
	_max.size_flags_vertical = Control.SIZE_SHRINK_END
	row.add_child(_max)
	_bar = ProgressBar.new()
	_bar.custom_minimum_size = Vector2(0, 8)
	_bar.show_percentage = false
	_bar.max_value = 1.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.12)
	bg.set_corner_radius_all(4)
	_fill = StyleBoxFlat.new()
	_fill.bg_color = COOL
	_fill.set_corner_radius_all(4)
	_bar.add_theme_stylebox_override("background", bg)
	_bar.add_theme_stylebox_override("fill", _fill)
	col.add_child(_bar)
	_rail = HBoxContainer.new()
	_rail.add_theme_constant_override("separation", 2)
	col.add_child(_rail)
	for i in range(int(Data.run_const("rows", 10.0))):
		var l := Label.new()
		l.custom_minimum_size = Vector2(20, 0)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_rail.add_child(l)
	_zone = Label.new()
	_zone.add_theme_font_size_override("font_size", 16)
	_zone.modulate = Color(1, 1, 1, 0.85)
	col.add_child(_zone)
	# the Sagoandan: a star with how many are left (a free "everyone gets up" when the party falls), and Lätt as a word beside it
	_spirit_row = HBoxContainer.new()
	_spirit_row.add_theme_constant_override("separation", 6)
	col.add_child(_spirit_row)
	_star = Label.new()
	_star.text = "🌟"
	_star.add_theme_font_size_override("font_size", 24)
	_spirit_row.add_child(_star)
	_spirit = Label.new()
	_spirit.add_theme_font_size_override("font_size", 22)
	_spirit_row.add_child(_spirit)
	_runor = HBoxContainer.new()
	_runor.add_theme_constant_override("separation", 4)
	col.add_child(_runor)
	visible = false


func _process(_delta: float) -> void:
	var live: bool = model != null and model.in_run() and model.run is Dictionary
	visible = live
	if not live:
		_shown_sec = -1
		_rail_key = ""
		_runor_key = ""
		_spirit_shown = -1
		_level_shown = -1
		return
	var run: Dictionary = model.run
	var elapsed := model.run_elapsed()
	var max_ms := maxf(1.0, float(run.get("max", Data.run_const("maxMs", 1800000.0))))
	var warn_ms := Data.run_const("warnMs", 1500000.0)
	var sec := int(elapsed / 1000.0)
	if sec != _shown_sec:
		_shown_sec = sec
		_clock.text = format_time(elapsed)
		_max.text = "/ " + format_time(max_ms)
		var colour := COOL
		if elapsed >= max_ms:
			colour = LATE
		elif elapsed >= warn_ms:
			colour = WARN
		_clock.add_theme_color_override("font_color", colour)
		_fill.bg_color = colour
		_bar.value = minf(1.0, elapsed / max_ms)
	_update_rail(run)
	var spirit := int(run.get("spirit", 0))
	var level := int(run.get("level", 1))
	if spirit != _spirit_shown or level != _level_shown:
		if _spirit_shown >= 0 and spirit != _spirit_shown:
			_pulse_star()
		_spirit_shown = spirit
		_level_shown = level
		_spirit.text = "×%d" % spirit + ("   " + Strings.t("runLevelLatt") if level == 0 else "")
		_star.modulate = Color(1, 1, 1, 1.0 if spirit > 0 else 0.35)
		_spirit_row.tooltip_text = Strings.t("runLevelLattText") if level == 0 else Strings.t("runLevelVanligText")
	var taken: Array = run.get("runor", [])
	var key := str(taken.size()) + (str(taken[taken.size() - 1]) if not taken.is_empty() else "")
	if key != _runor_key:
		_runor_key = key
		for c in _runor.get_children():
			_runor.remove_child(c)
			c.queue_free()
		for id in run.get("runor", []):
			var l := Label.new()
			l.text = str(Data.runa(str(id)).get("icon", "✨"))
			l.add_theme_font_size_override("font_size", 24)
			l.tooltip_text = str(Data.runa(str(id)).get("name", id))
			_runor.add_child(l)


## The rail: for each row of the route a picture (the stop walked there; the fixed ones to come: the mid-boss, the last rest, the
## boss; a dot for the rest), the row we are on lit and larger, and "Steg 3 av 10 · Första vingen" under it.
func _update_rail(run: Dictionary) -> void:
	var row := int(run.get("row", 1))
	var path: Array = run.get("path", [])
	var key := "%d|%s|%s" % [row, str(path), str(run.get("phase", ""))]
	if key == _rail_key:
		return
	_rail_key = key
	var kinds_by_id := {}
	for n in run.get("route", []):
		if n is Dictionary:
			kinds_by_id[int(n.get("id", -1))] = n
	var fixed := {int(Data.run_const("miniRow", 5.0)): "mini", int(Data.run_const("restRow", 9.0)): "rest", int(Data.run_const("rows", 10.0)): "boss"}
	for i in range(_rail.get_child_count()):
		var l: Label = _rail.get_child(i)
		var r := i + 1
		var kind := ""
		if r <= path.size():
			var node: Variant = kinds_by_id.get(int(path[r - 1]))
			kind = str(node.get("kind", "")) if node is Dictionary else ""
		elif fixed.has(r):
			kind = fixed[r]
		l.text = Data.stop_icon(kind) if kind != "" else "·"
		l.add_theme_font_size_override("font_size", 22 if r == row else 16)
		l.modulate = Color("f2c33a") if r == row else (Color(1, 1, 1, 1) if r < row else Color(1, 1, 1, 0.5))
		l.tooltip_text = str(Data.stop_kind(kind).get("word", "")) if kind != "" else ""
	var label := Strings.t("runStepBoss") if row >= int(Data.run_const("rows", 10.0)) else Strings.t("runStep", {"n": row})
	var wings: Array = Data.run.get("wings", [])
	var wing := Data.wing_of(row)
	_zone.text = "%s · %s   [%s]" % [label, str(wings[wing]) if wing < wings.size() else "", "R"]
	_zone.tooltip_text = Strings.t("runMapTitle")


## What the rail shows now, as the pictures in a row (the run pair bot reads it to see that the route reached the HUD).
func rail_text() -> String:
	var parts: Array = []
	if _rail != null:
		for l in _rail.get_children():
			parts.append((l as Label).text)
	return " ".join(parts)


## The star swells for a moment when a Sagoandan is used (or one more comes).
func _pulse_star() -> void:
	_star.pivot_offset = _star.size / 2.0
	var t := create_tween()
	t.tween_property(_star, "scale", Vector2(1.7, 1.7), 0.18)
	t.tween_property(_star, "scale", Vector2.ONE, 0.35)


## What the star row says now (the run pair bot reads it to see that the level reached the HUD).
func spirit_text() -> String:
	return _spirit.text if _spirit != null else ""


## 12:34 from milliseconds.
static func format_time(ms: float) -> String:
	var s := int(ms / 1000.0)
	return "%d:%02d" % [s / 60, s % 60]
