class_name Actor
extends Node3D
## Someone standing in the world as a pixel sprite on a billboard (ART.md): a player in a class outfit or one of
## the saga's creatures, with a name over the head. The sheets come from assets/sprites (tools/export-sprites.mts).
## Heroes have four directions by three frames; creatures one side view (facing right) by two frames, mirrored for
## left. A missing sheet shows a plain magenta figure, so an unexported creature is visible rather than invisible.

const PIXEL := 1.0 / 16.0
## The KayKit floor tiles' top is 2.5 cm over 0: feet sit on it.
const FOOT_LIFT := 0.03
const WALK_FPS := 6.0

var sprite: Sprite3D
var label: Label3D
var _frames: Array = []
var _frame_w := 16
var _frame_h := 32
var _side_only := false
var _anim_t := 0.0
var _last_facing := "down"


func _init() -> void:
	sprite = Sprite3D.new()
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = true
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.pixel_size = PIXEL
	add_child(sprite)
	label = Label3D.new()
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 48
	label.pixel_size = 0.005
	label.outline_size = 12
	label.outline_modulate = Color("2b2419")
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(label)


## Picks a sheet from the atlas; false (and a placeholder figure) when there is none.
func set_sheet(sheet_name: String) -> bool:
	var s := Data.sheet(sheet_name)
	var tex: Texture2D = null
	if not s.is_empty():
		var path := "res://assets/sprites/" + str(s.get("file", ""))
		tex = load(path) if ResourceLoader.exists(path) else null
	if tex == null:
		_placeholder()
		return false
	_frames = s.get("frames", [])
	_frame_w = int(s.get("frame_w", 16))
	_frame_h = int(s.get("frame_h", 32))
	var headroom := int(s.get("headroom", 0))
	_side_only = not _frames.has("down0")
	sprite.texture = tex
	sprite.region_enabled = true
	sprite.position.y = _frame_h * PIXEL / 2.0 + FOOT_LIFT
	label.position.y = (_frame_h - headroom) * PIXEL + 0.3
	_show("right0" if _side_only else "down0")
	return true


func _placeholder() -> void:
	var img := Image.create(16, 24, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.8, 0.3, 0.8))
	sprite.texture = ImageTexture.create_from_image(img)
	sprite.region_enabled = false
	sprite.position.y = 24 * PIXEL / 2.0 + FOOT_LIFT
	label.position.y = 24 * PIXEL + 0.3
	_frames = []


func set_label(text: String) -> void:
	label.text = text


func _show(frame_name: String) -> void:
	var i := _frames.find(frame_name)
	if i < 0:
		return
	sprite.region_rect = Rect2(i * _frame_w, 0, _frame_w, _frame_h)


## One frame of walking or standing, facing a way (down, up, left, right).
func animate(facing: String, moving: bool, delta: float) -> void:
	if moving:
		_anim_t += delta
	else:
		_anim_t = 0.0
	if _frames.is_empty():
		return
	if _side_only:
		if facing == "left" or facing == "right":
			_last_facing = facing
		sprite.flip_h = _last_facing == "left"
		_show("right%d" % (int(_anim_t * WALK_FPS) % 2 if moving else 0))
	else:
		sprite.flip_h = false
		var step := 1 + int(_anim_t * WALK_FPS) % 2 if moving else 0
		_show("%s%d" % [facing, step])
