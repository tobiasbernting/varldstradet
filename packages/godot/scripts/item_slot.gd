class_name ItemSlot
extends Button
## One square of the bag, a chest or the hotbar: the item's picture, its count, a number for the hotbar's keys, a
## thin bar for the watering can's charges. Shown with `show_stack` (only redraws what changed, so a refresh of the
## whole bag every time the server sends my record costs nothing but comparisons). Look: the browser's `.slot`.

const SIZE := 52
const BACK := Color(0.16, 0.13, 0.1, 0.92)
const BACK_HOVER := Color(0.24, 0.2, 0.15, 0.95)
const LINE := Color(0.42, 0.34, 0.24)
const SELECTED := Color("f2c33a")
const PICKED := Color("5ab4f0")
const CAN_BLUE := Color("4aa8e8")

static var _styles: Dictionary = {}

var icon_rect: TextureRect
var count_label: Label
var key_label: Label
var charge_back: ColorRect
var charge_fill: ColorRect
## Where this slot lives: -1 for the player's own bag, else a chest's object id; and its index.
var chest := -1
var slot := 0
var _item := ""
var _count := -1
var _charges := -1
var _selected := false
var _picked := false
var _dim := false


func _init() -> void:
	custom_minimum_size = Vector2(SIZE, SIZE)
	flat = false
	clip_text = true
	focus_mode = Control.FOCUS_ALL
	action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	_style_for(false, false)
	icon_rect = TextureRect.new()
	icon_rect.anchor_right = 1.0
	icon_rect.anchor_bottom = 1.0
	icon_rect.offset_left = 5
	icon_rect.offset_top = 5
	icon_rect.offset_right = -5
	icon_rect.offset_bottom = -5
	icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(icon_rect)
	count_label = Label.new()
	count_label.anchor_left = 1.0
	count_label.anchor_right = 1.0
	count_label.anchor_top = 1.0
	count_label.anchor_bottom = 1.0
	count_label.offset_left = -34
	count_label.offset_top = -22
	count_label.offset_right = -3
	count_label.offset_bottom = -1
	count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	count_label.add_theme_font_size_override("font_size", 14)
	count_label.add_theme_color_override("font_outline_color", Color("2b2419"))
	count_label.add_theme_constant_override("outline_size", 5)
	count_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(count_label)
	key_label = Label.new()
	key_label.offset_left = 4
	key_label.offset_top = 1
	key_label.add_theme_font_size_override("font_size", 11)
	key_label.modulate = Color(1, 1, 1, 0.65)
	key_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(key_label)
	charge_back = ColorRect.new()
	charge_back.color = Color(0, 0, 0, 0.6)
	charge_back.anchor_top = 1.0
	charge_back.anchor_bottom = 1.0
	charge_back.anchor_right = 1.0
	charge_back.offset_left = 5
	charge_back.offset_right = -5
	charge_back.offset_top = -9
	charge_back.offset_bottom = -5
	charge_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	charge_back.visible = false
	add_child(charge_back)
	charge_fill = ColorRect.new()
	charge_fill.color = CAN_BLUE
	charge_fill.anchor_bottom = 1.0
	charge_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	charge_back.add_child(charge_fill)
	visibility_changed.connect(func() -> void: _count = -2)


## A StyleBoxFlat for a state, made once and shared by every slot.
static func _box(border: Color, fill: Color, width: int) -> StyleBoxFlat:
	var key := "%s%s%d" % [border.to_html(), fill.to_html(), width]
	if _styles.has(key):
		return _styles[key]
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.border_color = border
	sb.set_border_width_all(width)
	sb.set_corner_radius_all(6)
	_styles[key] = sb
	return sb


func _style_for(selected: bool, picked: bool) -> void:
	var border := PICKED if picked else (SELECTED if selected else LINE)
	var w := 3 if (picked or selected) else 2
	add_theme_stylebox_override("normal", _box(border, BACK, w))
	add_theme_stylebox_override("hover", _box(border, BACK_HOVER, w))
	add_theme_stylebox_override("pressed", _box(border, BACK_HOVER, w))
	add_theme_stylebox_override("disabled", _box(border, BACK, w))
	add_theme_stylebox_override("focus", _box(Color.WHITE, Color(1, 1, 1, 0.08), 3))


## Shows a stack ({item, count, charges?}) or an empty square (null). Only changed parts are touched.
func show_stack(stack: Variant, is_selected := false, is_picked := false, is_dim := false) -> void:
	if is_selected != _selected or is_picked != _picked:
		_selected = is_selected
		_picked = is_picked
		_style_for(_selected, _picked)
	if is_dim != _dim:
		_dim = is_dim
		modulate = Color(1, 1, 1, 0.3) if _dim else Color.WHITE
	var id := ""
	var count := 0
	var charges := -1
	if stack is Dictionary:
		id = str(stack.get("item", ""))
		count = int(stack.get("count", 1))
		if stack.has("charges"):
			charges = int(stack.get("charges", 0))
	if id == _item and count == _count and charges == _charges:
		return
	if id != _item:
		icon_rect.texture = Data.item_icon(id) if id != "" else null
		tooltip_text = Data.item_name(id) if id != "" else ""
	_item = id
	_count = count
	_charges = charges
	count_label.text = str(count) if count > 1 else ""
	var is_can := charges >= 0
	charge_back.visible = is_can
	if is_can:
		charge_fill.anchor_right = clampf(float(charges) / Data.constant("WATERING_CAN_CHARGES", 20.0), 0.0, 1.0)


func item_id() -> String:
	return _item


func set_key(text: String) -> void:
	key_label.text = text
