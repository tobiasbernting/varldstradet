class_name DropsView
extends Node3D
## Things lying on the ground (the world's `drops`: what a tree gave, what you put down, what a chest spilled): each is
## the item's picture on a billboard that bobs a little over a soft shadow. Walking over one picks it up, and that is
## the server's (`tickDrops`, PICKUP_RADIUS): this only draws what `drop` changes say. Sprites are made when a drop
## appears and freed when it goes; the bobbing touches only a position per sprite per frame.

const LIFT := 0.38
const SIZE := 0.62

var _sprites: Dictionary = {} ## drop id -> Sprite3D
var _list: Array[Sprite3D] = []
var _shadow_mesh: QuadMesh
var _shadow_mat: StandardMaterial3D
var _t := 0.0


func _init() -> void:
	_shadow_mesh = QuadMesh.new()
	_shadow_mesh.size = Vector2(0.5, 0.5)
	_shadow_mesh.orientation = PlaneMesh.FACE_Y
	_shadow_mat = StandardMaterial3D.new()
	_shadow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shadow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shadow_mat.albedo_color = Color(0, 0, 0, 0.3)
	_shadow_mat.albedo_texture = _blob()
	_shadow_mesh.material = _shadow_mat


static func _blob() -> Texture2D:
	var g := GradientTexture2D.new()
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 1))
	grad.set_color(1, Color(1, 1, 1, 0))
	g.gradient = grad
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.5)
	g.fill_to = Vector2(0.5, 0.0)
	g.width = 32
	g.height = 32
	return g


func clear() -> void:
	for s in _list:
		s.queue_free()
	_list.clear()
	_sprites.clear()


## Draws a map's drops (a dictionary id -> DropState).
func build(w: Dictionary) -> void:
	clear()
	for id in w.get("drops", {}).keys():
		var d: Variant = w["drops"][id]
		if d is Dictionary:
			update_drop(str(id), d)


func update_drop(id: String, drop: Variant) -> void:
	if not (drop is Dictionary):
		if _sprites.has(id):
			var old: Sprite3D = _sprites[id]
			_list.erase(old)
			_sprites.erase(id)
			old.queue_free()
		return
	var tile := Data.tile()
	var s: Sprite3D = _sprites.get(id)
	if s == null:
		s = Sprite3D.new()
		s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		s.shaded = false
		s.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
		s.pixel_size = SIZE / 32.0
		var blob := MeshInstance3D.new()
		blob.mesh = _shadow_mesh
		blob.position = Vector3(0, -LIFT + 0.03, 0)
		blob.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		s.add_child(blob)
		add_child(s)
		_sprites[id] = s
		_list.append(s)
		s.set_meta("phase", randf() * TAU)
	s.texture = Data.item_icon(str(drop.get("item", "")))
	s.position = Vector3(float(drop.get("x", 0)) / tile, LIFT, float(drop.get("y", 0)) / tile)


func tick(delta: float) -> void:
	_t += delta
	for s in _list:
		s.position.y = LIFT + 0.06 * sin(_t * 3.0 + float(s.get_meta("phase", 0.0)))


func count() -> int:
	return _list.size()
