extends Node
## The shared game data the client needs, read from json the shared package generates: assets/game.json
## (`pnpm godot:data`: object footprints and solidity, the dungeons, the creatures, the classes, the movement
## constants, and since M3b the spells, the bosses' moves, the saga's items, the chat phrases and the fight's
## constants) and assets/sprites/atlas.json (`pnpm godot:sprites`: the sprite sheets and the icon sheet).
## Never edit the json by hand.

var constants: Dictionary = {}
var wall_terrain: Dictionary = {} ## terrain -> true, for ground nobody walks on (WALL_TERRAIN)
var objects: Dictionary = {}
var crops: Dictionary = {}
var npcs: Dictionary = {}
var animals: Dictionary = {}
var portals: Array = []
var dungeons: Dictionary = {}
var mobs: Dictionary = {}
var bosses: Dictionary = {}
var spells: Dictionary = {}
var classes: Dictionary = {}
var items: Dictionary = {}
var rarity_colors: Dictionary = {}
var rarity_names: Dictionary = {}
var chat_phrases: Array = []
var filters: Array = [] ## the bag's filter chips [{id, emoji, categories, name}]
var category_order: Array = []
var flags: Dictionary = {"down": 1, "wall": 2, "rage": 4, "hot": 8, "slow": 16, "frozen": 32}
var interrupt_kinds: Array = ["bash", "charge", "lance"]
var atlas: Dictionary = {}
var _icon_sheet: Texture2D = null
var _icon_cache: Dictionary = {}


func _ready() -> void:
	var g: Variant = _read("res://assets/game.json", "pnpm godot:data")
	if g is Dictionary:
		constants = g.get("constants", {})
		for t in g.get("wallTerrain", []):
			wall_terrain[str(t)] = true
		objects = g.get("objects", {})
		crops = g.get("crops", {})
		npcs = g.get("npcs", {})
		animals = g.get("animals", {})
		portals = g.get("portals", [])
		dungeons = g.get("dungeons", {})
		mobs = g.get("mobs", {})
		bosses = g.get("bosses", {})
		spells = g.get("spells", {})
		classes = g.get("classes", {})
		items = g.get("items", {})
		var rar: Dictionary = g.get("rarity", {})
		rarity_colors = rar.get("colors", {})
		rarity_names = rar.get("names", {})
		chat_phrases = g.get("chatPhrases", [])
		filters = g.get("filters", [])
		category_order = g.get("categoryOrder", [])
		if g.get("flags") is Dictionary:
			flags = g.get("flags")
		if g.get("interruptKinds") is Array:
			interrupt_kinds = g.get("interruptKinds")
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


func flag(flag_name: String) -> int:
	return int(flags.get(flag_name, 0))


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


func spell(id: String) -> Dictionary:
	return spells.get(id, {})


## A class's four spell ids ([] without a class).
func class_spells(cls: String) -> Array:
	return classes.get(cls, {}).get("spells", [])


func boss(species: String) -> Dictionary:
	return bosses.get(species, {})


func is_boss(species: String) -> bool:
	return bosses.has(species)


## A creature's fight record from the data (reach, speed, hp…); {} for an unknown species.
func mob(species: String) -> Dictionary:
	return mobs.get(species, {})


## The ice block or web that holds a frozen friend.
func is_block(species: String) -> bool:
	return bool(mob(species).get("block", false))


func item(id: String) -> Dictionary:
	return items.get(id, {})


func item_name(id: String) -> String:
	return str(item(id).get("name", id))


## An item's category ("tool", "seed", "crop"…), its tool kind ("hoe", "can"…; "" for none) and its stack size.
func item_category(id: String) -> String:
	return str(item(id).get("category", ""))


func item_tool(id: String) -> String:
	return str(item(id).get("tool", ""))


## The filter chip (its id) an item belongs to, like filterOf in shared/src/filters.ts.
func filter_of(id: String) -> String:
	var cat := item_category(id)
	for f in filters:
		if f.get("categories", []).has(cat):
			return str(f.get("id", "other"))
	return "other"


func rarity_color(rarity: String) -> Color:
	var hex := str(rarity_colors.get(rarity, "#ffffff"))
	return Color.html(hex) if hex.is_valid_html_color() else Color.WHITE


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


## An icon from icons.png (`spell_<id>`, `emote_<id>`, `item_<id>`, `ui_<name>`) as a texture; null when missing.
func icon(icon_name: String) -> Texture2D:
	if _icon_cache.has(icon_name):
		return _icon_cache[icon_name]
	var entry: Variant = atlas.get("icons", {}).get(icon_name)
	var tex: Texture2D = null
	if entry is Dictionary:
		if _icon_sheet == null and ResourceLoader.exists("res://assets/sprites/icons.png"):
			_icon_sheet = load("res://assets/sprites/icons.png")
		if _icon_sheet != null:
			var at := AtlasTexture.new()
			at.atlas = _icon_sheet
			at.region = Rect2(float(entry.get("x", 0)), float(entry.get("y", 0)), float(entry.get("w", 32)), float(entry.get("h", 32)))
			tex = at
	_icon_cache[icon_name] = tex
	return tex


## An item's picture for the loot window: its own, else its kind's emoji (the browser's itemIcon).
func item_icon(id: String) -> Texture2D:
	var own := icon("item_" + id)
	if own != null:
		return own
	var kind := str(item(id).get("kind", ""))
	var by_kind := {"weapon": "ui_sword", "offhand": "ui_shield", "potion": "ui_potion", "quest": "ui_box", "material": "ui_box"}
	return icon(str(by_kind.get(kind, "ui_chest")))


## The sheet of a farm or wild animal: its own (baby, winter and colour variants when they exist), "" when none.
func animal_sheet(species: String, baby: bool, jul: bool, variant: int) -> String:
	var info: Dictionary = atlas.get("farm_animals", {}).get(species, {})
	if info.is_empty():
		return ""
	var n := "animal_" + species
	if baby and bool(info.get("baby", false)):
		n += "_baby"
	if jul and bool(info.get("jul", false)):
		n += "_jul"
	var variants := int(info.get("variants", 1))
	if variants > 1 and variant % variants > 0:
		n += "_v%d" % (variant % variants)
	return n if not sheet(n).is_empty() else ""


func npc_sheet(id: String) -> String:
	return str(atlas.get("npcs", {}).get(id, {}).get("sheet", ""))
