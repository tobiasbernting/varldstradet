class_name DemoBosses
extends DemoFight
## The bosses of any saga dungeon on the recorded demo (`--demo=<id> --fight`): the mid-boss and then the boss each play
## every move in `Data.boss(species).moves` the way the server would send it (sagasim.ts startCast / landCast): the cast bar
## and the wind-up, the marks on the floor (a cone, a circle, a strip, circles under the party, a mark on one friend), the
## landing, and what it leaves (burning ground, an ice block round a friend, helpers, the party pulled in, the boss
## landing where the charge was marked), with a phase shout between. Built from the data, so a new dungeon's bosses play
## without code. Nothing here is a rule: the real fight is the server's.
##
## For pictures: `--boss-move=<species>:<move>` holds one move's mark on the floor about 70 % ready, and
## `--boss-move=<species>:<move>:after` holds what it leaves behind (the ice block, the burning ground, the helpers).

var quit_when_done := false ## `--once`: leave the program when the show has played (the CI run)
var only := "" ## "<species>:<move>[:after]", or "" for the whole show
var _q: Array = [] ## [at seconds, Callable]
var _qi := 0
var _show_t := 0.0
var _ids: Dictionary = {} ## species -> animal id
var _held: Array = [] ## the zone changes kept fresh in a held picture
var _spare := 1000 ## ids for the things the demo makes up (zones, blocks, helpers)
var _tile := 16.0
var _fails := 0 ## what the show fed the world and the world did not show (printed at the end as `bosses: ok` or `bosses: FAIL`)
var _checks := 0
var _pending: Array = [] ## [frames left, Callable]: checks made a few frames after something was fed, when the views have had their turn


func _ready() -> void:
	_area = world.model.my_area_key()
	var w: Dictionary = world.model.areas.get(_area, {})
	var inst: Dictionary = w.get("saga", {})
	_ids = {str(w.get("animals", {}).get(str(int(inst.get("mini", -1))), {}).get("species", "")): int(inst.get("mini", -1)), str(w.get("animals", {}).get(str(int(inst.get("boss", -1))), {}).get("species", "")): int(inst.get("boss", -1))}
	_hx = world.hero.px
	_hy = world.hero.py
	_tile = Data.tile()
	_bx = _hx + 3.0 * _tile
	_by = _hy - 2.0 * _tile
	_mx = _hx + 2.0 * _tile
	_my = _hy - 1.0 * _tile
	var order: Array = []
	for id in [inst.get("mini", -1), inst.get("boss", -1)]:
		var a: Variant = w.get("animals", {}).get(str(int(id)))
		if a is Dictionary:
			order.append(str(a.get("species", "")))
	if only != "":
		_hold(only)
		return
	var t := 0.5
	for sp in order:
		t = _boss_show(sp, t)
	_at(t, func() -> void:
		_pending.append([5, func() -> void:
			print("bosses: %s (%d checks, %d failed)" % ["ok" if _fails == 0 and _checks > 0 else "FAIL", _checks, _fails])
			print("bosses: show finished (%s)" % ", ".join(order))
			if quit_when_done:
				(get_tree().current_scene as Main).quit_clean()]))


## One boss's turn on the timeline: it comes, shouts, plays each move (and a shout at each phase), and is beaten.
func _boss_show(sp: String, t0: float) -> float:
	var id: int = _ids[sp]
	var b := Data.boss(sp)
	var max_hp := float(Data.mob(sp).get("hp", 1000))
	var t := t0
	_at(t, func() -> void:
		_boss_id = id
		_boss_name = str(b.get("name", sp))
		_hp = max_hp
		_phase = 0
		_state({}, {"me": [150, 150, 0]}, null)
		_warp(id, _bx, _by))
	t += 0.5
	_at(t, func() -> void: _yell(str(b.get("yells", {}).get("pull", ""))))
	t += 0.8
	var moves: Array = b.get("moves", [])
	var phases: Array = b.get("phases", [])
	var phase := 0
	for mv in moves:
		var need := int(mv.get("phase", 0))
		while phase < need and phase < phases.size():
			phase += 1
			t = _phase_shout(sp, id, max_hp, phase, phases, t)
		t = _move_show(sp, id, mv, max_hp, phase, t)
	for i in range(phase, phases.size()):
		phase += 1
		t = _phase_shout(sp, id, max_hp, phase, phases, t)
	_at(t, func() -> void:
		_hit(id, 40, "crit")
		_state({str(id): [max_hp * 0.02, max_hp]}, {}, null))
	t += 0.8
	_at(t, func() -> void:
		_yell(str(b.get("yells", {}).get("death", "")))
		_warp(id, 2.0 * _tile, 2.0 * _tile)
		print("bosses: %s done" % sp))
	return t + 1.0


func _phase_shout(sp: String, id: int, max_hp: float, phase: int, phases: Array, t: float) -> float:
	var yells: Array = Data.boss(sp).get("yells", {}).get("phase", [])
	_at(t, func() -> void:
		_phase = phase
		_hp = max_hp * float(phases[phase - 1])
		_state({str(id): [_hp, max_hp]}, {}, null)
		if phase - 1 < yells.size():
			_yell(str(yells[phase - 1]))
		# the helpers each new phase calls (sagasim's phase change spawns `phaseAdds` next to the boss)
		var adds: Dictionary = Data.boss(sp).get("phaseAdds", {})
		for k in range(int(adds.get("count", 0))):
			_helper(str(adds.get("species", "")), _bx + (float(k) - 0.5) * 2.0 * _tile, _by + 1.5 * _tile))
	return t + 1.2


## One move: the cast and its marks at `t`, the landing `warn` later, what it leaves, and a breath.
func _move_show(sp: String, id: int, mv: Dictionary, max_hp: float, phase: int, t: float) -> float:
	var move := str(mv.get("move", ""))
	var warn := float(mv.get("warn", 1500)) / 1000.0
	var zones := _marks(mv)
	var ids: Array = []
	for z in zones:
		_spare += 1
		ids.append("dz%d" % _spare)
	_at(t, func() -> void:
		print("bosses: %s %s (%s) casts, %d marks" % [sp, move, str(mv.get("name", "")), zones.size()])
		_state({str(id): [_hp, max_hp]}, {}, _cast(str(mv.get("name", "")), warn, bool(mv.get("interrupt", false))))
		_spell(id, "cast_" + move, _bx, _by)
		for k in range(zones.size()):
			var z: Dictionary = zones[k]
			_zone(ids[k], str(z["shape"]), float(z["x"]), float(z["y"]), float(z["r"]), warn * 1000.0, z.get("extra", {}))
		_expect_zones(ids, true, "%s %s: marked on the floor" % [sp, move]))
	t += warn + 0.05
	var after := 0.6
	_at(t, func() -> void:
		_state({str(id): [_hp, max_hp]}, {}, null)
		_land_move(sp, id, mv, zones, ids)
		# a landed mark is gone; burning ground stays
		_expect_zones(ids, move == "pools", "%s %s: %s after the landing" % [sp, move, "burning on" if move == "pools" else "gone"]))
	if move == "pools":
		after = 3.2
		_at(t + 2.8, func() -> void:
			for k in range(ids.size()):
				_zone_gone(ids[k])
			_expect_zones(ids, false, "%s %s: the burning ground put out" % [sp, move]))
	elif move == "freeze":
		after = 3.0
		_at(t + 2.6, func() -> void: _unfreeze())
	elif move == "summon":
		after = 2.0
	return t + after + 0.3


## The marks a move puts on the floor, by sagasim's startCast: {shape, x, y, r, extra} in pixels and tiles.
func _marks(mv: Dictionary) -> Array:
	var move := str(mv.get("move", ""))
	var r := float(mv.get("radius", 2.0))
	var dir_hb := atan2(_hy - _by, _hx - _bx)
	match move:
		"cleave":
			return [{"shape": "cone", "x": _bx, "y": _by, "r": r, "extra": {"dir": dir_hb, "arc": float(mv.get("arc", 90))}}]
		"slam", "nova", "pull":
			return [{"shape": "circle", "x": _bx, "y": _by, "r": r}]
		"line":
			return [{"shape": "line", "x": _bx, "y": _by, "r": r, "extra": {"dir": dir_hb, "w": float(mv.get("width", 1.6))}}]
		"mend":
			return [{"shape": "circle", "x": _bx, "y": _by, "r": maxf(1.0, r), "extra": {"dmg": 0}}]
		"rain", "pools":
			var out: Array = [{"shape": "circle", "x": _hx, "y": _hy, "r": r}]
			for k in range(int(mv.get("count", 0))):
				var a := 2.1 * float(k + 1)
				out.append({"shape": "circle", "x": _hx + cos(a) * 3.2 * _tile, "y": _hy + sin(a) * 3.2 * _tile, "r": r})
			if move == "pools":
				for z in out:
					z["extra"] = {"until": world.model.server_now() + 60000.0}
			return out
		"charge", "freeze":
			return [{"shape": "circle", "x": _hx, "y": _hy, "r": r}]
	return []


func _land_move(sp: String, id: int, mv: Dictionary, zones: Array, ids: Array) -> void:
	var move := str(mv.get("move", ""))
	if move == "charge" and not zones.is_empty():
		_spell(id, "charge_land", _bx, _by, float(zones[0]["x"]), float(zones[0]["y"]))
		_warp(id, float(zones[0]["x"]) + _tile, float(zones[0]["y"]) - _tile)
	for k in range(zones.size()):
		var z: Dictionary = zones[k]
		_spell(id, "land_" + move, float(z["x"]), float(z["y"]))
		if move == "pools":
			# burning ground stays (the server re-sends the zone with `until` and the damage per second)
			var nz: Dictionary = {"id": ids[k], "shape": "circle", "x": z["x"], "y": z["y"], "r": z["r"], "at": world.model.server_now(), "dmg": 8, "by": id, "until": world.model.server_now() + (60000.0 if only != "" else 3000.0)}
			_changes([{"t": "zone", "area": _area, "id": ids[k], "zone": nz}])
		else:
			_zone_gone(ids[k])
	match move:
		"slam", "cleave", "nova", "line", "rain", "charge":
			_hit(world.model.me, int(mv.get("dmg", 20)), "dmg")
		"pull":
			# the party is pulled in next to the boss (a `warp`), and hurt a little
			_changes([{"t": "warp", "id": world.model.me, "x": _bx - _tile * 1.5, "y": _by + _tile * 1.0, "area": _area}])
			_hit(world.model.me, int(mv.get("dmg", 20)), "dmg")
			_hx = _bx - _tile * 1.5
			_hy = _by + _tile * 1.0
		"freeze":
			_freeze(str(mv.get("block", "isblock")))
		"summon":
			for k in range(int(mv.get("count", 2))):
				_helper(str(mv.get("add", "")), _bx + (float(k) - 0.5) * 2.0 * _tile, _by + _tile)


## The ice block (or web) round me: a block animal on top of me, and the frozen flag in the snapshot.
func _freeze(block: String) -> void:
	_spare += 1
	_ice_id = _spare
	var w: Dictionary = world.model.areas.get(_area, {})
	var a := {"id": _ice_id, "species": block, "x": _hx, "y": _hy + 1.0, "facing": "down", "moving": false, "name": Data.mob_name(block)}
	w.get("animals", {})[str(_ice_id)] = a
	_changes([{"t": "animal", "id": _ice_id, "animal": a, "area": _area}])
	_state({str(_boss_id): [_hp, float(Data.mob(_species_now()).get("hp", 1000))], str(_ice_id): [45, 45]}, {"me": [135, 150, Data.flag("frozen")]}, null)
	_expect_actor(_ice_id, true, "the ice block round a friend")


var _ice_id := -1


func _unfreeze() -> void:
	if _ice_id < 0:
		return
	_changes([{"t": "animal", "id": _ice_id, "animal": null, "area": _area}])
	_expect_actor(_ice_id, false, "the ice block broken")
	_ice_id = -1
	_state({str(_boss_id): [_hp, float(Data.mob(_species_now()).get("hp", 1000))]}, {"me": [135, 150, 0]}, null)


func _species_now() -> String:
	for sp in _ids.keys():
		if _ids[sp] == _boss_id:
			return sp
	return ""


func _helper(species: String, x: float, y: float) -> void:
	if species == "":
		return
	_spare += 1
	var a := {"id": _spare, "species": species, "x": x, "y": y, "facing": "down", "moving": false, "name": Data.mob_name(species)}
	world.model.areas.get(_area, {}).get("animals", {})[str(_spare)] = a
	_changes([{"t": "animal", "id": _spare, "animal": a, "area": _area}])
	_changes([{"t": "fx", "kind": "poof", "x": x, "y": y, "area": _area}])
	_expect_actor(_spare, true, "a helper (%s) called" % species)


func _warp(id: int, x: float, y: float) -> void:
	var w: Dictionary = world.model.areas.get(_area, {})
	var a: Variant = w.get("animals", {}).get(str(id))
	if a is Dictionary:
		a["x"] = x
		a["y"] = y
		_changes([{"t": "animal", "id": id, "animal": a, "area": _area}])


## Checks, a few frames from now, that the fx view holds (or no longer holds) each of these zones.
func _expect_zones(ids: Array, present: bool, what: String) -> void:
	_pending.append([4, func() -> void:
		for zid in ids:
			_checks += 1
			if world.fx._zones.has(zid) != present:
				_fails += 1
				print("bosses: FAIL %s (%s: %s)" % [what, zid, "not drawn" if present else "still drawn"])])


## The same for an animal of the map (a helper or an ice block) in the world view's actors.
func _expect_actor(id: int, present: bool, what: String) -> void:
	_pending.append([4, func() -> void:
		_checks += 1
		if world._actors.has("a:" + str(id)) != present:
			_fails += 1
			print("bosses: FAIL %s (animal %d: %s)" % [what, id, "not drawn" if present else "still drawn"])])


func _at(t: float, f: Callable) -> void:
	_q.append([t, f])


# ---------------------------------------------------------------------------
# A held picture: one move's marks kept about 70 % ready (or what it leaves), for the screenshots in docs/


func _hold(spec: String) -> void:
	var parts := spec.split(":")
	var sp := parts[0]
	var move := parts[1] if parts.size() > 1 else ""
	var after := parts.size() > 2 and parts[2] == "after"
	var b := Data.boss(sp)
	var mv: Dictionary = {}
	for m in b.get("moves", []):
		if str(m.get("move", "")) == move:
			mv = m
	if mv.is_empty() or not _ids.has(sp):
		push_error("demo_bosses: no move %s for %s here" % [move, sp])
		return
	var id: int = _ids[sp]
	var max_hp := float(Data.mob(sp).get("hp", 1000))
	_boss_id = id
	_boss_name = str(b.get("name", sp))
	_hp = max_hp * 0.8
	_at(0.3, func() -> void:
		_state({str(id): [_hp, max_hp]}, {}, null)
		_warp(id, _bx, _by))
	var warn := float(mv.get("warn", 1500)) / 1000.0
	var zones := _marks(mv)
	var ids: Array = []
	for z in zones:
		_spare += 1
		ids.append("dz%d" % _spare)
	if after:
		_at(0.6, func() -> void:
			_state({str(id): [_hp, max_hp]}, {}, null)
			_land_move(sp, id, mv, zones, ids))
		return
	_at(0.6, func() -> void:
		_spell(id, "cast_" + move, _bx, _by)
		_held = [warn, ids, zones, id, mv]
		_refresh_held())


## Feeds the held marks again, with `at` always 30 % of the warning ahead and the fx's clock set 70 % back.
func _refresh_held() -> void:
	if _held.is_empty():
		return
	var warn: float = _held[0]
	var ids: Array = _held[1]
	var zones: Array = _held[2]
	var mv: Dictionary = _held[4]
	var now := world.model.server_now()
	_state({str(_held[3]): [_hp, float(Data.mob(_species_now()).get("hp", 1000))]}, {}, _cast(str(mv.get("name", "")), warn * 0.3, bool(mv.get("interrupt", false))))
	for k in range(zones.size()):
		var z: Dictionary = zones[k]
		var zz := {"id": ids[k], "shape": z["shape"], "x": z["x"], "y": z["y"], "r": z["r"], "at": now + warn * 300.0, "dmg": 28, "by": _held[3]}
		for e in z.get("extra", {}).keys():
			zz[e] = z["extra"][e]
		_changes([{"t": "zone", "area": _area, "id": ids[k], "zone": zz}])
		world.fx._born[ids[k]] = now - warn * 700.0


func _process(delta: float) -> void:
	var left: Array = []
	for c in _pending:
		c[0] -= 1
		if c[0] <= 0:
			c[1].call()
		else:
			left.append(c)
	_pending = left
	_show_t += delta
	while _qi < _q.size() and _show_t >= float(_q[_qi][0]):
		_q[_qi][1].call()
		_qi += 1
	if not _held.is_empty():
		_refresh_held()
