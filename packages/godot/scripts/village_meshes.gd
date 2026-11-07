class_name VillageMeshes
extends RefCounted
## Köpingen's timber town in 3D, drawn the way the browser drew it (packages/art/src/world.ts): half-timbered town houses,
## turf-roofed longhouses and stave houses, the smith's, the baker's and the weaver's shops with their hanging signs, Pino's
## tavern, the sauna, the dwarves' stone station with its bell, the Vägvisare signpost, the iron lantern on its post, the
## Diligens stop with its horseshoe, and the hand carts. Generated from boxes and quads (no pack has them), with the same
## colours as the pixel art so the two worlds look like one. Every mesh stands on its footprint's middle with its front on +z.
##
## One tile is one metre. A pixel of the browser's art is a sixteenth of a metre, which is how the signs' little pictures
## (`_tpl`) are laid out.

const WOOD := Color("#9a6a3a")
const WOOD_D := Color("#6f4a26")
const WOOD_L := Color("#c58f55")
const STONE := Color("#9d9a92")
const STONE_D := Color("#6f6c66")
const STONE_L := Color("#c9c6bd")
const BEAM := Color("#4a3020")
const BEAM_L := Color("#6a4630")
const IRON := Color("#3a3a40")
const IRON_L := Color("#6e6e78")
const BRASS := Color("#d9a640")
const BRASS_L := Color("#f2d27a")
const GLASS := Color("#9cc8e0")
const GLASS_L := Color("#c4e4f4")
const FLAME := Color("#ffd45a")
const FLAME_L := Color("#fff1a0")
const TURF := Color("#5f8f3a")
const TURF_D := Color("#456a2a")
const TURF_L := Color("#86b552")
const BARK := Color("#d8d0c0")
const RUNE := Color("#3a9cff")
const OUTLINE := Color("#2b2419")

## The shops' hanging signs: an anvil (smith), a pretzel (baker), a shuttle with yarn (weaver).
const SHOP_SIGNS := [
	[["KKKKKKKKK", ".KKKKKKKL", "...KKKK..", "...KKK...", "..KKKKK..", ".KKKKKKK."], {"K": Color("#3a3a42"), "L": Color("#8a8a94")}],
	[[".BBB.BBB.", "B...B...B", "B..B.B..B", ".BB...BB.", "..B...B..", "...BBB..."], {"B": Color("#b8722a")}],
	[["...WWWWW...", ".WWLYYYLWW.", "WWWLYYYLWWW", ".WWWWWWWWW.", ".....T.....", ".....T.....", "......TT..."], {"W": Color("#8a5a2a"), "L": Color("#c58f55"), "Y": Color("#d84a4a"), "T": Color("#d84a4a")}],
]


# ---------------------------------------------------------------------------
# Small shapes

## The same mesh `k` times the size (the browser's lantern post is a metre and a half; the first draft stood two metres tall).
static func scaled(m: ArrayMesh, k: float) -> ArrayMesh:
	var arr := m.surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	for i in range(v.size()):
		v[i] *= k
	arr[Mesh.ARRAY_VERTEX] = v
	var out := ArrayMesh.new()
	out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return out


## A flat rectangle on the plane z, facing +z (the front of a building).
static func rect_z(b: FarmMesh, cx: float, cy: float, w: float, h: float, z: float, col: Color) -> void:
	b.quad(Vector3(cx - w * 0.5, cy + h * 0.5, z), Vector3(cx - w * 0.5, cy - h * 0.5, z), Vector3(cx + w * 0.5, cy - h * 0.5, z), Vector3(cx + w * 0.5, cy + h * 0.5, z), col)


## A flat rectangle on the plane x, facing +x (a building's right side) or -x (`dir` -1): centre (z, y) on the wall.
static func rect_x(b: FarmMesh, x: float, cz: float, cy: float, w: float, h: float, col: Color, dir := 1.0) -> void:
	var a := Vector3(x, cy + h * 0.5, cz + w * 0.5 * dir)
	var c := Vector3(x, cy - h * 0.5, cz + w * 0.5 * dir)
	var d := Vector3(x, cy - h * 0.5, cz - w * 0.5 * dir)
	var e := Vector3(x, cy + h * 0.5, cz - w * 0.5 * dir)
	b.quad(a, c, d, e, col)


## A slanted strip (a timber brace) from a to c on the plane z, `thick` wide.
static func strip_z(b: FarmMesh, a: Vector2, c: Vector2, thick: float, z: float, col: Color) -> void:
	var p := a
	var q := c
	if p.x > q.x:
		p = c
		q = a
	var d := (q - p).normalized()
	var n := Vector2(-d.y, d.x) * thick * 0.5
	b.quad(Vector3(p.x + n.x, p.y + n.y, z), Vector3(p.x - n.x, p.y - n.y, z), Vector3(q.x - n.x, q.y - n.y, z), Vector3(q.x + n.x, q.y + n.y, z), col)


## A little picture laid out in pixels (rows of letters, `pal` the colours), its top-left at (left, top), on the plane z.
static func tpl(b: FarmMesh, rows: Array, pal: Dictionary, left: float, top: float, px: float, z: float) -> void:
	for j in range(rows.size()):
		var row: String = rows[j]
		for i in range(row.length()):
			var ch := row[i]
			if pal.has(ch):
				rect_z(b, left + (i + 0.5) * px, top - (j + 0.5) * px, px, px, z, pal[ch])


## A leaded window: a timber frame, glass with a shine, a cross of mullions, shutters when `shutter` has alpha.
static func window(b: FarmMesh, cx: float, cy: float, w: float, h: float, z: float, shutter := Color(0, 0, 0, 0), frame := BEAM) -> void:
	if shutter.a > 0.0:
		for s in [-1.0, 1.0]:
			rect_z(b, cx + s * (w * 0.5 + 0.1), cy, 0.17, h + 0.08, z, shutter)
			rect_z(b, cx + s * (w * 0.5 + 0.1), cy, 0.17, 0.025, z + 0.006, shutter.darkened(0.3))
	rect_z(b, cx, cy, w + 0.08, h + 0.08, z + 0.004, frame)
	rect_z(b, cx, cy, w, h, z + 0.012, GLASS)
	rect_z(b, cx - w * 0.25, cy + h * 0.25, w * 0.5, h * 0.5, z + 0.016, GLASS_L)
	rect_z(b, cx, cy, 0.03, h, z + 0.02, frame)
	rect_z(b, cx, cy, w, 0.03, z + 0.02, frame)


## A plank door in a frame with iron hinges and a brass ring.
static func door(b: FarmMesh, cx: float, base: float, w: float, h: float, z: float, col := WOOD) -> void:
	rect_z(b, cx, base + h * 0.5, w + 0.1, h + 0.05, z, BEAM)
	rect_z(b, cx, base + h * 0.5 - 0.02, w, h - 0.04, z + 0.008, col)
	var n := int(w / 0.11)
	for i in range(n):
		rect_z(b, cx - w * 0.5 + (i + 0.5) * w / n, base + h * 0.5 - 0.02, 0.012, h - 0.06, z + 0.014, col.darkened(0.25))
	for hy in [0.22, h - 0.2]:
		rect_z(b, cx - w * 0.25, base + hy, w * 0.5, 0.045, z + 0.02, IRON)
	rect_z(b, cx + w * 0.3, base + h * 0.5, 0.05, 0.05, z + 0.024, BRASS)


## Flowers in a box under a window.
static func flower_box(b: FarmMesh, cx: float, y: float, w: float, z: float) -> void:
	b.box(Vector3(cx, y, z + 0.07), Vector3(w, 0.1, 0.14), WOOD_D, 0.0, 0.0, WOOD)
	var n := int(w / 0.1)
	for i in range(n):
		var col: Color = Color("#e8502a") if i % 2 == 0 else Color("#f5d94a")
		b.box(Vector3(cx - w * 0.5 + (i + 0.5) * w / n, y + 0.1, z + 0.07), Vector3(0.06, 0.09, 0.06), col)
		b.box(Vector3(cx - w * 0.5 + (i + 0.5) * w / n + 0.04, y + 0.07, z + 0.07), Vector3(0.05, 0.06, 0.05), Color("#3f8a2e"))


## A low stone plinth round the foot of a house.
static func plinth(b: FarmMesh, w: float, d: float) -> void:
	b.box(Vector3(0.0, 0.09, 0.0), Vector3(w + 0.06, 0.18, d + 0.06), STONE_D, 0.0, 0.0, STONE)
	var n := int((w + 0.06) / 0.3)
	for i in range(n):
		rect_z(b, -w * 0.5 + (i + 0.5) * w / n, 0.09, w / n - 0.04, 0.14, d * 0.5 + 0.034, STONE.darkened(0.04 * (i % 3)))


static func chimney(b: FarmMesh, x: float, z: float, y0: float, h: float) -> void:
	b.box(Vector3(x, y0 + h * 0.5, z), Vector3(0.3, h, 0.3), STONE_D, 0.0, 0.0, STONE)
	b.box(Vector3(x, y0 + h + 0.03, z), Vector3(0.38, 0.07, 0.38), STONE_D, 0.0, 0.0, STONE_L)


## Logs stacked on their sides: every other course sticks out a little at the corners, as the round log ends do.
static func log_wall(b: FarmMesh, w: float, d: float, y0: float, h: float, col: Color) -> void:
	var n := int(h / 0.11)
	var step := h / n
	for i in range(n):
		var k := 0.0 if i % 2 == 0 else 0.05
		var c := col if i % 3 != 1 else col.lightened(0.08)
		b.box(Vector3(0.0, y0 + (i + 0.5) * step, 0.0), Vector3(w + k, step * 0.96, d + k), c.darkened(0.08 if i % 2 == 0 else 0.0), 0.0, 0.0, c)
	# the log ends at the front corners
	for sx in [-1.0, 1.0]:
		rect_z(b, sx * (w * 0.5 + 0.02), y0 + h * 0.5, 0.11, h, d * 0.5 + 0.034, Color("#c8955a"))


## A wall of plaster with dark timber: posts, a beam at the foot and the head, and the braces in the panels that ask for one.
## `posts` are x offsets, `braces` [x0, x1, up] pairs, for the front (+z) and (just posts) the right and left sides.
static func half_timber(b: FarmMesh, w: float, d: float, y0: float, h: float, plaster: Color, posts: Array, braces: Array) -> void:
	b.box(Vector3(0.0, y0 + h * 0.5, 0.0), Vector3(w, h, d), plaster, 0.0, 0.0, plaster.darkened(0.05))
	var z := d * 0.5 + 0.012
	var t := 0.075
	rect_z(b, 0.0, y0 + t * 0.5, w, t, z, BEAM)
	rect_z(b, 0.0, y0 + h - t * 0.5, w, t, z, BEAM)
	for p in posts:
		rect_z(b, float(p), y0 + h * 0.5, t, h, z + 0.004, BEAM)
	for br in braces:
		var up: bool = br[2]
		var x0: float = br[0]
		var x1: float = br[1]
		strip_z(b, Vector2(x0, y0 + (h - t if up else t)), Vector2(x1, y0 + (t if up else h - t)), 0.06, z + 0.006, BEAM)
	# the sides: posts and beams too
	for s in [-1.0, 1.0]:
		var x: float = s * (w * 0.5 + 0.012)
		rect_x(b, x, 0.0, y0 + t * 0.5, d, t, BEAM, s)
		rect_x(b, x, 0.0, y0 + h - t * 0.5, d, t, BEAM, s)
		for pz in [-d * 0.5 + 0.04, 0.0, d * 0.5 - 0.04]:
			rect_x(b, x + s * 0.004, float(pz), y0 + h * 0.5, t, h, BEAM, s)


## A gable roof along x over a box of w × d: courses of shingles that step lighter and darker, a ridge, and the gable ends
## in `wall`. `ov` is how far the eaves reach.
static func gable_roof(b: FarmMesh, w: float, d: float, y0: float, rise: float, col: Color, wall: Color, ov := 0.16, bands := 6) -> void:
	var hx := w * 0.5 + ov
	var hz := d * 0.5 + ov
	for i in range(bands):
		var t0 := float(i) / bands
		var t1 := float(i + 1) / bands
		var c := col.lightened(0.08) if i % 2 == 0 else col.darkened(0.07)
		b.quad(Vector3(-hx, y0 + rise * t0, hz * (1.0 - t0)), Vector3(hx, y0 + rise * t0, hz * (1.0 - t0)), Vector3(hx, y0 + rise * t1, hz * (1.0 - t1)), Vector3(-hx, y0 + rise * t1, hz * (1.0 - t1)), c)
		b.quad(Vector3(hx, y0 + rise * t0, -hz * (1.0 - t0)), Vector3(-hx, y0 + rise * t0, -hz * (1.0 - t0)), Vector3(-hx, y0 + rise * t1, -hz * (1.0 - t1)), Vector3(hx, y0 + rise * t1, -hz * (1.0 - t1)), c.darkened(0.14))
	b.box(Vector3(0.0, y0 + rise + 0.015, 0.0), Vector3(w + ov * 2.0, 0.05, 0.1), col.darkened(0.35))
	_gable_ends(b, w, d, y0, rise, wall)


static func _gable_ends(b: FarmMesh, w: float, d: float, y0: float, rise: float, wall: Color) -> void:
	var wx := w * 0.5 - 0.02
	var wz := d * 0.5 - 0.02
	var c := wall.darkened(0.08)
	b.tri(Vector3(-wx, y0, wz), Vector3(-wx, y0 + rise - 0.06, 0.0), Vector3(-wx, y0, -wz), c, c, c)
	b.tri(Vector3(wx, y0, -wz), Vector3(wx, y0 + rise - 0.06, 0.0), Vector3(wx, y0, wz), c, c, c)


## A turf roof: a thick green mound over birch bark, lighter at the ridge, with a few flowers and a carved board at each end.
static func turf_roof(b: FarmMesh, w: float, d: float, y0: float, rise: float, wall: Color, seed_v: int, ov := 0.22) -> void:
	var hx := w * 0.5 + ov
	var hz := d * 0.5 + ov
	var bands := 6
	for i in range(bands):
		var t0 := float(i) / bands
		var t1 := float(i + 1) / bands
		var c := TURF_D if i == 0 else (TURF_L if i == bands - 1 else (TURF if i % 2 == 0 else TURF.darkened(0.06)))
		b.quad(Vector3(-hx, y0 + rise * t0, hz * (1.0 - t0)), Vector3(hx, y0 + rise * t0, hz * (1.0 - t0)), Vector3(hx, y0 + rise * t1, hz * (1.0 - t1)), Vector3(-hx, y0 + rise * t1, hz * (1.0 - t1)), c)
		b.quad(Vector3(hx, y0 + rise * t0, -hz * (1.0 - t0)), Vector3(-hx, y0 + rise * t0, -hz * (1.0 - t0)), Vector3(-hx, y0 + rise * t1, -hz * (1.0 - t1)), Vector3(hx, y0 + rise * t1, -hz * (1.0 - t1)), c.darkened(0.12))
	# birch bark along the eaves
	b.box(Vector3(0.0, y0 + 0.03, hz - 0.01), Vector3(hx * 2.0, 0.07, 0.05), BARK)
	b.box(Vector3(0.0, y0 + 0.03, -hz + 0.01), Vector3(hx * 2.0, 0.07, 0.05), BARK.darkened(0.15))
	# flowers in the turf
	var blooms: Array[Color] = [Color("#f5f0e0"), Color("#f5d94a"), Color("#e87ab8"), Color("#e8502a")]
	for i in range(8):
		var h1 := absf(sin(float(seed_v * 13 + i * 7) * 12.9898) * 43758.5453)
		var fx := (fposmod(h1, 1.0) - 0.5) * (w - 0.5)
		var t := 0.15 + fposmod(h1 * 7.0, 1.0) * 0.6
		var fz := hz * (1.0 - t) * (1.0 if i % 2 == 0 else -1.0)
		b.box(Vector3(fx, y0 + rise * t + 0.02, fz), Vector3(0.05, 0.05, 0.05), blooms[i % 4])
	_gable_ends(b, w, d, y0, rise, wall)
	# crossed, carved boards at the ridge ends
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * (hx - 0.03), y0 + rise + 0.14, 0.0), Vector3(0.05, 0.3, 0.05), BEAM)
		b.box(Vector3(sx * (hx - 0.03), y0 + rise + 0.3, 0.0), Vector3(0.07, 0.06, 0.07), BEAM_L)


## A disc standing on its edge (a cart wheel) in the xy plane at depth z: a dark rim, wood, spokes and an iron hub.
static func wheel(b: FarmMesh, cx: float, cy: float, r: float, z: float, thick := 0.07) -> void:
	var segs := 10
	for face in [-1.0, 1.0]:
		var zz: float = z + face * thick * 0.5
		for i in range(segs):
			var a0 := TAU * i / segs
			var a1 := TAU * (i + 1) / segs
			var c := Vector3(cx, cy, zz)
			var p0 := Vector3(cx + cos(a0) * r, cy + sin(a0) * r, zz)
			var p1 := Vector3(cx + cos(a1) * r, cy + sin(a1) * r, zz)
			var q0 := Vector3(cx + cos(a0) * r * 0.78, cy + sin(a0) * r * 0.78, zz + face * 0.004)
			var q1 := Vector3(cx + cos(a1) * r * 0.78, cy + sin(a1) * r * 0.78, zz + face * 0.004)
			var rim := Color("#4a3020")
			var wood := WOOD
			if face > 0.0:
				b.quad(p0, q0, q1, p1, rim)
				b.tri(q0, c + Vector3(0.0, 0.0, face * 0.004), q1, wood.darkened(0.2 if i % 2 == 0 else 0.0), wood, wood.darkened(0.2 if i % 2 == 0 else 0.0))
			else:
				b.quad(p1, q1, q0, p0, rim)
				b.tri(q1, c + Vector3(0.0, 0.0, face * 0.004), q0, wood, wood, wood)
	# the tyre between the faces
	for i in range(segs):
		var a0 := TAU * i / segs
		var a1 := TAU * (i + 1) / segs
		b.quad(Vector3(cx + cos(a0) * r, cy + sin(a0) * r, z + thick * 0.5), Vector3(cx + cos(a1) * r, cy + sin(a1) * r, z + thick * 0.5), Vector3(cx + cos(a1) * r, cy + sin(a1) * r, z - thick * 0.5), Vector3(cx + cos(a0) * r, cy + sin(a0) * r, z - thick * 0.5), Color("#4a3020"))
	b.box(Vector3(cx, cy, z), Vector3(0.1, 0.1, thick + 0.04), IRON_L)


# ---------------------------------------------------------------------------
# Houses

## house_small (3 × 3): the plaster cottage with a coloured shingle roof, in the browser's four colours, framed in dark timber.
static func house(v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var plaster: Color = [Color("#e8dcc0"), Color("#f0d8a8"), Color("#dce8c8"), Color("#f4e0e0")][v % 4]
	var roof: Color = [Color("#b5413a"), Color("#6f4a26"), Color("#3b5fa6"), Color("#2f7a3a")][v % 4]
	var w := 2.7
	var d := 2.3
	plinth(b, w, d)
	half_timber(b, w, d, 0.0, 1.25, plaster, [-w * 0.5 + 0.04, w * 0.5 - 0.04, -0.62, 0.62], [])
	gable_roof(b, w, d, 1.25, 0.95, roof, plaster, 0.2)
	var z := d * 0.5 + 0.012
	door(b, 0.0, 0.0, 0.46, 0.92, z, WOOD_L if v % 2 == 0 else WOOD)
	for sx in [-0.88, 0.88]:
		window(b, sx, 0.72, 0.4, 0.4, z, Color("#7a3a28") if v % 2 == 1 else Color(0, 0, 0, 0))
		if v >= 2:
			flower_box(b, sx, 0.46, 0.5, z)
	chimney(b, 0.75, -0.2, 1.5, 1.05)
	return b.build()


## apartment (3 × 3), four variants: 0 and 2 the half-timbered town houses (a jettied upper storey, a dormer, a chimney), 1 a
## longhouse of logs under turf, 3 a stave house of tarred planks under turf.
static func apartment(v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var w := 2.9
	var d := 2.5
	plinth(b, w, d)
	if v % 2 == 0:
		var plaster := Color("#f0e6cc") if v == 0 else Color("#ead2a0")
		var roof := Color("#9a4a34") if v == 0 else Color("#5a5a66")
		var shut := Color("#3f7a4a") if v == 0 else Color("#8a3a2a")
		# the ground floor, then the upper storey standing out over it on its joists
		half_timber(b, w - 0.12, d - 0.12, 0.0, 1.05, plaster, [-1.1, -0.45, 0.0, 0.45, 1.1], [[-1.1, -0.45, true], [0.45, 1.1, false]])
		b.box(Vector3(0.0, 1.08, 0.04), Vector3(w + 0.02, 0.07, d - 0.02), BEAM_L)
		half_timber(b, w, d, 1.11, 0.95, plaster, [-1.2, -0.5, 0.5, 1.2], [[-1.2, -0.5, false], [0.5, 1.2, true]])
		gable_roof(b, w, d, 2.06, 1.0, roof, plaster, 0.2)
		var z := d * 0.5 + 0.012
		var zg := d * 0.5 - 0.06 + 0.012
		door(b, 0.0, 0.0, 0.5, 0.95, zg + 0.01)
		for sx in [-0.85, 0.85]:
			window(b, sx, 0.62, 0.4, 0.4, zg + 0.01, shut)
		for sx in [-1.0, 1.0]:
			window(b, sx, 1.62, 0.36, 0.38, z, shut)
		window(b, 0.0, 1.62, 0.42, 0.42, z)
		flower_box(b, 0.0, 1.34, 0.56, z)
		# a dormer in the roof's front slope
		var dy := 2.06 + 1.0 * (1.0 - 0.6 / (d * 0.5 + 0.2))
		b.box(Vector3(0.0, dy + 0.2, 0.62), Vector3(0.6, 0.5, 0.36), plaster, 0.0, 0.0, plaster)
		gable_roof(b, 0.6, 0.36, dy + 0.45, 0.24, roof.darkened(0.1), plaster, 0.06, 3)
		window(b, 0.0, dy + 0.24, 0.3, 0.3, 0.62 + 0.18 + 0.01)
		chimney(b, 0.9, -0.3, 2.5, 0.8)
	else:
		var stave := v == 3
		var wall := Color("#7a3a28") if stave else Color("#8a5a30")
		var hh := 1.4
		if stave:
			b.box(Vector3(0.0, hh * 0.5, 0.0), Vector3(w, hh, d), wall, 0.0, 0.0, wall.darkened(0.1))
			var n := int(w / 0.09)
			for i in range(n):
				if i % 3 == 0:
					rect_z(b, -w * 0.5 + (i + 0.5) * w / n, hh * 0.5, 0.025, hh, d * 0.5 + 0.01, wall.darkened(0.25))
		else:
			log_wall(b, w, d, 0.0, hh, wall)
		turf_roof(b, w, d, hh, 1.0, wall, v * 17)
		# the smoke hole's hood on the ridge
		b.box(Vector3(0.0, hh + 1.03, 0.0), Vector3(0.36, 0.26, 0.4), BEAM)
		b.box(Vector3(0.0, hh + 1.03, 0.0), Vector3(0.2, 0.28, 0.42), Color("#2a1a10"))
		var z := d * 0.5 + 0.05
		var shut := Color("#4a6a3a") if stave else Color("#7a3a28")
		for sx in [-0.95, 0.95]:
			window(b, sx, 0.78, 0.32, 0.32, z, shut)
		# the carved door frame with a lintel
		door(b, 0.0, 0.0, 0.52, 1.02, z, Color("#9a6a3a") if stave else Color("#b07a44"))
		rect_z(b, 0.0, 1.1, 0.8, 0.07, z + 0.01, BEAM)
		rect_z(b, -0.4, 1.0, 0.07, 0.16, z + 0.012, BEAM_L)
		rect_z(b, 0.4, 1.0, 0.07, 0.16, z + 0.012, BEAM_L)
		if not stave:
			# the woodpile by the wall
			for r in range(3):
				for c in range(3 - r):
					b.box(Vector3(1.2 + c * 0.14 + r * 0.07, 0.08 + r * 0.15, d * 0.5 + 0.14), Vector3(0.13, 0.14, 0.2), WOOD_D if (r + c) % 2 == 0 else WOOD)
		else:
			b.cylinder(Vector3(1.15, 0.0, d * 0.5 + 0.18), 0.17, 0.15, 0.4, 8, WOOD_L.darkened(0.1), WOOD_L)
			b.box(Vector3(1.15, 0.12, d * 0.5 + 0.18), Vector3(0.36, 0.03, 0.36), IRON)
			b.box(Vector3(1.15, 0.28, d * 0.5 + 0.18), Vector3(0.34, 0.03, 0.34), IRON)
	return b.build()


## shop (3 × 2), three variants (the browser's): the smith's of dark logs on a stone footing, the baker's half-timbered, the
## weaver's of blue-grey planks; each with a shop window over a counter of goods, a plank door and a hanging sign.
static func shop(v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var w := 2.9
	var d := 1.8
	var hh := 1.2
	var roof: Color = [Color("#5a4a3e"), Color("#9a4a34"), Color("#6a4630")][v % 3]
	plinth(b, w, d)
	var wall_col := Color("#6a4628")
	if v % 3 == 0:
		log_wall(b, w, d, 0.0, hh, wall_col)
	elif v % 3 == 1:
		wall_col = Color("#f2e2c2")
		half_timber(b, w, d, 0.0, hh, wall_col, [-1.4, -0.7, 1.4], [[-1.4, -0.7, true]])
	else:
		wall_col = Color("#5f7f8f")
		b.box(Vector3(0.0, hh * 0.5, 0.0), Vector3(w, hh, d), wall_col, 0.0, 0.0, wall_col.darkened(0.05))
		var n := int(w / 0.09)
		for i in range(n):
			if i % 3 == 0:
				rect_z(b, -w * 0.5 + (i + 0.5) * w / n, hh * 0.5, 0.025, hh, d * 0.5 + 0.01, wall_col.darkened(0.25))
		rect_z(b, 0.0, 0.07, w, 0.12, d * 0.5 + 0.014, BEAM)
		rect_z(b, 0.0, hh - 0.07, w, 0.12, d * 0.5 + 0.014, BEAM)
	gable_roof(b, w, d, hh, 0.62, roof, wall_col, 0.18, 5)
	var z := d * 0.5 + 0.012
	# the shop window over a counter of goods
	window(b, 0.15, 0.74, 0.95, 0.34, z)
	rect_z(b, 0.15, 0.5, 1.05, 0.06, z + 0.01, BEAM)
	b.box(Vector3(0.15, 0.28, d * 0.5 + 0.08), Vector3(1.05, 0.5, 0.16), Color("#3a2618"), 0.0, 0.0, WOOD_L)
	if v % 3 == 0:
		rect_z(b, -0.12, 0.28, 0.34, 0.3, z + 0.14, Color("#f08a2a"))
		rect_z(b, -0.12, 0.28, 0.22, 0.2, z + 0.145, FLAME)
		b.box(Vector3(0.2, 0.55, d * 0.5 + 0.08), Vector3(0.2, 0.1, 0.12), IRON_L)
		b.box(Vector3(0.2, 0.62, d * 0.5 + 0.08), Vector3(0.1, 0.06, 0.1), IRON)
	elif v % 3 == 1:
		for i in range(3):
			var col: Color = [Color("#c8843a"), Color("#d89a4a"), Color("#b8722a")][i]
			b.blob(Vector3(-0.2 + i * 0.32, 0.58, d * 0.5 + 0.08), Vector3(0.13, 0.08, 0.1), 6, 2, col.darkened(0.15), col.lightened(0.1), 0.0, 0.0)
	else:
		var cols: Array[Color] = [Color("#c83a3a"), Color("#3a6ab8"), Color("#e8c040"), Color("#4a8a4a"), Color("#e8e0d0")]
		for i in range(5):
			b.box(Vector3(-0.22 + i * 0.2, 0.6, d * 0.5 + 0.08), Vector3(0.16, 0.18, 0.14), cols[i])
	door(b, 1.05, 0.0, 0.5, 0.95, z)
	# the hanging sign: an iron bracket out from the wall, a board on two chains, the trade's picture on it
	var sx := -1.0
	b.box(Vector3(sx, 0.98, d * 0.5 + 0.22), Vector3(0.05, 0.05, 0.44), IRON)
	var sz := d * 0.5 + 0.42
	b.box(Vector3(sx - 0.28, 0.88, sz), Vector3(0.02, 0.2, 0.02), IRON_L)
	b.box(Vector3(sx + 0.28, 0.88, sz), Vector3(0.02, 0.2, 0.02), IRON_L)
	rect_z(b, sx, 0.62, 0.7, 0.5, sz, BEAM)
	rect_z(b, sx, 0.62, 0.62, 0.42, sz + 0.006, Color("#e0c48f"))
	var emblem: Array = SHOP_SIGNS[v % 3]
	var rows: Array = emblem[0]
	var pw := 0.055
	tpl(b, rows, emblem[1], sx - rows[0].length() * pw * 0.5, 0.62 + rows.size() * pw * 0.5, pw, sz + 0.012)
	return b.build()


## pizzeria (3 × 2): Pino's tavern: timber walls, a red-and-white awning over the window, his pizza sign in a carved frame
## on the roof, and a stone oven glowing by the door.
static func pizzeria() -> ArrayMesh:
	var b := FarmMesh.new()
	var w := 2.9
	var d := 1.8
	var plaster := Color("#e8d8b0")
	plinth(b, w, d)
	half_timber(b, w, d, 0.0, 1.2, plaster, [-1.4, -0.5, 0.5, 1.4], [[-1.4, -0.5, true], [0.5, 1.4, false]])
	gable_roof(b, w, d, 1.2, 0.7, Color("#9a4a34"), plaster, 0.2)
	var z := d * 0.5 + 0.012
	window(b, -0.85, 0.62, 0.7, 0.4, z)
	door(b, 0.35, 0.0, 0.5, 0.95, z)
	# the striped awning over the window
	for i in range(8):
		var col := Color("#f4f0e4") if i % 2 == 0 else Color("#c8473a")
		var x0 := -1.25 + i * 0.2
		b.quad(Vector3(x0, 1.0, z + 0.02), Vector3(x0 + 0.2, 1.0, z + 0.02), Vector3(x0 + 0.2, 0.84, z + 0.4), Vector3(x0, 0.84, z + 0.4), col)
	# the pizza on the roof, in a carved frame
	b.box(Vector3(0.0, 1.62, d * 0.5 - 0.35), Vector3(0.7, 0.55, 0.06), BEAM)
	b.cylinder(Vector3(0.0, 1.38, d * 0.5 - 0.31), 0.22, 0.22, 0.04, 10, Color("#e8a83a"), Color("#e8a83a"))
	# (the pizza lies on its side in the cylinder; draw it standing: a disc in the frame)
	for i in range(8):
		var a0 := TAU * i / 8.0
		var a1 := TAU * (i + 1) / 8.0
		b.tri(Vector3(0.0, 1.62, d * 0.5 - 0.315), Vector3(cos(a0) * 0.22, 1.62 + sin(a0) * 0.22, d * 0.5 - 0.315), Vector3(cos(a1) * 0.22, 1.62 + sin(a1) * 0.22, d * 0.5 - 0.315), Color("#e8a83a"), Color("#e8a83a"), Color("#e8a83a"))
		b.tri(Vector3(0.0, 1.62, d * 0.5 - 0.318), Vector3(cos(a0) * 0.12, 1.62 + sin(a0) * 0.12, d * 0.5 - 0.318), Vector3(cos(a1) * 0.12, 1.62 + sin(a1) * 0.12, d * 0.5 - 0.318), Color("#c8473a"), Color("#c8473a"), Color("#c8473a"))
	# a stone oven by the door, glowing
	b.box(Vector3(1.15, 0.25, d * 0.5 + 0.16), Vector3(0.5, 0.5, 0.3), STONE_D, 0.0, 0.0, STONE)
	b.blob(Vector3(1.15, 0.52, d * 0.5 + 0.16), Vector3(0.22, 0.16, 0.14), 6, 3, STONE_D, STONE, 0.0, 0.0)
	rect_z(b, 1.15, 0.28, 0.18, 0.16, d * 0.5 + 0.32, Color("#f08a2a"))
	rect_z(b, 1.15, 0.27, 0.1, 0.1, d * 0.5 + 0.325, FLAME)
	chimney(b, 1.0, -0.3, 1.5, 0.7)
	return b.build()


## bathhouse (3 × 2): the sauna, a log house under turf with a chimney, a wave carved over the door and a bucket.
static func bathhouse() -> ArrayMesh:
	var b := FarmMesh.new()
	var w := 2.9
	var d := 1.8
	var wall := Color("#9a6a3a")
	plinth(b, w, d)
	log_wall(b, w, d, 0.0, 1.2, wall)
	turf_roof(b, w, d, 1.2, 0.6, wall, 5, 0.2)
	var z := d * 0.5 + 0.05
	door(b, 0.0, 0.0, 0.5, 0.95, z)
	for sx in [-0.95, 0.95]:
		window(b, sx, 0.7, 0.34, 0.34, z, Color("#6a8a9a"))
	# the wave over the door
	rect_z(b, 0.0, 1.1, 0.7, 0.14, z + 0.01, Color("#3a2618"))
	tpl(b, ["..BB..BB..", ".B..BB..B.", "B........B"], {"B": Color("#8ac8ff")}, -0.28, 1.15, 0.056, z + 0.02)
	chimney(b, -1.0, -0.4, 1.4, 0.75)
	b.cylinder(Vector3(1.15, 0.0, d * 0.5 + 0.18), 0.12, 0.1, 0.22, 8, WOOD, WOOD_L)
	return b.build()


## train_station (3 × 2): the dwarves' stone hall with a slate roof, a bell in a frame, a band of runes over a brass-bound
## arched door and pick-and-hammer on the wall.
static func station() -> ArrayMesh:
	var b := FarmMesh.new()
	var w := 2.9
	var d := 1.8
	var S := Color("#8a8a90")
	var SD := Color("#5e5e66")
	var SL := Color("#b0b0b6")
	b.box(Vector3(0.0, 0.6, 0.0), Vector3(w, 1.2, d), SD, 0.0, 0.0, S)
	var z := d * 0.5 + 0.012
	for r in range(6):
		var y := 0.1 + r * 0.2
		for i in range(8):
			var x0 := -w * 0.5 + (i + (0.5 if r % 2 == 1 else 0.0)) * 0.4
			var x1 := x0 + 0.38
			x0 = maxf(x0, -w * 0.5)
			x1 = minf(x1, w * 0.5)
			if x1 > x0:
				rect_z(b, (x0 + x1) * 0.5, y, x1 - x0, 0.17, z, S)
				rect_z(b, (x0 + x1) * 0.5, y + 0.07, x1 - x0, 0.03, z + 0.004, SL)
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * (w * 0.5 - 0.17), 0.62, d * 0.5 - 0.1), Vector3(0.36, 1.24, 0.36), S, 0.0, 0.0, SL)
	# a heavy slate roof
	gable_roof(b, w, d, 1.2, 0.55, Color("#4a4a56"), SD, 0.12, 6)
	# the bell in its frame on the ridge
	for sx in [-0.28, 0.28]:
		b.box(Vector3(sx, 1.95, 0.0), Vector3(0.06, 0.4, 0.06), BEAM)
	b.box(Vector3(0.0, 2.16, 0.0), Vector3(0.66, 0.06, 0.08), BEAM_L)
	b.cone(Vector3(0.0, 1.8, 0.0), 0.2, 0.3, 8, BRASS.darkened(0.15), BRASS_L, 0.0, 0.08)
	# the rune band over the door
	rect_z(b, 0.0, 1.02, 1.5, 0.16, z + 0.01, Color("#3a3a44"))
	tpl(b, ["|.\\.|/.|..|\\|.|.\\.|./|", "|..|..|\\.|.|/..|.|\\.|.."], {"|": RUNE, "/": RUNE, "\\": RUNE}, -0.62, 1.07, 0.054, z + 0.02)
	# the great arched door, brass-bound
	rect_z(b, 0.0, 0.42, 0.7, 0.84, z + 0.012, SD)
	rect_z(b, 0.0, 0.42, 0.6, 0.82, z + 0.02, Color("#5a3a22"))
	rect_z(b, 0.0, 0.42, 0.02, 0.82, z + 0.026, Color("#3a2414"))
	for y in [0.18, 0.55]:
		rect_z(b, 0.0, y, 0.6, 0.04, z + 0.03, BRASS)
	# slit windows
	for sx in [-0.95, 0.95]:
		rect_z(b, sx, 0.6, 0.26, 0.5, z + 0.012, SD)
		rect_z(b, sx, 0.6, 0.18, 0.42, z + 0.02, GLASS)
	return b.build()


# ---------------------------------------------------------------------------
# Street furniture

## traffic_light, as the Vägvisare: a wooden signpost with two arms pointing both ways and a little lantern on top.
static func signpost() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.09, 0.0), Vector3(0.4, 0.18, 0.4), STONE_D, 0.0, 0.0, STONE_L)
	b.box(Vector3(0.0, 0.8, 0.0), Vector3(0.12, 1.4, 0.12), WOOD_D, 0.0, 0.0, WOOD)
	# the arms: planks with a pointed end, one each way
	for arm in [[0.5, 1.05, 0.42, 0.2], [-0.5, 0.78, 0.42, 0.2]]:
		var side: float = signf(arm[0])
		var y: float = arm[1]
		var arm_len: float = arm[2]
		var cx: float = side * (0.06 + arm_len * 0.5 - 0.05)
		b.box(Vector3(cx, y, 0.0), Vector3(arm_len, 0.2, 0.05), WOOD_L, 0.0, 0.0, Color("#e0b47a"))
		# the point
		var tip := side * (0.06 + arm_len - 0.05)
		for sz in [-1.0, 1.0]:
			b.tri(Vector3(tip, y + 0.1, sz * 0.025), Vector3(tip + side * 0.16, y, sz * 0.025), Vector3(tip, y - 0.1, sz * 0.025), WOOD_L, WOOD_L, WOOD_L)
			b.tri(Vector3(tip, y - 0.1, sz * 0.025), Vector3(tip + side * 0.16, y, sz * 0.025), Vector3(tip, y + 0.1, sz * 0.025), WOOD_L, WOOD_L, WOOD_L)
		rect_z(b, cx - side * 0.04, y, arm_len * 0.6, 0.03, 0.03, WOOD_D)
	# the lantern on top
	b.box(Vector3(0.0, 1.5, 0.0), Vector3(0.22, 0.04, 0.22), IRON)
	b.box(Vector3(0.0, 1.62, 0.0), Vector3(0.16, 0.2, 0.16), FLAME)
	b.box(Vector3(0.0, 1.62, 0.0), Vector3(0.11, 0.21, 0.11), FLAME_L)
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			b.box(Vector3(sx * 0.08, 1.62, sz * 0.08), Vector3(0.025, 0.22, 0.025), IRON)
	b.box(Vector3(0.0, 1.75, 0.0), Vector3(0.22, 0.04, 0.22), IRON)
	b.cone(Vector3(0.0, 1.77, 0.0), 0.12, 0.1, 4, IRON, IRON_L)
	return b.build()


## street_lamp: an iron lantern on a wooden post with a stone foot (the browser's), about two metres tall.
static func street_lamp() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.1, 0.0), Vector3(0.34, 0.2, 0.34), STONE_D, 0.0, 0.0, STONE_L)
	b.box(Vector3(0.0, 0.85, 0.0), Vector3(0.12, 1.3, 0.12), WOOD_D, 0.0, 0.0, WOOD)
	# an iron bracket under the lantern
	b.box(Vector3(0.0, 1.45, 0.0), Vector3(0.32, 0.05, 0.05), IRON)
	b.box(Vector3(0.0, 1.45, 0.0), Vector3(0.05, 0.05, 0.32), IRON)
	b.box(Vector3(0.0, 1.5, 0.0), Vector3(0.26, 0.05, 0.26), IRON)
	b.box(Vector3(0.0, 1.69, 0.0), Vector3(0.2, 0.32, 0.2), FLAME)
	b.box(Vector3(0.0, 1.69, 0.0), Vector3(0.12, 0.33, 0.12), FLAME_L)
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			b.box(Vector3(sx * 0.1, 1.69, sz * 0.1), Vector3(0.03, 0.34, 0.03), IRON)
	b.box(Vector3(0.0, 1.88, 0.0), Vector3(0.3, 0.05, 0.3), IRON)
	b.cone(Vector3(0.0, 1.9, 0.0), 0.15, 0.12, 4, IRON, IRON_L)
	return b.build()


## bus_stop, the Diligens stop: a wooden post with a board carrying a horseshoe, and a low bench in front to wait on.
static func bus_stop() -> ArrayMesh:
	var b := FarmMesh.new()
	b.box(Vector3(0.0, 0.8, -0.05), Vector3(0.12, 1.6, 0.12), WOOD_D, 0.0, 0.0, WOOD)
	b.box(Vector3(0.0, 1.55, 0.0), Vector3(0.9, 0.62, 0.06), WOOD_L, 0.0, 0.0, Color("#e0b47a"))
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * 0.45, 1.55, 0.0), Vector3(0.05, 0.64, 0.08), WOOD_D)
	b.box(Vector3(0.0, 1.87, 0.0), Vector3(0.94, 0.05, 0.08), WOOD_D)
	b.box(Vector3(0.0, 1.23, 0.0), Vector3(0.94, 0.05, 0.08), WOOD_D)
	# a horseshoe, open end up for luck
	tpl(b, [".##.##.", "##...##", "##...##", "##...##", ".#####.", "..###.."], {"#": IRON_L}, -0.25, 1.82, 0.072, 0.035)
	# a low bench to wait on
	b.box(Vector3(0.0, 0.34, 0.45), Vector3(0.95, 0.07, 0.3), WOOD_L, 0.0, 0.0, Color("#e0b47a"))
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * 0.38, 0.17, 0.45), Vector3(0.08, 0.34, 0.26), WOOD_D)
	return b.build()


## parked_car (2 × 1): a two-wheeled hand cart resting on its shafts, loaded with hay, barrels or pumpkins; three colours.
static func hand_cart(v: int) -> ArrayMesh:
	var b := FarmMesh.new()
	var c: Color = [Color("#b5413a"), Color("#3b5fa6"), Color("#c89a30")][v % 3]
	# the bed
	b.box(Vector3(-0.1, 0.5, 0.0), Vector3(1.3, 0.12, 0.7), c.darkened(0.25), 0.0, 0.0, c)
	for sz in [-1.0, 1.0]:
		b.box(Vector3(-0.1, 0.68, sz * 0.33), Vector3(1.3, 0.3, 0.05), c, 0.0, 0.0, c.lightened(0.2))
	for sx in [-1.0, 1.0]:
		b.box(Vector3(-0.1 + sx * 0.62, 0.68, 0.0), Vector3(0.05, 0.3, 0.7), c.darkened(0.1), 0.0, 0.0, c.lightened(0.1))
	# the load
	if v % 3 == 0:
		b.blob(Vector3(-0.1, 0.84, 0.0), Vector3(0.62, 0.26, 0.32), 8, 4, Color("#b8902a"), Color("#f0d070"), 0.0, 0.05, 3.0)
	elif v % 3 == 1:
		for i in range(3):
			b.cylinder(Vector3(-0.55 + i * 0.4, 0.56, 0.0 if i != 1 else 0.02), 0.17, 0.17, 0.4 + (0.12 if i == 1 else 0.0), 8, WOOD_D, WOOD_L)
			b.box(Vector3(-0.55 + i * 0.4, 0.74, 0.0), Vector3(0.36, 0.03, 0.36), IRON)
	else:
		for p in [[-0.45, -0.1, 0.0], [0.0, 0.12, 0.05], [0.3, -0.05, -0.12], [-0.1, 0.0, 0.2]]:
			b.blob(Vector3(-0.1 + p[0], 0.7, p[2]), Vector3(0.2, 0.15, 0.2), 6, 3, Color("#c8501a"), Color("#f08a2a"), 0.0, 0.04)
	# the wheel and the shafts down to the ground
	wheel(b, -0.1, 0.34, 0.3, 0.42)
	wheel(b, -0.1, 0.34, 0.3, -0.42)
	b.box(Vector3(-0.1, 0.34, 0.0), Vector3(0.05, 0.05, 0.84), IRON)
	for sz in [-0.28, 0.28]:
		b.box(Vector3(0.78, 0.3, sz), Vector3(0.7, 0.05, 0.05), WOOD_D)
		b.box(Vector3(1.0, 0.12, sz), Vector3(0.05, 0.28, 0.05), WOOD_D)
	return b.build()
