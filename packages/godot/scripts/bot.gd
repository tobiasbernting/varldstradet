class_name Bot
extends Node
## `--bot`: a headless player, for checking the fight without a human. Against a local server started with
## ACCESS=open and DEV_TELEPORT=1 it logs in (the "Vem är du?" list, creating its character if it is not there),
## asks the dev way into a dungeon, walks to the first pack (a breadth-first path over the map, following the
## same walking rules as a player), casts its four spells on cooldown at the nearest monster, steps out of every
## telegraph that is about to land, and when the pack is beaten (or time runs out) writes a JSON report and quits.
## The report says what it saw: the casts it sent and the ones the server acknowledged, the other players' casts,
## the monsters beaten, the hits it took, the health of every monster at every snapshot, the telegraphs, and any
## errors. tools/bot-check.mts runs two of these against one server and compares the reports.
##
##   godot --headless --path packages/godot -- --bot --server=http://localhost:8080 --name=Bot1 \
##         --report=/tmp/bot1.json [--seconds=90] [--dungeon=draug] [--packs=1]
##
## `--route=arch` (M4a) is the real way in instead of the dev one: after choosing the Krigare (the message the
## browser's class picker sends; the stone it is picked at is in the village, which is not drawn yet) the bot walks
## across the farm to the north opening, across the forest to the west opening, and in the forest beyond to
## Draugkryptan's arch, presses the use key facing it, and the report says which maps it passed and that it arrived in
## `saga:draug` without the dev message ever being sent.

var world: WorldView
var server_url := "http://localhost:8080"
var bot_name := "Bot"
var report_path := ""
var seconds := 90.0
var dungeon_id := "draug"
var packs_wanted := 1
var route := ""
var _route_goal := Vector2i.ZERO
var _route_push := Vector2.ZERO
var _route_act := false
var _route_acted := 0.0
var _api: Api
var _phase := "start" ## start, login, enter, plan, walk, fight, done
var _t := 0.0
var _path: Array = [] ## tiles to walk through
var _pack_ids: Array = [] ## animal ids of the pack being fought
var _packs_done := 0
var _cast_in := 0.0
var _stuck_t := 0.0
var _last_pos := Vector2.ZERO
var _bar_prev: Dictionary = {} ## monster id -> the health its bar showed the last frame (0-1)
var _hp_prev: Dictionary = {} ## monster id -> [hp, max] of the last snapshot
var _healed_until: Dictionary = {} ## monster id -> local ms until which a rise is explained (the server healed it)
const HEAL_GRACE_MS := 2000.0
var _report := {
	"name": "", "ok": false, "phase": "", "seconds": 0.0, "casts_sent": 0, "casts_acked": 0, "spells_sent": {}, "spells_acked": {},
	"others_casts": 0, "others": {}, "monsters_beaten": [], "hits_taken": 0, "damage_taken": 0, "hits_dealt": 0, "damage_dealt": 0,
	"route": [], "arrived_via_arch": false, "dev_sent": false, "zones_seen": 0, "stepped_out": 0, "fell": 0, "hearts": [], "mob_hp": [], "bar_samples": 0, "rises": [], "errors": [], "packs_beaten": 0, "area": "",
}


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--server="):
			server_url = arg.substr(9)
		elif arg.begins_with("--name="):
			bot_name = arg.substr(7)
		elif arg.begins_with("--report="):
			report_path = arg.substr(9)
		elif arg.begins_with("--seconds="):
			seconds = float(arg.substr(10))
		elif arg.begins_with("--dungeon="):
			dungeon_id = arg.substr(10)
		elif arg.begins_with("--packs="):
			packs_wanted = int(arg.substr(8))
		elif arg.begins_with("--route="):
			route = arg.substr(8)
	_report["name"] = bot_name
	_api = Api.new()
	add_child(_api)
	Settings.server_url = Settings.normalize_url(server_url)
	Settings.token = ""
	Settings.pending_code = ""
	world.reset()
	world.hud.set_connection("bot")
	world.model.change.connect(_on_change)
	world.model.snapshot.connect(_on_snapshot)
	world.model.error.connect(func(text: String) -> void: _error("server: " + text))
	if route != "":
		world.model.toast.connect(func(text: String) -> void: _log("toast: " + text))
		world.model.banner.connect(func(text: String, _sub: String, kind: String) -> void: _log("banner %s: %s" % [kind, text]))
		world.model.player_changed.connect(func(id: String, p: Variant) -> void:
			if id == world.model.me and p is Dictionary:
				_log("my record: area %s at %d,%d" % [str(p.get("area", "farm")), int(p.get("x", 0)), int(p.get("y", 0))]))
	Net.connection_changed.connect(func(status: String, code: int) -> void: _log("socket %s (%d) %s" % [status, code, Settings.ws_url()]))
	Net.message.connect(func(msg: Dictionary) -> void:
		if str(msg.get("t", "")) == "welcome":
			_log("welcome as %s" % str(msg.get("you", ""))))
	world.model.area_changed.connect(func(key: String) -> void:
		if route != "":
			_on_route_area(key)
			return
		if Data.dungeon_of_key(key) == dungeon_id and _phase == "enter":
			_report["area"] = key
			_log("in %s" % key)
			_phase = "plan")
	world.combat.cast_sent.connect(func(spell: String, _target: Variant) -> void:
		_report["casts_sent"] += 1
		_report["spells_sent"][spell] = int(_report["spells_sent"].get(spell, 0)) + 1)
	_login()


func _log(text: String) -> void:
	print("bot %s: %s" % [bot_name, text])


func _error(text: String) -> void:
	_report["errors"].append(text)
	_log("ERROR " + text)


func _login() -> void:
	_phase = "login"
	var gate: Dictionary = await _api.gate()
	if not bool(gate.get("ok", false)) or str(gate.get("body", {}).get("gate", "")) != "ok":
		_error("gate: %s" % str(gate))
		_finish()
		return
	var list: Dictionary = await _api.players()
	var id := ""
	if list.get("body") is Array:
		for p in list["body"]:
			if p is Dictionary and str(p.get("name", "")) == bot_name:
				id = str(p.get("id", ""))
	if id == "":
		var made: Dictionary = await _api.request_json(HTTPClient.METHOD_POST, "/api/players", {"name": bot_name, "appearance": {"skin": "#dba97d", "hair": "#5a3a1e", "hairStyle": "short"}})
		if not bool(made.get("ok", false)) or not (made.get("body") is Dictionary):
			_error("create player: %s" % str(made))
			_finish()
			return
		id = str(made["body"].get("id", ""))
	_log("playing as %s (%s)" % [bot_name, id])
	world.reset()
	Net.connect_as(id)
	_phase = "welcome"


func _on_snapshot() -> void:
	# every monster's health at every snapshot (the two bots must agree on these)
	var snap := world.model.my_saga()
	var now := world.model.server_now()
	for id in snap.get("m", {}).keys():
		var m: Array = snap["m"][id]
		if _report["mob_hp"].size() < 4000:
			_report["mob_hp"].append([int(world.model.last_now), int(id), int(m[0]), int(m[1])])
		var before: Variant = _hp_prev.get(id)
		if before is Array and int(before[1]) == int(m[1]) and int(m[0]) > int(before[0]) and not _healed(id):
			_rose("snapshot", id, float(before[0]) / maxf(1.0, float(before[1])), float(m[0]) / maxf(1.0, float(m[1])))
		_hp_prev[id] = [int(m[0]), int(m[1])]
	var f := world.model.my_fighter()
	if f.size() >= 2 and _report["hearts"].size() < 4000:
		_report["hearts"].append([int(now), int(f[0]), int(f[1])])


## Was this monster healed by the server lately (a boss's `mend`: a `hit` of kind heal on it)?
func _healed(id: Variant) -> bool:
	return float(_healed_until.get(str(id), 0.0)) > Time.get_ticks_msec()


## A monster's health went up with no heal from the server: the bar must follow the server's last word downwards.
func _rose(where: String, id: Variant, from: float, to: float) -> void:
	_report["rises"].append([int(world.model.last_now), int(id), snappedf(from, 0.001), snappedf(to, 0.001), where])
	_error("monster %s health rose from %.3f to %.3f (%s)" % [str(id), from, to, where])


## Every frame: what each monster's health bar shows may only fall, except right after the server healed it. A
## monster whose bar is hidden, or that is new, starts again (an idle one is not in the snapshot until it fights).
func _sample_bars() -> void:
	var seen: Dictionary = {}
	for key in world._actors.keys():
		if not str(key).begins_with("a:"):
			continue
		var id := str(key).substr(2)
		var k: float = (world._actors[key] as Actor).shown_health()
		if k < 0.0:
			continue
		seen[id] = true
		_report["bar_samples"] += 1
		if _bar_prev.has(id) and k > float(_bar_prev[id]) + 0.0005 and not _healed(id):
			_rose("bar", id, float(_bar_prev[id]), k)
		_bar_prev[id] = k
	for id in _bar_prev.keys():
		if not seen.has(id):
			_bar_prev.erase(id)


func _on_change(c: Dictionary) -> void:
	var t := str(c.get("t", ""))
	if c.has("area") and str(c.get("area")) != world.model.my_area_key():
		return
	match t:
		"spell":
			var by: Variant = c.get("by")
			if by is String:
				var spell := str(c.get("spell", ""))
				if by == world.model.me:
					_report["casts_acked"] += 1
					_report["spells_acked"][spell] = int(_report["spells_acked"].get(spell, 0)) + 1
				else:
					_report["others_casts"] += 1
					var key := "%s:%s" % [by, spell]
					_report["others"][key] = int(_report["others"].get(key, 0)) + 1
		"hit":
			var on: Variant = c.get("on")
			var kind := str(c.get("kind", ""))
			if (on is float or on is int) and kind == "heal":
				_healed_until[str(int(on))] = Time.get_ticks_msec() + HEAL_GRACE_MS
			if on is String and on == world.model.me and kind in ["dmg", "block"]:
				_report["hits_taken"] += 1
				_report["damage_taken"] += int(c.get("n", 0))
			elif (on is float or on is int) and kind in ["dmg", "crit"]:
				_report["hits_dealt"] += 1
				_report["damage_dealt"] += int(c.get("n", 0))
		"animal":
			if c.get("animal") == null:
				_report["monsters_beaten"].append(int(c.get("id", 0)))
		"zone":
			if c.get("zone") is Dictionary:
				_report["zones_seen"] += 1
		"banner":
			if str(c.get("kind", "")) == "wipe":
				_report["fell"] += 1


func _process(delta: float) -> void:
	_t += delta
	_report["seconds"] = _t
	if _phase == "done":
		return
	_sample_bars()
	if _t > seconds:
		_log("time is up in phase %s" % _phase)
		_finish()
		return
	match _phase:
		"welcome":
			if not world.model.farm.is_empty() and Net.is_open():
				if route != "":
					Net.send({"t": "saga", "a": "class", "cls": "krigare"})
					_phase = "route_plan"
					_log("chose the Krigare, walking to the arch")
				else:
					_phase = "enter"
					_report["dev_sent"] = true
					Net.send({"t": "dev", "a": "saga", "id": dungeon_id})
					_log("asked for %s" % dungeon_id)
		"route_plan":
			_route_plan()
		"route":
			_route_walk(delta)
		"plan":
			_plan()
		"walk":
			_walk(delta)
		"fight":
			_fight(delta)


## The nearest pack (by walking distance) that still has monsters: the path to its first monster.
func _plan() -> void:
	var w: Dictionary = world.model.areas.get(world.model.my_area_key(), {})
	var inst: Dictionary = w.get("saga", {})
	if inst.is_empty():
		# the map's data (`areaData`) can arrive after the player record that moves me into the dungeon
		return
	var start := _my_tile()
	var dist := _distance_field(start)
	var best_pack := -1
	var best_d := 1 << 30
	var packs: Array = inst.get("packs", [])
	for i in range(packs.size()):
		var members: Array = packs[i].get("members", [])
		for mid in members:
			var a: Variant = w.get("animals", {}).get(str(int(mid)))
			if not (a is Dictionary):
				continue
			var tile := _tile_of(float(a.get("x", 0)), float(a.get("y", 0)))
			var d: int = dist.get(tile, 1 << 30)
			if d < best_d:
				best_d = d
				best_pack = i
	if best_pack < 0:
		_log("no pack left to fight")
		_finish()
		return
	_pack_ids = []
	for mid in packs[best_pack].get("members", []):
		_pack_ids.append(int(mid))
	var goal_tile := Vector2i.ZERO
	for mid in _pack_ids:
		var a: Variant = w.get("animals", {}).get(str(mid))
		if a is Dictionary:
			goal_tile = _tile_of(float(a.get("x", 0)), float(a.get("y", 0)))
			break
	_path = _path_to(start, goal_tile, dist)
	_log("pack %d (%s), %d tiles away, path of %d steps" % [best_pack, str(_pack_ids), best_d, _path.size()])
	_phase = "walk"
	world.hero.driven = true
	_stuck_t = 0.0


## A new map while walking the route: note it, finish in the dungeon, plan again in an outdoor map.
func _on_route_area(key: String) -> void:
	if not _report["route"].is_empty() and _report["route"][-1] == key:
		return # (the map's data and my record each say so)
	_report["route"].append(key)
	_log("now in %s" % key)
	if Data.dungeon_of_key(key) == dungeon_id:
		_report["area"] = key
		_report["arrived_via_arch"] = not bool(_report["dev_sent"])
		_report["ok"] = _report["errors"].is_empty() and bool(_report["arrived_via_arch"])
		_finish()
	elif _phase != "done":
		world.hero.drive = Vector2.ZERO
		_phase = "route_plan"
		_path = []


## Where to walk in this map: the opening towards the arch's map, or the arch's front.
func _route_plan() -> void:
	var key := world.model.my_area_key()
	if world._mode != "outdoor" or not world.model.areas.has(key) and key != "farm":
		return # the map is still on its way
	var w := world.model.world_for(key)
	var mw := world.model.map_w(w)
	var mh := world.model.map_h(w)
	_route_act = false
	match key:
		"farm":
			_route_goal = Vector2i(mw / 2, 0)
			_route_push = Vector2(0, -1)
		"a:0,-1":
			_route_goal = Vector2i(0, mh / 2)
			_route_push = Vector2(-1, 0)
		"a:-1,-1":
			var arch: Dictionary = {}
			for o in w.get("objects", {}).values():
				if str(o.get("kind", "")) == "saga_portal" and int(o.get("variant", 0)) == Data.dungeons.keys().find(dungeon_id):
					arch = o
			if arch.is_empty():
				_error("no arch for %s in %s" % [dungeon_id, key])
				_finish()
				return
			# the tile in front of the arch (portalFront): its middle column, below it
			_route_goal = Vector2i(int(arch.get("x", 0)) + 1, int(arch.get("y", 0)) + 2)
			_route_act = true
		_:
			_error("the route does not know the map %s" % key)
			_finish()
			return
	var start := _my_tile()
	var dist := _distance_field(start)
	_path = _path_to(start, _route_goal, dist)
	if _path.is_empty() and start != _route_goal:
		_error("no way from %s to %s in %s" % [str(start), str(_route_goal), key])
		_finish()
		return
	_log("%s: from %s to %s, %d steps" % [key, str(start), str(_route_goal), _path.size()])
	_phase = "route"
	world.hero.driven = true
	_stuck_t = 0.0
	_route_acted = 0.0


func _route_walk(delta: float) -> void:
	var tile := Data.tile()
	var me := Vector2(world.hero.px, world.hero.py)
	if not _path.is_empty():
		var next: Vector2i = _path[0]
		var target := Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
		if me.distance_to(target) < 3.0:
			_path.pop_front()
			return
		_drive_towards(target)
		if me.distance_to(_last_pos) < 0.5:
			_stuck_t += delta
			if _stuck_t > 2.0:
				_log("stuck at %s, planning again" % str(_my_tile()))
				_phase = "route_plan"
		else:
			_stuck_t = 0.0
		_last_pos = me
		return
	if _route_act:
		# at the arch's front: face it and use it, as the use key does (the server sends me in, or says why not)
		world.hero.drive = Vector2.ZERO
		world.hero.facing = "up"
		var saga: Variant = world.model.my_player().get("saga")
		if not (saga is Dictionary and str(saga.get("cls", "")) != ""):
			# the class did not take (the first message can be lost while the socket settles): ask again
			_route_acted += delta
			if fmod(_route_acted, 1.0) < delta:
				Net.send({"t": "saga", "a": "class", "cls": "krigare"})
			return
		_route_acted += delta
		if _route_acted > 0.3 and _route_acted - delta <= 0.3:
			world._act_outdoors(world.hero.facing_object(), str(world.hero.facing_object().get("kind", "")))
		elif _route_acted > 4.0:
			_route_acted = 0.0
		return
	# at the opening: push on outwards until the hero asks for the next map
	world.hero.drive = _route_push


func _my_tile() -> Vector2i:
	return _tile_of(world.hero.px, world.hero.py)


static func _tile_of(x: float, y: float) -> Vector2i:
	var tile := Data.tile()
	return Vector2i(floori(x / tile), floori(y / tile))


## Breadth-first walking distances from a tile over the floor a player may stand on.
func _distance_field(from: Vector2i) -> Dictionary:
	var dist: Dictionary = {from: 0}
	var queue: Array = [from]
	var head := 0
	while head < queue.size():
		var cur: Vector2i = queue[head]
		head += 1
		var d: int = dist[cur]
		for step in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nxt: Vector2i = cur + step
			if dist.has(nxt) or world.hero._is_solid(nxt.x, nxt.y):
				continue
			dist[nxt] = d + 1
			queue.append(nxt)
	return dist


## The tiles from `from` to `goal`, walking downhill in the distance field from the goal (a path exists when the
## goal is in the field).
func _path_to(from: Vector2i, goal: Vector2i, dist: Dictionary) -> Array:
	if not dist.has(goal):
		return []
	var path: Array = [goal]
	var cur := goal
	while cur != from:
		var best := cur
		var best_d: int = dist[cur]
		for step in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nxt: Vector2i = cur + step
			if dist.has(nxt) and int(dist[nxt]) < best_d:
				best_d = dist[nxt]
				best = nxt
		if best == cur:
			break
		cur = best
		path.push_front(cur)
	return path


func _nearest_monster_px() -> Variant:
	var best: Variant = null
	var best_d := INF
	var me := Vector2(world.hero.px, world.hero.py)
	for id in _pack_ids:
		var at: Variant = world.combat.pos_of(id)
		if at == null:
			continue
		var d: float = (at as Vector2).distance_to(me)
		if d < best_d:
			best_d = d
			best = at
	return best


func _walk(delta: float) -> void:
	if _pack_alive() == 0:
		_pack_done()
		return
	# close enough: fight (the server picks the monster in reach)
	var near: Variant = _nearest_monster_px()
	if near != null and (near as Vector2).distance_to(Vector2(world.hero.px, world.hero.py)) < 1.6 * Data.tile():
		_start_fight()
		return
	if _step_out_of_zones():
		return
	if _path.is_empty():
		if near != null:
			_drive_towards(near)
		else:
			_start_fight()
		return
	var tile := Data.tile()
	var next: Vector2i = _path[0]
	var target := Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
	var me := Vector2(world.hero.px, world.hero.py)
	if me.distance_to(target) < 3.0:
		_path.pop_front()
		return
	_drive_towards(target)
	# stuck against something the path did not know about: plan again
	if me.distance_to(_last_pos) < 0.5:
		_stuck_t += delta
		if _stuck_t > 2.0:
			_log("stuck at %s, planning again" % str(_my_tile()))
			_stuck_t = 0.0
			_phase = "plan"
	else:
		_stuck_t = 0.0
	_last_pos = me


func _drive_towards(target: Vector2) -> void:
	var me := Vector2(world.hero.px, world.hero.py)
	world.hero.drive = (target - me).normalized() if me.distance_to(target) > 0.5 else Vector2.ZERO


func _pack_alive() -> int:
	var w: Dictionary = world.model.areas.get(world.model.my_area_key(), {})
	var n := 0
	for id in _pack_ids:
		if w.get("animals", {}).has(str(id)):
			n += 1
	return n


func _start_fight() -> void:
	_phase = "fight"
	world.hero.drive = Vector2.ZERO
	_log("fighting pack %s" % str(_pack_ids))


## A telegraph about to land under me: walk straight out of it (away from its middle, or sideways out of a strip).
func _step_out_of_zones() -> bool:
	var me := Vector2(world.hero.px, world.hero.py)
	var now := world.model.server_now()
	for z in world.model.zones():
		if float(z.get("dmg", 0)) <= 0.0:
			continue
		var burning: bool = z.has("until")
		if not burning and float(z.get("at", 0)) <= now:
			continue
		if not FxView.in_zone(z, me):
			continue
		var centre := Vector2(float(z.get("x", 0)), float(z.get("y", 0)))
		var away: Vector2
		if str(z.get("shape", "")) == "line":
			var dir := float(z.get("dir", 0))
			var side := Vector2(-sin(dir), cos(dir))
			away = side if (me - centre).dot(side) >= 0.0 else -side
		else:
			away = (me - centre).normalized() if me.distance_to(centre) > 1.0 else Vector2(1, 0)
		if world.hero.drive != away:
			_report["stepped_out"] += 1
		world.hero.drive = away
		return true
	return false


func _fight(delta: float) -> void:
	if _pack_alive() == 0:
		_pack_done()
		return
	if _step_out_of_zones():
		return
	var f := world.model.my_fighter()
	if f.size() >= 3 and (int(f[2]) & (Data.flag("down") | Data.flag("frozen"))):
		world.hero.drive = Vector2.ZERO
		return
	# keep within reach of the nearest monster of the pack
	var near: Variant = _nearest_monster_px()
	var me := Vector2(world.hero.px, world.hero.py)
	if near != null and (near as Vector2).distance_to(me) > 1.4 * Data.tile():
		_drive_towards(near)
	else:
		world.hero.drive = Vector2.ZERO
	if world.combat.live_target() == null:
		world.combat.cycle_target()
	_cast_in -= delta
	if _cast_in <= 0.0:
		_cast_in = 0.2
		# the big ones first, the everyday axe last (a press while cooling waits, the last press wins)
		for slot in [3, 2, 1, 0]:
			world.combat.cast_slot(slot)


func _pack_done() -> void:
	_packs_done += 1
	_report["packs_beaten"] = _packs_done
	_log("pack beaten (%d of %d)" % [_packs_done, packs_wanted])
	world.hero.drive = Vector2.ZERO
	if _packs_done >= packs_wanted:
		_report["ok"] = _report["errors"].is_empty()
		_finish()
	else:
		_phase = "plan"


func _finish() -> void:
	if _phase == "done":
		return
	_report["phase"] = _phase
	_phase = "done"
	world.hero.drive = Vector2.ZERO
	world.hero.driven = false
	var f := world.model.my_fighter()
	_report["hearts_now"] = f
	_report["monsters_beaten"] = _report["monsters_beaten"].duplicate()
	var summary := "casts %d sent / %d acked, others' casts %d, monsters beaten %d, hits taken %d (%d), dealt %d (%d), zones %d, stepped out %d, errors %d" % [
		_report["casts_sent"], _report["casts_acked"], _report["others_casts"], _report["monsters_beaten"].size(), _report["hits_taken"], _report["damage_taken"], _report["hits_dealt"], _report["damage_dealt"], _report["zones_seen"], _report["stepped_out"], _report["errors"].size()]
	_log(summary)
	_report["summary"] = summary
	if report_path != "":
		var fa := FileAccess.open(report_path, FileAccess.WRITE)
		if fa != null:
			fa.store_string(JSON.stringify(_report, "  "))
			fa.close()
			_log("report written to %s" % report_path)
		else:
			_log("could not write %s" % report_path)
	Net.disconnect_now()
	await get_tree().create_timer(0.5).timeout
	(get_tree().current_scene as Main).quit_clean(0 if bool(_report["ok"]) else 1)
