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
## The ground of a run's zones (the biome's own floor: GAME.md section 1.1), drawn flat in the biome's colour with a little
## variation per tile; the walls, torches and decor are the dungeon's the biome borrows from.
const FLAT_FLOOR := {
	"grass": Color("#5f9a44"), "mud": Color("#5e4a34"), "gravel": Color("#8b877e"), "sand": Color("#d6c086"),
	"moss": Color("#4b7a3a"), "snow": Color("#e8eef4"), "ash": Color("#4b4745"),
}
const FLICKER_EVERY := 1.0 / 30.0
const CANDLE_COLOUR := Color(1.0, 0.78, 0.45)
const EXIT_COLOUR := Color(1.0, 0.95, 0.82)
const REST_COLOUR := Color(0.35, 0.92, 1.0)
const PLATE_COLOUR := Color(1.0, 0.9, 0.5)

var key := ""
var dungeon_id := ""
var look: Dictionary = DungeonLook.NEUTRAL ## the dungeon's row of the look table (dungeon_look.gd)
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
var zone := false ## a zone of a run (`saga:run<n>z<i>`)
var flat_floor := false ## a biome's ground (the zones) instead of the dungeon's flagstones
var look_name := "" ## which look this was built with (the biome, or the dungeon), so the view can tell when it is stale
var _vc_mat: StandardMaterial3D ## the vertex-colour material of the zone props (zone_props.gd)
var _weather := ""
var _weather_node: GPUParticles3D
var _motes_node: GPUParticles3D ## what drifts through the air of this look (snow, embers, wisps), following the hero


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
	_vc_mat = null
	_weather = ""
	_weather_node = null
	_motes_node = null
	world = {}
	key = ""
	dungeon_id = ""
	zone = false
	flat_floor = false
	look_name = ""


## Builds the whole map from its WorldState (`w`) under the area key `k`. A zone of a run passes its look (Data.zone_look).
func build(w: Dictionary, k: String, zone_look: Dictionary = {}) -> void:
	clear()
	world = w
	key = k
	dungeon_id = Data.dungeon_of_key(k)
	zone = Data.is_run_key(k)
	var d: Dictionary = zone_look if not zone_look.is_empty() else Data.dungeon(dungeon_id)
	flat_floor = zone and d.has("biome")
	look_name = str(d.get("biome", d.get("name", dungeon_id)))
	look = DungeonLook.resolve(dungeon_id, d)
	if flat_floor:
		look = DungeonLook.plain_air(look)
	map_w = int(w.get("w", 64))
	map_h = int(w.get("h", 64))
	_static = Node3D.new()
	_static.name = "Static"
	add_child(_static)
	_objects_root = Node3D.new()
	_objects_root.name = "Objects"
	add_child(_objects_root)
	_make_environment(d)
	_make_motes()
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
	return look["stone"]


func torch_colour() -> Color:
	return look["torch"]


# ---------------------------------------------------------------------------
# The ground and the walls


func _make_environment(d: Dictionary) -> void:
	var amb_arr: Array = d.get("ambient", [0.5, 0.5, 0.6])
	var amb := Color(float(amb_arr[0]), float(amb_arr[1]), float(amb_arr[2]))
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = amb * float(look["bg_k"])
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = amb
	env.ambient_light_energy = float(look["ambient_energy"]) # the browser's dungeonAmbient: the dungeon's colour turned down, so torches pool light
	env.fog_enabled = true
	env.fog_light_color = amb * float(look["fog_k"])
	env.fog_density = float(look["fog_density"])
	env.fog_sky_affect = 0.0
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.volumetric_fog_albedo = amb
	env.volumetric_fog_density = 0.03
	env.glow_intensity = float(look["glow"])
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
	if flat_floor:
		_build_floor_flat(d)
		return
	var floor_t := str(d.get("floor", "crypt"))
	var boss_t := str(d.get("bossFloor", floor_t))
	var groups: Dictionary = {} # [model, terrain] -> Array[Transform3D]
	for y in range(map_h):
		for x in range(map_w):
			var t := _terrain_at(x, y)
			if t == "" or Data.is_wall_terrain(t) or _is_wall_tile(x, y):
				continue
			var model: String
			var h := absi((x * 73856093) ^ (y * 19349663) ^ (x * y * 83492791))
			var v := h % 9
			if t == boss_t and boss_t != floor_t and bool(look["boss_decor"]):
				model = FLOOR_BOSS
			else:
				model = FLOOR_MODELS[1] if v == 0 else (FLOOR_MODELS[2] if v == 1 and bool(look["weeds"]) else FLOOR_MODELS[0])
			var gk := [model, t, x / CHUNK, y / CHUNK]
			if not groups.has(gk):
				groups[gk] = []
			groups[gk].append(Transform3D(Basis.from_scale(Vector3.ONE * SCALE), Vector3(x + 0.5, 0.0, y + 0.5)))
	for gk in groups.keys():
		var colour: Color = DungeonLook.floor_tint(look, str(gk[1]))
		var mesh := _tinted_mesh(KAYKIT + gk[0], colour)
		if mesh == null:
			continue
		_static.add_child(_multimesh(mesh, groups[gk], false))


## The biome's ground: one flat quad per tile in the biome's colour, a little lighter or darker by tile, one mesh per chunk
## (so a chunk is still lit by its own torches only).
func _build_floor_flat(d: Dictionary) -> void:
	var base: Color = FLAT_FLOOR.get(str(d.get("floor", "grass")), Color(0.5, 0.5, 0.5))
	var chunks: Dictionary = {} # Vector2i -> FarmMesh
	for y in range(map_h):
		for x in range(map_w):
			var t := _terrain_at(x, y)
			if t == "" or Data.is_wall_terrain(t) or _is_wall_tile(x, y):
				continue
			var ck := Vector2i(x / CHUNK, y / CHUNK)
			if not chunks.has(ck):
				chunks[ck] = FarmMesh.new()
			var h := float(absi((x * 73856093) ^ (y * 19349663) ^ (x * y * 83492791)) % 1000) / 1000.0
			var k := 0.9 + 0.2 * h
			var col := Color(base.r * k, base.g * k, base.b * k)
			var fb: FarmMesh = chunks[ck]
			fb.quad(Vector3(x, 0.0, y + 1), Vector3(x + 1, 0.0, y + 1), Vector3(x + 1, 0.0, y), Vector3(x, 0.0, y), col)
	for ck in chunks.keys():
		var mi := MeshInstance3D.new()
		mi.mesh = (chunks[ck] as FarmMesh).build()
		mi.material_override = _vertex_material()
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_static.add_child(mi)


func _vertex_material() -> StandardMaterial3D:
	if _vc_mat == null:
		_vc_mat = ZoneProps.material()
	return _vc_mat


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
	var cap_mesh := DungeonProps.wall_cap_mesh(tint() * float(look["cap_k"]))
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
		"run_exit":
			# the way on: a glowing rune disc on the floor with a beam of light over it
			var disc := CylinderMesh.new()
			disc.top_radius = 0.48
			disc.bottom_radius = 0.5
			disc.height = 0.05
			disc.radial_segments = 16
			node.add_child(DungeonProps._mesh_node(disc, DungeonProps.mat(Color(0.12, 0.3, 0.34), DungeonProps.RUNBLATT, 0.5), Vector3(0.0, 0.025, 0.0)))
			var rim := CylinderMesh.new()
			rim.top_radius = 0.58
			rim.bottom_radius = 0.6
			rim.height = 0.03
			rim.radial_segments = 16
			node.add_child(DungeonProps._mesh_node(rim, DungeonProps.mat(DungeonProps.KRYPTSTEN * tint(), Color.BLACK, 0.8), Vector3(0.0, 0.015, 0.0)))
			var beam := DungeonProps.flame(Color(0.55, 1.0, 0.9), 2.2, mini(Quality.particles(), 8))
			beam.position = Vector3(0.0, 0.1, 0.0)
			node.add_child(beam)
			if Quality.preset != "lag":
				_add_light(node, Vector3(0.0, 1.3, 0.0), Color(0.6, 1.0, 0.9), 5.5, 2.0, 0.15)
		_:
			var made := ZoneProps.make(kind, variant, _vertex_material())
			if made != null:
				node.add_child(made)
				var lt: Variant = ZoneProps.LIGHTS.get(kind)
				# (Låg gets the prop's glow and no light of its own)
				if lt is Array and Quality.preset != "lag":
					_add_light(node, Vector3(0.0, float(lt[3]), 0.0), lt[0], float(lt[1]), float(lt[2]), float(lt[4]))
				return node
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


# ---------------------------------------------------------------------------
# Weather in a zone (the RunSnap says which): fog in the air, and on Mellan and Hög something falling


## `kind` is a WeatherKind (sun, cloudy, rain, fog, wind, snow, hail, storm). Låg changes the fog only; the others add a
## falling-particle box that follows the hero (`follow_weather`), sized by the preset's weather budget.
func set_weather(kind: String) -> void:
	if kind == _weather:
		return
	_weather = kind
	if _weather_node != null:
		_weather_node.queue_free()
		_weather_node = null
	if _env != null and _env.environment != null:
		var fog: float = float(look["fog_density"])
		match kind:
			"fog":
				fog = 0.095
			"rain", "storm":
				fog = 0.05
			"snow", "hail":
				fog = 0.045
			"wind":
				fog = 0.04
		_env.environment.fog_density = fog
	var budget := int(Quality.spec().get("weather", 0)) / 3 if Quality.preset != "lag" else 0
	if budget <= 0 or not (kind in ["rain", "storm", "snow", "hail", "wind"]):
		return
	var quad := QuadMesh.new()
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(11.0, 0.2, 9.0)
	var colour := Color(0.75, 0.85, 1.0, 0.55)
	var life := 1.0
	match kind:
		"rain", "storm":
			quad.size = Vector2(0.02, 0.55)
			pm.direction = Vector3(0.12, -1.0, 0.0)
			pm.spread = 3.0
			pm.initial_velocity_min = 9.0
			pm.initial_velocity_max = 11.0
			life = 0.85
			if kind == "storm":
				budget = budget * 3 / 2
		"snow":
			quad.size = Vector2(0.07, 0.07)
			pm.direction = Vector3(0.1, -1.0, 0.0)
			pm.spread = 30.0
			pm.initial_velocity_min = 0.7
			pm.initial_velocity_max = 1.1
			colour = Color(1, 1, 1, 0.85)
			life = 7.5
		"hail":
			quad.size = Vector2(0.05, 0.12)
			pm.direction = Vector3(0.2, -1.0, 0.0)
			pm.spread = 6.0
			pm.initial_velocity_min = 9.0
			pm.initial_velocity_max = 12.0
			colour = Color(0.92, 0.97, 1.0, 0.85)
			life = 0.8
		_:
			# wind: pale dust blowing across
			quad.size = Vector2(0.06, 0.06)
			pm.direction = Vector3(1.0, -0.05, 0.25)
			pm.spread = 12.0
			pm.initial_velocity_min = 3.0
			pm.initial_velocity_max = 5.0
			colour = Color(0.85, 0.85, 0.8, 0.4)
			life = 4.0
			budget = budget / 3
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.albedo_color = colour
	quad.material = m
	var p := GPUParticles3D.new()
	p.amount = maxi(8, budget)
	p.lifetime = life
	p.preprocess = life
	p.local_coords = false
	p.process_material = pm
	p.draw_pass_1 = quad
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-14, -9, -12), Vector3(28, 12, 24))
	add_child(p)
	_weather_node = p


## The falling weather and the look's motes go where the hero goes.
func follow_weather(at: Vector3) -> void:
	if _motes_node != null:
		_motes_node.position = at + Vector3(0.0, 3.0, 0.0)
	if _weather_node != null:
		_weather_node.position = at + Vector3(0.0, 7.0, 0.0)


# ---------------------------------------------------------------------------
# What drifts through a dungeon's air (the look's `motes`): Mellan and Hög only, a quarter of the weather budget


func _make_motes() -> void:
	var kind := str(look.get("motes", ""))
	var budget := int(Quality.spec().get("weather", 0)) / 4 if Quality.preset != "lag" else 0
	if kind == "" or budget <= 0:
		return
	var quad := QuadMesh.new()
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(10.0, 2.5, 8.0)
	var colour := Color(1, 1, 1, 0.8)
	var life := 6.0
	var additive := false
	match kind:
		"snow":
			# slow flakes falling through the cold air
			quad.size = Vector2(0.06, 0.06)
			pm.direction = Vector3(0.15, -1.0, 0.0)
			pm.spread = 35.0
			pm.initial_velocity_min = 0.35
			pm.initial_velocity_max = 0.7
			life = 8.0
		"embers":
			# sparks lifting off the forge's fires
			quad.size = Vector2(0.05, 0.05)
			pm.direction = Vector3(0.1, 1.0, 0.0)
			pm.spread = 30.0
			pm.initial_velocity_min = 0.4
			pm.initial_velocity_max = 1.0
			colour = Color(1.0, 0.55, 0.2, 0.9)
			life = 5.0
			additive = true
		"dust":
			# the mine: grey dust hanging in the lamplight, now and then a gold glint (a warm tint, additive)
			quad.size = Vector2(0.05, 0.05)
			pm.direction = Vector3(0.2, -0.2, 0.1)
			pm.spread = 80.0
			pm.initial_velocity_min = 0.05
			pm.initial_velocity_max = 0.2
			colour = Color(1.0, 0.82, 0.45, 0.7)
			life = 9.0
			additive = true
		"bubbles":
			# the temple: pale bubbles rising slowly
			quad.size = Vector2(0.09, 0.09)
			pm.direction = Vector3(0.05, 1.0, 0.0)
			pm.spread = 20.0
			pm.initial_velocity_min = 0.3
			pm.initial_velocity_max = 0.7
			colour = Color(0.7, 0.95, 1.0, 0.45)
			life = 7.0
			additive = true
		"spores":
			# the grove: violet spores lifting off the mushrooms
			quad.size = Vector2(0.1, 0.1)
			pm.direction = Vector3(0.1, 1.0, 0.2)
			pm.spread = 50.0
			pm.initial_velocity_min = 0.1
			pm.initial_velocity_max = 0.35
			colour = Color(0.85, 0.6, 1.0, 0.6)
			life = 8.0
			additive = true
			budget = budget / 2
		_:
			# wisps: soft pale-green lights drifting sideways, slowly
			quad.size = Vector2(0.16, 0.16)
			pm.direction = Vector3(1.0, 0.1, 0.3)
			pm.spread = 60.0
			pm.initial_velocity_min = 0.15
			pm.initial_velocity_max = 0.4
			colour = Color(0.6, 1.0, 0.8, 0.5)
			life = 7.0
			additive = true
			budget = budget / 2
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.albedo_texture = DungeonProps._glow_texture()
	m.albedo_color = colour
	quad.material = m
	var p := GPUParticles3D.new()
	p.name = "Motes"
	p.amount = maxi(8, budget)
	p.lifetime = life
	p.preprocess = life
	p.local_coords = false
	p.process_material = pm
	p.draw_pass_1 = quad
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-14, -6, -12), Vector3(28, 12, 24))
	add_child(p)
	_motes_node = p
