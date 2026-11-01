class_name FarmAssets
extends RefCounted
## What the farm and the wild maps are made of: the meshes (baked from the free CC0 packs, or generated in code
## from the ART.md palette), the object kinds' look (SPECS) and the shared materials. One instance lives inside
## the FarmView and is dropped with it, so nothing is kept alive at exit.
##
## Imported models (Kenney Castle Kit, KayKit Medieval Hexagon Pack) are *baked*: their triangles are copied with
## the colour their texture has at each vertex (both packs paint with a palette strip), re-centred on the tile with
## their foot on y = 0 and scaled to metres. Every prop then shares one vertex-colour material (farm_prop.gdshader),
## which is what lets the season's leaf colour, snow, rain and wind act on all of them, and what lets a hundred
## trees be one draw call (a MultiMesh per chunk). A kind with no entry in SPECS gets a placeholder box and one
## warning, so the generic path always shows something where the server put an object.

const KENNEY := "res://assets/kenney_castle/"
const HEX := "res://assets/kaykit_hex/"
const DUNGEON_KAYKIT := "res://assets/kaykit/"
const PROP_SHADER := "res://assets/shaders/farm_prop.gdshader"
const GROUND_SHADER := "res://assets/shaders/farm_ground.gdshader"
const WATER_SHADER := "res://assets/shaders/farm_water.gdshader"

# The palette (ART.md): the named colours of the twelve, and the farm's own beside them.
const GRASS := Color("#64a848")
const MOSS := Color("#4f8231")
const WOOD := Color("#86582f")
const WOOD_LIGHT := Color("#a8793f")
const IRON := Color("#5e626c")
const GOLD := Color("#e8b830")
const BONE := Color("#e2d6b8")
const EMBER := Color("#ffa040")
const RUNE := Color("#38d8f0")
const STONE := Color("#7c7d78")
const STONE_DARK := Color("#5f625f")
const THATCH := Color("#c9a24d")
const ROOF_RED := Color("#a83a2c")
const CLOTH := Color("#d9d2c0")

## kind -> how it is drawn. m: mesh name (or a list the tile's hash picks from); s: scale; fit: [w, d] metres to
## scale an imported model into; yaw: "free" (a random turn per tile), "none"; lift: metres; node: its own node
## (not a MultiMesh instance); light: [colour, range m, energy, height m, flicker].
const SPECS := {
	# --- trees, plants and rocks
	"tree": {"m": ["oak_a", "oak_b", "oak_c"], "yaw": "free", "grow": [0.9, 1.15]},
	"tree_apple": {"m": ["apple_a", "apple_b"], "yaw": "free", "grow": [0.9, 1.1]},
	"tree_pine": {"m": ["pine_a", "pine_b"], "yaw": "free", "grow": [0.85, 1.2]},
	"tree_snow": {"m": ["pine_a", "pine_b"], "yaw": "free", "grow": [0.85, 1.2]},
	"stump": {"m": ["stump"], "yaw": "free"},
	"dead_tree": {"m": ["dead_a", "dead_b"], "yaw": "free", "grow": [0.9, 1.2]},
	"saga_deadtree": {"m": ["dead_a", "dead_b"], "yaw": "free"},
	"palm": {"m": ["palm"], "yaw": "free", "grow": [0.9, 1.15]},
	"jungle_tree": {"m": ["oak_a", "oak_c"], "yaw": "free", "s": 1.3},
	"rock": {"m": ["rock_big_a", "rock_big_b", "rock_big_c"], "yaw": "free", "grow": [0.9, 1.15]},
	"rock_small": {"m": ["rock_small_a", "rock_small_b", "rock_small_c"], "yaw": "free", "grow": [0.8, 1.2]},
	"boulder": {"m": ["rock_big_a", "rock_big_b"], "yaw": "free", "s": 1.3},
	"bush": {"m": ["bush_a", "bush_b"], "yaw": "free", "grow": [0.85, 1.15]},
	"blueberry_bush": {"m": ["berry_blue"], "yaw": "free"},
	"cloudberry": {"m": ["berry_cloud"], "yaw": "free"},
	"iceberry": {"m": ["berry_ice"], "yaw": "free"},
	"wild_pumpkin": {"m": ["pumpkin"], "yaw": "free"},
	"grass_tuft": {"m": ["tuft_a", "tuft_b", "tuft_c"], "yaw": "free", "grow": [0.8, 1.2]},
	"flower": {"m": ["flower_0", "flower_1", "flower_2", "flower_3"], "by_variant": true, "yaw": "free"},
	"wild_flower_mid": {"m": ["flower_2"], "yaw": "free"},
	"jungle_flower": {"m": ["flower_1"], "yaw": "free", "s": 1.3},
	"mushroom": {"m": ["mushroom"], "yaw": "free"},
	"fern": {"m": ["fern"], "yaw": "free"},
	"reed": {"m": ["reed"], "yaw": "free", "grow": [0.8, 1.3]},
	"shell": {"m": ["shell"], "yaw": "free"},
	"cactus": {"m": ["cactus"], "yaw": "free"},
	"dig_spot": {"m": ["dig"], "yaw": "free"},
	"glowshroom": {"m": ["mushroom"], "yaw": "free", "light": [Color("#9cff8a"), 2.4, 0.7, 0.3, 0.2], "node": true},
	# --- the farm
	"house": {"m": ["house"], "node": true, "front": true},
	"fence": {"m": ["fence"], "fence": true},
	"gate": {"m": ["gate"], "fence": true},
	"wall_wood": {"m": ["wall_wood"]},
	"wall_stone": {"m": ["wall_stone"]},
	"door": {"m": ["door"]},
	"door_out": {"m": ["door_mat"]},
	"window": {"m": ["window"]},
	"mailbox": {"m": ["shop"], "front": true},
	"sellbox": {"m": ["sellbox"], "front": true},
	"wardrobe": {"m": ["wardrobe"], "front": true},
	"start_chest": {"m": ["chest"], "front": true},
	"chest": {"m": ["chest"], "front": true},
	"loot_chest": {"m": ["chest"], "front": true},
	"start_bench": {"m": ["workbench"], "front": true},
	"workbench": {"m": ["workbench"], "front": true},
	"trough": {"m": ["trough"], "front": true},
	"well": {"m": ["well"], "node": true},
	"town_well": {"m": ["well"], "node": true},
	"bus_stop": {"m": ["bus_stop"], "node": true, "front": true},
	"cave": {"m": ["cave_mouth"], "node": true},
	"cave_mouth": {"m": ["cave_mouth"], "node": true},
	"saga_portal": {"m": ["arch"], "node": true},
	"scarecrow": {"m": ["scarecrow"]},
	"bench": {"m": ["bench"], "front": true},
	"flowerbox": {"m": ["flowerbox"]},
	"barrel": {"m": ["barrel"], "yaw": "free"},
	"barrel_stack": {"m": ["barrel", "barrel"], "yaw": "free"},
	"coop": {"m": ["coop"], "front": true},
	"hutch": {"m": ["hutch"], "front": true},
	"sheepfold": {"m": ["sheepfold"], "front": true},
	"barn": {"m": ["barn"], "front": true},
	"stall": {"m": ["stall"], "front": true},
	"pigsty": {"m": ["pigsty"], "front": true},
	"lamp": {"m": ["lamp"], "node": true, "light": [Color("#ffc977"), 6.0, 1.4, 1.5, 0.15], "night": true},
	"street_lamp": {"m": ["lamp"], "node": true, "light": [Color("#ffc977"), 7.0, 1.5, 2.2, 0.1, 12.0], "night": true},
	"lantern": {"m": ["lantern"], "node": true, "light": [Color("#ffb55a"), 5.0, 1.2, 0.6, 0.25], "night": true},
	"torch": {"m": ["torch"], "node": true, "light": [Color("#ff9a3c"), 5.5, 1.5, 1.3, 0.35], "night": true},
	"crystal_lamp": {"m": ["lantern"], "node": true, "light": [Color("#9fe8ff"), 5.0, 1.0, 0.6, 0.1]},
	"mushroom_lamp": {"m": ["mushroom"], "node": true, "light": [Color("#ffd27a"), 4.0, 0.9, 0.5, 0.1]},
	"wisp": {"m": ["wisp"], "node": true, "light": [Color("#bfe8ff"), 3.5, 0.9, 1.0, 0.3]},
	"rug": {"m": ["rug"]},
	"bed": {"m": ["bed"], "front": true},
	"table": {"m": ["table"]},
	"chair": {"m": ["chair"]},
	"sofa": {"m": ["sofa"], "front": true},
	"bookshelf": {"m": ["bookshelf"], "front": true},
	"plant": {"m": ["houseplant"]},
	"painting": {"m": ["painting"]},
	"clock": {"m": ["clock"]},
	"stove": {"m": ["stove"], "front": true, "node": true, "light": [Color("#ff8a3a"), 3.2, 0.8, 0.5, 0.3]},
	"hay_cart": {"m": ["hay_cart"]},
	"snowman": {"m": ["snowman"]},
	"xmas_tree": {"m": ["xmas_tree"]},
	"maypole": {"m": ["maypole"]},
	"pumpkin_lantern": {"m": ["pumpkin"], "node": true, "light": [Color("#ff9a3c"), 3.0, 0.9, 0.4, 0.3]},
	# --- Köpingen (city.ts): the Norse market town; its streets are ground, these are what stands on them
	"house_small": {"m": ["house_b"], "front": true},
	"apartment": {"m": ["apartment"], "front": true},
	"shop": {"m": ["village_shop"], "node": true, "front": true, "glows": [[-0.8, 0.8, 0.95], [0.8, 0.8, 0.95]], "light": [Color("#ffc977"), 5.5, 1.2, 1.2, 0.1], "night": true},
	"market": {"m": ["market"], "front": true},
	"sellstall": {"m": ["sell_stall"], "front": true},
	"pizzeria": {"m": ["pizzeria"], "node": true, "front": true, "glows": [[-0.8, 0.75, 0.9], [0.8, 0.75, 0.9]], "light": [Color("#ffb55a"), 5.5, 1.3, 1.2, 0.15], "night": true},
	"bathhouse": {"m": ["bathhouse"], "front": true},
	"train_station": {"m": ["station"], "node": true, "front": true, "glows": [[-0.8, 0.7, 0.75], [0.8, 0.7, 0.75]], "light": [Color("#ffd98a"), 6.0, 1.2, 1.6, 0.1], "night": true},
	"traffic_light": {"m": ["traffic_light"]},
	"parked_car": {"m": ["car_0", "car_1", "car_2"], "by_variant": true},
	"banner_pole": {"m": ["banner_0", "banner_1", "banner_2"], "by_variant": true},
	"runestone": {"m": ["runestone"], "node": true, "light": [Color("#38d8f0"), 4.0, 0.9, 1.0, 0.1]},
	"saga_stone": {"m": ["kampasten"], "node": true, "light": [Color("#38d8f0"), 5.0, 1.2, 1.3, 0.12]},
}

var assets_root := ""
var _meshes: Dictionary = {}
var _warned: Dictionary = {}
var prop_mat: ShaderMaterial
var ground_mat: ShaderMaterial
var water_mat: ShaderMaterial
var bog_mat: ShaderMaterial
var lava_mat: ShaderMaterial
var choco_mat: ShaderMaterial
var glow_mat: ShaderMaterial ## unshaded additive glows (arch, windows' light pool)
var _gtex: Dictionary = {}
var _glow_tex: Texture2D


func _init() -> void:
	prop_mat = ShaderMaterial.new()
	prop_mat.shader = load(PROP_SHADER)
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = load(GROUND_SHADER)
	water_mat = _water(Color("#52a8d1"), Color("#1f5788"), 0.84)
	bog_mat = _water(Color("#5d6b3a"), Color("#2f3a22"), 0.9)
	lava_mat = _water(Color("#ff8a2a"), Color("#c03a12"), 1.0)
	lava_mat.set_shader_parameter("glint", 0.0)
	choco_mat = _water(Color("#7a4a2a"), Color("#4a2a16"), 0.95)
	glow_mat = ShaderMaterial.new()
	glow_mat.shader = _glow_shader()


func release() -> void:
	_meshes.clear()
	_gtex.clear()
	_glow_tex = null
	prop_mat = null
	ground_mat = null
	water_mat = null
	bog_mat = null
	lava_mat = null
	choco_mat = null
	glow_mat = null


func _water(shallow: Color, deep: Color, alpha: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(WATER_SHADER)
	m.set_shader_parameter("shallow", shallow)
	m.set_shader_parameter("deep", deep)
	m.set_shader_parameter("alpha", alpha)
	return m


func _glow_shader() -> Shader:
	var s := Shader.new()
	s.code = "shader_type spatial;\nrender_mode unshaded, blend_add, depth_draw_never, cull_disabled;\nuniform vec3 colour : source_color = vec3(1.0);\nuniform float energy = 1.0;\nvoid fragment() { float d = length(UV - vec2(0.5)) * 2.0; float k = clamp(1.0 - d, 0.0, 1.0); ALBEDO = colour * energy * k * k; }\n"
	return s


## The soft round glow texture is the shader's own UV falloff; a quad with this material is a glow.
func glow_quad(colour: Color, size: float, energy: float, flat := false) -> MeshInstance3D:
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	if flat:
		q.orientation = PlaneMesh.FACE_Y
	var mi := MeshInstance3D.new()
	mi.mesh = q
	var m := glow_mat.duplicate() as ShaderMaterial
	m.set_shader_parameter("colour", colour)
	m.set_shader_parameter("energy", energy)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


func spec(kind: String) -> Dictionary:
	var s: Variant = SPECS.get(kind)
	return s if s is Dictionary else {}


func has_spec(kind: String) -> bool:
	return SPECS.has(kind) or kind.begins_with("lm_")


func warn_once(what: String, text: String) -> void:
	if not _warned.has(what):
		_warned[what] = true
		push_warning(text)


# ---------------------------------------------------------------------------
# Meshes by name


## A mesh by name: generated or baked on the first ask, then kept. null for a name nobody knows.
func mesh(mesh_name: String) -> ArrayMesh:
	if _meshes.has(mesh_name):
		return _meshes[mesh_name]
	var m := _make(mesh_name)
	_meshes[mesh_name] = m
	return m


func _make(n: String) -> ArrayMesh:
	if n.begins_with("fence_"):
		return _fence(int(n.substr(6)), false)
	if n.begins_with("gatef_"):
		return _fence(int(n.substr(6)), true)
	if n.begins_with("ph_"):
		var wh := n.substr(3).split("x")
		return _placeholder(int(wh[0]), int(wh[1]))
	if n.begins_with("crop_"):
		var parts := n.split("_")
		return _crop(parts[1], int(parts[2]))
	match n:
		"oak_a": return _oak(1.0, 1)
		"oak_b": return _oak(1.1, 2)
		"oak_c": return _oak(0.9, 3)
		"apple_a": return _oak(0.95, 4, true)
		"apple_b": return _oak(1.05, 5, true)
		"pine_a": return _baked(KENNEY + "tree-large.glb", 1.6, "pine")
		"pine_b": return _baked(KENNEY + "tree-small.glb", 1.8, "pine")
		"stump": return _baked(HEX + "tree_single_A_cut.gltf", 2.6, "wood")
		"dead_a": return _dead(1.0, 1)
		"dead_b": return _dead(1.2, 2)
		"palm": return _palm()
		"rock_big_a": return _baked(KENNEY + "rocks-large.glb", 1.1, "stone")
		"rock_big_b": return _baked(HEX + "rock_single_E.gltf", 3.2, "stone")
		"rock_big_c": return _baked(HEX + "rock_single_C.gltf", 3.6, "stone")
		"rock_small_a": return _baked(KENNEY + "rocks-small.glb", 1.2, "stone")
		"rock_small_b": return _baked(HEX + "rock_single_B.gltf", 3.0, "stone")
		"rock_small_c": return _baked(HEX + "rock_single_D.gltf", 3.0, "stone")
		"bush_a": return _bush(Color("#4f8a3a"), 1)
		"bush_b": return _bush(Color("#5a9a42"), 2)
		"berry_blue": return _bush(Color("#4a7e3c"), 3, Color("#4a5fd0"))
		"berry_cloud": return _bush(Color("#6b9a4a"), 4, Color("#f0a640"), 0.6)
		"berry_ice": return _bush(Color("#6fa4a0"), 5, Color("#9fd8ff"), 0.7)
		"pumpkin": return _pumpkin()
		"tuft_a": return _tuft(1)
		"tuft_b": return _tuft(2)
		"tuft_c": return _tuft(3)
		"flower_0": return _flower(Color("#e84a5a"), 1)
		"flower_1": return _flower(Color("#f0d24a"), 2)
		"flower_2": return _flower(Color("#f4f0e4"), 3)
		"flower_3": return _flower(Color("#9a6ae0"), 4)
		"mushroom": return _mushroom()
		"fern": return _fern()
		"reed": return _reed()
		"shell": return _shell()
		"cactus": return _cactus()
		"dig": return _dig()
		"house": return _baked(HEX + "building_home_A_red.gltf", 0.0, "house", Vector2(4.6, 3.6))
		"well": return _baked(HEX + "building_well_red.gltf", 0.0, "house", Vector2(1.2, 1.2))
		"barn": return _baked(HEX + "building_grain.gltf", 0.0, "house", Vector2(2.8, 1.9))
		"stall": return _baked(HEX + "building_tavern_red.gltf", 0.0, "house", Vector2(2.7, 1.8))
		"fence": return _fence(0, false)
		"gate": return _fence(5, true)
		"wall_wood": return _wall(WOOD_LIGHT.darkened(0.15))
		"wall_stone": return _wall(STONE)
		"door": return _door()
		"door_mat": return _door_mat()
		"window": return _window()
		"shop": return _shop()
		"sellbox": return _sellbox()
		"wardrobe": return _wardrobe()
		"chest": return _chest()
		"workbench": return _workbench()
		"trough": return _trough()
		"bus_stop": return _bus_stop()
		"cave_mouth": return _cave()
		"arch": return _arch()
		"scarecrow": return _scarecrow()
		"bench": return _bench()
		"flowerbox": return _flowerbox()
		"barrel": return _baked(HEX + "barrel.gltf", 3.2, "wood")
		"coop": return _shed(2, 2, Color("#b8864a"), Color("#8a5a2a"), 0.9, 0.5)
		"hutch": return _shed(1, 1, Color("#a8793f"), Color("#7a5230"), 0.55, 0.3)
		"sheepfold": return _shed(2, 2, Color("#c9b28a"), Color("#7a6a50"), 0.8, 0.45)
		"pigsty": return _shed(2, 2, Color("#b27a5a"), Color("#8a4a3a"), 0.8, 0.45)
		"lamp": return _lamp()
		"lantern": return _lantern()
		"torch": return _torch()
		"wisp": return _wisp()
		"rug": return _rug()
		"bed": return _bed()
		"table": return _table()
		"chair": return _chair()
		"sofa": return _sofa()
		"bookshelf": return _bookshelf()
		"houseplant": return _houseplant()
		"painting": return _painting()
		"clock": return _clock()
		"stove": return _stove()
		"hay_cart": return _hay_cart()
		"snowman": return _snowman()
		"xmas_tree": return _xmas_tree()
		"maypole": return _maypole()
		"house_b": return _baked(HEX + "building_home_B_red.gltf", 0.0, "house", Vector2(2.7, 2.6))
		"apartment": return _apartment()
		"village_shop": return _baked(HEX + "building_tavern_red.gltf", 0.0, "house", Vector2(2.8, 1.8))
		"market": return _baked(HEX + "building_market_red.gltf", 0.0, "house", Vector2(1.9, 1.9))
		"sell_stall": return _sell_stall()
		"pizzeria": return _pizzeria()
		"bathhouse": return _bathhouse()
		"station": return _station()
		"traffic_light": return _traffic_light()
		"car_0": return _car(Color("#c8473a"))
		"car_1": return _car(Color("#3a6ac8"))
		"car_2": return _car(Color("#e8c43a"))
		"banner_0": return _banner(Color("#c8473a"))
		"banner_1": return _banner(Color("#3a6ac8"))
		"banner_2": return _banner(Color("#e8c43a"))
		"runestone": return _runestone(false)
		"kampasten": return _runestone(true)
	return null


# ---------------------------------------------------------------------------
# Baking the imported models


## Copies a model's triangles with the colour its palette strip has under each vertex, re-centres it (feet on y = 0,
## middle on the origin) and scales it: by `scale`, or to fit `fit` metres (width, depth) when that is given.
## `recolour`: "pine" turns the pack's teal into the pine green, "stone" greys the blue, "wood" and "house" keep
## the pack's colours (the house gets a snow-catching roof by being plain vertex colour like the rest).
func _baked(path: String, scale: float, recolour: String, fit := Vector2.ZERO) -> ArrayMesh:
	var scene: Variant = load(path) if ResourceLoader.exists(path) else null
	if not (scene is PackedScene):
		warn_once(path, "farm: could not load %s (is the project imported?)" % path)
		return null
	var root: Node = (scene as PackedScene).instantiate()
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var uvs := PackedVector2Array()
	_collect(root, Transform3D.IDENTITY, verts, norms, cols, recolour)
	root.free()
	if verts.is_empty():
		return null
	var lo := verts[0]
	var hi := verts[0]
	for v in verts:
		lo = lo.min(v)
		hi = hi.max(v)
	var size := hi - lo
	var k := scale
	if fit != Vector2.ZERO:
		k = minf(fit.x / maxf(0.001, size.x), fit.y / maxf(0.001, size.z))
	var mid := Vector3((lo.x + hi.x) * 0.5, lo.y, (lo.z + hi.z) * 0.5)
	for i in range(verts.size()):
		verts[i] = (verts[i] - mid) * k
		uvs.append(Vector2.ZERO)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


func _collect(node: Node, xf: Transform3D, verts: PackedVector3Array, norms: PackedVector3Array, cols: PackedColorArray, recolour: String) -> void:
	var here := xf
	if node is Node3D:
		here = xf * (node as Node3D).transform
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		var mi := node as MeshInstance3D
		var basis := here.basis
		for s in range(mi.mesh.get_surface_count()):
			var arr := mi.mesh.surface_get_arrays(s)
			var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var nrm: Variant = arr[Mesh.ARRAY_NORMAL]
			var uv: Variant = arr[Mesh.ARRAY_TEX_UV]
			var idx: Variant = arr[Mesh.ARRAY_INDEX]
			var mat: Material = mi.get_active_material(s)
			var img: Image = null
			var tint := Color.WHITE
			if mat is BaseMaterial3D:
				tint = (mat as BaseMaterial3D).albedo_color
				var tex := (mat as BaseMaterial3D).albedo_texture
				if tex != null:
					img = tex.get_image()
					if img != null and img.is_compressed():
						img.decompress()
			var order: PackedInt32Array
			if idx is PackedInt32Array and not (idx as PackedInt32Array).is_empty():
				order = idx
			else:
				order = PackedInt32Array(range(v.size()))
			for i in order:
				verts.append(here * v[i])
				norms.append((basis * (nrm[i] if nrm is PackedVector3Array else Vector3.UP)).normalized())
				var c := tint
				if img != null and uv is PackedVector2Array:
					var p: Vector2 = uv[i]
					var px := clampi(int(p.x * img.get_width()), 0, img.get_width() - 1)
					var py := clampi(int(p.y * img.get_height()), 0, img.get_height() - 1)
					c = img.get_pixel(px, py) * tint
				cols.append(_recolour(c, recolour))
	for child in node.get_children():
		_collect(child, here, verts, norms, cols, recolour)


## The palette pass: the packs' colours, nudged to the ART.md palette; the result is linear with the foliage mask
## in alpha (0: none of the baked models is deciduous foliage).
func _recolour(c: Color, mode: String) -> Color:
	var out := c
	if mode == "pine":
		# the pack's teal greens become the pine's: darker, bluer than the oak's
		if c.g > c.r * 1.1 and c.g >= c.b * 0.9:
			var lum := c.get_luminance()
			out = Color("#3f7a45").lerp(Color("#79b25a"), clampf((lum - 0.3) * 1.8, 0.0, 1.0))
	elif mode == "stone":
		var g := c.get_luminance()
		out = c.lerp(Color(g, g, g), 0.45) * Color(1.0, 1.0, 0.97)
		out = out.lerp(STONE, 0.3)
	elif mode == "wood":
		out = c.lerp(WOOD, 0.25)
	return FarmMesh.lin(out, 1.0)


# ---------------------------------------------------------------------------
# Generated props


func _rnd(seed_v: float, i: float) -> float:
	return fposmod(sin((seed_v * 31.7 + i * 7.13) * 12.9898) * 43758.5453, 1.0)


func _oak(size_k: float, seed_v: int, apples := false) -> ArrayMesh:
	var b := FarmMesh.new()
	var trunk_h := 0.75 * size_k
	b.cylinder(Vector3.ZERO, 0.17 * size_k, 0.11 * size_k, trunk_h, 6, WOOD.darkened(0.15), WOOD, 0.0)
	var low := Color("#2f6a2c")
	var high := Color("#88c456")
	# the crown: one big blob and three smaller on top and to the sides
	b.blob(Vector3(0.0, trunk_h + 0.55 * size_k, 0.0), Vector3(0.8, 0.62, 0.8) * size_k, 7, 4, low, high, 1.0, 0.1, seed_v)
	b.blob(Vector3(0.35 * size_k, trunk_h + 0.35 * size_k, 0.15 * size_k), Vector3(0.5, 0.4, 0.5) * size_k, 6, 3, low, high, 1.0, 0.1, seed_v + 1.0)
	b.blob(Vector3(-0.3 * size_k, trunk_h + 0.9 * size_k, -0.1 * size_k), Vector3(0.5, 0.42, 0.5) * size_k, 6, 3, low, high, 1.0, 0.1, seed_v + 2.0)
	if apples:
		for i in range(6):
			var a := TAU * (i + _rnd(seed_v, i)) / 6.0
			var r := 0.7 * size_k
			var y := trunk_h + (0.35 + 0.4 * _rnd(seed_v, i + 9)) * size_k
			b.blob(Vector3(cos(a) * r * 0.85, y, sin(a) * r * 0.85), Vector3.ONE * 0.075, 5, 2, Color("#b02a2a"), Color("#e8483a"), 0.0, 0.0)
	return b.build()


func _dead(size_k: float, seed_v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var col := Color("#6a5848")
	b.cylinder(Vector3.ZERO, 0.17 * size_k, 0.08 * size_k, 1.5 * size_k, 5, col.darkened(0.2), col, 0.0)
	for i in range(4):
		var a := TAU * (i + _rnd(seed_v, i)) / 4.0
		var y := (0.7 + 0.25 * i) * size_k
		b.blade(Vector3(0.0, y, 0.0), Vector3(cos(a) * 0.7, y + 0.55, sin(a) * 0.7) * size_k * Vector3(1, 1, 1), 0.1, col, col.lightened(0.1), 0.0, a)
	return b.build()


func _palm() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.14, 0.09, 1.7, 5, Color("#8a6a40"), Color("#a8844e"), 0.0)
	for i in range(6):
		var a := TAU * i / 6.0
		b.blade(Vector3(0.0, 1.65, 0.0), Vector3(cos(a) * 0.95, 1.5, sin(a) * 0.95), 0.34, Color("#3a8a3a"), Color("#74c04e"), 1.0, a)
	return b.build()


func _bush(col: Color, seed_v: int, berry := Color(-1, 0, 0), berry_k := 0.5) -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.28, 0.0), Vector3(0.45, 0.32, 0.45), 6, 3, col.darkened(0.3), col.lightened(0.18), 1.0, 0.12, seed_v)
	b.blob(Vector3(0.22, 0.2, 0.1), Vector3(0.28, 0.22, 0.28), 5, 2, col.darkened(0.3), col.lightened(0.1), 1.0, 0.1, seed_v + 1.0)
	if berry.r >= 0.0:
		for i in range(7):
			var a := TAU * (i + _rnd(seed_v, i)) / 7.0
			b.blob(Vector3(cos(a) * 0.4, 0.2 + 0.25 * _rnd(seed_v, i + 4), sin(a) * 0.4), Vector3.ONE * 0.05 * (1.0 + berry_k), 4, 2, berry.darkened(0.2), berry, 0.0, 0.0)
	return b.build()


func _pumpkin() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.18, 0.0), Vector3(0.28, 0.2, 0.28), 8, 4, Color("#c8561a"), Color("#f08a2a"), 0.0, 0.0)
	b.cylinder(Vector3(0.0, 0.36, 0.0), 0.04, 0.03, 0.1, 4, Color("#4a7a2a"), Color("#4a7a2a"), 0.0)
	return b.build()


func _tuft(seed_v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	for i in range(5):
		var a := TAU * (i + _rnd(seed_v, i)) / 5.0
		var h := 0.2 + 0.18 * _rnd(seed_v, i + 3)
		b.blade(Vector3(cos(a) * 0.05, 0.0, sin(a) * 0.05), Vector3(cos(a) * 0.14, h, sin(a) * 0.14), 0.07, GRASS.darkened(0.25), GRASS.lightened(0.15), 1.0, a)
	return b.build()


func _flower(petal: Color, seed_v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	b.blade(Vector3.ZERO, Vector3(0.0, 0.3, 0.0), 0.04, GRASS.darkened(0.2), GRASS, 1.0)
	b.blade(Vector3(0.0, 0.1, 0.0), Vector3(0.1, 0.2, 0.0), 0.08, GRASS.darkened(0.1), GRASS.lightened(0.1), 1.0, 0.4 * seed_v)
	b.blob(Vector3(0.0, 0.33, 0.0), Vector3(0.1, 0.05, 0.1), 5, 2, petal.darkened(0.15), petal, 0.0, 0.0)
	b.blob(Vector3(0.0, 0.36, 0.0), Vector3(0.035, 0.03, 0.035), 4, 2, Color("#e8b830"), Color("#f4d060"), 0.0, 0.0)
	return b.build()


func _mushroom() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.05, 0.04, 0.16, 5, BONE.darkened(0.1), BONE, 0.0)
	b.cone(Vector3(0.0, 0.13, 0.0), 0.15, 0.1, 7, Color("#c8402a"), Color("#e86a4a"), 0.0)
	b.blob(Vector3(0.05, 0.22, 0.03), Vector3.ONE * 0.025, 4, 2, Color("#f4f0e4"), Color("#ffffff"), 0.0, 0.0)
	return b.build()


func _fern() -> ArrayMesh:
	var b := FarmMesh.new()
	for i in range(6):
		var a := TAU * i / 6.0
		b.blade(Vector3.ZERO, Vector3(cos(a) * 0.32, 0.28, sin(a) * 0.32), 0.1, Color("#2f6a2c"), Color("#6aa84a"), 1.0, a)
	return b.build()


func _reed() -> ArrayMesh:
	var b := FarmMesh.new()
	for i in range(4):
		var a := TAU * i / 4.0
		b.blade(Vector3(cos(a) * 0.05, 0.0, sin(a) * 0.05), Vector3(cos(a) * 0.1, 0.85 + 0.15 * (i % 2), sin(a) * 0.1), 0.05, Color("#6a7a3a"), Color("#b0b06a"), 0.0, a)
	b.cylinder(Vector3(0.0, 0.62, 0.0), 0.035, 0.035, 0.18, 4, Color("#6a4a2a"), Color("#8a5a30"), 0.0)
	return b.build()


func _shell() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.12, 0.06, 0.1), 6, 2, Color("#e8b0a0"), Color("#f8e0d4"), 0.0, 0.0)
	return b.build()


func _cactus() -> ArrayMesh:
	var b := FarmMesh.new()
	var col := Color("#4a8a4a")
	b.cylinder(Vector3.ZERO, 0.17, 0.15, 0.9, 6, col.darkened(0.15), col, 0.0)
	b.cylinder(Vector3(0.17, 0.4, 0.0), 0.08, 0.07, 0.3, 5, col.darkened(0.1), col, 0.0)
	return b.build()


func _dig() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.03, 0.0), Vector3(0.3, 0.05, 0.25), 7, 2, Color("#5a3a22"), Color("#7a5232"), 0.0, 0.15)
	return b.build()


func _crop(id: String, tier: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var leaf := Color("#4f9a3a")
	var ripe := Color("#e8832a")
	match id:
		"morot": ripe = Color("#ee8a24")
		"potatis": ripe = Color("#c9a368")
		"jordgubbe": ripe = Color("#d8283a")
		"tomat": ripe = Color("#d8321e")
		"pumpa": ripe = Color("#ee7a1a")
		"solros": ripe = Color("#f4c82a")
		"vete": ripe = Color("#d8b24a")
	if tier == 0:
		for i in range(2):
			b.blade(Vector3.ZERO, Vector3(0.05 * (i * 2 - 1), 0.16, 0.0), 0.08, leaf.darkened(0.1), leaf.lightened(0.2), 0.0, i * 1.5)
		return b.build()
	if id == "solros":
		var h := 0.5 if tier == 1 else 1.05
		b.cylinder(Vector3.ZERO, 0.035, 0.03, h, 4, leaf.darkened(0.2), leaf, 0.0)
		b.blade(Vector3(0.0, h * 0.4, 0.0), Vector3(0.22, h * 0.55, 0.0), 0.14, leaf.darkened(0.1), leaf, 0.0, 0.3)
		b.blade(Vector3(0.0, h * 0.55, 0.0), Vector3(-0.22, h * 0.7, 0.0), 0.14, leaf.darkened(0.1), leaf, 0.0, 0.3)
		if tier >= 2:
			b.cylinder(Vector3(0.0, h, 0.0), 0.17, 0.17, 0.05, 8, ripe.darkened(0.1), ripe, 0.0)
			b.cylinder(Vector3(0.0, h + 0.02, 0.0), 0.08, 0.08, 0.04, 6, Color("#5a3a1e"), Color("#5a3a1e"), 0.0)
		return b.build()
	if id == "vete":
		var h2 := 0.45 if tier == 1 else 0.75
		var col := leaf if tier == 1 else ripe
		for i in range(7):
			var a := TAU * i / 7.0
			b.blade(Vector3(cos(a) * 0.07, 0.0, sin(a) * 0.07), Vector3(cos(a) * 0.13, h2, sin(a) * 0.13), 0.05, col.darkened(0.2), col.lightened(0.1), 0.0, a)
		return b.build()
	# the rest: a leafy plant, and when ripe the fruit or root showing
	for i in range(5):
		var a := TAU * (i + 0.3) / 5.0
		b.blade(Vector3.ZERO, Vector3(cos(a) * 0.2, 0.22 if tier == 1 else 0.3, sin(a) * 0.2), 0.14, leaf.darkened(0.2), leaf.lightened(0.1), 0.0, a)
	if tier >= 2:
		match id:
			"jordgubbe", "tomat":
				for i in range(3):
					var a2 := TAU * (i + 0.5) / 3.0
					b.blob(Vector3(cos(a2) * 0.13, 0.13, sin(a2) * 0.13), Vector3.ONE * 0.07, 5, 3, ripe.darkened(0.2), ripe, 0.0, 0.0)
			"pumpa":
				b.blob(Vector3(0.0, 0.17, 0.0), Vector3(0.26, 0.2, 0.26), 8, 4, ripe.darkened(0.25), ripe, 0.0, 0.0)
			_:
				b.cone(Vector3(0.0, 0.08, 0.0), 0.07, -0.16, 5, ripe, ripe.darkened(0.2), 0.0)
				b.blob(Vector3(0.0, 0.07, 0.0), Vector3(0.09, 0.04, 0.09), 5, 2, ripe, ripe.lightened(0.1), 0.0, 0.0)
	return b.build()


## A fence tile: a post and rails towards each neighbour in `mask` (1 north, 2 east, 4 south, 8 west). A gate is the
## same with the middle rails left out and a bar swung open.
func _fence(mask: int, gate: bool) -> ArrayMesh:
	var b := FarmMesh.new()
	var col := WOOD_LIGHT
	b.box(Vector3(0.0, 0.34, 0.0), Vector3(0.13, 0.68, 0.13), col, 0.0, 0.0, col.lightened(0.1))
	var dirs := [[1, Vector3(0, 0, -1)], [2, Vector3(1, 0, 0)], [4, Vector3(0, 0, 1)], [8, Vector3(-1, 0, 0)]]
	for d in dirs:
		if mask & int(d[0]) == 0:
			continue
		var dir: Vector3 = d[1]
		var yaw := atan2(dir.x, dir.z)
		for y in [0.28, 0.5]:
			if gate and y == 0.28:
				continue
			b.box(dir * 0.25 + Vector3(0.0, y, 0.0), Vector3(0.06, 0.07, 0.5), col.darkened(0.05), 0.0, yaw)
	if gate:
		# the gate's own bar, swung open to one side
		b.box(Vector3(0.22, 0.4, 0.1), Vector3(0.05, 0.3, 0.36), col.lightened(0.05), 0.0, 0.5)
	return b.build()


func _placeholder(w: int, h: int) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.4, 0.0), Vector3(maxf(0.5, w - 0.2), 0.8, maxf(0.5, h - 0.2)), Color("#9a80b8"), 0.0, 0.0, Color("#b89ad4"))
	return b.build()


func _wall(col: Color) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.05, 0.0), Vector3(1.0, 2.1, 1.0), col, 0.0, 0.0, col.lightened(0.1))
	return b.build()


func _door() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.95, 0.0), Vector3(0.9, 1.9, 0.18), WOOD.darkened(0.1), 0.0)
	b.box(Vector3(0.28, 0.9, 0.12), Vector3(0.08, 0.08, 0.06), GOLD, 0.0)
	return b.build()


func _door_mat() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.02, 0.0), Vector3(0.8, 0.04, 0.5), Color("#8a3a2c"), 0.0)
	return b.build()


func _window() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.1, 0.0), Vector3(0.9, 1.0, 0.16), WOOD, 0.0)
	b.box(Vector3(0.0, 1.1, 0.07), Vector3(0.62, 0.7, 0.06), Color("#a8d8f0"), 0.5)
	return b.build()


func _shop() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.3, 0.1), Vector3(0.95, 0.6, 0.5), WOOD, 0.0, 0.0, WOOD_LIGHT)
	b.box(Vector3(-0.4, 0.8, -0.15), Vector3(0.08, 1.6, 0.08), WOOD.darkened(0.1), 0.0)
	b.box(Vector3(0.4, 0.8, -0.15), Vector3(0.08, 1.6, 0.08), WOOD.darkened(0.1), 0.0)
	# the striped awning
	for i in range(6):
		var c := ROOF_RED if i % 2 == 0 else CLOTH
		b.box(Vector3(-0.42 + 0.17 * i, 1.55, 0.12), Vector3(0.17, 0.07, 0.8), c, 0.0, 0.0, c.lightened(0.05))
	b.blob(Vector3(-0.2, 0.68, 0.1), Vector3(0.11, 0.08, 0.11), 5, 2, Color("#c8402a"), Color("#e86a4a"), 0.0, 0.0)
	b.blob(Vector3(0.1, 0.67, 0.12), Vector3(0.1, 0.07, 0.1), 5, 2, Color("#d8a02a"), Color("#f4c84a"), 0.0, 0.0)
	return b.build()


func _sellbox() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.3, 0.0), Vector3(0.8, 0.6, 0.6), WOOD_LIGHT, 0.0, 0.0, WOOD.darkened(0.2))
	b.box(Vector3(0.0, 0.62, 0.0), Vector3(0.86, 0.06, 0.66), WOOD, 0.0)
	b.box(Vector3(0.0, 0.66, 0.0), Vector3(0.3, 0.02, 0.06), GOLD, 0.0)
	return b.build()


func _wardrobe() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.85, 0.0), Vector3(0.9, 1.7, 0.55), Color("#8a5a8a"), 0.0, 0.0, Color("#a878a8"))
	b.box(Vector3(-0.2, 0.85, 0.3), Vector3(0.36, 1.5, 0.04), Color("#a878a8"), 0.0)
	b.box(Vector3(0.2, 0.85, 0.3), Vector3(0.36, 1.5, 0.04), Color("#a878a8"), 0.0)
	b.box(Vector3(0.0, 0.85, 0.33), Vector3(0.04, 0.2, 0.04), GOLD, 0.0)
	return b.build()


func _chest() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.22, 0.0), Vector3(0.78, 0.44, 0.52), WOOD, 0.0, 0.0, WOOD.lightened(0.06))
	b.box(Vector3(0.0, 0.5, 0.0), Vector3(0.8, 0.12, 0.54), WOOD.lightened(0.1), 0.0)
	b.box(Vector3(0.0, 0.28, 0.0), Vector3(0.8, 0.1, 0.56), IRON, 0.0)
	b.box(Vector3(0.0, 0.42, 0.27), Vector3(0.1, 0.12, 0.04), GOLD, 0.0)
	return b.build()


func _workbench() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.78, 0.0), Vector3(0.96, 0.1, 0.62), WOOD_LIGHT, 0.0, 0.0, WOOD_LIGHT.lightened(0.08))
	for x in [-0.4, 0.4]:
		for z in [-0.24, 0.24]:
			b.box(Vector3(x, 0.37, z), Vector3(0.1, 0.74, 0.1), WOOD.darkened(0.1), 0.0)
	b.box(Vector3(-0.22, 0.88, 0.0), Vector3(0.3, 0.1, 0.1), IRON, 0.0)
	b.box(Vector3(0.18, 0.86, 0.05), Vector3(0.2, 0.06, 0.2), WOOD, 0.0)
	return b.build()


func _trough() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.2, 0.0), Vector3(0.9, 0.4, 0.46), WOOD, 0.0, 0.0, Color("#c8b45a"))
	return b.build()


func _bus_stop() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.0, 0.0), Vector3(0.08, 2.0, 0.08), IRON, 0.0)
	b.box(Vector3(0.0, 1.85, 0.04), Vector3(0.62, 0.34, 0.05), Color("#2f6ec8"), 0.0)
	b.box(Vector3(0.0, 1.85, 0.07), Vector3(0.46, 0.2, 0.02), Color("#f4f0e4"), 0.0)
	b.box(Vector3(0.0, 0.3, 0.35), Vector3(0.7, 0.06, 0.3), WOOD, 0.0)
	b.box(Vector3(-0.3, 0.15, 0.35), Vector3(0.06, 0.3, 0.26), WOOD.darkened(0.1), 0.0)
	b.box(Vector3(0.3, 0.15, 0.35), Vector3(0.06, 0.3, 0.26), WOOD.darkened(0.1), 0.0)
	return b.build()


func _cave() -> ArrayMesh:
	var b := FarmMesh.new()
	var col := STONE_DARK
	b.blob(Vector3(-0.55, 0.45, 0.0), Vector3(0.55, 0.5, 0.7), 7, 4, col.darkened(0.2), col.lightened(0.12), 0.0, 0.12, 3.0)
	b.blob(Vector3(0.55, 0.45, 0.0), Vector3(0.55, 0.5, 0.7), 7, 4, col.darkened(0.2), col.lightened(0.12), 0.0, 0.12, 4.0)
	b.blob(Vector3(0.0, 1.0, -0.15), Vector3(1.0, 0.45, 0.75), 8, 4, col.darkened(0.15), col.lightened(0.15), 0.0, 0.1, 5.0)
	b.box(Vector3(0.0, 0.4, 0.2), Vector3(0.7, 0.8, 0.5), Color("#14121a"), 0.0)
	return b.build()


## The dungeon's arch: two pillars, a lintel with a rune band, and a dark doorway; the glow in it is the node's.
func _arch() -> ArrayMesh:
	var b := FarmMesh.new()
	var s := STONE
	b.box(Vector3(-1.05, 1.1, 0.0), Vector3(0.9, 2.2, 0.9), s, 0.0, 0.0, s.lightened(0.1))
	b.box(Vector3(1.05, 1.1, 0.0), Vector3(0.9, 2.2, 0.9), s, 0.0, 0.0, s.lightened(0.1))
	b.box(Vector3(0.0, 2.45, 0.0), Vector3(3.1, 0.6, 1.0), s.darkened(0.05), 0.0, 0.0, s.lightened(0.12))
	b.box(Vector3(0.0, 2.45, 0.52), Vector3(2.6, 0.12, 0.04), RUNE, 0.0)
	b.box(Vector3(-1.05, 2.35, 0.0), Vector3(1.0, 0.18, 1.0), MOSS, 0.0)
	b.box(Vector3(0.0, 1.0, -0.05), Vector3(1.3, 2.0, 0.4), Color("#14121a"), 0.0)
	# steps up to the doorway
	b.box(Vector3(0.0, 0.07, 0.62), Vector3(2.4, 0.14, 0.4), s.darkened(0.1), 0.0, 0.0, s)
	return b.build()


func _scarecrow() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.7, 0.0), Vector3(0.07, 1.4, 0.07), WOOD, 0.0)
	b.box(Vector3(0.0, 1.0, 0.0), Vector3(0.9, 0.07, 0.07), WOOD, 0.0)
	b.box(Vector3(0.0, 0.85, 0.0), Vector3(0.36, 0.5, 0.2), Color("#c0503a"), 0.0)
	b.blob(Vector3(0.0, 1.5, 0.0), Vector3(0.17, 0.17, 0.17), 6, 3, Color("#d8c07a"), Color("#f0dc9a"), 0.0, 0.0)
	b.cone(Vector3(0.0, 1.62, 0.0), 0.26, 0.16, 7, Color("#6a4a2a"), Color("#8a6a3a"), 0.0)
	return b.build()


func _bench() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.42, 0.0), Vector3(0.95, 0.08, 0.4), WOOD_LIGHT, 0.0)
	b.box(Vector3(0.0, 0.72, -0.17), Vector3(0.95, 0.3, 0.06), WOOD_LIGHT.darkened(0.08), 0.0)
	for x in [-0.4, 0.4]:
		b.box(Vector3(x, 0.2, 0.0), Vector3(0.07, 0.4, 0.36), WOOD.darkened(0.1), 0.0)
	return b.build()


func _flowerbox() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.18, 0.0), Vector3(0.9, 0.36, 0.4), WOOD, 0.0)
	for i in range(5):
		var c: Color = [Color("#e84a5a"), Color("#f0d24a"), Color("#f4f0e4"), Color("#9a6ae0"), Color("#e87ab8")][i]
		b.blade(Vector3(-0.36 + 0.18 * i, 0.36, 0.0), Vector3(-0.36 + 0.18 * i, 0.55, 0.0), 0.04, GRASS.darkened(0.2), GRASS, 1.0)
		b.blob(Vector3(-0.36 + 0.18 * i, 0.58, 0.0), Vector3(0.07, 0.05, 0.07), 5, 2, c.darkened(0.15), c, 0.0, 0.0)
	return b.build()


## A shed or house for animals: walls, a gabled roof and a door on the south side, `w` × `d` tiles.
func _shed(w: int, d: int, wall: Color, roof: Color, height: float, door_h: float) -> ArrayMesh:
	var b := FarmMesh.new()
	var ww := w - 0.15
	var dd := d - 0.15
	b.box(Vector3(0.0, height * 0.5, 0.0), Vector3(ww, height, dd), wall, 0.0, 0.0, wall.lightened(0.05))
	# gable roof: two slopes meeting over the ridge along x
	var rh := 0.45 + 0.1 * d
	var ov := 0.12
	var hx := ww * 0.5 + ov
	var hz := dd * 0.5 + ov
	var y0 := height
	b.quad(Vector3(-hx, y0, hz), Vector3(hx, y0, hz), Vector3(hx, y0 + rh, 0.0), Vector3(-hx, y0 + rh, 0.0), roof.lightened(0.05))
	b.quad(Vector3(hx, y0, -hz), Vector3(-hx, y0, -hz), Vector3(-hx, y0 + rh, 0.0), Vector3(hx, y0 + rh, 0.0), roof.darkened(0.1))
	b.tri(Vector3(-hx + ov, y0, hz - ov), Vector3(-hx + ov, y0 + rh - 0.04, 0.0), Vector3(-hx + ov, y0, -hz + ov), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))
	b.tri(Vector3(hx - ov, y0, -hz + ov), Vector3(hx - ov, y0 + rh - 0.04, 0.0), Vector3(hx - ov, y0, hz - ov), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))
	b.box(Vector3(0.0, door_h * 0.5, dd * 0.5 + 0.01), Vector3(0.45, door_h, 0.06), Color("#3a2a1e"), 0.0)
	return b.build()


func _lamp() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.06, 0.04, 1.9, 5, IRON, IRON, 0.0)
	b.box(Vector3(0.0, 2.0, 0.0), Vector3(0.26, 0.26, 0.26), Color("#ffd98a"), 0.5)
	b.cone(Vector3(0.0, 2.13, 0.0), 0.22, 0.14, 4, IRON, IRON, 0.0)
	return b.build()


func _lantern() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.2, 0.0), Vector3(0.24, 0.4, 0.24), Color("#ffd98a"), 0.5)
	b.box(Vector3(0.0, 0.02, 0.0), Vector3(0.3, 0.05, 0.3), IRON, 0.0)
	b.cone(Vector3(0.0, 0.4, 0.0), 0.2, 0.12, 4, IRON, IRON, 0.0)
	return b.build()


func _torch() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.05, 0.04, 1.2, 5, WOOD.darkened(0.1), WOOD, 0.0)
	b.cone(Vector3(0.0, 1.2, 0.0), 0.1, 0.22, 5, Color("#ff8a2a"), Color("#ffd870"), 0.5)
	return b.build()


func _wisp() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.9, 0.0), Vector3.ONE * 0.1, 5, 3, Color("#9fd8ff"), Color("#ffffff"), 0.5, 0.0)
	return b.build()


func _rug() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.015, 0.0), Vector3(1.8, 0.03, 1.8), Color("#a83a2c"), 0.0, 0.0, Color("#b84a3a"))
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(1.2, 0.02, 1.2), Color("#e0c27a"), 0.0)
	return b.build()


func _bed() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.2, 0.0), Vector3(0.9, 0.4, 1.9), WOOD, 0.0, 0.0, WOOD.lightened(0.1))
	b.box(Vector3(0.0, 0.5, 0.15), Vector3(0.8, 0.22, 1.5), Color("#4a78c8"), 0.0, 0.0, Color("#6a98e0"))
	b.box(Vector3(0.0, 0.58, -0.7), Vector3(0.6, 0.14, 0.34), CLOTH, 0.0)
	return b.build()


func _table() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.68, 0.0), Vector3(0.95, 0.08, 0.95), WOOD_LIGHT, 0.0, 0.0, WOOD_LIGHT.lightened(0.08))
	for x in [-0.4, 0.4]:
		for z in [-0.4, 0.4]:
			b.box(Vector3(x, 0.32, z), Vector3(0.08, 0.64, 0.08), WOOD.darkened(0.1), 0.0)
	return b.build()


func _chair() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.34, 0.0), Vector3(0.44, 0.06, 0.44), WOOD_LIGHT, 0.0)
	b.box(Vector3(0.0, 0.62, -0.2), Vector3(0.44, 0.5, 0.05), WOOD_LIGHT.darkened(0.08), 0.0)
	for x in [-0.18, 0.18]:
		for z in [-0.18, 0.18]:
			b.box(Vector3(x, 0.16, z), Vector3(0.05, 0.32, 0.05), WOOD.darkened(0.1), 0.0)
	return b.build()


func _sofa() -> ArrayMesh:
	var b := FarmMesh.new()
	var c := Color("#6a8a5a")
	b.box(Vector3(0.0, 0.3, 0.0), Vector3(1.9, 0.5, 0.8), c, 0.0, 0.0, c.lightened(0.1))
	b.box(Vector3(0.0, 0.7, -0.3), Vector3(1.9, 0.5, 0.22), c.darkened(0.1), 0.0)
	return b.build()


func _bookshelf() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.95, 0.0), Vector3(0.95, 1.9, 0.4), WOOD.darkened(0.1), 0.0, 0.0, WOOD)
	var cols := [Color("#a83a2c"), Color("#3a6ab0"), Color("#d8b24a"), Color("#4a8a4a")]
	for row in range(4):
		for i in range(6):
			b.box(Vector3(-0.38 + 0.15 * i, 0.3 + 0.42 * row, 0.2), Vector3(0.1, 0.3, 0.05), cols[(i + row) % 4], 0.0)
	return b.build()


func _houseplant() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.18, 0.14, 0.3, 6, Color("#a8602a"), Color("#c8783a"), 0.0)
	for i in range(6):
		var a := TAU * i / 6.0
		b.blade(Vector3(0.0, 0.3, 0.0), Vector3(cos(a) * 0.3, 0.75, sin(a) * 0.3), 0.14, Color("#2f6a2c"), Color("#6aa84a"), 0.0, a)
	return b.build()


func _painting() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.3, 0.0), Vector3(0.8, 0.6, 0.06), WOOD, 0.0)
	b.box(Vector3(0.0, 1.3, 0.03), Vector3(0.64, 0.46, 0.04), Color("#7ab0d8"), 0.0)
	b.box(Vector3(0.0, 1.18, 0.05), Vector3(0.64, 0.2, 0.02), Color("#4f8a3a"), 0.0)
	return b.build()


func _clock() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.5, 0.0), Vector3(0.4, 0.4, 0.08), WOOD, 0.0)
	b.box(Vector3(0.0, 1.5, 0.05), Vector3(0.3, 0.3, 0.03), CLOTH, 0.0)
	return b.build()


func _stove() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.5, 0.0), Vector3(0.9, 1.0, 0.7), IRON, 0.0, 0.0, IRON.lightened(0.1))
	b.cylinder(Vector3(0.3, 1.0, -0.2), 0.08, 0.08, 0.9, 5, IRON.darkened(0.1), IRON.darkened(0.1), 0.0)
	b.box(Vector3(0.0, 0.4, 0.36), Vector3(0.5, 0.3, 0.03), Color("#ff8a2a"), 0.5)
	return b.build()


func _hay_cart() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.4, 0.0), Vector3(1.8, 0.5, 0.8), WOOD, 0.0, 0.0, THATCH)
	b.blob(Vector3(0.0, 0.75, 0.0), Vector3(0.85, 0.35, 0.4), 7, 3, THATCH.darkened(0.15), THATCH.lightened(0.15), 0.0, 0.1)
	return b.build()


func _snowman() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.25, 0.0), Vector3(0.3, 0.27, 0.3), 8, 4, Color("#dce6f0"), Color("#ffffff"), 0.0, 0.0)
	b.blob(Vector3(0.0, 0.68, 0.0), Vector3(0.22, 0.2, 0.22), 8, 4, Color("#dce6f0"), Color("#ffffff"), 0.0, 0.0)
	b.cone(Vector3(0.0, 0.7, 0.2), 0.04, 0.2, 4, Color("#e87a2a"), Color("#e87a2a"), 0.0)
	return b.build()


func _xmas_tree() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.1, 0.08, 0.3, 5, WOOD, WOOD, 0.0)
	for i in range(4):
		b.cone(Vector3(0.0, 0.25 + 0.4 * i, 0.0), 0.7 - 0.13 * i, 0.55, 8, Color("#2a6a3a"), Color("#4a9a5a"), 0.0)
	b.blob(Vector3(0.0, 1.95, 0.0), Vector3.ONE * 0.09, 5, 2, GOLD, Color("#fff2a0"), 0.5, 0.0)
	return b.build()


func _maypole() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.1, 0.07, 2.6, 6, WOOD, WOOD.lightened(0.1), 0.0)
	for i in range(5):
		var a := TAU * i / 5.0
		var c: Color = [Color("#e84a5a"), Color("#f0d24a"), Color("#4a8ae8"), Color("#4fb04a"), Color("#e87ab8")][i]
		b.blade(Vector3(0.0, 2.55, 0.0), Vector3(cos(a) * 0.7, 1.5, sin(a) * 0.7), 0.06, c, c.lightened(0.1), 0.0, a)
	return b.build()


# ---------------------------------------------------------------------------
# Köpingen's buildings and street furniture (generated: the packs have no pizzeria, station or stone with runes)


## A gable roof along x over a box of w × d, its ridge `rise` high.
func _gable(b: FarmMesh, w: float, d: float, y0: float, rise: float, roof: Color, wall: Color) -> void:
	var ov := 0.14
	var hx := w * 0.5 + ov
	var hz := d * 0.5 + ov
	b.quad(Vector3(-hx, y0, hz), Vector3(hx, y0, hz), Vector3(hx, y0 + rise, 0.0), Vector3(-hx, y0 + rise, 0.0), roof.lightened(0.05))
	b.quad(Vector3(hx, y0, -hz), Vector3(-hx, y0, -hz), Vector3(-hx, y0 + rise, 0.0), Vector3(hx, y0 + rise, 0.0), roof.darkened(0.1))
	var wx := w * 0.5 - 0.02
	var wz := d * 0.5 - 0.02
	b.tri(Vector3(-wx, y0, wz), Vector3(-wx, y0 + rise - 0.05, 0.0), Vector3(-wx, y0, -wz), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))
	b.tri(Vector3(wx, y0, -wz), Vector3(wx, y0 + rise - 0.05, 0.0), Vector3(wx, y0, wz), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))


func _apartment() -> ArrayMesh:
	var b := FarmMesh.new()
	var wall := Color("#c9a77a")
	b.box(Vector3(0.0, 1.35, 0.0), Vector3(2.8, 2.7, 2.8), wall, 0.0, 0.0, wall.darkened(0.05))
	for floor_y in [0.55, 1.45, 2.3]:
		b.box(Vector3(0.0, floor_y - 0.45, 1.41), Vector3(2.8, 0.05, 0.04), WOOD.darkened(0.2), 0.0)
	for x in [-0.9, 0.0, 0.9]:
		for y in [1.15, 2.0]:
			b.box(Vector3(x, y, 1.42), Vector3(0.42, 0.5, 0.03), Color("#7fb0d8"), 0.0)
			b.box(Vector3(x, y - 0.3, 1.43), Vector3(0.5, 0.06, 0.06), Color("#f4f0e4"), 0.0)
	b.box(Vector3(0.0, 0.4, 1.42), Vector3(0.5, 0.8, 0.04), Color("#3a2a1e"), 0.0)
	_gable(b, 2.8, 2.8, 2.7, 0.8, ROOF_RED.darkened(0.1), wall)
	b.box(Vector3(0.9, 3.35, -0.3), Vector3(0.3, 0.7, 0.3), STONE_DARK, 0.0)
	return b.build()


func _sell_stall() -> ArrayMesh:
	var b := FarmMesh.new()
	# a market stall: counter, two posts, a striped awning, crates of goods
	b.box(Vector3(0.0, 0.45, 0.3), Vector3(1.7, 0.9, 0.6), WOOD_LIGHT, 0.0, 0.0, WOOD.darkened(0.1))
	for x in [-0.85, 0.85]:
		b.box(Vector3(x, 1.0, -0.35), Vector3(0.1, 2.0, 0.1), WOOD.darkened(0.15), 0.0)
	for i in range(6):
		var col := Color("#d9d2c0") if i % 2 == 0 else Color("#c8473a")
		var x0 := -0.95 + i * 0.32
		b.quad(Vector3(x0, 1.95, -0.45), Vector3(x0 + 0.32, 1.95, -0.45), Vector3(x0 + 0.32, 1.6, 0.75), Vector3(x0, 1.6, 0.75), col)
	b.box(Vector3(-0.45, 1.0, 0.3), Vector3(0.4, 0.2, 0.4), Color("#d8a03a"), 0.0)
	b.box(Vector3(0.1, 1.0, 0.3), Vector3(0.4, 0.2, 0.4), Color("#78a848"), 0.0)
	b.box(Vector3(0.6, 1.0, 0.3), Vector3(0.36, 0.2, 0.4), Color("#c8473a"), 0.0)
	b.box(Vector3(0.0, 0.2, -0.4), Vector3(1.6, 0.4, 0.3), WOOD.darkened(0.2), 0.0)
	return b.build()


func _pizzeria() -> ArrayMesh:
	var b := FarmMesh.new()
	var wall := Color("#e8d8b0")
	b.box(Vector3(0.0, 0.8, 0.0), Vector3(2.8, 1.6, 1.8), wall, 0.0, 0.0, wall.darkened(0.05))
	_gable(b, 2.8, 1.8, 1.6, 0.7, ROOF_RED, wall)
	# the striped awning over the door and the windows, and the pizza on the sign
	for i in range(8):
		var col := Color("#f4f0e4") if i % 2 == 0 else Color("#c8473a")
		var x0 := -1.25 + i * 0.31
		b.quad(Vector3(x0, 1.35, 0.9), Vector3(x0 + 0.31, 1.35, 0.9), Vector3(x0 + 0.31, 1.0, 1.35), Vector3(x0, 1.0, 1.35), col)
	b.box(Vector3(0.0, 0.4, 0.91), Vector3(0.5, 0.8, 0.04), Color("#3a2a1e"), 0.0)
	for x in [-0.9, 0.9]:
		b.box(Vector3(x, 0.8, 0.91), Vector3(0.5, 0.45, 0.03), Color("#ffd98a"), 0.0)
	b.cylinder(Vector3(0.0, 1.75, 0.5), 0.34, 0.34, 0.06, 10, Color("#e8a83a"), Color("#e8a83a"), 0.0)
	b.cylinder(Vector3(0.0, 1.78, 0.5), 0.2, 0.2, 0.04, 8, Color("#c8473a"), Color("#c8473a"), 0.0)
	b.box(Vector3(1.0, 2.0, -0.4), Vector3(0.26, 0.7, 0.26), STONE_DARK, 0.0)
	return b.build()


func _bathhouse() -> ArrayMesh:
	var b := FarmMesh.new()
	var wall := Color("#b8b2a2")
	b.box(Vector3(0.0, 0.75, 0.0), Vector3(2.8, 1.5, 1.8), wall, 0.0, 0.0, wall.lightened(0.05))
	b.box(Vector3(0.0, 1.55, 0.0), Vector3(3.0, 0.12, 2.0), Color("#5e6a78"), 0.0)
	_gable(b, 2.8, 1.8, 1.6, 0.55, Color("#5e6a78"), wall)
	b.box(Vector3(0.0, 0.5, 0.91), Vector3(0.6, 1.0, 0.04), Color("#5a3a26"), 0.0)
	for x in [-0.95, 0.95]:
		b.box(Vector3(x, 0.9, 0.91), Vector3(0.4, 0.4, 0.03), Color("#9ad0e8"), 0.0)
	b.box(Vector3(-1.0, 2.0, -0.4), Vector3(0.3, 0.8, 0.3), STONE_DARK, 0.0)
	return b.build()


func _station() -> ArrayMesh:
	var b := FarmMesh.new()
	# a platform with a waiting hall and a long roof on posts; the sign says where the dwarves' train goes
	b.box(Vector3(0.0, 0.1, 0.0), Vector3(2.95, 0.2, 1.95), STONE, 0.0, 0.0, STONE.lightened(0.1))
	b.box(Vector3(0.0, 0.8, -0.35), Vector3(2.5, 1.2, 0.9), Color("#a8793f"), 0.0, 0.0, WOOD_LIGHT)
	for x in [-1.3, 1.3]:
		b.box(Vector3(x, 0.9, 0.7), Vector3(0.1, 1.4, 0.1), WOOD.darkened(0.15), 0.0)
	b.box(Vector3(0.0, 1.7, 0.2), Vector3(3.0, 0.12, 1.7), Color("#4a5a6a"), 0.0)
	b.box(Vector3(0.0, 1.35, 0.12), Vector3(1.2, 0.3, 0.05), Color("#f4f0e4"), 0.0)
	b.box(Vector3(0.0, 1.35, 0.15), Vector3(1.0, 0.1, 0.02), Color("#2f6ec8"), 0.0)
	for x in [-0.8, 0.8]:
		b.box(Vector3(x, 0.75, 0.11), Vector3(0.4, 0.45, 0.03), Color("#ffd98a"), 0.0)
	b.box(Vector3(0.0, 0.55, 0.11), Vector3(0.38, 0.7, 0.03), Color("#3a2a1e"), 0.0)
	return b.build()


func _traffic_light() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.05, 0.04, 1.9, 5, IRON, IRON, 0.0)
	b.box(Vector3(0.0, 1.8, 0.0), Vector3(0.2, 0.5, 0.16), Color("#2a2a30"), 0.0)
	b.box(Vector3(0.0, 1.94, 0.09), Vector3(0.1, 0.1, 0.02), Color("#e84a3a"), 0.0)
	b.box(Vector3(0.0, 1.8, 0.09), Vector3(0.1, 0.1, 0.02), Color("#6a5a2a"), 0.0)
	b.box(Vector3(0.0, 1.66, 0.09), Vector3(0.1, 0.1, 0.02), Color("#4ae85a"), 0.0)
	return b.build()


func _car(body: Color) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.32, 0.0), Vector3(1.7, 0.4, 0.8), body, 0.0, 0.0, body.lightened(0.08))
	b.box(Vector3(-0.1, 0.68, 0.0), Vector3(0.9, 0.34, 0.7), body.darkened(0.05), 0.0, 0.0, body.lightened(0.15))
	b.box(Vector3(-0.1, 0.68, 0.0), Vector3(0.94, 0.22, 0.72), Color("#7fb0d8"), 0.0)
	for x in [-0.55, 0.55]:
		for z in [-0.38, 0.38]:
			b.box(Vector3(x, 0.14, z), Vector3(0.28, 0.28, 0.12), Color("#1e1e22"), 0.0)
	return b.build()


func _banner(cloth: Color) -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3.ZERO, 0.06, 0.05, 2.5, 5, WOOD.darkened(0.2), WOOD, 0.0)
	b.box(Vector3(0.0, 2.45, 0.0), Vector3(0.7, 0.06, 0.06), WOOD.darkened(0.2), 0.0)
	b.box(Vector3(0.0, 1.95, 0.0), Vector3(0.55, 0.95, 0.03), cloth, 0.0)
	b.box(Vector3(0.0, 1.95, 0.02), Vector3(0.14, 0.5, 0.02), GOLD, 0.0)
	b.box(Vector3(0.0, 1.45, 0.0), Vector3(0.2, 0.1, 0.03), cloth.darkened(0.2), 0.0)
	return b.build()


## A standing stone with a rune band that glows (the village square's); the Kämpastenen is taller with a plinth.
func _runestone(big: bool) -> ArrayMesh:
	var b := FarmMesh.new()
	var k := 1.35 if big else 1.0
	if big:
		b.box(Vector3(0.0, 0.1, 0.0), Vector3(1.0, 0.2, 1.0), STONE_DARK, 0.0, 0.0, STONE)
	b.blob(Vector3(0.0, 0.2 + 0.7 * k, 0.0), Vector3(0.34 * k, 0.75 * k, 0.26 * k), 6, 4, STONE_DARK.darkened(0.1), STONE.lightened(0.12), 0.0, 0.08, 7.0)
	b.box(Vector3(0.0, 0.2 + 0.75 * k, 0.24 * k), Vector3(0.28 * k, 0.5 * k, 0.03), Color("#173a44"), 0.0)
	for i in range(3):
		b.box(Vector3(0.0, 0.2 + (0.55 + 0.2 * i) * k, 0.26 * k), Vector3(0.16 * k, 0.05, 0.02), RUNE, 0.0)
	b.box(Vector3(0.0, 0.2 + 0.75 * k, 0.26 * k), Vector3(0.04, 0.4 * k, 0.02), RUNE, 0.0)
	return b.build()
