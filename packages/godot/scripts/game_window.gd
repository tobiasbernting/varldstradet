class_name GameWindow
extends CanvasLayer
## The base of the M4c windows (the workbench, the stove, the shop, the sell box, the wardrobe, the gear, the villagers,
## the Völvan, the class stone and the bus): a dark panel over a dimmed screen with a title, an optional purse, a row of
## tabs, a scrolling body and a close button. A window is a list of rows built from my player record when it opens and
## whenever the server sends that record again (`refresh` rebuilds the body; it never runs per frame). Mouse,
## keyboard and a pad work alike because every row's control is a Button: the d-pad or the stick moves the focus,
## A presses, B or Escape closes. The server owns everything: a window only sends the intent and redraws.

signal closed

const PANEL_BG := Color(0.12, 0.1, 0.09, 0.97)
const GOLD := Color("e8b830")
const GOOD := Color("8fe08a")
const BAD := Color("e98a7a")

var model: WorldModel
var hero: Hero
var title_text := ""
var width := 640
var body_height := 360
var _root: Control
var _title: Label
var _purse: Label
var _tabs: HFlowContainer
var _toolbar: HBoxContainer
var _scroll: ScrollContainer
var _body: VBoxContainer
var _foot: HBoxContainer
var _open := false
var _opened_at := 0
var _focus_key := ""


func _ready() -> void:
	layer = 8
	visible = false
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	var dim := ColorRect.new()
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.color = Color(0, 0, 0, 0.5)
	_root.add_child(dim)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(centre)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL_BG
	sb.set_corner_radius_all(12)
	sb.set_border_width_all(3)
	sb.border_color = Color("8a6a3a")
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", sb)
	centre.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	stack.custom_minimum_size = Vector2(width, 0)
	panel.add_child(stack)
	var head := HBoxContainer.new()
	stack.add_child(head)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 26)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(_title)
	_purse = Label.new()
	_purse.add_theme_font_size_override("font_size", 20)
	_purse.add_theme_color_override("font_color", GOLD)
	head.add_child(_purse)
	_tabs = HFlowContainer.new()
	_tabs.add_theme_constant_override("h_separation", 6)
	_tabs.add_theme_constant_override("v_separation", 4)
	stack.add_child(_tabs)
	_toolbar = HBoxContainer.new()
	_toolbar.add_theme_constant_override("separation", 8)
	stack.add_child(_toolbar)
	_scroll = ScrollContainer.new()
	_scroll.custom_minimum_size = Vector2(width, body_height)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(_scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 6)
	_scroll.add_child(_body)
	_foot = HBoxContainer.new()
	_foot.add_theme_constant_override("separation", 8)
	stack.add_child(_foot)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_foot.add_child(spacer)
	var done := make_button(Strings.t("ok"), close)
	done.name = "Close"
	_foot.add_child(done)
	_build()


## Subclasses add their fixed parts (tabs, a search box) here.
func _build() -> void:
	pass


## Subclasses fill the body here (`_body` is empty): rows from my record.
func _fill() -> void:
	pass


func is_open() -> bool:
	return _open


func open_window() -> void:
	_title.text = title_text
	_open = true
	_opened_at = Time.get_ticks_msec()
	_focus_key = ""
	visible = true
	_on_open()
	refresh()
	_focus_first()
	Sfx.play("target")


func _on_open() -> void:
	pass


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false
	_on_close()
	closed.emit()


func _on_close() -> void:
	pass


## Rebuilds the body from my record (when open).
func refresh() -> void:
	if not _open:
		return
	var me := model.my_player()
	_purse.text = _purse_text(me)
	_remember_focus()
	for c in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	_fill()
	_restore_focus.call_deferred()


func _purse_text(me: Dictionary) -> String:
	return "%d %s" % [int(me.get("coins", 0)), Strings.t("coins")]


func set_title(text: String) -> void:
	title_text = text
	_title.text = text


func _remember_focus() -> void:
	var f := get_viewport().gui_get_focus_owner() if is_inside_tree() else null
	if f != null and f.has_meta("k") and _body.is_ancestor_of(f):
		_focus_key = str(f.get_meta("k"))


func _restore_focus() -> void:
	if not _open:
		return
	if _focus_key != "":
		for b in _find_buttons(_body):
			if b.has_meta("k") and str(b.get_meta("k")) == _focus_key and not b.disabled:
				b.grab_focus()
				return
	_focus_first()


func _focus_first() -> void:
	for b in _find_buttons(_tabs):
		if b.button_pressed:
			b.grab_focus()
			return
	for b in _find_buttons(_body):
		if not b.disabled:
			b.grab_focus()
			return
	var close_b: Node = _foot.get_node_or_null("Close")
	if close_b is Button:
		close_b.grab_focus()


func _find_buttons(root: Node) -> Array:
	var out: Array = []
	for c in root.get_children():
		if c is Button:
			out.append(c)
		out.append_array(_find_buttons(c))
	return out


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	if Time.get_ticks_msec() - _opened_at > 250 and (event.is_action_pressed("menu") or event.is_action_pressed("ui_cancel")):
		close()
		get_viewport().set_input_as_handled()


# ---------------------------------------------------------------------------
# Pieces the windows are made of


static func make_button(text: String, call: Callable, key := "") -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 38)
	BagWindow.style_button(b)
	b.pressed.connect(call)
	b.set_meta("k", key if key != "" else text)
	return b


## A tab: a toggle in the tab row.
func add_tab(text: String, on: bool, call: Callable) -> Button:
	var b := make_button(text, call, "tab:" + text)
	b.toggle_mode = true
	b.button_pressed = on
	_tabs.add_child(b)
	return b


func clear_tabs() -> void:
	for c in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()


func add_label(text: String, size := 16, colour := Color(1, 1, 1, 0.9)) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(width - 40, 0)
	_body.add_child(l)
	return l


static func picture(icon_name: Texture2D, size := 40) -> TextureRect:
	var r := TextureRect.new()
	r.texture = icon_name
	r.custom_minimum_size = Vector2(size, size)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## A row of the list: a picture, a name with a line under it (bbcode), and buttons on the right.
func add_row(pic: Texture2D, title: String, sub: String, buttons: Array, dim := false, parent: Control = null) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.16, 0.13, 0.1, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 5
	sb.content_margin_bottom = 5
	var holder := PanelContainer.new()
	holder.add_theme_stylebox_override("panel", sb)
	holder.add_child(row)
	if dim:
		holder.modulate = Color(1, 1, 1, 0.6)
	row.add_child(picture(pic))
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 0)
	row.add_child(col)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 18)
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(t)
	if sub != "":
		var r := RichTextLabel.new()
		r.bbcode_enabled = true
		r.fit_content = true
		r.scroll_active = false
		r.add_theme_font_size_override("normal_font_size", 14)
		r.text = sub
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(r)
	for b in buttons:
		row.add_child(b)
	(parent if parent != null else _body).add_child(holder)
	return row


static func coloured(text: String, ok: bool) -> String:
	return "[color=#%s]%s[/color]" % ["8fe08a" if ok else "e98a7a", text]


## "Wood 3/2 · Stone 1/1" for a recipe's ingredients against my bag, each coloured by whether I have enough.
static func needs_line(model_: WorldModel, ingredients: Array) -> String:
	var parts: Array = []
	for i in ingredients:
		var have := model_.count_item(str(i.get("item", "")))
		var need := int(i.get("count", 1))
		parts.append(coloured("%s %d/%d" % [Data.item_name(str(i.get("item", ""))), have, need], have >= need))
	return " · ".join(parts)


## A villager's face: the first standing frame of their sheet (the sprite the farm draws), for a window.
static func npc_portrait(id: String) -> Texture2D:
	var s := Data.sheet(Data.npc_sheet(id))
	if s.is_empty():
		return null
	var path := "res://assets/sprites/" + str(s.get("file", ""))
	if not ResourceLoader.exists(path):
		return null
	var at := AtlasTexture.new()
	at.atlas = load(path)
	var fw := int(s.get("frame_w", 16))
	var fh := int(s.get("frame_h", 32))
	at.region = Rect2(maxi(0, (s.get("frames", []) as Array).find("down0")) * fw, 0, fw, fh)
	return at


## A speech bubble beside a face: picture left, text right (bbcode off, wrapped).
func add_bubble(face: Texture2D, text: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_body.add_child(row)
	var pic := picture(face, 96)
	pic.custom_minimum_size = Vector2(64, 128)
	row.add_child(pic)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.2, 0.17, 0.13, 0.95)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", sb)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(panel)
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 18)
	l.custom_minimum_size = Vector2(width - 180, 0)
	panel.add_child(l)
