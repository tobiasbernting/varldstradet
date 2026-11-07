class_name RunEnd
extends CanvasLayer
## The end of a run (`run` change, ev "ended", sent to me): a summary for a few seconds - the outcome in a few words
## (game.json run.texts.ended), the time, the sagafrön I earned, the zones cleared and the runor I had. The server has already
## put everyone back at the farm in front of the arch (GAME.md section 7); this only tells how it went, kindly.

const SHOW_SECONDS := 8.0

var model: WorldModel
var _root: Control
var _icon: Label
var _title: Label
var _rows: VBoxContainer
var _runor: HBoxContainer
var _left := 0.0


func _ready() -> void:
	layer = 9
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(centre)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.12, 0.1, 0.09, 0.96)
	sb.set_corner_radius_all(16)
	sb.set_border_width_all(3)
	sb.border_color = Color("e8b830")
	sb.content_margin_left = 40
	sb.content_margin_right = 40
	sb.content_margin_top = 24
	sb.content_margin_bottom = 24
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	centre.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.custom_minimum_size = Vector2(420, 0)
	panel.add_child(col)
	_icon = Label.new()
	_icon.add_theme_font_size_override("font_size", 80)
	_icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_icon)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 36)
	_title.add_theme_color_override("font_color", Color("e8b830"))
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_title)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 4)
	col.add_child(_rows)
	_runor = HBoxContainer.new()
	_runor.alignment = BoxContainer.ALIGNMENT_CENTER
	_runor.add_theme_constant_override("separation", 6)
	col.add_child(_runor)
	visible = false
	model.run_ended.connect(_show)


func is_open() -> bool:
	return visible


func _show(summary: Dictionary) -> void:
	var outcome := str(summary.get("outcome", "leave"))
	_icon.text = {"win": "🏆", "wipe": "💤", "leave": "🏠"}.get(outcome, "🏠")
	_title.text = str(Data.run.get("texts", {}).get("ended", {}).get(outcome, ""))
	for c in _rows.get_children():
		_rows.remove_child(c)
		c.queue_free()
	_row("⏱  " + Strings.t("runEndedTime"), RunHud.format_time(float(summary.get("ms", 0))))
	_row("🌱  " + Strings.t("runEndedSeeds"), "+%d" % int(summary.get("seeds", 0)))
	_row("🗺  " + Strings.t("runEndedZones"), "%d / 3" % mini(3, int(summary.get("zones", 0))))
	_row("🌟  " + Strings.t("runEndedSpirit"), "%d" % int(summary.get("spirit_used", 0)))
	for c in _runor.get_children():
		_runor.remove_child(c)
		c.queue_free()
	for id in summary.get("runor", []):
		var l := Label.new()
		l.text = str(Data.runa(str(id)).get("icon", "✨"))
		l.add_theme_font_size_override("font_size", 32)
		_runor.add_child(l)
	_left = SHOW_SECONDS
	visible = true
	Sfx.play("fanfare" if outcome == "win" else "calm")


func _row(label: String, value: String) -> void:
	var row := HBoxContainer.new()
	var a := Label.new()
	a.text = label
	a.add_theme_font_size_override("font_size", 24)
	a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(a)
	var b := Label.new()
	b.text = value
	b.add_theme_font_size_override("font_size", 28)
	b.add_theme_color_override("font_color", Color("8fe08a"))
	row.add_child(b)
	_rows.add_child(row)


func _process(delta: float) -> void:
	if not visible:
		return
	_left -= delta
	if _left <= 0.0:
		visible = false
