extends Node
## What this machine remembers, in user://settings.cfg: the server's address, this device's token (the same long
## random token the browser keeps in a cookie; the server stores only its hash), the number to show while a parent
## approves the device, the last character picked, the graphics quality preset (quality.gd) and the world's sound settings.

const FILE := "user://settings.cfg"
const DEFAULT_URL := "https://example.invalid"

var server_url: String = DEFAULT_URL
var token: String = ""
var pending_code: String = ""
var player_id: String = ""
var quality: String = "mellan"
## "buttons": the four spells on X, Y, B and RB (the browser's layout); "wheel": one button opens a radial wheel.
var spell_input: String = "buttons"
var show_fps: bool = false
## Röstprat (voice.gd): ring up when the game starts; "ptt" (hold the key) or "open" (the microphone is always on);
## the microphone on or off; how loud the others are, 0 to 1.
var voice_auto: bool = true
var voice_mode: String = "ptt"
var voice_mic: bool = true
var voice_volume: float = 1.0
## The world's own sounds (M7b): footsteps and the ambience (soundscape.gd), each switchable, and how loud they are, 0 to 1.
var steps_on: bool = true
var ambience_on: bool = true
var world_volume: float = 0.8
## M8b: the master volume over everything, and the dungeon's own sounds (sfx.gd: spells, hits, the HUD's chimes), 0 to 1.
var master_volume: float = 1.0
var effects_volume: float = 1.0
## M8b: "window" or "fullscreen"; how much of the preset's 3D resolution to render (0.5 to 1), the rest is upscaled.
var window_mode: String = "window"
var res_scale: float = 1.0
## M8b: the effects switched by hand over the preset's own: toggle id (see Quality.TOGGLES) -> on or off. A toggle that is not
## here follows the preset; picking a preset clears them.
var effect_overrides: Dictionary = {}
## M8b: the Röstprat key for hold-to-talk, as a physical keycode (C).
var ptt_key: int = KEY_C
## M8b, accessibility: the size of the HUD, the windows and the labels over heads (1, 1.25, 1.5 or 1.75); the colours of danger
## and health ("normal", "rg" for deuteranopia and protanopia, "tritan"); stripes and a thick edge on the marks of coming attacks
## (always on with a colour-blind palette: it is what is drawn when colour is not enough); and no shaking or flashing.
var ui_scale: float = 1.0
var colour_mode: String = "normal"
var danger_pattern: bool = false
var reduce_motion: bool = false

signal ui_scale_changed
signal access_changed ## the colour palette, the stripes or reduced motion changed

const UI_SCALES := [1.0, 1.25, 1.5, 1.75]
const COLOUR_MODES := ["normal", "rg", "tritan"]
const RES_SCALES := [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const EFFECT_AUDIO_BUS := "Effekter"


func _ready() -> void:
	_load()
	_command_line()
	_ensure_buses()
	# (the window and the key map are there from the first frame, but the tree may not be finished: apply on the next frame)
	_apply_all.call_deferred()


## --ui-scale=1.75 --colours=rg|tritan --pattern --reduce-motion --res-scale=0.7: for this run only (pictures and checks). The value in use is
## the flag's; what `save()` writes stays what the file had (`_run_only` remembers it), so nothing here ever reaches settings.cfg, however
## many other settings are saved meanwhile. The player choosing the same setting in the window ends the override: that choice is saved.
var _run_only: Dictionary = {} ## setting -> the persisted value it had before the flag


func _command_line() -> void:
	for arg in OS.get_cmdline_user_args():
		apply_run_only(arg)


## One command-line flag as a run-only override; false when it is not one.
func apply_run_only(arg: String) -> bool:
	if arg.begins_with("--ui-scale="):
		_override("ui_scale", nearest_of(UI_SCALES, float(arg.substr(11))))
	elif arg.begins_with("--colours=") and arg.substr(10) in COLOUR_MODES:
		_override("colour_mode", arg.substr(10))
	elif arg == "--pattern":
		_override("danger_pattern", true)
	elif arg == "--reduce-motion":
		_override("reduce_motion", true)
	elif arg.begins_with("--res-scale="):
		_override("res_scale", nearest_of(RES_SCALES, float(arg.substr(12))))
	else:
		return false
	return true


func _override(setting: String, value: Variant) -> void:
	if not _run_only.has(setting):
		_run_only[setting] = get(setting)
	set(setting, value)


## What goes to the file for `setting`: the persisted value, not a flag's.
func _kept(setting: String) -> Variant:
	return _run_only[setting] if _run_only.has(setting) else get(setting)


func _load() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(FILE) != OK:
		return
	server_url = str(cfg.get_value("server", "url", DEFAULT_URL))
	token = str(cfg.get_value("device", "token", ""))
	pending_code = str(cfg.get_value("device", "pending", ""))
	player_id = str(cfg.get_value("device", "player", ""))
	quality = str(cfg.get_value("graphics", "quality", "mellan"))
	spell_input = str(cfg.get_value("input", "spells", "buttons"))
	show_fps = bool(cfg.get_value("graphics", "fps", false))
	voice_auto = bool(cfg.get_value("voice", "auto", true))
	voice_mode = str(cfg.get_value("voice", "mode", "ptt"))
	voice_mic = bool(cfg.get_value("voice", "mic", true))
	voice_volume = clampf(float(cfg.get_value("voice", "volume", 1.0)), 0.0, 1.0)
	steps_on = bool(cfg.get_value("sound", "steps", true))
	ambience_on = bool(cfg.get_value("sound", "ambience", true))
	world_volume = clampf(float(cfg.get_value("sound", "volume", 0.8)), 0.0, 1.0)
	master_volume = clampf(float(cfg.get_value("sound", "master", 1.0)), 0.0, 1.0)
	effects_volume = clampf(float(cfg.get_value("sound", "effects", 1.0)), 0.0, 1.0)
	window_mode = str(cfg.get_value("graphics", "window", "window"))
	if window_mode != "fullscreen":
		window_mode = "window"
	res_scale = nearest_of(RES_SCALES, float(cfg.get_value("graphics", "res_scale", 1.0)))
	effect_overrides = {}
	for id in cfg.get_section_keys("effects") if cfg.has_section("effects") else PackedStringArray():
		effect_overrides[id] = bool(cfg.get_value("effects", id, true))
	ptt_key = int(cfg.get_value("input", "ptt_key", KEY_C))
	ui_scale = nearest_of(UI_SCALES, float(cfg.get_value("access", "ui_scale", 1.0)))
	colour_mode = str(cfg.get_value("access", "colours", "normal"))
	if not colour_mode in COLOUR_MODES:
		colour_mode = "normal"
	danger_pattern = bool(cfg.get_value("access", "pattern", false))
	reduce_motion = bool(cfg.get_value("access", "reduce_motion", false))


func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("server", "url", server_url)
	cfg.set_value("device", "token", token)
	cfg.set_value("device", "pending", pending_code)
	cfg.set_value("device", "player", player_id)
	cfg.set_value("graphics", "quality", quality)
	cfg.set_value("input", "spells", spell_input)
	cfg.set_value("graphics", "fps", show_fps)
	cfg.set_value("voice", "auto", voice_auto)
	cfg.set_value("voice", "mode", voice_mode)
	cfg.set_value("voice", "mic", voice_mic)
	cfg.set_value("voice", "volume", voice_volume)
	cfg.set_value("sound", "steps", steps_on)
	cfg.set_value("sound", "ambience", ambience_on)
	cfg.set_value("sound", "volume", world_volume)
	cfg.set_value("sound", "master", master_volume)
	cfg.set_value("sound", "effects", effects_volume)
	cfg.set_value("graphics", "window", window_mode)
	cfg.set_value("graphics", "res_scale", _kept("res_scale"))
	for id in effect_overrides.keys():
		cfg.set_value("effects", str(id), bool(effect_overrides[id]))
	cfg.set_value("input", "ptt_key", ptt_key)
	cfg.set_value("access", "ui_scale", _kept("ui_scale"))
	cfg.set_value("access", "colours", _kept("colour_mode"))
	cfg.set_value("access", "pattern", _kept("danger_pattern"))
	cfg.set_value("access", "reduce_motion", _kept("reduce_motion"))
	var err := cfg.save(FILE)
	if err != OK:
		push_warning("could not save %s: %s" % [FILE, error_string(err)])


## "gard.example.se", "http://localhost:8080/" and so on, made into an address the client can use: https unless it
## is this computer (then plain http, like the browser against `pnpm dev`), and no trailing slash.
static func normalize_url(typed: String) -> String:
	var u := typed.strip_edges()
	if u == "":
		return DEFAULT_URL
	if not (u.begins_with("http://") or u.begins_with("https://")):
		var host: String = u.split("/")[0].split(":")[0]
		u = ("http://" if host in ["localhost", "127.0.0.1", "::1"] else "https://") + u
	while u.ends_with("/"):
		u = u.substr(0, u.length() - 1)
	return u


func set_server_url(typed: String) -> void:
	server_url = normalize_url(typed)
	save()


func set_token(new_token: String, pending: String) -> void:
	token = new_token
	pending_code = pending
	save()


func forget_device() -> void:
	token = ""
	pending_code = ""
	player_id = ""
	save()


func http_url(path: String) -> String:
	return server_url + path


## The game socket: wss for https, ws for http (localhost).
func ws_url() -> String:
	var u := server_url
	if u.begins_with("https://"):
		u = "wss://" + u.substr(8)
	elif u.begins_with("http://"):
		u = "ws://" + u.substr(7)
	return u + "/ws"


# ---------------------------------------------------------------------------
# M8b: the settings window's choices. Each setter keeps the value, saves it and applies it at once (no restart); the window
# (settings_window.gd) and the headless check (settings_check.gd) both go through these.


## The member of `list` nearest to `v`.
static func nearest_of(list: Array, v: float) -> float:
	var best: float = list[0]
	for x in list:
		if absf(float(x) - v) < absf(best - v):
			best = float(x)
	return best


func _apply_all() -> void:
	apply_window()
	apply_ui_scale()
	apply_volumes()
	apply_ptt_key()
	Quality.refresh_viewport()


func _ensure_buses() -> void:
	if AudioServer.get_bus_index(EFFECT_AUDIO_BUS) == -1:
		AudioServer.add_bus()
		var i := AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, EFFECT_AUDIO_BUS)
		AudioServer.set_bus_send(i, "Master")


func set_master_volume(v: float) -> void:
	master_volume = clampf(v, 0.0, 1.0)
	save()
	apply_volumes()


func set_effects_volume(v: float) -> void:
	effects_volume = clampf(v, 0.0, 1.0)
	save()
	apply_volumes()


func set_world_volume(v: float) -> void:
	world_volume = clampf(v, 0.0, 1.0)
	save() # (the steps and the ambience read it when they play)


func apply_volumes() -> void:
	_ensure_buses()
	AudioServer.set_bus_volume_db(0, linear_to_db(master_volume))
	AudioServer.set_bus_mute(0, master_volume <= 0.001)
	var i := AudioServer.get_bus_index(EFFECT_AUDIO_BUS)
	if i != -1:
		AudioServer.set_bus_volume_db(i, linear_to_db(effects_volume))
		AudioServer.set_bus_mute(i, effects_volume <= 0.001)


func set_window_mode(mode: String) -> void:
	window_mode = "fullscreen" if mode == "fullscreen" else "window"
	save()
	apply_window()


func apply_window() -> void:
	var want := DisplayServer.WINDOW_MODE_FULLSCREEN if window_mode == "fullscreen" else DisplayServer.WINDOW_MODE_WINDOWED
	if DisplayServer.window_get_mode() != want:
		DisplayServer.window_set_mode(want)


func set_res_scale(v: float) -> void:
	res_scale = nearest_of(RES_SCALES, v)
	_run_only.erase("res_scale")
	save()
	Quality.refresh_viewport()


func set_ui_scale(v: float) -> void:
	ui_scale = nearest_of(UI_SCALES, v)
	_run_only.erase("ui_scale")
	save()
	apply_ui_scale()


func apply_ui_scale() -> void:
	var w := get_window()
	if w != null:
		w.content_scale_factor = ui_scale
	for l in get_tree().get_nodes_in_group("scaled_label3d"):
		if l is Label3D:
			l.pixel_size = float(l.get_meta("base_px", l.pixel_size)) * ui_scale
	ui_scale_changed.emit()


## A Label3D (a name, a bubble, a floating number) whose size follows the UI scale; `base` is its pixel size at 100 %.
func scaled_label(l: Label3D, base: float) -> void:
	l.set_meta("base_px", base)
	l.pixel_size = base * ui_scale
	l.add_to_group("scaled_label3d")


func set_colour_mode(mode: String) -> void:
	colour_mode = mode if mode in COLOUR_MODES else "normal"
	_run_only.erase("colour_mode") # (the stripes of a colour-blind palette are Palette.pattern()'s doing, not a saved choice)
	save()
	access_changed.emit()


func set_danger_pattern(on: bool) -> void:
	danger_pattern = on
	_run_only.erase("danger_pattern")
	save()
	access_changed.emit()


## A shake or a flash of strength `v`, as the player wants to see it: none with "less shaking and flashing".
func calm(v: float) -> float:
	return 0.0 if reduce_motion else v


func set_reduce_motion(on: bool) -> void:
	reduce_motion = on
	_run_only.erase("reduce_motion")
	save()
	access_changed.emit()


## Why a key cannot be the hold-to-talk key: "" when it can, "none" for no key at all, "taken" when another action of the game already
## uses it (the same physical key, or the key it types).
func ptt_key_problem(keycode: int) -> String:
	if keycode == KEY_NONE or keycode == KEY_UNKNOWN:
		return "none"
	for action in InputMap.get_actions():
		if action == "voice_ptt" or str(action).begins_with("ui_"):
			continue
		for e in InputMap.action_get_events(action):
			if e is InputEventKey:
				var k := e as InputEventKey
				if k.physical_keycode == keycode or (k.keycode != KEY_NONE and k.keycode == keycode):
					return "taken"
	return ""


## The hold-to-talk key, as a physical keycode. A key that cannot be it (`ptt_key_problem`) is refused and the old key stays; false then.
func set_ptt_key(keycode: int) -> bool:
	if ptt_key_problem(keycode) != "" and keycode != ptt_key:
		return false
	ptt_key = keycode
	save()
	apply_ptt_key()
	return true


func apply_ptt_key() -> void:
	if not InputMap.has_action("voice_ptt"):
		return
	InputMap.action_erase_events("voice_ptt")
	var ev := InputEventKey.new()
	ev.physical_keycode = ptt_key as Key
	InputMap.action_add_event("voice_ptt", ev)


## The key as the player reads it ("C", "F5", "Mellanslag").
func ptt_key_name() -> String:
	var k: Key = ptt_key as Key
	if DisplayServer.get_name() != "headless": # (the headless server has no keyboard layout to ask)
		var layout := DisplayServer.keyboard_get_keycode_from_physical(k)
		if layout != KEY_NONE:
			k = layout
	return OS.get_keycode_string(k)


## Is an effect (Quality.TOGGLES) on, by the preset or by hand?
func effect_on(id: String) -> bool:
	if effect_overrides.has(id):
		return bool(effect_overrides[id])
	return Quality.toggle_default(id)


func set_effect(id: String, on: bool) -> void:
	effect_overrides[id] = on
	save()
	Quality.effects_changed()


## Back to the preset's own (picking a preset does this).
func clear_effect_overrides() -> void:
	effect_overrides = {}
