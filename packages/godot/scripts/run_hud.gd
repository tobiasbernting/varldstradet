class_name RunHud
extends CanvasLayer
## The run's HUD (M5c, GAME.md sections 1 and 8): the clock drawn against the 30 minutes the run is tuned to (a soft target:
## past it the clock keeps counting in a warmer colour, never a "time's up"), the zone n of 3 and the boss as dots, and the runor
## taken as small pictures. The party's hearts are the dungeon HUD's party list (the hired Hirdmannen is in it), and the server's
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
var _runor: HBoxContainer
var _runor_key := ""
var _shown_sec := -1


func _ready() -> void:
	layer = 5
	_panel = PanelContainer.new()
	_panel.anchor_left = 1.0
	_panel.anchor_right = 1.0
	_panel.offset_left = -250
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
	_zone = Label.new()
	_zone.add_theme_font_size_override("font_size", 18)
	col.add_child(_zone)
	_runor = HBoxContainer.new()
	_runor.add_theme_constant_override("separation", 4)
	col.add_child(_runor)
	visible = false


func _process(_delta: float) -> void:
	var live: bool = model != null and model.in_run() and model.run is Dictionary
	visible = live
	if not live:
		_shown_sec = -1
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
	var zone := int(run.get("zone", 0))
	var dots: Array = []
	for i in range(3):
		dots.append("◉" if i == zone else ("●" if i < zone else "○"))
	dots.append("👑" if zone == 3 else "♔")
	var label := Strings.t("runBossZone") if zone >= 3 else Strings.t("runZone", {"n": zone + 1})
	_zone.text = "%s   %s" % [" ".join(dots), label]
	var key := ",".join(PackedStringArray(run.get("runor", [])))
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


## 12:34 from milliseconds.
static func format_time(ms: float) -> String:
	var s := int(ms / 1000.0)
	return "%d:%02d" % [s / 60, s % 60]
