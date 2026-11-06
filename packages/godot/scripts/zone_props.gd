class_name ZoneProps
extends RefCounted
## The decor of a run's zones (the seven biomes of GAME.md section 1.1 borrow the look of dungeons whose decor the dungeon
## view has no models for yet): gravestones, skull piles, mine carts, coral, glowing mushrooms, ice crystals, braziers and
## the rest, made in code with the farm's mesh builder (farm_mesh.gd, vertex colours in the ART.md palette) and drawn with one
## shared vertex-colour material that the dungeon view owns. Things that shine have a flat glow (an additive billboard) and, on
## Mellan and Hög, a light from LIGHTS; Låg gets the glow only (ART.md, "Quality presets"). Primitive meshes, so they cost
## nothing to load. A kind that is not here gets the dungeon view's placeholder box.

const STONE := Color("#7c7d78")
const STONE_DARK := Color("#5f625f")
const BONE := Color("#e2d6b8")
const WOOD := Color("#86582f")
const IRON := Color("#5e626c")
const GOLD := Color("#e8b830")
const EMBER := Color("#ffa040")
const MOSS := Color("#4f8231")
const ICE := Color("#a8dcf0")
const WHITE := Color("#f2f6fa")

## kind -> [colour, range m, energy, height m, flicker]: the light a prop carries (none on Låg).
const LIGHTS := {
	"saga_fairylight": [Color(1.0, 0.82, 0.9), 3.2, 0.9, 1.3, 0.3],
	"saga_ghostlight": [Color(0.6, 1.0, 0.8), 3.4, 0.9, 1.1, 0.35],
	"saga_minelamp": [Color(1.0, 0.8, 0.45), 4.0, 1.1, 1.5, 0.25],
	"saga_goldpile": [Color(1.0, 0.85, 0.4), 2.4, 0.6, 0.5, 0.1],
	"saga_pearl": [Color(0.75, 0.9, 1.0), 3.0, 0.8, 0.6, 0.15],
	"saga_glowshroom": [Color(0.7, 0.55, 1.0), 3.2, 0.9, 0.8, 0.2],
	"saga_icecrystal": [Color(0.65, 0.88, 1.0), 3.4, 0.8, 0.8, 0.1],
	"saga_brazier": [Color(1.0, 0.6, 0.25), 5.0, 1.8, 1.1, 0.35],
	"saga_lavacrack": [Color(1.0, 0.4, 0.15), 2.8, 0.9, 0.3, 0.3],
}


static func _hash(a: float, b: float) -> float:
	return fposmod(sin(a * 12.9898 + b * 78.233) * 43758.5453, 1.0)


static func _node(mesh: Mesh, mat: Material, at := Vector3.ZERO, rot_y := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = at
	mi.rotation.y = rot_y
	return mi


## The one material every ZoneProps mesh is drawn with: lit, and coloured by the vertices.
static func material() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.95
	return m


## A flat glow (additive billboard) in a colour, `size` metres across, `y` up.
static func glow(colour: Color, size: float, y: float, energy := 1.2) -> Node3D:
	var g := DungeonProps.flame(colour, size, 0)
	g.position = Vector3(0.0, y - size * 0.5, 0.0)
	var q := g.get_child(0) as MeshInstance3D
	if q != null and q.material_override is StandardMaterial3D:
		(q.material_override as StandardMaterial3D).emission_energy_multiplier = energy
	return g


## The prop for an object kind, or null when this file has no model for it. `v` is the object's variant (a turn and a size).
static func make(kind: String, v: int, mat: Material) -> Node3D:
	var b := FarmMesh.new()
	var node := Node3D.new()
	var turn := float(v % 4) * 0.7 + 0.3
	match kind:
		"saga_fairylight":
			# three tiny lamps floating at different heights, and a soft glow round them
			for i in range(3):
				var a := TAU * float(i) / 3.0
				b.blob(Vector3(cos(a) * 0.16, 1.0 + 0.16 * i, sin(a) * 0.16), Vector3.ONE * 0.05, 5, 2, Color("#ffd0e0"), Color("#fff6f0"), 0.0, 0.0)
			node.add_child(glow(Color(1.0, 0.8, 0.9), 0.8, 1.15))
		"saga_cobweb":
			# a flat web on the floor: six threads and two rings
			for i in range(6):
				var a := TAU * float(i) / 6.0 + turn
				b.box(Vector3(cos(a) * 0.3, 0.012, sin(a) * 0.3), Vector3(0.6, 0.012, 0.015), WHITE.darkened(0.1), 0.0, -a)
			for r in [0.18, 0.34]:
				for i in range(6):
					var a0 := TAU * float(i) / 6.0 + turn + 0.52
					b.box(Vector3(cos(a0) * r, 0.014, sin(a0) * r), Vector3(r * 0.9, 0.01, 0.012), WHITE.darkened(0.15), 0.0, -a0 + PI * 0.5)
		"saga_gravestone":
			b.box(Vector3(0.0, 0.4, 0.0), Vector3(0.56, 0.8, 0.14), STONE, 0.0, 0.0, STONE.lightened(0.1))
			b.blob(Vector3(0.0, 0.8, 0.0), Vector3(0.28, 0.14, 0.07), 6, 2, STONE, STONE.lightened(0.12), 0.0, 0.0)
			b.box(Vector3(0.0, 0.5, 0.075), Vector3(0.05, 0.28, 0.02), STONE_DARK, 0.0)
			b.box(Vector3(0.0, 0.56, 0.075), Vector3(0.2, 0.05, 0.02), STONE_DARK, 0.0)
			b.box(Vector3(0.0, 0.06, 0.0), Vector3(0.7, 0.12, 0.34), MOSS.darkened(0.2), 0.0, 0.0, MOSS)
		"saga_skullpile":
			for i in range(5):
				var a := TAU * float(i) / 5.0 + turn
				var r := 0.0 if i == 0 else 0.2
				b.blob(Vector3(cos(a) * r, 0.1 + (0.12 if i == 0 else 0.0), sin(a) * r), Vector3(0.12, 0.1, 0.11), 6, 3, BONE.darkened(0.2), BONE.lightened(0.05), 0.0, 0.05, float(i))
				b.box(Vector3(cos(a) * r, 0.1 + (0.12 if i == 0 else 0.0), sin(a) * r + 0.06), Vector3(0.12, 0.04, 0.03), Color("#1b1712"), 0.0)
			for i in range(3):
				var a := TAU * float(i) / 3.0 + 0.5
				b.box(Vector3(cos(a) * 0.36, 0.04, sin(a) * 0.36), Vector3(0.28, 0.05, 0.05), BONE, 0.0, a)
		"saga_ghostlight":
			# a pale ghost: a tall droplet with two dark eyes and a tail, floating
			b.blob(Vector3(0.0, 1.0, 0.0), Vector3(0.2, 0.26, 0.2), 7, 4, Color("#9fe8c8"), Color("#e8fff4"), 0.0, 0.03, 2.0)
			b.cone(Vector3(0.0, 0.5, 0.0), 0.17, 0.5, 7, Color("#6fcfa8"), Color("#9fe8c8"), 0.0)
			b.box(Vector3(-0.07, 1.05, 0.17), Vector3(0.05, 0.07, 0.03), Color("#143028"), 0.0)
			b.box(Vector3(0.07, 1.05, 0.17), Vector3(0.05, 0.07, 0.03), Color("#143028"), 0.0)
			node.add_child(glow(Color(0.6, 1.0, 0.8), 1.2, 1.0, 1.1))
		"saga_deadtree":
			var col := Color("#5a4a3c")
			b.cylinder(Vector3.ZERO, 0.2, 0.09, 1.7, 6, col.darkened(0.2), col, 0.0)
			for i in range(5):
				var a := TAU * (float(i) + _hash(float(v), float(i))) / 5.0
				var y := 0.7 + 0.22 * i
				b.blade(Vector3(0.0, y, 0.0), Vector3(cos(a) * 0.75, y + 0.45, sin(a) * 0.75), 0.1, col.darkened(0.15), col.lightened(0.05), 0.0, a)
			b.blade(Vector3(0.0, 1.6, 0.0), Vector3(0.1, 2.1, 0.05), 0.09, col, col.lightened(0.1), 0.0, 0.0)
		"saga_minecart":
			var wood := WOOD.darkened(0.1)
			b.box(Vector3(0.0, 0.45, 0.0), Vector3(0.8, 0.45, 0.55), IRON.darkened(0.1), 0.0, 0.0, IRON.darkened(0.3))
			b.box(Vector3(0.0, 0.7, 0.0), Vector3(0.88, 0.06, 0.62), IRON, 0.0)
			for sx in [-0.28, 0.28]:
				for sz in [-0.3, 0.3]:
					b.box(Vector3(sx, 0.14, sz), Vector3(0.22, 0.22, 0.05), IRON.darkened(0.3), 0.0)
			b.blob(Vector3(0.0, 0.75, 0.0), Vector3(0.34, 0.14, 0.22), 6, 3, Color("#6a5a4a"), GOLD.darkened(0.1), 0.0, 0.15, 4.0)
			b.box(Vector3(0.0, 0.02, 0.0), Vector3(1.0, 0.04, 0.1), wood, 0.0)
		"saga_goldpile":
			b.blob(Vector3(0.0, 0.14, 0.0), Vector3(0.45, 0.28, 0.4), 7, 3, GOLD.darkened(0.25), GOLD.lightened(0.2), 0.0, 0.12, 6.0)
			for i in range(6):
				var a := TAU * float(i) / 6.0 + 0.4
				b.cylinder(Vector3(cos(a) * 0.5, 0.0, sin(a) * 0.45), 0.07, 0.07, 0.025, 6, GOLD, GOLD.lightened(0.15), 0.0)
			node.add_child(glow(Color(1.0, 0.85, 0.4), 0.8, 0.55, 0.9))
		"saga_dwarfstatue":
			b.box(Vector3(0.0, 0.15, 0.0), Vector3(0.7, 0.3, 0.7), STONE_DARK, 0.0, 0.0, STONE)
			b.box(Vector3(0.0, 0.62, 0.0), Vector3(0.36, 0.7, 0.26), STONE, 0.0, 0.0, STONE.lightened(0.08))
			b.blob(Vector3(0.0, 1.12, 0.0), Vector3(0.17, 0.17, 0.16), 6, 3, STONE, STONE.lightened(0.12), 0.0, 0.0)
			b.cone(Vector3(0.0, 0.95, 0.12), 0.14, 0.38, 6, STONE, STONE.darkened(0.1), 0.0, 0.02)
			b.cone(Vector3(0.0, 1.22, 0.0), 0.2, 0.2, 6, STONE_DARK, STONE, 0.0, 0.0)
			b.box(Vector3(0.26, 0.9, 0.05), Vector3(0.06, 0.6, 0.06), WOOD, 0.0)
			b.box(Vector3(0.26, 1.22, 0.05), Vector3(0.26, 0.14, 0.12), IRON, 0.0)
		"saga_minelamp":
			b.cylinder(Vector3.ZERO, 0.05, 0.04, 1.4, 5, WOOD.darkened(0.2), WOOD, 0.0)
			b.box(Vector3(0.0, 1.5, 0.0), Vector3(0.22, 0.26, 0.22), Color("#ffd98a"), 0.0)
			b.cone(Vector3(0.0, 1.62, 0.0), 0.2, 0.12, 4, IRON, IRON.lightened(0.1), 0.0, 0.0)
			node.add_child(glow(Color(1.0, 0.8, 0.45), 0.9, 1.5))
		"saga_coral":
			var cols: Array = [Color("#e86a8a"), Color("#f0884a"), Color("#c85ac8")]
			for i in range(5):
				var a := TAU * float(i) / 5.0 + turn
				var c: Color = cols[i % cols.size()]
				b.cone(Vector3(cos(a) * 0.18, 0.0, sin(a) * 0.18), 0.1, 0.5 + 0.12 * (i % 3), 5, c.darkened(0.2), c.lightened(0.15), 0.0, 0.03)
			b.blob(Vector3(0.0, 0.08, 0.0), Vector3(0.38, 0.1, 0.34), 6, 2, Color("#5a6a78"), Color("#7a8a98"), 0.0, 0.1, 3.0)
		"saga_anchor":
			b.box(Vector3(0.0, 0.7, 0.0), Vector3(0.09, 1.3, 0.09), IRON, 0.0)
			b.box(Vector3(0.0, 1.1, 0.0), Vector3(0.5, 0.08, 0.08), IRON, 0.0)
			b.box(Vector3(0.0, 1.38, 0.0), Vector3(0.18, 0.18, 0.08), IRON.lightened(0.1), 0.0)
			b.box(Vector3(-0.3, 0.2, 0.0), Vector3(0.3, 0.09, 0.09), IRON, 0.0, 0.5)
			b.box(Vector3(0.3, 0.2, 0.0), Vector3(0.3, 0.09, 0.09), IRON, 0.0, -0.5)
			b.cone(Vector3(-0.42, 0.18, 0.0), 0.06, 0.2, 4, IRON, IRON.lightened(0.15), 0.0, 0.0)
			b.cone(Vector3(0.42, 0.18, 0.0), 0.06, 0.2, 4, IRON, IRON.lightened(0.15), 0.0, 0.0)
			b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.7, 0.06, 0.4), Color("#a8987a"), 0.0)
			b.box(Vector3(0.1, 1.15, 0.0), Vector3(0.04, 0.5, 0.04), Color("#c9a24d"), 0.0)
		"saga_seaweed":
			var greens: Array = [Color("#2f8a6a"), Color("#3fa07a"), Color("#4f9a4a")]
			for i in range(5):
				var a := TAU * float(i) / 5.0 + turn
				var g: Color = greens[i % greens.size()]
				var foot := Vector3(cos(a) * 0.14, 0.0, sin(a) * 0.14)
				b.blade(foot, foot + Vector3(cos(a + 0.8) * 0.18, 0.6 + 0.12 * (i % 3), sin(a + 0.8) * 0.18), 0.12, g.darkened(0.25), g.lightened(0.1), 0.0, a)
		"saga_pearl":
			b.blob(Vector3(0.0, 0.1, -0.05), Vector3(0.34, 0.12, 0.28), 7, 3, Color("#b0a090"), Color("#e4d8c8"), 0.0, 0.05, 5.0)
			b.blob(Vector3(0.0, 0.2, 0.05), Vector3(0.34, 0.1, 0.26), 7, 3, Color("#c8baa8"), Color("#f0e8dc"), 0.0, 0.05, 6.0)
			b.blob(Vector3(0.0, 0.3, 0.0), Vector3.ONE * 0.15, 8, 4, Color("#d8e4f0"), Color("#ffffff"), 0.0, 0.0)
			node.add_child(glow(Color(0.75, 0.9, 1.0), 0.7, 0.4, 1.0))
		"saga_glowshroom":
			var caps: Array = [Color("#9a6ae0"), Color("#5a8ae8"), Color("#c06ad0")]
			for i in range(3):
				var a := TAU * float(i) / 3.0 + turn
				var c: Color = caps[i % caps.size()]
				var h := 0.55 - 0.12 * i
				var foot := Vector3(cos(a) * 0.2 * minf(i, 1.0), 0.0, sin(a) * 0.2 * minf(i, 1.0))
				b.cylinder(foot, 0.06, 0.04, h, 5, Color("#d8d0c0"), Color("#f4f0e4"), 0.0)
				b.blob(foot + Vector3(0.0, h + 0.03, 0.0), Vector3(0.24 - 0.04 * i, 0.12, 0.24 - 0.04 * i), 7, 3, c.darkened(0.2), c.lightened(0.35), 0.0, 0.04, float(i))
			node.add_child(glow(Color(0.7, 0.55, 1.0), 1.1, 0.55, 1.0))
		"saga_elfstatue":
			b.box(Vector3(0.0, 0.14, 0.0), Vector3(0.6, 0.28, 0.6), Color("#a8b0a0"), 0.0, 0.0, Color("#c4ccbc"))
			b.cone(Vector3(0.0, 0.28, 0.0), 0.2, 0.8, 6, Color("#c4ccbc"), Color("#dfe6d6"), 0.0, 0.1)
			b.blob(Vector3(0.0, 1.22, 0.0), Vector3(0.12, 0.14, 0.12), 6, 3, Color("#d4dccb"), Color("#e8efe0"), 0.0, 0.0)
			b.blade(Vector3(-0.1, 1.24, 0.0), Vector3(-0.3, 1.34, 0.0), 0.08, Color("#d4dccb"), Color("#e8efe0"), 0.0, 0.0)
			b.blade(Vector3(0.1, 1.24, 0.0), Vector3(0.3, 1.34, 0.0), 0.08, Color("#d4dccb"), Color("#e8efe0"), 0.0, 0.0)
			b.blade(Vector3(0.0, 0.9, 0.1), Vector3(-0.42, 0.55, 0.1), 0.2, Color("#8ab090"), Color("#b4d4b4"), 0.0, 0.0)
		"saga_icecrystal":
			for i in range(3):
				var a := TAU * float(i) / 3.0 + turn
				var r := 0.0 if i == 0 else 0.22
				b.cone(Vector3(cos(a) * r, 0.0, sin(a) * r), 0.13 if i == 0 else 0.09, (0.95 if i == 0 else 0.55), 5, ICE.darkened(0.15), ICE.lightened(0.45), 0.0, 0.0)
			node.add_child(glow(Color(0.65, 0.88, 1.0), 1.0, 0.7, 0.9))
		"saga_frozenpillar":
			b.cylinder(Vector3.ZERO, 0.28, 0.22, 1.6, 6, ICE.darkened(0.1), ICE.lightened(0.3), 0.0)
			b.cone(Vector3(0.0, 1.6, 0.0), 0.22, 0.3, 6, ICE.lightened(0.3), ICE.lightened(0.6), 0.0, 0.0)
			b.blob(Vector3(0.0, 0.08, 0.0), Vector3(0.45, 0.1, 0.45), 7, 2, WHITE.darkened(0.15), WHITE, 0.0, 0.05, 3.0)
		"saga_snowdrift":
			b.blob(Vector3(0.0, 0.06, 0.0), Vector3(0.5, 0.16, 0.42), 7, 3, WHITE.darkened(0.12), WHITE, 0.0, 0.08, 7.0)
			b.blob(Vector3(0.26, 0.05, 0.14), Vector3(0.28, 0.1, 0.24), 6, 2, WHITE.darkened(0.1), WHITE, 0.0, 0.08, 8.0)
		"saga_anvil":
			b.cylinder(Vector3.ZERO, 0.24, 0.2, 0.42, 7, WOOD.darkened(0.25), WOOD, 0.0)
			b.box(Vector3(0.0, 0.54, 0.0), Vector3(0.62, 0.16, 0.26), IRON.darkened(0.2), 0.0, 0.0, IRON.lightened(0.05))
			b.box(Vector3(0.0, 0.45, 0.0), Vector3(0.26, 0.1, 0.2), IRON.darkened(0.3), 0.0)
			b.cone(Vector3(0.36, 0.54, 0.0), 0.09, 0.18, 5, IRON.darkened(0.2), IRON, 0.0, 0.0)
			b.box(Vector3(-0.2, 0.64, 0.0), Vector3(0.1, 0.03, 0.2), EMBER, 0.0)
		"saga_brazier":
			# an iron bowl on three legs, coals in it, and a flame
			b.cylinder(Vector3(0.0, 0.6, 0.0), 0.2, 0.34, 0.28, 8, IRON.darkened(0.3), IRON, 0.0)
			for i in range(3):
				var a := TAU * float(i) / 3.0 + 0.5
				b.blade(Vector3(cos(a) * 0.22, 0.62, sin(a) * 0.22), Vector3(cos(a) * 0.3, 0.0, sin(a) * 0.3), 0.07, IRON, IRON.darkened(0.2), 0.0, a + PI * 0.5)
			b.cylinder(Vector3(0.0, 0.84, 0.0), 0.3, 0.3, 0.02, 8, Color("#ff7a2a"), Color("#ffb040"), 0.0)
			var flame := DungeonProps.flame(Color(1.0, 0.6, 0.25), 0.7, mini(Quality.particles(), 6))
			flame.position = Vector3(0.0, 0.86, 0.0)
			node.add_child(flame)
		"saga_lavacrack":
			var heat := Color("#ff6a20")
			for i in range(4):
				var a := turn + float(i) * 1.1
				b.box(Vector3(cos(a) * 0.18, 0.012, sin(a) * 0.18), Vector3(0.7, 0.014, 0.07), heat, 0.0, -a)
			b.box(Vector3(0.0, 0.015, 0.0), Vector3(0.2, 0.014, 0.2), Color("#ffd870"), 0.0, turn)
			node.add_child(glow(Color(1.0, 0.45, 0.15), 1.3, 0.25, 0.9))
		_:
			return null
	node.add_child(_node(b.build(), mat))
	return node
