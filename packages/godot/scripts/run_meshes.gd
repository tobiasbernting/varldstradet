class_name RunMeshes
extends RefCounted
## M5c's meshes for the farm, generated in code in the ART.md palette with the farm's mesh builder (farm_mesh.gd):
## the färdport (the run arch, 3 × 2), the Yggdrasil shoot in its five stages (0 the shoot, 1 a sapling, 2 a young
## tree, 3 a big tree with leaves, 4 the glowing Världsträd) and the three buildings that came with the runs: the
## smithy's extras (the building itself is KayKit's blacksmith), the herb garden (2 × 2) and the longhouse (4 × 3).
## FarmAssets asks for them by name (`mesh()`); nothing here is kept alive after the FarmAssets that made it.
##
## The colours are written out here (they are the farm's: FarmAssets.WOOD and the rest) so the two files do not need
## each other to load.

const WOOD := Color("#86582f")
const WOOD_LIGHT := Color("#a8793f")
const IRON := Color("#5e626c")
const GOLD := Color("#e8b830")
const BONE := Color("#e2d6b8")
const EMBER := Color("#ffa040")
const RUNE := Color("#38d8f0")
const STONE := Color("#7c7d78")
const STONE_DARK := Color("#5f625f")
const MOSS := Color("#4f8231")
const GRASS := Color("#64a848")
const SOIL := Color("#5a3d27")
const THATCH := Color("#c9a24d")
const TURF := Color("#5f8a3c")
const ROOF_RED := Color("#a83a2c")


## A quad seen from both sides (a ring or a fan whose winding is easier to get right once than for every face).
static func _dq(b: FarmMesh, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, col: Color, fol := 0.0) -> void:
	b.quad(p0, p1, p2, p3, col, fol)
	b.quad(p3, p2, p1, p0, col, fol)


## A curved arch ring in the x/y plane: from angle a0 to a1 (radians, 0 is +x, PI is -x), between two radii (the y radius
## is squashed by `squash`), `depth` thick along z, in `segs` blocks.
static func _ring(b: FarmMesh, cx: float, cy: float, r_in: float, r_out: float, squash: float, depth: float, a0: float, a1: float, segs: int, col: Color, col_top: Color) -> void:
	var hz := depth * 0.5
	for i in range(segs):
		var t0 := lerpf(a0, a1, float(i) / segs)
		var t1 := lerpf(a0, a1, float(i + 1) / segs)
		var in0 := Vector2(cx + cos(t0) * r_in, cy + sin(t0) * r_in * squash)
		var in1 := Vector2(cx + cos(t1) * r_in, cy + sin(t1) * r_in * squash)
		var out0 := Vector2(cx + cos(t0) * r_out, cy + sin(t0) * r_out * squash)
		var out1 := Vector2(cx + cos(t1) * r_out, cy + sin(t1) * r_out * squash)
		var shade := col if i % 2 == 0 else col.darkened(0.06)
		# front, back, the outer curve (the top) and the inner curve (the underside)
		_dq(b, Vector3(in0.x, in0.y, hz), Vector3(out0.x, out0.y, hz), Vector3(out1.x, out1.y, hz), Vector3(in1.x, in1.y, hz), shade)
		_dq(b, Vector3(in0.x, in0.y, -hz), Vector3(out0.x, out0.y, -hz), Vector3(out1.x, out1.y, -hz), Vector3(in1.x, in1.y, -hz), shade.darkened(0.1))
		_dq(b, Vector3(out0.x, out0.y, hz), Vector3(out0.x, out0.y, -hz), Vector3(out1.x, out1.y, -hz), Vector3(out1.x, out1.y, hz), col_top)
		_dq(b, Vector3(in0.x, in0.y, hz), Vector3(in0.x, in0.y, -hz), Vector3(in1.x, in1.y, -hz), Vector3(in1.x, in1.y, hz), shade.darkened(0.25))


# ---------------------------------------------------------------------------
# The färdport


## The run arch: two carved pillars with rune bands, a curved lintel with a gold keystone and a leaf of the Världsträd on it,
## roots at the feet, steps in front and a dark doorway; the glow in it and its light are the farm view's.
static func fardport() -> ArrayMesh:
	var b := FarmMesh.new()
	var s := Color("#77705f")
	var cap_y := 2.0
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.12
		b.box(Vector3(x, 1.0, 0.0), Vector3(0.78, 2.0, 0.9), s, 0.0, 0.0, s.lightened(0.1))
		b.box(Vector3(x, 0.12, 0.0), Vector3(0.94, 0.24, 1.06), s.darkened(0.12), 0.0, 0.0, s)
		# the carved runes down the front of the pillar
		for i in range(4):
			b.box(Vector3(x, 0.55 + 0.34 * i, 0.46), Vector3(0.1 if i % 2 == 0 else 0.3, 0.07, 0.03), RUNE, 0.0)
		b.box(Vector3(x, 1.2, 0.47), Vector3(0.04, 1.0, 0.025), RUNE, 0.0)
		# moss on the shoulder and roots creeping over the foot
		b.box(Vector3(x - sx * 0.08, 2.05, 0.0), Vector3(0.6, 0.1, 0.8), MOSS, 0.0)
		for k in range(3):
			var a := (-0.5 + k * 0.5) + (0.0 if sx < 0.0 else PI)
			b.blade(Vector3(x + cos(a) * 0.36, 0.05, 0.4 + sin(a) * 0.18), Vector3(x + cos(a) * 0.62, 0.02, 0.62 + sin(a) * 0.3), 0.16, WOOD.darkened(0.2), WOOD, 0.0, a)
	# the lintel: a curved ring of stone blocks over the doorway
	_ring(b, 0.0, cap_y, 0.73, 1.52, 0.5, 0.84, 0.0, PI, 10, s, s.lightened(0.14))
	# the keystone and the leaf on it
	b.box(Vector3(0.0, cap_y + 0.5 * 1.1 + 0.02, 0.0), Vector3(0.34, 0.3, 0.92), GOLD.darkened(0.15), 0.0, 0.0, GOLD)
	b.blob(Vector3(0.0, cap_y + 0.5 * 1.1 + 0.3, 0.3), Vector3(0.2, 0.2, 0.08), 6, 3, Color("#2f8a52"), Color("#9ff0a0"), 0.0, 0.0)
	b.blade(Vector3(0.0, cap_y + 0.5 * 1.1 + 0.18, 0.4), Vector3(-0.2, cap_y + 0.5 * 1.1 + 0.46, 0.4), 0.12, Color("#2f8a52"), Color("#9ff0a0"), 0.0, 0.0)
	b.blade(Vector3(0.0, cap_y + 0.5 * 1.1 + 0.18, 0.4), Vector3(0.2, cap_y + 0.5 * 1.1 + 0.46, 0.4), 0.12, Color("#2f8a52"), Color("#9ff0a0"), 0.0, 0.0)
	# a rune band along the front of the ring
	for i in range(9):
		var t := PI * (float(i) + 0.5) / 9.0
		var rr := 1.14
		b.box(Vector3(cos(t) * rr, cap_y + sin(t) * rr * 0.5, 0.44), Vector3(0.1, 0.05, 0.03), RUNE, 0.0)
	# the doorway: dark, with a fan above
	var dark := Color("#0b1c22")
	_dq(b, Vector3(-0.75, 0.0, -0.1), Vector3(0.75, 0.0, -0.1), Vector3(0.75, cap_y, -0.1), Vector3(-0.75, cap_y, -0.1), dark)
	for i in range(10):
		var t0 := PI * float(i) / 10.0
		var t1 := PI * float(i + 1) / 10.0
		var p0 := Vector3(cos(t0) * 0.75, cap_y + sin(t0) * 0.75 * 0.5, -0.1)
		var p1 := Vector3(cos(t1) * 0.75, cap_y + sin(t1) * 0.75 * 0.5, -0.1)
		_dq(b, Vector3(0.0, cap_y, -0.1), p0, p1, p1, dark)
	# steps up to the doorway
	b.box(Vector3(0.0, 0.07, 0.62), Vector3(2.5, 0.14, 0.4), s.darkened(0.12), 0.0, 0.0, s)
	b.box(Vector3(0.0, 0.17, 0.4), Vector3(2.0, 0.1, 0.34), s.darkened(0.06), 0.0, 0.0, s.lightened(0.05))
	return b.build()


# ---------------------------------------------------------------------------
# The Yggdrasil shoot


static func _stones(b: FarmMesh, r: float, n: int) -> void:
	for i in range(n):
		var a := TAU * float(i) / n + 0.3
		b.blob(Vector3(cos(a) * r, 0.1, sin(a) * r), Vector3(0.13, 0.11, 0.12), 5, 3, STONE_DARK, STONE.lightened(0.1), 0.0, 0.1, float(i))


static func _roots(b: FarmMesh, r: float, n: int, long: float, col: Color) -> void:
	for i in range(n):
		var a := TAU * (float(i) + 0.35) / n
		b.blade(Vector3(cos(a) * r * 0.5, 0.35, sin(a) * r * 0.5), Vector3(cos(a) * (r + long), 0.0, sin(a) * (r + long)), r * 0.7, col.darkened(0.15), col, 0.0, a + PI * 0.5)


## The shoot in stage 0..4. 0: a mound with two leaves; 1: a sapling; 2: a young tree; 3: a big tree with leaves;
## 4: the Världsträd, its leaves teal and gold and its roots lit.
static func yggdrasil(stage: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var leaf_lo := Color("#2f6a2c")
	var leaf_hi := Color("#88c456")
	match stage:
		0:
			b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.46, 0.14, 0.46), 7, 3, SOIL.darkened(0.1), SOIL.lightened(0.1), 0.0, 0.05, 3.0)
			_stones(b, 0.52, 6)
			b.cylinder(Vector3(0.0, 0.08, 0.0), 0.035, 0.02, 0.5, 5, Color("#4c8a3a"), Color("#7bc050"), 1.0)
			b.blade(Vector3(0.0, 0.42, 0.0), Vector3(0.3, 0.66, 0.0), 0.2, leaf_lo, leaf_hi, 1.0, 0.0)
			b.blade(Vector3(0.0, 0.46, 0.0), Vector3(-0.28, 0.72, 0.05), 0.2, leaf_lo, leaf_hi, 1.0, 0.0)
			b.blob(Vector3(0.0, 0.62, 0.0), Vector3.ONE * 0.05, 5, 2, RUNE, Color("#d8ffff"), 0.0, 0.0)
		1:
			b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.5, 0.14, 0.5), 7, 3, SOIL.darkened(0.1), SOIL.lightened(0.1), 0.0, 0.05, 4.0)
			_stones(b, 0.56, 7)
			b.cylinder(Vector3(0.0, 0.08, 0.0), 0.06, 0.03, 1.05, 5, WOOD.darkened(0.1), WOOD, 0.0)
			for i in range(6):
				var a := TAU * float(i) / 6.0
				var y := 0.55 + 0.1 * i
				b.blob(Vector3(cos(a) * 0.22, y, sin(a) * 0.22), Vector3(0.2, 0.14, 0.2), 6, 3, leaf_lo, leaf_hi, 1.0, 0.12, float(i))
			b.blob(Vector3(0.0, 1.2, 0.0), Vector3(0.24, 0.18, 0.24), 6, 3, leaf_lo, leaf_hi, 1.0, 0.1, 9.0)
		2:
			b.cylinder(Vector3.ZERO, 0.17, 0.09, 1.7, 6, WOOD.darkened(0.15), WOOD, 0.0)
			_roots(b, 0.17, 4, 0.2, WOOD)
			b.blob(Vector3(0.0, 2.0, 0.0), Vector3(0.78, 0.6, 0.78), 7, 4, leaf_lo, leaf_hi, 1.0, 0.1, 5.0)
			b.blob(Vector3(0.45, 1.75, 0.15), Vector3(0.48, 0.38, 0.48), 6, 3, leaf_lo, leaf_hi, 1.0, 0.1, 6.0)
			b.blob(Vector3(-0.4, 2.3, -0.1), Vector3(0.5, 0.4, 0.5), 6, 3, leaf_lo, leaf_hi, 1.0, 0.1, 7.0)
			_stones(b, 0.75, 6)
		3:
			b.cylinder(Vector3.ZERO, 0.34, 0.16, 2.7, 7, WOOD.darkened(0.2), WOOD, 0.0)
			_roots(b, 0.34, 6, 0.55, WOOD)
			var low := Color("#2a622b")
			var high := Color("#92cc5a")
			b.blob(Vector3(0.0, 3.2, 0.0), Vector3(1.35, 0.95, 1.35), 8, 4, low, high, 1.0, 0.1, 11.0)
			b.blob(Vector3(0.95, 2.7, 0.2), Vector3(0.85, 0.65, 0.85), 7, 3, low, high, 1.0, 0.1, 12.0)
			b.blob(Vector3(-0.9, 2.85, -0.2), Vector3(0.9, 0.7, 0.9), 7, 3, low, high, 1.0, 0.1, 13.0)
			b.blob(Vector3(0.1, 3.9, -0.15), Vector3(0.85, 0.6, 0.85), 7, 3, low, high, 1.0, 0.1, 14.0)
			b.blob(Vector3(-0.2, 2.6, 0.9), Vector3(0.7, 0.55, 0.7), 6, 3, low, high, 1.0, 0.1, 15.0)
			# a few blossoms
			for i in range(6):
				var a := TAU * float(i) / 6.0 + 0.4
				b.blob(Vector3(cos(a) * 1.2, 3.0 + 0.2 * (i % 3), sin(a) * 1.2), Vector3.ONE * 0.07, 5, 2, Color("#f4f0e4"), Color("#fff6d0"), 0.0, 0.0)
		_:
			# the Världsträd: a gold-brown trunk with runes, teal and gold crowns, roots that glow, motes
			var trunk := Color("#a07838")
			b.cylinder(Vector3.ZERO, 0.42, 0.2, 3.2, 8, trunk.darkened(0.25), trunk, 0.0)
			_roots(b, 0.42, 7, 0.7, trunk)
			for i in range(5):
				b.box(Vector3(0.0, 0.7 + 0.42 * i, 0.3 - 0.02 * i), Vector3(0.1 if i % 2 == 0 else 0.26, 0.06, 0.04), RUNE, 0.0)
			for i in range(5):
				var a := TAU * (float(i) + 0.5) / 5.0
				b.blade(Vector3(cos(a) * 0.5, 0.18, sin(a) * 0.5), Vector3(cos(a) * 1.2, 0.04, sin(a) * 1.2), 0.1, RUNE.darkened(0.3), RUNE.lightened(0.3), 0.0, a + PI * 0.5)
			var low := Color("#1d8f78")
			var high := Color("#f0e27a")
			b.blob(Vector3(0.0, 3.6, 0.0), Vector3(1.55, 1.05, 1.55), 8, 4, low, high, 0.0, 0.1, 21.0)
			b.blob(Vector3(1.1, 3.0, 0.25), Vector3(0.95, 0.7, 0.95), 7, 3, low, high, 0.0, 0.1, 22.0)
			b.blob(Vector3(-1.05, 3.15, -0.2), Vector3(1.0, 0.75, 1.0), 7, 3, low, high, 0.0, 0.1, 23.0)
			b.blob(Vector3(0.1, 4.45, -0.15), Vector3(0.95, 0.65, 0.95), 7, 3, low, high, 0.0, 0.1, 24.0)
			b.blob(Vector3(-0.2, 2.95, 1.0), Vector3(0.75, 0.55, 0.75), 6, 3, low, high, 0.0, 0.1, 25.0)
			for i in range(10):
				var a := TAU * float(i) / 10.0 + 0.2
				var rr := 1.6 + 0.3 * (i % 3)
				b.blob(Vector3(cos(a) * rr, 2.4 + 0.35 * (i % 5), sin(a) * rr), Vector3.ONE * 0.075, 5, 2, GOLD, Color("#fff2a0"), 0.0, 0.0)
	return b.build()


# ---------------------------------------------------------------------------
# The buildings


## What stands in front of the KayKit blacksmith: an anvil on a stump and a pit of coals that shine.
static func smithy_extras() -> ArrayMesh:
	var b := FarmMesh.new()
	b.cylinder(Vector3(0.0, 0.0, 0.0), 0.2, 0.17, 0.4, 7, WOOD.darkened(0.2), WOOD, 0.0)
	b.box(Vector3(0.0, 0.5, 0.0), Vector3(0.5, 0.16, 0.22), IRON, 0.0, 0.0, IRON.lightened(0.15))
	b.box(Vector3(0.0, 0.43, 0.0), Vector3(0.22, 0.1, 0.18), IRON.darkened(0.15), 0.0)
	b.cone(Vector3(0.3, 0.5, 0.0), 0.09, 0.14, 5, IRON, IRON.lightened(0.1), 0.0, 0.0)
	# the coal pit
	b.box(Vector3(-0.85, 0.09, 0.0), Vector3(0.6, 0.18, 0.5), STONE_DARK, 0.0, 0.0, STONE_DARK.darkened(0.3))
	b.box(Vector3(-0.85, 0.2, 0.0), Vector3(0.44, 0.06, 0.34), EMBER, 0.6)
	b.blob(Vector3(-0.9, 0.24, 0.05), Vector3(0.1, 0.07, 0.1), 5, 2, Color("#ff6a2a"), Color("#ffd870"), 0.0, 0.1, 2.0)
	return b.build()


## The herb garden (2 × 2): four raised beds with herbs and flowers, a drying rack at the back.
static func herb_garden() -> ArrayMesh:
	var b := FarmMesh.new()
	var greens: Array = [Color("#4f8a3a"), Color("#6aa648"), Color("#7fb35a"), Color("#3f7a4a")]
	var blooms: Array = [Color("#9a6ae0"), Color("#f0d24a"), Color("#f4f0e4"), Color("#e84a5a")]
	var n := 0
	for sx in [-0.5, 0.5]:
		for sz in [-0.15, 0.55]:
			var cx: float = sx
			var cz: float = sz
			b.box(Vector3(cx, 0.1, cz), Vector3(0.84, 0.2, 0.62), SOIL, 0.0, 0.0, SOIL.lightened(0.08))
			for e in [-1.0, 1.0]:
				b.box(Vector3(cx, 0.13, cz + e * 0.31), Vector3(0.9, 0.26, 0.05), WOOD_LIGHT, 0.0)
				b.box(Vector3(cx + e * 0.43, 0.13, cz), Vector3(0.05, 0.26, 0.68), WOOD_LIGHT.darkened(0.08), 0.0)
			for i in range(5):
				var fx: float = cx - 0.3 + 0.15 * i
				var fz: float = cz + (-0.12 if i % 2 == 0 else 0.1)
				var g: Color = greens[(n + i) % greens.size()]
				b.blade(Vector3(fx, 0.2, fz), Vector3(fx + 0.03, 0.55 + 0.05 * (i % 3), fz), 0.14, g.darkened(0.2), g, 1.0, 0.4 * i)
				b.blade(Vector3(fx, 0.2, fz), Vector3(fx - 0.04, 0.5, fz + 0.03), 0.12, g.darkened(0.2), g.lightened(0.1), 1.0, 0.4 * i + 1.2)
			var bc: Color = blooms[n % blooms.size()]
			b.blob(Vector3(cx + 0.1, 0.52, cz + 0.02), Vector3(0.07, 0.06, 0.07), 5, 2, bc.darkened(0.15), bc, 0.0, 0.0)
			b.blob(Vector3(cx - 0.18, 0.46, cz - 0.1), Vector3(0.06, 0.05, 0.06), 5, 2, bc.darkened(0.15), bc, 0.0, 0.0)
			n += 1
	# a drying rack behind the beds, with hanging bundles
	for x in [-0.8, 0.8]:
		b.box(Vector3(x, 0.7, -0.85), Vector3(0.06, 1.4, 0.06), WOOD.darkened(0.1), 0.0)
	b.box(Vector3(0.0, 1.35, -0.85), Vector3(1.7, 0.05, 0.05), WOOD, 0.0)
	for i in range(5):
		var hx := -0.64 + 0.32 * i
		b.cone(Vector3(hx, 1.0, -0.85), 0.07, 0.34, 5, greens[i % greens.size()].darkened(0.1), greens[i % greens.size()].lightened(0.1), 0.0, 0.03)
	return b.build()


## A gable roof over a box, ridge along x, with the gable ends closed.
static func _gable(b: FarmMesh, w: float, d: float, y0: float, rise: float, roof: Color, wall: Color, over: float) -> void:
	var hx := w * 0.5 + over
	var hz := d * 0.5 + over
	b.quad(Vector3(-hx, y0, hz), Vector3(hx, y0, hz), Vector3(hx, y0 + rise, 0.0), Vector3(-hx, y0 + rise, 0.0), roof.lightened(0.05))
	b.quad(Vector3(hx, y0, -hz), Vector3(-hx, y0, -hz), Vector3(-hx, y0 + rise, 0.0), Vector3(hx, y0 + rise, 0.0), roof.darkened(0.1))
	var wx := w * 0.5 - 0.02
	var wz := d * 0.5 - 0.02
	b.tri(Vector3(-wx, y0, wz), Vector3(-wx, y0 + rise - 0.05, 0.0), Vector3(-wx, y0, -wz), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))
	b.tri(Vector3(wx, y0, -wz), Vector3(wx, y0 + rise - 0.05, 0.0), Vector3(wx, y0, wz), wall.darkened(0.1), wall.darkened(0.1), wall.darkened(0.1))


## The longhouse (4 × 3): timber walls, a turf roof with a carved ridge and dragon heads at the gables, a door with a
## gold frame and a row of shields.
static func longhall() -> ArrayMesh:
	var b := FarmMesh.new()
	var wall := Color("#9a6a3a")
	var w := 3.7
	var d := 2.5
	var wall_h := 1.15
	b.box(Vector3(0.0, wall_h * 0.5, 0.0), Vector3(w, wall_h, d), wall, 0.0, 0.0, wall.lightened(0.05))
	# vertical planks on the front and the back
	for i in range(14):
		var x := -w * 0.5 + 0.13 + i * (w - 0.26) / 13.0
		b.box(Vector3(x, wall_h * 0.5, d * 0.5 + 0.015), Vector3(0.04, wall_h, 0.02), wall.darkened(0.25), 0.0)
	b.box(Vector3(0.0, 0.1, 0.0), Vector3(w + 0.12, 0.2, d + 0.12), STONE_DARK, 0.0, 0.0, STONE_DARK)
	_gable(b, w, d, wall_h, 1.15, TURF, wall, 0.18)
	# a turf-roof stripe or two and the ridge beam
	b.box(Vector3(0.0, wall_h + 1.17, 0.0), Vector3(w + 0.5, 0.08, 0.1), WOOD.darkened(0.15), 0.0)
	# dragon heads: a crossed pair at each gable, rising and curling outwards
	for sx in [-1.0, 1.0]:
		var gx: float = sx * (w * 0.5 + 0.22)
		b.blade(Vector3(gx, wall_h + 1.0, 0.0), Vector3(gx + sx * 0.35, wall_h + 1.6, 0.0), 0.12, WOOD.darkened(0.2), WOOD_LIGHT, 0.0, 0.0)
		b.blob(Vector3(gx + sx * 0.35, wall_h + 1.62, 0.0), Vector3(0.1, 0.08, 0.06), 5, 2, WOOD, WOOD_LIGHT, 0.0, 0.0)
	# a smoke hole on the ridge
	b.box(Vector3(0.4, wall_h + 1.22, 0.0), Vector3(0.34, 0.2, 0.3), STONE_DARK, 0.0)
	# the door with a gold frame and a step
	b.box(Vector3(0.0, 0.45, d * 0.5 + 0.02), Vector3(0.62, 0.9, 0.05), Color("#3a2a1e"), 0.0)
	b.box(Vector3(0.0, 0.95, d * 0.5 + 0.03), Vector3(0.78, 0.07, 0.05), GOLD, 0.0)
	for x in [-0.36, 0.36]:
		b.box(Vector3(x, 0.47, d * 0.5 + 0.03), Vector3(0.06, 0.94, 0.05), GOLD.darkened(0.1), 0.0)
	b.box(Vector3(0.0, 0.04, d * 0.5 + 0.28), Vector3(1.0, 0.08, 0.4), STONE, 0.0, 0.0, STONE.lightened(0.1))
	# shields along the front
	var shield_cols: Array = [Color("#c8473a"), Color("#e8c43a"), Color("#3a6ac8"), Color("#f4f0e4")]
	for i in range(4):
		for sx in [-1.0, 1.0]:
			var cx: float = sx * (0.95 + 0.38 * i)
			var col: Color = shield_cols[(i + (0 if sx < 0.0 else 2)) % shield_cols.size()]
			b.box(Vector3(cx, 0.72, d * 0.5 + 0.04), Vector3(0.3, 0.3, 0.04), col, 0.0)
			b.box(Vector3(cx, 0.72, d * 0.5 + 0.07), Vector3(0.1, 0.1, 0.03), IRON, 0.0)
	# firewood stacked at one end
	for j in range(2):
		for i in range(4 - j):
			b.box(Vector3(w * 0.5 - 0.15 - 0.17 * i - 0.08 * j, 0.1 + 0.17 * j, d * 0.5 + 0.2), Vector3(0.15, 0.15, 0.3), WOOD_LIGHT.darkened(0.1 * float(i % 2)), 0.0)
	return b.build()
