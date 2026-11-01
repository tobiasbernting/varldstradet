class_name PickupFeed
extends VBoxContainer
## "+2 Morot" lines with the item's picture, stacked at the right edge, for what came into my bag (a harvest, a drop
## walked over, a catch, a tree's wood). The lines are made once and reused; each fades out after a few seconds.

const LINES := 5
const LIFE := 3.2

var _rows: Array = [] ## {root, icon, label, born}
var _next := 0


func _init() -> void:
	anchor_left = 1.0
	anchor_right = 1.0
	anchor_top = 1.0
	anchor_bottom = 1.0
	offset_left = -260
	offset_right = -16
	offset_top = -260
	offset_bottom = -110
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	alignment = BoxContainer.ALIGNMENT_END
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_constant_override("separation", 4)
	for i in range(LINES):
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_END
		row.add_theme_constant_override("separation", 6)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.visible = false
		var label := Label.new()
		label.add_theme_font_size_override("font_size", 18)
		label.add_theme_color_override("font_outline_color", Color("2b2419"))
		label.add_theme_constant_override("outline_size", 8)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(label)
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(28, 28)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)
		add_child(row)
		_rows.append({"root": row, "icon": icon, "label": label, "born": -100.0})


func add(item: String, n: int) -> void:
	var r: Dictionary = _rows[_next]
	_next = (_next + 1) % LINES
	r["born"] = Time.get_ticks_msec() / 1000.0
	r["label"].text = Strings.t("pickedUp", {"n": n, "item": Data.item_name(item)})
	r["icon"].texture = Data.item_icon(item)
	r["root"].modulate.a = 1.0
	r["root"].visible = true
	move_child(r["root"], get_child_count() - 1)


func clear() -> void:
	for r in _rows:
		r["root"].visible = false


func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec() / 1000.0
	for r in _rows:
		if not r["root"].visible:
			continue
		var age: float = now - float(r["born"])
		if age > LIFE:
			r["root"].visible = false
		elif age > LIFE - 0.8:
			r["root"].modulate.a = (LIFE - age) / 0.8
