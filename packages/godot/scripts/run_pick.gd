class_name RunPick
extends CanvasLayer
## The runor pick (GAME.md section 2 and 8): after a zone's exit the server offers three cards (`run` change, ev "offer") and the
## party votes. Three big cards, each the runa's picture (its emoji, large), its name and its one-line effect; a tap, a click or
## the pad's A on a card is a vote (`run pick` with the card's index); the card most voted glows; a gentle bar shows the time
## left (the server decides at `pickMs`); "Omval" asks for a new offer when the tree gave the party one. The offer going to null
## closes it. The hero stands still while it is open so the pad's stick moves the focus between the cards.

var model: WorldModel
var _root: Control
var _cards: HBoxContainer
var _bar: ProgressBar
var _reroll: Button
var _title: Label
var _sub: Label
var _open := false
var _focus := 1
var _opened_at := 0
var buttons: Array = []


func _ready() -> void:
	layer = 9
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	var dim := ColorRect.new()
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.color = Color(0, 0, 0, 0.55)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(dim)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(centre)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	centre.add_child(col)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 40)
	_title.add_theme_color_override("font_color", Color("e8b830"))
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_title)
	_sub = Label.new()
	_sub.add_theme_font_size_override("font_size", 18)
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub.modulate = Color(1, 1, 1, 0.8)
	col.add_child(_sub)
	_cards = HBoxContainer.new()
	_cards.add_theme_constant_override("separation", 22)
	_cards.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(_cards)
	_bar = ProgressBar.new()
	_bar.custom_minimum_size = Vector2(0, 8)
	_bar.show_percentage = false
	_bar.max_value = 1.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.12)
	bg.set_corner_radius_all(4)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("7fe0c8")
	fill.set_corner_radius_all(4)
	_bar.add_theme_stylebox_override("background", bg)
	_bar.add_theme_stylebox_override("fill", fill)
	col.add_child(_bar)
	_reroll = GameWindow.make_button("", _ask_reroll, "reroll")
	_reroll.custom_minimum_size = Vector2(240, 48)
	_reroll.add_theme_font_size_override("font_size", 20)
	_reroll.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(_reroll)
	visible = false
	model.offer_changed.connect(_on_offer)
	model.run_changed.connect(_on_offer)


func is_open() -> bool:
	return _open


func _on_offer() -> void:
	var offer: Variant = model.offer
	if offer is Dictionary and model.in_run() and (model.in_run_party() or not (model.run is Dictionary)):
		if not _open:
			_open = true
			_opened_at = Time.get_ticks_msec()
			visible = true
			_focus = 1
			Sfx.play("banner")
		_build(offer)
	elif _open:
		_open = false
		visible = false


func _votes_of(offer: Dictionary) -> Array:
	var counts := [0, 0, 0]
	for id in offer.get("votes", {}).keys():
		var i := int(offer["votes"][id])
		if i >= 0 and i < 3:
			counts[i] += 1
	return counts


func _build(offer: Dictionary) -> void:
	_title.text = "🎴 " + Data.run_text("pickTitle")
	_sub.text = Data.run_text("pickSub")
	for c in _cards.get_children():
		_cards.remove_child(c)
		c.queue_free()
	buttons = []
	var counts := _votes_of(offer)
	var best := 0
	for i in range(3):
		if counts[i] > counts[best]:
			best = i
	var mine := int(offer.get("votes", {}).get(model.me, -1))
	var cards: Array = offer.get("cards", [])
	for i in range(cards.size()):
		var runa := Data.runa(str(cards[i]))
		var leading: bool = counts[i] > 0 and best == i
		var b := _card(runa, int(counts[i]), leading, mine == i)
		b.set_meta("k", "card%d" % i)
		b.pressed.connect(_vote.bind(i))
		_cards.add_child(b)
		buttons.append(b)
	var rerolls := int(offer.get("rerolls", 0))
	_reroll.visible = rerolls > 0
	_reroll.text = "🔄  %s (%s)" % [Strings.t("runReroll"), Strings.t("runRerollLeft", {"n": rerolls})]
	if not buttons.is_empty():
		var f := clampi(_focus, 0, buttons.size() - 1)
		(buttons[f] as Button).grab_focus.call_deferred()


func _card(runa: Dictionary, votes: int, leading: bool, mine: bool) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(250, 330)
	b.focus_mode = Control.FOCUS_ALL
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.2, 0.16, 0.11, 0.97) if not leading else Color(0.34, 0.26, 0.1, 0.98)
		if state == "hover" or state == "pressed":
			sb.bg_color = sb.bg_color.lightened(0.12)
		sb.set_corner_radius_all(16)
		sb.set_border_width_all(4 if (leading or state == "focus") else 2)
		sb.border_color = Color("e8b830") if leading else Color("8a6a3a")
		if state == "focus":
			sb.border_color = Color.WHITE
		if leading:
			sb.shadow_color = Color(1.0, 0.8, 0.2, 0.55)
			sb.shadow_size = 16
		b.add_theme_stylebox_override(state, sb)
	var col := VBoxContainer.new()
	col.anchor_right = 1.0
	col.anchor_bottom = 1.0
	col.offset_left = 14
	col.offset_right = -14
	col.offset_top = 14
	col.offset_bottom = -14
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 10)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(col)
	var icon := Label.new()
	icon.text = str(runa.get("icon", "✨"))
	icon.add_theme_font_size_override("font_size", 96)
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(icon)
	var nm := Label.new()
	nm.text = str(runa.get("name", ""))
	nm.add_theme_font_size_override("font_size", 26)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(nm)
	var tx := Label.new()
	tx.text = str(runa.get("text", ""))
	tx.add_theme_font_size_override("font_size", 18)
	tx.add_theme_color_override("font_color", Color(1, 1, 1, 0.85))
	tx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tx.custom_minimum_size = Vector2(200, 0)
	tx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(tx)
	var cls := str(runa.get("cls", ""))
	if cls != "":
		var cl := Label.new()
		cl.text = str(Data.classes.get(cls, {}).get("emoji", ""))
		cl.add_theme_font_size_override("font_size", 22)
		cl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(cl)
	var vl := Label.new()
	vl.text = ("✓ " if mine else "") + "🗳".repeat(votes)
	vl.add_theme_font_size_override("font_size", 24)
	vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vl.add_theme_color_override("font_color", Color("8fe08a"))
	vl.custom_minimum_size = Vector2(0, 30)
	vl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(vl)
	return b


func _vote(i: int) -> void:
	_focus = i
	Net.send({"t": "run", "a": "pick", "card": i})
	Sfx.play("target")


func _ask_reroll() -> void:
	Net.send({"t": "run", "a": "reroll"})
	Sfx.play("target")


func _process(_delta: float) -> void:
	if not _open:
		return
	var total := maxf(1.0, Data.run_const("pickMs", 20000.0))
	_bar.value = clampf(model.offer_left() / total, 0.0, 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	# the number keys vote too
	if event is InputEventKey and event.pressed and not event.echo:
		var code: int = event.physical_keycode
		if code >= KEY_1 and code <= KEY_3:
			_vote(code - KEY_1)
			get_viewport().set_input_as_handled()
