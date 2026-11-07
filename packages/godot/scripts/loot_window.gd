class_name LootWindow
extends CanvasLayer
## What a dungeon chest gave you (the `loot` change), as the browser's loot window shows it: each item with its
## picture, its name (× count), its rarity in the rarity's colour and its line of text, then the coins and stars;
## a plainer box for the day's second chest from a boss (`replay`). The server's once-per-player rule is already
## applied by the time the message arrives (a unique piece found before comes as potions instead), so the window
## only shows what came. Another chest that opens while this is up waits its turn. Closed with the use key, the
## menu key or the button.

signal closed

var _queue: Array = []
var _root: Control
var _panel: PanelContainer
var _style: StyleBoxFlat
var _title: Label
var _note: Label
var _rows: VBoxContainer
var _ok: Button
var _open := false
var _opened_at := 0.0


func _ready() -> void:
	layer = 9
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
	_root.add_child(centre)
	_panel = PanelContainer.new()
	_style = StyleBoxFlat.new()
	_style.bg_color = Color(0.12, 0.1, 0.09, 0.96)
	_style.set_corner_radius_all(12)
	_style.set_border_width_all(3)
	_style.border_color = Color.WHITE
	_style.content_margin_left = 24
	_style.content_margin_right = 24
	_style.content_margin_top = 18
	_style.content_margin_bottom = 18
	_panel.add_theme_stylebox_override("panel", _style)
	centre.add_child(_panel)
	UiFit.attach(_panel)
	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(460, 0)
	stack.add_theme_constant_override("separation", 10)
	_panel.add_child(stack)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 26)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(_title)
	_note = Label.new()
	_note.add_theme_font_size_override("font_size", 14)
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note.modulate = Color(1, 1, 1, 0.8)
	stack.add_child(_note)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 8)
	stack.add_child(_rows)
	_ok = Button.new()
	_ok.text = Strings.t("sagaLootOk")
	_ok.custom_minimum_size = Vector2(0, 44)
	_ok.pressed.connect(close)
	stack.add_child(_ok)


func is_open() -> bool:
	return _open


## A `loot` change for me.
func show_loot(c: Dictionary) -> void:
	_queue.append(c)
	if not _open:
		_next()


func _next() -> void:
	if _queue.is_empty():
		return
	var c: Dictionary = _queue.pop_front()
	for child in _rows.get_children():
		child.queue_free()
	var best := 0
	var order := ["common", "uncommon", "rare", "epic", "legendary"]
	for it in c.get("items", []):
		var id := str(it.get("item", ""))
		var count := int(it.get("count", 1))
		var def := Data.item(id)
		var rar := str(def.get("rarity", "common"))
		best = maxi(best, order.find(rar))
		_rows.add_child(_row(Data.item_icon(id), Data.item_name(id) + (" × %d" % count if count > 1 else ""), str(Data.rarity_names.get(rar, rar)), str(def.get("text", "")), Data.rarity_color(rar)))
	var coins := int(c.get("coins", 0))
	var stars := int(c.get("stars", 0))
	var money := Strings.t("sagaLootCoins", {"n": coins})
	if stars > 0:
		money += "   +%d ⭐" % stars
	_rows.add_child(_row(Data.icon("ui_coin"), money, "", "", Color("e8b830")))
	var replay := bool(c.get("replay", false))
	var rar_best: String = order[clampi(best, 0, order.size() - 1)]
	_style.border_color = Data.rarity_color(rar_best)
	_title.text = "%s %s" % ["📦" if replay else "🎁", Strings.t("sagaReplayChest" if replay else "sagaLootTitle", {"from": str(c.get("from", ""))})]
	_note.text = Strings.t("sagaReplaySub") if replay else ""
	_note.visible = replay
	Sfx.play("loot_big" if best >= 3 and not replay else "loot")
	_open = true
	visible = true
	_opened_at = Time.get_ticks_msec()
	_ok.grab_focus()


func _row(icon: Texture2D, name_text: String, rarity: String, text: String, colour: Color) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var pic := TextureRect.new()
	pic.texture = icon
	pic.custom_minimum_size = Vector2(48, 48)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(pic)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var nm := Label.new()
	nm.text = name_text
	nm.add_theme_font_size_override("font_size", 18)
	nm.add_theme_color_override("font_color", colour)
	col.add_child(nm)
	if rarity != "":
		var r := Label.new()
		r.text = rarity
		r.add_theme_font_size_override("font_size", 13)
		r.add_theme_color_override("font_color", colour)
		col.add_child(r)
	if text != "":
		var t := Label.new()
		t.text = text
		t.add_theme_font_size_override("font_size", 13)
		t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		t.modulate = Color(1, 1, 1, 0.8)
		col.add_child(t)
	return row


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false
	closed.emit()
	if not _queue.is_empty():
		get_tree().create_timer(0.25).timeout.connect(_next)


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	# the use key that opened the chest must not close the window in the same moment
	if (event.is_action_pressed("act") or event.is_action_pressed("menu")) and Time.get_ticks_msec() - _opened_at > 300:
		close()
		get_viewport().set_input_as_handled()
