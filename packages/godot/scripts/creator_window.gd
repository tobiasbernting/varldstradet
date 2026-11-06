class_name CreatorWindow
extends CanvasLayer
## "Vem blir du?": the character creator, opened from the login screen's "Ny karaktär". A name, then skin, hair
## colour, hair style and shirt, each with big arrow buttons and a picture in the middle, and a live preview drawn by
## the look composer (the same sprite layers the farm draws the character with). "Skapa" sends POST /api/players
## through Api with the device token; the rules for the name are the server's: trimmed, 1 to 16 characters.

signal created(player_id: String)
signal cancelled

const NAME_MAX := 16
const HAIR_STYLES := ["short", "long", "curly", "ponytail", "bald"]
## The shirts every new character starts with (STARTER_WARDROBE in shared/sim.ts), with their sv.ts names.
const SHIRTS := {"shirt_red": "creatorShirtRed", "shirt_blue": "creatorShirtBlue", "shirt_green": "creatorShirtGreen", "shirt_yellow": "creatorShirtYellow"}
const PREVIEW_SCALE := 8
const THUMB_SCALE := 3

var skins: Array = [] ## #rrggbb, from the atlas (the tones the sprites are drawn in)
var hair_colors: Array = []
var shirts: Array = SHIRTS.keys()
var skin_i := 1
var hair_i := 3
var style_i := 0
var shirt_i := 1

var _api: Api
var _composer: LookComposer
var _root: Control
var _input: LineEdit
var _preview: TextureRect
var _rows: Dictionary = {} ## id -> {icon: TextureRect, swatch: ColorRect, label: Label}
var _error: Label
var _create: Button
var _cancel: Button
var _open := false
var _busy := false
var _opened_at := 0


func _ready() -> void:
	layer = 9
	visible = false
	_api = Api.new()
	add_child(_api)
	_composer = LookComposer.new()
	var farm: Dictionary = Data.atlas.get("farm", {})
	skins = farm.get("skins", ["#f1c9a5"])
	hair_colors = farm.get("hair_colors", ["#5a3a1e"])
	skin_i = mini(1, skins.size() - 1)
	hair_i = mini(3, hair_colors.size() - 1)
	_build()


func _build() -> void:
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	var dim := ColorRect.new()
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.color = Color(0, 0, 0, 0.6)
	_root.add_child(dim)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	_root.add_child(centre)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.12, 0.1, 0.09, 0.97)
	sb.set_corner_radius_all(12)
	sb.set_border_width_all(3)
	sb.border_color = Color("8a6a3a")
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 18
	sb.content_margin_bottom = 18
	panel.add_theme_stylebox_override("panel", sb)
	centre.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 10)
	panel.add_child(stack)
	var title := Label.new()
	title.text = Strings.t("creatorTitle")
	title.add_theme_font_size_override("font_size", 26)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(title)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 24)
	stack.add_child(body)
	# the preview, big and sharp (nearest filter: the sprites are pixel art)
	var frame := PanelContainer.new()
	var fsb := StyleBoxFlat.new()
	fsb.bg_color = Color(0.36, 0.5, 0.3)
	fsb.set_corner_radius_all(8)
	frame.add_theme_stylebox_override("panel", fsb)
	frame.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	body.add_child(frame)
	_preview = TextureRect.new()
	_preview.custom_minimum_size = Vector2(16 * PREVIEW_SCALE, 32 * PREVIEW_SCALE)
	_preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_preview.stretch_mode = TextureRect.STRETCH_SCALE
	_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.add_child(_preview)
	var options := VBoxContainer.new()
	options.add_theme_constant_override("separation", 10)
	body.add_child(options)
	_input = LineEdit.new()
	_input.max_length = NAME_MAX
	_input.placeholder_text = Strings.t("creatorNameHint")
	_input.custom_minimum_size = Vector2(0, 48)
	_input.add_theme_font_size_override("font_size", 22)
	_input.text_submitted.connect(func(_t: String) -> void: _submit())
	options.add_child(_input)
	_row(options, "skin", "creatorSkin", func(d: int) -> void: skin_i = _step(skin_i, d, skins.size()))
	_row(options, "hair", "creatorHair", func(d: int) -> void: hair_i = _step(hair_i, d, hair_colors.size()))
	_row(options, "style", "creatorHairStyle", func(d: int) -> void: style_i = _step(style_i, d, HAIR_STYLES.size()))
	_row(options, "shirt", "creatorShirt", func(d: int) -> void: shirt_i = _step(shirt_i, d, shirts.size()))
	_error = Label.new()
	_error.add_theme_color_override("font_color", Color(1.0, 0.55, 0.5))
	_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error.custom_minimum_size = Vector2(0, 26)
	_error.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(_error)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	stack.add_child(buttons)
	_create = Button.new()
	_create.text = Strings.t("creatorCreate")
	_cancel = Button.new()
	_cancel.text = Strings.t("cancel")
	for b in [_create, _cancel]:
		b.custom_minimum_size = Vector2(0, 56)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 24)
		BagWindow.style_button(b)
		buttons.add_child(b)
	_create.pressed.connect(_submit)
	_cancel.pressed.connect(close)


## One option row: the label, an arrow, the picture of the choice, an arrow.
func _row(parent: Control, id: String, label_key: String, step: Callable) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	parent.add_child(row)
	var label := Label.new()
	label.text = Strings.t(label_key)
	label.custom_minimum_size = Vector2(110, 0)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 20)
	row.add_child(label)
	row.add_child(_arrow("◀", Strings.t("creatorPrev"), func() -> void:
		step.call(-1)
		_refresh()))
	var mid := PanelContainer.new()
	var msb := StyleBoxFlat.new()
	msb.bg_color = Color(0.2, 0.17, 0.13)
	msb.set_corner_radius_all(6)
	mid.add_theme_stylebox_override("panel", msb)
	mid.custom_minimum_size = Vector2(190, 64)
	row.add_child(mid)
	var inner := HBoxContainer.new()
	inner.alignment = BoxContainer.ALIGNMENT_CENTER
	inner.add_theme_constant_override("separation", 8)
	mid.add_child(inner)
	var swatch := ColorRect.new()
	swatch.custom_minimum_size = Vector2(56, 44)
	swatch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	swatch.visible = false
	inner.add_child(swatch)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(16 * THUMB_SCALE, 16 * THUMB_SCALE)
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.stretch_mode = TextureRect.STRETCH_SCALE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.visible = false
	inner.add_child(icon)
	var text := Label.new()
	text.add_theme_font_size_override("font_size", 20)
	text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	text.visible = false
	inner.add_child(text)
	row.add_child(_arrow("▶", Strings.t("creatorNext"), func() -> void:
		step.call(1)
		_refresh()))
	_rows[id] = {"swatch": swatch, "icon": icon, "label": text}


func _arrow(glyph: String, tip: String, pressed: Callable) -> Button:
	var b := Button.new()
	b.text = glyph
	b.tooltip_text = tip
	b.custom_minimum_size = Vector2(64, 64)
	b.add_theme_font_size_override("font_size", 28)
	BagWindow.style_button(b)
	b.pressed.connect(pressed)
	return b


static func _step(i: int, d: int, n: int) -> int:
	return posmod(i + d, maxi(n, 1))


## What is chosen right now, as the body of POST /api/players.
func choice() -> Dictionary:
	return {
		"name": _input.text.strip_edges() if _input != null else "",
		"appearance": {"skin": str(skins[skin_i]), "hair": str(hair_colors[hair_i]), "hairStyle": HAIR_STYLES[style_i]},
		"shirt": str(shirts[shirt_i]),
	}


func _look(skin: int, hair: int, style: String, shirt: String) -> Dictionary:
	return {
		"appearance": {"skin": str(skins[skin]), "hair": str(hair_colors[hair]), "hairStyle": style},
		"outfit": {"shirt": shirt, "pants": "pants_blue", "shoes": "shoes_boots"},
	}


func _frame(look: Dictionary, region: Rect2) -> AtlasTexture:
	var t := AtlasTexture.new()
	t.atlas = _composer.texture_for(look)
	t.region = region # the first frame: standing, facing the viewer
	return t


func _refresh() -> void:
	var has_art := _composer.available()
	_preview.visible = has_art
	if has_art:
		_preview.texture = _frame(_look(skin_i, hair_i, HAIR_STYLES[style_i], shirts[shirt_i]), Rect2(0, 0, 16, 32))
	var skin_row: Dictionary = _rows["skin"]
	skin_row["swatch"].visible = true
	skin_row["swatch"].color = Color.html(str(skins[skin_i]))
	var hair_row: Dictionary = _rows["hair"]
	hair_row["swatch"].visible = true
	hair_row["swatch"].color = Color.html(str(hair_colors[hair_i]))
	var style: String = HAIR_STYLES[style_i]
	var style_row: Dictionary = _rows["style"]
	style_row["label"].visible = true
	style_row["label"].text = Strings.t("creatorHair" + style.capitalize())
	var shirt: String = shirts[shirt_i]
	var shirt_row: Dictionary = _rows["shirt"]
	shirt_row["label"].visible = true
	shirt_row["label"].text = Strings.t(SHIRTS.get(shirt, "creatorShirtBlue"))
	if has_art:
		style_row["icon"].visible = true
		style_row["icon"].texture = _frame(_look(skin_i, hair_i, style, shirt), Rect2(0, 3, 16, 16)) # the head
		shirt_row["icon"].visible = true
		shirt_row["icon"].texture = _frame(_look(skin_i, hair_i, style, shirt), Rect2(0, 16, 16, 16)) # the chest
	else:
		shirt_row["swatch"].visible = true
		shirt_row["swatch"].color = Color.html({"shirt_red": "#d9453b", "shirt_blue": "#3b6fd9", "shirt_green": "#3ba35b", "shirt_yellow": "#e8c23a"}.get(shirt, "#3b6fd9"))


func is_open() -> bool:
	return _open


func open() -> void:
	skin_i = mini(1, skins.size() - 1)
	hair_i = mini(3, hair_colors.size() - 1)
	style_i = 0
	shirt_i = shirts.find("shirt_blue")
	_input.text = ""
	_error.text = ""
	_busy = false
	_set_busy(false)
	_open = true
	_opened_at = Time.get_ticks_msec()
	visible = true
	_refresh()
	_input.grab_focus()


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false
	cancelled.emit()


func _set_busy(busy: bool) -> void:
	_busy = busy
	_create.disabled = busy
	_cancel.disabled = busy


## "Skapa": checks the name the way the server does, then asks the server. Returns the answer (also for the headless check).
func _submit() -> Dictionary:
	if _busy:
		return {}
	var body := choice()
	var player_name: String = str(body["name"]).substr(0, NAME_MAX)
	if player_name == "":
		_error.text = Strings.t("creatorErrName")
		_input.grab_focus()
		return {"ok": false, "status": 400, "body": {"error": "name"}}
	_error.text = ""
	_set_busy(true)
	var r: Dictionary = await _api.create_player(player_name, body["appearance"], body["shirt"])
	if not _open:
		return r
	_set_busy(false)
	if r.ok and r.body is Dictionary and str(r.body.get("id", "")) != "":
		_open = false
		visible = false
		created.emit(str(r.body["id"]))
	else:
		_error.text = error_text(r)
	return r


## The Swedish line for a failed create (what the server answered, from sv.ts).
static func error_text(r: Dictionary) -> String:
	if int(r.get("status", 0)) == 0:
		return Strings.t("serverUnreachable", {"url": Settings.server_url})
	var err := str(r.body.get("error", "")) if r.get("body") is Dictionary else ""
	match [int(r.status), err]:
		[400, _]:
			return Strings.t("creatorErrName")
		[403, "create"]:
			return Strings.t("creatorErrCreate")
		[403, _]:
			return Strings.t("creatorErrAccess")
		[409, _]:
			return Strings.t("creatorErrFull")
	return Strings.t("creatorErrOther")


func _unhandled_input(event: InputEvent) -> void:
	if _open and not _busy and Time.get_ticks_msec() - _opened_at > 250 and (event.is_action_pressed("ui_cancel") or event.is_action_pressed("menu")):
		close()
		get_viewport().set_input_as_handled()
