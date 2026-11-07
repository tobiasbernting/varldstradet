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
const HALLOWEEN := "res://assets/kaykit_halloween/"
const FURNITURE := "res://assets/kaykit_furniture/"
const NATURE := "res://assets/kenney_nature/"
const FOREST := "res://assets/kaykit_forest/"
const PROP_SHADER := "res://assets/shaders/farm_prop.gdshader"
const GROUND_SHADER := "res://assets/shaders/farm_ground.gdshader"
const WATER_SHADER := "res://assets/shaders/farm_water.gdshader"
const WATER_FX_SHADER := "res://assets/shaders/farm_water_fx.gdshader"

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
## The browser's lamp colours (lighting.ts): a lamp's warm light, a fire's.
const WARM := Color(1.0, 0.66, 0.35)
const FIRE := Color(1.0, 0.58, 0.26)
const STONE := Color("#7c7d78")
const STONE_DARK := Color("#5f625f")
const THATCH := Color("#c9a24d")
const ROOF_RED := Color("#a83a2c")
const CLOTH := Color("#d9d2c0")
## The rock walls' faces (Kenney cliffs) by terrain, a little lighter than their tops so the edge reads.
const CLIFF_FACE := {"cliff_rock": Color("#9a9ea3"), "cliff_sandstone": Color("#c88a5a"), "cliff_basalt": Color("#5e5a62")}

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
	"dead_tree": {"m": ["dead_a", "dead_b", "dead_c"], "yaw": "free", "grow": [0.9, 1.2]},
	"saga_deadtree": {"m": ["dead_a", "dead_b", "dead_c"], "yaw": "free"},
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
	"house": {"m": ["house"], "node": true, "front": true, "chimney": Vector3(0.0, 3.95, -1.1)},
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
	"bus_stop": {"m": ["vm_bus_stop"], "node": true, "front": true},
	"cave": {"m": ["cave_mouth"], "node": true},
	"cave_mouth": {"m": ["cave_mouth"], "node": true},
	# M9a: each dungeon's own gateway (arch_meshes.gd), by the object's variant (the dungeon's index)
	"saga_portal": {"m": ["arch", "arch_1", "arch_2", "arch_3", "arch_4", "arch_5", "arch_6", "arch_7", "arch_8"], "node": true, "by_variant": true},
	# --- M5c: the runs. The färdport (3 × 2) and the Yggdrasil shoot, five stages by the object's variant, and the three buildings.
	"fardport": {"m": ["fardport"], "node": true},
	"yggdrasil": {"m": ["ygg_0", "ygg_1", "ygg_2", "ygg_3", "ygg_4"], "node": true, "by_variant": true},
	"smithy": {"m": ["smithy"], "node": true, "front": true, "chimney": Vector3(0.3, 1.5, -0.3), "light": [Color("#ff8a3a"), 4.5, 1.1, 1.1, 0.3], "night": true},
	"herb_garden": {"m": ["herb_garden"], "front": true},
	"longhall": {"m": ["longhall"], "node": true, "front": true, "chimney": Vector3(0.0, 2.85, 0.0), "glows": [[-1.3, 0.62, 1.3], [1.3, 0.62, 1.3]], "light": [Color("#ffc977"), 6.0, 1.2, 1.4, 0.1], "night": true},
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
	"lamp": {"m": ["lamp"], "node": true, "light": [WARM, 7.5, 1.6, 1.5, 0.15], "night": true},
	"street_lamp": {"m": ["vm_street_lamp"], "node": true, "light": [Color(1.0, 0.78, 0.5), 7.5, 1.5, 1.7, 0.1, 12.0], "night": true},
	"lantern": {"m": ["lantern"], "node": true, "light": [WARM, 6.0, 1.4, 0.6, 0.25], "night": true},
	"torch": {"m": ["torch"], "node": true, "light": [FIRE, 6.0, 1.7, 1.3, 0.35], "night": true},
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
	"painting": {"m": ["painting"], "node": true}, # a node: the drawing on it is a texture of its own (farm_view.gd _picture)
	"clock": {"m": ["clock"]},
	"stove": {"m": ["stove"], "front": true, "node": true, "light": [Color("#ff8a3a"), 3.2, 0.8, 0.5, 0.3]},
	"hay_cart": {"m": ["hay_cart"]},
	"snowman": {"m": ["snowman"]},
	"xmas_tree": {"m": ["xmas_tree"]},
	"maypole": {"m": ["maypole"]},
	"pumpkin_lantern": {"m": ["jack_o_lantern"], "node": true, "light": [Color("#ff9a3c"), 3.0, 0.9, 0.4, 0.3]},
	# --- Köpingen (city.ts): the Norse market town; its streets are ground, these are what stands on them
	"house_small": {"m": ["vm_house_0", "vm_house_1", "vm_house_2", "vm_house_3"], "by_variant": true, "front": true, "chimney": Vector3(0.75, 2.8, -0.2)},
	"apartment": {"m": ["vm_apartment_0", "vm_apartment_1", "vm_apartment_2", "vm_apartment_3"], "by_variant": true, "front": true, "chimney": Vector3(0.9, 3.4, -0.3)},
	"shop": {"m": ["vm_shop_0", "vm_shop_1", "vm_shop_2"], "by_variant": true, "node": true, "front": true, "glows": [[0.15, 0.74, 0.96]], "light": [WARM, 6.0, 1.3, 1.2, 0.1], "night": true},
	"market": {"m": ["market"], "front": true},
	"sellstall": {"m": ["sell_stall"], "front": true},
	"pizzeria": {"m": ["vm_pizzeria"], "node": true, "front": true, "chimney": Vector3(1.0, 2.3, -0.3), "glows": [[-0.85, 0.62, 0.94]], "light": [WARM, 6.0, 1.4, 1.2, 0.15], "night": true},
	"bathhouse": {"m": ["vm_bathhouse"], "front": true, "chimney": Vector3(-1.0, 2.2, -0.4)},
	"train_station": {"m": ["vm_station"], "node": true, "front": true, "glows": [[-0.95, 0.6, 0.93], [0.95, 0.6, 0.93]], "light": [Color(1.0, 0.78, 0.5), 7.0, 1.3, 1.6, 0.1], "night": true},
	"traffic_light": {"m": ["vm_signpost"]},
	"parked_car": {"m": ["vm_cart_0", "vm_cart_1", "vm_cart_2"], "by_variant": true},
	"banner_pole": {"m": ["banner_0", "banner_1", "banner_2"], "by_variant": true},
	"runestone": {"m": ["runestone"], "node": true, "light": [Color("#38d8f0"), 4.0, 0.9, 1.0, 0.1]},
	"saga_stone": {"m": ["kampasten"], "node": true, "light": [Color("#38d8f0"), 5.0, 1.2, 1.3, 0.12]},
}

## What was drawn as a placeholder box or could not be loaded, as the warnings said (empty when every kind has a look).
var problems: Array[String] = []
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
var _water_level := -1
var _glow_tex: Texture2D
var pool_mat: ShaderMaterial ## the light on the ground: a lamp's pool


func _init() -> void:
	prop_mat = ShaderMaterial.new()
	prop_mat.shader = load(PROP_SHADER)
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = load(GROUND_SHADER)
	# the Compatibility renderer converts vertex colours from sRGB once more: the shaders undo it
	var vfix := 1.0 if RenderingServer.get_current_rendering_method() == "gl_compatibility" else 0.0
	prop_mat.set_shader_parameter("vcol_fix", vfix)
	ground_mat.set_shader_parameter("vcol_fix", vfix)
	water_mat = _water(Color("#52a8d1"), Color("#1f5788"), 0.84)
	bog_mat = _water(Color("#5d6b3a"), Color("#2f3a22"), 0.9)
	lava_mat = _water(Color("#ff8a2a"), Color("#c03a12"), 1.0)
	lava_mat.set_shader_parameter("glint", 0.0)
	choco_mat = _water(Color("#7a4a2a"), Color("#4a2a16"), 0.95)
	glow_mat = ShaderMaterial.new()
	glow_mat.shader = _glow_shader()
	pool_mat = ShaderMaterial.new()
	pool_mat.shader = load("res://assets/shaders/light_pool.gdshader")


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
	pool_mat = null


## The liquids' look by preset (Quality "water"): 0 the flat cheap shader, 1 and 2 the one with waves and reflections.
## The materials stay the same objects (the chunks hold them), only their shader and its level change; the uniforms they
## share stay as they were set.
func set_water_level(level: int) -> void:
	if level == _water_level or water_mat == null:
		return
	_water_level = level
	var sh: Shader = load(WATER_FX_SHADER if level > 0 else WATER_SHADER)
	# how much each liquid mirrors the sky and the shore: water, a little for the bog, a gloss on chocolate, none on lava
	for pair in [[water_mat, 1.0], [bog_mat, 0.3], [choco_mat, 0.45], [lava_mat, 0.0]]:
		var m: ShaderMaterial = pair[0]
		m.shader = sh
		if level > 0:
			m.set_shader_parameter("quality", level)
			m.set_shader_parameter("reflect_k", float(pair[1]))


func _water(shallow: Color, deep: Color, alpha: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(WATER_SHADER)
	m.set_shader_parameter("shallow", shallow)
	m.set_shader_parameter("deep", deep)
	m.set_shader_parameter("alpha", alpha)
	return m


func _glow_shader() -> Shader:
	var s := Shader.new()
	s.code = "shader_type spatial;\nrender_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;\nuniform vec3 colour : source_color = vec3(1.0);\nuniform float energy = 1.0;\nvoid fragment() { float d = length(UV - vec2(0.5)) * 2.0; float k = clamp(1.0 - d, 0.0, 1.0); ALBEDO = colour * energy * k * k; }\n"
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


## Light on the ground: a round pool of `size` metres across. Laid flat; the caller puts it just above the ground.
func pool_quad(colour: Color, size: Vector2, energy: float) -> MeshInstance3D:
	var q := PlaneMesh.new()
	q.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = q
	var m := pool_mat.duplicate() as ShaderMaterial
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
		problems.append(text) # (the placeholder check, placeholder_check.gd, fails on any)
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


## The name a mesh was made under (for the checks): "" when it is not one of the kept ones.
func name_of(m: Mesh) -> String:
	for k in _meshes.keys():
		if _meshes[k] == m:
			return str(k)
	return ""


func _make(n: String) -> ArrayMesh:
	if n.begins_with("fence_"):
		return _fence(int(n.substr(6)), false)
	if n.begins_with("gatef_"):
		return _fence(int(n.substr(6)), true)
	if n.begins_with("pk:"):
		# a landmark's part (landmark_models.gd): "pk:<path under assets>|<recolour>|<scale>"
		var pk := n.substr(3).split("|")
		return _baked("res://assets/" + pk[0], float(pk[2]), pk[1])
	if n.begins_with("cliffwall_"):
		# a rock wall's face (farm_view.gd): "cliffwall_<terrain>_<shape>", 1 m wide and 1 m tall, facing -Z
		var cw := n.split("_")
		var piece := "cliff_large_rock.glb" if cw[2] == "0" else "cliff_rock.glb"
		return _baked(NATURE + piece, 1.0, "cliff_" + cw[1])
	if n.begins_with("cliffboulder_"):
		# a boulder at a rock wall's foot: "cliffboulder_<terrain>_<0..2>"
		var cb := n.split("_")
		var rock := ["rock_tallB.glb", "rock_tallE.glb", "rock_largeC.glb"][int(cb[2])] as String
		return _baked(NATURE + rock, 1.0, "cliff_" + cb[1])
	if n.begins_with("gen:"):
		return _landmark_mesh(n.substr(4))
	if n.begins_with("paint:"):
		# a painted house, wall, door or window (the server's `variant` is the paint bucket): "paint:<mesh>:<variant>"
		var pp := n.split(":")
		return _painted(pp[1], int(pp[2]))
	if n.begins_with("vm_"):
		return _village(n.substr(3))
	if n.begins_with("ph_"):
		var wh := n.substr(3).split("x")
		return _placeholder(int(wh[0]), int(wh[1]))
	if n.begins_with("crop_"):
		var parts := n.split("_")
		return _crop(parts[1], int(parts[2]))
	match n:
		"oak_a": return _baked(FOREST + "Tree_1_A_Color1.gltf", 0.0, "forest", Vector2(1.6, 1.6))
		"oak_b": return _baked(FOREST + "Tree_2_A_Color1.gltf", 0.0, "forest", Vector2(1.5, 1.5))
		"oak_c": return _baked(FOREST + "Tree_3_A_Color1.gltf", 0.0, "forest", Vector2(1.5, 1.5))
		"apple_a": return _with_fruit(_baked(FOREST + "Tree_1_B_Color1.gltf", 0.0, "forest", Vector2(1.5, 1.5)), 8, 0.09, Color("#b02a2a"), Color("#e8483a"), 4)
		"apple_b": return _with_fruit(_baked(FOREST + "Tree_3_B_Color1.gltf", 0.0, "forest", Vector2(1.5, 1.5)), 8, 0.09, Color("#b02a2a"), Color("#e8483a"), 5)
		"pine_a": return _baked(KENNEY + "tree-large.glb", 1.6, "pine")
		"pine_b": return _baked(KENNEY + "tree-small.glb", 1.8, "pine")
		"stump": return _baked(HEX + "tree_single_A_cut.gltf", 2.6, "wood")
		"dead_a": return _baked(HALLOWEEN + "tree_dead_large.gltf", 0.5, "keep")
		"dead_b": return _baked(HALLOWEEN + "tree_dead_medium.gltf", 0.55, "keep")
		"dead_c": return _baked(HALLOWEEN + "tree_dead_small.gltf", 0.7, "keep")
		"palm": return _baked(NATURE + "tree_palmTall.glb", 1.4, "leaf")
		"rock_big_a": return _baked(KENNEY + "rocks-large.glb", 1.1, "stone")
		"rock_big_b": return _baked(HEX + "rock_single_E.gltf", 3.2, "stone")
		"rock_big_c": return _baked(HEX + "rock_single_C.gltf", 3.6, "stone")
		"rock_small_a": return _baked(KENNEY + "rocks-small.glb", 1.2, "stone")
		"rock_small_b": return _baked(HEX + "rock_single_B.gltf", 3.0, "stone")
		"rock_small_c": return _baked(HEX + "rock_single_D.gltf", 3.0, "stone")
		"bush_a": return _baked(NATURE + "plant_bushDetailed.glb", 1.6, "leaf", Vector2.ZERO, null, Vector3.ZERO, 0.5)
		"bush_b": return _baked(NATURE + "plant_bushLarge.glb", 2.4, "leaf", Vector2.ZERO, null, Vector3.ZERO, 0.5)
		"berry_blue": return _with_fruit(_baked(NATURE + "plant_bushDetailed.glb", 1.5, "leaf", Vector2.ZERO, null, Vector3.ZERO, 0.5), 8, 0.075, Color("#3a4ab0"), Color("#4a5fd0"), 3)
		"berry_cloud": return _with_fruit(_baked(NATURE + "plant_bush.glb", 2.0, "leaf", Vector2.ZERO, null, Vector3.ZERO, 0.5), 7, 0.08, Color("#c8842a"), Color("#f0a640"), 4)
		"berry_ice": return _with_fruit(_baked(NATURE + "plant_bushLarge.glb", 2.2, "leaf", Vector2.ZERO, null, Vector3.ZERO, 0.5), 7, 0.085, Color("#7ab8e0"), Color("#9fd8ff"), 5)
		"pumpkin": return _baked(HALLOWEEN + "pumpkin_orange.gltf", 0.55, "keep")
		"jack_o_lantern": return _baked(HALLOWEEN + "pumpkin_orange_jackolantern.gltf", 0.4, "lamp")
		"tuft_a": return _baked(NATURE + "grass.glb", 1.0, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"tuft_b": return _baked(NATURE + "grass_large.glb", 1.0, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"tuft_c": return _baked(NATURE + "grass_leafs.glb", 1.5, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"flower_0": return _baked(NATURE + "flower_redA.glb", 1.4, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"flower_1": return _baked(NATURE + "flower_yellowA.glb", 1.7, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"flower_2": return _flower(Color("#f4f0e4"), 3) # the kit has no white flower
		"flower_3": return _baked(NATURE + "flower_purpleA.glb", 1.4, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"mushroom": return _baked(NATURE + "mushroom_red.glb", 1.6, "keep")
		"fern": return _baked(NATURE + "plant_flatTall.glb", 2.0, "leaf", Vector2.ZERO, null, Vector3.ZERO, 1.0)
		"reed": return _reed()
		"shell": return _shell()
		"cactus": return _baked(NATURE + "cactus_tall.glb", 2.0, "plant")
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
		"cave_mouth": return _merged(_turned(_baked(NATURE + "cliff_cave_rock.glb", 2.0, "cliff", Vector2.ZERO, null, Vector3(0.0, 0.0, -0.85)), PI), _cave_dark())
		"arch": return _arch()
		"arch_1", "arch_2", "arch_3", "arch_4", "arch_5", "arch_6", "arch_7", "arch_8": return ArchMeshes.mesh(int(n.substr(5)))
		"fardport": return RunMeshes.fardport()
		"ygg_0": return RunMeshes.yggdrasil(0)
		"ygg_1": return RunMeshes.yggdrasil(1)
		"ygg_2": return RunMeshes.yggdrasil(2)
		"ygg_3": return RunMeshes.yggdrasil(3)
		"ygg_4": return RunMeshes.yggdrasil(4)
		"smithy": return _baked(HEX + "building_blacksmith_red.gltf", 0.0, "house", Vector2(2.8, 1.9))
		"smithy_extras": return RunMeshes.smithy_extras()
		"herb_garden": return RunMeshes.herb_garden()
		"longhall": return RunMeshes.longhall()
		"scarecrow": return _scarecrow()
		"bench": return _bench()
		"flowerbox": return _flowerbox()
		"barrel": return _baked(HEX + "barrel.gltf", 3.2, "wood")
		"coop": return _shed(2, 2, Color("#b8864a"), Color("#8a5a2a"), 0.9, 0.5)
		"hutch": return _shed(1, 1, Color("#a8793f"), Color("#7a5230"), 0.55, 0.3)
		"sheepfold": return _shed(2, 2, Color("#c9b28a"), Color("#7a6a50"), 0.8, 0.45)
		"pigsty": return _shed(2, 2, Color("#b27a5a"), Color("#8a4a3a"), 0.8, 0.45)
		# the post's lantern hangs 1 unit south of the post: the pivot puts it over the tile's middle, where the light is
		"lamp": return _baked(HALLOWEEN + "post_lantern.gltf", 0.75, "lamp", Vector2.ZERO, Vector3(0.0, 0.0, 1.0))
		"lantern": return _baked(HALLOWEEN + "lantern_standing.gltf", 0.6, "lamp")
		"torch": return _torch()
		"wisp": return _wisp()
		"rug": return _rug()
		"bed": return _baked(FURNITURE + "bed_single_A.gltf", 0.0, "keep", Vector2(0.95, 1.95))
		"table": return _baked(FURNITURE + "table_small.gltf", 0.75, "keep")
		"chair": return _baked(FURNITURE + "chair_A_wood.gltf", 0.6, "keep")
		"sofa": return _baked(FURNITURE + "couch_pillows.gltf", 0.0, "keep", Vector2(1.95, 0.95))
		"bookshelf": return _bookshelf()
		"houseplant": return _baked(FURNITURE + "cactus_medium_A.gltf", 0.8, "keep")
		# hung by its back (the model's origin) with its middle 1.3 m up, as the generated one was
		"painting": return _baked(FURNITURE + "pictureframe_large_A.gltf", 0.7, "keep", Vector2.ZERO, Vector3.ZERO, Vector3(0.0, 1.3, -0.03))
		"clock": return _clock()
		"stove": return _stove()
		"hay_cart": return _hay_cart()
		"snowman": return _snowman()
		"xmas_tree": return _xmas_tree()
		"maypole": return _maypole()
		"market": return _baked(HEX + "building_market_red.gltf", 0.0, "house", Vector2(1.9, 1.9))
		"sell_stall": return _sell_stall()
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
## `pivot` (model units), when given, is the point put at the origin instead of the foot of the middle (a frame
## hung on a wall, a lamp post whose lantern must sit where the light is); `offset` (metres) moves the result.
## `sway` is the wind's weight on the whole model (FarmMesh.sway: 1 grass, flowers and ferns, 0.5 bushes).
## recolour "lamp" also marks a lantern's candle flame (bright yellow and orange) as a night glow (the window mask, 0.5).
func _baked(path: String, scale: float, recolour: String, fit := Vector2.ZERO, pivot: Variant = null, offset := Vector3.ZERO, sway := 0.0) -> ArrayMesh:
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
	if pivot is Vector3:
		mid = pivot
	for i in range(verts.size()):
		verts[i] = (verts[i] - mid) * k + offset
		var c := cols[i]
		var lit := recolour == "lamp" and c.r > 0.8 and c.g > 0.18 and c.b < c.g * 0.6
		# the foliage mask comes from _recolour, in the colour's alpha ("leaf": the Nature Kit's leaves and grass); the UV's y
		# is the wind's sway weight (farm_prop.gdshader): plants lean from the foot up, a pine sways as a stiff crown (-1)
		uvs.append(Vector2(0.5 if lit else c.a, -1.0 if recolour == "pine" else sway))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


## A baked tree or bush with fruit or berries on the outside of its leaves: `n` small blobs set on foliage
## vertices picked by `seed_v`, pushed a little outwards. The blobs are not foliage (the season leaves them red).
func _with_fruit(base: ArrayMesh, n: int, r: float, low: Color, high: Color, seed_v: int) -> ArrayMesh:
	if base == null:
		return null
	var arr := base.surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var uv: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV]
	var leaves := PackedVector3Array()
	var top := 0.0
	for i in range(v.size()):
		if uv[i].x > 0.9:
			leaves.append(v[i])
			top = maxf(top, v[i].y)
	if leaves.is_empty():
		return base
	var b := FarmMesh.new()
	b.sway = uv[0].y if uv.size() > 0 and uv[0].y > 0.0 else 0.0 # the fruit leans with its bush
	var placed := 0
	var tries := 0
	while placed < n and tries < n * 20:
		var p := leaves[int(_rnd(seed_v, tries) * leaves.size()) % leaves.size()]
		tries += 1
		# on the sides and the lower half of the crown, where fruit hangs and the camera sees it
		var side := Vector2(p.x, p.z)
		if side.length() < 0.15 or p.y > top * 0.85:
			continue
		var out := Vector3(side.x, 0.0, side.y).normalized() * r * 1.3
		b.blob(p + out, Vector3.ONE * r, 5, 2, low, high, 0.0, 0.0)
		placed += 1
	var extra := b.build().surface_get_arrays(0)
	# only the four channels the props use (a mesh read back also carries tangents, which would not line up)
	var joined: Array = []
	joined.resize(Mesh.ARRAY_MAX)
	for k in [Mesh.ARRAY_VERTEX, Mesh.ARRAY_NORMAL, Mesh.ARRAY_COLOR, Mesh.ARRAY_TEX_UV]:
		var both: Variant = arr[k]
		both.append_array(extra[k])
		joined[k] = both
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, joined)
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
			var vcol: Variant = arr[Mesh.ARRAY_COLOR] # (the Kenney Nature Kit keeps its colours here, under a pale albedo)
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
				if vcol is PackedColorArray and (vcol as PackedColorArray).size() == v.size():
					c *= (vcol as PackedColorArray)[i]
				cols.append(_recolour(c, recolour, mat.resource_name if mat != null else ""))
	for child in node.get_children():
		_collect(child, here, verts, norms, cols, recolour)


## The palette pass: the packs' colours, nudged to the ART.md palette; the result is linear with the foliage mask
## in alpha (0: none of the baked models is deciduous foliage).
func _recolour(c: Color, mode: String, mat_name := "") -> Color:
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
	elif mode == "ice":
		out = Color("#cfe8f4").lerp(Color("#9ccbe6"), clampf(1.0 - c.get_luminance(), 0.0, 1.0))
	elif mode == "sand":
		out = Color("#b8a27a") * clampf(c.get_luminance() * 1.3, 0.55, 1.05)
	elif mode == "lava":
		out = Color("#5e5258") * clampf(c.get_luminance() * 1.5, 0.6, 1.2)
	elif mode == "moon":
		out = Color("#d8dcf0") * clampf(c.get_luminance() * 1.4, 0.7, 1.15)
	elif mode == "forest":
		# KayKit Forest: one gradient texture. Its greens are the leaves (foliage, recoloured by the season); its
		# red-brown trunks lean to the palette's wood.
		if c.g > c.r * 1.2 and c.g > c.b * 1.2:
			return FarmMesh.lin(c, 1.0)
		if c.r > c.g * 1.3:
			out = c.lerp(WOOD, 0.6)
	elif mode == "leaf" or mode == "plant" or mode == "kenney" or mode.begins_with("cliff"):
		# Kenney Nature Kit: one flat (pale) colour per material, so each material takes a palette colour by name.
		# Leaves and grass take the palette's greens (and, for "leaf", the foliage mask, so the season and the wind
		# act on them).
		if mat_name.begins_with("leafsDark"):
			out = MOSS
		elif mat_name.begins_with("leafsFall"):
			out = WOOD_LIGHT # (the canoe's hull)
		elif mat_name.begins_with("leafs"):
			out = GRASS
		elif mat_name.begins_with("grass"):
			out = CLIFF_FACE.get(mode, STONE).lightened(0.12) if mode.begins_with("cliff_") else GRASS.lightened(0.08)
		elif mat_name.begins_with("woodInner"):
			out = Color("#d8b48a")
		elif mat_name.begins_with("woodBark") or mat_name.begins_with("woodDark"):
			out = WOOD
		elif mat_name.begins_with("wood"):
			out = WOOD_LIGHT
		elif mat_name.begins_with("stoneDark"):
			out = STONE_DARK
		elif mat_name.begins_with("stone"):
			out = CLIFF_FACE.get(mode, STONE.lightened(0.25)) if mode.begins_with("cliff_") else STONE.lightened(0.25)
		elif mat_name.begins_with("dirt"):
			out = CLIFF_FACE.get(mode, STONE_DARK) if mode.begins_with("cliff") else Color("#9a8e7e") # (the walls' rock)
		elif mat_name.begins_with("water"):
			out = Color("#5ab4de")
		elif mat_name.begins_with("colorRed"):
			out = Color("#c8473a")
		var green := mat_name.begins_with("leafs") or mat_name.begins_with("grass")
		return FarmMesh.lin(out, 1.0 if green and mode == "leaf" else 0.0)
	return FarmMesh.lin(out, 0.0)


# ---------------------------------------------------------------------------
# Generated props


func _rnd(seed_v: float, i: float) -> float:
	return fposmod(sin((seed_v * 31.7 + i * 7.13) * 12.9898) * 43758.5453, 1.0)


func _flower(petal: Color, seed_v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	b.sway = 1.0
	b.blade(Vector3.ZERO, Vector3(0.0, 0.3, 0.0), 0.04, GRASS.darkened(0.2), GRASS, 1.0)
	b.blade(Vector3(0.0, 0.1, 0.0), Vector3(0.1, 0.2, 0.0), 0.08, GRASS.darkened(0.1), GRASS.lightened(0.1), 1.0, 0.4 * seed_v)
	b.blob(Vector3(0.0, 0.33, 0.0), Vector3(0.1, 0.05, 0.1), 5, 2, petal.darkened(0.15), petal, 0.0, 0.0)
	b.blob(Vector3(0.0, 0.36, 0.0), Vector3(0.035, 0.03, 0.035), 4, 2, Color("#e8b830"), Color("#f4d060"), 0.0, 0.0)
	return b.build()


func _reed() -> ArrayMesh:
	var b := FarmMesh.new()
	b.sway = 1.0
	for i in range(4):
		var a := TAU * i / 4.0
		b.blade(Vector3(cos(a) * 0.05, 0.0, sin(a) * 0.05), Vector3(cos(a) * 0.1, 0.85 + 0.15 * (i % 2), sin(a) * 0.1), 0.05, Color("#6a7a3a"), Color("#b0b06a"), 0.0, a)
	b.cylinder(Vector3(0.0, 0.62, 0.0), 0.035, 0.035, 0.18, 4, Color("#6a4a2a"), Color("#8a5a30"), 0.0)
	return b.build()


func _shell() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.12, 0.06, 0.1), 6, 2, Color("#e8b0a0"), Color("#f8e0d4"), 0.0, 0.0)
	return b.build()


func _dig() -> ArrayMesh:
	var b := FarmMesh.new()
	b.blob(Vector3(0.0, 0.03, 0.0), Vector3(0.3, 0.05, 0.25), 7, 2, Color("#5a3a22"), Color("#7a5232"), 0.0, 0.15)
	return b.build()


func _crop(id: String, tier: int) -> ArrayMesh:
	var b := FarmMesh.new()
	b.sway = 1.0
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


## The landmarks' generated pieces, for what no pack has (landmark_models.gd names them `gen:<name>`).
func _landmark_mesh(n: String) -> ArrayMesh:
	var b := FarmMesh.new()
	match n:
		"eggs", "eggs_big":
			var k := 1.0 if n == "eggs" else 2.6
			for i in range(3):
				var a := TAU * i / 3.0 + 0.4
				var c := Color("#f2ead8") if i != 1 else Color("#d8e8c0")
				b.blob(Vector3(cos(a), 0.0, sin(a)) * 0.13 * k + Vector3(0.0, 0.14 * k, 0.0), Vector3(0.11, 0.15, 0.11) * k, 7, 4, c.darkened(0.15), c, 0.0, 0.0)
		"wisp":
			b.blob(Vector3(0.0, 0.9, 0.0), Vector3.ONE * 0.09, 5, 3, Color("#9fd8ff"), Color("#ffffff"), 0.5, 0.0)
		"tar":
			b.cylinder(Vector3(0.0, -0.02, 0.0), 1.25, 1.25, 0.05, 12, Color("#1c1a1e"), Color("#2a262c"), 0.0)
			for i in range(5):
				var a := TAU * i / 5.0 + 0.3
				b.blob(Vector3(cos(a) * 0.6, 0.04, sin(a) * 0.5), Vector3(0.12, 0.06, 0.12), 5, 2, Color("#2a262c"), Color("#4a4250"), 0.0, 0.0)
		"embers":
			b.cylinder(Vector3(0.0, 0.0, 0.0), 0.75, 0.6, 0.12, 10, Color("#5e5258"), Color("#6e6268"), 0.0)
			for i in range(7):
				var a := TAU * i / 7.0
				b.blob(Vector3(cos(a) * 0.35, 0.14, sin(a) * 0.35), Vector3(0.16, 0.08, 0.16), 5, 2, Color("#c8401a"), Color("#ff9a3c"), 0.5, 0.0)
			b.blob(Vector3(0.0, 0.16, 0.0), Vector3(0.22, 0.1, 0.22), 5, 2, Color("#e86a2a"), Color("#ffc870"), 0.5, 0.0)
		"pond":
			b.cylinder(Vector3(0.0, 0.01, 0.0), 1.0, 1.0, 0.02, 14, Color("#3f8fc0"), Color("#5ab4de"), 0.0)
		"icecream":
			b.cone(Vector3(0.0, 0.0, 0.0), 0.75, 2.2, 10, Color("#c8904a"), Color("#e8b870"), 0.0, 1.0)
			b.blob(Vector3(0.0, 2.45, 0.0), Vector3(1.05, 0.7, 1.05), 9, 5, Color("#e87ab8"), Color("#f8b8d8"), 0.0, 0.05)
			b.blob(Vector3(0.0, 3.1, 0.0), Vector3(0.8, 0.55, 0.8), 9, 5, Color("#f4ecd0"), Color("#ffffff"), 0.0, 0.05)
			b.blob(Vector3(0.0, 3.6, 0.0), Vector3(0.18, 0.18, 0.18), 6, 3, Color("#c8202a"), Color("#f04a4a"), 0.0, 0.0)
		"fountain":
			var choc := Color("#6a3a1e")
			b.cylinder(Vector3.ZERO, 1.35, 1.35, 0.4, 14, Color("#e8d0b0"), Color("#f4e2c8"), 0.0)
			b.cylinder(Vector3(0.0, 0.4, 0.0), 1.2, 1.2, 0.03, 14, choc, choc.lightened(0.1), 0.0)
			b.cylinder(Vector3(0.0, 0.4, 0.0), 0.18, 0.14, 1.0, 8, Color("#e8d0b0"), Color("#f4e2c8"), 0.0)
			b.cylinder(Vector3(0.0, 1.4, 0.0), 0.7, 0.7, 0.2, 12, Color("#e8d0b0"), Color("#f4e2c8"), 0.0)
			b.cylinder(Vector3(0.0, 1.6, 0.0), 0.62, 0.62, 0.03, 12, choc, choc.lightened(0.1), 0.0)
			b.blob(Vector3(0.0, 1.85, 0.0), Vector3(0.25, 0.3, 0.25), 7, 4, choc, choc.lightened(0.15), 0.0, 0.0)
		"satellite":
			b.box(Vector3(0.0, 0.5, 0.0), Vector3(0.8, 0.8, 0.8), Color("#c8ccd4"), 0.0, 0.3, Color("#e8ecf0"))
			b.box(Vector3(1.05, 0.55, 0.0), Vector3(1.2, 0.05, 0.6), Color("#2a4a9a"), 0.0, 0.3, Color("#4a7ad8"))
			b.box(Vector3(-1.05, 0.45, 0.0), Vector3(1.2, 0.05, 0.6), Color("#2a4a9a"), 0.0, 0.3, Color("#4a7ad8"))
			b.cone(Vector3(0.0, 0.9, 0.0), 0.35, 0.3, 8, Color("#e8ecf0"), Color("#ffffff"), 0.0)
			b.blob(Vector3(0.0, 1.25, 0.0), Vector3.ONE * 0.08, 5, 3, Color("#ff4a4a"), Color("#ffa0a0"), 0.5, 0.0)
		_:
			return null
	return b.build()


## Köpingen's timber buildings and street furniture (village_meshes.gd): "house_2", "apartment_1", "shop_0", "signpost", ...
func _village(n: String) -> ArrayMesh:
	var parts := n.rsplit("_", true, 1)
	var v := int(parts[1]) if parts.size() == 2 and parts[1].is_valid_int() else 0
	var base: String = parts[0] if parts.size() == 2 and parts[1].is_valid_int() else n
	match base:
		"house": return VillageMeshes.house(v)
		"apartment": return VillageMeshes.apartment(v)
		"shop": return VillageMeshes.shop(v)
		"cart": return VillageMeshes.hand_cart(v)
		"pizzeria": return VillageMeshes.pizzeria()
		"bathhouse": return VillageMeshes.bathhouse()
		"station": return VillageMeshes.station()
		"signpost": return VillageMeshes.signpost()
		"street_lamp": return VillageMeshes.scaled(VillageMeshes.street_lamp(), 0.85)
		"bus_stop": return VillageMeshes.bus_stop()
	warn_once(n, "farm: no village mesh '%s'" % n)
	return null


func _placeholder(w: int, h: int) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.4, 0.0), Vector3(maxf(0.5, w - 0.2), 0.8, maxf(0.5, h - 0.2)), Color("#9a80b8"), 0.0, 0.0, Color("#b89ad4"))
	return b.build()


## A mesh in the colour of a paint bucket. Walls, doors and windows are built again in it; the farmhouse keeps its roof and its
## timber and the plaster between them (the cool-grey vertices of the model, shades kept) takes the colour.
func _painted(base: String, variant: int) -> ArrayMesh:
	var col := PaintArt.bucket(variant)
	if col.a == 0.0:
		return mesh(base)
	match base:
		"wall_wood", "wall_stone":
			return _wall(col)
		"door":
			return _door(col)
		"window":
			return _window(col)
		"house":
			var src := mesh("house")
			if src == null:
				return null
			var arr := src.surface_get_arrays(0)
			var cols: PackedColorArray = arr[Mesh.ARRAY_COLOR]
			var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var lin := col.srgb_to_linear()
			var out := PackedColorArray()
			out.resize(cols.size())
			for i in range(cols.size()):
				var c := cols[i]
				# plaster: cool and not the black of the gaps or the grey of the foundation (the model's blue-grey walls)
				if c.b >= c.r * 1.02 and verts[i].y > 0.45 and c.get_luminance() > 0.09:
					var shade := clampf(c.get_luminance() / 0.5, 0.35, 1.0)
					out[i] = Color(lin.r * shade, lin.g * shade, lin.b * shade, c.a)
				else:
					out[i] = c
			arr[Mesh.ARRAY_COLOR] = out
			var m := ArrayMesh.new()
			m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
			return m
	return mesh(base)


func _wall(col: Color) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.05, 0.0), Vector3(1.0, 2.1, 1.0), col, 0.0, 0.0, col.lightened(0.1))
	return b.build()


func _door(col := Color.TRANSPARENT) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.95, 0.0), Vector3(0.9, 1.9, 0.18), WOOD.darkened(0.1) if col.a == 0.0 else col.darkened(0.1), 0.0)
	b.box(Vector3(0.28, 0.9, 0.12), Vector3(0.08, 0.08, 0.06), GOLD, 0.0)
	return b.build()


func _door_mat() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.02, 0.0), Vector3(0.8, 0.04, 0.5), Color("#8a3a2c"), 0.0)
	return b.build()


func _window(col := Color.TRANSPARENT) -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 1.1, 0.0), Vector3(0.9, 1.0, 0.16), WOOD if col.a == 0.0 else col, 0.0)
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


## The dark inside behind the Kenney cliff's cave opening (the cliff is a thin wall with a hole, set on the
## footprint's front edge so the rock wall's front row does not hide it).
func _cave_dark() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.45, 0.55), Vector3(0.9, 0.9, 0.4), Color("#14121a"), 0.0)
	return b.build()


## A mesh turned `yaw` radians about Y (the Kenney cliff pieces face -Z; the props face +Z).
func _turned(m: ArrayMesh, yaw: float) -> ArrayMesh:
	if m == null:
		return null
	var arr := m.surface_get_arrays(0)
	var basis := Basis(Vector3.UP, yaw)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var nrm: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	for i in range(v.size()):
		v[i] = basis * v[i]
		nrm[i] = basis * nrm[i]
	return _surface(v, nrm, arr[Mesh.ARRAY_COLOR], arr[Mesh.ARRAY_TEX_UV])


## Two prop meshes as one (their four channels joined).
func _merged(a: ArrayMesh, b: ArrayMesh) -> ArrayMesh:
	if a == null or b == null:
		return a if b == null else b
	var x := a.surface_get_arrays(0)
	var y := b.surface_get_arrays(0)
	var v: PackedVector3Array = x[Mesh.ARRAY_VERTEX]
	var n: PackedVector3Array = x[Mesh.ARRAY_NORMAL]
	var c: PackedColorArray = x[Mesh.ARRAY_COLOR]
	var uv: PackedVector2Array = x[Mesh.ARRAY_TEX_UV]
	v.append_array(y[Mesh.ARRAY_VERTEX])
	n.append_array(y[Mesh.ARRAY_NORMAL])
	c.append_array(y[Mesh.ARRAY_COLOR])
	uv.append_array(y[Mesh.ARRAY_TEX_UV])
	return _surface(v, n, c, uv)


func _surface(v: PackedVector3Array, n: PackedVector3Array, c: PackedColorArray, uv: PackedVector2Array) -> ArrayMesh:
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_NORMAL] = n
	arrays[Mesh.ARRAY_COLOR] = c
	arrays[Mesh.ARRAY_TEX_UV] = uv
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


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


func _bookshelf() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.95, 0.0), Vector3(0.95, 1.9, 0.4), WOOD.darkened(0.1), 0.0, 0.0, WOOD)
	var cols := [Color("#a83a2c"), Color("#3a6ab0"), Color("#d8b24a"), Color("#4a8a4a")]
	for row in range(4):
		for i in range(6):
			b.box(Vector3(-0.38 + 0.15 * i, 0.3 + 0.42 * row, 0.2), Vector3(0.1, 0.3, 0.05), cols[(i + row) % 4], 0.0)
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
# Köpingen's street furniture that is not timber (generated; the timber town is in village_meshes.gd)


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
