class_name DungeonProps
extends RefCounted
## Props made in code, in the palette of ART.md, for the dungeon things no free pack the build sandbox could reach
## had (LICENSES.md lists them): wall caps, gates, rest stones, coffins, bones, urns, a placeholder box, and the
## flame on a torch. Primitive meshes only, so they cost nothing to load and sit next to the KayKit models without
## clashing. Replace a prop here when a pack model for it comes in; nothing else needs to change.

const KANT := Color("2b2419")
const KRYPTSTEN := Color("5a6257")
const BEN := Color("e2d6b8")
const JARN := Color("5e626c")
const TRA := Color("86582f")
const LERA := Color("8a5a3a")
const RUNBLATT := Color("38d8f0")


static func mat(albedo: Color, emissive: Color = Color.BLACK, roughness := 0.9) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = albedo
	m.roughness = roughness
	if emissive != Color.BLACK:
		m.emission_enabled = true
		m.emission = emissive
		m.emission_energy_multiplier = 1.5
	return m


static func _mesh_node(mesh: Mesh, material: Material, at: Vector3, rot_y := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = material
	mi.position = at
	mi.rotation.y = rot_y
	return mi


## The box behind every wall tile's faces: a whole 1 × 2 × 1 m block of dark stone.
const WALL_TOP := 2.0 ## the height of a wall block, m


static func wall_cap_mesh(tint: Color) -> BoxMesh:
	var box := BoxMesh.new()
	# 1 cm under the face slabs' top (dungeon_view.gd, WALL_TOP): the slab and the box must not share a plane
	box.size = Vector3(1.0, WALL_TOP - 0.01, 1.0)
	box.material = mat(KRYPTSTEN * tint * 0.55)
	return box


## An iron gate across one tile: two posts, a beam and four bars. The bars run along X; rotate the node 90° for a
## corridor that runs east–west.
static func gate(tint: Color) -> Node3D:
	var node := Node3D.new()
	var iron := mat(JARN * tint, Color.BLACK, 0.6)
	var post := BoxMesh.new()
	post.size = Vector3(0.1, 2.0, 0.1)
	var beam := BoxMesh.new()
	beam.size = Vector3(1.0, 0.1, 0.1)
	var bar := CylinderMesh.new()
	bar.top_radius = 0.03
	bar.bottom_radius = 0.03
	bar.height = 1.9
	bar.radial_segments = 6
	node.add_child(_mesh_node(post, iron, Vector3(-0.45, 1.0, 0.0)))
	node.add_child(_mesh_node(post, iron, Vector3(0.45, 1.0, 0.0)))
	node.add_child(_mesh_node(beam, iron, Vector3(0.0, 1.95, 0.0)))
	for x in [-0.3, -0.1, 0.1, 0.3]:
		node.add_child(_mesh_node(bar, iron, Vector3(x, 0.95, 0.0)))
	return node


## A rest stone: a tapered six-sided runestone with a rune band that glows once it is lit.
static func rest_stone(lit: bool, tint: Color) -> Node3D:
	var node := Node3D.new()
	var stone := CylinderMesh.new()
	stone.top_radius = 0.25
	stone.bottom_radius = 0.4
	stone.height = 1.4
	stone.radial_segments = 6
	node.add_child(_mesh_node(stone, mat(KRYPTSTEN * tint * 1.1), Vector3(0.0, 0.7, 0.0)))
	var band := CylinderMesh.new()
	band.top_radius = 0.3
	band.bottom_radius = 0.33
	band.height = 0.25
	band.radial_segments = 6
	var band_mat := mat(RUNBLATT * (1.0 if lit else 0.35), RUNBLATT if lit else Color.BLACK, 0.4)
	node.add_child(_mesh_node(band, band_mat, Vector3(0.0, 0.95, 0.0)))
	return node


## A stone coffin with a lid, turned a little by its variant.
static func coffin(variant: int, tint: Color) -> Node3D:
	var node := Node3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.62, 0.5, 0.95)
	var lid := BoxMesh.new()
	lid.size = Vector3(0.7, 0.1, 1.02)
	var band := BoxMesh.new()
	band.size = Vector3(0.72, 0.06, 0.08)
	node.add_child(_mesh_node(box, mat(KRYPTSTEN * tint * 0.9), Vector3(0.0, 0.25, 0.0)))
	node.add_child(_mesh_node(lid, mat(BEN * tint * 0.8), Vector3(0.0, 0.55, 0.0)))
	node.add_child(_mesh_node(band, mat(JARN, Color.BLACK, 0.6), Vector3(0.0, 0.3, 0.3)))
	node.add_child(_mesh_node(band, mat(JARN, Color.BLACK, 0.6), Vector3(0.0, 0.3, -0.3)))
	node.rotation.y = [0.0, PI / 2.0, PI / 7.0][variant % 3]
	return node


## A heap of bones flat on the floor: three bones and a round skull.
static func bones(variant: int, tint: Color) -> Node3D:
	var node := Node3D.new()
	var bone := CapsuleMesh.new()
	bone.radius = 0.04
	bone.height = 0.42
	bone.radial_segments = 6
	var bone_mat := mat(BEN * tint)
	for i in range(3):
		var mi := _mesh_node(bone, bone_mat, Vector3(-0.15 + 0.15 * i, 0.04, 0.1 - 0.12 * i))
		mi.rotation = Vector3(PI / 2.0, 0.4 * i + variant, 0.0)
		node.add_child(mi)
	var skull := SphereMesh.new()
	skull.radius = 0.12
	skull.height = 0.22
	skull.radial_segments = 10
	skull.rings = 6
	node.add_child(_mesh_node(skull, bone_mat, Vector3(0.2, 0.11, -0.2)))
	return node


## A clay urn: a revolved profile from two tapered cylinders.
static func urn(variant: int, tint: Color) -> Node3D:
	var node := Node3D.new()
	var body := CylinderMesh.new()
	body.top_radius = 0.18
	body.bottom_radius = 0.26
	body.height = 0.5
	body.radial_segments = 10
	var neck := CylinderMesh.new()
	neck.top_radius = 0.2
	neck.bottom_radius = 0.14
	neck.height = 0.16
	neck.radial_segments = 10
	var clay := mat(LERA * tint * (0.85 + 0.1 * (variant % 3)))
	node.add_child(_mesh_node(body, clay, Vector3(0.0, 0.25, 0.0)))
	node.add_child(_mesh_node(neck, clay, Vector3(0.0, 0.58, 0.0)))
	return node


## Something the server put here that has no model yet: a small box in the dungeon's colour.
static func placeholder(tint: Color) -> Node3D:
	var node := Node3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.6, 0.6, 0.6)
	node.add_child(_mesh_node(box, mat(KRYPTSTEN * tint), Vector3(0.0, 0.3, 0.0)))
	return node


static var _glow: GradientTexture2D


## A soft radial glow, made once: white in the middle, clear at the edge (the flames and sparks are tinted with it).
static func _glow_texture() -> GradientTexture2D:
	if _glow == null:
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 1, 1))
		g.set_color(1, Color(1, 1, 1, 0))
		g.add_point(0.35, Color(1, 1, 1, 0.75))
		var t := GradientTexture2D.new()
		t.gradient = g
		t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5)
		t.fill_to = Vector2(1.0, 0.5)
		t.width = 64
		t.height = 64
		_glow = t
	return _glow


## A flame: a glowing billboard, and on the higher presets a few rising sparks.
static func flame(colour: Color, size: float, particles: int) -> Node3D:
	var node := Node3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(size * 0.8, size)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.albedo_texture = _glow_texture()
	m.albedo_color = colour
	m.emission_enabled = true
	m.emission = colour
	m.emission_energy_multiplier = 1.5
	var quad_node := _mesh_node(quad, m, Vector3(0.0, size * 0.5, 0.0))
	quad_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF # a flame throws no shadow of its own torch
	node.add_child(quad_node)
	if particles > 0:
		var p := GPUParticles3D.new()
		p.amount = particles
		p.lifetime = 0.9
		p.local_coords = true
		var pm := ParticleProcessMaterial.new()
		pm.direction = Vector3(0, 1, 0)
		pm.spread = 25.0
		pm.initial_velocity_min = 0.3
		pm.initial_velocity_max = 0.7
		pm.gravity = Vector3(0, 0.4, 0)
		pm.scale_min = 0.5
		pm.scale_max = 1.0
		pm.color = colour
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		pm.emission_sphere_radius = size * 0.15
		p.process_material = pm
		var spark := QuadMesh.new()
		spark.size = Vector2(0.06, 0.06)
		var sm := StandardMaterial3D.new()
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		sm.albedo_texture = _glow_texture()
		sm.vertex_color_use_as_albedo = true
		sm.emission_enabled = true
		sm.emission = colour
		sm.emission_energy_multiplier = 2.0
		spark.material = sm
		p.draw_pass_1 = spark
		p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		p.position = Vector3(0.0, size * 0.4, 0.0)
		node.add_child(p)
	return node
