extends Node
## The shared game data the client needs, read from json the shared package generates: assets/game.json
## (`pnpm godot:data`: object footprints and solidity, the dungeons, the creatures, the classes, the movement
## constants) and assets/sprites/atlas.json (`pnpm godot:sprites`: the sprite sheets). Never edit the json by hand.

var constants: Dictionary = {}
var wall_terrain: Dictionary = {} ## terrain -> true, for ground nobody walks on (WALL_TERRAIN)
var objects: Dictionary = {}
var dungeons: Dictionary = {}
var mobs: Dictionary = {}
var classes: Dictionary = {}
var atlas: Dictionary = {}


func _ready() -> void:
	var g: Variant = _read("res://assets/game.json", "pnpm godot:data")
	if g is Dictionary:
		constants = g.get("constants", {})
		for t in g.get("wallTerrain", []):
			wall_terrain[str(t)] = true
		objects = g.get("objects", {})
		dungeons = g.get("dungeons", {})
		mobs = g.get("mobs", {})
		classes = g.get("classes", {})
	var a: Variant = _read("res://assets/sprites/atlas.json", "pnpm godot:sprites")
	if a is Dictionary:
		atlas = a


static func _read(path: String, how: String) -> Variant:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed == null:
		push_error("%s is missing or broken: run `%s`" % [path, how])
	return parsed


## Pixels per tile (16).
func tile() -> float:
	return float(constants.get("TILE", 16))


func constant(key: String, fallback: float) -> float:
	return float(constants.get(key, fallback))


## An object kind's footprint and whether it blocks walking (an unknown kind is taken as a solid 1×1).
func object_def(kind: String) -> Dictionary:
	return objects.get(kind, {"w": 1, "h": 1, "solid": true})


func is_wall_terrain(t: String) -> bool:
	return wall_terrain.has(t)


## "saga:draug" -> "draug"; "" when the key is not a dungeon's.
func dungeon_of_key(key: String) -> String:
	if not key.begins_with("saga:"):
		return ""
	var id := key.substr(5)
	return id if dungeons.has(id) else ""


func dungeon(id: String) -> Dictionary:
	return dungeons.get(id, {})


## A sheet's entry in the atlas ({} when there is none).
func sheet(sheet_name: String) -> Dictionary:
	var sheets: Dictionary = atlas.get("sheets", {})
	return sheets.get(sheet_name, {})


## The hero sheet for a class and a skin colour (the nearest of the exported skin tones); "" without an atlas.
func hero_sheet(cls: String, skin: String) -> String:
	var heroes: Dictionary = atlas.get("heroes", {})
	var files: Array = heroes.get(cls, heroes.get("krigare", []))
	if files.is_empty():
		return ""
	var skins: Array = atlas.get("skins", [])
	var want := Color.html(skin) if skin.is_valid_html_color() else Color(0.95, 0.79, 0.65)
	var best := 1
	var best_d := INF
	for i in range(skins.size()):
		var c := Color.html(str(skins[i]))
		var d := (c.r - want.r) ** 2 + (c.g - want.g) ** 2 + (c.b - want.b) ** 2
		if d < best_d:
			best_d = d
			best = i
	return str(files[mini(best, files.size() - 1)]).trim_suffix(".png")


## The sheet of a creature, "" when it has none yet.
func mob_sheet(species: String) -> String:
	var s := "mob_" + species
	return s if not sheet(s).is_empty() else ""


func mob_name(species: String) -> String:
	return str(mobs.get(species, {}).get("name", species))
