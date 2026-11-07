class_name AmbientView
extends Node3D
## The small living things of an outdoor map (M7a, the 3D port of the old client's "cozy extras"): fireflies on summer
## nights, butterflies by day in spring and summer, leaves falling from the trees in autumn, smoke from chimneys, mist
## at dawn. Each is one MultiMesh whose instances move entirely in a vertex shader (assets/shaders/ambient_*.gdshader):
## the CPU sends one `center` (the hero) and a fade per frame, nothing per instance, and nothing is simulated. Each is a
## toggle with a budget in quality.gd PRESETS (0 = off, nothing is built), and fades in and out when its time comes
## (day_night.gd decides the time of day, the season and the weather and passes them to `update`).
##
## `--alive=all` (for the bench and pictures) turns every one of them on whatever the hour and the season.

const SHADER_DIR := "res://assets/shaders/"
const BOX := Vector2(30.0, 24.0) ## fireflies, butterflies and mist live in a box this big (metres) round the hero
## A MultiMesh's bounds come from its instances' origins, which these ignore (they wrap round the hero): never cull them.
const NEVER_CULL := AABB(Vector3(-4000.0, -50.0, -4000.0), Vector3(8000.0, 400.0, 8000.0))
const BUTTERFLY_COLOURS := [Color("#f2a23a"), Color("#f4f0e4"), Color("#5d8fe0"), Color("#f2d64a"), Color("#e86a8a")]
const SMOKE_PUFFS := 12 ## puffs in one chimney's loop at most (Quality "smoke" is how many)

var view: FarmView
var force_all := false

var _fade := {"fireflies": 0.0, "butterflies": 0.0, "leaves": 0.0, "smoke": 0.0, "mist": 0.0}
var _nodes := {} ## what -> MultiMeshInstance3D
var _built := {} ## what -> the budget it was built for
var _mats := {} ## what -> ShaderMaterial
var _ver := {} ## what -> the FarmView.objects_version its anchors were made for
var _leaf_at := Vector3(1.0e9, 0.0, 0.0)
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	_rng.seed = 7
	for arg in OS.get_cmdline_user_args():
		if arg == "--alive=all":
			force_all = true


## A new map (or none: `null`, when the view is cleared for a dungeon): everything built for the old one goes at once.
func setup(v: FarmView) -> void:
	view = v
	for c in get_children():
		remove_child(c)
		c.queue_free()
	_nodes.clear()
	_built.clear()
	_mats.clear()
	_ver.clear()
	_leaf_at = Vector3(1.0e9, 0.0, 0.0)
	for k in _fade.keys():
		_fade[k] = 0.0


## Every frame. `st`: dark (0 day .. 1 night), year (spring, summer, autumn, winter), kind (the weather here), wind
## (its strength), f (the day's fraction, 0 at dawn), sky (the horizon colour), seasons (this biome has the four seasons),
## and `at` is where the hero stands.
func update(delta: float, st: Dictionary, at: Vector3) -> void:
	if view == null:
		return
	var dark: float = st["dark"]
	var year: String = st["year"]
	var kind: String = st["kind"]
	var f: float = st["f"]
	var seasons: bool = st["seasons"]
	var dry := kind != "rain" and kind != "storm" and kind != "snow" and kind != "hail"
	var dawn := maxf(smoothstep(0.955, 0.99, f), 1.0 - smoothstep(0.05, 0.14, f)) if (f > 0.9 or f < 0.2) else 0.0
	var want := {
		"fireflies": 1.0 if (force_all or (year == "summer" and seasons and dark > 0.55 and (kind == "sun" or kind == "cloudy" or kind == "fog" or kind == "wind"))) else 0.0,
		"butterflies": 1.0 if (force_all or ((year == "spring" or year == "summer") and seasons and dark < 0.3 and (kind == "sun" or kind == "cloudy"))) else 0.0,
		"leaves": 1.0 if (force_all or (year == "autumn" and seasons and dry)) else 0.0,
		"smoke": 1.0,
		"mist": 1.0 if force_all else (dawn if (dry and kind != "wind") else 0.0),
	}
	var k := 1.0 - pow(0.25, delta) # about two seconds to fade
	var shade := 1.0 - dark * 0.7
	var sky: Color = st["sky"]
	for what in _fade.keys():
		var budget := Quality.alive(what)
		if budget <= 0:
			_drop(what)
			_fade[what] = 0.0
			continue
		_fade[what] = lerpf(_fade[what], float(want[what]), k)
		var visible_now: bool = _fade[what] > 0.01
		if not visible_now:
			if _nodes.has(what):
				(_nodes[what] as Node3D).visible = false
			continue
		_ensure(what, budget, at)
		var node: MultiMeshInstance3D = _nodes.get(what)
		if node == null:
			continue
		node.visible = true
		var m: ShaderMaterial = _mats[what]
		m.set_shader_parameter("fade", _fade[what])
		match what:
			"fireflies", "mist":
				m.set_shader_parameter("center", at)
			"butterflies":
				m.set_shader_parameter("center", at)
				m.set_shader_parameter("shade", shade)
			"leaves":
				m.set_shader_parameter("wind", st["wind"])
				m.set_shader_parameter("shade", shade)
				m.set_shader_parameter("colour_a", DayNight.AUTUMN[0])
				m.set_shader_parameter("colour_b", DayNight.AUTUMN[1])
				m.set_shader_parameter("colour_c", DayNight.AUTUMN[2])
				if at.distance_to(_leaf_at) > 4.0 or int(_ver.get("leaves", -1)) != view.objects_version:
					_place_leaves(budget, at)
			"smoke":
				m.set_shader_parameter("wind", st["wind"])
				m.set_shader_parameter("shade", shade * 0.9 + 0.1)
				m.set_shader_parameter("colour", Color(0.8, 0.8, 0.82).lerp(Color(0.62, 0.64, 0.72), dark))
				if int(_ver.get("smoke", -1)) != view.objects_version:
					_build_smoke(budget)
			"mist":
				m.set_shader_parameter("colour", Color(0.9, 0.92, 0.95).lerp(sky, 0.35))


func _drop(what: String) -> void:
	if _nodes.has(what):
		(_nodes[what] as Node).queue_free()
		_nodes.erase(what)
		_mats.erase(what)
		_built.erase(what)


## Builds `what` for this budget if it is not built yet (or was built for another preset).
func _ensure(what: String, budget: int, at: Vector3) -> void:
	if _nodes.has(what) and int(_built.get(what, -1)) == budget:
		return
	_drop(what)
	_ver.erase(what)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	var mat := ShaderMaterial.new()
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	match what:
		"fireflies":
			mat.shader = load(SHADER_DIR + "ambient_firefly.gdshader")
			mm.mesh = quad
			mm.instance_count = budget
			_scatter(mm, budget, 0.25, 2.0, false)
		"butterflies":
			mat.shader = load(SHADER_DIR + "ambient_butterfly.gdshader")
			mm.mesh = quad
			mm.use_colors = true
			mm.instance_count = budget
			_scatter(mm, budget, 0.5, 1.6, true)
		"mist":
			mat.shader = load(SHADER_DIR + "ambient_mist.gdshader")
			var flat := QuadMesh.new()
			flat.size = Vector2.ONE
			flat.orientation = PlaneMesh.FACE_Y
			mm.mesh = flat
			mm.instance_count = budget
			_scatter(mm, budget, 0.0, 0.0, false)
		"leaves":
			mat.shader = load(SHADER_DIR + "ambient_leaf.gdshader")
			mm.mesh = quad
			mm.instance_count = budget
		"smoke":
			mat.shader = load(SHADER_DIR + "ambient_smoke.gdshader")
			mm.mesh = quad
	var node := MultiMeshInstance3D.new()
	node.name = what.capitalize()
	node.multimesh = mm
	node.material_override = mat
	node.custom_aabb = NEVER_CULL
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	_nodes[what] = node
	_mats[what] = mat
	_built[what] = budget
	if what == "leaves":
		_place_leaves(budget, at)
	elif what == "smoke":
		_build_smoke(budget)


## `n` instances at random places in the box (they wrap round the hero, so where they start does not matter).
func _scatter(mm: MultiMesh, n: int, y0: float, y1: float, coloured: bool) -> void:
	for i in range(n):
		var p := Vector3(_rng.randf() * BOX.x, _rng.randf_range(y0, y1), _rng.randf() * BOX.y)
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, p))
		mm.set_instance_custom_data(i, Color(_rng.randf(), _rng.randf(), 0.0, 0.0))
		if coloured:
			mm.set_instance_color(i, BUTTERFLY_COLOURS[i % BUTTERFLY_COLOURS.size()])


## The leaves start in the crowns of the trees nearest the hero (deciduous ones), `budget` of them spread over those.
func _place_leaves(budget: int, at: Vector3) -> void:
	_leaf_at = at
	_ver["leaves"] = view.objects_version
	var node: MultiMeshInstance3D = _nodes.get("leaves")
	if node == null:
		return
	var trees := view.trees_near(at, 16.0)
	var mm := node.multimesh
	if trees.is_empty():
		mm.visible_instance_count = 0
		return
	mm.visible_instance_count = -1
	for i in range(budget):
		var t: Vector3 = trees[i % trees.size()]
		var a := _h(i, 1) * TAU
		var r := sqrt(_h(i, 2)) * 0.8
		var p := Vector3(t.x + cos(a) * r, 1.4 + _h(i, 3) * 0.9, t.z + sin(a) * r)
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, p))
		mm.set_instance_custom_data(i, Color(_h(i, 4), _h(i, 5), 0.0, 0.0))


## `budget` puffs for every chimney on the map (up to 24 chimneys: the ones nearest the map's middle are not special,
## a village has a dozen).
func _build_smoke(budget: int) -> void:
	_ver["smoke"] = view.objects_version
	var node: MultiMeshInstance3D = _nodes.get("smoke")
	if node == null:
		return
	var tops := view.chimneys()
	var puffs := mini(budget, SMOKE_PUFFS)
	var mm := node.multimesh
	mm.instance_count = tops.size() * puffs
	for c in range(tops.size()):
		for j in range(puffs):
			var i := c * puffs + j
			mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, tops[c]))
			mm.set_instance_custom_data(i, Color(float(j) / puffs, _h(i, 6), 0.0, 0.0))


static func _h(i: int, salt: int) -> float:
	return fposmod(sin(float(i * 17 + salt * 131) * 12.9898) * 43758.5453, 1.0)


## How many of each thing is on screen now (for the bench and the checks).
func counts() -> Dictionary:
	var out := {}
	for what in _nodes.keys():
		var n: MultiMeshInstance3D = _nodes[what]
		if n.visible:
			out[what] = n.multimesh.instance_count if n.multimesh.visible_instance_count < 0 else n.multimesh.visible_instance_count
	return out
