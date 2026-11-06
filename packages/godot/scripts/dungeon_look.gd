class_name DungeonLook
extends RefCounted
## The look of each saga dungeon, in one table keyed by the dungeon's id (`saga:<id>`, DUNGEON_IDS in the shared package):
## the stone and the floor's palette, the torches' light, the air (fog, ambient light, bloom) and the things drifting in it.
## The dungeon view reads nothing else to dress a map, so a dungeon is added by adding a row here (and its decor kinds in
## zone_props.gd); an id with no row, or an empty one, gets NEUTRAL: plain grey stone, warm torches, the ambient colour the
## server sends. The ambient colour itself is data (DUNGEONS[id].ambient in game.json), not a constant here.
##
## Fields of a row (all optional, NEUTRAL fills the rest):
##   wall      the dungeon's `wall` index in the shared data (a run's zones borrow a dungeon's look by that index)
##   stone     tint on the KayKit stone (floor tiles, wall faces, props): ART.md, "Recolouring imported packs"
##   torch     the colour of the wall torches' flame and light
##   floors    terrain -> multiplier on `stone` for the floor tiles of that terrain (on top of FLOORS)
##   boss_decor  the boss hall's floor tiles are KayKit's decorated tile (false: the plain one; the crypt's own hall has the decor)
##   weeds     some floor tiles are the weedy variant (false: only the broken one, for stone and ice that has no weeds)
##   ambient_energy  strength of the ambient light (the dungeon's colour turned down so torches pool light)
##   fog_density, fog_k   the fog's density, and how much of the ambient colour it takes
##   glow      bloom strength
##   motes     "", "snow", "embers" or "wisps": what drifts through the air round the hero (Mellan and Hög)

## Draugkryptan's values are the ones the view had before the table existed (M3a), unchanged.
const NEUTRAL := {
	"wall": -1, "stone": Color(0.8, 0.8, 0.8), "torch": Color(1.0, 0.72, 0.4), "floors": {},
	"ambient_energy": 0.7, "fog_density": 0.035, "fog_k": 0.45, "glow": 0.5, "motes": "", "boss_decor": true, "weeds": true,
}

const LOOKS := {
	"draug": {"wall": 0, "stone": Color(0.78, 0.84, 0.76), "torch": Color(0.62, 1.0, 0.55)}, # Kryptsten, green torches
	"frost": {
		"wall": 1, "stone": Color(0.82, 0.9, 1.0), "torch": Color(0.6, 0.86, 1.0),
		# a cold, clear air with a little more bloom on the rime
		"ambient_energy": 0.8, "fog_density": 0.028, "fog_k": 0.6, "glow": 0.65, "motes": "snow", "boss_decor": false, "weeds": false,
	},
	"surt": {
		"wall": 2, "stone": Color(0.55, 0.5, 0.52), "torch": Color(1.0, 0.58, 0.26),
		# thicker, redder air with embers rising; the forge's floor is black stone, lit enough to read a boss against
		"floors": {"forge": Color(0.8, 0.72, 0.74), "ash": Color(0.7, 0.64, 0.64)},
		"ambient_energy": 0.75, "fog_density": 0.045, "fog_k": 0.55, "glow": 0.7, "motes": "embers", "boss_decor": false, "weeds": false,
	},
	"hel": {
		"wall": 3, "stone": Color(0.6, 0.78, 0.76), "torch": Color(0.6, 1.0, 0.82),
		# a heavy green fog and wisps of ghost-light; the boss hall's stone a little darker, so the ghost queen stands out
		"floors": {"crypt": Color(0.85, 0.9, 0.9)},
		"ambient_energy": 0.7, "fog_density": 0.055, "fog_k": 0.6, "glow": 0.55, "motes": "wisps", "boss_decor": false,
	},
	"dvarg": {"wall": 4, "stone": Color(0.7, 0.7, 0.76), "torch": Color(1.0, 0.86, 0.6)},
	"orm": {"wall": 5, "stone": Color(0.6, 0.76, 0.9), "torch": Color(0.7, 0.92, 1.0)},
	"alv": {"wall": 6, "stone": Color(0.72, 0.62, 0.82), "torch": Color(0.82, 0.7, 1.0)},
	"fenrir": {"wall": 7, "stone": Color(0.78, 0.82, 0.9), "torch": Color(0.62, 0.8, 1.0)},
	"loke": {"wall": 8, "stone": Color(0.9, 0.86, 1.0), "torch": Color(1.0, 0.82, 0.9)},
}

## What the floor tiles of a terrain are tinted with, times the look's stone (the dungeons' floors: crypt flagstones, the
## boss halls' stone, snow, ice, ash, mud, the forge's black stone, Bifrost's glass; the rest in case a plan uses them).
const FLOORS := {
	"crypt": Color(1.0, 1.0, 1.0), "floor_stone": Color(1.1, 1.08, 1.05), "snow": Color(1.3, 1.35, 1.45), "ice": Color(0.9, 1.2, 1.4),
	"forge": Color(0.45, 0.4, 0.42), "bifrost": Color(1.3, 1.25, 1.4), "moss": Color(0.8, 1.1, 0.75), "stone": Color(0.95, 0.95, 0.95),
	"gravel": Color(0.9, 0.88, 0.85), "sand": Color(1.2, 1.1, 0.85), "dirt": Color(0.9, 0.8, 0.7), "floor_wood": Color(1.1, 0.9, 0.7),
	"ash": Color(0.62, 0.58, 0.58), "mud": Color(0.7, 0.62, 0.5),
}


## The row of a dungeon id with NEUTRAL filling every missing field; NEUTRAL itself for an id that is not in the table.
static func of_id(id: String) -> Dictionary:
	var out: Dictionary = NEUTRAL.duplicate()
	var row: Variant = LOOKS.get(id)
	if row is Dictionary:
		for k in row.keys():
			out[k] = row[k]
	return out


## The row whose `wall` index is `wall`: a run's zones and boss maps name the look they borrow by that index.
static func of_wall(wall: int) -> Dictionary:
	for id in LOOKS.keys():
		if int(LOOKS[id].get("wall", -2)) == wall:
			return of_id(str(id))
	return of_id("")


## The look for a map: by the dungeon's id when it has a row, else by the `wall` index in its data (a run's zone), else
## NEUTRAL. `d` is the dungeon's (or the zone's) record from game.json.
static func resolve(id: String, d: Dictionary) -> Dictionary:
	if LOOKS.has(id):
		return of_id(id)
	if d.has("wall"):
		return of_wall(int(d["wall"]))
	return of_id("")


## A look with NEUTRAL's air: the zones of a run borrow a dungeon's stone and torches but have their own weather
## (dungeon_view.gd set_weather), so the dungeon's fog, bloom and drifting motes stay out of them.
static func plain_air(look: Dictionary) -> Dictionary:
	var out: Dictionary = look.duplicate()
	for k in ["ambient_energy", "fog_density", "fog_k", "glow", "motes"]:
		out[k] = NEUTRAL[k]
	return out


## The tint for the floor tiles of a terrain under this look.
static func floor_tint(look: Dictionary, terrain: String) -> Color:
	var mult: Color = look.get("floors", {}).get(terrain, FLOORS.get(terrain, Color(1, 1, 1)))
	return look["stone"] * mult


## The torch colours of the nine dungeons in `wall` order, for the portals on the farm (farm_view.gd).
static func portal_colour(variant: int) -> Color:
	return of_wall(variant % LOOKS.size())["torch"]
