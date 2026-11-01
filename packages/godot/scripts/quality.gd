extends Node
## The three quality presets of PLAN.md section 3 (and ART.md): Låg for an Intel integrated GPU, Mellan the default
## (a MacBook Air), Hög for a dedicated card. Everything expensive is a toggle, so a scene is built once and the
## preset decides what runs: the 3D resolution scale, how many torches throw shadows, SSAO, global illumination,
## volumetric fog, glow and the particle budget. Saved in user://settings.cfg (Settings.quality), applied at start.

signal changed(preset: String)

const ORDER := ["lag", "mellan", "hog"]
const PRESETS := {
	"lag": {"scale": 0.8, "shadows": 0, "ssao": false, "gi": false, "fog": false, "glow": false, "particles": 0},
	"mellan": {"scale": 1.0, "shadows": 4, "ssao": true, "gi": false, "fog": false, "glow": true, "particles": 8},
	"hog": {"scale": 1.0, "shadows": 8, "ssao": true, "gi": true, "fog": true, "glow": true, "particles": 16},
}

var preset := "mellan"


func _ready() -> void:
	preset = Settings.quality if PRESETS.has(Settings.quality) else "mellan"
	_apply_viewport()


func set_preset(p: String) -> void:
	if not PRESETS.has(p):
		return
	preset = p
	Settings.quality = p
	Settings.save()
	_apply_viewport()
	changed.emit(p)


func spec() -> Dictionary:
	return PRESETS[preset]


## How many lights (the nearest torches) throw shadows.
func shadow_lights() -> int:
	return int(spec().get("shadows", 0))


## Particles per torch flame (0: a flat flame only).
func particles() -> int:
	return int(spec().get("particles", 0))


## The toggles on a dungeon's environment.
func apply_environment(env: Environment) -> void:
	var s := spec()
	env.ssao_enabled = bool(s.get("ssao", false))
	env.sdfgi_enabled = bool(s.get("gi", false))
	env.volumetric_fog_enabled = bool(s.get("fog", false))
	env.glow_enabled = bool(s.get("glow", false))


func _apply_viewport() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	var scale_by := float(spec().get("scale", 1.0))
	vp.scaling_3d_scale = scale_by
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if scale_by < 1.0 else Viewport.SCALING_3D_MODE_BILINEAR


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
