extends Node
## Every Swedish string the client shows. assets/sv.json is generated from packages/shared/src/sv.ts by
## `pnpm godot:strings`; never edit the json by hand.

var _t: Dictionary = {}
var _seasons: Dictionary = {}


func _ready() -> void:
	var text := FileAccess.get_file_as_string("res://assets/sv.json")
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		_t = parsed.get("T", {})
		_seasons = parsed.get("SEASON_NAMES", {})
	else:
		push_error("assets/sv.json is missing or broken: run `pnpm godot:strings`")


## T.key with {vars} filled in, like fmt() in sv.ts. An unknown key shows the key itself, so it is easy to spot.
func t(key: String, vars: Dictionary = {}) -> String:
	var s: String = str(_t.get(key, key))
	for k in vars:
		s = s.replace("{%s}" % k, str(vars[k]))
	return s


func season(id: String) -> String:
	return str(_seasons.get(id, id))
