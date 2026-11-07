class_name VoxelBody
extends RefCounted
## A creature's 3D body, extruded from its own pixel art (the `--people3d` trial, ART.md "Creatures in 3D"): every
## opaque pixel of a sprite frame becomes a box `pixel_m` wide and tall, and its depth follows a rounded profile so
## the body is a pillow and not a slab. On each row the opaque span (left..right, centre c, half-width h) gives the
## pixel at x a half-depth of DEPTH_K * h * sqrt(1 - ((x - c) / h)^2) pixels (at least 0.5: a row one pixel wide gets
## 0.5), the same down each column, and the pixel takes the shallower of the two, never more than DEPTH_MAX. Faces
## between two neighbouring boxes are only emitted where the neighbour is shorter (or missing), so the
## mesh stays small. The vertex colour is the pixel's colour, the pixel-art outline included.
##
## The mesh stands on the origin: x centred on the frame, y up from the feet row (the bottom of the frame), z the
## depth, the creature facing +x (the sprites face right). One frame is built once and every actor of the species
## shares the `ArrayMesh` (`frames()`); each actor has its own `ShaderMaterial` (`material()`), whose uniforms carry
## the flash, the tint and the night lift.

const SHADER := "res://assets/shaders/voxel_body.gdshader"
## How round the pillow is: the half-depth of a row's middle pixel in half-widths of the row.
const DEPTH_K := 0.5
## ... and no body is thicker than this (half-depth, pixels), however long its rows are.
const DEPTH_MAX := 3.5
## The column profile is this much rounder than the row's (columns are shorter than rows, so it would be thin).
const COLUMN_K := 1.6
const ALPHA_MIN := 0.5
## A pixel at least this dark is outline: kept on the front and back faces (the pixel art's look), but the faces
## that stand out of the body (top, sides, underside) take the colour of the body behind it, or the dark rim would
## cap every creature in black when seen from above.
const OUTLINE_LUMA := 0.22
const OUTLINE_REACH := 3
## No pixel of a row at least FLOOR_ROW pixels wide is thinner than FLOOR_HALF (half-depth, pixels): a thin row
## (a wolf's back) still has a body.
const FLOOR_HALF := 1.5
const FLOOR_ROW := 3
## Baked per-face shading, so the volume reads under flat light: top, front and back, sides, underside.
const SHADE_TOP := 1.06
const SHADE_SIDE := 0.82
const SHADE_BOTTOM := 0.7

static var _cache: Dictionary = {} ## "sheet:frame" -> ArrayMesh
static var _sizes: Dictionary = {} ## sheet -> Vector2 (width, height in metres)
static var _shader: Shader = null
static var _vfix := -1.0


## The mesh of the frame `rect` of `image`, a pixel being `pixel_m` metres.
static func build(image: Image, rect: Rect2i, pixel_m: float) -> ArrayMesh:
	var w := rect.size.x
	var h := rect.size.y
	var half := PackedFloat32Array() # per pixel: the half-depth in metres, 0 where the pixel is empty
	half.resize(w * h)
	var cols := PackedColorArray()
	cols.resize(w * h)
	var row_w := PackedInt32Array()
	row_w.resize(h)
	for y in range(h):
		var l := -1
		var r := -1
		for x in range(w):
			var c := image.get_pixel(rect.position.x + x, rect.position.y + y)
			if c.a >= ALPHA_MIN:
				cols[y * w + x] = Color(c.r, c.g, c.b, 1.0).srgb_to_linear()
				if l < 0:
					l = x
				r = x
				half[y * w + x] = -1.0 # opaque, depth to come
		if l < 0:
			continue
		row_w[y] = r - l + 1
		var ctr := (l + r) / 2.0
		var hw := (r - l + 1) / 2.0
		for x in range(l, r + 1):
			if half[y * w + x] < 0.0:
				var u := (x - ctr) / hw
				half[y * w + x] = DEPTH_K * hw * sqrt(maxf(0.0, 1.0 - u * u)) # (pixels; the column's profile and the clamp below)
	# the same profile down each column, and the body is as deep as the shallower of the two: a pillow rounded
	# in both directions, so a wide row under a narrow one does not stand out as a ledge
	for x in range(w):
		var t := -1
		var b := -1
		for y in range(h):
			if half[y * w + x] != 0.0:
				if t < 0:
					t = y
				b = y
		if t < 0:
			continue
		var cy := (t + b) / 2.0
		var hh := (b - t + 1) / 2.0
		for y in range(t, b + 1):
			if half[y * w + x] != 0.0:
				var v := (y - cy) / hh
				var colk := DEPTH_K * hh * sqrt(maxf(0.0, 1.0 - v * v))
				half[y * w + x] = clampf(minf(half[y * w + x], colk * COLUMN_K), FLOOR_HALF if row_w[y] >= FLOOR_ROW else 0.5, DEPTH_MAX) * pixel_m
	var vs := PackedVector3Array()
	var ns := PackedVector3Array()
	var cs := PackedColorArray()
	var idx := PackedInt32Array()
	for y in range(h):
		for x in range(w):
			var d := half[y * w + x]
			if d <= 0.0:
				continue
			var col := cols[y * w + x]
			var dark := _is_dark(col)
			var x0 := (x - w / 2.0) * pixel_m
			var x1 := x0 + pixel_m
			var y0 := (h - 1 - y) * pixel_m
			var y1 := y0 + pixel_m
			# front and back
			_quad(vs, ns, cs, idx, [Vector3(x0, y0, d), Vector3(x1, y0, d), Vector3(x1, y1, d), Vector3(x0, y1, d)], Vector3(0, 0, 1), col)
			_quad(vs, ns, cs, idx, [Vector3(x0, y0, -d), Vector3(x1, y0, -d), Vector3(x1, y1, -d), Vector3(x0, y1, -d)], Vector3(0, 0, -1), col)
			# the four sides, over the depth the neighbour does not cover
			for side in range(4):
				var nx := x + (1 if side == 0 else (-1 if side == 1 else 0))
				var ny := y + (-1 if side == 2 else (1 if side == 3 else 0))
				var dn := 0.0
				if nx >= 0 and nx < w and ny >= 0 and ny < h:
					dn = half[ny * w + nx]
				if dn >= d:
					continue
				var scol := col
				if dark:
					# the colour of the first lighter pixel inward (opposite to the face's direction)
					var step := Vector2i(-1 if side == 0 else (1 if side == 1 else 0), 1 if side == 2 else (-1 if side == 3 else 0))
					for k in range(1, OUTLINE_REACH + 1):
						var ix := x + step.x * k
						var iy := y + step.y * k
						if ix < 0 or ix >= w or iy < 0 or iy >= h or half[iy * w + ix] <= 0.0:
							break
						if not _is_dark(cols[iy * w + ix]):
							scol = cols[iy * w + ix]
							break
				var spans: Array = [[-d, d]] if dn <= 0.0 else [[dn, d], [-d, -dn]]
				for s in spans:
					var za: float = s[0]
					var zb: float = s[1]
					match side:
						0: _quad(vs, ns, cs, idx, [Vector3(x1, y0, za), Vector3(x1, y0, zb), Vector3(x1, y1, zb), Vector3(x1, y1, za)], Vector3(1, 0, 0), scol)
						1: _quad(vs, ns, cs, idx, [Vector3(x0, y0, za), Vector3(x0, y0, zb), Vector3(x0, y1, zb), Vector3(x0, y1, za)], Vector3(-1, 0, 0), scol)
						2: _quad(vs, ns, cs, idx, [Vector3(x0, y1, za), Vector3(x1, y1, za), Vector3(x1, y1, zb), Vector3(x0, y1, zb)], Vector3(0, 1, 0), scol)
						_: _quad(vs, ns, cs, idx, [Vector3(x0, y0, za), Vector3(x1, y0, za), Vector3(x1, y0, zb), Vector3(x0, y0, zb)], Vector3(0, -1, 0), scol)
	var mesh := ArrayMesh.new()
	if vs.is_empty():
		return mesh
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vs
	arrays[Mesh.ARRAY_NORMAL] = ns
	arrays[Mesh.ARRAY_COLOR] = cs
	arrays[Mesh.ARRAY_INDEX] = idx
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


static func _is_dark(linear: Color) -> bool:
	return linear.linear_to_srgb().get_luminance() < OUTLINE_LUMA


## One flat face: four corners in a cyclic order, wound so that it faces `n` (Godot's front is clockwise).
static func _quad(vs: PackedVector3Array, ns: PackedVector3Array, cs: PackedColorArray, idx: PackedInt32Array, p: Array, n: Vector3, col: Color) -> void:
	var o := vs.size()
	var shade := SHADE_TOP if n.y > 0.5 else (SHADE_BOTTOM if n.y < -0.5 else (SHADE_SIDE if absf(n.x) > 0.5 else 1.0))
	col = Color(col.r * shade, col.g * shade, col.b * shade, 1.0)
	for q in p:
		vs.append(q)
		ns.append(n)
		cs.append(col)
	var p0: Vector3 = p[0]
	var ccw: bool = (Vector3(p[1]) - p0).cross(Vector3(p[2]) - p0).dot(n) > 0.0
	if ccw:
		idx.append_array(PackedInt32Array([o, o + 2, o + 1, o, o + 3, o + 2]))
	else:
		idx.append_array(PackedInt32Array([o, o + 1, o + 2, o, o + 2, o + 3]))


## The frames of a sheet of the atlas (`mob_skelett`, `animal_cow_baby_jul`, ...) as meshes, one per named frame in
## the sheet's order, built once; empty when the sheet or its picture is missing.
static func frames(sheet_name: String) -> Array[ArrayMesh]:
	var out: Array[ArrayMesh] = []
	var s := Data.sheet(sheet_name)
	if s.is_empty():
		return out
	var names: Array = s.get("frames", [])
	var fw := int(s.get("frame_w", 16))
	var fh := int(s.get("frame_h", 16))
	var px := 1.0 / float(Data.atlas.get("pixel", 16))
	var img: Image = null ## the sheet's picture, read once and only when a frame is missing from the cache
	for i in range(names.size()):
		var key := "%s:%s" % [sheet_name, names[i]]
		if not _cache.has(key):
			if img == null:
				var path := "res://assets/sprites/" + str(s.get("file", ""))
				var tex: Texture2D = load(path) if ResourceLoader.exists(path) else null
				if tex == null:
					return out
				img = tex.get_image()
				if img == null:
					return out
				if img.is_compressed():
					img.decompress()
			var col := i % int(s.get("columns", 1))
			var row := i / int(s.get("columns", 1))
			_cache[key] = build(img, Rect2i(col * fw, row * fh, fw, fh), px)
		out.append(_cache[key])
	return out


## A material of the voxel shader for one actor (the flash, tint and night uniforms are its own).
static func material() -> ShaderMaterial:
	if _shader == null:
		_shader = load(SHADER)
		_vfix = 1.0 if RenderingServer.get_current_rendering_method() == "gl_compatibility" else 0.0
	var m := ShaderMaterial.new()
	m.shader = _shader
	m.set_shader_parameter("vcol_fix", _vfix)
	return m
