class_name ArchMeshes
extends RefCounted
## M9a: the way into each saga dungeon out in the world (the `saga_portal` object, its `variant` is the dungeon's index in
## DUNGEON_IDS). The browser drew nine different gateways (art/saga.ts: barrow, iceGate, forgeDoor, helGate, mineDoor,
## seaTemple, alvTree, fenrisCleft, bifrostArch); the native client drew one stone arch for all of them. Each is now its
## own 3 × 2 tile building in the farm's low-poly style (FarmMesh), standing on the same footprint, 3 m wide and open in
## the middle, facing south (+z): variant 0 is the old stone arch (farm_assets.gd `_arch`), the rest are built here.
## The glow in the doorway and the light in front of it are the node's (farm_view.gd) in the dungeon's torch colour.
##
##   1 Frostjättens borg    pillars of blue ice with icicles over the door and a cap of snow
##   2 Surts smedja         black basalt, lava in the cracks, two horns and a glowing slit
##   3 Helheim              pillars of bones with skulls, half the doorway pale and half black
##   4 Svartalfheims gruvor a timber mine entrance in a mound of rock, hanging lamps, rails and gold
##   5 Havsormens tempel    a teal temple front with a pediment, coral, a pearl and the sea serpent's coil
##   6 Alvernas lund        two living trees growing together over the door, glowing mushrooms
##   7 Fenrisklyftan        two slabs of steel-blue rock leaning apart, chains across, fangs on top
##   8 Bifrost              slim pearly columns under a rainbow band, rose-gold lanterns

const DARK := Color("#0b0a10")


static func mesh(variant: int) -> ArrayMesh:
	match variant:
		1: return _frost()
		2: return _surt()
		3: return _hel()
		4: return _mine()
		5: return _orm()
		6: return _alv()
		7: return _fenrir()
		8: return _bifrost()
	return null


## The doorway: a dark rectangle a little behind the pillars (what the glow quad sits in front of).
static func _door(b: FarmMesh, w: float, h: float, col: Color, z := -0.05) -> void:
	b.box(Vector3(0.0, h * 0.5, z), Vector3(w, h, 0.4), col, 0.0)


static func _steps(b: FarmMesh, col: Color, w := 2.5) -> void:
	b.box(Vector3(0.0, 0.07, 0.62), Vector3(w, 0.14, 0.4), col.darkened(0.1), 0.0, 0.0, col)


## A triangular gable: a wedge from x0 to x1 on its base line y0, peaking at (xm, y1), between z0 and z1.
static func _gable(b: FarmMesh, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, col: Color, top: Color) -> void:
	var xm := (x0 + x1) * 0.5
	b.tri(Vector3(x0, y0, z1), Vector3(x1, y0, z1), Vector3(xm, y1, z1), col, col, col)
	b.tri(Vector3(x1, y0, z0), Vector3(x0, y0, z0), Vector3(xm, y1, z0), col.darkened(0.12), col.darkened(0.12), col.darkened(0.12))
	b.quad(Vector3(x0, y0, z1), Vector3(xm, y1, z1), Vector3(xm, y1, z0), Vector3(x0, y0, z0), top.darkened(0.04))
	b.quad(Vector3(xm, y1, z1), Vector3(x1, y0, z1), Vector3(x1, y0, z0), Vector3(xm, y1, z0), top.lightened(0.06))


# --- 1: the ice gate ---------------------------------------------------------------------------------------------------


static func _frost() -> ArrayMesh:
	var b := FarmMesh.new()
	var ice := Color("#8fc4e8")
	var deep := Color("#5d93c4")
	var snow := Color("#f2f8ff")
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.08
		b.box(Vector3(x, 1.2, 0.0), Vector3(0.84, 2.4, 0.9), ice, 0.0, 0.0, snow)
		b.box(Vector3(x, 0.15, 0.0), Vector3(1.0, 0.3, 1.04), deep, 0.0, 0.0, ice.lightened(0.15))
		# a crack of light down the front
		b.box(Vector3(x - sx * 0.1, 1.2, 0.46), Vector3(0.05, 1.6, 0.03), Color("#e2f4ff"), 0.0)
		# ice crystals grown on the shoulder, tall and short
		b.cone(Vector3(x - sx * 0.22, 2.4, 0.1), 0.2, 0.95, 5, ice.lightened(0.1), Color("#ffffff"))
		b.cone(Vector3(x + sx * 0.12, 2.4, -0.1), 0.15, 0.62, 5, ice.lightened(0.1), Color("#ffffff"))
		b.cone(Vector3(x + sx * 0.3, 2.4, 0.15), 0.1, 0.4, 5, ice.lightened(0.1), Color("#ffffff"))
	b.box(Vector3(0.0, 2.55, 0.0), Vector3(3.1, 0.55, 1.0), ice.darkened(0.05), 0.0, 0.0, snow)
	b.box(Vector3(0.0, 2.9, 0.0), Vector3(2.6, 0.22, 0.9), snow, 0.0)
	# icicles hanging in the doorway
	for i in range(9):
		var x := -0.62 + 0.155 * i
		b.blade(Vector3(x, 2.3, 0.4), Vector3(x, 2.3 - (0.34 if i % 2 == 0 else 0.55), 0.4), 0.13, Color("#d8f0ff"), Color("#ffffff"))
	_door(b, 1.3, 2.3, Color("#122238"))
	_steps(b, Color("#cfe3f2"))
	return b.build()


# --- 2: the forge door --------------------------------------------------------------------------------------------------


static func _surt() -> ArrayMesh:
	var b := FarmMesh.new()
	var rock := Color("#34303a")
	var lava := Color("#ff7a1c")
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.1
		b.box(Vector3(x, 1.25, 0.0), Vector3(0.9, 2.5, 0.95), rock, 0.0, 0.0, rock.lightened(0.08))
		b.box(Vector3(x, 0.14, 0.0), Vector3(1.06, 0.28, 1.1), rock.darkened(0.2), 0.0, 0.0, rock)
		# lava in the cracks: thin glowing strips down the face, joined by short cross-cracks
		b.box(Vector3(x + sx * 0.08, 1.15, 0.49), Vector3(0.06, 1.7, 0.03), lava, 0.0)
		for k in range(4):
			b.box(Vector3(x - sx * 0.05, 0.5 + 0.45 * k, 0.49), Vector3(0.26, 0.05, 0.03), lava.lightened(0.15 * (k % 2)), 0.0)
		# a horn on each shoulder, leaning out
		b.cone(Vector3(x + sx * 0.28, 2.5, 0.0), 0.2, 0.95, 5, Color("#4a2020"), Color("#c0502a"))
	b.box(Vector3(0.0, 2.65, 0.0), Vector3(3.1, 0.6, 1.0), rock.darkened(0.05), 0.0, 0.0, rock.lightened(0.1))
	# the slit of fire in the lintel and the hammer-and-anvil block on top
	b.box(Vector3(0.0, 2.65, 0.51), Vector3(1.8, 0.12, 0.03), lava, 0.0)
	b.box(Vector3(0.0, 3.08, 0.0), Vector3(1.0, 0.28, 0.5), Color("#26232b"), 0.0, 0.0, Color("#4a4650"))
	b.box(Vector3(0.0, 3.3, 0.0), Vector3(1.5, 0.16, 0.6), Color("#26232b"), 0.0, 0.0, Color("#5a5660"))
	_door(b, 1.3, 2.4, Color("#220b0a"))
	# a stream of glowing floor in front of the door
	b.box(Vector3(0.0, 0.03, 0.64), Vector3(1.0, 0.06, 0.4), lava.darkened(0.1), 0.0, 0.0, lava)
	_steps(b, Color("#4b4650"))
	return b.build()


# --- 3: the gate of Hel --------------------------------------------------------------------------------------------------


static func _hel() -> ArrayMesh:
	var b := FarmMesh.new()
	var bone := Color("#d9cfb4")
	var shade := Color("#a89f86")
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.1
		# a column of stacked bones and skulls
		b.box(Vector3(x, 0.15, 0.0), Vector3(0.95, 0.3, 1.0), shade, 0.0, 0.0, bone)
		b.box(Vector3(x, 1.2, 0.0), Vector3(0.5, 1.9, 0.5), bone, 0.0, 0.0, bone.lightened(0.1))
		for k in range(3):
			b.box(Vector3(x, 0.6 + 0.65 * k, 0.0), Vector3(0.78, 0.16, 0.7), shade, 0.0, 0.0, bone)
		for k in range(2):
			_skull(b, Vector3(x, 0.95 + 0.65 * k, 0.4), 0.26, bone)
		_skull(b, Vector3(x, 2.5, 0.0), 0.4, bone)
	b.box(Vector3(0.0, 2.25, 0.0), Vector3(3.0, 0.4, 0.8), shade, 0.0, 0.0, bone)
	# ribs curving over the doorway
	for i in range(7):
		var x := -0.78 + 0.26 * i
		b.blade(Vector3(x, 2.05, 0.38), Vector3(x * 0.55, 1.55, 0.38), 0.11, bone, shade)
	_skull(b, Vector3(0.0, 2.7, 0.2), 0.5, bone)
	# the doorway of the half-dead queen: one half black, one half a pale ghostly green
	b.box(Vector3(-0.35, 1.1, -0.05), Vector3(0.7, 2.2, 0.4), Color("#070a09"))
	b.box(Vector3(0.35, 1.1, -0.05), Vector3(0.7, 2.2, 0.4), Color("#7fb09f"))
	_steps(b, shade)
	return b.build()


static func _skull(b: FarmMesh, at: Vector3, r: float, bone: Color) -> void:
	b.blob(at, Vector3(r, r * 0.92, r * 0.9), 7, 4, bone.darkened(0.15), bone.lightened(0.08), 0.0, 0.05)
	b.box(at + Vector3(-r * 0.36, -r * 0.05, r * 0.82), Vector3(r * 0.3, r * 0.32, 0.04), Color("#0b0b0b"))
	b.box(at + Vector3(r * 0.36, -r * 0.05, r * 0.82), Vector3(r * 0.3, r * 0.32, 0.04), Color("#0b0b0b"))
	b.box(at + Vector3(0.0, -r * 0.5, r * 0.78), Vector3(r * 0.5, r * 0.28, 0.04), bone.darkened(0.3))


# --- 4: the mine --------------------------------------------------------------------------------------------------------


static func _mine() -> ArrayMesh:
	var b := FarmMesh.new()
	var rock := Color("#6b625a")
	var timber := Color("#8a5a30")
	# the mound the mine is dug into, behind and round the frame
	b.blob(Vector3(0.0, 1.1, -0.35), Vector3(1.55, 1.7, 0.6), 9, 5, rock.darkened(0.2), rock.lightened(0.1), 0.0, 0.1, 4.0)
	b.blob(Vector3(-1.1, 0.6, -0.1), Vector3(0.6, 0.7, 0.5), 7, 4, rock.darkened(0.25), rock, 0.0, 0.12, 9.0)
	b.blob(Vector3(1.15, 0.55, -0.05), Vector3(0.55, 0.62, 0.5), 7, 4, rock.darkened(0.25), rock, 0.0, 0.12, 2.0)
	# the timber frame: two posts and the beam, a shorter cap beam above
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * 0.82, 1.15, 0.3), Vector3(0.3, 2.3, 0.3), timber, 0.0, 0.0, timber.lightened(0.12))
		b.box(Vector3(sx * 0.82, 0.08, 0.3), Vector3(0.5, 0.16, 0.5), rock.darkened(0.2))
	b.box(Vector3(0.0, 2.35, 0.3), Vector3(2.1, 0.32, 0.36), timber.darkened(0.05), 0.0, 0.0, timber.lightened(0.12))
	b.box(Vector3(0.0, 2.65, 0.3), Vector3(1.5, 0.22, 0.3), timber.darkened(0.12), 0.0, 0.0, timber)
	# the dark gallery in the rock
	b.box(Vector3(0.0, 1.05, 0.0), Vector3(1.35, 2.1, 0.5), Color("#0c0a08"))
	# lamps hanging from the beam
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * 0.82, 2.1, 0.5), Vector3(0.04, 0.3, 0.04), Color("#3a3a3e"))
		b.box(Vector3(sx * 0.82, 1.9, 0.5), Vector3(0.16, 0.2, 0.16), Color("#ffb84a"), 0.0, 0.0, Color("#fff0b0"))
	# gold glinting in the rock
	for p in [Vector3(-1.25, 1.1, 0.12), Vector3(1.3, 0.95, 0.15), Vector3(0.9, 1.75, 0.1), Vector3(-0.7, 1.9, 0.05)]:
		b.box(p, Vector3(0.12, 0.1, 0.06), Color("#f0c232"), 0.0, 0.3, Color("#fff0a0"))
	# rails coming out, on sleepers
	for k in range(4):
		b.box(Vector3(0.0, 0.03, 0.4 + 0.16 * k), Vector3(1.05, 0.05, 0.08), timber.darkened(0.2))
	for sx in [-1.0, 1.0]:
		b.box(Vector3(sx * 0.36, 0.07, 0.62), Vector3(0.05, 0.05, 0.75), Color("#7a7f8a"))
	return b.build()


# --- 5: the sea temple --------------------------------------------------------------------------------------------------


static func _orm() -> ArrayMesh:
	var b := FarmMesh.new()
	var stone := Color("#5b9fae")
	var light := Color("#8ccbd4")
	var sand := Color("#d8c48a")
	b.box(Vector3(0.0, 0.1, 0.1), Vector3(3.1, 0.2, 1.6), sand.darkened(0.1), 0.0, 0.0, sand)
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.08
		b.cylinder(Vector3(x, 0.2, 0.0), 0.36, 0.3, 2.1, 8, stone, light)
		b.box(Vector3(x, 0.26, 0.0), Vector3(0.9, 0.12, 0.9), stone.darkened(0.1), 0.0, 0.0, light)
		b.box(Vector3(x, 2.36, 0.0), Vector3(0.9, 0.18, 0.9), light, 0.0, 0.0, light.lightened(0.1))
		# coral grown on the pillars
		b.blob(Vector3(x + sx * 0.32, 0.55, 0.32), Vector3(0.17, 0.3, 0.14), 6, 3, Color("#c85a3a"), Color("#ffb878"), 0.0, 0.2, 1.0 + sx)
		b.blob(Vector3(x - sx * 0.1, 1.25, 0.34), Vector3(0.14, 0.2, 0.12), 6, 3, Color("#d06aa0"), Color("#ffc0dc"), 0.0, 0.2, 3.0 + sx)
	b.box(Vector3(0.0, 2.55, 0.0), Vector3(3.1, 0.3, 1.0), stone, 0.0, 0.0, light)
	# the pediment with the serpent's coil and the pearl
	_gable(b, -1.55, 1.55, 2.7, 3.45, -0.5, 0.5, light, stone)
	b.blob(Vector3(0.0, 3.0, 0.52), Vector3(0.24, 0.24, 0.1), 8, 4, Color("#e8e8f4"), Color("#ffffff"), 0.0, 0.0)
	for i in range(6):
		var t := float(i) / 5.0
		b.box(Vector3(-1.0 + 0.4 * i, 2.82 + 0.1 * sin(t * TAU), 0.52), Vector3(0.3, 0.1, 0.04), Color("#2e6a86"))
	b.blob(Vector3(1.2, 2.95, 0.52), Vector3(0.14, 0.12, 0.08), 6, 3, Color("#2e6a86"), Color("#6ac0d8"), 0.0, 0.0)
	_door(b, 1.3, 2.3, Color("#0c2630"))
	_steps(b, light, 2.4)
	return b.build()


# --- 6: the elf grove ---------------------------------------------------------------------------------------------------


static func _alv() -> ArrayMesh:
	var b := FarmMesh.new()
	var bark := Color("#6a4a70")
	var bark_l := Color("#8c6a92")
	var leaf := Color("#3f9a52")
	var leaf_l := Color("#8fe08a")
	# two trunks that bend towards each other, built of frustums
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.12
		b.cylinder(Vector3(x, 0.0, 0.0), 0.5, 0.36, 1.3, 7, bark.darkened(0.1), bark)
		b.cylinder(Vector3(x - sx * 0.12, 1.3, 0.0), 0.36, 0.3, 1.0, 7, bark, bark_l)
		b.cylinder(Vector3(x - sx * 0.3, 2.3, 0.0), 0.3, 0.26, 0.5, 7, bark_l, bark_l.lightened(0.06))
		# roots spreading over the ground
		for a in [0.3, 1.2, 2.2]:
			b.blade(Vector3(x + cos(a) * 0.4, 0.05, 0.1 + sin(a) * 0.3), Vector3(x + cos(a) * 0.9, 0.02, 0.1 + sin(a) * 0.65), 0.2, bark.darkened(0.15), bark, 0.0, a)
	# the canopy joined over the doorway
	b.blob(Vector3(0.0, 2.85, 0.0), Vector3(1.75, 0.65, 0.85), 10, 5, leaf.darkened(0.15), leaf_l, 0.0, 0.1, 5.0)
	b.blob(Vector3(-1.0, 2.6, 0.15), Vector3(0.75, 0.5, 0.65), 8, 4, leaf.darkened(0.1), leaf, 0.0, 0.12, 7.0)
	b.blob(Vector3(1.05, 2.65, 0.1), Vector3(0.75, 0.5, 0.65), 8, 4, leaf.darkened(0.1), leaf, 0.0, 0.12, 11.0)
	# vines hanging down from it
	for i in range(6):
		var x := -0.8 + 0.32 * i
		b.blade(Vector3(x, 2.5, 0.45), Vector3(x, 1.95 - 0.12 * (i % 3), 0.45), 0.1, leaf, leaf_l)
	_door(b, 1.2, 2.2, Color("#0e1a14"))
	# glowing mushrooms at the roots: a stem and a bright cap each
	for p in [Vector3(-1.5, 0.0, 0.55), Vector3(1.55, 0.0, 0.5), Vector3(-0.55, 0.0, 0.7), Vector3(0.7, 0.0, 0.75)]:
		var r := 0.16 + 0.05 * absf(p.x)
		b.cylinder(p, 0.05, 0.04, r * 1.2, 5, Color("#e8e0d0"), Color("#e8e0d0"))
		b.cone(p + Vector3(0.0, r * 1.1, 0.0), r * 1.1, r * 0.7, 7, Color("#e060c8"), Color("#ffd0f4"))
	return b.build()


# --- 7: the cleft --------------------------------------------------------------------------------------------------------


static func _fenrir() -> ArrayMesh:
	var b := FarmMesh.new()
	var rock := Color("#5d6a7c")
	var rock_l := Color("#8c9cb0")
	# two slabs of rock, one taller than the other, turned a little so the opening is a cleft
	b.box(Vector3(-1.05, 1.5, 0.0), Vector3(1.0, 3.0, 1.0), rock, 0.0, 0.18, rock_l)
	b.box(Vector3(1.1, 1.3, 0.0), Vector3(1.0, 2.6, 1.0), rock.darkened(0.06), 0.0, -0.22, rock_l)
	b.box(Vector3(-1.2, 0.3, 0.45), Vector3(0.9, 0.6, 0.5), rock.darkened(0.15), 0.0, -0.3, rock)
	b.box(Vector3(1.3, 0.28, 0.45), Vector3(0.9, 0.56, 0.5), rock.darkened(0.15), 0.0, 0.3, rock)
	# the jagged top: fangs of rock
	for p in [Vector3(-1.2, 3.0, 0.0), Vector3(-0.85, 3.0, 0.1), Vector3(0.95, 2.6, 0.0), Vector3(1.3, 2.6, -0.05)]:
		b.cone(p, 0.22, 0.75 + 0.12 * absf(p.x), 4, rock, rock_l.lightened(0.1))
	# a bridge of stone across the top, cracked, with a gap
	b.box(Vector3(-0.35, 2.75, 0.0), Vector3(0.9, 0.3, 0.7), rock, 0.0, 0.0, rock_l)
	b.box(Vector3(0.5, 2.55, 0.0), Vector3(0.55, 0.3, 0.7), rock, 0.0, 0.0, rock_l)
	# chains hung across the opening (the wolf's) with a heavy link or two
	for k in range(3):
		var y := 2.0 - 0.45 * k
		b.box(Vector3(0.0, y, 0.42), Vector3(1.5, 0.06, 0.06), Color("#8a909c"))
		b.box(Vector3(-0.3 + 0.35 * k, y - 0.08, 0.42), Vector3(0.14, 0.14, 0.08), Color("#6a7080"))
	_door(b, 1.1, 2.3, Color("#0a0e18"))
	# trampled snow in front
	b.box(Vector3(0.0, 0.05, 0.62), Vector3(2.4, 0.1, 0.5), Color("#dfe8f2"), 0.0, 0.0, Color("#ffffff"))
	return b.build()


# --- 8: Bifrost ---------------------------------------------------------------------------------------------------------


static func _bifrost() -> ArrayMesh:
	var b := FarmMesh.new()
	var pearl := Color("#ece4f2")
	var gold := Color("#e8b8a0")
	for sx in [-1.0, 1.0]:
		var x: float = sx * 1.12
		b.box(Vector3(x, 0.14, 0.0), Vector3(0.74, 0.28, 0.8), pearl.darkened(0.1), 0.0, 0.0, pearl)
		b.cylinder(Vector3(x, 0.28, 0.0), 0.27, 0.22, 2.1, 8, pearl.darkened(0.06), pearl.lightened(0.06))
		b.box(Vector3(x, 2.46, 0.0), Vector3(0.7, 0.18, 0.7), gold, 0.0, 0.0, gold.lightened(0.15))
		# a rose-gold lantern on the capital
		b.box(Vector3(x, 2.7, 0.0), Vector3(0.22, 0.3, 0.22), Color("#ffc0a0"), 0.0, 0.0, Color("#fff0e0"))
		b.cone(Vector3(x, 2.85, 0.0), 0.2, 0.22, 4, gold, gold.lightened(0.2))
	b.box(Vector3(0.0, 2.7, 0.0), Vector3(3.0, 0.28, 0.6), pearl, 0.0, 0.0, pearl.lightened(0.1))
	# the rainbow band along the front of the lintel
	var bands := [Color("#e8483a"), Color("#f28a3a"), Color("#f2d23a"), Color("#4fc84f"), Color("#3a8ae8"), Color("#5a4ae0"), Color("#a84ae0")]
	for i in range(7):
		b.box(Vector3(0.0, 2.8 - 0.1 * i + 0.1, 0.31), Vector3(2.9 - 0.14 * i, 0.1, 0.03), bands[i], 0.0)
	# a thin half-ring of rainbow over the doorway
	for i in range(11):
		var t := PI * float(i) / 10.0
		var c: Color = bands[int(float(i) / 11.0 * 7.0)]
		b.box(Vector3(cos(t) * 0.78, 2.35 + sin(t) * 0.32, 0.12), Vector3(0.18, 0.12, 0.1), c)
	_door(b, 1.5, 2.3, Color("#cdb8e6"))
	_steps(b, Color("#e2d8ec"))
	return b.build()
