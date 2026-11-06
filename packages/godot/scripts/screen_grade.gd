class_name ScreenGrade
extends CanvasLayer
## The picture's last pass: one full-screen rect under the HUD that grades what the 3D view drew (assets/shaders/
## screen_grade.gdshader): the browser's warm grade, a little less saturation, a push toward blue at night, a vignette
## and the flash of lightning. It is one cheap read of the screen, so it is on for every preset. day_night.gd sets
## the look every frame outdoors (`set_look`), the world sets the dungeon's look once (`dungeon_look`).

var _mat := ShaderMaterial.new()
var _rect := ColorRect.new()


func _init() -> void:
	layer = 0 # the HUD and the windows are layer 1 and up: they are not graded
	name = "ScreenGrade"
	_mat.shader = load("res://assets/shaders/screen_grade.gdshader")
	_rect.material = _mat
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rect)


## The look outdoors. `night` 0..1 (the blue push), `flash` 0..1 (lightning), `tint` the weather's cast.
func set_look(saturation: float, night: float, vignette: float, tint: Color, flash: float, contrast := 1.0, warm := 1.0, dusk := 0.0) -> void:
	_mat.set_shader_parameter("saturation", saturation)
	_mat.set_shader_parameter("night_tint", night)
	_mat.set_shader_parameter("vignette", vignette)
	_mat.set_shader_parameter("tint", Vector3(tint.r, tint.g, tint.b))
	_mat.set_shader_parameter("flash", flash)
	_mat.set_shader_parameter("contrast", contrast)
	_mat.set_shader_parameter("dusk", dusk)
	_mat.set_shader_parameter("warm", warm)


## A dungeon keeps what its own lights made of it: a touch of warmth and a light vignette, no night.
func dungeon_look() -> void:
	set_look(1.0, 0.0, 0.2, Color.WHITE, 0.0, 1.0, 0.4)
