class_name FarmView
extends Node3D
## Draws an outdoor map (the farm `farm`, and the wild maps `a:x,y` the same way) from the WorldState the server
## sends: the ground from the terrain grid (one mesh per 16 × 16 tiles with a vertex colour per tile, water drawn by
## its own shader), every object as a mesh from the free packs or a generated primitive (farm_assets.gd), the crops
## as stage meshes, and the lights of the lamps. Trees, rocks, fences and the like are instances in a MultiMesh per
## chunk and kind, so a forest of a thousand trees is a handful of draw calls; a house, a lamp or an arch is a node
## of its own (it carries a light or a glow). The map is kept current through `update_object`, `update_terrain` and
## `update_crop`, which dirty their chunk and the chunk is rebuilt on the next frame.
##
## The look of the day (the sun, the sky colour, the season and the weather) is day_night.gd's: it owns the sun, the
## environment and the weather particles and drives the shaders of the materials made here. One path for every
## outdoor map: the village, the beach and the other wild maps use it too, with placeholders for what has no mesh.

const CHUNK := 16
const SMALL := {"grass_tuft": true, "flower": true, "wild_flower_mid": true, "mushroom": true, "fern": true, "dig_spot": true, "shell": true, "reed": true, "rug": true, "door_out": true, "jungle_flower": true}
## The bank of a pond: how deep it goes (m) and where the surface lies.
const BED_Y := -0.42
const WATER_Y := -0.12
const CLIFF_H := 1.4
## Terrain: colour, how much snow settles on it (UV.x), glow (UV.y). water-like ground is not in here (LIQUID).
const GROUND := {
	"grass": [Color("#64a848"), 1.0, 0.0], "soil": [Color("#6e4a2c"), 0.8, 0.0], "soil_wet": [Color("#4c3220"), 0.5, 0.0],
	"sand": [Color("#e2d196"), 0.7, 0.0], "path_stone": [Color("#a7a49a"), 0.35, 0.0], "path_dirt": [Color("#a98a58"), 0.6, 0.0],
	"floor_wood": [Color("#a8793f"), 0.0, 0.0], "floor_stone": [Color("#8c8a84"), 0.2, 0.0], "snow": [Color("#f0f4f8"), 1.0, 0.0],
	"gravel": [Color("#9a968c"), 0.5, 0.0], "ice": [Color("#bfe3f2"), 0.2, 0.0], "road": [Color("#4d4f56"), 0.3, 0.0],
	"sidewalk": [Color("#b5b2aa"), 0.3, 0.0], "crossing": [Color("#4d4f56"), 0.3, 0.0], "rail": [Color("#8a8278"), 0.4, 0.0],
	"dirt": [Color("#7a5a3a"), 0.7, 0.0], "stone": [Color("#7c7d78"), 0.3, 0.0], "ash": [Color("#5a5654"), 0.5, 0.0],
	"mud": [Color("#5a4630"), 0.4, 0.0], "moss": [Color("#5f8a48"), 0.8, 0.0], "redsand": [Color("#c8704a"), 0.4, 0.0],
	"candy": [Color("#f0a8c8"), 0.0, 0.0], "moon": [Color("#b8b6b0"), 0.0, 0.0], "crypt": [Color("#5a6257"), 0.0, 0.0],
	"forge": [Color("#3a3438"), 0.0, 0.0], "bifrost": [Color("#d8d0e8"), 0.0, 0.0],
}
## Cliffs: the top colour; they stand CLIFF_H tall.
const CLIFF := {"rock": Color("#6c7076"), "sandstone": Color("#b8764a"), "basalt": Color("#3c3a40")}
## Liquids: which material draws them and the colour of the bed (lava has none: it glows at ground level).
const LIQUID := {"water": "water", "pool": "water", "bog": "bog", "choco": "choco", "lava": "lava"}
const BED := {"water": Color("#3c6270"), "pool": Color("#6aa8c0"), "bog": Color("#2a3320"), "choco": Color("#3a2010"), "lava": Color("#8a2a10")}
const GLOW_LAMP := Color("#ffc977")

var key := ""
var world: Dictionary = {}
var map_w := 64
var map_h := 64
var assets := FarmAssets.new()
var sky: DayNight

var _ground_root: Node3D
var _objects_root: Node3D
var _chunks: Dictionary = {} ## Vector2i -> Chunk
var _nodes: Dictionary = {} ## object id -> Node3D (the objects that are nodes)
var _ground: Dictionary = {} ## Vector2i -> Node3D
var _lights: Array[OmniLight3D] = []
var _flicker: Array = [] ## [light, base energy, phase, flicker amount, night kind]
var _night_glows: Array = [] ## [MeshInstance3D glow, base energy]
var _flicker_in := 0.0
var _t := 0.0
var _dark := 0.0
var _dirty_ground: Dictionary = {}
var _crops: Dictionary = {} ## "x,y" -> crop dictionary
var _drawn_counts := {"instances": 0, "multimeshes": 0}


class Chunk extends RefCounted:
	var objs: Dictionary = {} ## object id (String) -> true
	var crop_keys: Dictionary = {} ## "x,y" -> true
	var nodes: Array[Node] = []
	var dirty := true


func _ready() -> void:
	sky = DayNight.new()
	sky.name = "Sky"
	add_child(sky)


func _exit_tree() -> void:
	assets.release()


func _process(delta: float) -> void:
	if world.is_empty():
		return
	_t += delta
	for ck in _chunks.keys():
		var c: Chunk = _chunks[ck]
		if c.dirty:
			_rebuild_chunk(ck, c)
	for ck in _dirty_ground.keys():
		_build_ground_chunk(ck)
	_dirty_ground.clear()
	_flicker_in -= delta
	if _flicker_in > 0.0:
		return
	_flicker_in = 1.0 / 30.0
	var cam := get_viewport().get_camera_3d()
	var cam_at := cam.global_position if cam != null else Vector3.ZERO
	var far2 := (Quality.LIGHT_FADE_BEGIN + Quality.LIGHT_FADE_LENGTH) * (Quality.LIGHT_FADE_BEGIN + Quality.LIGHT_FADE_LENGTH)
	for f in _flicker:
		var light: OmniLight3D = f[0]
		if cam != null and light.global_position.distance_squared_to(cam_at) > far2:
			continue
		var depth: float = f[3]
		var wobble := 1.0 - depth * (0.5 + 0.35 * sin(_t * 9.0 + float(f[2])) + 0.15 * sin(_t * 23.0 + float(f[2]) * 1.7))
		var night_k: float = _dark if bool(f[4]) else 1.0
		light.light_energy = float(f[1]) * wobble * night_k
		light.visible = night_k > 0.02


func clear() -> void:
	for child in get_children():
		if child != sky:
			child.queue_free()
	_chunks = {}
	_nodes = {}
	_ground = {}
	_lights = []
	_flicker = []
	_night_glows = []
	_crops = {}
	_dirty_ground = {}
	world = {}
	key = ""


## Builds the whole map from its WorldState (`w`) under the area key `k`.
func build(w: Dictionary, k: String) -> void:
	clear()
	world = w
	key = k
	map_w = int(w.get("w", 64))
	map_h = int(w.get("h", 64))
	_ground_root = Node3D.new()
	_ground_root.name = "Ground"
	add_child(_ground_root)
	_objects_root = Node3D.new()
	_objects_root.name = "Objects"
	add_child(_objects_root)
	_crops = w.get("crops", {}).duplicate()
	for cy in range((map_h + CHUNK - 1) / CHUNK):
		for cx in range((map_w + CHUNK - 1) / CHUNK):
			_chunks[Vector2i(cx, cy)] = Chunk.new()
			_build_ground_chunk(Vector2i(cx, cy))
	for id in w.get("objects", {}).keys():
		var obj: Dictionary = w["objects"][id]
		_add_object(str(id), obj)
	for ck in _crops.keys():
		var p := str(ck).split(",")
		if p.size() == 2:
			_chunk_at(int(p[0]), int(p[1])).crop_keys[ck] = true
	# the map's own light: the sky works from the biome and the key
	sky.setup(self, str(w.get("biome", "")), k)
	if k == "farm":
		_light_the_house()


## The farmhouse room is a walled patch of the farm map with no roof to let the sun in at night: a warm light over the
## room and a cool one by its back wall (the window), both on only when it is dark (the lamps' own switch, `set_dark`).
func _light_the_house() -> void:
	var r: Dictionary = Data.interior
	var cx := float(r.get("x", 52)) + float(r.get("w", 10)) / 2.0
	var cy := float(r.get("y", 55)) + float(r.get("h", 6)) / 2.0
	_add_light(_objects_root, Vector3(cx, 2.3, cy + 0.5), Color("#ffc98a"), 9.0, 1.5, 0.05, true)
	_add_light(_objects_root, Vector3(cx - 1.0, 1.6, float(r.get("y", 55)) - 0.2), Color("#9bb8ff"), 6.0, 0.7, 0.0, true)


func biome() -> String:
	return str(world.get("biome", ""))


# ---------------------------------------------------------------------------
# Changes from the server


func update_object(id: String, obj: Variant) -> void:
	var old: Variant = _find_old(id)
	if old is Dictionary:
		_remove_object(id, old)
	if obj is Dictionary:
		_add_object(id, obj)


func _find_old(id: String) -> Variant:
	for ck in _chunks.keys():
		if (_chunks[ck] as Chunk).objs.has(id):
			return _last_objects.get(id)
	return _last_objects.get(id)


var _last_objects: Dictionary = {} ## id -> the object as it was drawn (kind, x, y, variant)


func update_terrain(x: int, y: int) -> void:
	_dirty_ground[Vector2i(x / CHUNK, y / CHUNK)] = true
	# the neighbours' edges (cliff sides, pond banks, the fences' own shapes) follow
	for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var nx: int = x + d.x
		var ny: int = y + d.y
		if nx >= 0 and ny >= 0 and nx < map_w and ny < map_h:
			_dirty_ground[Vector2i(nx / CHUNK, ny / CHUNK)] = true


func update_crop(k: String, crop: Variant) -> void:
	if crop is Dictionary:
		_crops[k] = crop
	else:
		_crops.erase(k)
	var p := k.split(",")
	if p.size() == 2:
		var c: Chunk = _chunk_at(int(p[0]), int(p[1]))
		if crop is Dictionary:
			c.crop_keys[k] = true
		else:
			c.crop_keys.erase(k)
		c.dirty = true


func _chunk_at(x: int, y: int) -> Chunk:
	var ck := Vector2i(clampi(x / CHUNK, 0, (map_w - 1) / CHUNK), clampi(y / CHUNK, 0, (map_h - 1) / CHUNK))
	if not _chunks.has(ck):
		_chunks[ck] = Chunk.new()
	return _chunks[ck]


func _add_object(id: String, obj: Dictionary) -> void:
	var kind := str(obj.get("kind", ""))
	var x := int(obj.get("x", 0))
	var y := int(obj.get("y", 0))
	_last_objects[id] = obj
	var spec := assets.spec(kind)
	if bool(spec.get("node", false)) or kind.begins_with("lm_"):
		var node := _make_node(kind, obj, spec)
		if node != null:
			var def := Data.object_def(kind)
			node.position = Vector3(x + float(def.get("w", 1)) * 0.5, 0.0, y + float(def.get("h", 1)) * 0.5)
			_objects_root.add_child(node)
			_nodes[id] = node
		return
	var c: Chunk = _chunk_at(x, y)
	c.objs[id] = true
	c.dirty = true
	if bool(spec.get("fence", false)):
		# the neighbours' rails reach for this one
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			_chunk_at(x + d.x, y + d.y).dirty = true


func _remove_object(id: String, obj: Dictionary) -> void:
	var x := int(obj.get("x", 0))
	var y := int(obj.get("y", 0))
	var node: Variant = _nodes.get(id)
	if node is Node:
		# its lights leave the lists with it
		for light in (node as Node).find_children("*", "OmniLight3D", true, false):
			_lights.erase(light)
			for i in range(_flicker.size() - 1, -1, -1):
				if _flicker[i][0] == light:
					_flicker.remove_at(i)
		for g in (node as Node).find_children("*", "MeshInstance3D", true, false):
			for i in range(_night_glows.size() - 1, -1, -1):
				if _night_glows[i][0] == g:
					_night_glows.remove_at(i)
		(node as Node).queue_free()
		_nodes.erase(id)
	var c: Chunk = _chunk_at(x, y)
	c.objs.erase(id)
	c.dirty = true
	_last_objects.erase(id)
	if bool(assets.spec(str(obj.get("kind", ""))).get("fence", false)):
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			_chunk_at(x + d.x, y + d.y).dirty = true


# ---------------------------------------------------------------------------
# The ground


func _terrain_at(x: int, y: int) -> String:
	if x < 0 or y < 0 or x >= map_w or y >= map_h:
		return ""
	var terrain: Array = world.get("terrain", [])
	var i := y * map_w + x
	return str(terrain[i]) if i < terrain.size() else ""


static func _h2(x: int, y: int, salt := 0) -> float:
	var h := absi((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791 + 5))
	return float(h % 1000) / 1000.0


func _is_liquid(t: String) -> bool:
	return LIQUID.has(t)


func _build_ground_chunk(ck: Vector2i) -> void:
	var old: Variant = _ground.get(ck)
	if old is Node:
		(old as Node).queue_free()
	var x0 := ck.x * CHUNK
	var y0 := ck.y * CHUNK
	var g := _Surf.new()
	var liquids: Dictionary = {} ## material name -> _Surf
	for y in range(y0, mini(y0 + CHUNK, map_h)):
		for x in range(x0, mini(x0 + CHUNK, map_w)):
			var t := _terrain_at(x, y)
			if t == "" or t == "space":
				continue
			var vary := 0.93 + 0.14 * _h2(x, y)
			if CLIFF.has(t):
				_cliff_tile(g, x, y, t, vary)
			elif LIQUID.has(t):
				_liquid_tile(g, liquids, x, y, t)
			else:
				var def: Array = GROUND.get(t, [Color("#8a7a9a"), 0.0, 0.0])
				var col: Color = def[0]
				col = Color(col.r * vary, col.g * vary, col.b * vary)
				if t == "soil" or t == "soil_wet":
					# furrows: four strips with a darker ridge between
					for i in range(4):
						var k := 0.86 if i % 2 == 0 else 1.06
						g.quad(Vector3(x, 0.0, y + 0.25 * i), Vector3(x, 0.0, y + 0.25 * (i + 1)), Vector3(x + 1, 0.0, y + 0.25 * (i + 1)), Vector3(x + 1, 0.0, y + 0.25 * i), Color(col.r * k, col.g * k, col.b * k), float(def[1]), float(def[2]))
				elif t == "crossing":
					for i in range(4):
						var kc := Color("#e8e4d8") if i % 2 == 0 else col
						g.quad(Vector3(x + 0.25 * i, 0.0, y), Vector3(x + 0.25 * i, 0.0, y + 1), Vector3(x + 0.25 * (i + 1), 0.0, y + 1), Vector3(x + 0.25 * (i + 1), 0.0, y), kc, 0.3, 0.0)
				elif t == "rail":
					g.quad(Vector3(x, 0.0, y), Vector3(x, 0.0, y + 1), Vector3(x + 1, 0.0, y + 1), Vector3(x + 1, 0.0, y), col, float(def[1]), 0.0)
					for rz in [0.3, 0.7]:
						g.quad(Vector3(x, 0.02, y + rz - 0.04), Vector3(x, 0.02, y + rz + 0.04), Vector3(x + 1, 0.02, y + rz + 0.04), Vector3(x + 1, 0.02, y + rz - 0.04), Color("#6a6a70"), 0.0, 0.0)
				else:
					g.quad(Vector3(x, 0.0, y), Vector3(x, 0.0, y + 1), Vector3(x + 1, 0.0, y + 1), Vector3(x + 1, 0.0, y), col, float(def[1]), float(def[2]))
	var root := Node3D.new()
	root.name = "G%d_%d" % [ck.x, ck.y]
	if not g.is_empty():
		var mi := MeshInstance3D.new()
		mi.mesh = g.build()
		mi.material_override = assets.ground_mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mi)
	for mname in liquids.keys():
		var s: _Surf = liquids[mname]
		var mi2 := MeshInstance3D.new()
		mi2.mesh = s.build()
		mi2.material_override = _liquid_material(str(mname))
		mi2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mi2)
	_ground_root.add_child(root)
	_ground[ck] = root


func _liquid_material(n: String) -> ShaderMaterial:
	match n:
		"bog":
			return assets.bog_mat
		"lava":
			return assets.lava_mat
		"choco":
			return assets.choco_mat
	return assets.water_mat


func _cliff_tile(g: _Surf, x: int, y: int, t: String, vary: float) -> void:
	var top: Color = CLIFF[t]
	var h := CLIFF_H * (0.85 + 0.3 * _h2(x, y, 3))
	var col := Color(top.r * vary, top.g * vary, top.b * vary)
	g.quad(Vector3(x, h, y), Vector3(x, h, y + 1), Vector3(x + 1, h, y + 1), Vector3(x + 1, h, y), col, 0.2, 0.0)
	var side := Color(top.r * 0.62, top.g * 0.62, top.b * 0.62)
	var dirs := [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]
	for d in dirs:
		var n := _terrain_at(x + d.x, y + d.y)
		if n == "" or CLIFF.has(n):
			continue
		var depth := BED_Y if LIQUID.has(n) else 0.0
		var a := Vector3(x, 0.0, y)
		var b := Vector3(x + 1, 0.0, y)
		var c := Vector3(x + 1, 0.0, y + 1)
		var e := Vector3(x, 0.0, y + 1)
		var hv := Vector3(0.0, h, 0.0)
		var dv := Vector3(0.0, depth, 0.0)
		if d == Vector2i(0, 1):
			g.quad(e + hv, e + dv, c + dv, c + hv, side, 0.0, 0.0)
		elif d == Vector2i(0, -1):
			g.quad(b + hv, b + dv, a + dv, a + hv, side, 0.0, 0.0)
		elif d == Vector2i(1, 0):
			g.quad(c + hv, c + dv, b + dv, b + hv, side, 0.0, 0.0)
		else:
			g.quad(a + hv, a + dv, e + dv, e + hv, side, 0.0, 0.0)


func _liquid_tile(g: _Surf, liquids: Dictionary, x: int, y: int, t: String) -> void:
	var kind: String = LIQUID[t]
	var surface: _Surf = liquids.get(kind) if liquids.has(kind) else _Surf.new()
	liquids[kind] = surface
	var level := WATER_Y if kind != "lava" else -0.04
	if t == "pool":
		level = -0.05
	var bed: Color = BED.get(t, Color("#3c6270"))
	if kind != "lava":
		g.quad(Vector3(x, BED_Y, y), Vector3(x, BED_Y, y + 1), Vector3(x + 1, BED_Y, y + 1), Vector3(x + 1, BED_Y, y), bed, 0.0, 0.0)
		# the bank: earth walls down to the bed wherever the neighbour is land
		var dirs := [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]
		for d in dirs:
			var n := _terrain_at(x + d.x, y + d.y)
			if n == "" or LIQUID.has(n) or CLIFF.has(n):
				continue
			var earth := Color("#7a5a3a") if n != "sand" else Color("#c8b47a")
			var a := Vector3(x, 0.0, y)
			var b := Vector3(x + 1, 0.0, y)
			var c := Vector3(x + 1, 0.0, y + 1)
			var e := Vector3(x, 0.0, y + 1)
			var dv := Vector3(0.0, BED_Y, 0.0)
			if d == Vector2i(0, 1):
				g.quad(c, c + dv, e + dv, e, earth, 0.0, 0.0)
			elif d == Vector2i(0, -1):
				g.quad(a, a + dv, b + dv, b, earth, 0.0, 0.0)
			elif d == Vector2i(1, 0):
				g.quad(b, b + dv, c + dv, c, earth, 0.0, 0.0)
			else:
				g.quad(e, e + dv, a + dv, a, earth, 0.0, 0.0)
	# the surface: the corner's alpha is how near the bank it is (the foam line)
	var land := func(dx: int, dy: int) -> float:
		var n := _terrain_at(x + dx, y + dy)
		return 0.0 if (n == "" or LIQUID.has(n)) else 1.0
	var n_a: float = maxf(land.call(0, -1), land.call(-1, 0))
	var n_b: float = maxf(land.call(0, -1), land.call(1, 0))
	var n_c: float = maxf(land.call(0, 1), land.call(1, 0))
	var n_d: float = maxf(land.call(0, 1), land.call(-1, 0))
	surface.quad4(Vector3(x, level, y), Vector3(x, level, y + 1), Vector3(x + 1, level, y + 1), Vector3(x + 1, level, y), [Color(1, 1, 1, n_a), Color(1, 1, 1, n_d), Color(1, 1, 1, n_c), Color(1, 1, 1, n_b)])


## Flat-coloured quads in one ArrayMesh surface: UV carries the snow and glow of the ground shader.
class _Surf extends RefCounted:
	var v := PackedVector3Array()
	var c := PackedColorArray()
	var n := PackedVector3Array()
	var uv := PackedVector2Array()

	func is_empty() -> bool:
		return v.is_empty()

	func quad(a: Vector3, b: Vector3, cc: Vector3, d: Vector3, col: Color, snow: float, glow: float) -> void:
		var lc := col.srgb_to_linear()
		var nrm := (b - a).cross(cc - a)
		nrm = nrm.normalized() if nrm.length_squared() > 0.000001 else Vector3.UP
		# written counter-clockwise seen from outside; Godot draws the clockwise side, so the corners go in reversed
		for p in [a, cc, b, a, d, cc]:
			v.append(p)
			c.append(Color(lc.r, lc.g, lc.b, 1.0))
			n.append(nrm)
			uv.append(Vector2(snow, glow))

	func quad4(a: Vector3, b: Vector3, cc: Vector3, d: Vector3, alphas: Array) -> void:
		var pts := [a, cc, b, a, d, cc]
		var idx := [0, 2, 1, 0, 3, 2]
		for i in range(6):
			v.append(pts[i])
			c.append(alphas[idx[i]])
			n.append(Vector3.UP)
			uv.append(Vector2.ZERO)

	func build() -> ArrayMesh:
		var m := ArrayMesh.new()
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = v
		arrays[Mesh.ARRAY_NORMAL] = n
		arrays[Mesh.ARRAY_COLOR] = c
		arrays[Mesh.ARRAY_TEX_UV] = uv
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		return m


# ---------------------------------------------------------------------------
# Objects: instances per chunk


func _rebuild_chunk(ck: Vector2i, c: Chunk) -> void:
	for n in c.nodes:
		n.queue_free()
	c.nodes.clear()
	c.dirty = false
	var groups: Dictionary = {} ## [mesh name, casts shadow] -> Array of [Transform3D, Color custom]
	for id in c.objs.keys():
		var obj: Variant = _last_objects.get(id)
		if not (obj is Dictionary):
			continue
		_instance_object(str(id), obj, groups)
	for ckey in c.crop_keys.keys():
		var crop: Variant = _crops.get(ckey)
		if not (crop is Dictionary):
			continue
		var p := str(ckey).split(",")
		var def: Dictionary = Data.crops.get(str(crop.get("crop", "")), {})
		var stages := int(def.get("stages", 3))
		var st := int(crop.get("stage", 0))
		var tier := 0 if st <= 0 else (2 if st >= stages else 1)
		var mname := "crop_%s_%d" % [str(crop.get("crop", "")), tier]
		var gk := [mname, false]
		if not groups.has(gk):
			groups[gk] = []
		var cx := int(p[0])
		var cy := int(p[1])
		for dz in [0.25, 0.75]:
			for dx in [0.25, 0.75]:
				var yaw := _h2(cx, cy, 7) * TAU
				groups[gk].append([Transform3D(Basis(Vector3.UP, yaw), Vector3(cx + dx, 0.0, cy + dz)), Color(_h2(cx, cy, 9), _h2(cx, cy, 10), 0, 0)])
	for gk in groups.keys():
		var m := assets.mesh(str(gk[0]))
		if m == null:
			continue
		var list: Array = groups[gk]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = m
		mm.instance_count = list.size()
		for i in range(list.size()):
			mm.set_instance_transform(i, list[i][0])
			mm.set_instance_custom_data(i, list[i][1])
			mm.set_instance_color(i, Color.WHITE)
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = assets.prop_mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if bool(gk[1]) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_objects_root.add_child(mmi)
		c.nodes.append(mmi)


func _instance_object(id: String, obj: Dictionary, groups: Dictionary) -> void:
	var kind := str(obj.get("kind", ""))
	var x := int(obj.get("x", 0))
	var y := int(obj.get("y", 0))
	var def := Data.object_def(kind)
	var w := int(def.get("w", 1))
	var h := int(def.get("h", 1))
	var spec := assets.spec(kind)
	var mname := ""
	if spec.is_empty():
		assets.warn_once(kind, "farm: no model for '%s' yet, a placeholder box is shown" % kind)
		mname = "ph_%dx%d" % [w, h]
	else:
		var list: Array = spec.get("m", [])
		if bool(spec.get("by_variant", false)):
			mname = str(list[int(obj.get("variant", 0)) % list.size()])
		else:
			mname = str(list[int(_h2(x, y, 1) * list.size()) % list.size()])
		if bool(spec.get("fence", false)):
			var mask := 0
			if _is_fence(x, y - 1):
				mask |= 1
			if _is_fence(x + 1, y):
				mask |= 2
			if _is_fence(x, y + 1):
				mask |= 4
			if _is_fence(x - 1, y):
				mask |= 8
			if kind == "gate" and mask == 0:
				mask = 10
			mname = ("gatef_%d" if kind == "gate" else "fence_%d") % mask
	var casts := not SMALL.has(kind)
	var gk := [mname, casts]
	if not groups.has(gk):
		groups[gk] = []
	var jitter := 0.0
	if SMALL.has(kind) or kind == "bush":
		jitter = 0.25
	var at := Vector3(x + w * 0.5 + (_h2(x, y, 2) - 0.5) * jitter * 2.0, float(spec.get("lift", 0.0)), y + h * 0.5 + (_h2(x, y, 4) - 0.5) * jitter * 2.0)
	var yaw := 0.0
	if str(spec.get("yaw", "none")) == "free":
		yaw = _h2(x, y, 5) * TAU
	var grow: Array = spec.get("grow", [1.0, 1.0])
	var sc := float(spec.get("s", 1.0)) * lerpf(float(grow[0]), float(grow[1]), _h2(x, y, 6))
	groups[gk].append([Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * sc), at), Color(_h2(x, y, 8), _h2(x, y, 11), 0, 0)])


func _is_fence(x: int, y: int) -> bool:
	var id: Variant = world.get("occupancy", {}).get("%d,%d" % [x, y])
	if id == null:
		return false
	var o: Variant = world.get("objects", {}).get(str(int(id)))
	return o is Dictionary and (str(o.get("kind", "")) == "fence" or str(o.get("kind", "")) == "gate")


# ---------------------------------------------------------------------------
# Objects that are nodes: houses, lamps, arches, the cave


func _make_node(kind: String, obj: Dictionary, spec: Dictionary) -> Node3D:
	var node := Node3D.new()
	node.name = kind
	var x := int(obj.get("x", 0))
	var y := int(obj.get("y", 0))
	var variant := int(obj.get("variant", 0))
	var mname := ""
	var list: Array = spec.get("m", [])
	if not list.is_empty():
		mname = str(list[variant % list.size()]) if bool(spec.get("by_variant", false)) else str(list[0])
	if kind.begins_with("lm_"):
		return _landmark(kind, node)
	var m := assets.mesh(mname) if mname != "" else null
	if m != null:
		var mi := MeshInstance3D.new()
		mi.mesh = m
		mi.material_override = assets.prop_mat
		node.add_child(mi)
	elif mname != "":
		assets.warn_once(mname, "farm: no mesh '%s' for %s" % [mname, kind])
	match kind:
		"house":
			# the farmhouse stands on its 5 × 4 footprint; its windows shine at night
			node.position = Vector3.ZERO
			if node.get_child_count() > 0:
				var d := node.get_child(0) as Node3D
				d.position = Vector3(0.0, 0.0, 0.2)
			for wx in [-1.0, 1.2]:
				var g := assets.glow_quad(Color("#ffc977"), 0.9, 0.0)
				g.position = Vector3(wx, 1.1, 1.9)
				node.add_child(g)
				_night_glows.append([g, 1.6])
			_add_light(node, Vector3(0.0, 1.0, 2.8), Color("#ffc977"), 6.0, 1.3, 0.12, true)
		"saga_portal":
			var colours: Array = DungeonView.TORCH_COLOURS
			var col: Color = colours[variant % colours.size()]
			var g2 := assets.glow_quad(col, 1.8, 1.4)
			g2.position = Vector3(0.0, 1.05, 0.2)
			node.add_child(g2)
			_add_light(node, Vector3(0.0, 1.4, 1.2), col, 5.5, 1.8, 0.25, false)
			# the arch is 3 tiles wide and 2 deep: its middle
			node.position = Vector3.ZERO
		"cave", "cave_mouth":
			_add_light(node, Vector3(0.0, 0.8, 1.0), Color("#8aa0c8"), 3.5, 0.6, 0.0, false)
		"fardport":
			# the run arch: a teal-gold glow in the doorway (the saga portal's, in the Världsträd's colours) and its light
			var fcol := Color("#7fe8c0")
			var fg := assets.glow_quad(fcol, 1.8, 1.4)
			fg.position = Vector3(0.0, 1.0, 0.1)
			node.add_child(fg)
			var fg2 := assets.glow_quad(Color("#f0e27a"), 0.7, 1.0)
			fg2.position = Vector3(0.0, 2.55, 0.5)
			node.add_child(fg2)
			_add_light(node, Vector3(0.0, 1.4, 1.2), fcol, 5.5, 1.6, 0.25, false)
		"yggdrasil":
			# only the Världsträd itself (stage 4) shines
			if variant >= 4:
				var ycol := Color("#bff7d8")
				var yg := assets.glow_quad(ycol, 4.5, 0.9)
				yg.position = Vector3(0.0, 3.4, 0.0)
				_billboard(yg)
				node.add_child(yg)
				_add_light(node, Vector3(0.0, 3.0, 0.8), ycol, 7.0, 1.4, 0.2, false)
		"smithy":
			var ex := assets.mesh("smithy_extras")
			if ex != null:
				var emi := MeshInstance3D.new()
				emi.mesh = ex
				emi.material_override = assets.prop_mat
				emi.position = Vector3(1.0, 0.0, 1.2)
				node.add_child(emi)
	# windows that shine at night (the village's shop, pizzeria and station)
	var glows: Variant = spec.get("glows")
	if glows is Array:
		for gp in glows:
			var gw := assets.glow_quad(Color("#ffc977"), 0.9, 0.0)
			gw.position = Vector3(float(gp[0]), float(gp[1]), float(gp[2]))
			node.add_child(gw)
			_night_glows.append([gw, 1.6])
	var lt: Variant = spec.get("light")
	if lt is Array:
		var night := bool(spec.get("night", false))
		var lcol: Color = lt[0]
		_add_light(node, Vector3(0.0, float(lt[3]), 0.0), lcol, float(lt[1]), float(lt[2]), float(lt[4]), night, float(lt[5]) if lt.size() > 5 else -1.0)
		if night:
			var gq := assets.glow_quad(lcol, 1.4, 0.0)
			gq.position = Vector3(0.0, float(lt[3]), 0.0)
			_billboard(gq)
			node.add_child(gq)
			_night_glows.append([gq, 0.9])
	return node


func _billboard(mi: MeshInstance3D) -> void:
	var q := mi.mesh as QuadMesh
	if q != null:
		var m := mi.material_override as ShaderMaterial
		# (a billboarded additive quad is made with the glow shader's own matrix in the vertex shader: see farm_assets)
		mi.set_instance_shader_parameter("billboard", true) if false else null
	# the camera never turns, so a quad facing it is enough
	mi.rotation_degrees = Vector3(-51.0, 0.0, 0.0)


## A landmark (lm_*) is a 3 × 3 (or 4 × 3) feature of the wild maps: a standing-stone circle, a giant's ribs, a bridge.
## Until each has a mesh of its own it is a dressed placeholder: a cairn of rocks in its footprint.
func _landmark(kind: String, node: Node3D) -> Node3D:
	assets.warn_once(kind, "farm: no model for landmark '%s' yet, a cairn is shown" % kind)
	var def := Data.object_def(kind)
	var m := assets.mesh("ph_%dx%d" % [int(def.get("w", 3)), int(def.get("h", 3))])
	if m != null:
		var mi := MeshInstance3D.new()
		mi.mesh = m
		mi.material_override = assets.prop_mat
		node.add_child(mi)
	if def.get("light", false):
		_add_light(node, Vector3(0.0, 1.4, 0.0), Color("#cfe8ff"), 5.0, 1.0, 0.1, false)
	return node


func _add_light(parent: Node3D, at: Vector3, colour: Color, range_m: float, energy: float, flicker: float, night: bool, fade_begin := -1.0) -> void:
	var light := OmniLight3D.new()
	light.position = at
	light.light_color = colour
	light.omni_range = range_m
	light.omni_attenuation = 1.4
	light.light_energy = 0.0 if night else energy
	light.shadow_enabled = false
	light.distance_fade_enabled = true
	# (a street of lamps fades sooner than a lone lamp: the village must not light more than the crypt does)
	light.distance_fade_begin = Quality.LIGHT_FADE_BEGIN if fade_begin < 0.0 else fade_begin
	light.distance_fade_length = Quality.LIGHT_FADE_LENGTH if fade_begin < 0.0 else 4.0
	light.distance_fade_shadow = Quality.SHADOW_FADE
	light.visible = not night
	parent.add_child(light)
	_lights.append(light)
	_flicker.append([light, energy, randf() * TAU, flicker, night])


## 0 bright day … 1 deep night: the lamps' strength and the windows' shine (day_night.gd calls this).
func set_dark(dark: float) -> void:
	_dark = dark
	for g in _night_glows:
		var mi: MeshInstance3D = g[0]
		if is_instance_valid(mi):
			var k := smoothstep(0.4, 0.9, dark)
			(mi.material_override as ShaderMaterial).set_shader_parameter("energy", float(g[1]) * k)
			mi.visible = k > 0.02


# ---------------------------------------------------------------------------
# Counters for the HUD and the bench


func light_count() -> int:
	return _lights.size()


func lights_near(at: Vector3) -> int:
	var n := 0
	for light in _lights:
		if light.visible and light.light_energy > 0.0 and light.global_position.distance_to(at) < light.distance_fade_begin + light.distance_fade_length:
			n += 1
	return n


func shadow_light_count() -> int:
	return 0


func update_shadows(_at: Vector3, _n: int) -> void:
	pass


func object_count() -> int:
	return _nodes.size() + _last_objects.size()
