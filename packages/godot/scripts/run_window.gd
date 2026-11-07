class_name RunWindow
extends GameWindow
## The färdport's window (`open` with ui "run"; GAME.md, "Choosing färdkost at the arch"): the player's class as a picture,
## the färdkost slots (the dishes from the bag as pictures, as many slots as the server says in its `fardkost` change), one
## big "Starta färden" button, and "Följ med" when a run already lives. Nothing here needs reading (GAME.md section 8): the
## class picture, the dish pictures and the one button. The server owns everything: this sends `fardkost`, then `run start`
## (or `run join`), and the server answers with the toast for a missing class or a full party.

var start_button: Button
var join_button: Button
var latt_button: Button
var vanlig_button: Button
## The difficulty for the next run, kept between openings of the window: 0 Lätt (the kids' level), 1 Vanlig (GAME2.md 5.3).
static var level := 1


func _init() -> void:
	title_text = "⛩️ " + Strings.object_name("fardport")
	width = 620
	body_height = 480


func _purse_text(_me: Dictionary) -> String:
	return "🌱 %d" % int(model.tree.get("seeds", 0))


func _on_open() -> void:
	# ask for the dishes the server remembers for me (it also sends them when the window opens)
	pass


## Is a run alive that I could still join?
func _live() -> bool:
	return model.run is Dictionary and str(model.run.get("phase", "")) != "ended"


func _fill() -> void:
	start_button = null
	join_button = null
	latt_button = null
	vanlig_button = null
	var me := model.my_player()
	var cls := Gear.cls_of(me)
	# the class, as a picture
	var head := HBoxContainer.new()
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	head.add_theme_constant_override("separation", 18)
	_body.add_child(head)
	if cls != "":
		var info: Dictionary = Data.classes.get(cls, {})
		var skin := str(me.get("appearance", {}).get("skin", "")) if me.get("appearance") is Dictionary else ""
		var face := GameWindow.sheet_face(Data.hero_sheet(cls, skin))
		if face != null:
			var pic := TextureRect.new()
			pic.texture = face
			pic.custom_minimum_size = Vector2(72, 144)
			pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			pic.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
			head.add_child(pic)
		var colour := Color.html(str(info.get("color", "#ffffff")))
		var names := VBoxContainer.new()
		names.alignment = BoxContainer.ALIGNMENT_CENTER
		head.add_child(names)
		var big := Label.new()
		big.text = str(info.get("emoji", ""))
		big.add_theme_font_size_override("font_size", 56)
		big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		names.add_child(big)
		var nm := Label.new()
		nm.text = str(info.get("name", ""))
		nm.add_theme_font_size_override("font_size", 24)
		nm.add_theme_color_override("font_color", colour)
		nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		names.add_child(nm)
	else:
		add_label(Strings.t("sagaNeedClass"), 18, BAD)
	# the färdkost: slots, then the dishes I carry
	var slots := maxi(1, model.fardkost_slots)
	var picked: Array = model.fardkost_items
	var food_head := Label.new()
	food_head.text = "🥣 " + Strings.t("runFood")
	food_head.add_theme_font_size_override("font_size", 20)
	food_head.add_theme_color_override("font_color", GOLD)
	food_head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(food_head)
	var slot_row := HBoxContainer.new()
	slot_row.alignment = BoxContainer.ALIGNMENT_CENTER
	slot_row.add_theme_constant_override("separation", 12)
	_body.add_child(slot_row)
	for i in range(slots):
		var b := Button.new()
		b.custom_minimum_size = Vector2(92, 92)
		b.expand_icon = true
		BagWindow.style_button(b)
		b.set_meta("k", "slot%d" % i)
		if i < picked.size():
			var item := str(picked[i])
			b.icon = Data.item_icon(item)
			b.tooltip_text = "%s: %s" % [Data.item_name(item), Data.food_text(item)]
			b.pressed.connect(_drop.bind(i))
		else:
			b.text = "+"
			b.add_theme_font_size_override("font_size", 34)
			b.disabled = true
		slot_row.add_child(b)
	if not picked.is_empty():
		var lines: Array = []
		for item in picked:
			lines.append("%s · %s" % [Data.item_name(str(item)), Data.food_text(str(item))])
		var l := add_label("\n".join(lines), 14, Color(1, 1, 1, 0.75))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var flow := HFlowContainer.new()
	flow.alignment = FlowContainer.ALIGNMENT_CENTER
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 8)
	_body.add_child(flow)
	var carried := 0
	var seen: Dictionary = {}
	for slot in me.get("inventory", []):
		if not (slot is Dictionary):
			continue
		var item := str(slot.get("item", ""))
		if seen.has(item) or not Data.is_food(item):
			continue
		seen[item] = true
		var have := model.count_item(item)
		var used := 0
		for p in picked:
			if str(p) == item:
				used += 1
		var left := have - used
		if left <= 0:
			continue
		carried += 1
		var b := Button.new()
		b.custom_minimum_size = Vector2(76, 76)
		b.expand_icon = true
		b.icon = Data.item_icon(item)
		b.text = "×%d" % left
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		b.tooltip_text = "%s: %s" % [Data.item_name(item), Data.food_text(item)]
		BagWindow.style_button(b)
		b.set_meta("k", "dish:" + item)
		b.disabled = picked.size() >= slots
		b.pressed.connect(_take.bind(item))
		flow.add_child(b)
	if carried == 0 and picked.is_empty():
		var l2 := add_label(Strings.t("runFoodEmpty"), 14, Color(1, 1, 1, 0.55))
		l2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# the big button
	if _live():
		var l3 := add_label("👥 " + Data.run_text("already"), 16, GOLD)
		l3.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		join_button = make_button("👥  " + Strings.t("runJoin"), _join, "join")
		join_button.custom_minimum_size = Vector2(0, 72)
		join_button.add_theme_font_size_override("font_size", 28)
		_body.add_child(join_button)
	else:
		_add_levels()
		start_button = make_button("⚔️  " + Strings.t("runStart"), _start, "start")
		start_button.custom_minimum_size = Vector2(0, 72)
		start_button.add_theme_font_size_override("font_size", 28)
		start_button.disabled = cls == ""
		_body.add_child(start_button)


## Two big buttons side by side: Lätt (kind monsters, the Sagoandar come back) and Vanlig. The chosen one is lit; a line says what it means.
func _add_levels() -> void:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	_body.add_child(row)
	latt_button = _level_button("🌱  " + Strings.t("runLevelLatt"), 0, "latt")
	vanlig_button = _level_button("⚔️  " + Strings.t("runLevelVanlig"), 1, "vanlig")
	row.add_child(latt_button)
	row.add_child(vanlig_button)
	var l := add_label(Strings.t("runLevelLattText") if level == 0 else Strings.t("runLevelVanligText"), 14, Color(1, 1, 1, 0.75))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _level_button(text: String, value: int, key: String) -> Button:
	var b := make_button(text, _set_level.bind(value), key)
	b.toggle_mode = true
	b.button_pressed = level == value
	b.custom_minimum_size = Vector2(190, 56)
	b.add_theme_font_size_override("font_size", 22)
	return b


func _set_level(value: int) -> void:
	level = value
	Sfx.play("target")
	refresh()


func _focus_first() -> void:
	# the one big button is where the pad's A should land
	if start_button != null and not start_button.disabled:
		start_button.grab_focus()
	elif join_button != null:
		join_button.grab_focus()
	else:
		super._focus_first()


func _take(item: String) -> void:
	var picked: Array = model.fardkost_items.duplicate()
	if picked.size() >= maxi(1, model.fardkost_slots):
		return
	picked.append(item)
	_send_food(picked)


func _drop(i: int) -> void:
	var picked: Array = model.fardkost_items.duplicate()
	if i >= 0 and i < picked.size():
		picked.remove_at(i)
	_send_food(picked)


func _send_food(items: Array) -> void:
	model.fardkost_items = items # (at once; the server's `fardkost` change says what it took)
	Net.send({"t": "fardkost", "items": items})
	Sfx.play("target")
	refresh()


func _start() -> void:
	Net.send({"t": "fardkost", "items": model.fardkost_items})
	Net.send({"t": "run", "a": "start", "fardkost": model.fardkost_items, "level": level})
	Sfx.play("banner")
	close()


func _join() -> void:
	Net.send({"t": "run", "a": "join"})
	Sfx.play("banner")
	close()
