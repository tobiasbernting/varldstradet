extends Node
## The three quality presets of PLAN.md section 3 (and ART.md): Låg for an Intel integrated GPU, Mellan the default
## (a MacBook Air), Hög for a dedicated card. Everything expensive is a toggle, so a scene is built once and the
## preset decides what runs: the 3D resolution, how many torches throw shadows, SSAO, global illumination,
## volumetric fog, glow and the particle budget. Saved in user://settings.cfg (Settings.quality), applied at start.
##
## The 3D resolution is a pixel budget, not a fixed scale: a Retina window of 1280×720 points is 2560×1440 pixels, four
## times what the same window costs on a 1080p screen, and what a GPU shades is pixels. A preset renders the scene at
## `scale` of the window, but never more than `mpix` million pixels, and the engine upscales the rest (FSR 1 in
## Forward+, which keeps the sprites' edges). Shadows are Hög only: each shadow-casting omni light is up to six extra
## passes over the room.

signal changed(preset: String)
signal effects_updated ## a hand-made effect switch changed (settings window): only what is built at the start is made again (world.gd)

const ORDER := ["lag", "mellan", "hog"]
const PRESETS := {
	"lag": {"scale": 0.8, "mpix": 1.3, "shadows": 0, "ssao": false, "gi": false, "fog": false, "glow": false, "particles": 0, "sun_shadow": 0, "weather": 150, "sky_weather": 150,
		"wind": 1, "water": 0, "fireflies": 0, "butterflies": 0, "leaves": 0, "smoke": 0, "mist": 0, "window_light": 0,
		"steps": 3, "ambience": 1, "sparrows": 0},
	"mellan": {"scale": 1.0, "mpix": 2.1, "shadows": 0, "ssao": true, "gi": false, "fog": false, "glow": true, "particles": 8, "sun_shadow": 1, "weather": 600, "sky_weather": 900,
		"wind": 2, "water": 1, "fireflies": 28, "butterflies": 9, "leaves": 36, "smoke": 7, "mist": 9, "window_light": 1,
		"steps": 6, "ambience": 2, "sparrows": 6},
	"hog": {"scale": 1.0, "mpix": 3.7, "shadows": 6, "ssao": true, "gi": true, "fog": true, "glow": true, "particles": 16, "sun_shadow": 2, "weather": 1500, "sky_weather": 2000,
		"wind": 3, "water": 2, "fireflies": 56, "butterflies": 16, "leaves": 80, "smoke": 12, "mist": 18, "window_light": 2,
		"steps": 10, "ambience": 2, "sparrows": 12},
}
## The alive world's toggles on the outdoor maps (M7a) and the weather's particle budget, per preset. The counts are budgets (how many of each thing exist
## near the hero at most; 0 is off), the levels pick a shader's quality:
##  wind          0 none, 1 crowns of trees and bushes only, one sine (what it was before M7a: Låg), 2 + gusts that cross the
##                map and grass, crops and reeds that lean with them, 3 + a fast flutter of leaves
##  water         0 a flat cheap look (Låg: two colours and the bank's foam), 1 waves, animated foam and a sky and shore
##                reflection (screen space, 16 steps), 2 a finer reflection (28 steps)
##  weather       the dungeons' falling weather and motes (dungeon_view.gd; as on main: 150 / 600 / 1500)
##  sky_weather   how many rain streaks / flakes / hail stones exist near the hero outdoors (day_night.gd, the atmosphere pass; 150 / 900 / 2000; rain uses half of it as streaks, a storm all of it)
##  fireflies     on summer nights;   butterflies by day in spring and summer;   leaves falling from the trees in autumn;
##  smoke         puffs from a chimney (per chimney);   mist  low drifting mist at dawn;
##  window_light  0 the windows' glow only, 1 + a pool of light on the ground in front of them, 2 + it flickers like a fire
## The screen grade (screen_grade.gd: tone, vignette, the night's navy and a warm lift) is on for every preset: it is one
## cheap full-screen pass, so it has no toggle here (Låg pays it too).
## The living world's sound and wildlife (M7b), per preset (the sound ones are also switched in Settings: steps_on, ambience_on):
##  steps      how many footsteps can sound at once (the hero's and the others'; 0 is off). Låg: 3, so the hero and two others
##  ambience   0 off, 1 (Låg) only the three loudest layers of the place's soundscape, chosen by place, hour and weather, 2 all
##             the layers, with water and fire sounding louder as you near them, and the owl at night
##  sparrows   small brown birds that hop about on the grass by day and fly off when you come near (0 builds nothing)
## (The wild animals' startling is the server's, shared/sim.ts `tickStartle`: it is the same for everyone, so no toggle.)
## The torch shadows' map: Hög only (the others have no positional shadows at all, so no atlas to clear every frame).
const SHADOW_ATLAS := 4096
## Torches farther than this from the camera are not lit at all, and farther than SHADOW_FADE throw no shadow
## (the camera is ~13 m from the hero and the screen shows ~10 m round them).
const LIGHT_FADE_BEGIN := 20.0
const LIGHT_FADE_LENGTH := 6.0
const SHADOW_FADE := 16.0

## M8b: the effects the settings window can switch by hand, over the preset's own: toggle id -> the PRESETS keys it governs.
## Off makes every one of them 0; on gives the preset's value, or Mellan's when the preset has none (a Låg player who wants the
## wind's gusts gets what Mellan has). Picking a preset clears the hand-made choices (Settings.effect_overrides).
const TOGGLES := {
	"wind": ["wind"],
	"water": ["water"],
	"ambient": ["fireflies", "butterflies", "leaves", "smoke", "mist", "window_light"],
	"weather": ["sky_weather", "weather"],
	"wildlife": ["sparrows"],
}
const TOGGLE_ORDER := ["wind", "water", "ambient", "weather", "wildlife"]

var preset := "mellan"


func _ready() -> void:
	preset = Settings.quality if PRESETS.has(Settings.quality) else "mellan"
	# --quality=lag|mellan|hog: this run only (pictures and benches; it is not saved)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--quality=") and PRESETS.has(arg.substr(10)):
			preset = arg.substr(10)
	_apply_viewport()
	get_window().size_changed.connect(_apply_viewport)


## `persist` false for a run that only borrows a preset (the bench): the choice must not be written to settings.cfg, which
## the next program on the same machine (a bot in CI) would read as the player's.
func set_preset(p: String, persist := true) -> void:
	if not PRESETS.has(p):
		return
	preset = p
	if persist:
		Settings.quality = p
		Settings.clear_effect_overrides()
		Settings.save()
	_apply_viewport()
	changed.emit(p)


func spec() -> Dictionary:
	return PRESETS[preset]


## How many lights (the nearest torches) throw shadows.
func shadow_lights() -> int:
	return int(spec().get("shadows", 0))


## One of the alive-world toggles of the current preset (see PRESETS), with the player's own switches (TOGGLES) laid over it.
func alive(what: String) -> int:
	return int(value(what))


## A PRESETS entry as it is now: the preset's, unless the player switched its toggle off (0) or on (Mellan's value when the
## preset has none).
func value(key: String) -> Variant:
	var v: Variant = spec().get(key, 0)
	var t := toggle_of(key)
	if t != "" and Settings.effect_overrides.has(t):
		if not bool(Settings.effect_overrides[t]):
			return 0
		if int(v) == 0:
			return PRESETS["mellan"].get(key, 0)
	return v


## Which toggle governs a PRESETS key ("" for none).
func toggle_of(key: String) -> String:
	for t in TOGGLES.keys():
		if key in TOGGLES[t]:
			return t
	return ""


## Is a toggle on in the preset itself (any of its keys above 0)?
func toggle_default(id: String) -> bool:
	for k in TOGGLES.get(id, []):
		if int(spec().get(k, 0)) > 0:
			return true
	return false


## The dungeons' falling weather and motes (dungeon_view.gd): `div` shares the budget between them. Låg has none, whatever the
## "weather" switch says (it is the sky's rain and snow on the maps that the switch governs there; on Mellan and Hög it governs both).
func dungeon_budget(div: int) -> int:
	if preset == "lag":
		return 0
	return int(value("weather")) / div


## An effect was switched in the settings window. Everything reads `alive` every frame except the weather's particles (the sky's and
## the dungeon's), which world.gd makes again on this signal; nothing else is rebuilt (a fight goes on, telegraphs and targets stay).
## (The torches' sparks, `particles`, are the preset's alone: they are built with the room.)
func effects_changed() -> void:
	effects_updated.emit()


## Particles per torch flame (0: a flat flame only).
func particles() -> int:
	return int(value("particles"))


## The toggles on a dungeon's environment.
func apply_environment(env: Environment) -> void:
	var s := spec()
	env.ssao_enabled = bool(s.get("ssao", false))
	env.sdfgi_enabled = bool(s.get("gi", false))
	env.volumetric_fog_enabled = bool(s.get("fog", false))
	env.glow_enabled = bool(s.get("glow", false))
	if env.sdfgi_enabled:
		# a dungeon is two metres tall and the camera sees ~20 m of it: half the height in cells, and two cascades
		# of 25 cm cells (the first covers 32 m round the camera, the second 64 m) instead of four of 20 cm
		env.sdfgi_cascades = 2
		env.sdfgi_min_cell_size = 0.25
		env.sdfgi_y_scale = Environment.SDFGI_Y_SCALE_50_PERCENT
	# the light the GI gives is soft: sample it at half the resolution (a global setting; a Retina window has 4× the pixels)
	RenderingServer.gi_set_use_half_resolution(preset == "hog")
	# the engine's SSAO is a global setting: low quality at half resolution is plenty for the subtle creases here
	RenderingServer.environment_set_ssao_quality(RenderingServer.ENV_SSAO_QUALITY_MEDIUM if preset == "hog" else RenderingServer.ENV_SSAO_QUALITY_LOW, true, 0.5, 1, 50.0, 300.0)


## The 3D scale this preset gets in a window of `pixels`: its own scale, held down to its pixel budget.
func scale_for(pixels: Vector2) -> float:
	var s := spec()
	var area := maxf(1.0, pixels.x * pixels.y)
	var by_preset := clampf(minf(float(s.get("scale", 1.0)), sqrt(float(s.get("mpix", 4.0)) * 1.0e6 / area)), 0.5, 1.0)
	return clampf(by_preset * Settings.res_scale, 0.4, 1.0) # (the player's own "resolution scale" on top)


## The viewport's 3D scale again, after the player changed it (settings_window.gd).
func refresh_viewport() -> void:
	_apply_viewport()


func _apply_viewport() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	var scale_by := scale_for(Vector2(get_window().size))
	vp.scaling_3d_scale = scale_by
	var fsr := scale_by < 0.99 and RenderingServer.get_current_rendering_method() != "gl_compatibility"
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if fsr else Viewport.SCALING_3D_MODE_BILINEAR
	# positional (omni) shadows only on the preset that has them: no atlas to allocate and clear for the others
	vp.positional_shadow_atlas_size = SHADOW_ATLAS if shadow_lights() > 0 else 0


## The preset's name as the player sees it.
func label_of(p: String) -> String:
	match p:
		"lag":
			return Strings.t("qualityLow")
		"hog":
			return Strings.t("qualityHigh")
	return Strings.t("qualityMedium")


func hint_of(p: String) -> String:
	match p:
		"lag":
			return Strings.t("qualityLowHint")
		"hog":
			return Strings.t("qualityHighHint")
	return Strings.t("qualityMediumHint")
