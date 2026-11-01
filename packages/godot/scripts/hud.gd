class_name HudLayer
extends CanvasLayer
## The HUD basics of M3a: hearts, the dungeon's name, the party (names and hearts of everyone in the area), a small
## connection indicator, the server's banners and toasts, and the notice shown on a map the client does not draw
## yet. Built in code; every text comes from assets/sv.json.

signal menu_asked

var area_label: Label
var hearts_label: Label
var hearts_text: Label
var party_title: Label
var party_box: VBoxContainer
var conn_dot: ColorRect
var conn_label: Label
var banner_label: Label
var banner_sub: Label
var toast_label: Label
var not_drawn: PanelContainer
var not_drawn_label: Label
var _banner_t := 0.0
var _toast_t := 0.0


func _ready() -> void:
	var left := VBoxContainer.new()
	left.position = Vector2(16, 12)
	left.add_theme_constant_override("separation", 6)
	add_child(left)
	area_label = _label(26)
	left.add_child(area_label)
	var hearts_row := HBoxContainer.new()
	hearts_row.add_theme_constant_override("separation", 10)
	left.add_child(hearts_row)
	hearts_label = _label(26)
	hearts_label.add_theme_color_override("font_color", Color("ff5a6a"))
	hearts_row.add_child(hearts_label)
	hearts_text = _label(18)
	hearts_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hearts_row.add_child(hearts_text)
	party_title = _label(16)
	party_title.text = Strings.t("partyTitle")
	party_title.modulate = Color(1, 1, 1, 0.8)
	left.add_child(party_title)
	party_box = VBoxContainer.new()
	party_box.add_theme_constant_override("separation", 2)
	left.add_child(party_box)

	var right := HBoxContainer.new()
	right.anchor_left = 1.0
	right.anchor_right = 1.0
	right.offset_left = -260
	right.offset_right = -16
	right.offset_top = 12
	right.alignment = BoxContainer.ALIGNMENT_END
	right.add_theme_constant_override("separation", 8)
	add_child(right)
	conn_label = _label(16)
	conn_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	right.add_child(conn_label)
	conn_dot = ColorRect.new()
	conn_dot.custom_minimum_size = Vector2(14, 14)
	conn_dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	conn_dot.color = Color("e0b040")
	right.add_child(conn_dot)

	var centre := VBoxContainer.new()
	centre.anchor_left = 0.5
	centre.anchor_right = 0.5
	centre.anchor_top = 0.22
	centre.offset_left = -400
	centre.offset_right = 400
	centre.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(centre)
	banner_label = _label(44)
	banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_label.add_theme_color_override("font_color", Color("ffe9a8"))
	centre.add_child(banner_label)
	banner_sub = _label(20)
	banner_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	centre.add_child(banner_sub)

	toast_label = _label(20)
	toast_label.anchor_left = 0.5
	toast_label.anchor_right = 0.5
	toast_label.anchor_top = 1.0
	toast_label.anchor_bottom = 1.0
	toast_label.offset_left = -400
	toast_label.offset_right = 400
	toast_label.offset_top = -80
	toast_label.offset_bottom = -40
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(toast_label)

	not_drawn = PanelContainer.new()
	not_drawn.anchor_left = 0.5
	not_drawn.anchor_right = 0.5
	not_drawn.anchor_top = 0.5
	not_drawn.anchor_bottom = 0.5
	not_drawn.offset_left = -300
	not_drawn.offset_right = 300
	not_drawn.offset_top = -70
	not_drawn.offset_bottom = 70
	not_drawn.visible = false
	add_child(not_drawn)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	not_drawn.add_child(box)
	not_drawn_label = _label(18)
	not_drawn_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	not_drawn_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(not_drawn_label)
	var button := Button.new()
	button.text = Strings.t("menuTitle")
	button.pressed.connect(func() -> void: menu_asked.emit())
	box.add_child(button)
	reset()


func _label(size: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_outline_color", Color("2b2419"))
	l.add_theme_constant_override("outline_size", 6)
	return l


func reset() -> void:
	area_label.text = ""
	hearts_label.text = ""
	hearts_text.text = ""
	banner_label.text = ""
	banner_sub.text = ""
	toast_label.text = ""
	not_drawn.visible = false
	set_party([])


func _process(delta: float) -> void:
	if _banner_t > 0.0:
		_banner_t -= delta
		if _banner_t <= 0.0:
			banner_label.text = ""
			banner_sub.text = ""
	if _toast_t > 0.0:
		_toast_t -= delta
		if _toast_t <= 0.0:
			toast_label.text = ""


## The map's name in the corner; on a map the client does not draw, the notice in the middle instead.
func set_area(area_name: String, drawn: bool) -> void:
	area_label.text = area_name if drawn else ""
	not_drawn.visible = not drawn
	not_drawn_label.text = "" if drawn else Strings.t("areaNotDrawn", {"name": area_name})


static func hearts_string(hp: float, max_hp: float) -> String:
	if max_hp <= 0.0:
		return ""
	var full := roundi(clampf(hp / max_hp, 0.0, 1.0) * 10.0)
	if hp > 0.0 and full == 0:
		full = 1
	return "♥".repeat(full) + "♡".repeat(10 - full)


func set_hearts(hp: float, max_hp: float) -> void:
	hearts_label.text = hearts_string(hp, max_hp)
	hearts_text.text = "%d/%d" % [ceili(hp), ceili(max_hp)] if max_hp > 0.0 else ""


## rows: [{name, hp, max}] for everyone in the area but me.
func set_party(rows: Array) -> void:
	for child in party_box.get_children():
		child.queue_free()
	party_title.visible = not rows.is_empty()
	for r in rows:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var name_label := _label(16)
		name_label.text = str(r.get("name", ""))
		name_label.custom_minimum_size = Vector2(120, 0)
		row.add_child(name_label)
		var h := _label(16)
		h.add_theme_color_override("font_color", Color("ff5a6a"))
		h.text = hearts_string(float(r.get("hp", 0)), float(r.get("max", 0)))
		row.add_child(h)
		party_box.add_child(row)


func set_connection(status: String) -> void:
	match status:
		"open":
			conn_dot.color = Color("5fd38d")
			conn_label.text = Strings.t("connOpen")
		"connecting":
			conn_dot.color = Color("e0b040")
			conn_label.text = Strings.t("connecting")
		"demo":
			conn_dot.color = Color("8ab4ff")
			conn_label.text = "Demo"
		_:
			conn_dot.color = Color("ff5a6a")
			conn_label.text = Strings.t("connClosed")


func show_banner(text: String, sub: String) -> void:
	banner_label.text = text
	banner_sub.text = sub
	_banner_t = 4.0


func show_toast(text: String) -> void:
	toast_label.text = text
	_toast_t = 3.5
