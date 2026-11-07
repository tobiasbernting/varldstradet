class_name Footsteps
extends Node
## Footsteps on the outdoor maps (M7b): one step sound for every stride (0.9 tiles) the hero or another player walks, so
## the rate follows how fast they move and nothing sounds while they stand still. The sound is the ground's under their feet
## (`kind_of`: grass, dirt and gravel, stone and road, wood, sand, snow, shallow water; snow lies on whatever it can cover
## while it is white), three variants each, played as 3D sounds at the walker's feet so that other players are heard from
## their side and fainter the farther they are (the hero's own are full). Made by tools/make-audio.py. Riding has no steps.
##
## Presets: `steps` is how many can sound at once (0: none). Settings: `steps_on`, `world_volume`. Headless nothing is
## played, but every step is counted (`stats`), which the bots check.

const DIR := "res://assets/audio/"
const KINDS := ["grass", "dirt", "stone", "wood", "sand", "snow", "water"]
## the files are normalised to the same peak: this is how loud each ground is (dB)
const LEVEL := {"grass": -8.0, "dirt": -7.0, "stone": -8.0, "wood": -6.0, "sand": -2.0, "snow": -2.0, "water": -12.0}
const STRIDE := 0.9 ## tiles per step
const JUMP := 1.6 ## a move this long in one frame is a teleport, not a step
const HEARD := 16.0 ## tiles: farther away than this nobody's steps are made
const STILL_AFTER := 0.2 ## seconds without moving that count as standing still

var view: FarmView
## what happened so far: steps made, the last ground, and a count of each
var stats := {"steps": 0, "last": "", "kinds": {}}

var _walk := {} ## key -> {at: Vector3, dist: float}
var _streams := {} ## "grass_0" -> AudioStreamWAV
var _pool: Array[AudioStreamPlayer3D] = []
var _next := 0
var _variant := 0


## The ground a step lands on. `snow` is how white the map is (0..1).
static func kind_of(terrain: String, snow: float = 0.0) -> String:
	var snowy := snow > 0.5
	match terrain:
		"water", "pool", "bog", "choco":
			return "water"
		"snow", "ice":
			return "snow"
		"floor_wood":
			return "wood"
		"sand", "redsand", "moon":
			return "sand"
		"road", "sidewalk", "crossing", "rail", "path_stone", "floor_stone", "stone", "crypt", "forge", "bifrost":
			return "snow" if snowy and terrain in ["path_stone", "stone"] else "stone"
		"soil", "soil_wet", "path_dirt", "dirt", "mud", "gravel", "ash", "candy":
			return "snow" if snowy else "dirt"
		"grass", "moss":
			return "snow" if snowy else "grass"
	return "dirt" if terrain != "" else ""


func setup(v: FarmView) -> void:
	view = v
	_walk.clear()


## Every frame on an outdoor map: `walkers` are {key, at (scene position, one unit a tile), me, indoors}; `hero_at` the hero and
## `hero_indoors` whether they are in the farmhouse (steps on the other side of its walls are not heard). A walker that is not in
## the list any more is forgotten.
func tick(delta: float, walkers: Array, hero_at: Vector3, hero_indoors := false) -> void:
	if delta <= 0.0:
		return
	var seen := {}
	for w in walkers:
		var key: String = w["key"]
		var at: Vector3 = w["at"]
		seen[key] = true
		var rec: Dictionary = _walk.get(key, {})
		if rec.is_empty():
			_walk[key] = {"at": at, "dist": STRIDE * 0.5}
			continue
		var moved := (at - rec["at"] as Vector3).length()
		rec["at"] = at
		if moved > JUMP:
			rec["dist"] = STRIDE * 0.5
			continue
		# the speed over the last quarter second (a frame may fall between two physics ticks and show no movement at all)
		rec["win_t"] = float(rec.get("win_t", 0.0)) + delta
		rec["win_d"] = float(rec.get("win_d", 0.0)) + moved
		if float(rec["win_t"]) >= 0.25:
			rec["speed"] = float(rec["win_d"]) / float(rec["win_t"])
			rec["win_t"] = 0.0
			rec["win_d"] = 0.0
		if moved < 0.0005:
			# (the hero moves in physics ticks, which a frame can fall between: standing still takes a moment of no movement)
			rec["still"] = float(rec.get("still", 0.0)) + delta
			if float(rec["still"]) > STILL_AFTER:
				rec["dist"] = STRIDE * 0.5 # (the first step after standing comes half a stride on)
			continue
		rec["still"] = 0.0
		rec["dist"] = float(rec["dist"]) + moved
		if float(rec["dist"]) >= STRIDE:
			rec["dist"] = float(rec["dist"]) - STRIDE
			# (nobody hears steps through the farmhouse's walls: someone on the other side of the door makes none)
			if bool(w.get("me", false)) or bool(w.get("indoors", false)) == hero_indoors:
				_step(at, bool(w.get("me", false)), float(rec.get("speed", 4.0)), hero_at)
	for key in _walk.keys():
		if not seen.has(key):
			_walk.erase(key)


func _step(at: Vector3, mine: bool, speed: float, hero_at: Vector3) -> void:
	var budget := Quality.alive("steps")
	if not Settings.steps_on or budget <= 0 or view == null:
		return
	var d := Vector2(at.x - hero_at.x, at.z - hero_at.z).length()
	if d > HEARD:
		return
	if Settings.world_volume <= 0.001:
		return # (volume 0 is off: not a very quiet step)
	var kind := kind_of(view.ground_under(at), view.sky.snow_cover() if view.sky != null else 0.0)
	if kind == "":
		return
	stats["steps"] = int(stats["steps"]) + 1
	stats["last"] = kind
	stats["kinds"][kind] = int(stats["kinds"].get(kind, 0)) + 1
	if DisplayServer.get_name() == "headless":
		return
	var p := _voice(budget)
	_variant = (_variant + 1 + randi() % 2) % 3
	p.stream = _stream(kind, _variant)
	var fall := 0.0 if mine else clampf((d - 2.0) * 1.6, 0.0, 40.0) + 3.0
	p.volume_db = float(LEVEL[kind]) + linear_to_db(Settings.world_volume) - fall + clampf((speed - 4.0) * 0.5, -2.0, 2.0)
	p.pitch_scale = clampf(0.92 + 0.04 * speed, 0.85, 1.15) * randf_range(0.96, 1.04)
	p.global_position = at
	p.play()


func _voice(budget: int) -> AudioStreamPlayer3D:
	while _pool.size() > budget:
		var extra: AudioStreamPlayer3D = _pool.pop_back()
		extra.stop()
		extra.queue_free()
	if _pool.size() < budget:
		var p := AudioStreamPlayer3D.new()
		p.bus = "Master"
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED # (the level is set by distance from the hero in _step)
		p.max_distance = 0.0
		p.panning_strength = 0.8
		add_child(p)
		_pool.append(p)
		return p
	_next = (_next + 1) % _pool.size()
	return _pool[_next]


func _stream(kind: String, variant: int) -> AudioStream:
	var key := "%s_%d" % [kind, variant]
	var s: AudioStream = _streams.get(key)
	if s == null:
		s = load("%sstep_%s.wav" % [DIR, key])
		_streams[key] = s
	return s


func _exit_tree() -> void:
	release()


func release() -> void:
	for p in _pool:
		p.stop()
		p.stream = null
	_streams.clear()
