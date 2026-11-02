class_name WardrobeWindow
extends GameWindow
## The garderob (`equip`, renderWardrobe in the browser): hats, shirts, pants and shoes you own, the one you wear lit,
## "no hat" in the hats, and a picture of yourself in what you have on now (the same composed sheet the farm draws, one
## frame, ×5). Season clothes bought in the shop and the saga's hero clothes (`saga items with a slot`) are in the same
## lists. Hair and skin are chosen when the character is made; the browser has no way to change them later either.

const SLOTS := ["hat", "shirt", "pants", "shoes"]

var looks: LookComposer
var _slot := "hat"
var _preview: TextureRect
var _caption: Label


func _init() -> void:
	title_text = "👕 " + Strings.t("wardrobeTitle")
	body_height = 340


func _build() -> void:
	pass


func _on_open() -> void:
	clear_tabs()
	var names := {"hat": Strings.t("tabHats"), "shirt": Strings.t("tabShirts"), "pants": Strings.t("tabPants"), "shoes": Strings.t("tabShoes")}
	for s in SLOTS:
		add_tab(str(names[s]), s == _slot, _pick.bind(s))


func _pick(s: String) -> void:
	_slot = s
	_on_open()
	refresh()


func _purse_text(_me: Dictionary) -> String:
	return ""


func _fill() -> void:
	var me := model.my_player()
	var outfit: Dictionary = me.get("outfit", {}) if me.get("outfit") is Dictionary else {}
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 20)
	_body.add_child(top)
	# me in what I wear now
	var left := VBoxContainer.new()
	top.add_child(left)
	_preview = TextureRect.new()
	_preview.custom_minimum_size = Vector2(16 * 6, 32 * 6)
	_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_preview.texture = _portrait(me)
	left.add_child(_preview)
	var who := Label.new()
	who.text = str(me.get("name", ""))
	who.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	who.add_theme_font_size_override("font_size", 18)
	left.add_child(who)
	# what I own in this slot
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	top.add_child(right)
	_caption = Label.new()
	_caption.add_theme_font_size_override("font_size", 16)
	_caption.custom_minimum_size = Vector2(300, 24)
	_caption.text = ""
	right.add_child(_caption)
	var grid := HFlowContainer.new()
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	grid.custom_minimum_size = Vector2(340, 0)
	right.add_child(grid)
	var worn := str(outfit.get(_slot, "")) if outfit.get(_slot) != null else ""
	var count := 0
	if _slot == "hat":
		grid.add_child(_cell("", Strings.t("wardrobeNone"), worn == "", "🚫"))
	for id in me.get("wardrobe", []):
		if str(Data.item(str(id)).get("slot", "")) != _slot:
			continue
		count += 1
		grid.add_child(_cell(str(id), Data.item_name(str(id)), worn == str(id), ""))
	if count == 0 and _slot != "hat":
		var l := Label.new()
		l.text = Strings.t("wardrobeEmpty")
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(320, 0)
		right.add_child(l)
	var hair := Label.new()
	hair.text = Strings.t("hairLine")
	hair.add_theme_font_size_override("font_size", 13)
	hair.modulate = Color(1, 1, 1, 0.6)
	hair.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hair.custom_minimum_size = Vector2(width - 40, 0)
	_body.add_child(hair)


func _cell(id: String, label: String, on: bool, emoji: String) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(64, 64)
	b.toggle_mode = true
	b.button_pressed = on
	b.tooltip_text = label
	b.set_meta("k", "w:" + id)
	BagWindow.style_button(b)
	if emoji != "":
		b.text = emoji
	else:
		b.icon = Data.item_icon(id)
		b.expand_icon = true
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.add_theme_constant_override("icon_max_width", 48)
	b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	b.pressed.connect(func() -> void: Net.send({"t": "equip", "slot": _slot, "item": id if id != "" else null}))
	b.focus_entered.connect(func() -> void: _caption.text = label)
	b.mouse_entered.connect(func() -> void: _caption.text = label)
	return b


## One frame (facing down, standing) of my composed sheet.
func _portrait(me: Dictionary) -> Texture2D:
	if looks == null or not looks.available() or me.is_empty():
		return null
	var sheet := looks.texture_for(me)
	var frames := looks.frames()
	var i := maxi(0, frames.find("down0"))
	var at := AtlasTexture.new()
	at.atlas = sheet
	at.region = Rect2(i * 16, 0, 16, 32)
	return at
