class_name Soundscape
extends Node
## The ambience of the outdoor maps (M7b): what the place sounds like at this hour in this weather, as a mix of looping
## layers (assets/audio/*.wav, made by tools/make-audio.py): birdsong by day, crickets and now and then an owl at night,
## frogs in the swamp, the wind (soft or hard with the weather's wind), rain on leaves outside and on the roof inside, the
## surf on the beach, running water near ponds and rivers, a fire's crackle near a hearth, torch or forge and the
## village's murmur. `targets()` is the whole rule (a pure function of the place, the sky and where you stand, tested by the
## bots); `update()` eases each layer towards its target over a couple of seconds, which is the crossfade between maps and
## between times of day: the players live on while the map under them is swapped.
##
## Presets (quality.gd): `ambience` 0 off, 1 (Låg) only the three loudest layers and no proximity or owl, 2 everything.
## Settings: `ambience_on` and `world_volume`. Dungeons have their own sounds: the world calls `update` only outdoors and
## `silence` elsewhere, which fades everything out. Headless nothing is played (a playing stream is still held by the audio
## server when the process exits), but the mix, the players and the fades all run, so the bots can look at them.

const DIR := "res://assets/audio/"
## layer -> its file and its level (dB) at gain 1; the files are normalised to the same peak, so this balances them
const LAYERS := {
	"wind_soft": -10.0, "wind_hard": -9.0, "rain": -9.0, "rain_roof": -7.0, "birds": -9.0, "crickets": -14.0, "frogs": -11.0,
	"water": -8.0, "surf": -8.0, "fire": -9.0, "murmur": -11.0,
}
## what each place has: birds, crickets, frogs, surf, murmur (0..1) and `wind` (extra wind it always has)
const PLACES := {
	"farm": {"birds": 1.0, "crickets": 0.9}, "ang": {"birds": 1.0, "crickets": 1.0}, "skog": {"birds": 1.0, "crickets": 0.7, "wind": 0.1},
	"by": {"birds": 0.5, "crickets": 0.35, "murmur": 1.0}, "trask": {"birds": 0.4, "crickets": 0.6, "frogs": 1.0},
	"djungel": {"birds": 1.0, "crickets": 1.0, "frogs": 0.4}, "svamp": {"birds": 0.4, "crickets": 0.8}, "dino": {"birds": 0.5, "crickets": 0.5},
	"strand": {"birds": 0.35, "surf": 1.0, "wind": 0.1}, "godis": {"birds": 0.5}, "oken": {"wind": 0.4}, "is": {"wind": 0.5},
	"berg": {"birds": 0.2, "wind": 0.4}, "vulkan": {"wind": 0.2}, "rymdbas": {}, "mane": {},
}
const FADE := 1.8 ## seconds: the time constant of a layer easing to its target
const QUIET := 0.004 ## below this gain a layer is stopped
const OWL_PLACES := ["farm", "ang", "skog", "svamp", "by"]
const OWL_GAP := Vector2(22.0, 55.0)

var _gain := {} ## layer -> the gain now (0..1)
var _want := {} ## layer -> the gain it is easing towards
var _players := {} ## layer -> AudioStreamPlayer (made the first time the layer is wanted)
var _on := {} ## layer -> started (headless: would be)
var _streams := {} ## layer -> the looped stream
var _water := 0.0
var _fire := 0.0
var _near_in := 0.0
var _owl_in := 25.0
var _owl: AudioStreamPlayer
var _owl_streams: Array = []
var owls := 0 ## hoots started so far (for the bots)
var fades := 0 ## layers that began or ended (for the bots)


func _ready() -> void:
	for l in LAYERS.keys():
		_gain[l] = 0.0
		_want[l] = 0.0
		_on[l] = false


## The gain (0..1) of every layer for this moment. `ctx`: biome, dark (0 day..1 night), kind (the weather), wind, year (the
## season of the year), seasons (this place has them), indoors, water and fire (how near, 0..1) and level (the preset's).
static func targets(ctx: Dictionary) -> Dictionary:
	var biome := str(ctx.get("biome", "farm"))
	if biome == "":
		biome = "farm"
	var place: Dictionary = PLACES.get(biome, {}) if not biome.begins_with("g_") else {}
	var dark: float = ctx.get("dark", 0.0)
	var kind := str(ctx.get("kind", "sun"))
	var wind: float = ctx.get("wind", 0.35)
	var indoors: bool = ctx.get("indoors", false)
	var cold: bool = str(ctx.get("year", "summer")) == "winter" and bool(ctx.get("seasons", true))
	var level: int = ctx.get("level", 2)
	var water: float = ctx.get("water", 0.0) if level >= 2 else 0.0
	var fire: float = ctx.get("fire", 0.0) if level >= 2 else 0.0
	var day := 1.0 - smoothstep(0.3, 0.7, dark)
	var night := smoothstep(0.45, 0.85, dark)
	var rainy: float = {"rain": 0.85, "storm": 1.0, "hail": 0.7}.get(kind, 0.0)
	var w := clampf(wind / 1.7, 0.0, 1.0)
	var calm := 1.0 - clampf(w * 0.9 + rainy * 0.7, 0.0, 1.0)
	var open := 0.15 if indoors else 1.0 # (behind walls everything outside is soft)
	var cave := biome.begins_with("g_")
	var out := {}
	out["birds"] = day * float(place.get("birds", 0.0)) * calm * (0.35 if cold else 1.0) * open
	out["crickets"] = night * float(place.get("crickets", 0.0)) * (1.0 - rainy) * (1.0 - w * 0.7) * (0.0 if cold else 1.0) * open
	out["frogs"] = float(place.get("frogs", 0.0)) * (0.35 + 0.65 * night) * (1.0 - rainy * 0.4) * open
	var windy := clampf(w + float(place.get("wind", 0.0)), 0.0, 1.0)
	var wind_k := 0.2 if indoors else 1.0
	out["wind_soft"] = (0.16 + 0.7 * windy) * wind_k * (1.0 - smoothstep(0.7, 1.0, windy) * 0.6) * (0.0 if cave else 1.0)
	out["wind_hard"] = smoothstep(0.5, 0.95, windy) * wind_k * (0.0 if cave else 1.0)
	out["rain"] = rainy * (0.0 if indoors else 1.0)
	out["rain_roof"] = rainy * (1.0 if indoors else 0.0)
	out["water"] = water * 0.9 * (0.4 if indoors else 1.0)
	out["surf"] = float(place.get("surf", 0.0)) * (0.4 + 0.6 * water) * open
	out["fire"] = pow(fire, 1.2)
	out["murmur"] = float(place.get("murmur", 0.0)) * (0.3 + 0.7 * day) * (1.0 - rainy * 0.6) * open
	if level <= 1:
		# Låg: the three loudest layers only
		var names: Array = out.keys()
		names.sort_custom(func(a: String, b: String) -> bool: return out[a] > out[b])
		for i in range(3, names.size()):
			out[names[i]] = 0.0
	return out


## Every frame on an outdoor map. `st`: DayNight.sound_state(); `at` the hero; `view` the map (for water and fire).
func update(delta: float, st: Dictionary, at: Vector3, indoors: bool, view: FarmView) -> void:
	var level := Quality.alive("ambience")
	var live := Settings.ambience_on and level > 0
	if live and level >= 2 and view != null:
		_near_in -= delta
		if _near_in <= 0.0:
			_near_in = 0.5
			_water = view.water_near(at, 9.0)
			_fire = view.fire_near(at, 7.0)
	else:
		_water = 0.0
		_fire = 0.0
	if live:
		_want = targets({
			"biome": view.biome() if view != null else "farm", "dark": st.get("dark", 0.0), "kind": st.get("kind", "sun"), "wind": st.get("wind", 0.35),
			"year": st.get("year", "summer"), "seasons": st.get("seasons", true), "indoors": indoors, "water": _water, "fire": _fire, "level": level,
		})
		_owls(delta, st, view, indoors, level)
	else:
		silence(delta)
		return
	_ease(delta)


## Dungeons and the menus: everything fades out.
func silence(delta: float) -> void:
	for l in LAYERS.keys():
		_want[l] = 0.0
	_ease(delta)


func _ease(delta: float) -> void:
	var k := 1.0 - exp(-delta / FADE)
	for l in LAYERS.keys():
		var g: float = lerpf(_gain.get(l, 0.0), _want.get(l, 0.0), k)
		_gain[l] = g
		var vol := g * Settings.world_volume
		if vol > QUIET:
			var p := _player(l)
			p.volume_db = float(LAYERS[l]) + linear_to_db(vol)
			if not _on[l]:
				_on[l] = true
				fades += 1
				if _audible():
					p.play()
		elif _on[l]:
			_on[l] = false
			fades += 1
			if _players.has(l):
				_players[l].stop()


func _player(l: String) -> AudioStreamPlayer:
	var p: AudioStreamPlayer = _players.get(l)
	if p != null:
		return p
	p = AudioStreamPlayer.new()
	p.bus = "Master"
	p.name = l.capitalize().replace(" ", "")
	p.stream = _stream(l)
	add_child(p)
	_players[l] = p
	return p


## A layer's file, as a loop.
func _stream(l: String) -> AudioStream:
	var s: AudioStream = _streams.get(l)
	if s != null:
		return s
	var loaded: AudioStreamWAV = load(DIR + l + ".wav")
	if loaded == null:
		push_warning("soundscape: %s.wav is missing" % l)
		return null
	var looped: AudioStreamWAV = loaded.duplicate()
	looped.loop_mode = AudioStreamWAV.LOOP_FORWARD
	looped.loop_begin = 0
	# the loop ends at the last sample, whatever the import did to the data (16-bit mono is 2 bytes a sample, ADPCM is not)
	looped.loop_end = int(round(loaded.get_length() * float(loaded.mix_rate)))
	_streams[l] = looped
	return looped


static func _audible() -> bool:
	return DisplayServer.get_name() != "headless"


## The odd owl on a clear night in a wood or a meadow.
func _owls(delta: float, st: Dictionary, view: FarmView, indoors: bool, level: int) -> void:
	if level < 2 or indoors or view == null or not (view.biome() in OWL_PLACES or view.biome() == ""):
		return
	var dark: float = st.get("dark", 0.0)
	var kind := str(st.get("kind", "sun"))
	if dark < 0.7 or kind in ["rain", "storm", "hail", "snow"]:
		_owl_in = minf(_owl_in, 8.0) # (the first one comes soon after dusk)
		return
	_owl_in -= delta
	if _owl_in > 0.0:
		return
	_owl_in = randf_range(OWL_GAP.x, OWL_GAP.y)
	owls += 1
	if _owl == null:
		_owl = AudioStreamPlayer.new()
		_owl.bus = "Master"
		add_child(_owl)
		for n in ["owl_1", "owl_2"]:
			_owl_streams.append(load(DIR + n + ".wav"))
	_owl.stream = _owl_streams[owls % 2]
	_owl.volume_db = -11.0 + linear_to_db(maxf(0.05, Settings.world_volume))
	if _audible():
		_owl.play()


## For the bots and the bench: the layers sounding now (gain over 0.02), how many players exist, owls so far.
func report() -> Dictionary:
	var sounding := {}
	for l in _gain.keys():
		if float(_gain[l]) > 0.02:
			sounding[l] = snappedf(float(_gain[l]), 0.01)
	return {"layers": sounding, "players": _players.size(), "owls": owls, "fades": fades}


## Lets go of the streams (the audio server holds a playing stream when the process exits; Main.quit_clean calls this).
func release() -> void:
	for l in _players.keys():
		(_players[l] as AudioStreamPlayer).stop()
		(_players[l] as AudioStreamPlayer).stream = null
		_on[l] = false
	if _owl != null:
		_owl.stop()
		_owl.stream = null
	_owl_streams.clear()
	_streams.clear()
