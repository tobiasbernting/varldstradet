class_name FarmMesh
extends RefCounted
## A tiny low-poly mesh builder for the farm's generated props (trees, bushes, flowers, furniture, lamps): flat
## shaded triangles with vertex colours in the ART.md palette. The UV's x is the *foliage mask*: 1 where the
## season's leaf colour may replace the colour (farm_prop.gdshader), 0 elsewhere. Colours are given the way the
## palette is written (sRGB, as `Color("#64a848")`) and stored linear, as the shader reads them.

var _v := PackedVector3Array()
var _n := PackedVector3Array()
var _c := PackedColorArray()
var _uv := PackedVector2Array()


static func lin(c: Color, fol := 0.0) -> Color:
	var l := c.srgb_to_linear()
	return Color(l.r, l.g, l.b, fol)


func tri(a: Vector3, b: Vector3, c: Vector3, ca: Color, cb: Color, cc: Color, fol := 0.0) -> void:
	var n := (b - a).cross(c - a)
	if n.length_squared() < 0.0000001:
		return
	n = n.normalized()
	# (Godot draws the clockwise side of a triangle: the shapes below are written counter-clockwise seen from outside,
	# so the corners go in reversed, and the normal stays the outward one)
	for p in [[a, ca], [c, cc], [b, cb]]:
		_v.append(p[0])
		_n.append(n)
		_c.append(lin(p[1], 1.0))
		_uv.append(Vector2(fol, 0.0))


func quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Color, fol := 0.0) -> void:
	tri(a, b, c, col, col, col, fol)
	tri(a, c, d, col, col, col, fol)


## An axis-aligned box (no bottom), centred on `center` horizontally, its base at center.y - size.y / 2.
## `yaw` turns it round its own middle.
func box(center: Vector3, size: Vector3, col: Color, fol := 0.0, yaw := 0.0, top_col := Color(-1, 0, 0)) -> void:
	var h := size * 0.5
	var basis := Basis(Vector3.UP, yaw)
	var p := func(x: float, y: float, z: float) -> Vector3: return center + basis * Vector3(x * h.x, y * h.y, z * h.z)
	var top := col if top_col.r < 0.0 else top_col
	var side_d := col.darkened(0.12)
	var side_l := col.lightened(0.04)
	quad(p.call(-1, 1, 1), p.call(1, 1, 1), p.call(1, 1, -1), p.call(-1, 1, -1), top, fol) # top
	quad(p.call(-1, 1, 1), p.call(-1, -1, 1), p.call(1, -1, 1), p.call(1, 1, 1), side_l, fol) # +z (south)
	quad(p.call(1, 1, -1), p.call(1, -1, -1), p.call(-1, -1, -1), p.call(-1, 1, -1), side_d, fol) # -z
	quad(p.call(1, 1, 1), p.call(1, -1, 1), p.call(1, -1, -1), p.call(1, 1, -1), side_l, fol) # +x
	quad(p.call(-1, 1, -1), p.call(-1, -1, -1), p.call(-1, -1, 1), p.call(-1, 1, 1), side_d, fol) # -x


## A cone (or a frustum when r_top > 0) standing on `base`, with `segs` sides and a colour that fades from the foot to the tip.
func cone(base: Vector3, r: float, height: float, segs: int, col_foot: Color, col_tip: Color, fol := 0.0, r_top := 0.0, twist := 0.0) -> void:
	for i in range(segs):
		var a0 := TAU * float(i) / segs + twist
		var a1 := TAU * float(i + 1) / segs + twist
		var b0 := base + Vector3(cos(a0) * r, 0.0, sin(a0) * r)
		var b1 := base + Vector3(cos(a1) * r, 0.0, sin(a1) * r)
		var tip := base + Vector3(0.0, height, 0.0)
		if r_top <= 0.0:
			tri(b1, b0, tip, col_foot, col_foot, col_tip, fol)
		else:
			var t0 := tip + Vector3(cos(a0) * r_top, 0.0, sin(a0) * r_top)
			var t1 := tip + Vector3(cos(a1) * r_top, 0.0, sin(a1) * r_top)
			tri(b1, b0, t0, col_foot, col_foot, col_tip, fol)
			tri(b1, t0, t1, col_foot, col_tip, col_tip, fol)
	if r_top > 0.0:
		var tip2 := base + Vector3(0.0, height, 0.0)
		for i in range(segs):
			var a0 := TAU * float(i) / segs + twist
			var a1 := TAU * float(i + 1) / segs + twist
			tri(tip2, tip2 + Vector3(cos(a1) * r_top, 0.0, sin(a1) * r_top), tip2 + Vector3(cos(a0) * r_top, 0.0, sin(a0) * r_top), col_tip, col_tip, col_tip, fol)


## A rough ball: `rings` bands of `segs` sides, jittered by `jitter` of the radius (a blob of leaves), the colour
## brighter at the top.
func blob(center: Vector3, radii: Vector3, segs: int, rings: int, col_low: Color, col_high: Color, fol := 0.0, jitter := 0.12, seed_v := 1.0) -> void:
	var pts: Array = []
	for r in range(rings + 1):
		var row: Array = []
		var phi := PI * float(r) / rings
		for s in range(segs):
			var th := TAU * float(s) / segs + (0.5 * TAU / segs if r % 2 == 1 else 0.0)
			var j := 1.0 + jitter * (_hash(seed_v + r * 7.31 + s * 3.17) - 0.5) * 2.0
			if r == 0 or r == rings:
				j = 1.0
			row.append(center + Vector3(sin(phi) * cos(th) * radii.x * j, cos(phi) * radii.y * j, sin(phi) * sin(th) * radii.z * j))
		pts.append(row)
	for r in range(rings):
		for s in range(segs):
			var s2 := (s + 1) % segs
			var a: Vector3 = pts[r][s]
			var b: Vector3 = pts[r][s2]
			var c: Vector3 = pts[r + 1][s]
			var d: Vector3 = pts[r + 1][s2]
			var k0 := clampf((a.y - center.y) / maxf(0.001, radii.y) * 0.5 + 0.5, 0.0, 1.0)
			var k1 := clampf((c.y - center.y) / maxf(0.001, radii.y) * 0.5 + 0.5, 0.0, 1.0)
			var ca := col_low.lerp(col_high, k0)
			var cc := col_low.lerp(col_high, k1)
			if r == 0:
				tri(a, d, c, ca, cc, cc, fol)
			elif r == rings - 1:
				tri(a, b, c, ca, ca, cc, fol)
			else:
				tri(a, d, c, ca, cc, cc, fol)
				tri(a, b, d, ca, ca, cc, fol)


## A cylinder (or frustum) on `base`.
func cylinder(base: Vector3, r_bottom: float, r_top: float, height: float, segs: int, col_b: Color, col_t: Color, fol := 0.0, cap := true) -> void:
	for i in range(segs):
		var a0 := TAU * float(i) / segs
		var a1 := TAU * float(i + 1) / segs
		var b0 := base + Vector3(cos(a0) * r_bottom, 0.0, sin(a0) * r_bottom)
		var b1 := base + Vector3(cos(a1) * r_bottom, 0.0, sin(a1) * r_bottom)
		var t0 := base + Vector3(cos(a0) * r_top, height, sin(a0) * r_top)
		var t1 := base + Vector3(cos(a1) * r_top, height, sin(a1) * r_top)
		tri(b1, b0, t0, col_b, col_b, col_t, fol)
		tri(b1, t0, t1, col_b, col_t, col_t, fol)
		if cap and r_top > 0.0:
			tri(base + Vector3(0.0, height, 0.0), t1, t0, col_t, col_t, col_t, fol)


## A flat upright blade or petal: a triangle from a foot to a tip with a width.
func blade(foot: Vector3, tip: Vector3, width: float, col_foot: Color, col_tip: Color, fol := 0.0, yaw := 0.0) -> void:
	var side := Basis(Vector3.UP, yaw) * Vector3(width * 0.5, 0.0, 0.0)
	tri(foot - side, foot + side, tip, col_foot, col_foot, col_tip, fol)
	tri(foot + side, foot - side, tip, col_foot, col_foot, col_tip, fol) # (both ways round: seen from either side)


func build() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if _v.is_empty():
		return mesh
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = _v
	arrays[Mesh.ARRAY_NORMAL] = _n
	arrays[Mesh.ARRAY_COLOR] = _c
	arrays[Mesh.ARRAY_TEX_UV] = _uv
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


static func _hash(v: float) -> float:
	return fposmod(sin(v * 12.9898) * 43758.5453, 1.0)
