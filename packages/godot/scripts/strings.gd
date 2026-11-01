extends Node
## Every Swedish string the client shows. assets/sv.json is generated from packages/shared/src/sv.ts by
## `pnpm godot:strings`; never edit the json by hand.

var _t: Dictionary = {}
var _seasons: Dictionary = {}
var _weather_names: Dictionary = {}
var _weather_emoji: Dictionary = {}
var _places: Dictionary = {}
var _objects: Dictionary = {}
var _species: Dictionary = {}


func _ready() -> void:
	var text := FileAccess.get_file_as_string("res://assets/sv.json")
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		_t = parsed.get("T", {})
		_seasons = parsed.get("SEASON_NAMES", {})
		_weather_names = parsed.get("WEATHER_NAMES", {})
		_weather_emoji = parsed.get("WEATHER_EMOJI", {})
		_places = parsed.get("BIOME_NAMES", {})
		_objects = parsed.get("OBJECT_NAMES", {})
		_species = parsed.get("SPECIES_NAMES", {})
	else:
		push_error("assets/sv.json is missing or broken: run `pnpm godot:strings`")


## T.key with {vars} filled in, like fmt() in sv.ts. An unknown key shows the key itself, so it is easy to spot.
func t(key: String, vars: Dictionary = {}) -> String:
	var s: String = str(_t.get(key, key))
	for k in vars:
		s = s.replace("{%s}" % k, str(vars[k]))
	return s


## T.key when it is a list (the emotes).
func list(key: String) -> Array:
	var v: Variant = _t.get(key)
	return v if v is Array else []


func season(id: String) -> String:
	return str(_seasons.get(id, id))


func weather(id: String) -> String:
	return str(_weather_names.get(id, id))


func weather_emoji(id: String) -> String:
	return str(_weather_emoji.get(id, ""))


## The name of a map: "farm", or a wild map's biome ("skog"); "ang" is the fallback place.
func place(biome: String) -> String:
	return str(_places.get(biome, _places.get("ang", biome)))


func object_name(kind: String) -> String:
	return str(_objects.get(kind, kind))


## An animal species' Swedish name ("hen" -> "Höna").
func species(id: String) -> String:
	return str(_species.get(id, id))
