class_name SettingsCheck
extends Node
## `--settingscheck`: a headless run of the settings window (M8b), cheap and without a server. It opens the window from the pause menu,
## changes every setting through the window's own controls (a button pressed, a slider moved, a key sent), and for each asserts
## that it is kept in Settings, written to the settings file and applied (the preset's scale, the audio buses, the content scale, the
## input map, the palette), then puts everything back as it was. Prints `settingscheck: ok/FAIL ...` lines and a last
## `settingscheck: all ok` (or the number that failed); tools/bot-check.mts and the workflow read them.
##
##   godot --headless --path packages/godot -- --settingscheck [--shot=<dir>]   (--shot: pictures of the window; needs a window)

var _failed := 0
var _saved: Dictionary = {}
var menu: PauseMenu
var win: SettingsWindow
var shot_dir := ""


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot_dir = arg.substr(7)
	_run()


func _step(name_: String, ok: bool, detail := "") -> bool:
	print("settingscheck: %s %s %s" % ["ok  " if ok else "FAIL", name_, detail])
	if not ok:
		_failed += 1
	return ok


func _frames(n := 2) -> void:
	for i in range(n):
		await get_tree().process_frame


## What the settings file says now, read fresh from disk.
func _on_disk(section: String, key: String, fallback: Variant = null) -> Variant:
	var cfg := ConfigFile.new()
	if cfg.load(Settings.FILE) != OK:
		return fallback
	return cfg.get_value(section, key, fallback)


func _remember() -> void:
	_saved = {
		"quality": Quality.preset, "effects": Settings.effect_overrides.duplicate(), "window": Settings.window_mode, "res": Settings.res_scale,
		"fps": Settings.show_fps, "master": Settings.master_volume, "effects_v": Settings.effects_volume, "world": Settings.world_volume,
		"voice": Settings.voice_volume, "steps": Settings.steps_on, "ambience": Settings.ambience_on, "ui": Settings.ui_scale,
		"colours": Settings.colour_mode, "pattern": Settings.danger_pattern, "motion": Settings.reduce_motion,
		"spells": Settings.spell_input, "ptt": Settings.ptt_key,
	}


func _restore() -> void:
	Quality.set_preset(_saved["quality"])
	Settings.effect_overrides = _saved["effects"]
	Settings.set_window_mode(_saved["window"])
	Settings.set_res_scale(_saved["res"])
	Settings.show_fps = _saved["fps"]
	Settings.set_master_volume(_saved["master"])
	Settings.set_effects_volume(_saved["effects_v"])
	Settings.set_world_volume(_saved["world"])
	Settings.voice_volume = _saved["voice"]
	Settings.steps_on = _saved["steps"]
	Settings.ambience_on = _saved["ambience"]
	Settings.set_ui_scale(_saved["ui"])
	Settings.colour_mode = _saved["colours"]
	Settings.danger_pattern = _saved["pattern"]
	Settings.reduce_motion = _saved["motion"]
	Settings.spell_input = _saved["spells"]
	Settings.set_ptt_key(_saved["ptt"])
	Settings.save()


func _press(buttons: Dictionary, id: String) -> void:
	(buttons[id] as Button).pressed.emit()


## A button of a choice row is pressed the way a click does it: the toggle flips, then `pressed` fires.
func _click(b: Button) -> void:
	b.button_pressed = true
	b.pressed.emit()


func _run() -> void:
	await _frames(3)
	_remember()
	menu = PauseMenu.new()
	menu.name = "PauseMenu"
	add_child(menu)
	await _frames()
	menu.open()
	win = menu.open_settings()
	await _frames()
	_step("the settings window opens from the pause menu", win.is_open() and win.visible and menu.visible)
	_step("it has four pages", win.PAGES.size() == 4 and win._page_tabs.size() == 4)
	_picture()
	_sound()
	await _reading()
	_colours()
	_motion()
	_controls()
	_run_only()
	_roundtrip()
	if shot_dir != "":
		await _shots()
	win.close()
	_restore()
	_step("everything is put back", Quality.preset == _saved["quality"] and Settings.ui_scale == _saved["ui"] and Settings.colour_mode == _saved["colours"])
	print("settingscheck: all ok" if _failed == 0 else "settingscheck: %d FAILED" % _failed)
	(get_tree().current_scene as Main).quit_clean(1 if _failed > 0 else 0)


# ---------------------------------------------------------------------------


func _picture() -> void:
	win._show_page("picture")
	# the quality preset: each button, with the viewport's scale and the file
	var scales: Array = []
	for p in Quality.ORDER:
		_press(win._preset_buttons, p)
		var vp := get_viewport()
		scales.append(vp.scaling_3d_scale)
		_step("preset %s: kept, saved and applied" % p, Quality.preset == p and Settings.quality == p and _on_disk("graphics", "quality") == p and is_equal_approx(vp.scaling_3d_scale, Quality.scale_for(Vector2(get_window().size))), "scale %.2f" % vp.scaling_3d_scale)
		_step("preset %s: the hint is shown" % p, win._preset_hint.text == Quality.hint_of(p))
	# the effects: each toggle off, then on, on every preset that matters
	_press(win._preset_buttons, "mellan")
	for id in Quality.TOGGLE_ORDER:
		var c: CheckButton = win._toggle_checks[id]
		_step("effect %s is on in Mellan" % id, c.button_pressed and Settings.effect_on(id))
		c.button_pressed = false
		var keys: Array = Quality.TOGGLES[id]
		var zero := true
		for k in keys:
			zero = zero and int(Quality.alive(k)) == 0
		_step("effect %s: off is kept, saved and applied" % id, not Settings.effect_on(id) and zero and _on_disk("effects", id) == false, "keys %s" % str(keys))
		c.button_pressed = true
		var back := true
		for k in keys:
			back = back and int(Quality.alive(k)) == int(Quality.PRESETS["mellan"].get(k, 0))
		_step("effect %s: on again is the preset's own" % id, Settings.effect_on(id) and back and _on_disk("effects", id) == true)
	# a switch announces itself lightly: `effects_updated`, never `changed` (which would rebuild the world and drop a fight)
	var heavy: Array = []
	var light: Array = []
	var on_changed := func(_p: String) -> void: heavy.append(1)
	var on_light := func() -> void: light.append(1)
	Quality.changed.connect(on_changed)
	Quality.effects_updated.connect(on_light)
	win._toggle_checks["weather"].button_pressed = false
	win._toggle_checks["weather"].button_pressed = true
	_step("an effect switch is announced lightly and never as a preset change", light.size() == 2 and heavy.is_empty(), "light %d heavy %d" % [light.size(), heavy.size()])
	Quality.changed.disconnect(on_changed)
	Quality.effects_updated.disconnect(on_light)
	# Låg: the weather switch says on (the maps have rain there), and un- and re-ticking it never gives the dungeons weather
	_press(win._preset_buttons, "lag")
	_step("Låg: the weather switch starts on, dungeon weather is none", Settings.effect_on("weather") and Quality.dungeon_budget(3) == 0)
	win._toggle_checks["weather"].button_pressed = false
	win._toggle_checks["weather"].button_pressed = true
	_step("Låg: off and on again leaves dungeon weather at none", Quality.dungeon_budget(3) == 0 and Quality.dungeon_budget(4) == 0 and Quality.alive("sky_weather") == 150)
	_press(win._preset_buttons, "mellan")
	_step("Mellan: the weather switch governs the dungeons too", Quality.dungeon_budget(3) == 200 and (win._toggle_checks["weather"] as CheckButton).button_pressed)
	# a Låg player can switch the wind's gusts on (Mellan's level), and picking a preset clears the hand-made choices
	_press(win._preset_buttons, "lag")
	win._toggle_checks["water"].button_pressed = true
	_step("effect water switched on in Låg gets Mellan's level", Quality.alive("water") == int(Quality.PRESETS["mellan"]["water"]))
	_press(win._preset_buttons, "hog")
	_step("a preset clears the hand-made effects", Settings.effect_overrides.is_empty() and Quality.alive("water") == int(Quality.PRESETS["hog"]["water"]))
	_press(win._preset_buttons, "mellan")
	# window mode
	_press(win._window_buttons, "fullscreen")
	var fs_ok: bool = Settings.window_mode == "fullscreen" and _on_disk("graphics", "window") == "fullscreen"
	if DisplayServer.get_name() != "headless":
		fs_ok = fs_ok and DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
	_step("window mode fullscreen: kept, saved and applied", fs_ok)
	_press(win._window_buttons, "window")
	_step("window mode back to a window", Settings.window_mode == "window" and (DisplayServer.get_name() == "headless" or DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_WINDOWED))
	# the resolution scale
	var before := Quality.scale_for(Vector2(1280, 720))
	win._res_slider.value = 0.6
	var after := Quality.scale_for(Vector2(1280, 720))
	_step("resolution scale 60 %: kept, saved and applied", is_equal_approx(Settings.res_scale, 0.6) and is_equal_approx(float(_on_disk("graphics", "res_scale", 0.0)), 0.6) and after < before and is_equal_approx(get_viewport().scaling_3d_scale, Quality.scale_for(Vector2(get_window().size))), "%.2f -> %.2f" % [before, after])
	win._res_slider.value = 1.0
	# the frame rate
	var fps_seen: Array = []
	win.fps_changed.connect(func(on: bool) -> void: fps_seen.append(on))
	win._fps_check.button_pressed = not Settings.show_fps
	_step("the frame rate toggle: kept, saved and announced", fps_seen.size() == 1 and fps_seen[0] == Settings.show_fps and _on_disk("graphics", "fps") == Settings.show_fps)


func _sound() -> void:
	win._show_page("sound")
	var bus_db := func(bus: String) -> float: return AudioServer.get_bus_volume_db(AudioServer.get_bus_index(bus))
	win._master.value = 0.5
	_step("master volume 50 %: kept, saved and applied to the Master bus", is_equal_approx(Settings.master_volume, 0.5) and is_equal_approx(float(_on_disk("sound", "master", 0.0)), 0.5) and absf(bus_db.call("Master") - linear_to_db(0.5)) < 0.01)
	win._master.value = 0.0
	_step("master volume 0 mutes the Master bus", AudioServer.is_bus_mute(0))
	win._master.value = 1.0
	win._effects.value = 0.25
	_step("effects volume 25 %: kept, saved and applied to its own bus", is_equal_approx(Settings.effects_volume, 0.25) and is_equal_approx(float(_on_disk("sound", "effects", 0.0)), 0.25) and absf(bus_db.call(Settings.EFFECT_AUDIO_BUS) - linear_to_db(0.25)) < 0.01)
	_step("Sfx plays on that bus", Sfx.get_child(0) is AudioStreamPlayer and (Sfx.get_child(0) as AudioStreamPlayer).bus == Settings.EFFECT_AUDIO_BUS)
	win._effects.value = 1.0
	win._world.value = 0.3
	_step("world volume 30 %: kept and saved", is_equal_approx(Settings.world_volume, 0.3) and is_equal_approx(float(_on_disk("sound", "volume", 0.0)), 0.3))
	win._steps_check.button_pressed = not Settings.steps_on
	win._ambience_check.button_pressed = not Settings.ambience_on
	_step("steps and ambience toggles: kept and saved", Settings.steps_on == (_on_disk("sound", "steps") == true) and Settings.ambience_on == (_on_disk("sound", "ambience") == true) and Settings.steps_on != _saved["steps"] and Settings.ambience_on != _saved["ambience"])
	if win._voice != null:
		win._voice.value = 0.4
		_step("voice volume: kept and saved", is_equal_approx(Settings.voice_volume, 0.4) and is_equal_approx(float(_on_disk("voice", "volume", 0.0)), 0.4))
	else:
		_step("voice volume: no slider without the webrtc extension (skipped)", true)


func _reading() -> void:
	win._show_page("reading")
	await _frames()
	# the text size: each button; the content scale of the window, the labels over heads, the saved value
	var window_was := get_window().size
	get_window().size = Vector2i(1280, 720) # (the default 1280 x 720 of the real game; a headless window starts square)
	await _frames()
	var tag := Label3D.new()
	add_child(tag)
	Settings.scaled_label(tag, 0.005)
	var hud := HudLayer.new()
	add_child(hud)
	for pct in [125, 150, 175, 100]:
		var v: float = pct / 100.0
		_click(win._size_buttons[str(v)])
		await _frames()
		_step("text size %d %%: kept, saved and applied to the window" % pct, is_equal_approx(Settings.ui_scale, v) and is_equal_approx(get_window().content_scale_factor, v) and is_equal_approx(float(_on_disk("access", "ui_scale", 0.0)), v))
		_step("text size %d %%: the labels over heads follow" % pct, is_equal_approx(tag.pixel_size, 0.005 * v))
		var view := get_viewport().get_visible_rect().size
		_step("text size %d %%: the window's body fits the screen (%s)" % [pct, str(view)], win._scroll.custom_minimum_size.y + 240.0 <= view.y or is_equal_approx(win._scroll.custom_minimum_size.y, 110.0))
		var narrow := view.x < 1050.0
		var boss_left: float = view.x * hud._top.anchor_left + hud._top.offset_left
		_step("text size %d %%: the boss bar keeps clear of the left column" % pct, (not narrow and hud._top.anchor_left == 0.5) or boss_left >= 327.0)
	# the middle of the screen at 125-175 %: a banner, a toast and the fallen box are all up at once, as when everyone falls
	hud.banner_label.text = "Alla föll…"
	hud.banner_sub.text = "Ni vaknar vid vilostenen. Försök igen!"
	hud.toast_label.text = "Gravvaktaren: Ingen stör kungens sömn!"
	hud.down_box.visible = true
	var hidden: Array = []
	hud.centre_busy.connect(func(on: bool) -> void: hidden.append(on))
	for pct in [125, 150, 175]:
		_click(win._size_buttons[str(pct / 100.0)])
		await _frames(3)
		var banner: Rect2 = hud.banner_label.get_global_rect().merge(hud.banner_sub.get_global_rect())
		var toast: Rect2 = hud.toast_label.get_global_rect()
		var fallen: Rect2 = hud.down_box.get_global_rect()
		var inside := get_viewport().get_visible_rect().grow(1.0)
		_step("text size %d %%: banner, toast and the fallen box are stacked, not overlapping, all on screen" % pct,
			banner.end.y <= toast.position.y + 1.0 and toast.end.y <= fallen.position.y + 1.0 and inside.encloses(banner) and inside.encloses(toast) and inside.encloses(fallen),
			"banner %s toast %s fallen %s" % [str(banner), str(toast), str(fallen)])
		_step("text size %d %%: the spell bar steps aside while fallen" % pct, hud.spell_bar.modulate.a == 0.0)
	_step("the chat feed was asked to make room", hidden.has(true))
	_click(win._size_buttons["1.0"])
	await _frames(3)
	_step("at 100 % nothing of that is hidden or moved", hud.spell_bar.modulate.a == 1.0 and is_equal_approx(hud.banner_label.get_parent().anchor_top, 0.22), "bar %s anchor %s view %s" % [hud.spell_bar.modulate.a, hud.banner_label.get_parent().anchor_top, get_viewport().get_visible_rect().size])
	hud.queue_free()
	tag.queue_free()
	get_window().size = window_was


## The colour choice: each palette through its button, what it changes, and that danger, safe and the hearts stay apart for the
## people it is for (the simulated distances of Palette.distance_under).
func _colours() -> void:
	win._show_page("reading")
	_step("the normal palette is the look the client always had", Palette.colour("danger_fill", "normal") == Color(0.95, 0.12, 0.05) and Palette.colour("hp_high", "normal") == HudLayer.HP_GREEN and Palette.colour("hp_mid", "normal") == HudLayer.HP_YELLOW and Palette.colour("hp_low", "normal") == HudLayer.HP_RED and Palette.colour("foe", "normal") == Color(0.95, 0.3, 0.25))
	_click(win._colour_buttons["normal"])
	_step("palette normal: no stripes by itself, hp colours as ever", Settings.colour_mode == "normal" and not Palette.pattern() and HudLayer.hp_colour(0.9) == HudLayer.HP_GREEN and HudLayer.hp_colour(0.1) == HudLayer.HP_RED)
	for pair in [["rg", ["deut", "prot"]], ["tritan", ["trit"]]]:
		var mode: String = pair[0]
		_click(win._colour_buttons[mode])
		_step("palette %s: kept, saved, and the stripes come on with it" % mode, Settings.colour_mode == mode and _on_disk("access", "colours") == mode and Palette.pattern() and not Settings.danger_pattern and win._pattern_check.button_pressed and win._pattern_check.disabled)
		_step("palette %s: hearts and the danger mark change" % mode, HudLayer.hp_colour(0.9) != HudLayer.HP_GREEN and Palette.colour("danger_fill") != Palette.colour("danger_fill", "normal"))
		for kind in pair[1]:
			var hi := Palette.hp(0.9)
			var mid := Palette.hp(0.4)
			var lo := Palette.hp(0.1)
			var d_hm := Palette.distance_under(hi, mid, kind)
			var d_hl := Palette.distance_under(hi, lo, kind)
			var d_ml := Palette.distance_under(mid, lo, kind)
			_step("palette %s under %s: full, half and low hearts are told apart" % [mode, kind], minf(d_hm, minf(d_hl, d_ml)) >= 25.0, "%.0f %.0f %.0f" % [d_hm, d_hl, d_ml])
			var d_ds := Palette.distance_under(Palette.colour("danger_fill"), Palette.colour("safe"), kind)
			var d_foe := Palette.distance_under(Palette.colour("foe"), Palette.colour("target"), kind)
			_step("palette %s under %s: danger and a safe place are told apart" % [mode, kind], d_ds >= 60.0 and d_foe >= 25.0, "%.0f, foe vs target %.0f" % [d_ds, d_foe])
	# the old palette does not pass for the people it was never for (so the test can fail)
	_step("the normal hearts are not enough for red-green blindness", Palette.distance_under(Palette.hp(0.9, "normal"), Palette.hp(0.1, "normal"), "deut") < 25.0)
	# back to the normal palette: no stripes of their own are left behind, and the checkbox is free again
	_click(win._colour_buttons["rg"])
	_click(win._colour_buttons["normal"])
	_step("rg back to normal: the stripes are gone, the checkbox is free and off", not Palette.pattern() and not Settings.danger_pattern and _on_disk("access", "pattern") == false and not win._pattern_check.disabled and not win._pattern_check.button_pressed)
	# stripes by hand in the normal palette, and off again
	win._pattern_check.button_pressed = true
	_step("stripes can be switched on by hand: kept, saved", Palette.pattern() and _on_disk("access", "pattern") == true)
	win._pattern_check.button_pressed = false
	_step("and off", not Palette.pattern())


## Less shaking and flashing: the checkbox, the file, and what reads it (the camera's shake, the lightning, the landings' glow).
func _motion() -> void:
	win._show_page("reading")
	win._motion_check.button_pressed = true
	_step("less shaking and flashing: kept and saved", Settings.reduce_motion and _on_disk("access", "reduce_motion") == true)
	_step("the shake and the lightning are 0, the landing glow a third", Settings.calm(0.7) == 0.0 and Settings.calm(1.0) == 0.0 and is_equal_approx(FxView._glare(), 0.35))
	win._motion_check.button_pressed = false
	_step("and back: shake and flash as they were", Settings.calm(0.7) == 0.7 and FxView._glare() == 1.0 and _on_disk("access", "reduce_motion") == false)


func _controls() -> void:
	win._show_page("controls")
	var other := "wheel" if Settings.spell_input == "buttons" else "buttons"
	_click(win._spell_buttons[other])
	_step("gamepad layout %s: kept, saved, hint changed" % other, Settings.spell_input == other and _on_disk("input", "spells") == other and win._spell_hint.text == Strings.t("spellsWheelHint" if other == "wheel" else "spellsButtonsHint"))
	# the push-to-talk key: the button waits for a key, the next key becomes the action's event, Escape cancels
	win._ptt_button.pressed.emit()
	_step("the key button waits for a key", win._capturing_key and win._ptt_button.text == Strings.t("pttPress"))
	var ev := InputEventKey.new()
	ev.physical_keycode = KEY_F5
	ev.pressed = true
	win._input(ev)
	var mapped := false
	for e in InputMap.action_get_events("voice_ptt"):
		mapped = mapped or (e is InputEventKey and (e as InputEventKey).physical_keycode == KEY_F5)
	_step("push-to-talk key F5: kept, saved and applied to the input map", Settings.ptt_key == KEY_F5 and int(_on_disk("input", "ptt_key", 0)) == KEY_F5 and mapped and InputMap.action_get_events("voice_ptt").size() == 1 and not win._capturing_key)
	_step("the key is named", Settings.ptt_key_name().contains("F5"), Settings.ptt_key_name())
	# keys that cannot be it are refused with a note, and the capture goes on: another action's key, W, and no key at all
	for bad in [[KEY_W, "taken"], [KEY_E, "taken"], [KEY_1, "taken"], [KEY_ENTER, "taken"], [KEY_NONE, "none"]]:
		win._ptt_button.pressed.emit()
		var bad_ev := InputEventKey.new()
		bad_ev.physical_keycode = bad[0]
		bad_ev.pressed = true
		win._input(bad_ev)
		var note_ok: bool = win._ptt_note.text == Strings.t("pttTaken" if bad[1] == "taken" else "pttNone")
		_step("push-to-talk key %s is refused (%s) with a note, the old key stays, and it keeps waiting" % [OS.get_keycode_string(bad[0]) if bad[0] != KEY_NONE else "none", bad[1]], Settings.ptt_key == KEY_F5 and note_ok and win._capturing_key and Settings.ptt_key_problem(bad[0]) == bad[1])
		win._capturing_key = false
	_step("a free key is fine", Settings.ptt_key_problem(KEY_F6) == "" and Settings.ptt_key_problem(KEY_C) == "")
	win._ptt_button.pressed.emit()
	var esc := InputEventKey.new()
	esc.physical_keycode = KEY_ESCAPE
	esc.pressed = true
	win._input(esc)
	_step("Escape cancels the capture, clears the note and keeps the key", Settings.ptt_key == KEY_F5 and not win._capturing_key and win.is_open() and win._ptt_note.text == "")


## A new start: the values read back from the file are the ones in memory.
## Command-line flags are for one run: they change what is in use, never what is written, however many other settings are saved.
func _run_only() -> void:
	Settings.save()
	var before := FileAccess.get_file_as_string(Settings.FILE)
	for flag in ["--ui-scale=1.75", "--colours=rg", "--pattern", "--reduce-motion", "--res-scale=0.5"]:
		_step("flag %s is a run-only override" % flag, Settings.apply_run_only(flag))
	_step("the flags are in use", Settings.ui_scale == 1.75 and Settings.colour_mode == "rg" and Settings.danger_pattern and Settings.reduce_motion and Settings.res_scale == 0.5)
	Settings.show_fps = not Settings.show_fps # (any other setting saved later: F3, the login screen, a setter, the window closing)
	Settings.save()
	Settings.show_fps = not Settings.show_fps
	Settings.set_master_volume(Settings.master_volume)
	win.close()
	win.open_window()
	var after := FileAccess.get_file_as_string(Settings.FILE)
	var cfg_before := ConfigFile.new()
	var cfg_after := ConfigFile.new()
	cfg_before.parse(before)
	cfg_after.parse(after)
	var same := true
	for sec_key in [["access", "ui_scale"], ["access", "colours"], ["access", "pattern"], ["access", "reduce_motion"], ["graphics", "res_scale"]]:
		same = same and cfg_before.get_value(sec_key[0], sec_key[1]) == cfg_after.get_value(sec_key[0], sec_key[1])
	_step("saving other settings leaves the flagged ones in settings.cfg as they were", same, "%s" % str(cfg_after.get_value("access", "ui_scale")))
	Settings.set_ui_scale(1.25)
	_step("the player's own choice ends the override and is saved", _on_disk("access", "ui_scale") == 1.25 and Settings.ui_scale == 1.25)
	Settings._run_only.clear()
	Settings.colour_mode = _saved["colours"]
	Settings.danger_pattern = _saved["pattern"]
	Settings.reduce_motion = _saved["motion"]
	Settings.res_scale = _saved["res"]
	Settings.set_ui_scale(_saved["ui"])


func _roundtrip() -> void:
	Settings.save()
	var mem := {"ui": Settings.ui_scale, "res": Settings.res_scale, "master": Settings.master_volume, "world": Settings.world_volume, "mode": Settings.window_mode}
	Settings.ui_scale = 0.0
	Settings.res_scale = 0.0
	Settings.master_volume = 0.123
	Settings._load()
	_step("a restart reads everything back", Settings.ui_scale == mem["ui"] and Settings.res_scale == mem["res"] and is_equal_approx(Settings.master_volume, float(mem["master"])) and is_equal_approx(Settings.world_volume, float(mem["world"])) and Settings.window_mode == mem["mode"])


func _shots() -> void:
	pass
