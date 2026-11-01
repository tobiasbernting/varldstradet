class_name HudLayer
extends CanvasLayer
## The HUD: hearts, the dungeon's name, the party (names, hearts and flags of everyone in the area), a small
## connection indicator, the server's banners and toasts, the notice shown on a map the client does not draw yet,
## and since M3b the fight (a port of the browser's ui/saga.ts): the spell bar with cooldown sweeps, the frames of
## me and my target, the boss's bar with its phases and cast bar (with the interrupt hint), the boss's shouts, the
## fallen/frozen/webbed box, the use prompt, the frame-time overlay. Built in code; every text comes from
## assets/sv.json.

signal menu_asked

const HP_GREEN := Color("4fcf5a")
const HP_YELLOW := Color("f2c33a")
const HP_RED := Color("e8473a")
const FLAG_GLYPHS := [["down", "💀"], ["frozen", "🧊"], ["wall", "🧱"], ["rage", "🔥"], ["hot", "🌿"], ["slow", "🐌"]]

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
var farm_box: HBoxContainer ## the top right: clock and day, season, weather, coins, stars, hearts (outdoors)
var farm_labels: Dictionary = {}
var not_drawn: PanelContainer
var not_drawn_label: Label
var _banner_t := 0.0
var _toast_t := 0.0
var _banner_queue: Array = []

# the fight
var spell_bar: HBoxContainer
var _slots: Array = [] ## {id, root, icon, sweep, num, key, name, panel, was_cooling}
var _bar_for := ""
var units: VBoxContainer
var me_frame: Dictionary = {}
var target_frame: Dictionary = {}
var boss_box: VBoxContainer
var boss_name: Label
var boss_title: Label
var boss_phase: Label
var boss_meter: ProgressBar
var boss_text: Label
var cast_box: PanelContainer
var cast_fill: ProgressBar
var cast_name: Label
var _boss_for := -1
var yell_label: Label
var _yell_t := 0.0
var down_box: PanelContainer
var down_title: Label
var down_sub: Label
var _down_since := 0.0
var _was_down := false
var prompt_label: Label
var hint_label: Label
var _hint_t := 0.0
var fps_label: Label
var _frame_times: Array = []
var _fps_in := 0.0


func _ready() -> void:
	_build_farm_box()
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
	# me and my target, under the hearts
	units = VBoxContainer.new()
	units.add_theme_constant_override("separation", 4)
	left.add_child(units)
	me_frame = _unit_frame()
	units.add_child(me_frame["root"])
	target_frame = _unit_frame()
	units.add_child(target_frame["root"])
	target_frame["root"].visible = false
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
	fps_label = _label(14)
	fps_label.anchor_left = 1.0
	fps_label.anchor_right = 1.0
	fps_label.offset_left = -300
	fps_label.offset_right = -16
	fps_label.offset_top = 84
	fps_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	fps_label.visible = false
	add_child(fps_label)

	# the boss at the top, in the middle
	var top := VBoxContainer.new()
	top.anchor_left = 0.5
	top.anchor_right = 0.5
	top.offset_left = -260
	top.offset_right = 260
	top.offset_top = 10
	top.add_theme_constant_override("separation", 4)
	add_child(top)
	boss_box = VBoxContainer.new()
	boss_box.visible = false
	top.add_child(boss_box)
	var boss_row := HBoxContainer.new()
	boss_row.alignment = BoxContainer.ALIGNMENT_CENTER
	boss_row.add_theme_constant_override("separation", 10)
	boss_box.add_child(boss_row)
	boss_name = _label(22)
	boss_name.add_theme_color_override("font_color", Color("ffe9a8"))
	boss_row.add_child(boss_name)
	boss_title = _label(14)
	boss_title.modulate = Color(1, 1, 1, 0.8)
	boss_title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	boss_row.add_child(boss_title)
	boss_phase = _label(14)
	boss_phase.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	boss_row.add_child(boss_phase)
	boss_meter = _meter(Color("c23a2c"), 22)
	boss_box.add_child(boss_meter)
	boss_text = _label(14)
	boss_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	boss_text.modulate = Color(1, 1, 1, 0.85)
	boss_box.add_child(boss_text)
	cast_box = PanelContainer.new()
	cast_box.visible = false
	top.add_child(cast_box)
	var cast_stack := VBoxContainer.new()
	cast_box.add_child(cast_stack)
	cast_name = _label(16)
	cast_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cast_stack.add_child(cast_name)
	cast_fill = _meter(Color("e8a53a"), 14)
	cast_stack.add_child(cast_fill)
	yell_label = _label(18)
	yell_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	yell_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	yell_label.add_theme_color_override("font_color", Color("ffd6c0"))
	top.add_child(yell_label)

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

	# fallen, frozen or webbed: a box in the middle
	down_box = PanelContainer.new()
	down_box.anchor_left = 0.5
	down_box.anchor_right = 0.5
	down_box.anchor_top = 0.5
	down_box.anchor_bottom = 0.5
	down_box.offset_left = -260
	down_box.offset_right = 260
	down_box.offset_top = -60
	down_box.offset_bottom = 60
	down_box.visible = false
	add_child(down_box)
	var down_stack := VBoxContainer.new()
	down_stack.add_theme_constant_override("separation", 6)
	down_box.add_child(down_stack)
	down_title = _label(26)
	down_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	down_stack.add_child(down_title)
	down_sub = _label(16)
	down_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	down_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	down_stack.add_child(down_sub)

	# the use prompt and the hint, over the spell bar
	prompt_label = _label(18)
	prompt_label.anchor_left = 0.5
	prompt_label.anchor_right = 0.5
	prompt_label.anchor_top = 1.0
	prompt_label.anchor_bottom = 1.0
	prompt_label.offset_left = -300
	prompt_label.offset_right = 300
	prompt_label.offset_top = -170
	prompt_label.offset_bottom = -140
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.add_theme_color_override("font_color", Color("ffe9a8"))
	add_child(prompt_label)
	hint_label = _label(14)
	hint_label.anchor_left = 0.5
	hint_label.anchor_right = 0.5
	hint_label.anchor_top = 1.0
	hint_label.anchor_bottom = 1.0
	hint_label.offset_left = -400
	hint_label.offset_right = 400
	hint_label.offset_top = -24
	hint_label.offset_bottom = -4
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.modulate = Color(1, 1, 1, 0.75)
	add_child(hint_label)

	toast_label = _label(20)
	toast_label.anchor_left = 0.5
	toast_label.anchor_right = 0.5
	toast_label.anchor_top = 1.0
	toast_label.anchor_bottom = 1.0
	toast_label.offset_left = -400
	toast_label.offset_right = 400
	toast_label.offset_top = -210
	toast_label.offset_bottom = -170
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(toast_label)

	# the spell bar at the bottom, in the middle
	spell_bar = HBoxContainer.new()
	spell_bar.anchor_left = 0.5
	spell_bar.anchor_right = 0.5
	spell_bar.anchor_top = 1.0
	spell_bar.anchor_bottom = 1.0
	spell_bar.offset_top = -130
	spell_bar.offset_bottom = -30
	spell_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	spell_bar.add_theme_constant_override("separation", 10)
	spell_bar.grow_horizontal = Control.GROW_DIRECTION_BOTH
	spell_bar.visible = false
	add_child(spell_bar)

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
	fps_label.visible = Settings.show_fps
	reset()


func _label(size: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_outline_color", Color("2b2419"))
	l.add_theme_constant_override("outline_size", 6)
	return l


func _meter(colour: Color, height: int) -> ProgressBar:
	var p := ProgressBar.new()
	p.min_value = 0.0
	p.max_value = 1.0
	p.value = 1.0
	p.show_percentage = false
	p.custom_minimum_size = Vector2(0, height)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.08, 0.06, 0.06, 0.85)
	bg.set_corner_radius_all(4)
	p.add_theme_stylebox_override("background", bg)
	var fill := StyleBoxFlat.new()
	fill.bg_color = colour
	fill.set_corner_radius_all(4)
	p.add_theme_stylebox_override("fill", fill)
	return p


static func _set_meter_colour(p: ProgressBar, colour: Color) -> void:
	var sb: StyleBoxFlat = p.get_theme_stylebox("fill")
	if sb != null and sb.bg_color != colour:
		sb.bg_color = colour


## A portrait line: icon, name, flags and a health bar (me, my target, each friend). The browser's UnitView.
func _unit_frame() -> Dictionary:
	var root := HBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(28, 28)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	root.add_child(icon)
	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(190, 0)
	col.add_theme_constant_override("separation", 2)
	root.add_child(col)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	col.add_child(row)
	var nm := _label(16)
	row.add_child(nm)
	var fl := _label(14)
	row.add_child(fl)
	var meter := _meter(HP_GREEN, 12)
	col.add_child(meter)
	var txt := _label(12)
	txt.modulate = Color(1, 1, 1, 0.8)
	col.add_child(txt)
	return {"root": root, "icon": icon, "name": nm, "flags": fl, "meter": meter, "text": txt}


func _set_unit(u: Dictionary, icon: Texture2D, unit_name: String, f: Array, colour: Color, numbers := true) -> void:
	var k := 1.0
	var text := ""
	if f.size() >= 2:
		k = maxf(0.0, float(f[0]) / maxf(1.0, float(f[1])))
		text = "%d / %d" % [int(f[0]), int(f[1])] if numbers else str(int(f[0]))
	u["icon"].texture = icon
	u["name"].text = unit_name
	u["name"].add_theme_color_override("font_color", colour)
	u["flags"].text = flag_glyphs(int(f[2]) if f.size() >= 3 else 0)
	u["meter"].value = k
	_set_meter_colour(u["meter"], hp_colour(k))
	u["text"].text = text
	var downed := f.size() >= 3 and (int(f[2]) & Data.flag("down")) != 0
	u["root"].modulate = Color(0.7, 0.7, 0.75) if downed else Color.WHITE


static func hp_colour(k: float) -> Color:
	return HP_GREEN if k > 0.5 else (HP_YELLOW if k > 0.25 else HP_RED)


static func flag_glyphs(fl: int) -> String:
	var out := ""
	for pair in FLAG_GLYPHS:
		if fl & Data.flag(pair[0]):
			out += pair[1]
	return out


func reset() -> void:
	area_label.text = ""
	hearts_label.text = ""
	hearts_text.text = ""
	banner_label.text = ""
	banner_sub.text = ""
	toast_label.text = ""
	yell_label.text = ""
	prompt_label.text = ""
	hint_label.text = ""
	not_drawn.visible = false
	farm_box.visible = false
	boss_box.visible = false
	cast_box.visible = false
	down_box.visible = false
	units.visible = false
	_boss_for = -1
	_was_down = false
	_banner_queue = []
	set_party([])
	build_spell_bar("")


func _process(delta: float) -> void:
	if _banner_t > 0.0:
		_banner_t -= delta
		if _banner_t <= 0.0:
			banner_label.text = ""
			banner_sub.text = ""
			if not _banner_queue.is_empty():
				var next: Array = _banner_queue.pop_front()
				show_banner(next[0], next[1], next[2])
	if _toast_t > 0.0:
		_toast_t -= delta
		if _toast_t <= 0.0:
			toast_label.text = ""
	if _yell_t > 0.0:
		_yell_t -= delta
		yell_label.modulate.a = clampf(_yell_t / 0.6, 0.0, 1.0)
		if _yell_t <= 0.0:
			yell_label.text = ""
	if _hint_t > 0.0:
		_hint_t -= delta
		hint_label.modulate.a = clampf(_hint_t / 1.0, 0.0, 0.75)
	if fps_label.visible:
		_frame_times.append(delta)
		if _frame_times.size() > 120:
			_frame_times.pop_front()
		_fps_in -= delta
		if _fps_in <= 0.0:
			_fps_in = 0.25
			fps_label.text = perf_text(_frame_times)


## "60 fps · 16.7 ms · 1 % low 24.1 ms · Mellan": what the frame-time overlay shows (the bench prints the same numbers).
static func perf_text(times: Array, with_preset := true) -> String:
	if times.is_empty():
		return ""
	var sum := 0.0
	for t in times:
		sum += float(t)
	var avg := sum / times.size()
	var sorted := times.duplicate()
	sorted.sort()
	var worst: Array = sorted.slice(maxi(0, sorted.size() - maxi(1, int(ceil(sorted.size() * 0.01)))))
	var low := 0.0
	for t in worst:
		low += float(t)
	low /= worst.size()
	var text := "%d fps · %.1f ms · 1 %% low %.1f ms" % [roundi(1.0 / maxf(0.0001, avg)), avg * 1000.0, low * 1000.0]
	return text + " · " + Quality.label_of(Quality.preset) if with_preset else text


func set_fps_shown(on: bool) -> void:
	fps_label.visible = on
	_frame_times = []


## The map's name in the corner; on a map the client does not draw, the notice in the middle instead.
func _build_farm_box() -> void:
	farm_box = HBoxContainer.new()
	farm_box.anchor_left = 1.0
	farm_box.anchor_right = 1.0
	farm_box.offset_left = -640
	farm_box.offset_right = -16
	farm_box.offset_top = 44 # (under the connection dot, which sits at the top right)
	farm_box.alignment = BoxContainer.ALIGNMENT_END
	farm_box.add_theme_constant_override("separation", 8)
	farm_box.visible = false
	add_child(farm_box)
	for k in ["clock", "season", "weather", "coins", "stars", "hearts"]:
		var panel := PanelContainer.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.1, 0.09, 0.07, 0.72)
		sb.set_corner_radius_all(8)
		sb.content_margin_left = 10
		sb.content_margin_right = 10
		sb.content_margin_top = 4
		sb.content_margin_bottom = 4
		panel.add_theme_stylebox_override("panel", sb)
		var l := _label(20)
		panel.add_child(l)
		farm_box.add_child(panel)
		farm_labels[k] = l
		panel.visible = false
		l.set_meta("panel", panel)


func _farm_chip(k: String, text: String) -> void:
	var l: Label = farm_labels[k]
	l.text = text
	(l.get_meta("panel") as Control).visible = text != ""


## Outdoors: the clock and the day, the season and weather, my coins and stars and hearts (the browser's top chips).
func set_farm_status(model: WorldModel, me: Dictionary) -> void:
	farm_box.visible = true
	var f := fposmod(model.time_ms + (0.0 if model.time_at == 0 else float(Time.get_ticks_msec() - model.time_at)), Data.constant("DAY_LENGTH_MS", 600000.0)) / Data.constant("DAY_LENGTH_MS", 600000.0)
	var clock := "🌅" if f < 0.3 else ("☀️" if f < 0.65 else ("🌇" if f < 0.8 else "🌙"))
	_farm_chip("clock", "%s %s" % [clock, Strings.t("day", {"day": model.day})])
	var glyphs := {"halloween": "🎃", "jul": "🎄", "pask": "🐣", "midsommar": "🌸"}
	_farm_chip("season", str(glyphs.get(model.season, "")))
	var kind := str(model.weather.get("kind", "sun")) if model.weather is Dictionary else "sun"
	_farm_chip("weather", Strings.weather_emoji(kind))
	farm_labels["weather"].tooltip_text = Strings.weather(kind)
	_farm_chip("coins", "%d %s" % [int(me.get("coins", 0)), Strings.t("coins")])
	var stars := int(me.get("stars", 0))
	_farm_chip("stars", "⭐ %d" % stars if stars > 0 else "")
	var hearts := int(me.get("hearts", 0))
	var max_h := int(Data.constant("MAX_HEARTS", 5.0))
	_farm_chip("hearts", "❤️".repeat(maxi(0, hearts)) + "🖤".repeat(maxi(0, max_h - hearts)) if hearts < max_h else "")


func set_area(area_name: String, drawn: bool) -> void:
	area_label.text = area_name if drawn else ""
	farm_box.visible = farm_box.visible and drawn
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


## rows: [{name, hp, max, flags, cls, me, target}] for everyone in the dungeon (me first).
func set_party(rows: Array) -> void:
	for child in party_box.get_children():
		child.queue_free()
	party_title.visible = rows.size() > 1
	for r in rows:
		if bool(r.get("me", false)):
			continue
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var name_label := _label(16)
		name_label.text = str(r.get("name", ""))
		name_label.custom_minimum_size = Vector2(120, 0)
		var cls := str(r.get("cls", ""))
		var ccol := str(Data.classes.get(cls, {}).get("color", "#cccccc"))
		name_label.add_theme_color_override("font_color", Color.html(ccol) if ccol.is_valid_html_color() else Color.WHITE)
		row.add_child(name_label)
		var h := _label(16)
		h.add_theme_color_override("font_color", Color("ff5a6a"))
		h.text = hearts_string(float(r.get("hp", 0)), float(r.get("max", 0)))
		row.add_child(h)
		var fl := _label(14)
		fl.text = flag_glyphs(int(r.get("flags", 0)))
		row.add_child(fl)
		if bool(r.get("target", false)):
			row.modulate = Color(0.7, 1.0, 0.75)
		if int(r.get("flags", 0)) & Data.flag("down"):
			row.modulate = Color(0.7, 0.7, 0.75)
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
		"bot":
			conn_dot.color = Color("8ab4ff")
			conn_label.text = "Bot"
		_:
			conn_dot.color = Color("ff5a6a")
			conn_label.text = Strings.t("connClosed")


## Big words across the screen; a second banner waits for the first (the browser's queue). `kind` picks the sound.
func show_banner(text: String, sub: String, kind := "") -> void:
	if _banner_t > 0.0:
		_banner_queue.append([text, sub, kind])
		return
	banner_label.text = text
	banner_sub.text = sub
	_banner_t = 5.2 if kind == "cleared" else (4.3 if kind in ["boss", "reward", "enter", "chapter", "level"] else 3.2)
	match kind:
		"boss", "cleared":
			Sfx.play("fanfare_big")
		"reward", "level":
			Sfx.play("fanfare")
		"wipe":
			Sfx.play("sombre")
		"rest":
			Sfx.play("chime" if text == Strings.t("sagaPuzzleOpen") else "calm")
		_:
			Sfx.play("banner")


func show_toast(text: String) -> void:
	toast_label.text = text
	_toast_t = 3.5


## A boss shouts (and the chat gets it too, through the view).
func show_yell(boss: String, text: String) -> void:
	yell_label.text = "%s: %s" % [boss, text]
	yell_label.modulate.a = 1.0
	_yell_t = 5.2
	Sfx.play("yell")


## The use prompt ("E · Öppna kistan"), "" for none.
func set_prompt(text: String) -> void:
	prompt_label.text = text


func show_hint(text: String, seconds := 8.0) -> void:
	hint_label.text = text
	hint_label.modulate.a = 0.75
	_hint_t = seconds


# ---------------------------------------------------------------------------
# The spell bar


## Builds the bar for a class ("" takes it away): four spells, the potion, in the order of CLASSES[cls].spells.
func build_spell_bar(cls: String) -> void:
	if cls == _bar_for:
		return
	_bar_for = cls
	for s in _slots:
		s["root"].queue_free()
	_slots = []
	spell_bar.visible = cls != ""
	if cls == "":
		return
	var spells := Data.class_spells(cls)
	for i in range(spells.size()):
		var id := str(spells[i])
		var sp := Data.spell(id)
		_add_slot(id, Data.icon("spell_" + id), str(i + 1), str(sp.get("name", id)))
	_add_slot("potion", Data.icon("ui_potion"), "5", Strings.t("sagaPotionKey").split(" (")[0])


func _add_slot(id: String, icon: Texture2D, key: String, slot_name: String) -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 2)
	root.alignment = BoxContainer.ALIGNMENT_END
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(72, 72)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.1, 0.08, 0.08, 0.8)
	sb.set_corner_radius_all(8)
	sb.set_border_width_all(2)
	sb.border_color = Color(0.5, 0.45, 0.4)
	panel.add_theme_stylebox_override("panel", sb)
	root.add_child(panel)
	var inner := Control.new()
	inner.custom_minimum_size = Vector2(68, 68)
	panel.add_child(inner)
	var tex := TextureRect.new()
	tex.texture = icon
	tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex.anchor_right = 1.0
	tex.anchor_bottom = 1.0
	tex.offset_left = 10
	tex.offset_top = 10
	tex.offset_right = -10
	tex.offset_bottom = -10
	inner.add_child(tex)
	# the cooldown: a dark sweep that empties from the top as the spell comes back
	var sweep := ColorRect.new()
	sweep.color = Color(0, 0, 0, 0.6)
	sweep.anchor_right = 1.0
	sweep.anchor_bottom = 0.0
	sweep.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(sweep)
	var num := _label(22)
	num.anchor_right = 1.0
	num.anchor_bottom = 1.0
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	inner.add_child(num)
	var key_label := _label(12)
	key_label.text = key
	key_label.position = Vector2(4, 2)
	key_label.modulate = Color(1, 1, 1, 0.8)
	inner.add_child(key_label)
	var name_label := _label(12)
	name_label.text = slot_name
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.custom_minimum_size = Vector2(72, 0)
	name_label.clip_text = true
	root.add_child(name_label)
	spell_bar.add_child(root)
	_slots.append({"id": id, "root": root, "panel": panel, "style": sb, "icon": tex, "sweep": sweep, "num": num, "key": key_label, "name": name_label, "was_cooling": false, "last": ""})


## Every frame in a fight: cooldown sweeps, pressed flashes, out of reach, "stop the boss now".
func tick_spell_bar(combat: Combat, kick: bool) -> void:
	if _slots.is_empty():
		return
	var off := not combat.can_act()
	var now := Combat.local_ms()
	for s in _slots:
		var id: String = s["id"]
		var cd: Dictionary = combat.potion_cooldown() if id == "potion" else combat.cooldown(id)
		var left := float(cd.get("left", 0.0))
		var total := maxf(1.0, float(cd.get("total", 1.0)))
		var cooling := left > 0.0
		var k := 1.0 - left / total if cooling else 1.0
		var num := str(ceili(left / 1000.0)) if left > 1000.0 else ""
		var pots := combat.potion_count() if id == "potion" else 1
		var press: bool = now - float(combat.pressed_at.get(id, -10000.0)) < 140.0
		var far := id != "potion" and combat.out_of_reach(id)
		var kind := str(Data.spell(id).get("kind", ""))
		var stop: bool = kick and Data.interrupt_kinds.has(kind) and not cooling and not off
		s["sweep"].anchor_bottom = 1.0 - k if cooling else 0.0
		s["sweep"].visible = cooling
		if s["num"].text != num:
			s["num"].text = num
		var state := "%d%d%d%d%d%d" % [int(cooling), int(off), int(press), int(far), int(stop), pots]
		if state != s["last"]:
			s["last"] = state
			var sb: StyleBoxFlat = s["style"]
			var dim := off or pots <= 0
			s["root"].modulate = Color(0.55, 0.55, 0.6) if dim else (Color(1.0, 0.75, 0.7) if far else Color.WHITE)
			sb.border_color = Color(0.55, 0.9, 1.0) if stop else (Color(1.0, 1.0, 0.8) if press else Color(0.5, 0.45, 0.4))
			sb.set_border_width_all(4 if stop or press else 2)
			sb.bg_color = Color(0.2, 0.45, 0.6, 0.85) if stop else Color(0.1, 0.08, 0.08, 0.8)
			if id == "potion":
				s["key"].text = "5 · %d" % pots
		if s["was_cooling"] and not cooling:
			s["root"].modulate = Color(1.3, 1.3, 1.2)
		s["was_cooling"] = cooling


# ---------------------------------------------------------------------------
# Me, my target, the boss, the fallen


## My frame and my target's (f: [hp, max, flags] or []).
func set_units(me_name: String, me_cls: String, me_f: Array, target: Variant, target_name: String, target_f: Array, target_kind: String) -> void:
	units.visible = true
	var cls: Dictionary = Data.classes.get(me_cls, {})
	var ccol := str(cls.get("color", "#ffe98a"))
	_set_unit(me_frame, Data.icon("ui_sword") if me_cls != "" else null, me_name, me_f, Color.html(ccol) if ccol.is_valid_html_color() else Color.WHITE)
	target_frame["root"].visible = target != null
	if target == null:
		return
	var icon_name := "ui_crown" if target_kind == "boss" else ("ui_ice" if target_kind == "ice" else ("ui_web" if target_kind == "web" else ("ui_sword" if target_kind == "friend" else "ui_skull")))
	_set_unit(target_frame, Data.icon(icon_name), target_name, target_f, Color("9fe08a") if target_kind == "friend" else Color("ff8a70"), not target_f.is_empty())


## The boss's bar: its name, title, phases, health, and the attack it is getting ready (b: the snapshot's `b`).
func set_boss(b: Variant, species: String, mob_hp: Array, now: float) -> void:
	var def := Data.boss(species)
	if not (b is Dictionary) or def.is_empty():
		boss_box.visible = false
		cast_box.visible = false
		_boss_for = -1
		return
	boss_box.visible = true
	var id := int(b.get("id", -1))
	if _boss_for != id:
		_boss_for = id
		boss_name.text = ("💀 " if def.get("mini", false) else "👑 ") + str(def.get("name", species))
		boss_title.text = str(def.get("title", ""))
	var phases: Array = def.get("phases", [])
	var phase := int(b.get("phase", 0))
	if phases.is_empty():
		boss_phase.text = ""
	else:
		var pips := ""
		for i in range(phases.size() + 1):
			pips += "●" if i <= phase else "○"
		boss_phase.text = "%s %s" % [Strings.t("sagaPhase", {"n": phase + 1}), pips]
	if mob_hp.size() >= 2:
		boss_meter.value = float(mob_hp[0]) / maxf(1.0, float(mob_hp[1]))
		boss_text.text = "%d / %d" % [int(mob_hp[0]), int(mob_hp[1])]
	else:
		boss_meter.value = 1.0
		boss_text.text = ""
	var cast: Variant = b.get("cast")
	cast_box.visible = cast is Dictionary
	if cast is Dictionary:
		var kick := bool(cast.get("kick", false))
		var label := "%s%s%s" % ["🛡️ " if kick else "⚠️ ", str(cast.get("name", "")), (" · " + Strings.t("sagaCanKick")) if kick else ""]
		if cast_name.text != label:
			cast_name.text = label
		_set_meter_colour(cast_fill, Color("58b8f0") if kick else Color("e8a53a"))
		var k := 1.0 - maxf(0.0, float(cast.get("at", now)) - now) / maxf(1.0, float(cast.get("warn", 1)))
		cast_fill.value = clampf(k, 0.0, 1.0)


## Fallen, frozen or webbed: the box in the middle (the browser's frameDown).
func set_down(flags: int, all_down: bool, webbed: bool, now: float) -> void:
	var is_down := (flags & Data.flag("down")) != 0
	var frozen := (flags & Data.flag("frozen")) != 0
	if is_down and not _was_down:
		_down_since = now
		Sfx.play("fall")
	if not is_down and _was_down:
		Sfx.play("rise")
	_was_down = is_down
	down_box.visible = is_down or frozen
	if not down_box.visible:
		return
	var title := Strings.t("sagaWebbedTitle") if webbed else Strings.t("sagaFrozenTitle")
	var sub := Strings.t("sagaWebbedSub") if webbed else Strings.t("sagaFrozenSub")
	var glyph := "🕸️" if webbed else "🧊"
	if is_down:
		glyph = "💀"
		title = Strings.t("sagaFallenTitle")
		var left := maxi(1, ceili((Data.constant("DOWN_MS", 10000.0) - (now - _down_since)) / 1000.0))
		sub = Strings.t("sagaWipeSub") if all_down else Strings.t("sagaFallenSub", {"s": left})
	down_title.text = "%s %s" % [glyph, title]
	down_sub.text = sub
