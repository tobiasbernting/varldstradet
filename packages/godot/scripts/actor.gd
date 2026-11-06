class_name Actor
extends Node3D
## Someone standing in the world as a pixel sprite on a billboard (ART.md): a player in a class outfit or one of
## the saga's creatures, with a name over the head. The sheets come from assets/sprites (tools/export-sprites.mts).
## Heroes have four directions by three frames; creatures one side view (facing right) by two frames, mirrored for
## left. A missing sheet shows a plain magenta figure, so an unexported creature is visible rather than invisible.
##
## M3b adds what a fight shows on a body: a flash when hit, a lunge when swinging, lying flat when fallen, the ice
## block or the web around a frozen friend, a health bar over the head, a chat or emote bubble, and the mark on the
## monster that is after you.

const PIXEL := 1.0 / 16.0
## The KayKit floor tiles' top is 2.5 cm over 0: feet sit on it.
const FOOT_LIFT := 0.03
## A standing sprite is pulled this far toward the camera along the line of sight (the camera of world.gd looks
## down at atan2(9.2, 8) = 49°: 0.5 m is 0.33 m nearer and 0.38 m higher). It looks the same on screen, but the
## sprite then wins the depth test against a wall block within 0.5 m of it, so a hero standing against a wall in
## front of or behind them is never cut off by it. Every sprite is pulled the same, so they still sort among
## themselves by where they stand.
const PULL := Vector3(0.0, 0.38, 0.33)
const WALK_FPS := 6.0
## The Adventurers' figures: their rig's animations (names are `library/animation`; the libraries are _libs()).
## The Adventurers' basic rigs have no melee swing: the throw stands in for a lunge, the interaction for a tool.
const DEFAULT_RIG := {"idle": "General/Idle_A", "walk": "Move/Walking_A", "death": "General/Death_A", "attack": "General/Throw", "hit": "General/Hit_A", "use": "General/Interact"}
const ICE_TINT := Color(0.55, 0.8, 1.0, 0.4)
const FALLEN_FX := Color(0.3, 0.3, 0.4, 0.38)
## How far a voxel body turns toward a walk up or down the screen (radians), at most.
const VOXEL_TURN := 0.61
const BAR_BACK_PRIORITY := 10
const BAR_FILL_PRIORITY := 11
const SWING_TIME := 0.26
const FALLEN_TINT := Color(0.62, 0.62, 0.72)

## How far the people outdoors are lifted at night, 0..1 (world.gd sets it from the dark: 0 by day, indoors and in
## dungeons, whose darkness is by design). The sprite's own emission, about 40 % of its day brightness at full dark.
static var night_lift := 0.0
const NIGHT_EMISSION := 0.4

var sprite: Sprite3D
var _mat: StandardMaterial3D ## the sprite's material, so it can glow a little at night
var _lift := -1.0
var label: Label3D
var _frames: Array = []
var _frame_w := 16
var _frame_h := 32
var _headroom := 0
var _side_only := false
var _anim_t := 0.0
var _last_facing := "down"
var _flash_t := 0.0
var _flash_colour := Color.WHITE
var _lunge := Vector3.ZERO
var _lunge_t := 0.0
var pose := "" ## "", "down", "frozen", "web"
var _block: Node3D = null
var _bar: Node3D = null
var _bar_fill: MeshInstance3D = null
var _bar_colour := Color(-1.0, 0.0, 0.0)
var _bar_name: Label3D = null
var _bubble: Label3D = null
var _bubble_icon: Sprite3D = null
var _bubble_until := 0.0
var _marker: Sprite3D = null
var _marker_t := 0.0
var _tool: Sprite3D = null
var _swing_t := 0.0
var _swing_side := 1.0
## The 3D trial (`--people3d`): a KayKit Adventurers figure in place of the pixel sprite, or null.
var model: Node3D = null
var _anim: AnimationPlayer = null
var _model_h := 0.0
var _yaw := 0.0
var _rig := {} ## the animations this figure plays: idle, walk, death, attack, hit (set_figure's `rig`)
var _fx_mat: StandardMaterial3D = null ## the flash and tint laid over a figure's meshes (material_overlay)
var _fx_colour := Color(0.0, 0.0, 0.0, 0.0)
var _model_meshes: Array = []
var _model_mats: Array = [] ## this figure's own copies of its materials, glowing a little at night
var _once_t := 0.0 ## seconds left of a one-shot animation (attack, hit), during which idle and walk wait
static var _anim_libs: Array = [] ## AnimationLibrary, loaded once from the pack's two rig files
## The voxel body (`--people3d`, voxel_body.gd): a creature's sprite frames extruded into meshes, or null.
var voxel: MeshInstance3D = null
var _vframes: Array[ArrayMesh] = []
var _vmat: ShaderMaterial = null
var _vframe := -1
var _vyaw := 0.0
var _vt := 0.0
var _vh := 0.0 ## the body's height, its width and its greatest half-depth, metres
var _vw := 0.0
var _vd := 0.0


func _init() -> void:
	sprite = Sprite3D.new()
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = true
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.pixel_size = PIXEL
	_mat = StandardMaterial3D.new()
	_mat.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	_mat.billboard_keep_scale = true
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	_mat.alpha_scissor_threshold = 0.5
	_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mat.vertex_color_use_as_albedo = true
	_mat.emission_enabled = true
	_mat.emission_energy_multiplier = 0.0
	sprite.material_override = _mat
	add_child(sprite)
	label = Label3D.new()
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 48
	label.pixel_size = 0.005
	label.outline_size = 12
	label.outline_modulate = Color("2b2419")
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.no_depth_test = true
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
	set_texture(tex, s.get("frames", []), int(s.get("frame_w", 16)), int(s.get("frame_h", 32)), int(s.get("headroom", 0)))
	return true


## Shows a texture that is a row of frames (`frames` names them in order): a composed player, an animal, a villager.
func set_texture(tex: Texture2D, frame_names: Array, fw: int, fh: int, headroom: int) -> void:
	_frames = frame_names
	_frame_w = fw
	_frame_h = fh
	_headroom = headroom
	_side_only = not _frames.has("down0")
	sprite.texture = tex
	_set_mat_texture(tex)
	sprite.region_enabled = true
	sprite.position = Vector3(0.0, _frame_h * PIXEL / 2.0 + FOOT_LIFT, 0.0) + PULL
	label.position.y = (_frame_h - _headroom) * PIXEL + 0.3
	_show("right0" if _side_only else "down0")


func _placeholder() -> void:
	var img := Image.create(16, 24, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.8, 0.3, 0.8))
	sprite.texture = ImageTexture.create_from_image(img)
	_set_mat_texture(sprite.texture)
	sprite.region_enabled = false
	sprite.position = Vector3(0.0, 24 * PIXEL / 2.0 + FOOT_LIFT, 0.0) + PULL
	label.position.y = 24 * PIXEL + 0.3
	_frames = []
	_frame_w = 16
	_frame_h = 24
	_headroom = 0


## The 3D trial: shows a figure on the shared Rig_Medium skeleton (Figure3D.build()) instead of the sprite,
## `height_m` tall, with the pack's idle, walk and death animations. `key` names the look, so the same look is not
## rebuilt; a null figure keeps the sprite and returns false.
func set_figure(figure: Node3D, key: String, height_m := 1.5, rig := {}) -> bool:
	if model != null and model.get_meta("key", "") == key:
		if figure != null:
			figure.free()
		return true
	if figure == null:
		return false
	if model != null:
		model.queue_free()
	model = figure
	model.set_meta("key", key)
	var top := 0.0
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		top = maxf(top, (mi as MeshInstance3D).get_aabb().end.y)
	var k := height_m / maxf(0.1, top)
	model.scale = Vector3.ONE * k
	_model_meshes = model.find_children("*", "MeshInstance3D", true, false)
	_own_materials()
	_model_h = height_m
	add_child(model)
	_anim = AnimationPlayer.new()
	model.add_child(_anim)
	_anim.root_node = NodePath("..")
	_rig = DEFAULT_RIG.merged(rig, true)
	for lib in (_rig["libs"] if _rig.has("libs") else _libs()):
		_anim.add_animation_library(str(lib.get_meta("name")), lib)
	sprite.visible = false
	label.position.y = height_m + 0.3
	_play(_rig["idle"])
	return true


## The 3D trial for creatures: a body of voxels (VoxelBody.frames()) in place of the sprite, with the frames of the
## sheet in order (walking swaps between them). `key` names the sheet, so the same body is not set twice. An empty
## list keeps the sprite and returns false.
func set_voxel(frames: Array[ArrayMesh], key: String) -> bool:
	if voxel != null and voxel.get_meta("key", "") == key:
		return true
	if frames.is_empty():
		return false
	if voxel == null:
		voxel = MeshInstance3D.new()
		_vmat = VoxelBody.material()
		voxel.material_override = _vmat
		add_child(voxel)
	voxel.set_meta("key", key)
	_vframes = frames
	_vh = 0.0
	_vw = 0.0
	_vd = 0.0
	for f in frames:
		var bb := f.get_aabb()
		_vh = maxf(_vh, bb.end.y)
		_vw = maxf(_vw, bb.size.x)
		_vd = maxf(_vd, bb.end.z)
	_vframe = -1
	_show_voxel(0)
	voxel.position = Vector3(0.0, FOOT_LIFT, 0.0)
	sprite.visible = false
	label.position.y = _vh + 0.3
	return true


func has_voxel(key: String) -> bool:
	return voxel != null and voxel.get_meta("key", "") == key


func _show_voxel(i: int) -> void:
	if i != _vframe:
		_vframe = i
		voxel.mesh = _vframes[i]


## The voxel body turned toward where it faces: the sprites are side views facing right, so it yaws to right or left
## (a mirror by yaw, not by scale) and turns at most VOXEL_TURN further toward a walk up or down the screen, so a
## pillow never shows its head-on end.
func _animate_voxel(facing: String, moving: bool, delta: float) -> void:
	if pose == "down":
		return
	if facing == "left" or facing == "right":
		_last_facing = facing
	var want := 0.0 if _last_facing == "right" else PI
	if moving:
		# toward the camera (down) or away (up): +z is the way the camera sits
		var s := 1.0 if _last_facing == "left" else -1.0
		if facing == "down":
			want += s * VOXEL_TURN
		elif facing == "up":
			want -= s * VOXEL_TURN
	_vyaw = lerp_angle(_vyaw, want, 1.0 - pow(0.001, delta))
	_vt += delta
	_show_voxel(int(_anim_t * WALK_FPS) % _vframes.size() if moving else 0)
	# standing breathes: the height swells and settles by 2 %
	var breath := 0.0 if moving else 0.02 * sin(_vt * 2.4)
	voxel.basis = Basis(Vector3.UP, _vyaw) * Basis.from_scale(Vector3(1.0, 1.0 + breath, 1.0))


## Gives the figure its own copy of every material (the looks share them between actors), with the texture as an
## emission map at no strength: the night lift raises it.
func _own_materials() -> void:
	_model_mats = []
	for mi in _model_meshes:
		var m := mi as MeshInstance3D
		if m.material_override is StandardMaterial3D:
			m.material_override = _glow_copy(m.material_override as StandardMaterial3D)
		elif m.mesh != null:
			for i in range(m.mesh.get_surface_count()):
				var src := m.get_active_material(i) as StandardMaterial3D
				if src != null:
					m.set_surface_override_material(i, _glow_copy(src))


func _glow_copy(src: StandardMaterial3D) -> StandardMaterial3D:
	var d := src.duplicate() as StandardMaterial3D
	if not d.emission_enabled and d.albedo_texture != null:
		d.emission_enabled = true
		d.emission = Color.WHITE
		d.emission_texture = d.albedo_texture
		d.emission_energy_multiplier = 0.0
		_model_mats.append(d)
	return d


func has_figure(key: String) -> bool:
	return model != null and model.get_meta("key", "") == key


static func _libs() -> Array:
	if _anim_libs.is_empty():
		for pair in [["General", "res://assets/kaykit_adventurers/Rig_Medium_General.glb"], ["Move", "res://assets/kaykit_adventurers/Rig_Medium_MovementBasic.glb"]]:
			var scene: Variant = load(pair[1]) if ResourceLoader.exists(pair[1]) else null
			if not (scene is PackedScene):
				continue
			var root: Node = (scene as PackedScene).instantiate()
			var src := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
			if src != null:
				var lib: AnimationLibrary = src.get_animation_library("").duplicate(true)
				for n in ["Idle_A", "Walking_A", "Running_A"]:
					if lib.has_animation(n):
						lib.get_animation(n).loop_mode = Animation.LOOP_LINEAR
				lib.set_meta("name", pair[0])
				_anim_libs.append(lib)
			root.free()
	return _anim_libs


func _play(anim_name: String) -> void:
	if _anim != null and _anim.has_animation(anim_name) and _anim.current_animation != anim_name:
		_anim.play(anim_name, 0.15)


## A one-shot animation (the swing, the hit) at `speed`; idle and walk wait until it is done.
func _play_once(anim_name: String, speed := 1.0) -> void:
	if _anim == null or anim_name == "" or not _anim.has_animation(anim_name) or pose == "down":
		return
	_anim.play(anim_name, 0.05, speed)
	_anim.seek(0.0, true)
	_once_t = _anim.get_animation(anim_name).length / speed


func _animate_model(facing: String, moving: bool, delta: float) -> void:
	if pose == "down":
		_play(_rig["death"])
		return
	var want: float = {"down": 0.0, "up": PI, "right": PI / 2.0, "left": -PI / 2.0}.get(facing, _yaw)
	_yaw = lerp_angle(_yaw, want, 1.0 - pow(0.001, delta))
	model.rotation.y = _yaw
	if _once_t > 0.0:
		_once_t -= delta
		return
	_play(_rig["walk"] if moving else _rig["idle"])


func set_label(text: String) -> void:
	if label.text != text:
		label.text = text


## The figure's height in metres (without the headroom) and its width.
func height() -> float:
	if model != null:
		return _model_h
	if voxel != null:
		return _vh
	return (_frame_h - _headroom) * PIXEL


func width() -> float:
	if voxel != null:
		return _vw
	return _frame_w * PIXEL


## The middle of the body in the scene (where things hit).
func body_position() -> Vector3:
	return global_position + Vector3(0.0, height() * 0.55, 0.0)


func head_position() -> Vector3:
	return global_position + Vector3(0.0, height() + 0.1, 0.0)


func _set_mat_texture(tex: Texture2D) -> void:
	_mat.albedo_texture = tex
	_mat.emission_texture = tex


func _show(frame_name: String) -> void:
	var i := _frames.find(frame_name)
	if i < 0:
		return
	sprite.region_rect = Rect2(i * _frame_w, 0, _frame_w, _frame_h)


## One frame of walking or standing, facing a way (down, up, left, right).
func animate(facing: String, moving: bool, delta: float) -> void:
	if moving and pose == "":
		_anim_t += delta
	else:
		_anim_t = 0.0
	_tick_looks(delta)
	if model != null:
		_animate_model(facing, moving, delta)
		return
	if voxel != null:
		_animate_voxel(facing, moving, delta)
		return
	if _frames.is_empty():
		return
	if pose == "down":
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


func _tick_looks(delta: float) -> void:
	# a light floor at night; off while the sprite flashes or lies fallen (their tints must read as they are)
	var lift := night_lift if (_flash_t <= 0.0 and pose != "down") else 0.0
	if not is_equal_approx(lift, _lift):
		_lift = lift
		if voxel != null:
			_vmat.set_shader_parameter("night", lift)
		elif model != null:
			for fm in _model_mats:
				(fm as StandardMaterial3D).emission_energy_multiplier = lift * NIGHT_EMISSION
		else:
			_mat.emission_energy_multiplier = lift * NIGHT_EMISSION
	if _flash_t > 0.0:
		_flash_t -= delta
		var k := clampf(_flash_t / 0.12, 0.0, 1.0)
		if voxel != null:
			_vmat.set_shader_parameter("flash_colour", _flash_colour)
			_vmat.set_shader_parameter("flash", k)
		else:
			sprite.modulate = (FALLEN_TINT if pose == "down" else Color.WHITE).lerp(_flash_colour, k)
	if model != null:
		_tick_model_fx()
	if _lunge_t > 0.0:
		_lunge_t -= delta
		var k := clampf(_lunge_t / 0.18, 0.0, 1.0)
		if model != null:
			model.position = _lunge * sin(k * PI) if _lunge_t > 0.0 and pose != "down" else Vector3.ZERO
		elif voxel != null:
			if pose != "down":
				voxel.position = Vector3(0.0, FOOT_LIFT, 0.0) + (_lunge * sin(k * PI) if _lunge_t > 0.0 else Vector3.ZERO)
		else:
			var base := Vector3(0.0, _frame_h * PIXEL / 2.0 + FOOT_LIFT, 0.0) + PULL
			sprite.position = base + _lunge * sin(k * PI)
			if _lunge_t <= 0.0:
				sprite.position = base
	if _swing_t > 0.0:
		_swing_t -= delta
		if _swing_t <= 0.0:
			_tool.visible = false
		else:
			# the tool sweeps an arc over the shoulder in front of the body (a billboard cannot be turned, so it moves)
			var k := 1.0 - _swing_t / SWING_TIME
			var a := lerpf(-1.1, 1.3, k)
			_tool.position = Vector3(_swing_side * (0.32 + 0.3 * sin(a)), 0.55 + 0.32 * cos(a), 0.45)
	if _bubble != null and _bubble_until > 0.0 and Time.get_ticks_msec() > _bubble_until:
		_bubble_until = 0.0
		_bubble.visible = false
		_bubble_icon.visible = false
	if _marker != null and _marker.visible:
		_marker_t += delta
		_marker.position.y = head_marker_y() + 0.08 * sin(_marker_t * 6.0)


# ---------------------------------------------------------------------------
# A fight on this body


## The figure's flash and tints: one translucent unshaded overlay over all its meshes, the hit's colour fading out,
## else blue while frozen, else grey while fallen.
func _tick_model_fx() -> void:
	var c := Color(0.0, 0.0, 0.0, 0.0)
	if _flash_t > 0.0:
		c = Color(_flash_colour.r, _flash_colour.g, _flash_colour.b, 0.8 * clampf(_flash_t / 0.12, 0.0, 1.0))
	elif pose == "frozen":
		c = ICE_TINT
	elif pose == "down":
		c = FALLEN_FX
	if c == _fx_colour:
		return
	_fx_colour = c
	if _fx_mat == null:
		_fx_mat = StandardMaterial3D.new()
		_fx_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_fx_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_fx_mat.albedo_color = c
	for mi in _model_meshes:
		(mi as MeshInstance3D).material_overlay = _fx_mat if c.a > 0.0 else null


## A quick flash of colour (hit: white, hurt: red, healed: green).
func flash(colour: Color = Color(1.0, 1.0, 1.0), seconds := 0.12) -> void:
	_flash_colour = colour
	_flash_t = seconds
	if colour.r >= colour.g: # a hit (white) or hurt (red), not a heal (green)
		_play_once(str(_rig.get("hit", "")), 1.6)


## A short lunge in a direction (the swing of a melee spell), scene units.
func lunge(dir: Vector3, dist := 0.25) -> void:
	var d := Vector3(dir.x, 0.0, dir.z)
	_lunge = d.normalized() * dist if d.length() > 0.01 else Vector3(0.0, 0.0, -dist)
	_lunge_t = 0.18
	_play_once(str(_rig.get("attack", "")), 1.8)


## The farm's use animation: a lunge towards the tile and the tool's picture swinging past (the browser squashes the
## body and swings the tool). `facing` is down, up, left or right.
func swing(icon: Texture2D, facing: String) -> void:
	if _tool == null:
		_tool = Sprite3D.new()
		_tool.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_tool.shaded = false
		_tool.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		_tool.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
		_tool.pixel_size = 0.019
		_tool.visible = false
		add_child(_tool)
	var dir := Vector3.ZERO
	match facing:
		"left":
			dir = Vector3(-1, 0, 0)
			_swing_side = -1.0
		"right":
			dir = Vector3(1, 0, 0)
			_swing_side = 1.0
		"up":
			dir = Vector3(0, 0, -1)
			_swing_side = 1.0
		_:
			dir = Vector3(0, 0, 1)
			_swing_side = 1.0
	lunge(dir, 0.2)
	_play_once(str(_rig.get("use", "")), 1.5)
	if icon != null:
		_tool.texture = icon
		_tool.visible = true
		_swing_t = SWING_TIME


## Fallen (lying flat on the floor, grey), frozen (in an ice block), webbed (in threads), or up again.
func set_pose(p: String) -> void:
	if p == pose:
		return
	pose = p
	if _block != null:
		_block.queue_free()
		_block = null
	if voxel != null:
		_voxel_pose(p)
		return
	if p == "down":
		# lying on the ground: the billboard goes, the sprite is laid flat with its feet where it stood
		sprite.billboard = BaseMaterial3D.BILLBOARD_DISABLED
		_mat.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED
		sprite.rotation = Vector3(-PI / 2.0, 0.0, PI / 2.0)
		sprite.position = Vector3(0.0, 0.06, -height() / 2.0 + 0.2)
		sprite.modulate = FALLEN_TINT
		if _bar != null:
			_bar.visible = false
		return
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	_mat.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.rotation = Vector3.ZERO
	sprite.position = Vector3(0.0, _frame_h * PIXEL / 2.0 + FOOT_LIFT, 0.0) + PULL
	sprite.modulate = Color.WHITE
	if p == "frozen":
		_block = _ice_block()
		add_child(_block)
	elif p == "web":
		_block = _web()
		add_child(_block)


## The voxel body's poses: lying on its side with its feet where it stood (grey), or up again; the ice block and the
## web are the same as the billboard's.
func _voxel_pose(p: String) -> void:
	_vmat.set_shader_parameter("tint", FALLEN_TINT if p == "down" else Color.WHITE)
	if p == "down":
		# rolled onto its flank: the pillow's side faces up, and it rests on the floor by its half-depth
		voxel.basis = Basis(Vector3.UP, _vyaw) * Basis(Vector3.RIGHT, -PI / 2.0)
		voxel.position = Vector3(0.0, FOOT_LIFT + _vd, 0.0)
		if _bar != null:
			_bar.visible = false
		return
	voxel.position = Vector3(0.0, FOOT_LIFT, 0.0)
	voxel.basis = Basis(Vector3.UP, _vyaw)
	if p == "frozen":
		_block = _ice_block()
		add_child(_block)
	elif p == "web":
		_block = _web()
		add_child(_block)


## A block of ice around a frozen friend: a translucent pale blue box, shining a little.
func _ice_block() -> Node3D:
	var node := Node3D.new()
	var box := BoxMesh.new()
	var h := height() + 0.3
	box.size = Vector3(1.1, h, 0.8)
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(0.65, 0.88, 1.0, 0.45)
	m.roughness = 0.15
	m.emission_enabled = true
	m.emission = Color(0.5, 0.85, 1.0)
	m.emission_energy_multiplier = 0.4
	box.material = m
	var mi := MeshInstance3D.new()
	mi.mesh = box
	mi.position = Vector3(0.0, h / 2.0, 0.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.add_child(mi)
	return node


## A spider's web: white threads wound round and round a webbed friend.
func _web() -> Node3D:
	var node := Node3D.new()
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(1.0, 1.0, 1.0, 0.75)
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var h := height() + 0.2
	for i in range(6):
		var ring := TorusMesh.new()
		ring.inner_radius = 0.42
		ring.outer_radius = 0.46
		ring.rings = 16
		ring.ring_segments = 6
		ring.material = m
		var mi := MeshInstance3D.new()
		mi.mesh = ring
		mi.position = Vector3(0.0, 0.15 + i * (h - 0.3) / 5.0, 0.0)
		mi.rotation = Vector3(0.0, 0.0, 0.25 if i % 2 == 0 else -0.25)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(mi)
	return node


## Where a marker or a bar sits over the head (over the name when there is one).
func head_marker_y() -> float:
	return label.position.y + (0.35 if label.text != "" else 0.1)


## A health bar over the head: `k` 0–1, in a colour; `shown` false hides it. `name_text` is shown over the bar
## (a boss's or a target's name, as the browser does), "" for none.
func set_health(k: float, shown: bool, colour: Color, name_text := "") -> void:
	if not shown:
		if _bar != null:
			_bar.visible = false
		return
	if _bar == null:
		_bar = Node3D.new()
		# Both quads are alpha-blended with no depth test, so what draws first is decided by the distance of each
		# one's middle to the camera. The fill's middle moves sideways with the health (and a monster's with its
		# walk), which flips that order against the 1 mm of depth it had to the back panel: the panel (85 % opaque)
		# then covers the fill and the bar jumps between full and empty. Explicit render priorities fix the order.
		var back := _quad(Vector2(1.0, 0.12), Color(0.1, 0.08, 0.08, 0.85), BAR_BACK_PRIORITY)
		_bar.add_child(back)
		_bar_fill = _quad(Vector2(1.0, 0.12), colour, BAR_FILL_PRIORITY)
		_bar_fill.position.z = 0.001
		_bar.add_child(_bar_fill)
		_bar_name = Label3D.new()
		_bar_name.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_bar_name.font_size = 40
		_bar_name.pixel_size = 0.005
		_bar_name.outline_size = 10
		_bar_name.outline_modulate = Color("2b2419")
		_bar_name.no_depth_test = true
		_bar_name.position.y = 0.2
		_bar.add_child(_bar_name)
		add_child(_bar)
	# called for every body every frame: set what changed and nothing else (a property set on a node or a material
	# is a call into the renderer, and a Label3D's text rebuilds its mesh)
	var vis := pose != "down"
	if _bar.visible != vis:
		_bar.visible = vis
	var y := head_marker_y()
	if _bar.position.y != y:
		_bar.position.y = y
	var w := maxf(0.6, width() * 1.2)
	if _bar.scale.x != w:
		_bar.scale.x = w
		_bar_name.scale.x = 1.0 / w
	var kk := clampf(k, 0.0, 1.0)
	if _bar_fill.scale.x != maxf(0.001, kk):
		_bar_fill.scale.x = maxf(0.001, kk)
		_bar_fill.position.x = -(1.0 - kk) / 2.0
	if colour != _bar_colour:
		_bar_colour = colour
		var mat: StandardMaterial3D = _bar_fill.material_override
		mat.albedo_color = colour
	if _bar_name.text != name_text:
		_bar_name.text = name_text


## The health the bar shows now, 0–1; -1 when there is no bar or it is hidden (the bot checks it never rises).
func shown_health() -> float:
	if _bar == null or not _bar.visible:
		return -1.0
	return _bar_fill.scale.x


func _quad(size: Vector2, colour: Color, priority := 0) -> MeshInstance3D:
	var q := QuadMesh.new()
	q.size = size
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.albedo_color = colour
	m.no_depth_test = true
	m.render_priority = priority
	var mi := MeshInstance3D.new()
	mi.mesh = q
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## A chat line (text) or an emote (icon) over the head for `seconds`.
func set_bubble(text: String, icon: Texture2D, seconds: float) -> void:
	if _bubble == null:
		_bubble = Label3D.new()
		_bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_bubble.font_size = 40
		_bubble.pixel_size = 0.005
		_bubble.outline_size = 10
		_bubble.outline_modulate = Color("2b2419")
		_bubble.modulate = Color(1.0, 0.98, 0.9)
		_bubble.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_bubble.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_bubble.width = 320.0
		_bubble.no_depth_test = true
		add_child(_bubble)
		_bubble_icon = Sprite3D.new()
		_bubble_icon.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_bubble_icon.pixel_size = 0.02
		_bubble_icon.no_depth_test = true
		_bubble_icon.shaded = false
		add_child(_bubble_icon)
	_bubble.text = text
	_bubble.visible = text != ""
	_bubble.position.y = head_marker_y() + 0.45
	_bubble_icon.texture = icon
	_bubble_icon.visible = icon != null
	_bubble_icon.position.y = head_marker_y() + 0.55
	_bubble_until = Time.get_ticks_msec() + seconds * 1000.0


## The mark on the monster that is after you (a bobbing warning sign over its head).
func set_marker(on: bool) -> void:
	if _marker == null:
		if not on:
			return
		_marker = Sprite3D.new()
		_marker.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_marker.pixel_size = 0.014
		_marker.no_depth_test = true
		_marker.shaded = false
		_marker.texture = Data.icon("ui_warn")
		add_child(_marker)
	_marker.visible = on
	_marker.position.y = head_marker_y() + 0.5
