class_name DungeonView
extends Node3D
## Draws a dungeon (an area `saga:<id>`) from the WorldState the server sends: the floor from the terrain grid, a
## wall for every `saga_wall` object (a dark block with KayKit wall faces on the sides that meet the floor), and a
## node for every other object (torches with lights, the gate, the way out, rest stones, chests, the decor), kept
## up to date through `update_object` when a `changes` message moves something. One path for all nine dungeons:
## the look (DUNGEONS[id].wall) picks the tint and the torch colour, the terrain picks the floor's colour. See
## ART.md for the units (1 tile = 1 m, the 2D y axis is +Z) and the palette.

## KayKit's grid is 4 units a tile; the scene's is 1 m.
const SCALE := 0.5
## The floor and the walls are MultiMeshes in chunks this many tiles square, so a chunk is lit by its own torches
## only (the Compatibility renderer lights at most eight lights per mesh; Forward+ has no such limit).
const CHUNK := 8
const KAYKIT := "res://assets/kaykit/"
const FLOOR_MODELS := ["floor_tile_small.gltf.glb", "floor_tile_small_broken_A.gltf.glb", "floor_tile_small_weeds_A.gltf.glb"]
const FLOOR_BOSS := "floor_tile_small_decorated.gltf.glb"
## The stone tint per look (the dungeon's `wall` index): ART.md, "Recolouring imported packs".
const STONE_TINT := [
	Color(0.78, 0.84, 0.76), # Draugkryptan: Kryptsten
	Color(0.82, 0.9, 1.0), # Frostjättens borg
	Color(0.55, 0.5, 0.52), # Surts smedja
	Color(0.6, 0.78, 0.76), # Helheim
	Color(0.7, 0.7, 0.76), # Svartalfheims gruvor
	Color(0.6, 0.76, 0.9), # Havsormens tempel
	Color(0.72, 0.62, 0.82), # Alvernas lund
	Color(0.78, 0.82, 0.9), # Fenrisklyftan
	Color(0.9, 0.86, 1.0), # Bifrost
]
## The torches' light per look, from the browser's SAGA_TORCH (lighting.ts): the first three are copied, the rest
## are the dungeons' moods as that file describes them (ghost-light, lanterns, pearls, fairy lights, cold fire, rainbow).
const TORCH_COLOURS := [
	Color(0.62, 1.0, 0.55), Color(0.6, 0.86, 1.0), Color(1.0, 0.58, 0.26), Color(0.6, 1.0, 0.82), Color(1.0, 0.86, 0.6),
	Color(0.7, 0.92, 1.0), Color(0.82, 0.7, 1.0), Color(0.62, 0.8, 1.0), Color(1.0, 0.82, 0.9),
]
## What the floor models are tinted with per terrain (the dungeons' floors: crypt flagstones, the boss halls' stone,
## snow, ice, the forge's black stone, Bifrost's glass; the rest in case a plan uses them).
const FLOOR_TINT := {
	"crypt": Color(1.0, 1.0, 1.0), "floor_stone": Color(1.1, 1.08, 1.05), "snow": Color(1.3, 1.35, 1.45), "ice": Color(0.9, 1.2, 1.4),
	"forge": Color(0.45, 0.4, 0.42), "bifrost": Color(1.3, 1.25, 1.4), "moss": Color(0.8, 1.1, 0.75), "stone": Color(0.95, 0.95, 0.95),
	"gravel": Color(0.9, 0.88, 0.85), "sand": Color(1.2, 1.1, 0.85), "dirt": Color(0.9, 0.8, 0.7), "floor_wood": Color(1.1, 0.9, 0.7),
}
const FLICKER_EVERY := 1.0 / 30.0
const CANDLE_COLOUR := Color(1.0, 0.78, 0.45)
const EXIT_COLOUR := Color(1.0, 0.95, 0.82)
const REST_COLOUR := Color(0.35, 0.92, 1.0)
const PLATE_COLOUR := Color(1.0, 0.9, 0.5)

var key := ""
var dungeon_id := ""
var look := 0
var world: Dictionary = {}
var map_w := 64
var map_h := 64

var _props: Dictionary = {} ## object id -> Node3D
var _lights: Array[OmniLight3D] = []
var _flicker: Array = [] ## [light, base energy, phase, depth]
var _scenes: Dictionary = {} ## path -> PackedScene
var _materials: Dictionary = {} ## [material id, tint] -> tinted material
var _meshes: Dictionary = {} ## [path, tint] -> tinted mesh for MultiMeshes
var _warned: Dictionary = {}
var _static: Node3D
var _objects_root: Node3D
var _env: WorldEnvironment
var _t := 0.0
var _flicker_in := 0.0
var _shadow_order: Array[OmniLight3D] = [] ## the lights with a shadow now, nearest first (update_shadows)
var _exit_walls: Dictionary = {} ## "x,y" of wall tiles the way out's stairs go into (no cap or faces there)


func _process(delta: float) -> void:
	_t += delta
	# The flicker is slow (23 rad/s at most), so 30 updates a second look the same as 60; and a light the camera
	# is too far from to light anything (distance_fade) is not worth a call into the renderer.
	_flicker_in -= delta
	if _flicker_in > 0.0:
		return
	_flicker_in = FLICKER_EVERY
	var cam := get_viewport().get_camera_3d()
	var cam_at := cam.global_position if cam != null else Vector3.ZERO
	var far2 := (Quality.LIGHT_FADE_BEGIN + Quality.LIGHT_FADE_LENGTH) * (Quality.LIGHT_FADE_BEGIN + Quality.LIGHT_FADE_LENGTH)
	for f in _flicker:
		var light: OmniLight3D = f[0]
		if cam != null and light.global_position.distance_squared_to(cam_at) > far2:
			continue
		var phase: float = f[2]
		var depth: float = f[3]
		light.light_energy = f[1] * (1.0 - depth * (0.5 + 0.35 * sin(_t * 9.0 + phase) + 0.15 * sin(_t * 23.0 + phase * 1.7)))


func clear() -> void:
	for child in get_children():
		child.queue_free()
	_props = {}
	_lights = []
	_flicker = []
	_shadow_order = []
	_meshes = {}
	_materials = {}
	_exit_walls = {}
	world = {}
	key = ""
	dungeon_id = ""


## Builds the whole map from its WorldState (`w`) under the area key `k`.
func build(w: Dictionary, k: String) -> void:
	clear()
	world = w
	key = k
	dungeon_id = Data.dungeon_of_key(k)
	var d := Data.dungeon(dungeon_id)
	look = int(d.get("wall", 0)) % STONE_TINT.size()
	map_w = int(w.get("w", 64))
	map_h = int(w.get("h", 64))
	_static = Node3D.new()
	_static.name = "Static"
	add_child(_static)
	_objects_root = Node3D.new()
	_objects_root.name = "Objects"
	add_child(_objects_root)
	_make_environment(d)
	var objects: Dictionary = w.get("objects", {})
	for obj in objects.values():
		if str(obj.get("kind", "")) == "saga_exit":
			var wall := _exit_wall_of(int(obj.get("x", 0)), int(obj.get("y", 0)))
			if wall != Vector2i(0, 0):
				_exit_walls["%d,%d" % [int(obj.get("x", 0)) + wall.x, int(obj.get("y", 0)) + wall.y]] = true
	_build_floor(d)
	_build_walls()
	for id in objects.keys():
		_place(str(id), objects[id])


## A `changes` message put, changed or removed an object here.
func update_object(id: String, obj: Variant) -> void:
	var old: Variant = _props.get(id)
	if old is Node:
		old.queue_free()
		_props.erase(id)
	if obj is Dictionary:
		_place(id, obj)


## The `n` lights nearest `at` throw shadows (a quality-preset matter; see quality.gd), and the others none. With
## n = 0 (Låg, Mellan) nothing is looked at; otherwise this runs a few times a second, picks the nearest n by one pass
## per slot (no sorting, no new arrays) and only touches the lights whose state changes.
func update_shadows(at: Vector3, n: int) -> void:
	if n <= 0 and _shadow_order.is_empty():
		return
	var want := mini(n, _lights.size())
	var chosen: Array[OmniLight3D] = []
	for slot in range(want):
		var best: OmniLight3D = null
		var best_d := INF
		for light in _lights:
			if chosen.has(light):
				continue
			var d := light.global_position.distance_squared_to(at)
			if d < best_d:
				best_d = d
				best = light
		chosen.append(best)
	for light in _shadow_order:
		if not chosen.has(light):
			light.shadow_enabled = false
	for light in chosen:
		if not light.shadow_enabled:
			light.shadow_enabled = true
	_shadow_order = chosen


func light_count() -> int:
	return _lights.size()


## How many lights throw shadows now.
func shadow_light_count() -> int:
	var n := 0
	for light in _lights:
		if light.shadow_enabled:
			n += 1
	return n


## How many lights are within reach of the camera at `at` (a light fades out at its distance_fade_begin + length).
func lights_near(at: Vector3) -> int:
	var n := 0
	for light in _lights:
		if not light.distance_fade_enabled or light.global_position.distance_to(at) < light.distance_fade_begin + light.distance_fade_length:
			n += 1
	return n


## The nodes standing in the dungeon (props, lights, the floor's and the walls' MultiMeshes).
func object_count() -> int:
	return _props.size() + (_static.get_child_count() if _static != null else 0)


func tint() -> Color:
	return STONE_TINT[look]


func torch_colour() -> Color:
	return TORCH_COLOURS[look % TORCH_COLOURS.size()]


# ---------------------------------------------------------------------------
# The ground and the walls


func _make_environment(d: Dictionary) -> void:
	var amb_arr: Array = d.get("ambient", [0.5, 0.5, 0.6])
	var amb := Color(float(amb_arr[0]), float(amb_arr[1]), float(amb_arr[2]))
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = amb * 0.12
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = amb
	env.ambient_light_energy = 0.7 # the browser's dungeonAmbient: the dungeon's colour turned down, so torches pool light
	env.fog_enabled = true
	env.fog_light_color = amb * 0.45
	env.fog_density = 0.035
	env.fog_sky_affect = 0.0
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.volumetric_fog_albedo = amb
	env.volumetric_fog_density = 0.03
	env.glow_intensity = 0.5
	env.glow_bloom = 0.05
	# Screen-space occlusion (Mellan and Hög; Forward+ only) darkens creases. Its defaults (a 1 m radius, intensity 2)
	# are made for rooms: on 2 m walls seen from above they paint a dark band along every wall's foot and halos at the
	# wall tops' edges. Small and light, it only gives the corners a little weight.
	env.ssao_radius = 0.35
	env.ssao_intensity = 1.0
	env.ssao_power = 1.5
	env.ssao_detail = 0.5
	env.ssao_light_affect = 0.0
	Quality.apply_environment(env)
	_env = WorldEnvironment.new()
	_env.environment = env
	add_child(_env)


func _terrain_at(x: int, y: int) -> String:
	if x < 0 or y < 0 or x >= map_w or y >= map_h:
		return ""
	var terrain: Array = world.get("terrain", [])
	var i := y * map_w + x
	return str(terrain[i]) if i < terrain.size() else ""


func _object_at(x: int, y: int) -> Dictionary:
	var id: Variant = world.get("occupancy", {}).get("%d,%d" % [x, y])
	if id == null:
		return {}
	var obj: Variant = world.get("objects", {}).get(str(int(id)))
	return obj if obj is Dictionary else {}


func _is_wall_tile(x: int, y: int) -> bool:
	return str(_object_at(x, y).get("kind", "")) == "saga_wall"


## A tile someone could stand on, as far as the walls are concerned (a gate tile counts: the faces beside it show).
func _is_open(x: int, y: int) -> bool:
	var t := _terrain_at(x, y)
	return t != "" and not Data.is_wall_terrain(t) and not _is_wall_tile(x, y)


func _build_floor(d: Dictionary) -> void:
	var floor_t := str(d.get("floor", "crypt"))
	var boss_t := str(d.get("bossFloor", floor_t))
	var groups: Dictionary = {} # [model, terrain] -> Array[Transform3D]
	for y in range(map_h):
		for x in range(map_w):
			var t := _terrain_at(x, y)
			if t == "" or Data.is_wall_terrain(t) or _is_wall_tile(x, y):
				continue
			var model: String
			if t == boss_t and boss_t != floor_t:
				model = FLOOR_BOSS
			else:
				var h := absi((x * 73856093) ^ (y * 19349663) ^ (x * y * 83492791))
				var v := h % 9
				model = FLOOR_MODELS[1] if v == 0 else (FLOOR_MODELS[2] if v == 1 else FLOOR_MODELS[0])
			var gk := [model, t, x / CHUNK, y / CHUNK]
			if not groups.has(gk):
				groups[gk] = []
			groups[gk].append(Transform3D(Basis.from_scale(Vector3.ONE * SCALE), Vector3(x + 0.5, 0.0, y + 0.5)))
	for gk in groups.keys():
		var colour: Color = tint() * FLOOR_TINT.get(gk[1], Color(1, 1, 1))
		var mesh := _tinted_mesh(KAYKIT + gk[0], colour)
		if mesh == null:
			continue
		_static.add_child(_multimesh(mesh, groups[gk], false))


func _build_walls() -> void:
	var caps: Dictionary = {} # chunk -> Array[Transform3D]
	var faces: Dictionary = {}
	var objects: Dictionary = world.get("objects", {})
	for obj in objects.values():
		if str(obj.get("kind", "")) != "saga_wall":
			continue
		var x := int(obj.get("x", 0))
		var y := int(obj.get("y", 0))
		if _exit_walls.has("%d,%d" % [x, y]):
			continue
		var chunk := Vector2i(x / CHUNK, y / CHUNK)
		if not caps.has(chunk):
			caps[chunk] = []
			faces[chunk] = []
		# the block's box is 1 cm lower than the wall (see wall_cap_mesh), so its top is never in the slabs' plane
		caps[chunk].append(Transform3D(Basis.IDENTITY, Vector3(x + 0.5, (DungeonProps.WALL_TOP - 0.01) / 2.0, y + 0.5)))
		var side := 0
		for dir in [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]:
			if not _is_open(x + dir.x, y + dir.y):
				continue
			var normal := Vector3(dir.x, 0.0, dir.y)
			# The KayKit slab is 0.5 m thick and its outer face lay exactly in the box's side, and its top in the
			# box's top: two surfaces in one plane, which flicker against each other (z-fighting, worst at the foot
			# of the wall and on its top). Now the slab stands 1 cm proud of the box and 2 cm lower than the
			# block's top (a further 1 mm per side, so two slabs meeting at a corner do not share a plane either).
			var origin := Vector3(x + 0.5, 0.0, y + 0.5) + normal * 0.51 - normal * 0.25
			var angle := atan2(-float(dir.x), float(dir.y))
			# the model spans x 0..2 (×0.5 = 0..1): pre-shifted so the edge's midpoint is its middle
			var t := Transform3D(Basis(Vector3.UP, angle), origin) * Transform3D(Basis(Vector3(SCALE, 0.0, 0.0), Vector3(0.0, SCALE * (0.99 - 0.001 * side), 0.0), Vector3(0.0, 0.0, SCALE)), Vector3(-0.5, 0.0, 0.0))
			side += 1
			faces[chunk].append(t)
	var cap_mesh := DungeonProps.wall_cap_mesh(tint())
	var face_mesh := _tinted_mesh(KAYKIT + "wall_half.gltf.glb", tint())
	for chunk in caps.keys():
		# the blocks are what the torches' shadows fall from; the slabs on their sides are 1 cm from the block
		# (they would draw the same shadow twice) and the floor is only ever lit
		_static.add_child(_multimesh(cap_mesh, caps[chunk], true))
		if face_mesh != null and not faces[chunk].is_empty():
			_static.add_child(_multimesh(face_mesh, faces[chunk], false))


func _multimesh(mesh: Mesh, transforms: Array, casts_shadow: bool) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = transforms.size()
	for i in range(transforms.size()):
		mm.set_instance_transform(i, transforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


# ---------------------------------------------------------------------------
# Objects


## The wall tile the way out's stairs go into: the wall next to the exit tile (Vector2i(0,0) when there is none).
func _exit_wall_of(x: int, y: int) -> Vector2i:
	for dir in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
		if _is_wall_tile(x + dir.x, y + dir.y):
			return dir
	return Vector2i(0, 0)


func _place(id: String, obj: Dictionary) -> void:
	var kind := str(obj.get("kind", ""))
	if kind == "saga_wall":
		return
	var x := int(obj.get("x", 0))
	var y := int(obj.get("y", 0))
	var variant := int(obj.get("variant", 0))
	var node := _make_prop(kind, variant, x, y)
	if node == null:
		return
	node.position = Vector3(x + 0.5, 0.0, y + 0.5)
	_objects_root.add_child(node)
	_props[id] = node


func _make_prop(kind: String, variant: int, x: int, y: int) -> Node3D:
	var node := Node3D.new()
	match kind:
		"saga_torch":
			# on the room's top wall, hanging out over the floor to the south
			var model := _instance(KAYKIT + "torch_mounted.gltf.glb", tint())
			if model != null:
				model.position = Vector3(0.0, 1.25, 0.5)
				_no_shadow(model)
				node.add_child(model)
			var flame := DungeonProps.flame(torch_colour(), 0.45, Quality.particles())
			flame.position = Vector3(0.0, 1.5, 0.68)
			node.add_child(flame)
			_add_light(node, Vector3(0.0, 1.7, 0.85), torch_colour(), 5.5, 3.0, 0.3)
		"saga_candles":
			var model := _instance(KAYKIT + "candle_triple.gltf.glb", tint())
			if model != null:
				_no_shadow(model)
				node.add_child(model)
			var flame := DungeonProps.flame(CANDLE_COLOUR, 0.18, mini(Quality.particles(), 4))
			flame.position = Vector3(0.0, 0.42, 0.0)
			node.add_child(flame)
			_add_light(node, Vector3(0.0, 0.7, 0.0), CANDLE_COLOUR, 3.0, 1.4, 0.3)
		"saga_exit":
			# stairs up into the wall beside the exit tile, and daylight falling down them
			var wall := _exit_wall_of(x, y)
			# (made only when there is a wall to go into: a model that is never added to the tree is never freed)
			var model := _instance(KAYKIT + "stairs.gltf.glb", tint() * 1.15, 0.2) if wall != Vector2i(0, 0) else null
			if model != null:
				model.position = Vector3(wall.x * 0.5, 0.0, wall.y * 0.5)
				model.rotation.y = atan2(float(wall.x), float(wall.y))
				node.add_child(model)
			_add_light(node, Vector3(wall.x * 0.6, 1.4, wall.y * 0.6), EXIT_COLOUR, 4.5, 2.0, 0.0)
		"saga_gate":
			node.add_child(DungeonProps.gate(tint()))
			# the bars go across the corridor: along X when it runs north–south
			if not (_is_open(x, y - 1) or _is_open(x, y + 1)):
				node.rotation.y = PI / 2.0
		"saga_rest":
			var lit := variant == 1
			node.add_child(DungeonProps.rest_stone(lit, tint()))
			if lit:
				_add_light(node, Vector3(0.0, 1.2, 0.0), REST_COLOUR, 5.0, 2.0, 0.1)
		"saga_chest":
			var model := _instance(KAYKIT + ("chest.glb" if variant == 0 else "chest_gold.glb"), tint() * 1.1)
			if model != null:
				model.position = Vector3(0.0, 0.08, -0.18)
				node.add_child(model)
		"saga_plate":
			var lit := variant == 1
			var model := _instance(KAYKIT + FLOOR_BOSS, tint() * (1.6 if lit else 0.9))
			if model != null:
				model.position = Vector3(0.0, 0.03, 0.0)
				node.add_child(model)
			if lit:
				_add_light(node, Vector3(0.0, 0.6, 0.0), PLATE_COLOUR, 2.4, 0.9, 0.1)
		"saga_coffin":
			node.add_child(DungeonProps.coffin(variant, tint()))
		"saga_bones":
			node.add_child(DungeonProps.bones(variant, tint()))
		"saga_urn":
			node.add_child(DungeonProps.urn(variant, tint()))
		_:
			if not _warned.has(kind):
				_warned[kind] = true
				push_warning("dungeon: no model for '%s' yet, a placeholder box is shown" % kind)
			node.add_child(DungeonProps.placeholder(tint()))
			if Data.object_def(kind).get("light", false):
				_add_light(node, Vector3(0.0, 0.8, 0.0), Color(1.0, 0.85, 0.6), 2.8, 0.8, 0.2)
	return node


func _add_light(parent: Node3D, at: Vector3, colour: Color, range_m: float, energy: float, flicker: float) -> void:
	var light := OmniLight3D.new()
	light.position = at
	light.light_color = colour
	light.omni_range = range_m
	light.omni_attenuation = 1.4
	light.light_energy = energy
	light.shadow_enabled = false
	# a light the camera is far from costs nothing: it fades out and is dropped from the clusters (Quality)
	light.distance_fade_enabled = true
	light.distance_fade_begin = Quality.LIGHT_FADE_BEGIN
	light.distance_fade_length = Quality.LIGHT_FADE_LENGTH
	light.distance_fade_shadow = Quality.SHADOW_FADE
	parent.add_child(light)
	_lights.append(light)
	if flicker > 0.0:
		_flicker.append([light, energy, randf() * TAU, flicker])


# ---------------------------------------------------------------------------
# KayKit models: loaded once, tinted to the dungeon (ART.md, "Recolouring imported packs")


func _scene(path: String) -> PackedScene:
	if _scenes.has(path):
		return _scenes[path]
	var scene: Variant = load(path) if ResourceLoader.exists(path) else null
	if not (scene is PackedScene):
		if not _warned.has(path):
			_warned[path] = true
			push_warning("dungeon: could not load %s (is the project imported?)" % path)
		scene = null
	_scenes[path] = scene
	return scene


func _instance(path: String, colour: Color, scale_by := SCALE) -> Node3D:
	var scene := _scene(path)
	if scene == null:
		return null
	var node: Node3D = scene.instantiate()
	_tint_node(node, colour)
	node.scale = Vector3.ONE * scale_by
	return node


## A thing that carries its own light throws no shadow (its bracket would land on the wall behind it).
func _no_shadow(node: Node) -> void:
	if node is GeometryInstance3D:
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for child in node.get_children():
		_no_shadow(child)


func _tint_node(node: Node, colour: Color) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		for i in range(mi.get_surface_override_material_count()):
			var m := mi.get_active_material(i)
			if m is BaseMaterial3D:
				mi.set_surface_override_material(i, _tinted_material(m, colour))
	for child in node.get_children():
		_tint_node(child, colour)


func _tinted_material(m: BaseMaterial3D, colour: Color) -> BaseMaterial3D:
	var k := [m.get_instance_id(), colour]
	if _materials.has(k):
		return _materials[k]
	var tinted: BaseMaterial3D = m.duplicate()
	tinted.albedo_color = colour
	_materials[k] = tinted
	return tinted


## The first mesh in a model, tinted, for a MultiMesh (the floor and the wall faces).
func _tinted_mesh(path: String, colour: Color) -> Mesh:
	var k := [path, colour]
	if _meshes.has(k):
		return _meshes[k]
	var scene := _scene(path)
	if scene == null:
		return null
	var node: Node = scene.instantiate()
	var mi := _first_mesh(node)
	var mesh: Mesh = null
	if mi != null:
		mesh = mi.mesh.duplicate()
		for i in range(mesh.get_surface_count()):
			var m := mi.get_active_material(i)
			if m is BaseMaterial3D:
				mesh.surface_set_material(i, _tinted_material(m, colour))
	node.free()
	_meshes[k] = mesh
	return mesh


func _first_mesh(node: Node) -> MeshInstance3D:
	if node is MeshInstance3D:
		return node
	for child in node.get_children():
		var found := _first_mesh(child)
		if found != null:
			return found
	return null
