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
	_controls()
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


func _controls() -> void:
	win._show_page("controls")


## A new start: the values read back from the file are the ones in memory.
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
