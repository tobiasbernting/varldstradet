class_name SettingsWindow
extends GameWindow
## M8b: the settings window ("Inställningar" in the pause menu, and on the login screen): four pages, Bild (the quality preset, the
## effects the preset defines one by one, window mode, how sharp the 3D picture is, the frame rate), Ljud (all sound, the dungeon's
## sounds, steps and ambience and their volume, the Röstprat volume), Läsa och se (the text size, the colours of danger and
## hearts, stripes on dangerous ground, less shaking and flashing, with a sample) and Styrning (the gamepad's spell layout and the
## Röstprat key). Every control goes through a setter of `Settings` / `Quality`, which keeps the value, saves it and applies it
## at once; the window itself holds no state (`sync` reads it all back from Settings when it opens, and the check calls the same
## setters). Built once, in code; the texts come from sv.ts.

signal fps_changed(on: bool)

const PAGES := ["picture", "sound", "reading", "controls"]

var page := "picture"
var _page_boxes: Dictionary = {}
var _page_tabs: Dictionary = {}
var _syncs: Array = [] ## Callables that put a control back to what Settings says
var _preset_buttons: Dictionary = {}
var _preset_hint: Label
var _toggle_checks: Dictionary = {}
var _window_buttons: Dictionary = {}
var _res_slider: HSlider
var _res_label: Label
var _fps_check: CheckButton
var _master: HSlider
var _effects: HSlider
var _world: HSlider
var _voice: HSlider
var _steps_check: CheckButton
var _ambience_check: CheckButton
var _size_buttons: Dictionary = {}
var _size_sample: Label
var _colour_buttons: Dictionary = {}
var _colour_hint: Label
var _pattern_check: CheckButton
var _motion_check: CheckButton
var _preview: Preview
var _spell_buttons: Dictionary = {}
var _spell_hint: Label
var _ptt_button: Button
var _capturing_key := false
var _ptt_note: Label


func _init() -> void:
	title_text = Strings.t("menuSettings")
	width = 720
	body_height = 420


func _purse_text(_me: Dictionary) -> String:
	return ""


func _ready() -> void:
	super._ready()
	layer = 11 # over the pause menu (10) it is opened from


func _build() -> void:
	for id in PAGES:
		var tab := make_button(Strings.t("settingsTab" + {"picture": "Picture", "sound": "Sound", "reading": "Reading", "controls": "Controls"}[id]), _show_page.bind(id), "tab:" + id)
		tab.toggle_mode = true
		_tabs.add_child(tab)
		_page_tabs[id] = tab
		var box := VBoxContainer.new()
		box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		box.add_theme_constant_override("separation", 8)
		box.visible = false
		_body.add_child(box)
		_page_boxes[id] = box
	_build_picture(_page_boxes["picture"])
	_build_sound(_page_boxes["sound"])
	_build_reading(_page_boxes["reading"])
	_build_controls(_page_boxes["controls"])
	_show_page("picture")


# ---------------------------------------------------------------------------
# Opening, closing and the pages


## The body is built once and never rebuilt (a redraw would drop the slider the player is holding): `refresh` only syncs.
func refresh() -> void:
	if _open:
		sync()


func sync() -> void:
	for s in _syncs:
		s.call()


func _on_open() -> void:
	_capturing_key = false
	if _ptt_note != null:
		_ptt_note.text = ""


func _on_close() -> void:
	_capturing_key = false
	Settings.save()


func _show_page(id: String) -> void:
	page = id
	for k in PAGES:
		(_page_boxes[k] as Control).visible = k == id
		(_page_tabs[k] as Button).button_pressed = k == id
	_scroll.scroll_vertical = 0


# (the pause menu is below this window and would take the Escape first: this window asks first, as the voice window does)
func _input(event: InputEvent) -> void:
	if not _open:
		return
	if _capturing_key:
		if event is InputEventKey and event.pressed and not event.echo:
			get_viewport().set_input_as_handled()
			var code := int((event as InputEventKey).physical_keycode)
			if code == KEY_ESCAPE:
				_capturing_key = false
				_ptt_note.text = ""
			else:
				var problem := Settings.ptt_key_problem(code)
				if problem == "" or code == Settings.ptt_key:
					Settings.set_ptt_key(code)
					_capturing_key = false
					_ptt_note.text = ""
				else:
					_ptt_note.text = Strings.t("pttTaken" if problem == "taken" else "pttNone") # (still waiting: try another, or Esc)
			sync()
		return
	if Time.get_ticks_msec() - _opened_at > 250 and (event.is_action_pressed("menu") or event.is_action_pressed("ui_cancel")):
		close()
		get_viewport().set_input_as_handled()


func _unhandled_input(_event: InputEvent) -> void:
	pass # (everything is in _input)


# ---------------------------------------------------------------------------
# Pieces


func _heading(parent: Control, text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 20)
	l.add_theme_color_override("font_color", GOLD)
	parent.add_child(l)
	return l


func _note(parent: Control, text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 14)
	l.modulate = Color(1, 1, 1, 0.75)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(300, 0)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l


## A row of exclusive choices; `on_pick(id)` gets the id. Returns the buttons by id; `current` says which is lit.
func _choice_row(parent: Control, options: Array, on_pick: Callable, current: Callable, buttons: Dictionary) -> HFlowContainer:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 6)
	parent.add_child(row)
	for o in options:
		var id: String = str(o[0])
		var b := make_button(str(o[1]), func() -> void:
			on_pick.call(id)
			sync(), "pick:" + id)
		b.toggle_mode = true
		b.custom_minimum_size = Vector2(110, 40)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(b)
		buttons[id] = b
	_syncs.append(func() -> void:
		var now: String = str(current.call())
		for id in buttons.keys():
			(buttons[id] as Button).set_pressed_no_signal(id == now))
	return row


func _check(parent: Control, text: String, get_value: Callable, set_value: Callable) -> CheckButton:
	var c := CheckButton.new()
	c.text = text
	c.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	c.focus_mode = Control.FOCUS_ALL
	c.toggled.connect(func(on: bool) -> void:
		set_value.call(on)
		sync())
	parent.add_child(c)
	_syncs.append(func() -> void: c.set_pressed_no_signal(bool(get_value.call())))
	return c


## A slider with a name; the volume sliders go 0 to 1 in twentieths.
func _slider(parent: Control, text: String, get_value: Callable, set_value: Callable, lo := 0.0, hi := 1.0, step := 0.05) -> HSlider:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(l)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.custom_minimum_size = Vector2(0, 30)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.value_changed.connect(func(v: float) -> void: set_value.call(v))
	parent.add_child(s)
	_syncs.append(func() -> void: s.set_value_no_signal(float(get_value.call())))
	return s


# ---------------------------------------------------------------------------
# Bild


func _build_picture(box: VBoxContainer) -> void:
	_heading(box, Strings.t("settingsQuality"))
	var presets: Array = []
	for p in Quality.ORDER:
		presets.append([p, Quality.label_of(p)])
	_choice_row(box, presets, func(p: String) -> void: Quality.set_preset(p), func() -> String: return Quality.preset, _preset_buttons)
	_preset_hint = _note(box, "")
	_syncs.append(func() -> void: _preset_hint.text = Quality.hint_of(Quality.preset))
	_heading(box, Strings.t("settingsEffects"))
	_note(box, Strings.t("settingsEffectsHint"))
	for id in Quality.TOGGLE_ORDER:
		_toggle_checks[id] = _check(box, Strings.t("fx" + id.capitalize()), func() -> bool: return Settings.effect_on(id), func(on: bool) -> void: Settings.set_effect(id, on))
	var reset := make_button(Strings.t("settingsEffectsReset"), func() -> void:
		Settings.clear_effect_overrides()
		Settings.save()
		Quality.effects_changed()
		sync(), "fx_reset")
	box.add_child(reset)
	_heading(box, Strings.t("settingsWindow"))
	_choice_row(box, [["window", Strings.t("windowWindowed")], ["fullscreen", Strings.t("windowFullscreen")]],
		func(m: String) -> void: Settings.set_window_mode(m), func() -> String: return Settings.window_mode, _window_buttons)
	_res_slider = _slider(box, Strings.t("settingsResolution"), func() -> float: return Settings.res_scale, func(v: float) -> void:
		Settings.set_res_scale(v)
		_res_label.text = "%d %%" % int(round(Settings.res_scale * 100.0)), 0.5, 1.0, 0.1)
	_res_label = Label.new()
	box.add_child(_res_label)
	_syncs.append(func() -> void: _res_label.text = "%d %%" % int(round(Settings.res_scale * 100.0)))
	_note(box, Strings.t("resolutionHint"))
	_fps_check = _check(box, Strings.t("settingsFps"), func() -> bool: return Settings.show_fps, func(on: bool) -> void:
		Settings.show_fps = on
		Settings.save()
		fps_changed.emit(on))


# ---------------------------------------------------------------------------
# Ljud


func _build_sound(box: VBoxContainer) -> void:
	_master = _slider(box, Strings.t("settingsVolumeMaster"), func() -> float: return Settings.master_volume, func(v: float) -> void: Settings.set_master_volume(v))
	_effects = _slider(box, Strings.t("settingsVolumeEffects"), func() -> float: return Settings.effects_volume, func(v: float) -> void: Settings.set_effects_volume(v))
	_heading(box, Strings.t("settingsWorldSound"))
	_steps_check = _check(box, Strings.t("settingsSteps"), func() -> bool: return Settings.steps_on, func(on: bool) -> void:
		Settings.steps_on = on
		Settings.save())
	_ambience_check = _check(box, Strings.t("settingsAmbience"), func() -> bool: return Settings.ambience_on, func(on: bool) -> void:
		Settings.ambience_on = on
		Settings.save())
	_world = _slider(box, Strings.t("settingsWorldVolume"), func() -> float: return Settings.world_volume, func(v: float) -> void: Settings.set_world_volume(v))
	if Voice.available:
		_voice = _slider(box, Strings.t("settingsVolumeVoice"), func() -> float: return Settings.voice_volume, func(v: float) -> void: Voice.set_volume(v))


# ---------------------------------------------------------------------------
# Läsa och se


func _build_reading(box: VBoxContainer) -> void:
	_heading(box, Strings.t("settingsTextSize"))
	var sizes: Array = []
	for s in Settings.UI_SCALES:
		sizes.append([str(s), "%d %%" % int(round(float(s) * 100.0))])
	_choice_row(box, sizes, func(id: String) -> void: Settings.set_ui_scale(float(id)), func() -> String: return str(Settings.ui_scale), _size_buttons)
	_note(box, Strings.t("textSizeHint"))
	_size_sample = Label.new()
	_size_sample.text = "Bärsärkaraseri  ·  Frostjättens borg"
	_size_sample.add_theme_font_size_override("font_size", 22)
	_size_sample.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_size_sample)
	_heading(box, Strings.t("settingsColours"))
	_choice_row(box, [["normal", Strings.t("coloursNormal")], ["rg", Strings.t("coloursRg")], ["tritan", Strings.t("coloursTritan")]],
		func(m: String) -> void: Settings.set_colour_mode(m), func() -> String: return Settings.colour_mode, _colour_buttons)
	_colour_hint = _note(box, "")
	_syncs.append(func() -> void: _colour_hint.text = Strings.t({"normal": "coloursNormalHint", "rg": "coloursRgHint", "tritan": "coloursTritanHint"}[Settings.colour_mode]))
	_pattern_check = _check(box, Strings.t("settingsPattern"), func() -> bool: return Palette.pattern(), func(on: bool) -> void: Settings.set_danger_pattern(on))
	_syncs.append(func() -> void: _pattern_check.disabled = Settings.colour_mode != "normal") # (a colour-blind palette always has the stripes: shown on, not to be switched off)
	_preview = Preview.new()
	_preview.custom_minimum_size = Vector2(0, 150)
	_preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_child(_preview)
	Settings.access_changed.connect(_preview.queue_redraw)
	_motion_check = _check(box, Strings.t("settingsReduceMotion"), func() -> bool: return Settings.reduce_motion, func(on: bool) -> void: Settings.set_reduce_motion(on))


# ---------------------------------------------------------------------------
# Styrning


func _build_controls(box: VBoxContainer) -> void:
	_heading(box, Strings.t("settingsSpells"))
	_choice_row(box, [["buttons", Strings.t("spellsButtons")], ["wheel", Strings.t("spellsWheel")]],
		func(mode: String) -> void:
			Settings.spell_input = mode
			Settings.save(), func() -> String: return Settings.spell_input, _spell_buttons)
	_spell_hint = _note(box, "")
	_syncs.append(func() -> void: _spell_hint.text = Strings.t("spellsButtonsHint" if Settings.spell_input == "buttons" else "spellsWheelHint"))
	_heading(box, Strings.t("settingsPtt"))
	_ptt_button = make_button("", func() -> void:
		_capturing_key = true
		sync(), "ptt_key")
	box.add_child(_ptt_button)
	_ptt_note = _note(box, "")
	_ptt_note.add_theme_color_override("font_color", BAD)
	_ptt_note.modulate = Color.WHITE
	_syncs.append(func() -> void: _ptt_button.text = Strings.t("pttPress") if _capturing_key else "%s  ·  %s" % [Settings.ptt_key_name(), Strings.t("pttChange")])


## The sample under the colour choice: a mark of danger (striped when stripes are on), a safe place, and the hearts at full, half
## and nearly empty, in the colours the choice gives.
class Preview extends Control:
	func _draw() -> void:
		var w := size.x
		var h := size.y
		var pad := 6.0
		var danger := Rect2(pad, pad, w * 0.3, h - 2.0 * pad)
		var safe := Rect2(w * 0.3 + 2.0 * pad, pad, w * 0.22, h - 2.0 * pad)
		draw_rect(Rect2(0, 0, w, h), Color(0.12, 0.1, 0.09))
		var base := Palette.colour("danger_fill")
		draw_rect(danger, Color(base.r, base.g, base.b, 0.5))
		if Palette.pattern():
			var stripe := Palette.colour("stripe")
			var step := 22.0
			var x := danger.position.x - danger.size.y
			while x < danger.end.x:
				var a := Vector2(x, danger.end.y)
				var b := Vector2(x + danger.size.y, danger.position.y)
				var p := _clip(a, b, danger)
				if p.size() == 2:
					draw_line(p[0], p[1], Color(stripe.r, stripe.g, stripe.b, 0.85), 5.0)
				x += step
			draw_rect(danger, Palette.colour("danger_edge"), false, 5.0)
		else:
			draw_rect(danger, Palette.colour("danger_edge"), false, 2.0)
		var font := ThemeDB.fallback_font
		draw_string(font, danger.position + Vector2(10, danger.size.y / 2.0 + 8.0), Strings.t("previewDanger"), HORIZONTAL_ALIGNMENT_LEFT, danger.size.x - 20.0, 22, Color.WHITE)
		var sc := Palette.colour("safe")
		draw_rect(safe, Color(sc.r, sc.g, sc.b, 0.45))
		draw_rect(safe, sc, false, 2.0)
		draw_string(font, safe.position + Vector2(8, safe.size.y / 2.0 + 6.0), Strings.t("previewSafe"), HORIZONTAL_ALIGNMENT_LEFT, safe.size.x - 16.0, 16, Color.WHITE)
		var x0 := w * 0.52 + 3.0 * pad
		var bar_w := w - x0 - pad
		var names := [Strings.t("previewHealthFull"), Strings.t("previewHealthHalf"), Strings.t("previewHealthLow")]
		var ks := [1.0, 0.45, 0.15]
		for i in range(3):
			var y := pad + i * (h - 2.0 * pad) / 3.0
			var bh := (h - 2.0 * pad) / 3.0 - 6.0
			draw_rect(Rect2(x0, y, bar_w, bh), Color(0.08, 0.06, 0.06))
			draw_rect(Rect2(x0, y, bar_w * ks[i], bh), Palette.hp(ks[i]))
			draw_string(font, Vector2(x0 + 6.0, y + bh - 4.0), names[i], HORIZONTAL_ALIGNMENT_LEFT, bar_w - 8.0, 14, Color.WHITE)

	## The part of the segment a-b inside the rectangle.
	static func _clip(a: Vector2, b: Vector2, r: Rect2) -> Array:
		var t0 := 0.0
		var t1 := 1.0
		var d := b - a
		for pair in [[-d.x, a.x - r.position.x], [d.x, r.end.x - a.x], [-d.y, a.y - r.position.y], [d.y, r.end.y - a.y]]:
			var p: float = pair[0]
			var q: float = pair[1]
			if absf(p) < 0.0001:
				if q < 0.0:
					return []
			else:
				var t := q / p
				if p < 0.0:
					t0 = maxf(t0, t)
				else:
					t1 = minf(t1, t)
		if t0 >= t1:
			return []
		return [a + d * t0, a + d * t1]
