class_name FxView
extends Node3D
## The fight on screen, a port of packages/clientljs/src/saga.ts to the 3D scene: a boss's attacks marked on the
## floor (circle, cone and line, filling up until they land; burning ground that pulses; a pull's whirl), every
## spell and attack as light and motion (swipes, bolts that fly and burst, rings, runes, lightning, a boss gathering
## power and its attack landing), numbers floating up from hits, the ring under the target, the lasting looks of
## shield wall, rage, the healing ring and a fallen friend, and the poof when a monster is beaten. Everything is
## built from a few primitives: a glow (an additive billboard quad), a flat shape on the floor (disc, sector,
## strip, band) and a Label3D. Colours follow the browser's MOVE_COLOUR and BOSS_MOVE_COLOUR tables.

## Colours of a boss's moves while it gathers power (clientljs/src/saga.ts, MOVE_COLOUR).
const MOVE_COLOUR := {
	"cleave": Color(1.0, 0.55, 0.15), "slam": Color(1.0, 0.75, 0.35), "rain": Color(0.55, 0.85, 1.0), "charge": Color(1.0, 1.0, 1.0),
	"freeze": Color(0.5, 0.95, 1.0), "pools": Color(1.0, 0.4, 0.1), "nova": Color(0.85, 0.3, 1.0), "summon": Color(0.5, 1.0, 0.5),
	"line": Color(1.0, 0.85, 0.55), "pull": Color(0.55, 0.45, 1.0), "mend": Color(0.45, 1.0, 0.55),
}
## Some bosses' moves look like where they live (BOSS_MOVE_COLOUR).
const BOSS_MOVE_COLOUR := {
	"rimturs": {"cleave": Color(0.55, 0.88, 1.0), "nova": Color(0.75, 0.92, 1.0)},
	"surt": {"nova": Color(1.0, 0.45, 0.12)},
	"hel": {"nova": Color(0.6, 1.0, 0.8), "pull": Color(0.55, 1.0, 0.75)},
	"jarnvakten": {"line": Color(1.0, 1.0, 1.0)},
	"blackis": {"line": Color(0.6, 0.5, 0.9)},
	"jormungand": {"line": Color(0.4, 0.9, 1.0), "pull": Color(0.35, 0.75, 1.0), "nova": Color(0.5, 1.0, 0.3)},
	"fafner": {"cleave": Color(1.0, 0.6, 0.15), "mend": Color(1.0, 0.85, 0.35)},
	"nattmara": {"nova": Color(0.6, 0.45, 1.0), "mend": Color(0.75, 0.6, 1.0)},
	"loke": {"line": Color(0.4, 0.9, 1.0), "pull": Color(0.55, 1.0, 0.75), "mend": Color(0.5, 1.0, 0.4)},
}
## Spells that fly from the caster to the target (tiles a second) and their colour.
const BOLTS := {
	"eldboll": {"speed": 13.0, "c": Color(1.0, 0.5, 0.12), "size": 0.75},
	"isspjut": {"speed": 19.0, "c": Color(0.55, 0.9, 1.0), "size": 0.55},
	"ljuspil": {"speed": 20.0, "c": Color(1.0, 0.92, 0.45), "size": 0.5},
	"mob_isande": {"speed": 11.0, "c": Color(0.6, 0.9, 1.0), "size": 0.5},
	# Helheim's bone spider spits a web (it slows you), pale and a little slower than a bolt
	"mob_benspindel": {"speed": 10.0, "c": Color(0.92, 0.94, 1.0), "size": 0.5},
}
const MOB_BOLT := {"speed": 12.0, "c": Color(0.55, 1.0, 0.55), "size": 0.45}
const FLOOR_Y := 0.045
const HIT_COLOURS := {"dmg": Color(1.0, 0.95, 0.9), "crit": Color(1.0, 0.85, 0.3), "heal": Color(0.5, 1.0, 0.55), "block": Color(0.75, 0.85, 1.0), "stun": Color(1.0, 0.95, 0.4), "kick": Color(0.55, 0.85, 1.0), "miss": Color(0.8, 0.8, 0.8), "xp": Color(1.0, 0.85, 0.4), "me": Color(1.0, 0.45, 0.4)}


class Fx:
	var t := 0.0
	var dur := 1.0
	var nodes: Array = []
	var step: Callable
	var on: Variant = null
	var at := Vector3.ZERO
	var to := Vector3.ZERO
	var done := false


class ZoneNode:
	var id := ""
	var root: Node3D
	var base: MeshInstance3D
	var fill: MeshInstance3D
	var edge: MeshInstance3D
	var hatch: MeshInstance3D ## the stripes (M8b), only drawn with Palette.pattern()
	var pattern := false ## was it built with stripes and the thick edge
	var rings: Array = []
	var shape := "circle"
	var born := 0.0
	var move := ""


var model: WorldModel
var find: Callable ## (id) -> Actor or null
var me_id := ""
var _list: Array = []
var _floaters: Array = [] ## {label, on, born, life, dx, dy, at}
var _zones: Dictionary = {} ## id -> ZoneNode
var _born: Dictionary = {} ## zone id -> server ms first seen
var _cast_move: Dictionary = {} ## boss animal id (int) -> move
var _zone_move: Dictionary = {} ## zone id -> move
var _windups: Dictionary = {} ## boss id -> Fx
var _delay: Dictionary = {} ## target id (str) -> local seconds until numbers may show
var _auras: Dictionary = {} ## player id -> {wall: Node3D, rage: Array, hot: Array, down: Node3D}
var _target_ring: MeshInstance3D = null
var _kick_shield: Sprite3D = null
var _t := 0.0
var _glow_tex: Texture2D
var _glow_mat: StandardMaterial3D
var _flat_mat: StandardMaterial3D
var _hatch_shader: Shader = load("res://assets/shaders/danger_hatch.gdshader")
var _last_hurt := 0.0
var _last_crit := 0.0
var _rng := RandomNumberGenerator.new()
var area := ""
var shake := 0.0 ## the camera reads this (seconds of shake left)
var target: Variant = null ## what I aim at (the ring on the floor), set by the view


func _init() -> void:
	var g := GradientTexture2D.new()
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 1))
	grad.set_color(1, Color(1, 1, 1, 0))
	grad.add_point(0.35, Color(1, 1, 1, 0.75))
	g.gradient = grad
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.5)
	g.fill_to = Vector2(0.5, 0.0)
	g.width = 64
	g.height = 64
	_glow_tex = g
	_glow_mat = StandardMaterial3D.new()
	_glow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glow_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_glow_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_glow_mat.billboard_keep_scale = true
	_glow_mat.albedo_texture = _glow_tex
	_glow_mat.no_depth_test = true
	_glow_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_flat_mat = StandardMaterial3D.new()
	_flat_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_flat_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flat_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_flat_mat.render_priority = 1
	_rng.randomize()


func setup(m: WorldModel, finder: Callable) -> void:
	model = m
	find = finder


## A new map: the telegraphs that are already there count as seen a moment ago.
func load_area(key: String) -> void:
	clear()
	area = key
	me_id = model.me
	var now := model.server_now()
	for z in model.zones():
		_born[str(z.get("id", ""))] = minf(now, float(z.get("at", now)) - 1200.0)


func clear() -> void:
	for f in _list:
		_free_fx(f)
	_list = []
	for fl in _floaters:
		fl["label"].queue_free()
	_floaters = []
	for zn in _zones.values():
		zn.root.queue_free()
	_zones = {}
	_born = {}
	_cast_move = {}
	_zone_move = {}
	_windups = {}
	_delay = {}
	for a in _auras.values():
		_free_aura(a)
	_auras = {}
	if _target_ring != null:
		_target_ring.queue_free()
		_target_ring = null
	if _kick_shield != null:
		_kick_shield.queue_free()
		_kick_shield = null
	area = ""


## Uses every material and every kind of text the fight draws once, tiny, for a moment at `at`, so the renderer
## compiles their pipelines and the font rasterises its glyphs now and not in the middle of the first fight (that
## first use was a 30–80 ms frame each, the "1 % low" of the first bench). Called when a dungeon is built.
func warm_up(at: Vector3) -> void:
	var f := _add(0.25, func(_fx: Fx, _k: float) -> void: pass, at)
	var tiny := 0.01
	var glow := _glow(Color.WHITE, tiny)
	glow.position = at + Vector3(0.0, 0.5, 0.0)
	var flat := _flat(disc_points(6), Color.WHITE)
	flat.position = at
	flat.scale = Vector3(tiny, 1.0, tiny)
	var ring := _ring(Color.WHITE, tiny)
	ring.position = at
	f.nodes = [glow, flat, ring]
	for size in [56, 48, 40]:
		var l := _label("0123456789+-!?%.,:()/ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖabcdefghijklmnopqrstuvwxyzåäö", Color.WHITE, size)
		l.position = at + Vector3(0.0, 0.5, 0.0)
		l.pixel_size = tiny * 0.01
		f.nodes.append(l)


# ---------------------------------------------------------------------------
# Primitives


static func scene_of(x: float, y: float) -> Vector3:
	var tile := Data.tile()
	return Vector3(x / tile, 0.0, y / tile)


func _glow(colour: Color, size: float) -> MeshInstance3D:
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	var mi := MeshInstance3D.new()
	mi.mesh = q
	var m: StandardMaterial3D = _glow_mat.duplicate()
	m.albedo_color = colour
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


static func _set_colour(mi: MeshInstance3D, colour: Color) -> void:
	var m: StandardMaterial3D = mi.material_override
	if m != null:
		m.albedo_color = colour


static func _set_size(mi: MeshInstance3D, size: float) -> void:
	mi.scale = Vector3(size, size, size)


## A flat mesh on the floor from a list of triangles' points (xz pairs as Vector2), in a colour.
func _flat(points: PackedVector2Array, colour: Color, parent: Node3D = null) -> MeshInstance3D:
	var mesh := ArrayMesh.new()
	if points.size() >= 3:
		var verts := PackedVector3Array()
		for p in points:
			verts.append(Vector3(p.x, 0.0, p.y))
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var m: StandardMaterial3D = _flat_mat.duplicate()
	m.albedo_color = colour
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position.y = FLOOR_Y
	(parent if parent != null else self).add_child(mi)
	return mi


## A disc of radius 1 (scale it), as triangles.
static func disc_points(n := 36) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(n):
		var a0 := TAU * i / n
		var a1 := TAU * (i + 1) / n
		pts.append(Vector2.ZERO)
		pts.append(Vector2(cos(a0), sin(a0)))
		pts.append(Vector2(cos(a1), sin(a1)))
	return pts


## A sector of radius 1 from the apex at the origin, `arc` radians wide, pointing along +x.
static func sector_points(arc: float, n := 14) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(n):
		var a0 := -arc / 2.0 + arc * i / n
		var a1 := -arc / 2.0 + arc * (i + 1) / n
		pts.append(Vector2.ZERO)
		pts.append(Vector2(cos(a0), sin(a0)))
		pts.append(Vector2(cos(a1), sin(a1)))
	return pts


## A strip from the origin along +x: 1 long and `wide` across.
static func strip_points(wide: float) -> PackedVector2Array:
	var h := wide / 2.0
	return PackedVector2Array([Vector2(0, -h), Vector2(1, -h), Vector2(1, h), Vector2(0, -h), Vector2(1, h), Vector2(0, h)])


## A thin band along a closed or open polyline (xz points), `w` wide.
static func band_points(line: PackedVector2Array, w: float, closed: bool) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var n := line.size()
	var count := n if closed else n - 1
	for i in range(count):
		var a := line[i]
		var b := line[(i + 1) % n]
		var d := (b - a).normalized()
		var nrm := Vector2(-d.y, d.x) * (w / 2.0)
		pts.append(a - nrm)
		pts.append(b - nrm)
		pts.append(b + nrm)
		pts.append(a - nrm)
		pts.append(b + nrm)
		pts.append(a + nrm)
	return pts


static func ring_line(r: float, n := 40) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(n):
		pts.append(Vector2(cos(TAU * i / n), sin(TAU * i / n)) * r)
	return pts


func _ring(colour: Color, r: float, w := 0.08, parent: Node3D = null) -> MeshInstance3D:
	return _flat(band_points(ring_line(r), w, true), colour, parent)


func _label(text: String, colour: Color, size := 56) -> Label3D:
	var l := Label3D.new()
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.text = text
	l.font_size = size
	Settings.scaled_label(l, 0.006)
	l.outline_size = 14
	l.outline_modulate = Color("2b2419")
	l.modulate = colour
	l.no_depth_test = true
	l.render_priority = 10
	add_child(l)
	return l


func _add(dur: float, step: Callable, at: Vector3, to: Vector3 = Vector3.INF, on: Variant = null, delay := 0.0) -> Fx:
	var f := Fx.new()
	f.t = -delay
	f.dur = dur
	f.at = at
	f.to = to if to != Vector3.INF else at
	f.on = on
	f.step = step
	_list.append(f)
	return f


func _free_fx(f: Fx) -> void:
	for n in f.nodes:
		if is_instance_valid(n):
			n.queue_free()
	f.nodes = []


## The middle of someone's body (where things hit them), or a fallback spot.
func body(id: Variant, fallback: Vector3) -> Vector3:
	if id != null:
		var a: Variant = find.call(id)
		if a is Actor:
			return (a as Actor).body_position()
	return fallback + Vector3(0.0, 0.6, 0.0)


func feet(id: Variant, fallback: Vector3) -> Vector3:
	if id != null:
		var a: Variant = find.call(id)
		if a is Actor:
			return (a as Actor).global_position
	return fallback


func _id_of(v: Variant) -> Variant:
	if v == null:
		return null
	if v is float or v is int:
		return int(v)
	return str(v)


func _species_of(by: Variant) -> String:
	if by is int:
		var a: Variant = model.world_for(area).get("animals", {}).get(str(by))
		if a is Dictionary:
			return str(a.get("species", ""))
	return ""


func move_colour(move: String, by: Variant) -> Color:
	var species := _species_of(by)
	var own: Variant = BOSS_MOVE_COLOUR.get(species, {}).get(move)
	if own is Color:
		return Palette.move(own, move)
	return Palette.move(MOVE_COLOUR.get(move, Color(1.0, 0.4, 0.2)), move)


# ---------------------------------------------------------------------------
# From the server


func on_change(c: Dictionary) -> void:
	if area == "":
		return
	var t := str(c.get("t", ""))
	if c.has("area") and str(c.get("area")) != area:
		return
	match t:
		"spell":
			_spell(c)
		"hit":
			_hit(c)
		"xp":
			if str(c.get("to", "")) == me_id and str(c.get("area", "farm")) == area:
				_xp(int(c.get("n", 0)))
		"fx":
			# (the server's fx are in pixels already: a tile's middle, as `fx(tx, ty)` in sim.ts makes it. Until M4b this
			# multiplied them by the tile size again, which put the dungeon's poofs and sparkles sixteen times too far away)
			var at := scene_of(float(c.get("x", 0)), float(c.get("y", 0)))
			var kind := str(c.get("kind", ""))
			if kind == "poof":
				poof(at)
			elif kind == "sparkle":
				sparkle(at)
			else:
				_farm_fx(kind, at)
		"object":
			var obj: Variant = c.get("obj")
			if obj is Dictionary and str(obj.get("kind", "")) == "saga_plate" and int(obj.get("variant", 0)) == 1:
				_plate_lit(int(obj.get("x", 0)), int(obj.get("y", 0)))
		"zone":
			var zid := str(c.get("id", ""))
			var z: Variant = c.get("zone")
			if z is Dictionary:
				if not _born.has(zid):
					_born[zid] = model.server_now()
					var by := int(z.get("by", -1))
					var move: String = str(_cast_move.get(by, ""))
					if move != "" and float(z.get("at", 0)) > model.server_now():
						_zone_move[zid] = move
					# something is about to land near me
					var me: Variant = find.call(me_id)
					if me is Actor and model.server_now() < float(z.get("at", 0)):
						var d := (me as Actor).global_position.distance_to(scene_of(float(z.get("x", 0)), float(z.get("y", 0))))
						if d < float(z.get("r", 0)) + 2.5:
							Sfx.play("warn")
			else:
				_born.erase(zid)
				_zone_move.erase(zid)


func _spell(c: Dictionary) -> void:
	var by: Variant = _id_of(c.get("by"))
	var on: Variant = _id_of(c.get("on"))
	var from := scene_of(float(c.get("x", 0)), float(c.get("y", 0)))
	var has_to: bool = c.has("tx") and c.has("ty")
	var to := scene_of(float(c.get("tx", 0)), float(c.get("ty", 0))) if has_to else from
	var s := str(c.get("spell", ""))
	var mine: bool = by is String and by == me_id
	var me: Variant = find.call(me_id)
	var near: bool = not (me is Actor) or (me as Actor).global_position.distance_to(from) < 16.0
	if mine or near:
		if s.begins_with("cast_"):
			var move := s.substr(5)
			Sfx.play("windup_" + move, _warn_of(by, move))
		else:
			Sfx.play(s)
	if BOLTS.has(s) or (s.begins_with("mob_") and s != "mob_draugbage"):
		if has_to:
			_bolt(s, BOLTS.get(s, MOB_BOLT), from, to, on, by)
		return
	if s == "mob_draugbage" and has_to:
		_arrow(from, to, on)
		return
	if s.begins_with("cast_"):
		var move := s.substr(5)
		if by is int:
			_cast_move[by] = move
			for z in model.zones():
				if int(z.get("by", -1)) == by and float(z.get("at", 0)) > model.server_now() and not _zone_move.has(str(z.get("id", ""))):
					_zone_move[str(z.get("id", ""))] = move
		_windup(move, by, from)
		return
	if s.begins_with("land_"):
		_land(s.substr(5), from, by)
		return
	# my own swing: the hero lunges at what it hit
	if mine and me is Actor and s in ["hugg", "yxhugg", "skoldslag", "virvelvind"]:
		var hero_node: Variant = get_parent().get_node_or_null("Hero")
		if hero_node is Hero:
			(hero_node as Hero).swing(to if has_to else from + Vector3(0, 0, -1), Color(1.0, 0.9, 0.7))
	match s:
		"hugg":
			_slash(on, to, Color(0.9, 0.95, 1.0), 0.6, 1.0)
		"yxhugg":
			_slash(on, to, Color(1.0, 0.55, 0.25), 0.75, 1.6)
		"claw":
			_claw(on, to)
		"utmana":
			_taunt(by, from)
		"skoldslag":
			_burst_ring(on, to, Color(0.5, 0.75, 1.0), 1.0, 0.35)
			_stars(on, to, float(Data.spell("skoldslag").get("ms", 1500)) / 1000.0)
		"skoldmur":
			_burst_ring(by, from, Color(1.0, 0.85, 0.45), 1.6, 0.45)
		"lakerunan":
			_heal_rune(on if on != null else by, to, 1.1, 0.9)
		"lakekrets":
			_heal_ring(by, from, float(Data.spell("lakekrets").get("radius", 4)))
		"vackupp":
			_sunrise(on, to)
		"stormsteg":
			_charge(from, to, on)
		"virvelvind":
			_whirl(by, from, float(Data.spell("virvelvind").get("radius", 2.2)))
		"raseri":
			_burst_ring(by, from, Color(1.0, 0.3, 0.1), 1.9, 0.5)
		"askregn":
			_storm(to, float(Data.spell("askregn").get("radius", 2.4)))
		"blink":
			_blink(from, to)
		"potion":
			_potion(by, from)
		"charge_land":
			_boss_charge(from, to)


func _warn_of(by: Variant, move: String) -> float:
	var b := Data.boss(_species_of(by))
	for mv in b.get("moves", []):
		if str(mv.get("move", "")) == move:
			return float(mv.get("warn", 1500))
	return 1500.0


# ---------------------------------------------------------------------------
# Spells as light and motion


## A fireball, an ice lance, a light arrow or a monster's bolt: flies, then bursts on the target.
func _bolt(id: String, b: Dictionary, from: Vector3, to: Vector3, on: Variant, by: Variant) -> void:
	var start := body(by, from)
	var end0 := body(on, to)
	var travel := clampf(start.distance_to(end0) / float(b.get("speed", 12.0)), 0.1, 0.6)
	_hold_numbers(on, travel)
	var colour: Color = b.get("c", Color.WHITE)
	var size: float = b.get("size", 0.5)
	var ice := id == "isspjut" or id == "mob_isande"
	var fire := id == "eldboll"
	var head := _glow(colour, size * 1.8)
	var core := _glow(Color(1, 1, 0.9), size * 0.75)
	var trail: Array = []
	for i in range(5):
		trail.append(_glow(colour, size * 0.9))
	var step := func(fx: Fx, k: float) -> void:
		var end := body(fx.on, fx.to)
		var p := start.lerp(end, k) + Vector3(0.0, sin(k * PI) * (0.35 if fire else 0.1), 0.0)
		head.position = p
		core.position = p
		if ice:
			head.scale = Vector3(2.2, 0.55, 1.0)
		for i in range(trail.size()):
			var back := start.lerp(end, maxf(0.0, k - 0.05 * (i + 1)))
			trail[i].position = back + Vector3(0.0, (sin(k * PI) * 0.3) if fire else 0.1, 0.0)
			_set_colour(trail[i], Color(colour.r, colour.g, colour.b, 0.6 - i * 0.1))
	var f := _add(travel, step, start, to, on)
	f.nodes = [head, core] + trail
	if fire:
		_explode(end0, Color(1.0, 0.5, 0.12), 1.4, on, travel)
	elif ice:
		_shatter(end0, Color(0.6, 0.92, 1.0), on, travel)
	else:
		_explode(end0, colour, 0.8, on, travel)


## An arrow from the draug archer's bow.
func _arrow(from: Vector3, to: Vector3, on: Variant) -> void:
	var start := body(null, from)
	var end := body(on, to)
	var travel := clampf(start.distance_to(end) * 0.04, 0.12, 0.26)
	_hold_numbers(on, travel)
	var shaft := _glow(Color(0.85, 0.75, 0.55), 0.6)
	var step := func(fx: Fx, k: float) -> void:
		var e := body(fx.on, fx.to)
		shaft.position = start.lerp(e, k) + Vector3(0.0, sin(k * PI) * 0.4, 0.0)
		shaft.scale = Vector3(1.6, 0.25, 1.0)
	var f := _add(travel, step, start, to, on)
	f.nodes = [shaft]


## A burst of light and sparks (on someone: it follows them; after a delay: when a bolt lands).
func _explode(spot: Vector3, colour: Color, size: float, on: Variant = null, delay := 0.0) -> void:
	var big := _glow(colour, size)
	var core := _glow(Color(1, 1, 0.85), size * 0.7)
	var sparks: Array = []
	var dirs: Array = []
	for i in range(7):
		sparks.append(_glow(colour, 0.22))
		var a := TAU * i / 7.0 + _rng.randf() * 0.6
		dirs.append(Vector3(cos(a), 0.3 + _rng.randf() * 0.5, sin(a)) * (1.1 + _rng.randf()))
	for n in [big, core] + sparks:
		n.visible = false
	var step := func(fx: Fx, k: float) -> void:
		var at := body(fx.on, fx.at) if fx.on != null else fx.at
		var e := _ease_out(k)
		big.visible = true
		core.visible = true
		big.position = at
		core.position = at
		_set_size(big, 0.8 + e * 1.6)
		_set_colour(big, Color(colour.r, colour.g, colour.b, 0.85 * (1.0 - k)))
		_set_size(core, maxf(0.05, 0.7 * (1.0 - k)))
		for i in range(sparks.size()):
			sparks[i].visible = true
			sparks[i].position = at + dirs[i] * e
			_set_colour(sparks[i], Color(colour.r, colour.g, colour.b, 1.0 - k))
	var f := _add(0.4, step, spot, Vector3.INF, on, delay)
	f.nodes = [big, core] + sparks


func _shatter(spot: Vector3, colour: Color, on: Variant = null, delay := 0.0) -> void:
	var flash := _glow(colour, 1.2)
	var bits: Array = []
	var dirs: Array = []
	for i in range(8):
		bits.append(_glow(Color(0.85, 0.97, 1.0), 0.3))
		var a := TAU * i / 8.0 + _rng.randf() * 0.5
		dirs.append(Vector3(cos(a), 0.5, sin(a)) * (0.8 + _rng.randf() * 0.9))
	for n in [flash] + bits:
		n.visible = false
	var step := func(fx: Fx, k: float) -> void:
		var at := body(fx.on, fx.at) if fx.on != null else fx.at
		var e := _ease_out(k)
		flash.visible = true
		flash.position = at
		_set_size(flash, maxf(0.05, 1.2 * (1.0 - k * 0.5)))
		_set_colour(flash, Color(colour.r, colour.g, colour.b, 0.6 * (1.0 - k)))
		for i in range(bits.size()):
			bits[i].visible = true
			bits[i].position = at + dirs[i] * e - Vector3(0.0, 0.8 * k * k, 0.0)
			_set_colour(bits[i], Color(1, 1, 1, 1.0 - k))
	var f := _add(0.5, step, spot, Vector3.INF, on, delay)
	f.nodes = [flash] + bits


## A sword or axe swipe across the target.
func _slash(on: Variant, at: Vector3, colour: Color, radius: float, width: float) -> void:
	var n := 9
	var dots: Array = []
	var cores: Array = []
	for i in range(n):
		dots.append(_glow(colour, 0.32 * width))
		cores.append(_glow(Color(1, 1, 1), 0.13 * width))
	var a0 := -2.4 + _rng.randf() * 0.5
	var step := func(fx: Fx, k: float) -> void:
		var m := body(fx.on, fx.at)
		var reveal := _ease_out(minf(1.0, k * 1.8))
		for i in range(n):
			var u := float(i) / float(n - 1)
			var show := u <= reveal
			dots[i].visible = show
			cores[i].visible = show
			if not show:
				continue
			var a := a0 + u * 2.3
			var p := m + Vector3(cos(a) * radius, sin(a) * radius * 0.75, 0.0)
			dots[i].position = p
			cores[i].position = p
			var fade := (1.0 - k) * sin(u * PI)
			_set_colour(dots[i], Color(colour.r, colour.g, colour.b, 0.9 * fade))
			_set_colour(cores[i], Color(1, 1, 1, fade))
	var f := _add(0.26, step, at, Vector3.INF, on)
	f.nodes = dots + cores


## A monster's claws: three red scratches across the body.
func _claw(on: Variant, at: Vector3) -> void:
	var lines: Array = []
	for i in range(3):
		var mi := _glow(Color(1.0, 0.25, 0.2), 0.5)
		lines.append(mi)
	var step := func(fx: Fx, k: float) -> void:
		var m := body(fx.on, fx.at)
		var reveal := minf(1.0, k * 3.0)
		for i in range(3):
			var l: MeshInstance3D = lines[i]
			l.position = m + Vector3(-0.3 + i * 0.2 + 0.22 * reveal, 0.3 - 0.3 * reveal, 0.0)
			l.scale = Vector3(0.35, 1.3 * reveal + 0.1, 1.0)
			l.rotation.z = 0.6
			_set_colour(l, Color(1.0, 0.25, 0.2, 0.9 * (1.0 - k)))
	var f := _add(0.3, step, at, Vector3.INF, on)
	f.nodes = lines


## Utmana!: a shout ringing out across the floor and a flash on the one shouting.
func _taunt(by: Variant, at: Vector3) -> void:
	var reach := float(Data.spell("utmana").get("radius", 5))
	var ring := _ring(Color(1.0, 0.45, 0.2, 0.8), 1.0, 0.12)
	var glow := _glow(Color(1.0, 0.4, 0.15), 1.6)
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		ring.position = Vector3(m.x, FLOOR_Y, m.z)
		var r := maxf(0.05, reach * _ease_out(k))
		ring.scale = Vector3(r, 1.0, r)
		_set_colour(ring, Color(1.0, 0.45, 0.2, 0.8 * (1.0 - k)))
		glow.position = m + Vector3(0.0, 0.7, 0.0)
		_set_colour(glow, Color(1.0, 0.4, 0.15, 0.6 * (1.0 - k)))
	var f := _add(0.6, step, at, Vector3.INF, by)
	f.nodes = [ring, glow]


## Stars circling a dazed head.
func _stars(on: Variant, at: Vector3, dur: float) -> void:
	var stars: Array = []
	for i in range(3):
		stars.append(_glow(Color(1.0, 0.95, 0.4), 0.25))
	var step := func(fx: Fx, k: float) -> void:
		var a: Variant = find.call(fx.on) if fx.on != null else null
		var h := (a as Actor).head_position() if a is Actor else fx.at + Vector3(0, 1.2, 0)
		for i in range(3):
			var ang := _t * 7.0 + TAU * i / 3.0
			stars[i].position = h + Vector3(cos(ang) * 0.4, sin(ang) * 0.12, sin(ang) * 0.4)
			_set_colour(stars[i], Color(1.0, 0.95, 0.4, minf(1.0, (1.0 - k) * 4.0)))
	var f := _add(dur, step, at, Vector3.INF, on)
	f.nodes = stars


## A ring of light bursting out of someone (shield wall, rage, a stun).
func _burst_ring(on: Variant, at: Vector3, colour: Color, size: float, dur: float) -> void:
	var ring := _ring(colour, 1.0, 0.1)
	var glow := _glow(colour, size * 1.4)
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var e := _ease_out(k)
		ring.position = Vector3(m.x, FLOOR_Y, m.z)
		var r := maxf(0.05, size * (0.3 + e))
		ring.scale = Vector3(r, 1.0, r)
		_set_colour(ring, Color(colour.r, colour.g, colour.b, 1.0 - k))
		glow.position = m + Vector3(0.0, 0.6, 0.0)
		_set_colour(glow, Color(colour.r, colour.g, colour.b, 0.55 * (1.0 - k)))
	var f := _add(dur, step, at, Vector3.INF, on)
	f.nodes = [ring, glow]


## Läkerunan: a green rune circle under a friend and light rising from it.
func _heal_rune(on: Variant, at: Vector3, size: float, dur: float) -> void:
	var c := Color(0.45, 1.0, 0.55)
	var ring := _ring(c, 1.0, 0.07)
	var inner := _ring(c, 0.78, 0.05)
	var motes: Array = []
	var offs: Array = []
	for i in range(7):
		motes.append(_glow(Color(0.6, 1.0, 0.65), 0.22))
		offs.append([(_rng.randf() - 0.5) * 0.9, _rng.randf() * 0.4, 0.9 + _rng.randf() * 0.6])
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var fade := k / 0.15 if k < 0.15 else 1.0 - (k - 0.15) / 0.85
		var r := size * (0.7 + 0.3 * minf(1.0, k * 3.0))
		for rg in [ring, inner]:
			rg.position = Vector3(m.x, FLOOR_Y, m.z)
			rg.scale = Vector3(r, 1.0, r)
			rg.rotation.y = _t * 1.5
			_set_colour(rg, Color(c.r, c.g, c.b, 0.9 * fade))
		for i in range(motes.size()):
			var u := clampf((k - offs[i][1]) / (1.0 - offs[i][1]), 0.0, 1.0)
			motes[i].visible = u > 0.0 and u < 1.0
			motes[i].position = m + Vector3(offs[i][0], 0.3 + u * offs[i][2], 0.0)
			_set_colour(motes[i], Color(0.6, 1.0, 0.65, 1.0 - u))
	var f := _add(dur, step, at, Vector3.INF, on)
	f.nodes = [ring, inner] + motes


## Läkekrets: a big ring of runes spreading round the healer.
func _heal_ring(by: Variant, at: Vector3, radius: float) -> void:
	var c := Color(0.45, 1.0, 0.55)
	var ring := _ring(c, 1.0, 0.1)
	var inner := _ring(c, 0.6, 0.06)
	var glow := _glow(Color(0.5, 1.0, 0.6), 1.9)
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var e := _ease_out(minf(1.0, k * 2.0))
		var fade := 1.0 - maxf(0.0, k - 0.5) / 0.5
		for rg in [ring, inner]:
			rg.position = Vector3(m.x, FLOOR_Y, m.z)
			var r := maxf(0.05, radius * e)
			rg.scale = Vector3(r, 1.0, r)
			rg.rotation.y = -_t * 0.8
			_set_colour(rg, Color(c.r, c.g, c.b, 0.85 * fade))
		glow.position = m + Vector3(0.0, 0.5, 0.0)
		_set_colour(glow, Color(0.5, 1.0, 0.6, 0.5 * fade))
	var f := _add(1.3, step, at, Vector3.INF, by)
	f.nodes = [ring, inner, glow]


## Väck upp!: morning light pours down on a fallen friend.
func _sunrise(on: Variant, at: Vector3) -> void:
	var column := _glow(Color(1.0, 0.9, 0.55), 1.2)
	var ring := _ring(Color(1.0, 0.85, 0.4), 1.0, 0.08)
	var motes: Array = []
	for i in range(6):
		motes.append(_glow(Color(1.0, 0.95, 0.6), 0.25))
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var fade := k / 0.2 if k < 0.2 else 1.0 - (k - 0.2) / 0.8
		column.position = m + Vector3(0.0, 2.5, 0.0)
		column.scale = Vector3(1.0, 5.0, 1.0)
		_set_colour(column, Color(1.0, 0.9, 0.55, 0.5 * fade))
		ring.position = Vector3(m.x, FLOOR_Y, m.z)
		ring.rotation.y = _t
		_set_colour(ring, Color(1.0, 0.85, 0.4, 0.9 * fade))
		for i in range(6):
			var a := TAU * i / 6.0 + _t * 2.0
			motes[i].position = m + Vector3(cos(a) * 0.75 * fade, 0.5, sin(a) * 0.75 * fade)
			_set_colour(motes[i], Color(1.0, 0.95, 0.6, fade))
	var f := _add(1.4, step, at, Vector3.INF, on)
	f.nodes = [column, ring] + motes


## Stormsteg: a rush of wind from where you were to the monster, and a thump.
func _charge(from: Vector3, to: Vector3, on: Variant) -> void:
	var streaks: Array = []
	for i in range(3):
		streaks.append(_glow(Color(0.85, 0.95, 1.0), 0.5))
	var dist := from.distance_to(to)
	var step := func(fx: Fx, k: float) -> void:
		for i in range(3):
			var s: MeshInstance3D = streaks[i]
			s.position = from.lerp(to, 0.5) + Vector3(0.0, 0.5 + (i - 1) * 0.15, 0.0)
			s.scale = Vector3(maxf(0.1, dist * 1.4), 0.25 - absf(i - 1) * 0.08, 1.0)
			_set_colour(s, Color(0.85, 0.95, 1.0, 0.75 * (1.0 - k)))
	var f := _add(0.45, step, from, to)
	f.nodes = streaks
	for i in range(5):
		dust(from.lerp(to, i / 4.0), 2)
	_burst_ring(on, to, Color(1, 1, 1), 1.1, 0.35)
	_stars(on, to, float(Data.spell("stormsteg").get("ms", 1000)) / 1000.0)
	shake = maxf(shake, 0.15)


## Virvelvind: blades of wind spinning round the warrior.
func _whirl(by: Variant, at: Vector3, radius: float) -> void:
	var ring := _ring(Color(0.85, 0.9, 1.0), radius, 0.06)
	var blades: Array = []
	for b in range(3):
		for i in range(6):
			blades.append(_glow(Color(0.92, 0.96, 1.0), maxf(0.1, 0.38 - i * 0.045)))
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var fade := 1.0 if k < 0.2 else 1.0 - (k - 0.2) / 0.8
		ring.position = Vector3(m.x, FLOOR_Y, m.z)
		_set_colour(ring, Color(0.85, 0.9, 1.0, 0.5 * fade))
		for b in range(3):
			var base := _t * 16.0 + TAU * b / 3.0
			for i in range(6):
				var a := base - i * 0.16
				var g: MeshInstance3D = blades[b * 6 + i]
				g.position = m + Vector3(cos(a) * radius * 0.85, 0.5, sin(a) * radius * 0.85)
				_set_colour(g, Color(0.92, 0.96, 1.0, (0.85 - i * 0.12) * fade))
	var f := _add(0.55, step, at, Vector3.INF, by)
	f.nodes = [ring] + blades


## Åskregn: lightning strikes all over the spot.
func _storm(at: Vector3, radius: float) -> void:
	var ring := _ring(Color(0.6, 0.8, 1.0), radius, 0.08)
	ring.position = Vector3(at.x, FLOOR_Y, at.z)
	var bolts: Array = []
	var spots: Array = []
	for i in range(5):
		var a := _rng.randf() * TAU
		var d := 0.0 if i == 0 else _rng.randf() * radius * 0.85
		spots.append([at + Vector3(cos(a) * d, 0.0, sin(a) * d), i * 0.07])
		var bolt := _glow(Color(0.7, 0.85, 1.0), 0.5)
		bolt.visible = false
		bolts.append(bolt)
	var shook := [false] # (a lambda may not assign a captured local: a one-slot array instead)
	var step := func(fx: Fx, k: float) -> void:
		_set_colour(ring, Color(0.6, 0.8, 1.0, 0.7 * (1.0 - k)))
		var t := k * 0.6
		for i in range(5):
			var age: float = (t - spots[i][1]) / 0.18
			var b: MeshInstance3D = bolts[i]
			if age < 0.0 or age > 1.0:
				b.visible = false
				continue
			if not shook[0]:
				shook[0] = true
				shake = maxf(shake, 0.25)
			b.visible = true
			b.position = spots[i][0] + Vector3(0.0, 2.2, 0.0)
			b.scale = Vector3(0.45, 4.5, 1.0)
			_set_colour(b, Color(0.8, 0.9, 1.0, 1.0 - age))
	var f := _add(0.6, step, at)
	f.nodes = [ring] + bolts


## Blink: a puff of purple sparkles where you were and where you land.
func _blink(from: Vector3, to: Vector3) -> void:
	for at in [from, to]:
		var core := _glow(Color(0.7, 0.45, 1.0), 1.3)
		var motes: Array = []
		for i in range(8):
			motes.append(_glow(Color(0.9, 0.75, 1.0), 0.22))
		var spot: Vector3 = at
		var step := func(fx: Fx, k: float) -> void:
			var e := _ease_out(k)
			core.position = spot + Vector3(0.0, 0.6, 0.0)
			_set_size(core, maxf(0.05, 1.3 * (1.0 - k)))
			for i in range(8):
				var a := TAU * i / 8.0 + k * 3.0
				motes[i].position = spot + Vector3(cos(a) * 0.9 * e, 0.6 + sin(a) * 0.4 * e, sin(a) * 0.9 * e)
				_set_colour(motes[i], Color(0.9, 0.75, 1.0, 1.0 - k))
		var f := _add(0.5, step, spot)
		f.nodes = [core] + motes


## A healing potion: bubbles, then a green glow.
func _potion(by: Variant, at: Vector3) -> void:
	var bubbles: Array = []
	var offs: Array = []
	for i in range(6):
		bubbles.append(_glow(Color(1.0, 0.45, 0.6), 0.15 + _rng.randf() * 0.12))
		offs.append([(_rng.randf() - 0.5) * 0.6, _rng.randf() * 0.5])
	var glow := _glow(Color(0.45, 1.0, 0.55), 1.4)
	var step := func(fx: Fx, k: float) -> void:
		var m := body(fx.on, fx.at)
		for i in range(6):
			var u := clampf((k - offs[i][1]) / 0.5, 0.0, 1.0)
			bubbles[i].visible = u > 0.0 and u < 1.0
			bubbles[i].position = m + Vector3(offs[i][0] + sin(u * 9.0) * 0.1, 0.2 + u * 1.0, 0.0)
			_set_colour(bubbles[i], Color(1.0, 0.45, 0.6, 1.0 - u))
		glow.position = m
		glow.visible = k > 0.4
		_set_colour(glow, Color(0.45, 1.0, 0.55, 0.5 * (1.0 - (k - 0.4) / 0.6)))
	var f := _add(1.0, step, at, Vector3.INF, by)
	f.nodes = bubbles + [glow]


# ---------------------------------------------------------------------------
# Bosses: gathering power, the attack landing, stopped


## A boss gathering power: its colour swells around it and sparks rush in.
func _windup(move: String, by: Variant, at: Vector3) -> void:
	var warn := _warn_of(by, move) / 1000.0
	var c := move_colour(move, by)
	if move == "mend":
		_mend_windup(by, at, warn, c)
		return
	var big := _glow(c, 2.0)
	var sparks: Array = []
	var offs: Array = []
	for i in range(10):
		sparks.append(_glow(c, 0.25))
		offs.append([TAU * i / 10.0, _rng.randf() * 0.7])
	var step := func(fx: Fx, k: float) -> void:
		var m := body(fx.on, fx.at)
		var pulse := 0.75 + 0.25 * sin(_t * (8.0 + k * 16.0))
		big.position = m
		_set_size(big, (1.2 + k * 1.0) * (1.0 + 0.1 * pulse))
		_set_colour(big, Color(c.r, c.g, c.b, (0.25 + 0.45 * k) * pulse))
		for i in range(10):
			var u := fmod(k * 2.2 + offs[i][1], 1.0)
			var d := (1.0 - u) * 2.2
			var a: float = offs[i][0] + u
			sparks[i].position = m + Vector3(cos(a) * d, 0.2 + sin(a) * d * 0.4, sin(a) * d * 0.7)
			_set_colour(sparks[i], Color(c.r, c.g, c.b, u))
	var f := _add(warn, step, at, Vector3.INF, by)
	f.nodes = [big] + sparks
	if by is int:
		_windups[by] = f


## A boss curling up to heal: soft green pulses rising off it and rings breathing out under it.
func _mend_windup(by: Variant, at: Vector3, warn: float, c: Color) -> void:
	var glow := _glow(c, 2.4)
	var rings: Array = [_ring(c, 1.0, 0.08), _ring(c, 1.0, 0.08)]
	var motes: Array = []
	for i in range(6):
		motes.append(_glow(c, 0.25))
	var zs: Array = []
	for i in range(3):
		zs.append(_label("z", Color(1, 1, 1), 40))
	var step := func(fx: Fx, k: float) -> void:
		var m := body(fx.on, fx.at)
		var ft := feet(fx.on, fx.at)
		var beat := fmod(_t * 1.4, 1.0)
		glow.position = m
		_set_colour(glow, Color(c.r, c.g, c.b, 0.18 + 0.14 * sin(_t * 4.0)))
		for i in range(2):
			var u := fmod(beat + i * 0.5, 1.0)
			var rg: MeshInstance3D = rings[i]
			rg.position = Vector3(ft.x, FLOOR_Y, ft.z)
			var r := maxf(0.05, 0.6 + u * 1.4)
			rg.scale = Vector3(r, 1.0, r)
			_set_colour(rg, Color(c.r, c.g, c.b, 0.7 * (1.0 - u)))
		for i in range(6):
			var u := fmod(_t * 0.6 + i / 6.0, 1.0)
			motes[i].position = m + Vector3(sin(i * 2.3 + u * 4.0) * 0.8, 0.3 - u * 1.8 + 1.5, 0.0)
			_set_colour(motes[i], Color(c.r, c.g, c.b, 1.0 - u))
		var a: Variant = find.call(fx.on) if fx.on != null else null
		var top := (a as Actor).head_position() if a is Actor else m + Vector3(0, 1, 0)
		for i in range(3):
			var u := fmod(_t * 0.5 + i / 3.0, 1.0)
			var l: Label3D = zs[i]
			l.position = top + Vector3(0.4 + u * 0.6, 0.2 + u * 1.0, 0.0)
			l.modulate = Color(1, 1, 1, 0.9 * (1.0 - u))
	var f := _add(warn, step, at, Vector3.INF, by)
	f.nodes = [glow] + rings + motes + zs
	if by is int:
		_windups[by] = f


## A boss's attack was stopped (Sköldslag, Stormsteg, Isspjut): its power bursts away in blue.
func _stopped(id: int) -> void:
	var w: Variant = _windups.get(id)
	if w is Fx:
		(w as Fx).t = (w as Fx).dur
	_windups.erase(id)
	var a: Variant = find.call(id)
	if not (a is Actor):
		return
	var at: Vector3 = (a as Actor).global_position
	_burst_ring(id, at, Color(0.5, 0.85, 1.0), 1.6, 0.55)
	_shatter((a as Actor).body_position(), Color(0.55, 0.85, 1.0), id)
	shake = maxf(shake, 0.3)


func _zone_near(at: Vector3) -> Dictionary:
	for z in model.zones():
		if scene_of(float(z.get("x", 0)), float(z.get("y", 0))).distance_to(at) < 0.1:
			return z
	return {}


## A boss's big attack lands where it was marked.
func _land(move: String, at: Vector3, by: Variant) -> void:
	var zone := _zone_near(at)
	var r := float(zone.get("r", 2.0))
	var c := move_colour(move, by)
	if move == "cleave" and str(zone.get("shape", "")) == "cone":
		var dir := float(zone.get("dir", 0.0))
		var arc := deg_to_rad(float(zone.get("arc", 90)))
		var dots: Array = []
		for i in range(14 * 3):
			dots.append(_glow(c, 0.6))
		var step := func(fx: Fx, k: float) -> void:
			var sweep := _ease_out(minf(1.0, k * 1.6))
			for i in range(14):
				var u := i / 13.0
				var show := u <= sweep
				var a := dir - arc / 2.0 + arc * u
				var j := 0
				for d in [0.45, 0.7, 0.95]:
					var g: MeshInstance3D = dots[i * 3 + j]
					g.visible = show
					g.position = fx.at + Vector3(cos(a) * r * d, 0.3, sin(a) * r * d)
					_set_colour(g, Color(c.r, c.g, c.b, 0.75 * (1.0 - k)))
					j += 1
		var f := _add(0.45, step, at)
		f.nodes = dots
		shake = maxf(shake, 0.35)
		return
	if move == "rain" or move == "freeze":
		var shards: Array = []
		var offs: Array = []
		for i in range(6 if move == "freeze" else 4):
			shards.append(_glow(Color(0.85, 0.97, 1.0), 0.3))
			offs.append([(_rng.randf() - 0.5) * r, (_rng.randf() - 0.5) * r, _rng.randf() * 0.15])
		var ring := _ring(Color(0.7, 0.95, 1.0), 1.0, 0.1)
		var glow := _glow(Color(0.6, 0.9, 1.0), r * 1.6)
		var step := func(fx: Fx, k: float) -> void:
			for i in range(shards.size()):
				var u := clampf((k - offs[i][2]) / 0.25, 0.0, 1.0)
				var s: MeshInstance3D = shards[i]
				s.visible = u < 1.0
				s.position = fx.at + Vector3(offs[i][0], 3.0 * (1.0 - u) + 0.2, offs[i][1])
				s.scale = Vector3(0.3, 1.2, 1.0)
			var e := _ease_out(clampf((k - 0.25) / 0.75, 0.0, 1.0))
			ring.visible = k > 0.25
			glow.visible = k > 0.25
			ring.position = Vector3(fx.at.x, FLOOR_Y, fx.at.z)
			var rr := maxf(0.05, r * (0.4 + e * 0.8))
			ring.scale = Vector3(rr, 1.0, rr)
			_set_colour(ring, Color(0.7, 0.95, 1.0, 1.0 - e))
			glow.position = fx.at + Vector3(0, 0.3, 0)
			_set_colour(glow, Color(0.6, 0.9, 1.0, 0.5 * (1.0 - e)))
		var f := _add(0.6, step, at)
		f.nodes = shards + [ring, glow]
		_shatter(at + Vector3(0, 0.4, 0), Color(0.6, 0.92, 1.0))
		return
	if move == "pools":
		_explode(at + Vector3(0, 0.3, 0), Color(1.0, 0.45, 0.1), r * 0.8)
		dust(at, 4)
		return
	if move == "line":
		_land_line(at, zone, c)
		return
	if move == "pull":
		_land_pull(at, r, by, c)
		return
	if move == "mend":
		_burst_ring(by, at, c, 1.9, 0.7)
		_heal_rune(by, at, 1.6, 1.0)
		return
	if move == "summon":
		_poof_ring(by, at, c)
		return
	# slam, nova, charge: a shockwave out to the edge of the mark
	var big := move == "nova"
	var disc := _flat(disc_points(), Color(c.r, c.g, c.b, 0.25))
	var ring1 := _ring(c, 1.0, 0.18)
	var ring2 := _ring(Color(1, 1, 1), 1.0, 0.09)
	var glow := _glow(c, 1.0)
	var step := func(fx: Fx, k: float) -> void:
		var e := _ease_out(k)
		for n in [disc, ring1, ring2]:
			n.position = Vector3(fx.at.x, FLOOR_Y, fx.at.z)
		var rr := maxf(0.05, r * e)
		disc.scale = Vector3(rr, 1.0, rr)
		ring1.scale = Vector3(rr, 1.0, rr)
		ring2.scale = Vector3(rr * 0.7, 1.0, rr * 0.7)
		_set_colour(disc, Color(c.r, c.g, c.b, 0.25 * (1.0 - k)))
		_set_colour(ring1, Color(c.r, c.g, c.b, 1.0 - k))
		_set_colour(ring2, Color(1, 1, 1, 0.8 * (1.0 - k)))
		glow.position = fx.at + Vector3(0, 0.4, 0)
		_set_size(glow, maxf(0.05, r * (0.6 + e)))
		_set_colour(glow, Color(c.r, c.g, c.b, 0.5 * (1.0 - k)))
	var f := _add(0.8 if big else 0.55, step, at)
	f.nodes = [disc, ring1, ring2, glow]
	for i in range(8):
		var a := TAU * i / 8.0
		dust(at + Vector3(cos(a) * r * 0.8, 0.0, sin(a) * r * 0.8), 1)
	shake = maxf(shake, 0.7 if big else 0.45)


## A line attack: steam, a tail or a tentacle sweeping down the whole strip from the boss outwards.
func _land_line(at: Vector3, zone: Dictionary, c: Color) -> void:
	var dir := float(zone.get("dir", 0.0))
	var len := float(zone.get("r", 6.0))
	var wide := float(zone.get("w", 1.6))
	var u := Vector3(cos(dir), 0.0, sin(dir))
	var strip := _flat(strip_points(wide), Color(c.r, c.g, c.b, 0.3))
	strip.position = Vector3(at.x, FLOOR_Y, at.z)
	strip.rotation.y = -dir
	var puffs: Array = []
	for i in range(13):
		puffs.append(_glow(c, wide * 1.3))
	var step := func(fx: Fx, k: float) -> void:
		var reach := _ease_out(minf(1.0, k * 2.2))
		var fade := 1.0 - clampf((k - 0.35) / 0.65, 0.0, 1.0)
		strip.scale = Vector3(maxf(0.01, len * reach), 1.0, 1.0)
		_set_colour(strip, Color(c.r, c.g, c.b, 0.3 * fade))
		for i in range(13):
			var uu := i / 12.0
			var g: MeshInstance3D = puffs[i]
			g.visible = uu <= reach
			var wob := sin(uu * 12.0 + _t * 20.0) * wide * 0.15
			g.position = fx.at + u * len * uu + Vector3(-u.z * wob, 0.4, u.x * wob)
			_set_colour(g, Color(c.r, c.g, c.b, 0.6 * fade))
	var f := _add(0.5, step, at)
	f.nodes = [strip] + puffs
	for i in range(1, 6):
		dust(at + u * len * (i / 5.0), 1)
	shake = maxf(shake, 0.45)


## A pull lands: streaks rushing in to the boss from all round the circle, and a thump in the middle.
func _land_pull(at: Vector3, r: float, by: Variant, c: Color) -> void:
	var ring := _ring(c, 1.0, 0.14)
	var streaks: Array = []
	var offs: Array = []
	for i in range(14):
		streaks.append(_glow(c, 0.4))
		offs.append([TAU * i / 14.0 + _rng.randf() * 0.3, 0.6 + _rng.randf() * 0.4])
	var glow := _glow(c, 2.4)
	var step := func(fx: Fx, k: float) -> void:
		var m := feet(fx.on, fx.at)
		var e := _ease_out(k)
		ring.position = Vector3(m.x, FLOOR_Y, m.z)
		var rr := maxf(0.05, r * (1.0 - e))
		ring.scale = Vector3(rr, 1.0, rr)
		_set_colour(ring, Color(c.r, c.g, c.b, 0.9 * (1.0 - k)))
		for i in range(14):
			var d: float = r * offs[i][1] * (1.0 - e)
			var a: float = offs[i][0] + e * 1.2
			streaks[i].position = m + Vector3(cos(a) * d, 0.3, sin(a) * d)
			_set_colour(streaks[i], Color(c.r, c.g, c.b, 0.9 * (1.0 - k)))
		glow.position = m + Vector3(0, 0.5, 0)
		glow.visible = k > 0.6
		_set_colour(glow, Color(c.r, c.g, c.b, (1.0 - k) * 2.0))
	var f := _add(0.45, step, at, Vector3.INF, by)
	f.nodes = [ring, glow] + streaks
	shake = maxf(shake, 0.4)


## Helpers summoned: a ring of smoke puffs round the boss, and a flash.
func _poof_ring(by: Variant, at: Vector3, c: Color) -> void:
	var m := feet(by, at)
	for i in range(8):
		var a := TAU * i / 8.0
		dust(m + Vector3(cos(a) * 1.6, 0.0, sin(a) * 1.1), 2)
	poof(m)
	_burst_ring(by, at, c, 2.1, 0.6)


## A boss rushing at someone: a trail of dust and a crash.
func _boss_charge(from: Vector3, to: Vector3) -> void:
	for i in range(7):
		dust(from.lerp(to, i / 6.0), 2)
	var streak := _glow(Color(1, 1, 1), 0.6)
	var step := func(fx: Fx, k: float) -> void:
		streak.position = from.lerp(to, 0.5) + Vector3(0, 0.6, 0)
		streak.scale = Vector3(maxf(0.1, from.distance_to(to) * 1.5), 0.6 * (1.0 - k) + 0.05, 1.0)
		_set_colour(streak, Color(1, 1, 1, 0.35 * (1.0 - k)))
	var f := _add(0.5, step, from, to)
	f.nodes = [streak]
	shake = maxf(shake, 0.5)


# ---------------------------------------------------------------------------
# Puffs, sparkles and the plates


## A monster poofs (nothing frightening: a soft white cloud that grows and thins), or helpers arrive.
func poof(at: Vector3) -> void:
	Sfx.play("poof")
	var puffs: Array = []
	var offs: Array = []
	for i in range(6):
		puffs.append(_glow(Color(1.0, 1.0, 1.0), 0.8))
		var a := TAU * i / 6.0
		offs.append(Vector3(cos(a) * 0.35, 0.3 + _rng.randf() * 0.3, sin(a) * 0.35))
	var step := func(fx: Fx, k: float) -> void:
		var e := _ease_out(k)
		for i in range(6):
			puffs[i].position = fx.at + offs[i] * (1.0 + e * 1.2) + Vector3(0.0, e * 0.6, 0.0)
			_set_size(puffs[i], 0.8 + e * 0.9)
			_set_colour(puffs[i], Color(1, 1, 1, 0.8 * (1.0 - k)))
	var f := _add(0.5, step, at)
	f.nodes = puffs
	dust(at, 5)


## A few puffs of dust at someone's feet (running, landing, a poof).
func dust(at: Vector3, n := 2) -> void:
	var puffs: Array = []
	var vel: Array = []
	for i in range(n):
		puffs.append(_glow(Color(0.75, 0.7, 0.62), 0.3))
		vel.append(Vector3((_rng.randf() - 0.5) * 0.8, 0.0, (_rng.randf() - 0.5) * 0.8))
	var step := func(fx: Fx, k: float) -> void:
		for i in range(n):
			puffs[i].position = fx.at + vel[i] * (1.0 + k) + Vector3(0.0, 0.1 + 0.25 * _ease_out(k), 0.0)
			_set_size(puffs[i], 0.5 + 0.7 * k)
			_set_colour(puffs[i], Color(0.75, 0.7, 0.62, 0.5 * (1.0 - k)))
	var f := _add(0.4 + _rng.randf() * 0.15, step, at)
	f.nodes = puffs


## Golden sparkles rising (a rest stone, a plate, getting up).
func sparkle(at: Vector3) -> void:
	var motes: Array = []
	var offs: Array = []
	for i in range(8):
		motes.append(_glow(Color(1.0, 0.92, 0.5), 0.22))
		offs.append([(_rng.randf() - 0.5) * 0.8, (_rng.randf() - 0.5) * 0.8, _rng.randf() * 0.4])
	var step := func(fx: Fx, k: float) -> void:
		for i in range(8):
			var u := clampf((k - offs[i][2]) / 0.6, 0.0, 1.0)
			motes[i].visible = u > 0.0 and u < 1.0
			motes[i].position = fx.at + Vector3(offs[i][0], 0.2 + u * 1.4, offs[i][1])
			_set_colour(motes[i], Color(1.0, 0.92, 0.5, 1.0 - u))
	var f := _add(1.0, step, at)
	f.nodes = motes


## The farm's small effects (the server's `fx` kinds): water drops, wood and stone chips, hearts, coins.
func _farm_fx(kind: String, at: Vector3) -> void:
	match kind:
		"water", "splash":
			Sfx.play("water")
			_droplets(at, Color(0.5, 0.78, 1.0), 10 if kind == "water" else 14, 2.2 if kind == "water" else 3.2)
		"chop":
			Sfx.play("chop")
			_droplets(at, Color(0.66, 0.5, 0.3), 8, 2.6)
		"hit":
			Sfx.play("chop")
			_droplets(at, Color(1.0, 0.95, 0.8), 5, 2.0)
		"heart":
			Sfx.play("heart")
			_hearts(at)
		"coin":
			Sfx.play("coin")
			sparkle(at)


## Little drops thrown up from a tile that fall back in an arc (a splash, chips from a tree).
func _droplets(at: Vector3, colour: Color, n: int, up: float) -> void:
	var motes: Array = []
	var vel: Array = []
	for i in range(n):
		var drop := _glow(colour, 0.22)
		# (drops are lit by the sky, not added to it: an added light blue is white on the grass)
		(drop.material_override as StandardMaterial3D).blend_mode = BaseMaterial3D.BLEND_MODE_MIX
		motes.append(drop)
		var a := _rng.randf() * TAU
		var sp := 0.5 + _rng.randf() * 0.9
		vel.append(Vector3(cos(a) * sp, up * (0.7 + _rng.randf() * 0.5), sin(a) * sp))
	var step := func(fx: Fx, k: float) -> void:
		var t := k * 0.7
		for i in range(n):
			motes[i].position = fx.at + Vector3(0.0, 0.15, 0.0) + Vector3(vel[i].x * t, vel[i].y * t - 4.9 * t * t, vel[i].z * t)
			_set_colour(motes[i], Color(colour.r, colour.g, colour.b, clampf(1.6 * (1.0 - k), 0.0, 1.0)))
	var f := _add(0.7, step, at)
	f.nodes = motes


## Hearts rise from a petted animal.
func _hearts(at: Vector3) -> void:
	var hs: Array = []
	for i in range(3):
		hs.append(_label("❤", Color(1.0, 0.35, 0.45), 64))
	var step := func(fx: Fx, k: float) -> void:
		for i in range(3):
			var u := clampf((k - i * 0.12) / 0.7, 0.0, 1.0)
			hs[i].visible = u > 0.0 and u < 1.0
			hs[i].position = fx.at + Vector3((i - 1) * 0.28, 0.9 + u * 0.9, 0.0)
			hs[i].modulate = Color(1.0, 0.35, 0.45, 1.0 - u * u)
	var f := _add(1.1, step, at)
	f.nodes = hs


## A rune plate lights up under someone's feet: a chime and a fountain of sparkles.
func _plate_lit(tx: int, ty: int) -> void:
	var at := Vector3(tx + 0.5, 0.0, ty + 0.5)
	Sfx.play("plate")
	sparkle(at)
	var ring := _ring(Color(1.0, 0.9, 0.5), 1.0, 0.08)
	ring.position = Vector3(at.x, FLOOR_Y, at.z)
	var step := func(fx: Fx, k: float) -> void:
		var r := maxf(0.05, 0.4 + 0.6 * _ease_out(k))
		ring.scale = Vector3(r, 1.0, r)
		ring.rotation.y = _t * 2.0
		_set_colour(ring, Color(1.0, 0.9, 0.5, 1.0 - k))
	var f := _add(0.9, step, at)
	f.nodes = [ring]


# ---------------------------------------------------------------------------
# Floating numbers


## Numbers for a target that something in flight is about to hit wait until it lands.
func _hold_numbers(on: Variant, sec: float) -> void:
	if on != null:
		_delay[str(on)] = _t + sec


func _hit(c: Dictionary) -> void:
	var on: Variant = _id_of(c.get("on"))
	var a: Variant = find.call(on)
	if not (a is Actor):
		return
	var monster := on is int
	var kind := str(c.get("kind", "dmg"))
	var n := int(c.get("n", 0))
	var text := ""
	var colour: Color = HIT_COLOURS.get(kind, Color.WHITE)
	match kind:
		"dmg":
			text = "-%d" % n
		"crit":
			text = ("%d!" % n) if monster else ("+%d!" % n)
			if not monster:
				colour = HIT_COLOURS["heal"]
		"heal":
			text = "+%d" % n
		"block":
			text = "%s -%d" % [Strings.t("sagaHitBlock"), n]
		"stun":
			text = "⭐ " + Strings.t("sagaHitStun")
		"kick":
			text = "🛡️ " + Strings.t("sagaHitKick")
		"miss":
			text = Strings.t("sagaHitMiss")
	if on is String and on == me_id and (kind == "dmg" or kind == "block"):
		colour = HIT_COLOURS["me"]
	if (kind == "heal" or (kind == "crit" and not monster)) and n <= 0:
		return
	var at := _t
	var held: float = _delay.get(str(on), -1.0)
	if held > _t:
		at = held
	var same := 0
	for fl in _floaters:
		if str(fl["on"]) == str(on) and absf(fl["born"] - at) < 0.4:
			same += 1
	same = same % 3
	var side := 0.4 if kind == "heal" or (kind == "crit" and not monster) else 0.0
	var life := 1.5 if kind == "kick" else (1.25 if kind == "crit" else 1.1)
	var l := _label(text, colour, 64 if kind == "crit" else 52)
	l.visible = false
	_floaters.append({"label": l, "on": on, "born": at, "life": life, "dx": side + [0.0, 0.35, -0.35][same] + (_rng.randf() - 0.5) * 0.1, "dy": -0.2 * same, "at": at})
	# sounds for what matters to me
	var now := Time.get_ticks_msec()
	if on is String and on == me_id and kind == "dmg" and now - _last_hurt > 180:
		_last_hurt = now
		Sfx.play("hurt")
		(a as Actor).flash(Color(1.0, 0.5, 0.45), 0.15)
	elif monster and kind == "crit" and now - _last_crit > 150:
		_last_crit = now
		Sfx.play("crit")
	elif kind == "stun":
		Sfx.play("stun")
	elif kind == "kick":
		Sfx.play("kick")
		if on is int:
			_stopped(on)
	if monster and (kind == "dmg" or kind == "crit"):
		(a as Actor).flash(Color(1.0, 1.0, 1.0), 0.1)
	elif kind == "heal" and not monster:
		(a as Actor).flash(Color(0.6, 1.0, 0.65), 0.15)


## Experience for a monster beaten: a small golden "+4 xp" rising from me.
func _xp(n: int) -> void:
	if n <= 0:
		return
	var a: Variant = find.call(me_id)
	if not (a is Actor):
		return
	var l := _label(Strings.t("sagaXpFloat", {"n": n}), HIT_COLOURS["xp"], 40)
	l.visible = false
	var same := 0
	for fl in _floaters:
		if str(fl["on"]) == me_id and fl.get("xp", false) and _t - fl["born"] < 0.6:
			same += 1
	_floaters.append({"label": l, "on": me_id, "born": _t, "life": 1.3, "dx": 0.7, "dy": -0.3 - 0.25 * (same % 3), "at": _t, "xp": true})


# ---------------------------------------------------------------------------
# Every frame


func tick(delta: float) -> void:
	if area == "":
		return
	_t += delta
	shake = maxf(0.0, shake - delta)
	var keep: Array = []
	for f in _list:
		var fx: Fx = f
		fx.t += delta
		if fx.t < 0.0:
			keep.append(fx)
			continue
		var k := clampf(fx.t / fx.dur, 0.0, 1.0)
		fx.step.call(fx, k)
		if fx.t >= fx.dur:
			_free_fx(fx)
		else:
			keep.append(fx)
	_list = keep
	for id in _windups.keys():
		var w: Fx = _windups[id]
		if w.t >= w.dur:
			_windups.erase(id)
	_tick_floaters()
	_tick_zones()
	_tick_target_ring()
	_tick_auras()


func _tick_floaters() -> void:
	var keep: Array = []
	for fl in _floaters:
		var l: Label3D = fl["label"]
		if fl["at"] > _t:
			keep.append(fl)
			continue
		var age: float = _t - fl["born"]
		if age > fl["life"] + 0.05:
			l.queue_free()
			continue
		l.visible = true
		var k := clampf(age / fl["life"], 0.0, 1.0)
		var a: Variant = find.call(fl["on"])
		var top: Vector3 = (a as Actor).head_position() if a is Actor else Vector3.ZERO
		if a is Actor:
			fl["last"] = top
		elif fl.has("last"):
			top = fl["last"]
		l.position = top + Vector3(fl["dx"] * (0.6 + 0.4 * k), 0.3 + fl["dy"] + 1.0 * _ease_out(k), 0.0)
		l.modulate.a = 1.0 if k < 0.7 else 1.0 - (k - 0.7) / 0.3
		keep.append(fl)
	_floaters = keep


# ---------------------------------------------------------------------------
# Telegraphs: the zones the server sends, drawn on the floor until they land


## 0 → 1 as an attack marked on the ground gets ready to land.
func _fill(z: Dictionary, now: float) -> float:
	var at := float(z.get("at", now))
	var born: float = _born.get(str(z.get("id", "")), at - 1200.0)
	return clampf((now - born) / maxf(1.0, at - born), 0.0, 1.0)


func _move_of(z: Dictionary) -> String:
	var m: String = str(_zone_move.get(str(z.get("id", "")), ""))
	if m != "":
		return m
	# a mend's mark is a small harmless circle on the boss itself
	if float(z.get("dmg", 1)) == 0.0 and float(z.get("r", 2)) <= 1.0:
		return "mend"
	return ""


func _tick_zones() -> void:
	var now := model.server_now()
	var seen: Dictionary = {}
	for z in model.zones():
		var zid := str(z.get("id", ""))
		seen[zid] = true
		var move := _move_of(z)
		if move == "mend":
			continue
		var zn: ZoneNode = _zones.get(zid)
		if zn == null or zn.move != move or zn.pattern != Palette.pattern():
			if zn != null:
				zn.root.queue_free()
			zn = _make_zone(z, move)
			_zones[zid] = zn
		_update_zone(zn, z, now)
	for zid in _zones.keys():
		if not seen.has(zid):
			_zones[zid].root.queue_free()
			_zones.erase(zid)


## The flat shapes of a zone: the dim base, the fill that grows, the bright edge. Unit-sized; scaled per frame.
func _make_zone(z: Dictionary, move: String) -> ZoneNode:
	var zn := ZoneNode.new()
	zn.id = str(z.get("id", ""))
	zn.move = move
	zn.shape = str(z.get("shape", "circle"))
	zn.root = Node3D.new()
	add_child(zn.root)
	var c := Palette.colour("danger_fill")
	var pulling := move == "pull"
	if pulling:
		var pc := move_colour("pull", int(z.get("by", -1)))
		c = Color(pc.r * 0.5, pc.g * 0.5, pc.b * 0.7)
	var wide := float(z.get("w", 1.6))
	var arc := deg_to_rad(float(z.get("arc", 90)))
	var pat := Palette.pattern()
	zn.pattern = pat
	var edge_w := 0.12 if pat else 0.08 # (a thicker edge is the second cue besides the stripes)
	var edge_c := Palette.colour("danger_edge")
	edge_c.a = 0.8
	var hatch_points := PackedVector2Array()
	match zn.shape:
		"cone":
			zn.base = _flat(sector_points(arc), Color(c.r, c.g, c.b, 0.25), zn.root)
			zn.fill = _flat(sector_points(arc), Color(c.r, c.g, c.b, 0.35), zn.root)
			var outline := PackedVector2Array([Vector2.ZERO])
			for i in range(15):
				var a := -arc / 2.0 + arc * i / 14.0
				outline.append(Vector2(cos(a), sin(a)))
			zn.edge = _flat(band_points(outline, edge_w, true), edge_c, zn.root)
			hatch_points = sector_points(arc)
		"line":
			zn.base = _flat(strip_points(wide), Color(c.r, c.g, c.b, 0.25), zn.root)
			zn.fill = _flat(strip_points(wide), Color(c.r, c.g, c.b, 0.35), zn.root)
			zn.edge = null
			if pat:
				var h := wide / 2.0
				zn.edge = _flat(band_points(PackedVector2Array([Vector2(0, -h), Vector2(1, -h), Vector2(1, h), Vector2(0, h)]), edge_w * 0.5, true), edge_c, zn.root)
			hatch_points = strip_points(wide)
		_:
			zn.base = _flat(disc_points(), Color(c.r, c.g, c.b, 0.25), zn.root)
			zn.fill = _flat(disc_points(), Color(c.r, c.g, c.b, 0.35), zn.root)
			zn.edge = _flat(band_points(ring_line(1.0), edge_w, true), edge_c, zn.root)
			hatch_points = disc_points()
			if pulling:
				for i in range(3):
					zn.rings.append(_flat(band_points(ring_line(1.0), 0.05, true), Color(1, 1, 1, 0.5), zn.root))
	if pat and not pulling:
		zn.hatch = _flat(hatch_points, Color.WHITE, zn.root)
		var hm := ShaderMaterial.new()
		hm.shader = _hatch_shader
		zn.hatch.material_override = hm
		zn.hatch.position.y = FLOOR_Y + 0.006
	zn.fill.position.y = FLOOR_Y + 0.004
	if zn.edge != null:
		zn.edge.position.y = FLOOR_Y + 0.008
	return zn


func _update_zone(zn: ZoneNode, z: Dictionary, now: float) -> void:
	var r := float(z.get("r", 1.0))
	var at := float(z.get("at", now))
	var burning: bool = z.has("until") and now >= at
	zn.root.position = Vector3(float(z.get("x", 0)) / Data.tile(), 0.0, float(z.get("y", 0)) / Data.tile())
	zn.root.rotation.y = -float(z.get("dir", 0.0))
	var k := _fill(z, now)
	var dir_scale := func(s: float) -> Vector3:
		return Vector3(s, 1.0, 1.0) if zn.shape == "line" else Vector3(s, 1.0, s)
	zn.base.scale = dir_scale.call(maxf(0.01, r))
	if zn.edge != null:
		zn.edge.scale = dir_scale.call(maxf(0.01, r))
	if zn.hatch != null:
		zn.hatch.scale = dir_scale.call(maxf(0.01, r))
		var sc := Palette.colour("stripe")
		(zn.hatch.material_override as ShaderMaterial).set_shader_parameter("colour", Color(sc.r, sc.g, sc.b, 0.55 + 0.25 * k))
	if zn.move == "pull" and now < at:
		# a whirlpool: a dark violet disc turning, darker as it gets ready, rings sliding in towards the boss
		var pc := move_colour("pull", int(z.get("by", -1)))
		_set_colour(zn.base, Color(pc.r * 0.5, pc.g * 0.5, pc.b * 0.7, 0.16 + 0.12 * k))
		zn.fill.visible = false
		if zn.edge != null:
			_set_colour(zn.edge, Color(pc.r, pc.g, pc.b, 0.6 + 0.3 * sin(_t * 8.0)))
		for i in range(zn.rings.size()):
			var u := fmod(_t * 0.7 + i / 3.0, 1.0)
			var rr := maxf(0.02, r * (1.0 - u) * 0.95)
			zn.rings[i].scale = Vector3(rr, 1.0, rr)
			_set_colour(zn.rings[i], Color(pc.r, pc.g, pc.b, 0.5))
		return
	if burning:
		# burning ground: lava that pulses until it cools
		var left := clampf((float(z.get("until", now)) - now) / 2000.0, 0.0, 1.0)
		var pulse := 0.85 + 0.15 * sin(_t * 4.0 + float(z.get("x", 0)) * 0.1)
		var lava := Color(0.95, 0.32, 0.05) if Palette.mode() == "normal" else Palette.colour("danger_fill")
		var lava_hot := Color(1.0, 0.6, 0.15) if Palette.mode() == "normal" else Palette.colour("danger_edge")
		_set_colour(zn.base, Color(lava.r, lava.g, lava.b, 0.55 * left * pulse))
		zn.fill.visible = true
		zn.fill.scale = dir_scale.call(maxf(0.01, r * 0.7))
		_set_colour(zn.fill, Color(lava_hot.r, lava_hot.g, lava_hot.b, 0.45 * left * pulse))
		if zn.edge != null:
			var le := Color(1.0, 0.75, 0.3) if Palette.mode() == "normal" else Palette.colour("danger_edge")
			_set_colour(zn.edge, Color(le.r, le.g, le.b, 0.8 * left))
		return
	var blink := 0.5 + 0.5 * sin(_t * (6.0 + k * 18.0))
	var db := Palette.colour("danger_base")
	var df := Palette.colour("danger_fill")
	var de := Palette.colour("danger_edge")
	_set_colour(zn.base, Color(db.r, db.g, db.b, 0.22 + 0.1 * blink))
	# it fills up from the middle (from the boss for a cone or a line) until it lands
	zn.fill.visible = true
	zn.fill.scale = dir_scale.call(maxf(0.01, r * k))
	_set_colour(zn.fill, Color(df.r, df.g, df.b, 0.3 + 0.1 * k))
	if zn.edge != null:
		_set_colour(zn.edge, Color(de.r, de.g, de.b, 0.55 + 0.4 * blink))


## Is a point (px) inside a zone? inZone in sagasim.ts (the bot steps out with this).
static func in_zone(z: Dictionary, p: Vector2) -> bool:
	var tile := Data.tile()
	var zx := float(z.get("x", 0))
	var zy := float(z.get("y", 0))
	var r := float(z.get("r", 0))
	if str(z.get("shape", "")) == "line":
		var dx := (p.x - zx) / tile
		var dy := (p.y - zy) / tile
		var c := cos(float(z.get("dir", 0)))
		var s := sin(float(z.get("dir", 0)))
		var along := dx * c + dy * s
		return along >= -0.6 and along <= r and absf(-dx * s + dy * c) <= float(z.get("w", 1.6)) / 2.0
	var d := Vector2(p.x - zx, p.y - zy).length() / tile
	if d > r:
		return false
	if str(z.get("shape", "")) == "circle":
		return true
	if d < 0.6:
		return true
	var ang := atan2(p.y - zy, p.x - zx)
	var diff := absf(ang - float(z.get("dir", 0)))
	if diff > PI:
		diff = TAU - diff
	return diff <= deg_to_rad(float(z.get("arc", 90)) / 2.0)


# ---------------------------------------------------------------------------
# The target ring and the lasting looks


func _tick_target_ring() -> void:
	var a: Variant = find.call(target) if target != null else null
	if not (a is Actor):
		if _target_ring != null:
			_target_ring.visible = false
		return
	if _target_ring == null:
		var pts := PackedVector2Array()
		var segs := 8
		for i in range(segs):
			var a0 := TAU * i / segs
			var a1 := a0 + TAU / segs * 0.6
			var line := PackedVector2Array()
			for j in range(5):
				var ang := lerpf(a0, a1, j / 4.0)
				line.append(Vector2(cos(ang), sin(ang)))
			pts.append_array(band_points(line, 0.09, false))
		_target_ring = _flat(pts, Color(1.0, 0.82, 0.25, 0.95))
		_target_ring.position.y = FLOOR_Y + 0.012
	var actor: Actor = a
	_target_ring.visible = true
	var friend := target is String
	_set_colour(_target_ring, Color(0.45, 1.0, 0.5, 0.95) if friend else Color(1.0, 0.82, 0.25, 0.95))
	var r := maxf(0.55, actor.width() * 0.7)
	_target_ring.scale = Vector3(r, 1.0, r)
	_target_ring.position = Vector3(actor.global_position.x, FLOOR_Y + 0.012, actor.global_position.z)
	_target_ring.rotation.y = _t * 1.6


func _free_aura(a: Dictionary) -> void:
	for v in a.values():
		if v is Array:
			for n in v:
				if is_instance_valid(n):
					n.queue_free()
		elif is_instance_valid(v):
			v.queue_free()


## Lasting looks: a shield wall's bubble, rage's flames, the healing ring's leaves, a fallen friend's halo, and the
## blue shield over a boss winding up something that can be stopped.
func _tick_auras() -> void:
	var snap := model.my_saga()
	var f: Dictionary = snap.get("f", {})
	for id in _auras.keys():
		if not f.has(id):
			_free_aura(_auras[id])
			_auras.erase(id)
	for id in f.keys():
		var fl := int(f[id][2]) if f[id] is Array and f[id].size() >= 3 else 0
		var a: Variant = find.call(id)
		if not (a is Actor) or fl == 0:
			if _auras.has(id):
				_free_aura(_auras[id])
				_auras.erase(id)
			continue
		var actor: Actor = a
		var aura: Dictionary = _auras.get(id, {})
		_auras[id] = aura
		var m := actor.body_position()
		var make_wall := func() -> Array:
			return [_glow(Color(0.55, 0.75, 1.0), 1.6)]
		var tick_wall := func(nodes: Array) -> void:
			var pulse := 0.8 + 0.2 * sin(_t * 4.0)
			nodes[0].position = m
			_set_colour(nodes[0], Color(0.55, 0.75, 1.0, 0.28 * pulse))
		_aura_part(aura, "wall", fl & Data.flag("wall"), make_wall, tick_wall)
		var make_rage := func() -> Array:
			var out: Array = []
			for i in range(5):
				out.append(_glow(Color(1.0, 0.45, 0.08), 0.35))
			return out
		var tick_rage := func(nodes: Array) -> void:
			for i in range(5):
				var u := fmod(_t * 1.8 + i * 0.2, 1.0)
				nodes[i].position = actor.global_position + Vector3(sin(i * 2.1 + _t * 3.0) * 0.35, 0.1 + u * 1.4, 0.0)
				_set_size(nodes[i], 0.45 * (1.0 - u) + 0.1)
				_set_colour(nodes[i], Color(1.0, 0.35 + 0.3 * u, 0.08, 0.75 * (1.0 - u)))
		_aura_part(aura, "rage", fl & Data.flag("rage"), make_rage, tick_rage)
		var make_hot := func() -> Array:
			var out: Array = []
			for i in range(3):
				out.append(_glow(Color(0.5, 1.0, 0.55), 0.22))
			return out
		var tick_hot := func(nodes: Array) -> void:
			for i in range(3):
				var u := fmod(_t * 0.7 + i / 3.0, 1.0)
				var ang := i * 2.1 + _t
				nodes[i].position = actor.global_position + Vector3(cos(ang) * 0.5, 0.3 + u * 1.1, sin(ang) * 0.5)
				_set_colour(nodes[i], Color(0.5, 1.0, 0.55, 1.0 - u))
		_aura_part(aura, "hot", fl & Data.flag("hot"), make_hot, tick_hot)
		var make_slow := func() -> Array:
			return [_glow(Color(0.5, 0.75, 1.0), 1.2)]
		var tick_slow := func(nodes: Array) -> void:
			nodes[0].position = actor.global_position + Vector3(0, 0.1, 0)
			nodes[0].scale = Vector3(1.2, 0.5, 1.0)
			_set_colour(nodes[0], Color(0.5, 0.75, 1.0, 0.35))
		_aura_part(aura, "slow", fl & Data.flag("slow"), make_slow, tick_slow)
		var make_down := func() -> Array:
			var out: Array = []
			for i in range(8):
				out.append(_glow(Color(1.0, 0.95, 0.7), 0.16))
			out.append(_glow(Color(0.85, 0.85, 1.0), 2.2))
			return out
		var tick_down := func(nodes: Array) -> void:
			var bob := sin(_t * 2.0) * 0.08
			for i in range(8):
				var ang := TAU * i / 8.0 + _t
				nodes[i].position = actor.global_position + Vector3(cos(ang) * 0.4, 0.45 + bob + sin(ang) * 0.1, sin(ang) * 0.4)
			nodes[8].position = actor.global_position + Vector3(0, 0.3, 0)
			_set_colour(nodes[8], Color(0.85, 0.85, 1.0, 0.3))
		_aura_part(aura, "down", fl & Data.flag("down"), make_down, tick_down)
	# the boss winding up something that can be stopped: a blue shield over its head
	var b: Variant = snap.get("b")
	var kick: bool = b is Dictionary and b.get("cast") is Dictionary and bool(b["cast"].get("kick", false))
	var boss_actor: Variant = find.call(int(b.get("id", -1))) if kick else null
	if boss_actor is Actor:
		if _kick_shield == null:
			_kick_shield = Sprite3D.new()
			_kick_shield.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			_kick_shield.pixel_size = 0.022
			_kick_shield.no_depth_test = true
			_kick_shield.shaded = false
			_kick_shield.texture = Data.icon("ui_shield")
			add_child(_kick_shield)
		_kick_shield.visible = true
		_kick_shield.position = (boss_actor as Actor).head_position() + Vector3(0.0, 0.9, 0.0)
		var pulse := 0.6 + 0.4 * sin(_t * 10.0)
		_kick_shield.modulate = Color(0.75, 0.95, 1.0, 0.6 + 0.4 * pulse)
		_kick_shield.scale = Vector3.ONE * (0.9 + 0.2 * pulse)
	elif _kick_shield != null:
		_kick_shield.visible = false


func _aura_part(aura: Dictionary, key: String, on: int, make: Callable, update: Callable) -> void:
	if on == 0:
		if aura.has(key):
			for n in aura[key]:
				n.queue_free()
			aura.erase(key)
		return
	if not aura.has(key):
		aura[key] = make.call()
	update.call(aura[key])


static func _ease_out(k: float) -> float:
	return 1.0 - pow(1.0 - k, 3.0)
