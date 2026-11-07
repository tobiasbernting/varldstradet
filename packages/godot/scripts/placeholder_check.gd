class_name PlaceholderCheck
extends Node
## `--placeholdercheck`: nothing in the world may be drawn with the stand-in look (the lilac placeholder box of an object kind
## with no model, the stand-in figure of an actor with no sprite sheet, a flat quad where a vehicle should be a body). It
## plays every recorded fixture (the farm, the forest, Köpingen and the dungeons) and fails on whatever the views report
## (`WorldView.placeholder_report()`); and it checks the data: every animal and creature has a sheet, every vehicle builds a
## body, every mesh a kind's look names can be made. Headless, no server.
##
##   godot --headless --path packages/godot -- --placeholdercheck

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
