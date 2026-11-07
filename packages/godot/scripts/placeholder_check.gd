class_name PlaceholderCheck
extends Node
## `--placeholdercheck`: nothing in the world may be drawn with the stand-in look (the lilac placeholder box of an object kind
## with no model, the stand-in figure of an actor with no sprite sheet, a flat quad where a vehicle should be a body). It
## plays every recorded fixture (the farm, the forest, Köpingen and the dungeons) and fails on whatever the views report
## (`WorldView.placeholder_report()`); and it checks the data: every animal and creature has a sheet, every vehicle builds a
## body, every mesh a kind's look names can be made. Headless, no server.
##
##   godot --headless --path packages/godot -- --placeholdercheck

## Object kinds the dungeon view draws with its own cases (dungeon_view.gd `_make_prop`: the torches, the candles, the exit
## stairs, the gate, the rest stone, the chests, the plate, the coffins, the bones, the urns, the run's rune disc; the wall
## tiles are its wall faces) and that no farm or wild map ever holds, so the farm's SPECS and ZoneProps rightly have no model
## for them. The check below proves both halves: the dungeon view makes each of them without a stand-in, and none of them is an
## object of the farm, forest or village fixture. (This is not a list of gaps: every other kind has a look, in
## farm_assets.gd SPECS, wild_meshes.gd or zone_props.gd, and a kind added without one fails the check.)
const DUNGEON_DRAWN := [
	"run_exit",
	"saga_bones",
	"saga_candles",
	"saga_chest",
	"saga_coffin",
	"saga_exit",
	"saga_gate",
	"saga_plate",
	"saga_rest",
	"saga_torch",
	"saga_urn",
	"saga_wall",
]
## (the same, as the farm view's fixtures see them)
const MAP_FIXTURES := ["farm", "forest", "village", "volcano", "mushroom", "jungle"]
const FIXTURES := ["farm", "house", "forest", "village", "volcano", "mushroom", "jungle", "draug", "frost", "surt", "hel", "dvarg", "orm", "alv", "fenrir", "loke"]

var world: WorldView
var _bad := 0


func _ready() -> void:
	_run.call_deferred()


func _fail(text: String) -> void:
	_bad += 1
	print("placeholdercheck: FAIL %s" % text)


func _run() -> void:
	await get_tree().process_frame
	# the data: a sheet for every animal (and a body for every vehicle), a mesh for every name a look uses
	var vehicles := 0
	for species in Data.animals.keys():
		if not Data.mob(str(species)).is_empty():
			if Data.mob_sheet(str(species), 0) == "":
				_fail("creature '%s' has no sprite sheet in the atlas (pnpm godot:sprites)" % species)
			continue
		var sheet := Data.animal_sheet(str(species), false, false, 0)
		if sheet == "":
			_fail("animal '%s' has no sprite sheet in the atlas (pnpm godot:sprites)" % species)
		elif Data.atlas.get("farm_animals", {}).get(species, {}).get("kinds", []).has("vehicle"):
			vehicles += 1
			if VoxelBody.frames(sheet).is_empty():
				_fail("vehicle '%s' builds no body" % species)
	for species in WorldView.VEHICLES:
		if not Data.atlas.get("farm_animals", {}).get(species, {}).get("kinds", []).has("vehicle"):
			_fail("'%s' is a vehicle of the world but not of the atlas" % species)
	var assets := FarmAssets.new()
	var names := 0
	for kind in FarmAssets.SPECS.keys():
		var lo: Variant = FarmAssets.SPECS[kind].get("lo")
		if lo != null and assets.mesh(str(lo)) == null:
			_fail("the cheap look of '%s' names the mesh '%s', which cannot be made" % [kind, lo])
		for m in FarmAssets.SPECS[kind].get("m", []):
			names += 1
			if assets.mesh(str(m)) == null:
				_fail("the look of '%s' names the mesh '%s', which cannot be made" % [kind, m])
	var missing: Array[String] = []
	for kind in Data.objects.keys():
		if not assets.has_spec(str(kind)):
			missing.append(str(kind))
	var undrawn: Array[String] = []
	var mat := StandardMaterial3D.new()
	for kind in missing:
		var z := ZoneProps.make(kind, 0, mat)
		if z == null:
			undrawn.append(kind)
		else:
			z.free()
	for kind in undrawn:
		if not DUNGEON_DRAWN.has(kind):
			_fail("object kind '%s' has no look on a map and no zone prop (add one in farm_assets.gd SPECS, drawn in wild_meshes.gd)" % kind)
	for kind in DUNGEON_DRAWN:
		if not Data.objects.has(kind) or not undrawn.has(kind):
			_fail("'%s' is listed as drawn by the dungeon view alone but now has a look of its own (or is gone): take it off DUNGEON_DRAWN" % kind)
	# every kind a farm map can hold is drawn on the farm view, not only by the dungeon's zone props (a kind with a zone prop and no spec
	# would show the lilac box on the wild map)
	for kind in missing:
		if not undrawn.has(kind) and not kind.begins_with("saga_"): # (the saga_* decor is the dungeons' own: the dungeon view makes it)
			_fail("object kind '%s' is drawn only by zone_props.gd: the wild maps (farm view) would show a placeholder box for it (add a SPEC)" % kind)
	print("placeholdercheck: %d object kinds in the data, %d drawn by the dungeon view alone, none without a look" % [Data.objects.size(), undrawn.size()])
	for p in assets.problems:
		_fail(p)
	print("placeholdercheck: data: %d animals (%d vehicles), %d meshes of %d kinds" % [Data.animals.size(), vehicles, names, FarmAssets.SPECS.size()])
	# the worlds
	for fx in FIXTURES:
		world.farm.assets.problems.clear()
		world.dungeon.problems.clear()
		world.start_demo(fx)
		for i in range(4):
			await get_tree().process_frame
		var report := world.placeholder_report()
		for line in report:
			_fail("%s: %s" % [fx, line])
		print("placeholdercheck: %s: %d stand-ins" % [fx, report.size()])
	# the dungeon-drawn kinds: the dungeon view (a dungeon is on screen now) makes each without a stand-in, and no map fixture holds one
	world.dungeon.problems.clear()
	for kind in DUNGEON_DRAWN:
		if kind == "saga_wall":
			continue # (a wall tile is made of wall faces, `_place` skips it; the dungeon fixtures above draw them)
		var node: Node3D = world.dungeon._make_prop(kind, 0, 3, 3)
		if node != null:
			world.dungeon.add_child(node) # (the dungeon's own lights point at it: it goes with the dungeon, not freed here)
	for p in world.dungeon.problems:
		_fail("dungeon: %s" % p)
	for fx in MAP_FIXTURES:
		var f := FileAccess.open("res://assets/fixtures/%s.json" % fx, FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text()) if f != null else null
		if not (parsed is Dictionary):
			_fail("fixture %s cannot be read" % fx)
			continue
		for m in parsed.get("messages", []):
			if m is Dictionary and m.get("world") is Dictionary:
				var objs: Variant = m["world"].get("objects", {})
				for o in (objs.values() if objs is Dictionary else objs):
					if DUNGEON_DRAWN.has(str(o.get("kind", ""))):
						_fail("%s: a map holds '%s', which only the dungeon view draws" % [fx, o.get("kind")])
	if _bad == 0:
		print("placeholdercheck: all ok")
	(get_tree().current_scene as Main).quit_clean(0 if _bad == 0 else 1)
