class_name HelpWindow
extends GameWindow
## Hjälp (H or ?, and the pause menu): the browser's help topics (HELP in shared/src/sv.ts, exported to game.json with the
## native client's own lines for keys and the pad), one at a time, with a row of topic chips. Left and right change the topic (a pad's
## d-pad too); the animal-house list closes the "Bygga hönshus" topic. Texts come from the shared file so they never differ.

var topic := "controls"


func _init() -> void:
	width = 700
	body_height = 440
	title_text = "❓ " + Strings.t("helpTitle")


func _purse_text(_me: Dictionary) -> String:
	return ""


func topics() -> Array:
	return Data.book.get("help", [])


func _on_open() -> void:
	_set_tabs()
	_scroll.scroll_vertical = 0


func open_topic(id: String) -> void:
	topic = id
	open_window()


func _build() -> void:
	Settings.ui_scale_changed.connect(func() -> void:
		if _open:
			_set_tabs()
			refresh())


func _set_tabs() -> void:
	clear_tabs()
	if Settings.ui_scale >= 1.5:
		# at large text 21 chips would leave no room for the page: the topic before, the topic, the topic after
		var ts := topics()
		for i in range(ts.size()):
			if str(ts[i].get("id", "")) == topic:
				var prev := add_tab("◀", false, _step_topic.bind(-1))
				prev.set_meta("k", "prev")
				var here := add_tab("%s %s" % [str(ts[i].get("emoji", "")), str(ts[i].get("title", ""))], true, _pick.bind(topic))
				here.set_meta("k", "topic:" + topic)
				var next := add_tab("▶", false, _step_topic.bind(1))
				next.set_meta("k", "next")
		return
	for t in topics():
		var b := add_tab("%s %s" % [str(t.get("emoji", "")), str(t.get("title", ""))], str(t.get("id", "")) == topic, _pick.bind(str(t.get("id", ""))))
		b.set_meta("k", "topic:" + str(t.get("id", "")))
		b.add_theme_font_size_override("font_size", 14)


func _step_topic(step: int) -> void:
	var ts := topics()
	for i in range(ts.size()):
		if str(ts[i].get("id", "")) == topic:
			_pick(str(ts[posmod(i + step, ts.size())].get("id", "")))
			return


func _pick(id: String) -> void:
	topic = id
	_set_tabs()
	refresh()
	_scroll.scroll_vertical = 0
	for b in _find_buttons(_tabs):
		if b.button_pressed:
			b.grab_focus.call_deferred()


func _fill() -> void:
	var t: Dictionary = {}
	for x in topics():
		if str(x.get("id", "")) == topic:
			t = x
	if t.is_empty() and not topics().is_empty():
		t = topics()[0]
	if t.is_empty():
		return
	if str(t.get("intro", "")) != "":
		add_label(str(t["intro"]), 16, Color(1, 1, 1, 0.8))
	var n := 0
	for s in t.get("steps", []):
		n += 1
		_step_row(n, s)
	if bool(t.get("houses", false)):
		add_label(Strings.t("houseLabel"), 18, GOLD)
		for h in Data.book.get("houses", []):
			var need: Array = []
			for i in h.get("recipe", []):
				need.append("%d %s" % [int(i.get("count", 1)), Data.item_name(str(i.get("item", ""))).to_lower()])
			add_row(Data.item_icon(str(h.get("house", ""))), "%s → %s" % [Data.item_name(str(h.get("house", ""))), str(h.get("name", ""))], " + ".join(need), [_price(int(h.get("price", 0)))])


func _price(n: int) -> Label:
	var l := Label.new()
	l.text = "%d %s" % [n, Strings.t("coins")]
	l.add_theme_color_override("font_color", GOLD)
	return l


## "1. [picture] text": the picture is an item or object icon, or an emoji.
func _step_row(n: int, s: Dictionary) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var num := Label.new()
	num.text = "%d." % n
	num.custom_minimum_size = Vector2(28, 0)
	num.add_theme_color_override("font_color", GOLD)
	row.add_child(num)
	var icon_ref := str(s.get("icon", ""))
	if icon_ref.begins_with("emoji:"):
		var e := Label.new()
		e.text = icon_ref.substr(6)
		e.add_theme_font_size_override("font_size", 28)
		e.custom_minimum_size = Vector2(40, 0)
		e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		row.add_child(e)
	elif icon_ref != "":
		row.add_child(picture(Data.item_icon(icon_ref), 36))
	var l := Label.new()
	l.text = str(s.get("text", ""))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 16)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size = Vector2(minf(float(width), get_viewport().get_visible_rect().size.x - 48.0) - 130.0, 0)
	row.add_child(l)
	_body.add_child(row)


## Left and right (and the d-pad) go to the topic before and after while the focus is on the chips.
func _input(event: InputEvent) -> void:
	super(event)
	if not _open or get_viewport().is_input_handled():
		return
	var step := 0
	if event.is_action_pressed("ui_left"):
		step = -1
	elif event.is_action_pressed("ui_right"):
		step = 1
	if step == 0:
		return
	var f := get_viewport().gui_get_focus_owner()
	if f != null and not _tabs.is_ancestor_of(f):
		return
	var ts := topics()
	for i in range(ts.size()):
		if str(ts[i].get("id", "")) == topic:
			_pick(str(ts[posmod(i + step, ts.size())].get("id", "")))
			get_viewport().set_input_as_handled()
			return
