class_name WorldModel
extends RefCounted
## The client's mirror of the world, like packages/client/src/state.ts: the farm's player records (everyone, with
## the map they are on), the maps the server has sent in full (`areaData`), the latest snapshot of where everyone
## stands (`state`, ten times a second) and the dungeons' health (`SagaSnap`). Nothing here is authoritative: the
## server's messages are applied as they come, and the view redraws from what is here.
##
## Ids are kept as strings (json object keys are strings; an animal's id is a number in a snapshot and a key in the
## map, so it is `str(int(id))` everywhere). Numbers from json are floats.

signal area_changed(key: String) ## my map changed, or its data arrived
signal object_changed(key: String, id: String, obj: Variant) ## obj null: gone
signal animal_changed(key: String, id: String, animal: Variant)
signal player_changed(id: String, player: Variant)
signal terrain_changed(key: String, x: int, y: int)
signal crop_changed(key: String, k: String, crop: Variant)
signal drop_changed(key: String, id: String, drop: Variant) ## something lying on the ground; drop null: picked up
signal snapshot ## a `state` was applied: new positions and health
signal warped(id: String, x: float, y: float)
signal toast(text: String)
signal banner(text: String, sub: String, kind: String)
signal error(text: String)
## Every change after it was applied (spell, hit, zone, yell, loot, chat, fx, xp… the fight's messages): the
## view draws from these. The area ones carry `area`; the view checks it against the map it draws.
signal change(c: Dictionary)
signal quests_changed ## the day's wishes were redrawn by the server
signal saga_best_changed ## the family beat its best time through a dungeon (the journal shows it)
## Runs (M5c): the run as the server last said it (null: none), the three cards being voted on (null: none), how a run ended
## for me, the dishes I will bring and the sagaträd (my sagafrön and the nodes I planted).
signal run_changed
signal offer_changed
signal run_ended(summary: Dictionary)
signal fardkost_changed
signal tree_changed

var me := ""
var farm: Dictionary = {}
var areas: Dictionary = {}
var player_snaps: Dictionary = {}
var npc_snaps: Dictionary = {} ## the villagers on my map: id -> {x, y, facing, moving}
var time_at := 0 ## Time.get_ticks_msec() when time_ms was set (the clock runs on between snapshots)
var animal_snaps: Dictionary = {} ## the animals on my map only (ids are unique within one map)
var saga: Dictionary = {} ## area key -> SagaSnap {f: {id: [hp, max, flags]}, m: {...}, b?}
var day := 0
var biomes: Dictionary = {} ## the biome of every map explored (welcome, and the ones I walk into)
var time_ms := 0.0
var season := "none"
var weather: Variant = null ## the server's WeatherState {kind, since, until, prev?} or null
var server_offset_ms := 0.0 ## this clock minus the server's
var last_now := 0.0 ## the server's clock on the latest `state` (the bot keys its health samples by it)
var run: Variant = null ## the RunSnap {id, phase, node, row, kind, path, route, area, boss, weather, modifiers, elapsed, max, party, finder, choices?, routeLeft?, level, spirit, runor, earned}, or null
var run_at := 0 ## Time.get_ticks_msec() when `run` arrived (its clock, elapsed, runs on between messages)
var offer: Variant = null ## the RunOfferSnap {node, cards, votes, left, rerolls}, or null
var offer_at := 0
var ended: Variant = null ## {outcome, ms, seeds, zones, runor} of the run I was in last
var fardkost_items: Array = [] ## the dishes I have chosen to bring (item ids)
var fardkost_slots := 1
var tree: Dictionary = {"seeds": 0, "earned": 0, "tree": [], "stage": 0}


func reset() -> void:
	me = ""
	farm = {}
	areas = {}
	player_snaps = {}
	animal_snaps = {}
	saga = {}
	run = null
	offer = null
	ended = null
	fardkost_items = []
	fardkost_slots = 1
	tree = {"seeds": 0, "earned": 0, "tree": [], "stage": 0}


func players() -> Dictionary:
	return farm.get("players", {})


func my_player() -> Dictionary:
	return players().get(me, {})


## The day's wishes the villagers have (Quest records), and the ones I could still do are the windows' to pick.
func quests() -> Array:
	var q: Variant = farm.get("quests")
	return q if q is Array else []


## Am I inside a run's zone?
func in_run() -> bool:
	return Data.is_run_key(my_area_key())


## The run's clock now (ms): the server's last word plus what has passed here since (the server counts while someone is online).
func run_elapsed() -> float:
	if not (run is Dictionary):
		return 0.0
	var base := float(run.get("elapsed", 0))
	if str(run.get("phase", "")) == "ended":
		return base
	return base + float(Time.get_ticks_msec() - run_at)


## Time left to vote (ms), counted down here between the server's messages.
func offer_left() -> float:
	if not (offer is Dictionary):
		return 0.0
	return maxf(0.0, float(offer.get("left", 0)) - float(Time.get_ticks_msec() - offer_at))


## Is a human or the companion of this run me? (the party list of the RunSnap)
func in_run_party() -> bool:
	if not (run is Dictionary):
		return false
	for m in run.get("party", []):
		if m is Dictionary and str(m.get("id", "")) == me:
			return true
	return false


func my_area_key() -> String:
	return str(my_player().get("area", "farm"))


func world_for(key: String) -> Dictionary:
	return farm if key == "farm" else areas.get(key, {})


func map_w(w: Dictionary) -> int:
	return int(w.get("w", 64))


func map_h(w: Dictionary) -> int:
	return int(w.get("h", 64))


## The server's clock now (ms), like the browser's serverNow().
func server_now() -> float:
	return Time.get_unix_time_from_system() * 1000.0 - server_offset_ms


## The telegraphs on my map (SagaZone dictionaries), [] outside a dungeon.
func zones() -> Array:
	var inst: Variant = world_for(my_area_key()).get("saga")
	return inst.get("zones", []) if inst is Dictionary else []


## The saga snapshot of my map ({} before the first one).
func my_saga() -> Dictionary:
	return saga.get(my_area_key(), {})


## A monster's [hp, max] from the snapshot ([] when it is neither fighting nor hurt).
func mob_hp(id: String) -> Array:
	var m: Variant = my_saga().get("m", {}).get(id)
	return m if m is Array else []


## My inventory's count of an item (countItem in the shared package).
func count_item(item: String) -> int:
	var n := 0
	for slot in my_player().get("inventory", []):
		if slot is Dictionary and str(slot.get("item", "")) == item:
			n += int(slot.get("count", 0))
	return n


## The slot I hold (the hotbar's selected one) as a stack dictionary {item, count, charges?}; {} when empty.
func held() -> Dictionary:
	var me_p := my_player()
	var inv: Array = me_p.get("inventory", [])
	var i := int(me_p.get("selected", 0))
	if i >= 0 and i < inv.size() and inv[i] is Dictionary:
		return inv[i]
	return {}


## A chest object on my map by id ({} when it is not there).
func chest(id: int) -> Dictionary:
	var o: Variant = world_for(my_area_key()).get("objects", {}).get(str(id))
	return o if o is Dictionary else {}


## isCallable in shared/src/sim.ts: an animal of mine that listens to "stay" and the whistle: a pet (a dog or a cat, or a wild animal I
## caught with a lasso) or a horse or another mount, never a vehicle.
static func is_callable(a: Dictionary, my_id: String) -> bool:
	if str(a.get("owner", "")) != my_id or my_id == "":
		return false
	var def: Dictionary = Data.animals.get(str(a.get("species", "")), {})
	if bool(def.get("vehicle", false)):
		return false
	return bool(def.get("pet", false)) or bool(def.get("wild", false)) or str(a.get("species", "")) == "horse" or def.has("mount")


## Do I own such an animal on any map I know?
func owns_callable() -> bool:
	for w in [farm] + areas.values():
		if not (w is Dictionary):
			continue
		for a in w.get("animals", {}).values():
			if a is Dictionary and is_callable(a, me):
				return true
	return false


## My own health in the dungeon I am in: [hp, max, flags], or [] when the server has not said.
func my_fighter() -> Array:
	var snap: Dictionary = saga.get(my_area_key(), {})
	var f: Variant = snap.get("f", {}).get(me)
	return f if f is Array else []


func fighter_of(id: String) -> Array:
	var snap: Dictionary = saga.get(my_area_key(), {})
	var f: Variant = snap.get("f", {}).get(id)
	return f if f is Array else []


func apply(msg: Dictionary) -> void:
	match str(msg.get("t", "")):
		"welcome":
			_welcome(msg)
		"state":
			_state(msg)
		"changes":
			for c in msg.get("changes", []):
				if c is Dictionary:
					_change(c)
					if not farm.is_empty():
						change.emit(c)
		"error":
			error.emit(str(msg.get("text", "")))


func _welcome(msg: Dictionary) -> void:
	me = str(msg.get("you", ""))
	farm = msg.get("world", {})
	areas = {}
	player_snaps = {}
	animal_snaps = {}
	npc_snaps = {}
	saga = {}
	biomes = msg.get("biomes", {}) if msg.get("biomes") is Dictionary else {}
	day = int(farm.get("day", 0))
	time_ms = float(farm.get("timeMs", 0))
	time_at = Time.get_ticks_msec()
	season = str(msg.get("season", "none"))
	weather = farm.get("weather")
	server_offset_ms = Time.get_unix_time_from_system() * 1000.0 - float(msg.get("now", 0))
	area_changed.emit(my_area_key())


func _state(msg: Dictionary) -> void:
	if farm.is_empty():
		return
	time_ms = float(msg.get("timeMs", time_ms))
	time_at = Time.get_ticks_msec()
	day = int(msg.get("day", day))
	season = str(msg.get("season", season))
	if msg.get("weather") != null:
		weather = msg.get("weather")
	server_offset_ms = Time.get_unix_time_from_system() * 1000.0 - float(msg.get("now", 0))
	last_now = float(msg.get("now", 0))
	var s: Variant = msg.get("saga")
	saga = s if s is Dictionary else {}
	var seen: Dictionary = {}
	var recs := players()
	for entry in msg.get("players", []):
		var snap: Dictionary = entry
		var id := str(snap.get("id", ""))
		player_snaps[id] = snap
		seen[id] = true
		var rec: Variant = recs.get(id)
		if rec is Dictionary and id != me:
			rec["facing"] = str(snap.get("facing", "down"))
			rec["moving"] = bool(snap.get("moving", false))
	for id in player_snaps.keys():
		if not seen.has(id):
			player_snaps.erase(id)
	var my_map := my_area_key()
	var w := world_for(my_map)
	var animals: Dictionary = w.get("animals", {})
	animal_snaps = {}
	npc_snaps = {}
	for entry in msg.get("npcs", []):
		if str(entry.get("area", "farm")) == my_map:
			npc_snaps[str(entry.get("id", ""))] = entry
	for entry in msg.get("animals", []):
		var snap: Dictionary = entry
		if str(snap.get("area", "farm")) != my_map:
			continue
		var id := str(int(snap.get("id", 0)))
		animal_snaps[id] = snap
		var rec: Variant = animals.get(id)
		if rec is Dictionary:
			rec["facing"] = str(snap.get("facing", "down"))
			rec["moving"] = bool(snap.get("moving", false))
	snapshot.emit()


func _change(c: Dictionary) -> void:
	if farm.is_empty():
		return
	var t := str(c.get("t", ""))
	if t == "areaData":
		var key := str(c.get("key", ""))
		var w: Variant = c.get("world")
		if w is Dictionary:
			_rebuild_occupancy(w)
			# player records inside other maps are copies; the farm's are the ones that are kept up to date
			var recs := players()
			var inside: Dictionary = w.get("players", {})
			for id in inside.keys():
				if recs.has(id):
					inside[id] = recs[id]
			areas[key] = w
			if w.get("biome") != null:
				biomes[key] = str(w.get("biome"))
		else:
			areas.erase(key)
		if my_area_key() == key:
			area_changed.emit(key)
		return
	var area_k := "farm"
	if c.get("area") != null:
		area_k = str(c.get("area"))
	match t:
		"terrain":
			var w := world_for(area_k)
			var terrain: Array = w.get("terrain", [])
			var i := int(c.get("y", 0)) * map_w(w) + int(c.get("x", 0))
			if i >= 0 and i < terrain.size():
				terrain[i] = str(c.get("terrain", ""))
				terrain_changed.emit(area_k, int(c.get("x", 0)), int(c.get("y", 0)))
		"crop":
			var w := world_for(area_k)
			if w.is_empty():
				return
			var ck := str(c.get("k", ""))
			var crop: Variant = c.get("crop")
			var crops: Dictionary = w.get("crops", {})
			if crop is Dictionary:
				crops[ck] = crop
			else:
				crops.erase(ck)
			crop_changed.emit(area_k, ck, crop)
		"drop":
			var w := world_for(area_k)
			if w.is_empty():
				return
			var id := str(int(c.get("id", 0)))
			var drop: Variant = c.get("drop")
			if not w.has("drops"):
				w["drops"] = {}
			if drop is Dictionary:
				w["drops"][id] = drop
			else:
				w["drops"].erase(id)
			drop_changed.emit(area_k, id, drop)
		"object":
			var w := world_for(area_k)
			if w.is_empty():
				return
			var id := str(int(c.get("id", 0)))
			var obj: Variant = c.get("obj")
			var old: Variant = w.get("objects", {}).get(id)
			if old is Dictionary:
				_drop_object(w, old)
			if obj is Dictionary:
				_put_object(w, obj)
			object_changed.emit(area_k, id, obj)
		"animal":
			var w := world_for(area_k)
			if w.is_empty():
				return
			var id := str(int(c.get("id", 0)))
			var animal: Variant = c.get("animal")
			var animals: Dictionary = w.get("animals", {})
			if animal is Dictionary:
				animals[id] = animal
			else:
				animals.erase(id)
				if area_k == my_area_key():
					animal_snaps.erase(id)
			animal_changed.emit(area_k, id, animal)
		"player":
			_player_change(c)
		"warp":
			var id := str(c.get("id", ""))
			var p: Variant = players().get(id)
			if p is Dictionary:
				p["x"] = float(c.get("x", 0))
				p["y"] = float(c.get("y", 0))
				p["moving"] = false
			var snap: Variant = player_snaps.get(id)
			if snap is Dictionary:
				snap["x"] = float(c.get("x", 0))
				snap["y"] = float(c.get("y", 0))
			warped.emit(id, float(c.get("x", 0)), float(c.get("y", 0)))
		"zone":
			# a boss's attack marked on the ground (or burning ground), kept on the map's saga record like the browser
			var w := world_for(area_k)
			var inst: Variant = w.get("saga")
			if not (inst is Dictionary):
				return
			var zones: Array = inst.get("zones", [])
			if not inst.has("zones"):
				inst["zones"] = zones
			var zid := str(c.get("id", ""))
			var i := -1
			for k in range(zones.size()):
				if str(zones[k].get("id", "")) == zid:
					i = k
					break
			var z: Variant = c.get("zone")
			if z is Dictionary:
				if i >= 0:
					zones[i] = z
				else:
					zones.append(z)
			elif i >= 0:
				zones.remove_at(i)
		"sagaBest":
			if not (farm.get("sagaBest") is Dictionary):
				farm["sagaBest"] = {}
			farm["sagaBest"][str(c.get("dungeon", ""))] = c.get("best")
			saga_best_changed.emit()
		"quests":
			farm["quests"] = c.get("quests", [])
			quests_changed.emit()
		"run":
			_run_change(c)
		"seed":
			if str(c.get("to", "")) == me:
				tree = {"seeds": int(c.get("seeds", 0)), "earned": int(c.get("earned", 0)), "tree": c.get("tree", []), "stage": int(c.get("stage", 0))}
				tree_changed.emit()
		"fardkost":
			if str(c.get("to", "")) == me:
				fardkost_items = c.get("items", [])
				fardkost_slots = int(c.get("slots", 1))
				fardkost_changed.emit()
		"day":
			day = int(c.get("day", day))
			farm["day"] = day
		"toast":
			if c.get("to") == null or str(c.get("to")) == me:
				toast.emit(str(c.get("text", "")))
		"banner":
			var mine: bool = c.get("to") == null or str(c.get("to")) == me
			var here: bool = c.get("area") == null or str(c.get("area")) == my_area_key()
			if mine and here:
				banner.emit(str(c.get("text", "")), str(c.get("sub", "")), str(c.get("kind", "")))


func _run_change(c: Dictionary) -> void:
	match str(c.get("ev", "")):
		"state":
			var r: Variant = c.get("run")
			run = r if r is Dictionary else null
			run_at = Time.get_ticks_msec()
			if run == null:
				offer = null
			run_changed.emit()
		"offer":
			var o: Variant = c.get("offer")
			offer = o if o is Dictionary else null
			offer_at = Time.get_ticks_msec()
			offer_changed.emit()
		"ended":
			if str(c.get("to", "")) == me:
				ended = {"outcome": str(c.get("outcome", "leave")), "ms": float(c.get("ms", 0)), "seeds": int(c.get("seeds", 0)), "zones": int(c.get("zones", 0)), "runor": c.get("runor", []), "level": int(c.get("level", 1)), "spirit_used": int(c.get("spiritUsed", 0)), "path": c.get("path", [])}
				run_ended.emit(ended)


func _player_change(c: Dictionary) -> void:
	var id := str(c.get("id", ""))
	var rec: Variant = c.get("player")
	var recs := players()
	if not (rec is Dictionary):
		recs.erase(id)
		_sync_area_players(id, null)
		player_changed.emit(id, null)
		return
	var old: Variant = recs.get(id)
	var moved_map: bool = old is Dictionary and str(old.get("area", "farm")) != str(rec.get("area", "farm"))
	if id == me and old is Dictionary and not moved_map:
		# keep the predicted position: the server's word on where I stand comes with the snapshots
		rec["x"] = old["x"]
		rec["y"] = old["y"]
		rec["facing"] = old["facing"]
		rec["moving"] = old["moving"]
	recs[id] = rec
	_sync_area_players(id, rec)
	player_changed.emit(id, rec)
	if id == me and moved_map:
		area_changed.emit(str(rec.get("area", "farm")))


## The maps already loaded carry their own player lists: keep them in step with the farm's records.
func _sync_area_players(id: String, rec: Variant) -> void:
	for key in areas.keys():
		var inside: Dictionary = areas[key].get("players", {})
		if rec is Dictionary and str(rec.get("area", "farm")) == key:
			inside[id] = rec
		else:
			inside.erase(id)


func _put_object(w: Dictionary, obj: Dictionary) -> void:
	var id := str(int(obj.get("id", 0)))
	w.get("objects", {})[id] = obj
	var def := Data.object_def(str(obj.get("kind", "")))
	var occ: Dictionary = w.get("occupancy", {})
	for dy in range(int(def.get("h", 1))):
		for dx in range(int(def.get("w", 1))):
			occ["%d,%d" % [int(obj.get("x", 0)) + dx, int(obj.get("y", 0)) + dy]] = float(id)


func _drop_object(w: Dictionary, obj: Dictionary) -> void:
	var id := str(int(obj.get("id", 0)))
	var def := Data.object_def(str(obj.get("kind", "")))
	var occ: Dictionary = w.get("occupancy", {})
	for dy in range(int(def.get("h", 1))):
		for dx in range(int(def.get("w", 1))):
			var k := "%d,%d" % [int(obj.get("x", 0)) + dx, int(obj.get("y", 0)) + dy]
			if occ.has(k) and str(int(occ[k])) == id:
				occ.erase(k)
	w.get("objects", {}).erase(id)


func _rebuild_occupancy(w: Dictionary) -> void:
	var occ: Dictionary = {}
	w["occupancy"] = occ
	for obj in w.get("objects", {}).values():
		if obj is Dictionary:
			_put_object(w, obj)
