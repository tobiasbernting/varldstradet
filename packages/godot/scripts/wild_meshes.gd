class_name WildMeshes
extends RefCounted
## The wild maps' props in 3D, made in code with the farm's mesh builder (farm_mesh.gd, vertex colours in the ART.md
## palette) the way village_meshes.gd makes Köpingen: the plants of the jungle and the candy land, the bones and fossils,
## the cave's walls, ore, crystals and mushrooms, the moon and the space base, the temple, the pyramid and the volcano,
## the shipwreck, and the seasonal decor. Drawn after the browser's pixel art (packages/art/src/landmarks.ts, world.ts,
## objects2.ts) so the two worlds look like one, but as shapes a child can read from the game's camera: every interactable
## one has a clue on it (the fairy ring its toadstools and motes, the fossil rock a bone sticking out of it, the beehive its
## bees and honey, the shipwreck a chest on its deck, the rocket its ladder).
##
## One tile is one metre. Every mesh stands on the middle of its footprint (the object's w × h) with its front on +z.
## No pack: nothing here needs a licence (LICENSES.md, "Generated for this project").

const BONE := Color("#e2d6b8")
const BONE_D := Color("#b8aa88")
const WOOD := Color("#86582f")
const WOOD_D := Color("#5a3a1f")
const WOOD_L := Color("#c58f55")
const STONE := Color("#7c7d78")
const STONE_D := Color("#5f625f")
const STONE_L := Color("#a6a69e")
const SAND := Color("#e3d08f")
const SAND_D := Color("#c8b06a")
const SANDSTONE := Color("#cfa96c")
const SANDSTONE_D := Color("#ad8550")
const IRON := Color("#5e626c")
const IRON_L := Color("#9094a0")
const GOLD := Color("#e8b830")
const GOLD_L := Color("#ffe27a")
const MOSS := Color("#4f8231")
const LEAF := Color("#4f9a3a")
const LEAF_D := Color("#2f6a2a")
const LEAF_L := Color("#7fc35a")
const EMBER := Color("#ffa040")
const LAVA := Color("#ff6a20")
const LAVA_L := Color("#ffd870")
const OBSIDIAN := Color("#1d171d")
const OBSIDIAN_L := Color("#544852")
const WHITE := Color("#f2f6fa")
const SNOW := Color("#f6fbff")
const RED := Color("#d84a4a")
const DARK := Color("#1b1712")
const CANDY_PINK := Color("#f08ac0")
const CANDY_RED := Color("#d83a4a")

## Crystal colours of the cave themes (landmarks.ts CRYSTAL): purple, ice blue, alien green, pink sugar. [dark, mid, bright]
const CRYSTALS := [
	[Color("#4a1a80"), Color("#a860f0"), Color("#f6ecff")],
	[Color("#1e5a8a"), Color("#70c8f0"), Color("#ffffff")],
	[Color("#14703a"), Color("#56e07a"), Color("#f0fff4")],
	[Color("#a03a70"), Color("#f08ac0"), Color("#fff4fa")],
]

## The rock of each cave theme (landmarks.ts ROCK, CAVE_THEMES order: rot, is, kristall, sjorovare, pyramid, tempel, lava,
## svamp, fossil, godis, rymd): [dark, mid, light].
const ROCK := [
	[Color("#3b2a1d"), Color("#73563c"), Color("#b0906a")],
	[Color("#4f7598"), Color("#9cc0de"), Color("#eef8ff")],
	[Color("#3a3646"), Color("#6e6880"), Color("#aaa4be")],
	[Color("#1f262e"), Color("#414d59"), Color("#74838f")],
	[Color("#8a6436"), Color("#cfa96c"), Color("#f6e2b4")],
	[Color("#3c4636"), Color("#707e62"), Color("#adb99c")],
	[Color("#100c10"), Color("#2c242c"), Color("#544852")],
	[Color("#323a3a"), Color("#5f6b6a"), Color("#97a39f")],
	[Color("#5e2814"), Color("#a9522f"), Color("#e08e60")],
	[Color("#a8406e"), Color("#ee88bb"), Color("#ffe0ef")],
	[Color("#5c5c6a"), Color("#9e9eac"), Color("#dcdce4")],
]

## The kinds this file draws. (Kinds the dungeon view draws itself, saga_wall, saga_torch ..., are not here.)
const KINDS := [
	"alvlykta", "banana_plant", "beehive", "bifrostbit", "bones", "candy_cane", "cave_exit", "cave_rock", "cave_torch",
	"cave_wall", "crater", "crystal", "dino_bones", "dino_skeleton", "dragon_egg", "dvargstaty", "earth", "easter_twigs",
	"egg_basket", "fairy_ring", "fenrislanka", "fire_crystal", "flag_se", "flower_wreath_decor", "fossil_rock", "gem_vein",
	"ghost_flag", "giant_glowshroom", "giant_mushroom", "gingerbread_house", "gold_vein", "hels_lykta", "lights",
	"lollipop_tree", "moon_cheese", "moon_rock", "obsidian_rock", "ore", "ormtand", "pyramid", "rocket", "ruin_pillar",
	"satellite_dish", "shipwreck", "snowman_wild", "solruna", "stalagmite", "star_crystal", "steam_vent", "temple",
	"treasure", "ufo", "volcano", "wisp_jar", "bath_exit",
]

## kind -> [colour, size m, height m, energy]: the flat glow (an additive billboard) of what shines. The dungeon's
## ZoneProps puts it on the prop; the farm view gives the few lone landmarks a light of their own (farm_assets.gd SPECS).
const GLOWS := {
	"alvlykta": [Color(0.7, 1.0, 0.7), 0.9, 1.15, 1.0],
	"bifrostbit": [Color(0.9, 0.8, 1.0), 1.0, 0.45, 1.0],
	"dvargstaty": [Color(1.0, 0.8, 0.45), 0.7, 1.35, 0.7],
	"fenrislanka": [Color(0.7, 0.9, 1.0), 0.8, 0.4, 0.8],
	"hels_lykta": [Color(0.55, 1.0, 0.85), 0.9, 1.1, 1.0],
	"ormtand": [Color(0.8, 1.0, 0.8), 0.8, 0.6, 0.7],
	"solruna": [Color(1.0, 0.85, 0.4), 1.0, 0.8, 1.0],
	"wisp_jar": [Color(0.75, 0.9, 1.0), 0.9, 0.55, 1.1],
	"crystal": [Color(0.7, 0.8, 1.0), 1.0, 0.5, 0.8],
	"fire_crystal": [Color(1.0, 0.5, 0.2), 1.0, 0.5, 0.9],
	"star_crystal": [Color(1.0, 0.9, 0.6), 1.1, 0.55, 0.9],
	"giant_glowshroom": [Color(0.5, 0.8, 1.0), 1.6, 1.0, 0.8],
	"cave_torch": [Color(1.0, 0.7, 0.3), 0.6, 1.25, 1.2],
	"gingerbread_house": [Color(1.0, 0.8, 0.5), 1.0, 0.6, 0.7],
	"rocket": [Color(1.0, 0.85, 0.5), 0.7, 1.5, 0.6],
	"ufo": [Color(0.6, 1.0, 0.8), 2.2, 0.3, 0.7],
	"volcano": [Color(1.0, 0.45, 0.15), 2.4, 3.2, 0.9],
	"lights": [Color(1.0, 0.85, 0.6), 0.9, 1.0, 0.7],
	"ghost_flag": [Color(0.7, 1.0, 0.85), 0.9, 1.25, 0.6],
}

static var _cache: Dictionary = {}


static func has(kind: String) -> bool:
	return KINDS.has(kind)


## The mesh for `kind` (a cave wall by its variant: `cave_wall_<theme>_<lit>`; a crystal by its colour: `crystal_<0..3>`).
## Kept after the first ask: a mesh is shared by every instance.
static func mesh(name: String) -> ArrayMesh:
	if _cache.has(name):
		return _cache[name]
	var m := _make(name)
	_cache[name] = m
	return m


## The mesh name for an object of `kind` with this `variant` (the variants that change the look: a cave wall's theme and
## torch, a crystal's colour, a stalagmite's rock).
static func name_for(kind: String, v: int) -> String:
	match kind:
		"cave_wall":
			var theme := 0 if v < 2 else clampi((v - 2) / 2, 0, ROCK.size() - 1)
			return "cave_wall_%d_%d" % [theme, v % 2]
		"crystal":
			return "crystal_%d" % (v % 4)
		"stalagmite", "cave_rock":
			return "%s_%d" % [kind, v % ROCK.size()]
		"ore":
			return "ore_%d" % (v % 2)
	return kind


static func release() -> void:
	_cache.clear()


static func _h(a: float, b: float) -> float:
	return fposmod(sin(a * 12.9898 + b * 78.233) * 43758.5453, 1.0)


static func _make(name: String) -> ArrayMesh:
	var b := FarmMesh.new()
	var parts := name.split("_")
	if name.begins_with("cave_wall_"):
		_cave_wall(b, int(parts[2]), int(parts[3]) == 1)
	elif name.begins_with("crystal_"):
		_crystal(b, int(parts[1]) % 4)
	elif name.begins_with("ore_"):
		_ore(b, int(parts[1]))
	elif name.begins_with("cave_rock_"):
		_cave_rock(b, int(parts[2]))
	elif name.begins_with("stalagmite_"):
		_stalagmite(b, int(parts[1]))
	else:
		match name:
			"alvlykta": _alvlykta(b)
			"banana_plant": _banana_plant(b)
			"bath_exit": _bath_exit(b)
			"beehive": _beehive(b)
			"bifrostbit": _bifrostbit(b)
			"bones": _bones(b)
			"candy_cane": _candy_cane(b)
			"cave_exit": _cave_exit(b)
			"cave_torch": _cave_torch(b)
			"crater": _crater(b)
			"dino_bones": _dino_bones(b)
			"dino_skeleton": _dino_skeleton(b)
			"dragon_egg": _dragon_egg(b)
			"dvargstaty": _dvargstaty(b)
			"earth": _earth(b)
			"easter_twigs": _easter_twigs(b)
			"egg_basket": _egg_basket(b)
			"fairy_ring": _fairy_ring(b)
			"fenrislanka": _fenrislanka(b)
			"fire_crystal": _fire_crystal(b)
			"flag_se": _flag_se(b)
			"flower_wreath_decor": _flower_wreath(b)
			"fossil_rock": _fossil_rock(b)
			"gem_vein": _vein(b, Color("#e86ac8"), Color("#6ae0f0"), 3)
			"gold_vein": _vein(b, GOLD, GOLD_L, 5)
			"ghost_flag": _ghost_flag(b)
			"giant_glowshroom": _giant_mushroom(b, Color("#2a6ad0"), Color("#7ae8ff"), Color("#d8ffff"), true)
			"giant_mushroom": _giant_mushroom(b, Color("#b02a2a"), Color("#e8483a"), WHITE, false)
			"giant_glowshroom_lo": _giant_mushroom(b, Color("#2a6ad0"), Color("#7ae8ff"), Color("#d8ffff"), true, true)
			"giant_mushroom_lo": _giant_mushroom(b, Color("#b02a2a"), Color("#e8483a"), WHITE, false, true)
			"gingerbread_house": _gingerbread_house(b)
			"hels_lykta": _hels_lykta(b)
			"lights": _lights(b)
			"lollipop_tree": _lollipop_tree(b)
			"moon_cheese": _moon_cheese(b)
			"moon_rock": _moon_rock(b)
			"obsidian_rock": _obsidian_rock(b)
			"ormtand": _ormtand(b)
			"pyramid": _pyramid(b)
			"rocket": _rocket(b)
			"ruin_pillar": _ruin_pillar(b)
			"satellite_dish": _satellite_dish(b)
			"shipwreck": _shipwreck(b)
			"snowman_wild": _snowman_wild(b)
			"solruna": _solruna(b)
			"star_crystal": _star_crystal(b)
			"steam_vent": _steam_vent(b)
			"temple": _temple(b)
			"treasure": _treasure(b)
			"ufo": _ufo(b)
			"volcano": _volcano(b)
			"wisp_jar": _wisp_jar(b)
			_:
				return null
	return b.build()


# ---------------------------------------------------------------------------
# Small shapes


## A lumpy rock: a squashed blob in three tones of `pal` ([dark, mid, light]).
static func _rock(b: FarmMesh, at: Vector3, r: Vector3, pal: Array, seed_v: float, jitter := 0.16) -> void:
	b.blob(at + Vector3(0.0, r.y * 0.6, 0.0), r, 7, 3, pal[0], pal[2], 0.0, jitter, seed_v)


static func _ring_dots(b: FarmMesh, r: float, n: int, size: Vector3, col_a: Color, col_b: Color, y := 0.0, turn := 0.0) -> void:
	for i in range(n):
		var a := TAU * float(i) / float(n) + turn
		b.blob(Vector3(cos(a) * r, y + size.y, sin(a) * r), size, 5, 2, col_a, col_b, 0.0, 0.05, float(i))


## A crystal: a hexagonal prism with a pointed tip leaning a little.
static func _shard(b: FarmMesh, foot: Vector3, r: float, h: float, pal: Array, lean := 0.0) -> void:
	var cone_h := h * 0.35
	b.cone(foot, r, h - cone_h, 6, pal[0], pal[1], 0.0, r * 0.82)
	b.cone(foot + Vector3(0.0, h - cone_h, 0.0), r * 0.82, cone_h, 6, pal[1], pal[2], 0.0, 0.0, lean)


# ---------------------------------------------------------------------------
# Plants and candy


static func _banana_plant(b: FarmMesh) -> void:
	var stem := Color("#7a9a3a")
	b.cylinder(Vector3.ZERO, 0.13, 0.1, 0.95, 6, stem.darkened(0.2), stem, 0.0)
	for i in range(6):
		var a := TAU * float(i) / 6.0 + 0.3
		var tip := Vector3(cos(a) * 0.75, 0.9 + 0.12 * float(i % 3), sin(a) * 0.75)
		var mid := Vector3(cos(a) * 0.38, 1.38, sin(a) * 0.38)
		b.blade(Vector3(0.0, 0.92, 0.0), mid, 0.34, LEAF_D, LEAF, 1.0, a + PI * 0.5)
		b.blade(mid, tip, 0.36, LEAF, LEAF_L, 1.0, a + PI * 0.5)
	# the bunch: yellow bananas hanging from the stem's top, pointing up at their tips
	for i in range(7):
		var a := 0.4 + float(i) * 0.35
		var foot := Vector3(0.0, 0.78, 0.0) + Vector3(cos(a) * 0.1, -0.05 * float(i % 2), sin(a) * 0.1 + 0.06)
		b.blade(foot, foot + Vector3(cos(a) * 0.14, -0.3, sin(a) * 0.14), 0.09, Color("#e8c830"), Color("#fff07a"), 0.0, a)
		b.blade(foot + Vector3(cos(a) * 0.14, -0.3, sin(a) * 0.14), foot + Vector3(cos(a) * 0.19, -0.18, sin(a) * 0.19), 0.07, Color("#fff07a"), Color("#7a5a1a"), 0.0, a)


static func _beehive(b: FarmMesh) -> void:
	# a straw skep on a little wooden stand: stacked rings, a dark doorway, honey running down, bees round it
	b.box(Vector3(0.0, 0.17, 0.0), Vector3(0.62, 0.06, 0.62), WOOD, 0.0, 0.0, WOOD_L)
	for sx in [-0.24, 0.24]:
		for sz in [-0.24, 0.24]:
			b.box(Vector3(sx, 0.07, sz), Vector3(0.07, 0.14, 0.07), WOOD_D)
	var straw := Color("#e6c15a")
	var rings: Array = [[0.34, 0.12], [0.31, 0.11], [0.26, 0.1], [0.19, 0.09], [0.1, 0.07]]
	var y := 0.2
	for i in range(rings.size()):
		var r: float = rings[i][0]
		var h: float = rings[i][1]
		var nr: float = rings[i + 1][0] if i + 1 < rings.size() else 0.02
		b.cone(Vector3(0.0, y, 0.0), r, h, 8, straw.darkened(0.18 * float(i % 2)), straw.lightened(0.05), 0.0, nr)
		y += h
	b.cone(Vector3(0.0, y, 0.0), 0.04, 0.07, 6, WOOD_D, WOOD, 0.0, 0.0)
	b.box(Vector3(0.0, 0.3, 0.32), Vector3(0.12, 0.1, 0.05), Color("#3a2a1a"), 0.0)
	# honey: a golden drip down the front, a puddle on the stand's board
	b.box(Vector3(0.1, 0.36, 0.31), Vector3(0.05, 0.2, 0.03), Color("#f0a010"), 0.0, 0.0, GOLD_L)
	b.box(Vector3(0.1, 0.2, 0.36), Vector3(0.14, 0.015, 0.12), Color("#f0a010"), 0.0, 0.0, GOLD_L)
	# bees: tiny striped bodies buzzing round it
	for i in range(5):
		var a := TAU * float(i) / 5.0 + 0.4
		var p := Vector3(cos(a) * 0.52, 0.45 + 0.1 * float(i % 3), sin(a) * 0.52)
		b.box(p, Vector3(0.07, 0.05, 0.05), Color("#f0c020"), 0.0, a)
		b.box(p + Vector3(0.0, 0.0, 0.0), Vector3(0.025, 0.052, 0.052), DARK, 0.0, a)
		b.box(p + Vector3(0.0, 0.04, 0.0), Vector3(0.03, 0.01, 0.07), WHITE, 0.0, a)


static func _candy_cane(b: FarmMesh) -> void:
	# a red and white striped cane: a straight stem, then a hook that turns over
	var pts: Array = []
	for i in range(8):
		pts.append(Vector3(0.0, 0.1 * float(i) * 1.0, 0.0))
	var y := 0.0
	for i in range(8):
		var c := CANDY_RED if i % 2 == 0 else WHITE
		b.cylinder(Vector3(0.0, y, 0.0), 0.08, 0.08, 0.1, 8, c.darkened(0.1), c, 0.0, false)
		y += 0.1
	for i in range(7):
		var c := CANDY_RED if i % 2 == 0 else WHITE
		b.cylinder(Vector3(0.0, y, 0.0), 0.08, 0.08, 0.1, 8, c.darkened(0.1), c, 0.0, false)
		y += 0.1
	# the hook: segments round a quarter and a bit more
	var centre := Vector3(0.2, y, 0.0)
	for i in range(7):
		var a := PI - PI * float(i) / 6.0
		var p := centre + Vector3(cos(a) * 0.2, sin(a) * 0.2, 0.0)
		var c := CANDY_RED if i % 2 == 0 else WHITE
		b.blob(p, Vector3.ONE * 0.085, 6, 3, c.darkened(0.12), c.lightened(0.08), 0.0, 0.0)
	b.cylinder(Vector3.ZERO, 0.11, 0.11, 0.04, 8, Color("#b02a3a"), Color("#e8e0e8"), 0.0)


static func _lollipop_tree(b: FarmMesh) -> void:
	# a stick with a big round swirl: pink, white and yellow wedges, a bow beneath (the candy land's tree)
	b.cylinder(Vector3.ZERO, 0.045, 0.04, 0.95, 6, Color("#e8e0e8"), WHITE, 0.0)
	var cols: Array = [CANDY_PINK, WHITE, Color("#ffd85a"), WHITE, Color("#8ad8f0"), WHITE]
	var centre := Vector3(0.0, 1.15, 0.0)
	var n := 12
	for i in range(n):
		var a0 := TAU * float(i) / float(n)
		var a1 := TAU * float(i + 1) / float(n)
		var c: Color = cols[i % cols.size()]
		var r := 0.42
		b.tri(centre + Vector3(0.0, 0.0, 0.06), centre + Vector3(cos(a0) * r, sin(a0) * r, 0.06), centre + Vector3(cos(a1) * r, sin(a1) * r, 0.06), c.lightened(0.05), c, c, 0.0)
		b.tri(centre - Vector3(0.0, 0.0, 0.06), centre + Vector3(cos(a1) * r, sin(a1) * r, -0.06), centre + Vector3(cos(a0) * r, sin(a0) * r, -0.06), c.darkened(0.1), c.darkened(0.1), c.darkened(0.1), 0.0)
		# the rim
		var p0 := centre + Vector3(cos(a0) * r, sin(a0) * r, 0.0)
		var p1 := centre + Vector3(cos(a1) * r, sin(a1) * r, 0.0)
		b.quad(p0 + Vector3(0, 0, 0.06), p1 + Vector3(0, 0, 0.06), p1 - Vector3(0, 0, 0.06), p0 - Vector3(0, 0, 0.06), c.darkened(0.2), 0.0)
	b.blob(Vector3(0.0, 0.72, 0.0), Vector3(0.1, 0.07, 0.07), 6, 2, CANDY_RED.darkened(0.1), CANDY_RED.lightened(0.1), 0.0, 0.0)
	b.blob(Vector3(0.0, 0.72, 0.0), Vector3(0.04, 0.04, 0.04), 5, 2, CANDY_RED, CANDY_RED, 0.0, 0.0)
	# a little puddle of sprinkles at its foot
	for i in range(6):
		var a := TAU * float(i) / 6.0 + 0.2
		b.box(Vector3(cos(a) * 0.3, 0.012, sin(a) * 0.3), Vector3(0.07, 0.02, 0.025), cols[i % cols.size()], 0.0, a * 2.0)


static func _gingerbread_house(b: FarmMesh) -> void:
	# 3 × 3: brown gingerbread walls with white icing, a pink-and-white candy roof, gumdrops, candy-cane posts, a lit door
	var ginger := Color("#a8622a")
	var ginger_d := Color("#7a4418")
	var icing := Color("#fff6ee")
	b.box(Vector3(0.0, 0.55, 0.0), Vector3(2.3, 1.1, 1.9), ginger, 0.0, 0.0, ginger.lightened(0.1))
	# icing along the base and the corners
	b.box(Vector3(0.0, 0.04, 0.0), Vector3(2.4, 0.08, 2.0), icing)
	for sx in [-1.15, 1.15]:
		b.box(Vector3(sx, 0.55, 0.95), Vector3(0.1, 1.12, 0.1), icing)
		b.box(Vector3(sx, 0.55, -0.95), Vector3(0.1, 1.12, 0.1), icing)
	# roof: two slanted candy planes with a ridge
	var roof_a := CANDY_PINK
	for i in range(7):
		var x0 := -1.3 + 2.6 * float(i) / 7.0
		var x1 := -1.3 + 2.6 * float(i + 1) / 7.0
		var c := roof_a if i % 2 == 0 else icing
		b.quad(Vector3(x0, 1.1, 1.05), Vector3(x1, 1.1, 1.05), Vector3(x1, 1.85, 0.0), Vector3(x0, 1.85, 0.0), c)
		b.quad(Vector3(x1, 1.1, -1.05), Vector3(x0, 1.1, -1.05), Vector3(x0, 1.85, 0.0), Vector3(x1, 1.85, 0.0), c.darkened(0.1))
	b.tri(Vector3(-1.3, 1.1, 1.05), Vector3(-1.3, 1.1, -1.05), Vector3(-1.3, 1.85, 0.0), icing, icing, icing)
	b.tri(Vector3(1.3, 1.1, -1.05), Vector3(1.3, 1.1, 1.05), Vector3(1.3, 1.85, 0.0), icing, icing, icing)
	b.box(Vector3(0.0, 1.87, 0.0), Vector3(2.6, 0.08, 0.1), icing)
	# chimney with a cookie top
	b.box(Vector3(0.7, 1.9, -0.3), Vector3(0.3, 0.5, 0.3), Color("#c85a3a"), 0.0, 0.0, icing)
	# the door, glowing, and two windows with icing frames
	b.box(Vector3(0.0, 0.42, 0.96), Vector3(0.52, 0.84, 0.04), Color("#ffd27a"), 0.0, 0.0, Color("#ffe8a8"))
	b.box(Vector3(0.0, 0.42, 0.98), Vector3(0.62, 0.9, 0.02), ginger_d)
	b.box(Vector3(0.0, 0.42, 1.0), Vector3(0.5, 0.82, 0.02), Color("#ffd27a"))
	b.box(Vector3(0.0, 0.42, 1.015), Vector3(0.04, 0.82, 0.01), ginger_d)
	for sx in [-0.8, 0.8]:
		b.box(Vector3(sx, 0.65, 0.96), Vector3(0.36, 0.34, 0.03), icing)
		b.box(Vector3(sx, 0.65, 0.975), Vector3(0.28, 0.26, 0.02), Color("#ffd27a"))
	# candy-cane posts at the front corners and gumdrops by the door
	for sx in [-1.35, 1.35]:
		var y := 0.0
		for i in range(8):
			var c := CANDY_RED if i % 2 == 0 else WHITE
			b.cylinder(Vector3(sx, y, 1.2), 0.05, 0.05, 0.12, 6, c.darkened(0.1), c, 0.0, false)
			y += 0.12
		b.blob(Vector3(sx, y + 0.04, 1.2), Vector3.ONE * 0.08, 6, 3, CANDY_RED, CANDY_RED.lightened(0.2), 0.0, 0.0)
	var drops: Array = [Color("#e83a5a"), Color("#4ac860"), Color("#f0c020"), Color("#6a8af0"), Color("#f08a2a")]
	for i in range(7):
		var gx := -0.95 + 0.3 * float(i)
		if absf(gx) < 0.35:
			continue
		var c: Color = drops[i % drops.size()]
		b.blob(Vector3(gx, 0.09, 1.15 + 0.1 * float(i % 2)), Vector3(0.11, 0.09, 0.11), 6, 3, c.darkened(0.2), c.lightened(0.3), 0.0, 0.0, float(i))
	# a lollipop fence of three little ones
	for i in range(3):
		b.cylinder(Vector3(-1.2 + 0.2 * float(i), 0.0, -1.1), 0.02, 0.02, 0.45, 5, WHITE, WHITE)
		b.blob(Vector3(-1.2 + 0.2 * float(i), 0.5, -1.1), Vector3(0.1, 0.1, 0.04), 7, 2, drops[i], drops[i].lightened(0.3), 0.0, 0.0)


# ---------------------------------------------------------------------------
# Bones, fossils and the finds


static func _rib(b: FarmMesh, at: Vector3, r: float, tilt: float, col: Color) -> void:
	# a rib: an arch of segments standing across the spine (x), turned `tilt`
	for i in range(7):
		var a0 := PI * float(i) / 7.0
		var a1 := PI * float(i + 1) / 7.0
		var p0 := at + Vector3(cos(a0) * r, sin(a0) * r * 1.1, 0.0)
		var p1 := at + Vector3(cos(a1) * r, sin(a1) * r * 1.1, 0.0)
		var mid := (p0 + p1) * 0.5
		var len := p0.distance_to(p1)
		var ang := atan2(p1.y - p0.y, p1.x - p0.x)
		# a thin box along the segment (turned in the x-y plane by tilting the box's top: approximated by a blade)
		b.blade(p0, p1, 0.07, col, col.lightened(0.05), 0.0, PI * 0.5 + tilt)
		b.blade(p0, p1, 0.07, col, col.lightened(0.05), 0.0, tilt)
		if i == 0 or i == 6:
			b.blob(p0 if i == 0 else p1, Vector3.ONE * 0.04, 4, 2, col, col.lightened(0.1), 0.0, 0.0)
		len = mid.x + ang # (kept for the reader: the segment's centre and angle)


## A straight beam (a bone, a rib, a plank on edge) of square section `w` from p0 to p1, the colour fading from c0 to c1.
static func _beam(b: FarmMesh, p0: Vector3, p1: Vector3, w: float, c0: Color, c1: Color) -> void:
	var d := p1 - p0
	if d.length() < 0.001:
		return
	var up := Vector3.UP if absf(d.normalized().dot(Vector3.UP)) < 0.95 else Vector3.RIGHT
	var u := d.cross(up).normalized() * w * 0.5
	var v := d.cross(u).normalized() * w * 0.5
	var a: Array = [p0 - u - v, p0 + u - v, p0 + u + v, p0 - u + v]
	var e: Array = [p1 - u - v, p1 + u - v, p1 + u + v, p1 - u + v]
	for i in range(4):
		var j := (i + 1) % 4
		# (each side as two triangles, seen from outside: the corners are ordered so the normal points away from the axis)
		b.tri(a[i], e[i], e[j], c0, c1, c1)
		b.tri(a[i], e[j], a[j], c0, c1, c0)
		b.tri(a[i], e[j], e[i], c0, c1, c1)
		b.tri(a[i], a[j], e[j], c0, c0, c1)


## The same bent through `pts` (a neck, a tail, a rib), each piece `w` thick, thinning by `taper` (1 = not at all) over the whole.
static func _bent(b: FarmMesh, pts: Array, w: float, c0: Color, c1: Color, taper := 1.0) -> void:
	for i in range(pts.size() - 1):
		var t0 := lerpf(1.0, taper, float(i) / float(pts.size() - 1))
		var t1 := lerpf(1.0, taper, float(i + 1) / float(pts.size() - 1))
		_beam(b, pts[i], pts[i + 1], w * (t0 + t1) * 0.5, c0, c1)
		b.blob(pts[i + 1], Vector3.ONE * w * 0.55 * t1, 5, 2, c0, c1, 0.0, 0.0)


static func _skull(b: FarmMesh, at: Vector3, s: float, yaw := 0.0) -> void:
	var basis := Basis(Vector3.UP, yaw)
	var p := func(v: Vector3) -> Vector3: return at + basis * (v * s)
	b.blob(p.call(Vector3(0.0, 0.1, 0.0)), Vector3(0.16, 0.13, 0.19) * s, 7, 3, BONE_D, BONE.lightened(0.05), 0.0, 0.03, 4.0)
	b.box(p.call(Vector3(0.0, 0.04, 0.2)), Vector3(0.12, 0.08, 0.2) * s, BONE, 0.0, yaw)
	b.box(p.call(Vector3(0.0, -0.02, 0.2)), Vector3(0.11, 0.03, 0.18) * s, BONE_D, 0.0, yaw)
	for sx in [-0.07, 0.07]:
		b.box(p.call(Vector3(sx, 0.12, 0.14)), Vector3(0.06, 0.07, 0.04) * s, DARK, 0.0, yaw)
	# teeth
	for i in range(4):
		b.box(p.call(Vector3(-0.045 + 0.03 * float(i), 0.0, 0.3)), Vector3(0.015, 0.03, 0.015) * s, WHITE, 0.0, yaw)


static func _dino_bones(b: FarmMesh) -> void:
	# 3 × 2: a half-buried dinosaur lying in the sand: a row of ribs arching out of a mound, a long spine to a tail, a skull
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(1.45, 0.14, 0.9), 9, 2, SAND_D, SAND, 0.0, 0.1, 3.0)
	for i in range(7):
		var x := -0.7 + 0.2 * float(i)
		var r := 0.28 - 0.025 * absf(float(i) - 3.0)
		_rib(b, Vector3(x, 0.1, 0.0), r, 0.0, BONE)
	# the spine: a row of vertebrae, going on into the tail that thins out
	for i in range(14):
		var x := -1.3 + 0.17 * float(i)
		var s := 0.07 - 0.003 * float(maxi(0, 4 - i))
		if i > 9:
			s *= 1.0 - 0.15 * float(i - 9)
		b.blob(Vector3(x, 0.38 - 0.02 * float(i % 2) if i > 1 and i < 10 else 0.1, 0.0), Vector3(0.09, 0.06 + s * 0.3, 0.06), 5, 2, BONE_D, BONE, 0.0, 0.04, float(i))
	# the skull at the head end (right), a leg bone, scattered pieces
	_skull(b, Vector3(1.12, 0.0, 0.1), 1.0, PI * 0.5)
	b.box(Vector3(-0.2, 0.06, 0.6), Vector3(0.6, 0.07, 0.09), BONE, 0.0, 0.3)
	b.blob(Vector3(-0.52, 0.08, 0.7), Vector3.ONE * 0.07, 5, 2, BONE_D, BONE, 0.0, 0.0)
	b.blob(Vector3(0.1, 0.08, 0.52), Vector3.ONE * 0.07, 5, 2, BONE_D, BONE, 0.0, 0.0)
	b.box(Vector3(0.7, 0.05, -0.55), Vector3(0.5, 0.06, 0.08), BONE_D, 0.0, -0.4)


static func _dino_skeleton(b: FarmMesh) -> void:
	# 3 × 2: the museum's dinosaur on a stone plinth: skull on a long neck, a ribcage, a long tail, two strong legs
	b.box(Vector3(0.0, 0.08, 0.0), Vector3(2.8, 0.16, 1.5), STONE_D, 0.0, 0.0, STONE)
	b.box(Vector3(0.0, 0.17, 0.0), Vector3(2.6, 0.03, 1.3), STONE_L.darkened(0.12))
	var th := 0.13
	# the legs: thigh down and back, shin, foot with three toes
	for sz in [-0.22, 0.22]:
		_bent(b, [Vector3(0.1, 0.95, sz), Vector3(0.0, 0.62, sz), Vector3(0.12, 0.3, sz), Vector3(0.1, 0.19, sz)], 0.1, BONE_D, BONE, 0.9)
		for k in range(3):
			_beam(b, Vector3(0.1, 0.19, sz), Vector3(0.38, 0.19, sz + (float(k) - 1.0) * 0.07), 0.05, BONE_D, BONE)
	# the spine: neck, back and tail in one curve, high over the hips
	var spine: Array = [Vector3(-1.25, 0.28, 0.0), Vector3(-0.95, 0.42, 0.0), Vector3(-0.6, 0.65, 0.0), Vector3(-0.25, 0.9, 0.0), Vector3(0.1, 1.0, 0.0), Vector3(0.45, 1.0, 0.0), Vector3(0.7, 1.05, 0.0), Vector3(0.9, 1.2, 0.0), Vector3(1.05, 1.4, 0.0), Vector3(1.15, 1.55, 0.0)]
	_bent(b, spine, th, BONE_D, BONE, 0.6)
	# the ribcage: curved ribs hanging from the back over the chest, on both sides
	for i in range(5):
		var x := 0.12 + 0.17 * float(i)
		var drop := 0.55 - 0.06 * absf(float(i) - 2.0)
		for sz in [-1.0, 1.0]:
			_bent(b, [Vector3(x, 1.0, 0.04 * sz), Vector3(x + 0.04, 0.92, 0.22 * sz), Vector3(x + 0.08, 1.0 - drop, 0.2 * sz), Vector3(x + 0.12, 1.0 - drop - 0.05, 0.06 * sz)], 0.05, BONE_D, BONE)
	# the skull at the end of the neck, jaws open
	_skull(b, Vector3(1.3, 1.5, 0.0), 1.2, PI * 0.5)
	# the arms, tiny
	for sz in [-0.15, 0.15]:
		_bent(b, [Vector3(0.7, 0.9, sz), Vector3(0.82, 0.75, sz), Vector3(0.95, 0.72, sz)], 0.05, BONE_D, BONE)


static func _fossil_rock(b: FarmMesh) -> void:
	# a rock with a spiral shell and a bone showing in its face, dirt heaped round it, a pick leaning on it
	var pal: Array = [Color("#5e4a3a"), Color("#8a7458"), Color("#c0aa86")]
	_rock(b, Vector3.ZERO, Vector3(0.42, 0.34, 0.36), pal, 2.0)
	_rock(b, Vector3(0.22, 0.0, -0.1), Vector3(0.22, 0.2, 0.2), pal, 5.0)
	b.blob(Vector3(0.0, 0.03, 0.12), Vector3(0.55, 0.06, 0.45), 8, 2, Color("#6a4a2a"), Color("#8a6238"), 0.0, 0.1, 1.0)
	# the ammonite: rings of cream on the front face
	var cx := -0.02
	var cy := 0.3
	for i in range(3):
		var r := 0.15 - 0.045 * float(i)
		b.blob(Vector3(cx, cy, 0.31 - 0.01 * float(i)), Vector3(r, r, 0.03), 8, 2, BONE_D if i % 2 == 0 else BONE, BONE if i % 2 == 0 else WHITE, 0.0, 0.0, float(i))
	# a bone sticking out the top: the thing to dig for
	b.blade(Vector3(0.1, 0.5, 0.0), Vector3(0.34, 0.74, 0.04), 0.1, BONE_D, BONE, 0.0, 0.0)
	b.blob(Vector3(0.34, 0.75, 0.04), Vector3.ONE * 0.06, 5, 2, BONE, WHITE, 0.0, 0.0)
	b.blob(Vector3(0.28, 0.69, 0.12), Vector3.ONE * 0.05, 5, 2, BONE_D, BONE, 0.0, 0.0)
	# the pick: a haft and an iron head
	b.box(Vector3(-0.42, 0.34, 0.2), Vector3(0.05, 0.7, 0.05), WOOD, 0.0, 0.0)
	b.box(Vector3(-0.42, 0.68, 0.2), Vector3(0.26, 0.05, 0.05), IRON, 0.0, 0.0)


static func _bones(b: FarmMesh) -> void:
	# flat: a few long bones, a skull and a small rib arch
	for i in range(4):
		var a := TAU * float(i) / 4.0 + 0.4
		b.box(Vector3(cos(a) * 0.16, 0.03 + 0.015 * float(i % 2), sin(a) * 0.16), Vector3(0.44, 0.045, 0.06), BONE if i % 2 == 0 else BONE_D, 0.0, a)
		b.blob(Vector3(cos(a) * 0.16 + cos(a) * 0.23, 0.04, sin(a) * 0.16 - sin(a) * 0.23), Vector3.ONE * 0.045, 4, 2, BONE, BONE, 0.0, 0.0)
	_skull(b, Vector3(0.2, 0.0, -0.18), 1.0, 0.8)


# ---------------------------------------------------------------------------
# Fairy ring, dragon egg, the little jars and statues


static func _fairy_ring(b: FarmMesh) -> void:
	# 2 × 2, flat: a ring of white-spotted red toadstools round a patch of brighter grass, little glowing motes over it
	var disc_n := 14
	for i in range(disc_n):
		var a0 := TAU * float(i) / float(disc_n)
		var a1 := TAU * float(i + 1) / float(disc_n)
		var inner := Color("#8ad870")
		b.tri(Vector3(0.0, 0.02, 0.0), Vector3(cos(a1) * 0.82, 0.02, sin(a1) * 0.82), Vector3(cos(a0) * 0.82, 0.02, sin(a0) * 0.82), inner.lightened(0.2), inner, inner, 0.0)
		# a paler fairy ring of trodden grass round the edge
		var edge := Color("#d8f0a0")
		b.quad(Vector3(cos(a1) * 0.82, 0.03, sin(a1) * 0.82), Vector3(cos(a0) * 0.82, 0.03, sin(a0) * 0.82), Vector3(cos(a0) * 0.68, 0.03, sin(a0) * 0.68), Vector3(cos(a1) * 0.68, 0.03, sin(a1) * 0.68), edge)
	for i in range(8):
		var a := TAU * float(i) / 8.0 + 0.2
		var p := Vector3(cos(a) * 0.82, 0.0, sin(a) * 0.82)
		var h := 0.24 + 0.07 * float(i % 3)
		var cap := Color("#d83a3a") if i % 3 != 2 else Color("#e8883a")
		b.cylinder(p, 0.045, 0.035, h, 5, Color("#d8d0c0"), Color("#f4f0e4"))
		b.blob(p + Vector3(0.0, h + 0.015, 0.0), Vector3(0.15, 0.1, 0.15), 7, 3, cap.darkened(0.15), cap.lightened(0.15), 0.0, 0.03, float(i))
		for k in range(3):
			var ka := TAU * float(k) / 3.0 + float(i)
			b.box(p + Vector3(cos(ka) * 0.05, h + 0.07, sin(ka) * 0.05), Vector3(0.025, 0.012, 0.025), WHITE)
	# a few small flowers inside, and the motes: tiny bright diamonds hanging over the circle
	for i in range(5):
		var a := TAU * float(i) / 5.0 + 1.0
		var p := Vector3(cos(a) * 0.4, 0.0, sin(a) * 0.4)
		b.cylinder(p, 0.01, 0.01, 0.12, 4, LEAF_D, LEAF)
		b.blob(p + Vector3(0.0, 0.13, 0.0), Vector3(0.04, 0.025, 0.04), 5, 2, Color("#f0a0d0"), Color("#fff0f8"), 0.0, 0.0)
	var mote: Array = [Color("#fff6a0"), Color("#ffc0f0"), Color("#b0f0ff")]
	for i in range(7):
		var a := TAU * float(i) / 7.0 + 0.5
		var r := 0.25 + 0.4 * _h(float(i), 3.0)
		var p := Vector3(cos(a) * r, 0.35 + 0.35 * _h(float(i), 7.0), sin(a) * r)
		var c: Color = mote[i % mote.size()]
		b.box(p, Vector3(0.05, 0.05, 0.05), c, 0.0, a)
		b.box(p, Vector3(0.015, 0.11, 0.015), c.lightened(0.3), 0.0)
		b.box(p, Vector3(0.11, 0.015, 0.015), c.lightened(0.3), 0.0, a)


static func _dragon_egg(b: FarmMesh) -> void:
	# a big egg of green and violet scales in a nest of twigs, one scale ridge of gold, warm
	for i in range(14):
		var a := TAU * float(i) / 14.0
		var tw := Vector3(cos(a) * 0.3, 0.07 + 0.03 * float(i % 3), sin(a) * 0.3)
		b.box(tw, Vector3(0.36, 0.04, 0.05), WOOD if i % 2 == 0 else WOOD_L, 0.0, a + 1.6)
	b.blob(Vector3(0.0, 0.1, 0.0), Vector3(0.34, 0.1, 0.34), 8, 2, WOOD_D, WOOD, 0.0, 0.1, 2.0)
	b.blob(Vector3(0.0, 0.5, 0.0), Vector3(0.22, 0.32, 0.22), 10, 6, Color("#2a6a4a"), Color("#8a5ae0"), 0.0, 0.0, 1.0)
	# scale rows: little flat diamonds laid over it
	for r in range(4):
		var y := 0.28 + 0.12 * float(r)
		var rad := 0.2 - 0.02 * absf(float(r) - 1.0) * 1.2
		for i in range(8):
			var a := TAU * (float(i) + 0.5 * float(r % 2)) / 8.0
			var c := Color("#3aa070") if (i + r) % 2 == 0 else Color("#9a6af0")
			b.blob(Vector3(cos(a) * rad, y, sin(a) * rad), Vector3(0.05, 0.05, 0.05), 4, 2, c.darkened(0.15), c.lightened(0.25), 0.0, 0.0)
	b.cone(Vector3(0.0, 0.8, 0.0), 0.03, 0.06, 4, GOLD, GOLD_L)


static func _wisp_jar(b: FarmMesh) -> void:
	# a glass jar on a small plinth with a blue wisp in it and a cork
	b.cylinder(Vector3.ZERO, 0.22, 0.2, 0.08, 8, STONE_D, STONE)
	b.cylinder(Vector3(0.0, 0.08, 0.0), 0.16, 0.16, 0.42, 8, Color("#9cc8e0"), Color("#d8f0ff"), 0.0)
	b.cylinder(Vector3(0.0, 0.5, 0.0), 0.1, 0.1, 0.07, 8, WOOD, WOOD_L)
	b.cone(Vector3(0.0, 0.5, 0.0), 0.16, 0.0001, 8, Color("#d8f0ff"), Color("#d8f0ff"))
	b.blob(Vector3(0.0, 0.3, 0.0), Vector3(0.1, 0.12, 0.1), 7, 3, Color("#7ac0f0"), Color("#e8fbff"), 0.0, 0.0)
	b.cone(Vector3(0.0, 0.38, 0.0), 0.05, 0.14, 5, Color("#bfe8ff"), Color("#ffffff"))


static func _ghost_flag(b: FarmMesh) -> void:
	# Halloween: a dark pole with a ragged ghost-white banner and a hollow-eyed face
	b.cylinder(Vector3.ZERO, 0.04, 0.03, 1.7, 5, WOOD_D, WOOD)
	b.blob(Vector3(0.0, 1.72, 0.0), Vector3.ONE * 0.05, 5, 2, GOLD, GOLD_L, 0.0, 0.0)
	b.box(Vector3(0.0, 1.66, 0.0), Vector3(0.5, 0.04, 0.04), WOOD)
	var cloth := Color("#e6f4ee")
	b.quad(Vector3(-0.22, 1.62, 0.01), Vector3(-0.22, 0.95, 0.01), Vector3(0.22, 0.95, 0.01), Vector3(0.22, 1.62, 0.01), cloth)
	b.quad(Vector3(0.22, 1.62, -0.01), Vector3(0.22, 0.95, -0.01), Vector3(-0.22, 0.95, -0.01), Vector3(-0.22, 1.62, -0.01), cloth.darkened(0.1))
	# the ragged tail: three points
	for i in range(3):
		var x := -0.15 + 0.15 * float(i)
		b.tri(Vector3(x - 0.075, 0.95, 0.012), Vector3(x + 0.075, 0.95, 0.012), Vector3(x, 0.78 + 0.06 * float(i % 2), 0.012), cloth, cloth, cloth.darkened(0.05))
	b.box(Vector3(-0.08, 1.4, 0.02), Vector3(0.07, 0.1, 0.01), DARK)
	b.box(Vector3(0.08, 1.4, 0.02), Vector3(0.07, 0.1, 0.01), DARK)
	b.box(Vector3(0.0, 1.22, 0.02), Vector3(0.1, 0.12, 0.01), DARK)


static func _lights(b: FarmMesh) -> void:
	# Christmas: a post with a string of coloured bulbs looped down from its top
	b.cylinder(Vector3.ZERO, 0.04, 0.035, 1.5, 5, WOOD_D, WOOD)
	b.box(Vector3(0.0, 1.5, 0.0), Vector3(0.1, 0.04, 0.04), WOOD)
	var cols: Array = [Color("#ff5a5a"), Color("#ffd85a"), Color("#5ad87a"), Color("#6aa8ff")]
	for k in range(2):
		var sgn := -1.0 if k == 0 else 1.0
		for i in range(8):
			var t := float(i) / 7.0
			var p := Vector3(sgn * (0.06 + 0.4 * t), 1.5 - 0.22 * sin(PI * t) - 0.35 * t, 0.0)
			b.box(p, Vector3(0.025, 0.025, 0.025), Color("#2a3a2a"))
			b.blob(p + Vector3(0.0, -0.05, 0.0), Vector3(0.05, 0.065, 0.05), 5, 3, cols[(i + k) % cols.size()].darkened(0.1), cols[(i + k) % cols.size()].lightened(0.45), 0.0, 0.0)
	b.cone(Vector3(0.0, 1.54, 0.0), 0.06, 0.1, 5, GOLD, GOLD_L)


static func _easter_twigs(b: FarmMesh) -> void:
	# bare twigs in a bundle, hung with coloured eggs and a ribbon
	b.cylinder(Vector3.ZERO, 0.12, 0.1, 0.22, 7, Color("#6a8ac0"), Color("#9ab8e0"))
	b.cylinder(Vector3(0.0, 0.2, 0.0), 0.11, 0.11, 0.02, 7, Color("#4a6aa0"), Color("#4a6aa0"), 0.0, false)
	var cols: Array = [Color("#ff8aa8"), Color("#ffe06a"), Color("#6ad8a8"), Color("#8ab0ff"), Color("#d89aff")]
	for i in range(6):
		var a := TAU * float(i) / 6.0
		var tip := Vector3(cos(a) * 0.5, 1.15 + 0.25 * float(i % 3), sin(a) * 0.5)
		var mid := Vector3(cos(a) * 0.2, 0.7, sin(a) * 0.2)
		b.blade(Vector3(0.0, 0.2, 0.0), mid, 0.045, WOOD_D, WOOD, 0.0, a)
		b.blade(mid, tip, 0.035, WOOD, WOOD_L, 0.0, a)
		b.blade(mid, tip, 0.035, WOOD, WOOD_L, 0.0, a + PI * 0.5)
		var ep := mid.lerp(tip, 0.6) + Vector3(0.0, -0.12, 0.0)
		var c: Color = cols[i % cols.size()]
		b.cylinder(mid.lerp(tip, 0.6) + Vector3(0.0, -0.04, 0.0), 0.004, 0.004, 0.04, 3, WOOD, WOOD)
		b.blob(ep, Vector3(0.055, 0.07, 0.055), 6, 3, c.darkened(0.15), c.lightened(0.3), 0.0, 0.0)
	b.box(Vector3(0.0, 0.17, 0.1), Vector3(0.28, 0.05, 0.03), Color("#ff6a8a"))
	b.blob(Vector3(0.0, 0.2, 0.12), Vector3(0.07, 0.05, 0.04), 5, 2, Color("#ff6a8a"), Color("#ffaac0"), 0.0, 0.0)


static func _egg_basket(b: FarmMesh) -> void:
	# a wicker basket with a handle, full of painted eggs and green paper grass
	var wick := Color("#c8964a")
	b.cylinder(Vector3.ZERO, 0.22, 0.3, 0.26, 8, wick.darkened(0.25), wick)
	for i in range(3):
		b.cylinder(Vector3(0.0, 0.05 + 0.07 * float(i), 0.0), 0.225 + 0.02 * float(i), 0.225 + 0.02 * float(i), 0.015, 8, wick.darkened(0.35), wick.darkened(0.2), 0.0, false)
	b.blob(Vector3(0.0, 0.27, 0.0), Vector3(0.29, 0.06, 0.29), 8, 2, MOSS, LEAF_L, 0.0, 0.18, 4.0)
	var cols: Array = [Color("#ff8aa8"), Color("#ffe06a"), Color("#6ad8a8"), Color("#8ab0ff"), Color("#d89aff"), Color("#ff9a4a")]
	for i in range(7):
		var a := TAU * float(i) / 7.0
		var r := 0.0 if i == 0 else 0.17
		var c: Color = cols[i % cols.size()]
		b.blob(Vector3(cos(a) * r, 0.34 + (0.04 if i == 0 else 0.0), sin(a) * r), Vector3(0.075, 0.1, 0.075), 6, 3, c.darkened(0.15), c.lightened(0.3), 0.0, 0.0, float(i))
		b.box(Vector3(cos(a) * r, 0.37, sin(a) * r + 0.07), Vector3(0.07, 0.015, 0.01), WHITE)
	# the handle: an arch
	for i in range(8):
		var a := PI * float(i) / 7.0
		b.blob(Vector3(cos(a) * 0.27, 0.34 + sin(a) * 0.32, 0.0), Vector3.ONE * 0.025, 4, 2, wick.darkened(0.2), wick, 0.0, 0.0)
	b.blob(Vector3(0.0, 0.7, 0.0), Vector3(0.07, 0.05, 0.03), 5, 2, Color("#ff6a8a"), Color("#ffaac0"), 0.0, 0.0)


static func _flower_wreath(b: FarmMesh) -> void:
	# flat: a ring of leaves with flowers of every colour and a bow
	var cols: Array = [Color("#ff7a9a"), Color("#ffd85a"), Color("#fffaf0"), Color("#b08aff"), Color("#6ac8ff")]
	for i in range(16):
		var a := TAU * float(i) / 16.0
		b.blob(Vector3(cos(a) * 0.33, 0.04, sin(a) * 0.33), Vector3(0.1, 0.035, 0.07), 5, 2, LEAF_D, LEAF, 0.0, 0.0, float(i))
	for i in range(8):
		var a := TAU * float(i) / 8.0 + 0.2
		var c: Color = cols[i % cols.size()]
		b.blob(Vector3(cos(a) * 0.33, 0.08, sin(a) * 0.33), Vector3(0.075, 0.045, 0.075), 6, 2, c.darkened(0.12), c.lightened(0.25), 0.0, 0.0, float(i))
		b.blob(Vector3(cos(a) * 0.33, 0.115, sin(a) * 0.33), Vector3.ONE * 0.025, 4, 2, GOLD, GOLD_L, 0.0, 0.0)
	b.blob(Vector3(0.0, 0.07, 0.4), Vector3(0.08, 0.04, 0.05), 5, 2, Color("#ff5a7a"), Color("#ffa0b8"), 0.0, 0.0)
	b.box(Vector3(0.0, 0.03, 0.46), Vector3(0.05, 0.015, 0.12), Color("#ff5a7a"))


# ---------------------------------------------------------------------------
# Mining: cave walls, rocks, ore, crystals, mushrooms


static func _cave_wall(b: FarmMesh, theme: int, lit: bool) -> void:
	var pal: Array = ROCK[clampi(theme, 0, ROCK.size() - 1)]
	# a block of rock 2 m tall, rough on top, lighter courses on its face; neighbours join into a mass
	var h := 1.9
	b.box(Vector3(0.0, h * 0.5, 0.0), Vector3(1.0, h, 1.0), pal[1], 0.0, 0.0, pal[1].lightened(0.06))
	# layered courses on the front and sides
	for k in range(3):
		var y := 0.35 + 0.55 * float(k)
		var c: Color = pal[0] if k % 2 == 0 else pal[2]
		b.box(Vector3(0.0, y, 0.505), Vector3(0.9 - 0.1 * float((k + theme) % 2), 0.12, 0.02), c.lerp(pal[1], 0.5))
		b.box(Vector3(0.505, y + 0.1, 0.0), Vector3(0.02, 0.1, 0.8), c.lerp(pal[1], 0.5))
		b.box(Vector3(-0.505, y + 0.1, 0.0), Vector3(0.02, 0.1, 0.7), c.lerp(pal[1], 0.6))
	# the uneven top
	b.blob(Vector3(0.0, h, 0.0), Vector3(0.5, 0.12, 0.5), 7, 2, pal[1], pal[2], 0.0, 0.25, float(theme) + 2.0)
	b.box(Vector3(0.0, 0.05, 0.0), Vector3(1.0, 0.1, 1.0), pal[0])
	if lit:
		# a bracket and flame on its face (the wall's own torch; the torch object lights it)
		b.box(Vector3(0.0, 1.2, 0.54), Vector3(0.08, 0.34, 0.07), WOOD_D)
		b.cone(Vector3(0.0, 1.38, 0.55), 0.07, 0.12, 5, Color("#ff8a2a"), Color("#ffd870"))


static func _cave_torch(b: FarmMesh) -> void:
	# a wall torch stood on the floor against the rock: an iron sconce on a short post and a flame
	b.cylinder(Vector3.ZERO, 0.06, 0.05, 1.05, 5, WOOD_D, WOOD)
	b.box(Vector3(0.0, 0.04, 0.0), Vector3(0.26, 0.08, 0.26), STONE_D, 0.0, 0.0, STONE)
	b.cylinder(Vector3(0.0, 1.0, 0.0), 0.1, 0.07, 0.12, 6, IRON.darkened(0.2), IRON)
	b.cone(Vector3(0.0, 1.1, 0.0), 0.075, 0.28, 6, Color("#ff7a2a"), Color("#ffe27a"))
	b.cone(Vector3(0.0, 1.12, 0.0), 0.04, 0.2, 5, Color("#ffe27a"), Color("#fff6c8"))


static func _cave_exit(b: FarmMesh) -> void:
	# flat: worn stone slabs with a step up, and daylight lying on them
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.98, 0.06, 0.98), STONE, 0.0, 0.0, STONE_L)
	b.box(Vector3(0.0, 0.07, 0.0), Vector3(0.74, 0.04, 0.74), STONE_L, 0.0, 0.0, Color("#e8e4d4"))
	b.box(Vector3(0.0, 0.1, -0.1), Vector3(0.5, 0.03, 0.4), Color("#f6f2dc"))
	b.cone(Vector3(0.0, 0.1, 0.22), 0.12, 0.0001, 3, Color("#d8d0b0"), Color("#d8d0b0"))
	for i in range(3):
		b.box(Vector3(-0.2 + 0.2 * float(i), 0.115, 0.28), Vector3(0.1, 0.012, 0.12), Color("#fff8c8"), 0.0, 0.0)


static func _bath_exit(b: FarmMesh) -> void:
	# flat: the bathhouse's wooden doormat with a rope edge
	b.box(Vector3(0.0, 0.02, 0.0), Vector3(0.9, 0.04, 0.6), WOOD_L.darkened(0.1), 0.0, 0.0, WOOD_L)
	for i in range(5):
		b.box(Vector3(0.0, 0.045, -0.24 + 0.12 * float(i)), Vector3(0.84, 0.01, 0.015), WOOD_D)
	b.box(Vector3(0.0, 0.045, 0.31), Vector3(0.9, 0.012, 0.03), Color("#d8c89a"))


static func _cave_rock(b: FarmMesh, theme: int) -> void:
	var pal: Array = ROCK[clampi(theme, 0, ROCK.size() - 1)]
	_rock(b, Vector3.ZERO, Vector3(0.42, 0.36, 0.38), pal, 3.0 + float(theme))
	_rock(b, Vector3(0.28, 0.0, 0.18), Vector3(0.2, 0.16, 0.18), pal, 8.0 + float(theme))
	b.blob(Vector3(-0.2, 0.1, 0.22), Vector3(0.14, 0.1, 0.14), 6, 2, pal[0], pal[1], 0.0, 0.2, 4.0)


static func _stalagmite(b: FarmMesh, theme: int) -> void:
	var pal: Array = ROCK[clampi(theme, 0, ROCK.size() - 1)]
	b.cone(Vector3.ZERO, 0.28, 1.15, 7, pal[0], pal[2], 0.0, 0.0, 0.3)
	b.cone(Vector3(0.28, 0.0, 0.1), 0.17, 0.62, 6, pal[0], pal[2].lightened(0.1), 0.0, 0.0)
	b.cone(Vector3(-0.22, 0.0, 0.2), 0.13, 0.4, 5, pal[0], pal[2], 0.0, 0.0)
	b.blob(Vector3(0.0, 0.06, 0.0), Vector3(0.5, 0.1, 0.45), 7, 2, pal[0], pal[1], 0.0, 0.15, 3.0)


static func _ore(b: FarmMesh, kind: int) -> void:
	# grey rock with veins of copper-brown (0) or silver-blue (1) ore chunks
	var pal: Array = [STONE_D, STONE, STONE_L]
	_rock(b, Vector3.ZERO, Vector3(0.42, 0.38, 0.38), pal, 6.0 + float(kind))
	var o_dark := Color("#8a4a2a") if kind == 0 else Color("#5a7898")
	var o_light := Color("#e0905a") if kind == 0 else Color("#bcd4f0")
	for i in range(6):
		var a := TAU * float(i) / 6.0 + 0.3
		var p := Vector3(cos(a) * 0.3, 0.2 + 0.12 * float(i % 3), sin(a) * 0.3)
		b.cone(p, 0.07, 0.15, 4, o_dark, o_light, 0.0, 0.0, a)
	b.cone(Vector3(0.0, 0.5, 0.0), 0.08, 0.16, 4, o_dark, o_light)


static func _vein(b: FarmMesh, c1: Color, c2: Color, n: int) -> void:
	# a rock face with a bright vein: gold nuggets or gems sticking out of the stone
	var pal: Array = [STONE_D, STONE, STONE_L]
	_rock(b, Vector3.ZERO, Vector3(0.42, 0.4, 0.4), pal, 9.0 + float(n))
	for i in range(n):
		var a := TAU * float(i) / float(n) + 0.6
		var p := Vector3(cos(a) * 0.34, 0.14 + 0.11 * float(i), sin(a) * 0.34)
		if n == 5:
			b.blob(p, Vector3(0.1, 0.075, 0.09), 5, 2, c1.darkened(0.2), c2, 0.0, 0.05, float(i))
		else:
			_shard(b, p, 0.06, 0.2, [c1.darkened(0.3), c1 if i % 2 == 0 else c2, Color.WHITE], a)
	b.cone(Vector3(0.0, 0.52, 0.0), 0.08, 0.14, 4, c1.darkened(0.2), c2)


static func _crystal(b: FarmMesh, pal_i: int) -> void:
	var pal: Array = CRYSTALS[pal_i]
	_shard(b, Vector3.ZERO, 0.17, 0.95, pal)
	_shard(b, Vector3(0.24, 0.0, 0.08), 0.11, 0.58, pal, 0.5)
	_shard(b, Vector3(-0.2, 0.0, 0.16), 0.1, 0.42, pal, 1.0)
	_shard(b, Vector3(0.05, 0.0, -0.24), 0.09, 0.5, pal, 2.0)
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.48, 0.1, 0.42), 7, 2, STONE_D, STONE, 0.0, 0.15, 5.0)


static func _fire_crystal(b: FarmMesh) -> void:
	var pal: Array = [Color("#8a1a10"), Color("#ff5a20"), Color("#ffe27a")]
	_shard(b, Vector3.ZERO, 0.16, 0.85, pal)
	_shard(b, Vector3(0.22, 0.0, 0.1), 0.11, 0.5, pal, 0.6)
	_shard(b, Vector3(-0.2, 0.0, 0.14), 0.09, 0.4, pal, 1.2)
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.46, 0.1, 0.4), 7, 2, OBSIDIAN, OBSIDIAN_L, 0.0, 0.15, 6.0)
	for i in range(4):
		var a := TAU * float(i) / 4.0 + 0.3
		b.box(Vector3(cos(a) * 0.3, 0.015, sin(a) * 0.3), Vector3(0.22, 0.02, 0.04), LAVA, 0.0, a)


static func _star_crystal(b: FarmMesh) -> void:
	# a pale blue-violet crystal with a four-pointed golden star hovering over it
	var pal: Array = [Color("#4a4a9a"), Color("#a8b8ff"), Color("#ffffff")]
	_shard(b, Vector3.ZERO, 0.15, 0.8, pal)
	_shard(b, Vector3(0.22, 0.0, 0.12), 0.1, 0.45, pal, 0.7)
	_shard(b, Vector3(-0.2, 0.0, 0.1), 0.09, 0.36, pal, 1.4)
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.44, 0.1, 0.4), 7, 2, STONE_D, STONE, 0.0, 0.15, 7.0)
	var star_c := Color("#ffe6a0")
	for k in range(2):
		b.box(Vector3(0.0, 1.12, 0.0), Vector3(0.3, 0.07, 0.05) if k == 0 else Vector3(0.07, 0.3, 0.05), star_c if k == 0 else star_c.lightened(0.1))
	b.box(Vector3(0.0, 1.12, 0.0), Vector3(0.12, 0.12, 0.07), Color("#fff6d8"))


## `lo`: the Låg variant (a wood of a thousand): a plain cap on a stalk, no spots, no small one beside it, fewer sides.
static func stalk_lo(glow: bool) -> Color:
	return Color("#c8d8f0") if glow else Color("#d8d0c0")


static func _giant_mushroom(b: FarmMesh, cap_d: Color, cap: Color, spot: Color, glow: bool, lo := false) -> void:
	# a toadstool as tall as a child: a thick pale stalk, a wide domed cap with spots, a little one beside it
	var stalk := Color("#d8d0c0") if not glow else Color("#c8d8f0")
	if lo:
		b.cylinder(Vector3.ZERO, 0.17, 0.12, 0.9, 5, stalk_lo(glow).darkened(0.15), stalk_lo(glow).lightened(0.1))
		b.blob(Vector3(0.0, 1.0, 0.0), Vector3(0.58, 0.32, 0.58), 7, 3, cap_d, cap.lightened(0.1), 0.0, 0.03, 2.0)
		b.box(Vector3(0.0, 1.31, 0.0), Vector3(0.2, 0.02, 0.2), spot, 0.0, 0.5)
		return
	b.cylinder(Vector3.ZERO, 0.17, 0.12, 0.9, 7, stalk.darkened(0.15), stalk.lightened(0.1))
	b.cylinder(Vector3(0.0, 0.55, 0.0), 0.2, 0.2, 0.03, 7, stalk.darkened(0.25), stalk.darkened(0.1), 0.0, false)
	b.blob(Vector3(0.0, 1.0, 0.0), Vector3(0.58, 0.32, 0.58), 10, 4, cap_d, cap.lightened(0.1), 0.0, 0.03, 2.0)
	b.cylinder(Vector3(0.0, 0.88, 0.0), 0.5, 0.58, 0.07, 10, cap_d.darkened(0.25), cap_d, 0.0, false)
	for i in range(7):
		var a := TAU * float(i) / 7.0 + 0.4
		var r := 0.2 + 0.18 * float(i % 2)
		var p := Vector3(cos(a) * r, 1.0 + 0.3 * sqrt(maxf(0.0, 1.0 - (r / 0.58) * (r / 0.58))) - 0.02, sin(a) * r)
		b.blob(p, Vector3(0.08, 0.04, 0.08), 6, 2, spot.darkened(0.1), spot, 0.0, 0.0, float(i))
	b.blob(Vector3(0.0, 1.31, 0.0), Vector3(0.1, 0.03, 0.1), 6, 2, spot.darkened(0.1), spot, 0.0, 0.0)
	var sx := 0.55
	b.cylinder(Vector3(sx, 0.0, 0.35), 0.06, 0.05, 0.28, 6, stalk.darkened(0.15), stalk)
	b.blob(Vector3(sx, 0.36, 0.35), Vector3(0.19, 0.12, 0.19), 8, 3, cap_d, cap.lightened(0.1), 0.0, 0.03, 4.0)
	b.blob(Vector3(sx + 0.05, 0.42, 0.38), Vector3(0.03, 0.02, 0.03), 5, 2, spot, spot, 0.0, 0.0)


static func _moon_rock(b: FarmMesh) -> void:
	var pal: Array = [Color("#7c7c8a"), Color("#bebec8"), Color("#e8e8f0")]
	_rock(b, Vector3.ZERO, Vector3(0.42, 0.36, 0.4), pal, 11.0, 0.1)
	_rock(b, Vector3(0.3, 0.0, 0.15), Vector3(0.2, 0.15, 0.18), pal, 12.0, 0.1)
	for i in range(3):
		var a := 1.0 + float(i) * 2.0
		b.blob(Vector3(cos(a) * 0.18, 0.26 + 0.06 * float(i), sin(a) * 0.18 + 0.1), Vector3(0.07, 0.025, 0.07), 7, 2, Color("#5c5c6a"), Color("#8a8a98"), 0.0, 0.0, float(i))


static func _moon_cheese(b: FarmMesh) -> void:
	# a yellow wheel of cheese with holes in its rind, a wedge cut out and lying beside it (the moon is made of it)
	var ch := Color("#f0c83a")
	var ch_d := Color("#c8962a")
	b.cylinder(Vector3.ZERO, 0.34, 0.33, 0.26, 12, ch.darkened(0.1), ch.lightened(0.1))
	b.cylinder(Vector3(0.0, 0.0, 0.0), 0.345, 0.345, 0.03, 12, ch_d, ch_d, 0.0, false)
	for i in range(5):
		var a := 0.6 + float(i) * 1.25
		var r := 0.08 + 0.15 * float(i % 2)
		b.blob(Vector3(cos(a) * r, 0.265, sin(a) * r), Vector3(0.055 + 0.01 * float(i % 3), 0.012, 0.055), 6, 2, ch_d.darkened(0.35), ch_d, 0.0, 0.0, float(i))
	for i in range(4):
		var a := 0.2 + float(i) * 1.7
		b.box(Vector3(cos(a) * 0.335, 0.12 + 0.05 * float(i % 2), sin(a) * 0.335), Vector3(0.06, 0.07, 0.04), ch_d.darkened(0.3), 0.0, -a + PI * 0.5)
	# the wedge: a small triangular prism lying on its side
	var w0 := Vector3(0.42, 0.0, 0.3)
	b.tri(w0 + Vector3(0.0, 0.14, 0.0), w0 + Vector3(0.3, 0.14, 0.06), w0 + Vector3(0.1, 0.14, 0.3), ch.lightened(0.15), ch.lightened(0.1), ch.lightened(0.1))
	b.quad(w0 + Vector3(0.1, 0.14, 0.3), w0 + Vector3(0.3, 0.14, 0.06), w0 + Vector3(0.3, 0.0, 0.06), w0 + Vector3(0.1, 0.0, 0.3), ch)
	b.quad(w0 + Vector3(0.3, 0.14, 0.06), w0 + Vector3(0.0, 0.14, 0.0), w0 + Vector3(0.0, 0.0, 0.0), w0 + Vector3(0.3, 0.0, 0.06), ch_d)
	b.quad(w0 + Vector3(0.0, 0.14, 0.0), w0 + Vector3(0.1, 0.14, 0.3), w0 + Vector3(0.1, 0.0, 0.3), w0 + Vector3(0.0, 0.0, 0.0), ch_d.lightened(0.1))


static func _obsidian_rock(b: FarmMesh) -> void:
	# black glassy rock with sharp planes, a violet sheen on the edges and a thin red crack of heat
	var pal: Array = [OBSIDIAN, Color("#2e2538"), Color("#7a6a9a")]
	b.cone(Vector3(0.0, 0.0, 0.0), 0.36, 0.6, 5, pal[0], pal[1], 0.0, 0.14, 0.4)
	b.cone(Vector3(0.28, 0.0, 0.14), 0.22, 0.4, 4, pal[0], pal[2], 0.0, 0.0, 0.9)
	b.cone(Vector3(-0.24, 0.0, 0.1), 0.2, 0.32, 5, pal[0], pal[1].lightened(0.2), 0.0, 0.0)
	b.blob(Vector3(0.0, 0.62, 0.0), Vector3(0.15, 0.1, 0.15), 5, 2, pal[1], pal[2], 0.0, 0.15, 2.0)
	b.box(Vector3(0.0, 0.3, 0.17), Vector3(0.03, 0.34, 0.03), Color("#ff5a20"), 0.0, 0.0, Color("#ffb060"))


static func _ormtand(b: FarmMesh) -> void:
	# the sea serpent's fang: a curved ivory tooth rising out of a ring of dark rock
	b.blob(Vector3(0.0, 0.06, 0.0), Vector3(0.38, 0.1, 0.34), 7, 2, Color("#26413a"), Color("#4a7a6a"), 0.0, 0.12, 3.0)
	var y := 0.08
	var x := -0.1
	for i in range(6):
		var t := float(i) / 5.0
		var r := 0.17 * (1.0 - 0.85 * t)
		b.cone(Vector3(x, y, 0.0), r, 0.16, 6, BONE_D.lerp(BONE, t), BONE.lerp(WHITE, t), 0.0, r * 0.88)
		y += 0.14
		x += 0.07 * t + 0.01
	b.cone(Vector3(x, y, 0.0), 0.03, 0.12, 5, BONE, WHITE)


static func _alvlykta(b: FarmMesh) -> void:
	# the elves' lantern: a thin silver post with a leaf-shaped cage round a green light
	b.cylinder(Vector3.ZERO, 0.045, 0.03, 1.0, 6, Color("#8ab090"), Color("#c4d4c4"))
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.3, 0.06, 0.3), Color("#a8b0a0"), 0.0, 0.0, Color("#c4ccbc"))
	b.blob(Vector3(0.0, 1.15, 0.0), Vector3(0.12, 0.17, 0.12), 6, 3, Color("#7ae890"), Color("#e8fff0"), 0.0, 0.0)
	for i in range(4):
		var a := TAU * float(i) / 4.0
		b.blade(Vector3(0.0, 1.0, 0.0), Vector3(cos(a) * 0.04, 1.34, sin(a) * 0.04), 0.14, Color("#a8c0a8"), Color("#e0f0e0"), 0.0, a)
	b.cone(Vector3(0.0, 1.32, 0.0), 0.07, 0.14, 5, Color("#8ab090"), Color("#dfe6d6"))


static func _hels_lykta(b: FarmMesh) -> void:
	# Hel's lantern: a bone post hung with a pale green flame in a skull cage
	b.cylinder(Vector3.ZERO, 0.05, 0.04, 0.95, 5, BONE_D, BONE)
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.3, 0.06, 0.3), STONE_D, 0.0, 0.0, STONE)
	b.box(Vector3(0.0, 0.95, 0.0), Vector3(0.28, 0.04, 0.04), BONE)
	b.cylinder(Vector3(0.15, 0.68, 0.0), 0.012, 0.012, 0.27, 3, IRON, IRON)
	b.blob(Vector3(0.15, 0.55, 0.0), Vector3(0.1, 0.12, 0.1), 7, 3, Color("#4aa088"), Color("#d8fff0"), 0.0, 0.0)
	b.box(Vector3(0.15, 0.58, 0.085), Vector3(0.04, 0.04, 0.02), DARK)
	b.box(Vector3(0.12, 0.6, 0.085), Vector3(0.025, 0.04, 0.02), DARK)
	b.cone(Vector3(0.15, 0.63, 0.0), 0.05, 0.16, 5, Color("#8affd0"), Color("#ffffff"))


static func _bifrostbit(b: FarmMesh) -> void:
	# a splinter of the rainbow bridge: a chunk of banded crystal, each band a colour
	var cols: Array = [Color("#ff7a9a"), Color("#ffc35a"), Color("#7fe08a"), Color("#6ac8ff"), Color("#b08aff")]
	for i in range(5):
		var c: Color = cols[i]
		b.box(Vector3(0.0, 0.1 + 0.11 * float(i), 0.0), Vector3(0.52 - 0.06 * float(i), 0.11, 0.38 - 0.04 * float(i)), c.darkened(0.1), 0.0, 0.12 * float(i), c.lightened(0.35))
	b.cone(Vector3(0.0, 0.62, 0.0), 0.12, 0.2, 5, cols[4], Color("#f0e0ff"))
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.62, 0.06, 0.48), STONE_D, 0.0, 0.0, STONE)


static func _dvargstaty(b: FarmMesh) -> void:
	# a stone dwarf with a pointed hat and a long beard, a pick on his shoulder, on a plinth
	b.box(Vector3(0.0, 0.14, 0.0), Vector3(0.62, 0.28, 0.62), STONE_D, 0.0, 0.0, STONE)
	b.box(Vector3(0.0, 0.58, 0.0), Vector3(0.34, 0.6, 0.26), STONE, 0.0, 0.0, STONE.lightened(0.08))
	b.blob(Vector3(0.0, 1.0, 0.0), Vector3(0.16, 0.16, 0.15), 6, 3, STONE, STONE.lightened(0.12), 0.0, 0.0)
	b.cone(Vector3(0.0, 0.88, 0.1), 0.13, 0.34, 6, STONE.darkened(0.05), STONE.lightened(0.1), 0.0, 0.02)
	b.cone(Vector3(0.0, 1.08, 0.0), 0.19, 0.28, 6, STONE_D, STONE)
	b.box(Vector3(0.24, 0.9, 0.05), Vector3(0.05, 0.6, 0.05), WOOD)
	b.box(Vector3(0.24, 1.2, 0.05), Vector3(0.26, 0.08, 0.06), IRON)
	b.blob(Vector3(0.0, 0.5, 0.15), Vector3(0.11, 0.06, 0.05), 5, 2, GOLD, GOLD_L, 0.0, 0.0)


static func _fenrislanka(b: FarmMesh) -> void:
	# Fenrir's broken chain: heavy links in a heap with a cut shackle on top, ice-blue where it is cold
	for i in range(7):
		var a := TAU * float(i) / 7.0
		var p := Vector3(cos(a) * 0.18, 0.06 + 0.07 * float(i % 3), sin(a) * 0.18)
		b.box(p, Vector3(0.2, 0.07, 0.12) if i % 2 == 0 else Vector3(0.12, 0.07, 0.2), IRON.darkened(0.15), 0.0, a, IRON_L)
		b.box(p + Vector3(0.0, 0.04, 0.0), Vector3(0.1, 0.02, 0.04) if i % 2 == 0 else Vector3(0.04, 0.02, 0.1), Color("#a8dcf0"), 0.0, a)
	b.cylinder(Vector3(0.0, 0.2, 0.0), 0.13, 0.13, 0.07, 8, IRON.darkened(0.3), IRON)
	b.box(Vector3(0.0, 0.03, 0.0), Vector3(0.62, 0.06, 0.52), Color("#dde8f0"))


static func _solruna(b: FarmMesh) -> void:
	# a standing stone with a golden sun rune: a circle with rays
	b.box(Vector3(0.0, 0.08, 0.0), Vector3(0.62, 0.16, 0.5), STONE_D, 0.0, 0.0, STONE)
	b.box(Vector3(0.0, 0.7, 0.0), Vector3(0.44, 1.1, 0.3), STONE, 0.0, 0.0, STONE.lightened(0.1))
	b.cone(Vector3(0.0, 1.25, 0.0), 0.3, 0.2, 4, STONE, STONE.lightened(0.1), 0.0, 0.1)
	b.blob(Vector3(0.0, 0.85, 0.16), Vector3(0.12, 0.12, 0.02), 8, 2, GOLD, GOLD_L, 0.0, 0.0)
	for i in range(8):
		var a := TAU * float(i) / 8.0
		b.box(Vector3(cos(a) * 0.2, 0.85 + sin(a) * 0.2, 0.16), Vector3(0.04, 0.04, 0.02), GOLD_L, 0.0, a)


# ---------------------------------------------------------------------------
# Landmarks: pyramid, temple, volcano, shipwreck, ruin


static func _pyramid(b: FarmMesh) -> void:
	# 6 × 4: courses of sandstone blocks stepping up to a golden cap; a doorway with two torches on its front
	var steps := 7
	for i in range(steps):
		var t := float(i) / float(steps)
		var w := 5.7 * (1.0 - 0.86 * t)
		var d := 3.7 * (1.0 - 0.86 * t)
		var c := SANDSTONE.lerp(SANDSTONE_D, 0.3 * float(i % 2))
		b.box(Vector3(0.0, 0.3 + 0.45 * float(i), 0.0), Vector3(w, 0.6, d), c.darkened(0.04 * float(i % 2)), 0.0, 0.0, c.lightened(0.1))
	b.cone(Vector3(0.0, 3.4, 0.0), 0.5, 0.65, 4, GOLD, GOLD_L, 0.0, 0.0, PI * 0.25)
	# a doorway at the middle of the front: a dark opening with a lintel, steps and a pair of torches
	b.box(Vector3(0.0, 0.5, 1.9), Vector3(1.2, 1.0, 0.3), SANDSTONE_D.darkened(0.1), 0.0, 0.0, SANDSTONE)
	b.box(Vector3(0.0, 0.42, 2.06), Vector3(0.7, 0.84, 0.05), Color("#110d0b"))
	b.box(Vector3(0.0, 0.9, 2.05), Vector3(0.95, 0.12, 0.12), GOLD.darkened(0.2), 0.0, 0.0, GOLD)
	b.box(Vector3(0.0, 0.05, 2.28), Vector3(1.5, 0.1, 0.5), SANDSTONE, 0.0, 0.0, SANDSTONE.lightened(0.1))
	b.box(Vector3(0.0, 0.14, 2.2), Vector3(1.2, 0.08, 0.3), SANDSTONE.lightened(0.05))
	for sx in [-0.85, 0.85]:
		b.cylinder(Vector3(sx, 0.0, 2.15), 0.05, 0.04, 0.9, 5, WOOD_D, WOOD)
		b.cylinder(Vector3(sx, 0.9, 2.15), 0.09, 0.07, 0.1, 6, IRON.darkened(0.2), IRON)
		b.cone(Vector3(sx, 1.0, 2.15), 0.07, 0.24, 6, Color("#ff7a2a"), Color("#ffe27a"))
	# a few fallen blocks and a sand drift at the foot
	b.box(Vector3(-2.3, 0.14, 1.7), Vector3(0.5, 0.28, 0.4), SANDSTONE_D, 0.0, 0.4, SANDSTONE)
	b.box(Vector3(2.2, 0.1, 1.5), Vector3(0.36, 0.2, 0.3), SANDSTONE_D, 0.0, -0.3, SANDSTONE)
	b.blob(Vector3(-2.6, 0.08, -1.2), Vector3(0.5, 0.1, 0.35), 7, 2, SAND_D, SAND, 0.0, 0.1, 2.0)


static func _temple(b: FarmMesh) -> void:
	# 4 × 3: a grey-green stone temple on three steps: front columns, a pediment roof, a dark door, braziers beside it
	var st := Color("#8e9c7e")
	var st_d := Color("#55614b")
	b.box(Vector3(0.0, 0.1, 0.0), Vector3(3.9, 0.2, 2.9), st_d, 0.0, 0.0, st)
	b.box(Vector3(0.0, 0.3, -0.05), Vector3(3.6, 0.2, 2.6), st_d.lightened(0.05), 0.0, 0.0, st.lightened(0.05))
	b.box(Vector3(0.0, 0.5, -0.1), Vector3(3.3, 0.2, 2.3), st_d.lightened(0.1), 0.0, 0.0, st.lightened(0.1))
	b.box(Vector3(0.0, 1.0, -0.4), Vector3(2.8, 1.0, 1.5), st, 0.0, 0.0, st.lightened(0.12))
	b.box(Vector3(0.0, 0.75, 0.37), Vector3(0.8, 1.0, 0.1), Color("#110d0b"))
	b.box(Vector3(0.0, 1.3, 0.38), Vector3(1.0, 0.1, 0.12), GOLD.darkened(0.15), 0.0, 0.0, GOLD)
	for i in range(4):
		var x := -1.2 + 0.8 * float(i)
		b.cylinder(Vector3(x, 0.6, 0.8), 0.17, 0.15, 1.4, 8, st.darkened(0.12), st.lightened(0.15))
		b.cylinder(Vector3(x, 0.6, 0.8), 0.22, 0.2, 0.1, 8, st_d, st)
		b.cylinder(Vector3(x, 2.0, 0.8), 0.22, 0.22, 0.12, 8, st_d, st.lightened(0.1))
	# the roof: a beam and a triangle pediment with a gold sun
	b.box(Vector3(0.0, 2.17, 0.4), Vector3(3.6, 0.2, 1.7), st_d, 0.0, 0.0, st)
	b.tri(Vector3(-1.8, 2.27, 1.25), Vector3(1.8, 2.27, 1.25), Vector3(0.0, 3.0, 1.25), st, st, st.lightened(0.15))
	b.tri(Vector3(1.8, 2.27, -0.45), Vector3(-1.8, 2.27, -0.45), Vector3(0.0, 3.0, -0.45), st_d, st_d, st_d)
	b.quad(Vector3(-1.8, 2.27, 1.25), Vector3(0.0, 3.0, 1.25), Vector3(0.0, 3.0, -0.45), Vector3(-1.8, 2.27, -0.45), st_d.lightened(0.1))
	b.quad(Vector3(0.0, 3.0, 1.25), Vector3(1.8, 2.27, 1.25), Vector3(1.8, 2.27, -0.45), Vector3(0.0, 3.0, -0.45), st_d.lightened(0.05))
	b.blob(Vector3(0.0, 2.55, 1.27), Vector3(0.2, 0.2, 0.02), 8, 2, GOLD, GOLD_L, 0.0, 0.0)
	# a brazier on each side of the steps
	for sx in [-1.7, 1.7]:
		b.cylinder(Vector3(sx, 0.0, 1.35), 0.04, 0.04, 0.7, 5, IRON, IRON)
		b.cylinder(Vector3(sx, 0.7, 1.35), 0.16, 0.2, 0.14, 8, IRON.darkened(0.2), IRON)
		b.cone(Vector3(sx, 0.84, 1.35), 0.14, 0.3, 6, Color("#ff7a2a"), Color("#ffe27a"))
	b.box(Vector3(0.0, 0.07, 1.4), Vector3(1.4, 0.14, 0.3), st_d.lightened(0.1), 0.0, 0.0, st)


static func _volcano(b: FarmMesh) -> void:
	# 6 × 5: a dark cone with a crater, lava running down in red-orange streaks, smoke and embers above, a glow at the lip
	var rock := Color("#3e343e")
	var rock_l := Color("#6a5a68")
	var h := 3.2
	var rb := 2.7
	var rt := 0.9
	# the flank: two stacked frustums (a foot and a body), the lower one wider and lower, so it is not a plain cone
	b.cone(Vector3.ZERO, rb, 1.4, 12, rock.darkened(0.2), rock, 0.0, rb * 0.62)
	b.cone(Vector3(0.0, 1.4, 0.0), rb * 0.62, h - 1.4, 12, rock, rock_l, 0.0, rt)
	# the rim and the bowl of the crater: a ring of light ash round a pit of lava
	b.cylinder(Vector3(0.0, h - 0.02, 0.0), rt, rt * 0.7, 0.14, 12, rock_l, rock_l.lightened(0.1), 0.0, false)
	b.cylinder(Vector3(0.0, h - 0.1, 0.0), rt * 0.72, rt * 0.72, 0.18, 12, LAVA.darkened(0.3), LAVA, 0.0, true)
	b.blob(Vector3(0.0, h + 0.07, 0.0), Vector3(rt * 0.62, 0.05, rt * 0.62), 10, 2, LAVA, LAVA_L, 0.0, 0.05, 3.0)
	# lava running down the flank: strips on the cone's skin (radius falls from rb to rt over the height)
	var streaks: Array = [[1.45, 0.62], [1.05, 0.3], [2.0, 0.5], [0.6, 0.38], [3.0, 0.45], [4.4, 0.35], [5.4, 0.5]]
	for st in streaks:
		var ang: float = st[0]
		var drop: float = st[1]
		var ya := h
		var yb := h - drop * h
		var ra := _vol_r(ya, rb, rt, h, 1.4) + 0.03
		var rbm := _vol_r(yb, rb, rt, h, 1.4) + 0.03
		var top := Vector3(cos(ang) * ra, ya - 0.1, sin(ang) * ra)
		var foot := Vector3(cos(ang + 0.1) * rbm, yb, sin(ang + 0.1) * rbm)
		var mid := top.lerp(foot, 0.45) + Vector3(cos(ang) * 0.02, 0.0, sin(ang) * 0.02)
		b.blade(top, mid, 0.3, LAVA_L, LAVA, 0.0, ang + PI * 0.5)
		b.blade(mid, foot, 0.28, LAVA, LAVA.darkened(0.3), 0.0, ang + PI * 0.5)
		b.blob(foot, Vector3(0.14, 0.05, 0.14), 6, 2, LAVA.darkened(0.3), LAVA, 0.0, 0.1, ang)
	# smoke: soft grey puffs over the crater, and a few flying embers
	var smoke := Color("#b4b8c4")
	b.blob(Vector3(0.1, 3.75, -0.1), Vector3(0.45, 0.32, 0.4), 7, 3, smoke.darkened(0.2), smoke.lightened(0.2), 0.0, 0.15, 1.0)
	b.blob(Vector3(-0.2, 4.3, 0.0), Vector3(0.36, 0.28, 0.32), 7, 3, smoke.darkened(0.1), smoke.lightened(0.3), 0.0, 0.15, 2.0)
	b.blob(Vector3(0.25, 4.75, 0.05), Vector3(0.28, 0.22, 0.26), 7, 3, smoke, smoke.lightened(0.4), 0.0, 0.15, 3.0)
	for i in range(5):
		var a := TAU * float(i) / 5.0 + 0.3
		b.box(Vector3(cos(a) * 0.6, 3.5 + 0.2 * float(i), sin(a) * 0.5), Vector3(0.07, 0.07, 0.07), LAVA_L, 0.0, a)
	# boulders at the foot
	for i in range(6):
		var a := TAU * float(i) / 6.0 + 0.7
		_rock(b, Vector3(cos(a) * 2.75, 0.0, sin(a) * 2.1), Vector3(0.3, 0.22, 0.28), [rock.darkened(0.2), rock, rock_l], float(i), 0.2)


## The volcano's skin: the radius at height y of the two stacked frustums.
static func _vol_r(y: float, rb: float, rt: float, h: float, split: float) -> float:
	var mid_r := rb * 0.62
	if y <= split:
		return lerpf(rb, mid_r, y / split)
	return lerpf(mid_r, rt, (y - split) / (h - split))


static func _shipwreck(b: FarmMesh) -> void:
	# 4 × 2: a half-sunk hull on its side in the sand: curved ribs and planks, a broken mast and a torn sail, and a small
	# chest on the deck (what the children dig for)
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(2.0, 0.12, 1.0), 10, 2, SAND_D, SAND, 0.0, 0.1, 5.0)
	# the keel, then the ribs bent up from it to both sides (the near side is mostly gone so the inside shows)
	_beam(b, Vector3(-1.8, 0.2, 0.0), Vector3(1.8, 0.2, 0.0), 0.2, WOOD_D, WOOD)
	for i in range(8):
		var x := -1.55 + 0.44 * float(i)
		var up := 0.95 - 0.06 * absf(float(i) - 3.5)
		for sz in [-1.0, 1.0]:
			if sz > 0.0 and i % 2 == 1:
				continue # (the near side's ribs are broken off: every other one stands)
			var top := up if sz < 0.0 else up * 0.55
			_bent(b, [Vector3(x, 0.2, 0.05 * sz), Vector3(x, 0.38, 0.32 * sz), Vector3(x + 0.02, 0.7 * top / up, 0.52 * sz), Vector3(x + 0.04, top, 0.6 * sz)], 0.1, WOOD_D, WOOD, 0.8)
	# planks along the far side's ribs (a few missing), and a few lying loose
	for k in range(4):
		var y := 0.32 + 0.2 * float(k)
		var zz := -0.4 - 0.07 * float(k)
		_beam(b, Vector3(-1.6 + 0.25 * float(k), y, zz), Vector3(1.5 - 0.2 * float(k % 2), y, zz), 0.1, WOOD.lerp(WOOD_D, 0.25 * float(k % 2)), WOOD_L)
	_beam(b, Vector3(-1.2, 0.1, 0.6), Vector3(-0.2, 0.12, 0.75), 0.1, WOOD_D, WOOD)
	_beam(b, Vector3(0.6, 0.1, 0.7), Vector3(1.5, 0.1, 0.55), 0.09, WOOD_D, WOOD)
	# the bow rising to the left, the stern's post and rail to the right
	_bent(b, [Vector3(-1.8, 0.2, 0.0), Vector3(-1.95, 0.55, 0.0), Vector3(-2.0, 1.0, 0.0), Vector3(-1.85, 1.25, 0.0)], 0.2, WOOD_D, WOOD, 0.7)
	_bent(b, [Vector3(1.8, 0.2, 0.0), Vector3(1.85, 0.6, 0.0), Vector3(1.8, 0.95, 0.0)], 0.2, WOOD_D, WOOD, 0.8)
	b.box(Vector3(1.5, 0.45, -0.3), Vector3(0.14, 0.5, 0.1), WOOD, 0.0, 0.0, WOOD_L)
	# the mast, snapped and leaning, with a yard and the sail's rag
	_beam(b, Vector3(0.1, 0.2, 0.0), Vector3(0.28, 1.65, 0.0), 0.13, WOOD_D, WOOD)
	_beam(b, Vector3(-0.15, 1.35, 0.0), Vector3(1.0, 1.4, 0.0), 0.08, WOOD_D, WOOD)
	var sail := Color("#d8cfb8")
	b.quad(Vector3(-0.1, 1.33, 0.03), Vector3(0.02, 0.8, 0.03), Vector3(0.7, 0.85, 0.03), Vector3(0.95, 1.36, 0.03), sail)
	b.quad(Vector3(0.95, 1.36, -0.03), Vector3(0.7, 0.85, -0.03), Vector3(0.02, 0.8, -0.03), Vector3(-0.1, 1.33, -0.03), sail.darkened(0.12))
	b.tri(Vector3(0.02, 0.8, 0.035), Vector3(0.18, 0.62, 0.035), Vector3(0.36, 0.82, 0.035), sail, sail, sail.darkened(0.1))
	# the chest on the bottom boards, lid open, gold glinting
	b.box(Vector3(-0.8, 0.36, 0.0), Vector3(0.42, 0.22, 0.28), WOOD, 0.0, 0.0, WOOD_L)
	b.box(Vector3(-0.8, 0.5, 0.0), Vector3(0.44, 0.07, 0.3), WOOD_D, 0.0, 0.0, WOOD)
	b.box(Vector3(-0.8, 0.4, 0.145), Vector3(0.06, 0.1, 0.02), GOLD)
	b.blob(Vector3(-0.8, 0.56, 0.0), Vector3(0.16, 0.05, 0.12), 6, 2, GOLD.darkened(0.2), GOLD_L, 0.0, 0.1, 2.0)
	# seaweed and a barrel half in the sand
	for i in range(3):
		var foot := Vector3(1.0 + 0.1 * float(i), 0.1, 0.55)
		b.blade(foot, foot + Vector3(0.05, 0.4 + 0.1 * float(i), 0.03), 0.1, Color("#2f8a6a"), Color("#4f9a4a"), 0.0, 0.3 * float(i))
	b.cylinder(Vector3(1.6, 0.0, 0.5), 0.22, 0.2, 0.4, 7, WOOD_D, WOOD, 0.0)


static func _ruin_pillar(b: FarmMesh) -> void:
	# a broken stone pillar, its fluting and a mossy cap, a fallen drum beside it
	b.box(Vector3(0.0, 0.08, 0.0), Vector3(0.7, 0.16, 0.7), STONE_D, 0.0, 0.0, STONE)
	b.cylinder(Vector3(0.0, 0.16, 0.0), 0.28, 0.25, 1.1, 8, STONE.darkened(0.08), STONE.lightened(0.08))
	for i in range(4):
		var a := TAU * float(i) / 4.0 + 0.4
		b.box(Vector3(cos(a) * 0.255, 0.7, sin(a) * 0.255), Vector3(0.04, 1.0, 0.04), STONE_D, 0.0, a)
	# the broken top: a jagged edge
	for i in range(4):
		var a := TAU * float(i) / 4.0
		b.cone(Vector3(cos(a) * 0.14, 1.26, sin(a) * 0.14), 0.12, 0.18 + 0.1 * float(i % 2), 4, STONE, STONE.lightened(0.12), 0.0, 0.0, a)
	b.blob(Vector3(0.0, 1.28, 0.0), Vector3(0.24, 0.05, 0.24), 6, 2, MOSS.darkened(0.2), MOSS, 0.0, 0.2, 2.0)
	b.cylinder(Vector3(0.52, 0.0, 0.3), 0.24, 0.24, 0.36, 8, STONE_D, STONE) # (stood on its side would roll: this is one lying flat)
	b.blob(Vector3(0.5, 0.05, 0.28), Vector3(0.3, 0.05, 0.3), 6, 2, MOSS.darkened(0.25), MOSS, 0.0, 0.2, 4.0)
	b.blob(Vector3(-0.3, 0.1, 0.45), Vector3(0.18, 0.1, 0.16), 6, 2, STONE_D, STONE, 0.0, 0.2, 3.0)


static func _steam_vent(b: FarmMesh) -> void:
	# flat: a stone-rimmed crack in the ground venting steam: a ring of dark rocks, a glowing slit, pale puffs above
	for i in range(8):
		var a := TAU * float(i) / 8.0
		b.blob(Vector3(cos(a) * 0.3, 0.05, sin(a) * 0.26), Vector3(0.12, 0.07, 0.1), 5, 2, STONE_D, STONE, 0.0, 0.2, float(i))
	b.box(Vector3(0.0, 0.025, 0.0), Vector3(0.44, 0.03, 0.12), Color("#ffb060"), 0.0, 0.4, LAVA_L)
	b.box(Vector3(0.0, 0.01, 0.0), Vector3(0.6, 0.02, 0.5), Color("#2a1a14"))
	var steam := Color("#f0f4f8")
	for i in range(4):
		b.blob(Vector3(0.02 * float(i % 2), 0.25 + 0.17 * float(i), 0.0), Vector3(0.12 + 0.03 * float(i), 0.08, 0.1 + 0.03 * float(i)), 6, 2, steam.darkened(0.12), steam, 0.0, 0.2, float(i))


static func _crater(b: FarmMesh) -> void:
	# 2 × 2, flat: the moon's crater: a raised rim in two greys round a darker floor, and a few pebbles
	var n := 14
	for i in range(n):
		var a0 := TAU * float(i) / float(n)
		var a1 := TAU * float(i + 1) / float(n)
		var floor_c := Color("#8a8a98")
		b.tri(Vector3(0.0, 0.03, 0.0), Vector3(cos(a1) * 0.62, 0.03, sin(a1) * 0.62), Vector3(cos(a0) * 0.62, 0.03, sin(a0) * 0.62), floor_c.darkened(0.15), floor_c, floor_c)
		var c := Color("#c0c0cc") if i % 2 == 0 else Color("#a8a8b6")
		var w0 := 1.0 + 0.08 * _h(float(i), 2.0)
		var w1 := 1.0 + 0.08 * _h(float(i + 1), 2.0)
		var i0 := Vector3(cos(a0) * 0.62, 0.03, sin(a0) * 0.62)
		var i1 := Vector3(cos(a1) * 0.62, 0.03, sin(a1) * 0.62)
		var m0 := Vector3(cos(a0) * 0.78 * w0, 0.13, sin(a0) * 0.78 * w0)
		var m1 := Vector3(cos(a1) * 0.78 * w1, 0.13, sin(a1) * 0.78 * w1)
		var o0 := Vector3(cos(a0) * 0.98 * w0, 0.02, sin(a0) * 0.98 * w0)
		var o1 := Vector3(cos(a1) * 0.98 * w1, 0.02, sin(a1) * 0.98 * w1)
		b.quad(i1, i0, m0, m1, c.darkened(0.2))
		b.quad(m1, m0, o0, o1, c.lightened(0.05))
	for i in range(4):
		var a := 0.5 + float(i) * 1.6
		b.blob(Vector3(cos(a) * 0.3, 0.07, sin(a) * 0.3), Vector3(0.07, 0.05, 0.06), 5, 2, Color("#6a6a78"), Color("#a0a0ae"), 0.0, 0.2, float(i))


static func _earth(b: FarmMesh) -> void:
	# 4 × 4, flat: the blue planet seen from the moon: a round disc, continents in green and white clouds, laid flat
	var n := 20
	var r := 1.8
	for i in range(n):
		var a0 := TAU * float(i) / float(n)
		var a1 := TAU * float(i + 1) / float(n)
		b.tri(Vector3(0.0, 0.03, 0.0), Vector3(cos(a1) * r, 0.03, sin(a1) * r), Vector3(cos(a0) * r, 0.03, sin(a0) * r), Color("#52a8d1"), Color("#1f5788"), Color("#1f5788"))
	var land: Array = [[-0.5, -0.3, 0.55, 0.4], [0.7, 0.4, 0.45, 0.3], [0.0, 0.9, 0.3, 0.22], [-0.9, 0.7, 0.28, 0.2], [0.6, -0.8, 0.3, 0.24]]
	for l in land:
		b.blob(Vector3(l[0], 0.05, l[1]), Vector3(l[2], 0.015, l[3]), 7, 2, Color("#3f8a3a"), Color("#7fc35a"), 0.0, 0.2, l[0] * 7.0)
	var cloud := WHITE
	for i in range(6):
		var a := 0.4 + float(i) * 1.05
		var rr := 0.6 + 0.8 * _h(float(i), 4.0)
		b.blob(Vector3(cos(a) * rr, 0.075, sin(a) * rr), Vector3(0.32, 0.015, 0.1), 6, 2, cloud.darkened(0.08), cloud, 0.0, 0.08, float(i))
	b.blob(Vector3(0.0, 0.07, -1.5), Vector3(0.4, 0.015, 0.14), 6, 2, cloud.darkened(0.05), cloud, 0.0, 0.0)


static func _flag_se(b: FarmMesh) -> void:
	# a flag planted on the moon: a pole, the blue field with a yellow cross, on a little mound
	b.blob(Vector3(0.0, 0.05, 0.0), Vector3(0.3, 0.08, 0.3), 7, 2, Color("#7c7c8a"), Color("#bebec8"), 0.0, 0.1, 1.0)
	b.cylinder(Vector3.ZERO, 0.025, 0.02, 1.7, 5, IRON_L, Color("#e2e5ee"))
	b.blob(Vector3(0.0, 1.72, 0.0), Vector3.ONE * 0.04, 5, 2, GOLD, GOLD_L, 0.0, 0.0)
	var blue := Color("#2a6ac0")
	var yel := Color("#f0c820")
	# the cloth sticks out straight (nothing blows on the moon): 0.6 wide, 0.4 tall
	var x0 := 0.03
	var x1 := 0.63
	var y1 := 1.65
	var y0 := 1.25
	for side in [1.0, -1.0]:
		var z: float = 0.008 * side
		var sh: float = 1.0 if side > 0.0 else 0.9
		b.quad(Vector3(x0, y1, z), Vector3(x0, y0, z), Vector3(x1, y0, z), Vector3(x1, y1, z), blue.darkened(1.0 - sh) if side < 0 else blue)
		b.quad(Vector3(x0, 1.49, z + 0.004 * side), Vector3(x0, 1.41, z + 0.004 * side), Vector3(x1, 1.41, z + 0.004 * side), Vector3(x1, 1.49, z + 0.004 * side), yel)
		b.quad(Vector3(0.2, y1, z + 0.004 * side), Vector3(0.2, y0, z + 0.004 * side), Vector3(0.28, y0, z + 0.004 * side), Vector3(0.28, y1, z + 0.004 * side), yel)


static func _rocket(b: FarmMesh) -> void:
	# 2 × 3: a white rocket with a red nose and three red fins, a round window, a door with a ladder, on a launch pad
	b.box(Vector3(0.0, 0.05, 0.0), Vector3(1.9, 0.1, 2.7), STONE_D, 0.0, 0.0, STONE)
	b.cylinder(Vector3(0.0, 0.1, 0.0), 0.62, 0.6, 0.06, 10, Color("#f0c820"), Color("#f0c820"))
	var white := Color("#e8eaf2")
	b.cylinder(Vector3(0.0, 0.16, 0.0), 0.5, 0.42, 1.5, 10, white.darkened(0.2), white)
	b.cylinder(Vector3(0.0, 1.66, 0.0), 0.42, 0.28, 0.5, 10, white, white.lightened(0.05))
	b.cone(Vector3(0.0, 2.16, 0.0), 0.28, 0.65, 10, Color("#a8282a"), Color("#e84a4a"))
	b.cylinder(Vector3(0.0, 0.16, 0.0), 0.51, 0.51, 0.1, 10, Color("#a8282a"), Color("#d84a4a"))
	for i in range(3):
		var a := TAU * float(i) / 3.0 + PI * 0.5
		b.blade(Vector3(cos(a) * 0.45, 0.9, sin(a) * 0.45), Vector3(cos(a) * 0.85, 0.16, sin(a) * 0.85), 0.28, Color("#a8282a"), Color("#e84a4a"), 0.0, a + PI * 0.5)
		b.blade(Vector3(cos(a) * 0.45, 0.9, sin(a) * 0.45), Vector3(cos(a) * 0.85, 0.16, sin(a) * 0.85), 0.28, Color("#a8282a"), Color("#e84a4a"), 0.0, a)
	# the window and the door on the front
	b.blob(Vector3(0.0, 1.55, 0.45), Vector3(0.17, 0.17, 0.05), 8, 3, Color("#3a8ac0"), Color("#b4ecff"), 0.0, 0.0)
	b.box(Vector3(0.0, 0.7, 0.47), Vector3(0.36, 0.7, 0.05), IRON.darkened(0.1), 0.0, 0.0, IRON)
	b.box(Vector3(0.0, 0.7, 0.5), Vector3(0.28, 0.6, 0.03), Color("#c8ccd8"))
	b.box(Vector3(0.1, 0.7, 0.53), Vector3(0.04, 0.04, 0.03), GOLD)
	# a ladder leaning up to it
	for sx in [-0.14, 0.14]:
		b.blade(Vector3(sx, 0.1, 0.95), Vector3(sx, 0.7, 0.5), 0.04, WOOD_D, WOOD, 0.0, PI * 0.5)
	for i in range(5):
		var t := 0.1 + 0.16 * float(i)
		b.box(Vector3(0.0, 0.1 + t * 1.0, 0.95 - t * 0.75), Vector3(0.3, 0.025, 0.03), WOOD_L)


static func _satellite_dish(b: FarmMesh) -> void:
	# 2 × 2: a white dish on a mast and a tripod, tipped up to the sky, a feed arm and a little blinking lamp
	b.box(Vector3(0.0, 0.04, 0.0), Vector3(1.4, 0.08, 1.4), STONE_D, 0.0, 0.0, STONE)
	for i in range(3):
		var a := TAU * float(i) / 3.0 + 0.5
		b.blade(Vector3(cos(a) * 0.5, 0.08, sin(a) * 0.5), Vector3(0.0, 0.85, 0.0), 0.07, IRON, IRON_L, 0.0, a + PI * 0.5)
	b.cylinder(Vector3(0.0, 0.08, 0.0), 0.08, 0.06, 0.95, 6, IRON, IRON_L)
	# the dish: a shallow cone turned toward the front and the sky
	var white := Color("#e8eaf2")
	var n := 14
	var tilt := Basis(Vector3.RIGHT, deg_to_rad(-38.0))
	var centre := Vector3(0.0, 1.15, 0.05)
	for i in range(n):
		var a0 := TAU * float(i) / float(n)
		var a1 := TAU * float(i + 1) / float(n)
		var r := 0.75
		var p0 := centre + tilt * Vector3(cos(a0) * r, sin(a0) * r, -0.2 + 0.0)
		var p1 := centre + tilt * Vector3(cos(a1) * r, sin(a1) * r, -0.2 + 0.0)
		var tip := centre + tilt * Vector3(0.0, 0.0, -0.45)
		b.tri(tip, p1, p0, white.darkened(0.15), white, white) # outer back
		var in_tip := centre + tilt * Vector3(0.0, 0.0, -0.3)
		b.tri(in_tip, p0, p1, Color("#aab0c0"), white.lightened(0.05), white.lightened(0.05)) # the bowl seen from the front
	# the feed: an arm out to a small horn
	var horn := centre + tilt * Vector3(0.0, 0.0, 0.5)
	b.blade(centre, horn, 0.05, IRON, IRON_L, 0.0, 0.0)
	b.blob(horn, Vector3.ONE * 0.07, 6, 2, IRON, IRON_L, 0.0, 0.0)
	b.blob(Vector3(0.0, 1.05, 0.0), Vector3.ONE * 0.06, 5, 2, IRON, IRON_L, 0.0, 0.0)
	b.blob(Vector3(0.3, 0.1, 0.4), Vector3.ONE * 0.04, 5, 2, Color("#ff4a4a"), Color("#ffb0b0"), 0.0, 0.0)


static func _ufo(b: FarmMesh) -> void:
	# 3 × 2: a landed flying saucer: a silver disc with a ring of lights, a green glass dome, three legs, hatch down
	var silver := Color("#b8c2d0")
	b.blob(Vector3(0.0, 0.62, 0.0), Vector3(1.2, 0.2, 0.9), 12, 3, Color("#7c8798"), Color("#e2e8f0"), 0.0, 0.02, 1.0)
	b.cylinder(Vector3(0.0, 0.5, 0.0), 1.2, 1.05, 0.1, 12, Color("#596476"), silver, 0.0, true)
	b.blob(Vector3(0.0, 0.5, 0.0), Vector3(0.85, 0.16, 0.65), 12, 2, Color("#596476"), Color("#7c8798"), 0.0, 0.02, 2.0)
	# the dome: green glass with a bright spot
	b.blob(Vector3(0.0, 0.88, -0.02), Vector3(0.48, 0.38, 0.4), 10, 4, Color("#14703a"), Color("#a4ffb8"), 0.0, 0.0, 3.0)
	b.blob(Vector3(-0.15, 1.1, 0.08), Vector3(0.1, 0.07, 0.07), 6, 2, Color("#d8ffe0"), Color("#ffffff"), 0.0, 0.0)
	# the ring of lights round the rim: yellow, pink, cyan
	var cols: Array = [Color("#ffe27a"), Color("#ff7ab0"), Color("#7af0ff")]
	for i in range(12):
		var a := TAU * float(i) / 12.0
		b.blob(Vector3(cos(a) * 1.08, 0.62, sin(a) * 0.82), Vector3(0.07, 0.06, 0.07), 5, 2, cols[i % 3].darkened(0.1), cols[i % 3].lightened(0.4), 0.0, 0.0, float(i))
	# three legs on round pads
	for i in range(3):
		var a := TAU * float(i) / 3.0 + 0.9
		var foot := Vector3(cos(a) * 0.9, 0.0, sin(a) * 0.65)
		b.blade(Vector3(cos(a) * 0.6, 0.48, sin(a) * 0.45), foot + Vector3(0.0, 0.05, 0.0), 0.09, IRON, IRON_L, 0.0, a + PI * 0.5)
		b.cylinder(foot, 0.1, 0.1, 0.05, 6, IRON, IRON_L)
	# the hatch: a ramp down at the front with a green glow on it
	b.quad(Vector3(-0.2, 0.5, 0.82), Vector3(0.2, 0.5, 0.82), Vector3(0.28, 0.02, 1.15), Vector3(-0.28, 0.02, 1.15), Color("#9cc8b0"))
	b.box(Vector3(0.0, 0.49, 0.8), Vector3(0.4, 0.04, 0.04), Color("#a4ffb8"))


static func _snowman_wild(b: FarmMesh) -> void:
	# a big snowman by the path: three snowballs, coal eyes and buttons, a carrot nose, a scarf and a twig-armed hat
	b.blob(Vector3(0.0, 0.3, 0.0), Vector3(0.42, 0.32, 0.42), 9, 4, Color("#c4d8ea"), SNOW, 0.0, 0.03, 1.0)
	b.blob(Vector3(0.0, 0.78, 0.0), Vector3(0.32, 0.27, 0.32), 9, 4, Color("#c4d8ea"), SNOW, 0.0, 0.03, 2.0)
	b.blob(Vector3(0.0, 1.18, 0.0), Vector3(0.24, 0.22, 0.24), 9, 4, Color("#c4d8ea"), SNOW, 0.0, 0.03, 3.0)
	b.cone(Vector3(0.0, 1.17, 0.2), 0.045, 0.2, 5, Color("#e8801a"), Color("#ffb060"), 0.0, 0.0)
	for sx in [-0.08, 0.08]:
		b.box(Vector3(sx, 1.25, 0.2), Vector3(0.05, 0.05, 0.03), DARK)
	for i in range(3):
		b.box(Vector3(0.0, 0.88 - 0.14 * float(i), 0.3 - 0.01 * float(i)), Vector3(0.05, 0.05, 0.03), DARK)
	# the scarf, red with a tail
	b.cylinder(Vector3(0.0, 0.93, 0.0), 0.3, 0.3, 0.1, 8, Color("#a83a2c"), Color("#d84a4a"), 0.0, false)
	b.box(Vector3(0.18, 0.78, 0.25), Vector3(0.1, 0.3, 0.04), Color("#d84a4a"), 0.0, 0.2)
	# the hat and the twig arms
	b.cylinder(Vector3(0.0, 1.38, 0.0), 0.24, 0.24, 0.03, 8, DARK, DARK)
	b.cylinder(Vector3(0.0, 1.4, 0.0), 0.15, 0.14, 0.2, 8, DARK, Color("#3a3a42"))
	for sx in [-1.0, 1.0]:
		b.blade(Vector3(sx * 0.28, 0.82, 0.0), Vector3(sx * 0.7, 1.1, 0.0), 0.05, WOOD_D, WOOD, 0.0, PI * 0.5)
		b.blade(Vector3(sx * 0.55, 0.98, 0.0), Vector3(sx * 0.7, 1.22, 0.0), 0.04, WOOD_D, WOOD, 0.0, PI * 0.5)


static func _treasure(b: FarmMesh) -> void:
	# a treasure chest with a rounded lid, gold bands, a lock, the lid ajar and gold coins and a gem showing
	b.box(Vector3(0.0, 0.2, 0.0), Vector3(0.78, 0.4, 0.5), WOOD, 0.0, 0.0, WOOD_L)
	for sx in [-0.28, 0.28]:
		b.box(Vector3(sx, 0.2, 0.0), Vector3(0.08, 0.42, 0.52), GOLD.darkened(0.2), 0.0, 0.0, GOLD)
	b.box(Vector3(0.0, 0.42, 0.0), Vector3(0.8, 0.05, 0.52), GOLD.darkened(0.25), 0.0, 0.0, GOLD)
	# the open lid, tilted back
	var lid_c := WOOD.lightened(0.04)
	b.quad(Vector3(-0.39, 0.45, -0.22), Vector3(0.39, 0.45, -0.22), Vector3(0.39, 0.82, -0.36), Vector3(-0.39, 0.82, -0.36), lid_c.darkened(0.1))
	b.quad(Vector3(-0.39, 0.45, -0.22), Vector3(-0.39, 0.82, -0.36), Vector3(0.39, 0.82, -0.36), Vector3(0.39, 0.45, -0.22), lid_c)
	for sx in [-0.28, 0.28]:
		b.quad(Vector3(sx - 0.04, 0.45, -0.22), Vector3(sx + 0.04, 0.45, -0.22), Vector3(sx + 0.04, 0.82, -0.36), Vector3(sx - 0.04, 0.82, -0.36), GOLD)
	b.box(Vector3(0.0, 0.2, 0.26), Vector3(0.12, 0.14, 0.03), GOLD_L)
	# the treasure: a heap of gold with coins and a red and a blue gem
	b.blob(Vector3(0.0, 0.46, 0.0), Vector3(0.34, 0.1, 0.2), 7, 2, GOLD.darkened(0.25), GOLD_L, 0.0, 0.12, 5.0)
	for i in range(4):
		var a := TAU * float(i) / 4.0 + 0.4
		b.cylinder(Vector3(cos(a) * 0.5, 0.0, 0.3 + sin(a) * 0.1), 0.065, 0.065, 0.02, 6, GOLD.darkened(0.1), GOLD_L)
	b.cone(Vector3(0.14, 0.5, 0.05), 0.045, 0.1, 5, Color("#a02030"), Color("#ff6a7a"))
	b.cone(Vector3(-0.12, 0.5, 0.0), 0.04, 0.09, 5, Color("#2060c0"), Color("#8ac0ff"))
