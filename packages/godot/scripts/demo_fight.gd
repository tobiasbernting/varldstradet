class_name DemoFight
extends Node
## A scripted fight on the recorded demo (`--demo --fight`, and the bench): the messages a server would send
## during a fight with Draugkryptan's mid-boss, fed to the world on a timeline, so the telegraphs, the boss bar,
## the cast bar, the hit numbers, a fallen friend and the loot window can be looked at (and screenshotted) without
## a server. The shapes follow the data: the mid-boss's slam is a circle, the boss's cleave a cone; a line is fed
## too so every zone shape is seen. Nothing here is a rule: the real fight is the server's.

var world: WorldView
var _t := 0.0
var _step := 0
var _timeline: Array = [] ## [at seconds, the step's method]
var _hx := 0.0
var _hy := 0.0
var _bx := 0.0
var _by := 0.0
var _mx := 0.0
var _my := 0.0
var _boss_id := -1
var _mob_id := -1
var _hp := 1100.0
var _area := ""


func _ready() -> void:
	_area = world.model.my_area_key()
	var w: Dictionary = world.model.areas.get(_area, {})
	var inst: Dictionary = w.get("saga", {})
	_boss_id = int(inst.get("mini", -1))
	# the monster nearest the hero is the one the hero hits
	var best := INF
	for id in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][id]
		if int(id) == _boss_id or Data.is_boss(str(a.get("species", ""))):
			continue
		var d := Vector2(float(a.get("x", 0)), float(a.get("y", 0))).distance_to(Vector2(world.hero.px, world.hero.py))
		if d < best:
			best = d
			_mob_id = int(id)
	# the boss comes to the hero, so everything happens in view
	_hx = world.hero.px
	_hy = world.hero.py
	var tile := Data.tile()
	_bx = _hx + 3.0 * tile
	_by = _hy - 2.0 * tile
	_mx = _hx + 2.0 * tile
	_my = _hy - 1.0 * tile
	_timeline = [
		[0.5, "_s_boss_comes"], [1.0, "_s_yell"], [1.2, "_s_slam_cast"], [2.0, "_s_axe"], [2.8, "_s_axe_crit"], [2.8, "_s_slam_lands"],
		[3.4, "_s_claw"], [4.0, "_s_cleave_cast"], [4.3, "_s_whirl"], [5.3, "_s_cleave_lands"], [5.8, "_s_charge"], [6.5, "_s_nova_cast"],
		[7.0, "_s_line_zone"], [8.0, "_s_rage"], [8.6, "_s_nova_stopped"], [9.0, "_s_line_lands"], [9.5, "_s_wipe"], [12.0, "_s_up_again"],
		[12.5, "_s_axe_big"], [13.0, "_s_loot"],
	]


func _s_boss_comes() -> void:
	_state({}, {}, null)
	_warp_boss(_bx, _by)


func _s_yell() -> void:
	_yell("Ingen stör kungens sömn!")


func _s_slam_cast() -> void:
	_state({str(_boss_id): [_hp, 1100]}, {}, _cast("Gravslaget", 1.5, false))
	_spell(_boss_id, "cast_slam", _bx, _by)
	_zone("z1", "circle", _bx, _by, 2.6, 1500)


func _s_axe() -> void:
	_spell(world.model.me, "yxhugg", _hx, _hy, _mx, _my, _mob_id)
	_hit(_mob_id, 24, "dmg")


func _s_axe_crit() -> void:
	_spell(world.model.me, "yxhugg", _hx, _hy, _mx, _my, _mob_id)
	_hit(_mob_id, 36, "crit")


func _s_slam_lands() -> void:
	_land("z1", "slam", _bx, _by)
	_hit(world.model.me, 28, "dmg")


func _s_claw() -> void:
	_spell(_mob_id, "claw", _mx, _my, _hx, _hy, world.model.me)
	_hit(world.model.me, 7, "dmg")


func _s_cleave_cast() -> void:
	_state({str(_boss_id): [_hp * 0.8, 1100]}, {}, _cast("Kungasvärdet", 1.3, false))
	_spell(_boss_id, "cast_cleave", _bx, _by)
	_zone("z2", "cone", _bx, _by, 3.4, 1300, {"dir": atan2(_hy - _by, _hx - _bx), "arc": 100})


func _s_whirl() -> void:
	_spell(world.model.me, "virvelvind", _hx, _hy)
	_hit(_mob_id, 18, "dmg")


func _s_cleave_lands() -> void:
	_land("z2", "cleave", _bx, _by)


func _s_charge() -> void:
	_spell(world.model.me, "stormsteg", _hx, _hy, _mx, _my, _mob_id)
	_hit(_mob_id, 14, "dmg")
	_hit(_mob_id, 0, "stun")


func _s_nova_cast() -> void:
	_state({str(_boss_id): [_hp * 0.55, 1100]}, {}, _cast("Draugropet", 2.6, true))
	_spell(_boss_id, "cast_nova", _bx, _by)
	_zone("z3", "circle", _bx, _by, 7.0, 2600)


func _s_line_zone() -> void:
	_zone("z4", "line", _bx, _by, 7.0, 2000, {"dir": atan2(_hy - _by, _hx - _bx) + 0.6, "w": 1.6})


func _s_rage() -> void:
	_spell(world.model.me, "raseri", _hx, _hy)


func _s_nova_stopped() -> void:
	_hit(_boss_id, 0, "kick")
	_zone_gone("z3")
	_state({str(_boss_id): [_hp * 0.55, 1100]}, {}, null)


func _s_line_lands() -> void:
	_land("z4", "line", _bx, _by)


func _s_wipe() -> void:
	_state({str(_boss_id): [_hp * 0.3, 1100]}, {"me": [0, 150, 1]}, null)
	_banner("Alla föll…", "Ni vaknar vid vilostenen. Försök igen!", "wipe")


func _s_up_again() -> void:
	_state({str(_boss_id): [_hp * 0.3, 1100]}, {"me": [150, 150, 0]}, null)


func _s_axe_big() -> void:
	_spell(world.model.me, "yxhugg", _hx, _hy, _mx, _my, _mob_id)
	_hit(_mob_id, 61, "crit")


func _s_loot() -> void:
	_loot()


## Plays the timeline again from its start, with the hero up and the boss at full health (the bench measures the same
## fight on every preset).
func restart() -> void:
	_t = 0.0
	_step = 0
	_hp = 1100.0
	_state({}, {"me": [150, 150, 0]}, null)


func _process(delta: float) -> void:
	_t += delta
	while _step < _timeline.size() and _t >= float(_timeline[_step][0]):
		call(str(_timeline[_step][1]))
		_step += 1
	if _step >= _timeline.size() and _t > 20.0:
		# again, so the bench keeps something moving
		_t = 0.0
		_step = 0


func _changes(list: Array) -> void:
	world.feed({"t": "changes", "changes": list})


func _warp_boss(x: float, y: float) -> void:
	var w: Dictionary = world.model.areas.get(_area, {})
	var a: Variant = w.get("animals", {}).get(str(_boss_id))
	if a is Dictionary:
		a["x"] = x
		a["y"] = y
		_changes([{"t": "animal", "id": _boss_id, "animal": a, "area": _area}])


## A `state` with the saga snapshot: the mobs' health, the fighters (me at full unless said), the boss's cast.
func _state(mobs: Dictionary, fighters: Dictionary, cast: Variant) -> void:
	var now := world.model.server_now()
	var f: Dictionary = {}
	for id in world.model.my_saga().get("f", {}).keys():
		f[id] = world.model.my_saga()["f"][id]
	if not f.has(world.model.me):
		f[world.model.me] = [150, 150, 0]
	for id in fighters.keys():
		f[world.model.me if id == "me" else id] = fighters[id]
	var snap := {"f": f, "m": mobs}
	if not mobs.is_empty():
		snap["b"] = {"id": _boss_id, "phase": 1 if _hp * 0.55 >= float(mobs.get(str(_boss_id), [_hp])[0]) else 0}
		if cast is Dictionary:
			snap["b"]["cast"] = cast
	var players: Array = []
	for id in world.model.players().keys():
		var p: Dictionary = world.model.players()[id]
		players.append({"id": id, "x": p.get("x", 0), "y": p.get("y", 0), "facing": p.get("facing", "down"), "moving": false, "held": null, "area": p.get("area", "farm")})
	var animals: Array = []
	var w: Dictionary = world.model.areas.get(_area, {})
	for id in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][id]
		animals.append({"id": int(id), "x": a.get("x", 0), "y": a.get("y", 0), "facing": a.get("facing", "down"), "moving": false, "area": _area})
	world.feed({"t": "state", "timeMs": 0, "day": 1, "season": "none", "players": players, "animals": animals, "npcs": [], "now": now, "saga": {_area: snap}})


func _cast(cast_name: String, warn_s: float, kick: bool) -> Dictionary:
	return {"name": cast_name, "at": world.model.server_now() + warn_s * 1000.0, "warn": warn_s * 1000.0, "kick": kick}


func _spell(by: Variant, spell: String, x: float, y: float, tx: float = NAN, ty: float = NAN, on: Variant = null) -> void:
	var c := {"t": "spell", "area": _area, "by": by, "spell": spell, "x": x, "y": y}
	if not is_nan(tx):
		c["tx"] = tx
		c["ty"] = ty
	if on != null:
		c["on"] = on
	_changes([c])


func _hit(on: Variant, n: int, kind: String) -> void:
	_changes([{"t": "hit", "area": _area, "on": on, "n": n, "kind": kind}])


func _zone(id: String, shape: String, x: float, y: float, r: float, warn_ms: float, extra: Dictionary = {}) -> void:
	var z := {"id": id, "shape": shape, "x": x, "y": y, "r": r, "at": world.model.server_now() + warn_ms, "dmg": 28, "by": _boss_id}
	for k in extra.keys():
		z[k] = extra[k]
	_changes([{"t": "zone", "area": _area, "id": id, "zone": z}])


func _zone_gone(id: String) -> void:
	_changes([{"t": "zone", "area": _area, "id": id, "zone": null}])


func _land(id: String, move: String, x: float, y: float) -> void:
	_changes([{"t": "spell", "area": _area, "by": _boss_id, "spell": "land_" + move, "x": x, "y": y}])
	_zone_gone(id)


func _yell(text: String) -> void:
	_changes([{"t": "yell", "area": _area, "name": "Gravväktaren", "text": text}])


func _banner(text: String, sub: String, kind: String) -> void:
	_changes([{"t": "banner", "to": world.model.me, "area": _area, "text": text, "sub": sub, "kind": kind}])


func _loot() -> void:
	_changes([{"t": "loot", "to": world.model.me, "from": "Gravväktaren", "items": [{"item": "runsvard", "count": 1}, {"item": "healing_potion", "count": 2}], "coins": 32, "stars": 0}])
