class_name PlaceholderCheck
extends Node
## `--placeholdercheck`: nothing in the world may be drawn with the stand-in look (the lilac placeholder box of an object kind
## with no model, the stand-in figure of an actor with no sprite sheet, a flat quad where a vehicle should be a body). It
## plays every recorded fixture (the farm, the forest, Köpingen and the dungeons) and fails on whatever the views report
## (`WorldView.placeholder_report()`); and it checks the data: every animal and creature has a sheet, every vehicle builds a
## body, every mesh a kind's look names can be made. Headless, no server.
##
##   godot --headless --path packages/godot -- --placeholdercheck

## Object kinds that have no look of their own on a farm or wild map yet and no zone prop either: some are drawn by the dungeon view's
## own cases (saga_wall, saga_gate, saga_torch, saga_exit, saga_plate, saga_rest, saga_chest ...) and the fixtures above prove them; the
## wild maps' own props (banana_plant, beehive, volcano, ufo, ...) are a known gap that shows the lilac placeholder box. The list may
## only shrink: a kind added without a look fails the check, and so does a kind listed here that now has one.
const KNOWN_UNDRAWN := [
	"alvlykta",
	"banana_plant",
	"bath_exit",
	"beehive",
	"bifrostbit",
	"bones",
	"candy_cane",
	"cave_exit",
	"cave_rock",
	"cave_torch",
	"cave_wall",
	"crater",
	"crystal",
	"dino_bones",
	"dino_skeleton",
	"dragon_egg",
	"dvargstaty",
	"earth",
	"easter_twigs",
	"egg_basket",
	"fairy_ring",
	"fenrislanka",
	"fire_crystal",
	"flag_se",
	"flower_wreath_decor",
	"fossil_rock",
	"gem_vein",
	"ghost_flag",
	"giant_glowshroom",
	"giant_mushroom",
	"gingerbread_house",
	"gold_vein",
	"hels_lykta",
	"lights",
	"lollipop_tree",
	"moon_cheese",
	"moon_rock",
	"obsidian_rock",
	"ore",
	"ormtand",
	"pyramid",
	"rocket",
	"ruin_pillar",
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
	"satellite_dish",
	"shipwreck",
	"signpost",
	"snowman_wild",
	"solruna",
	"stalagmite",
	"star_crystal",
	"steam_vent",
	"temple",
	"treasure",
	"ufo",
	"volcano",
	"wisp_jar",
]
const FIXTURES := ["farm", "house", "forest", "village", "draug", "frost", "surt", "hel", "dvarg", "orm", "alv", "fenrir", "loke"]

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
		if not KNOWN_UNDRAWN.has(kind):
			_fail("object kind '%s' has no look on a map and no zone prop (add one in farm_assets.gd SPECS)" % kind)
	for kind in KNOWN_UNDRAWN:
		if not Data.objects.has(kind) or not undrawn.has(kind):
			_fail("'%s' is listed as undrawn but now has a look (or is gone): take it off KNOWN_UNDRAWN" % kind)
	print("placeholdercheck: %d object kinds in the data, %d of them known to have no wild-map look yet" % [Data.objects.size(), undrawn.size()])
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
	if _bad == 0:
		print("placeholdercheck: all ok")
	(get_tree().current_scene as Main).quit_clean(0 if _bad == 0 else 1)
