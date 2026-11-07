class_name Hero
extends Node3D
## Your own hero: walks with the Input Map's move actions at the server's speed, against the server's own rules
## (shared/src/sim.ts: a 10 × 6 px box that slides along solids, stays inside the map, and is stopped by ground
## nobody walks on and by solid objects, walls and gates among them), tells the server (`move`, at most 20 a
## second while walking and once when stopping, like the browser), and takes the server's word when it says
## otherwise: a snapshot more than 40 px away puts you there, a `warp` does so at once.

signal travel_asked(dir: String)

const SEND_EVERY := 0.05
const RECONCILE_PX := 40.0
const RUN_ANIM_RATE := 1.5

var actor: Actor
## Position in the server's pixels (16 a tile), like the browser's player record.
var px := 0.0
var py := 0.0
var facing := "down"
var moving := false
## The map I am on (a WorldState dictionary); {} when nothing is drawn, and then nothing moves.
var world: Dictionary = {}
## 0 when fallen or frozen, SLOW_MUL when slowed (the dungeon's rules), 1 otherwise.
var speed_mul := 1.0
## Running (the browser's 🏃): hold Shift, or the left trigger on a gamepad, or B outside a fight (in a fight B is a spell).
## RUN_SPEED_MUL faster on foot, no stamina; on a mount the mount's speed counts instead (never both). The server needs
## no word of it: `move` carries positions, and a position 1.7 times as far on is as good as any other.
var running := false
var riding := false
## The pizza's power or a berserker's rage: the legs go faster too, as in the browser.
var boosted := false
## In a dungeon (a fight): B casts, so it does not run.
var fight := false
## Set by the bot: runs while it walks (the keys are not read then, as for `drive`).
var run_driven := false
## Snapshots that put me somewhere else than I thought (reconcile): a run must never cause one, the bot counts them.
var reconciled := 0
## What the bot measures a run with: pixels walked and seconds spent moving, since the start.
var walked_px := 0.0
var moving_s := 0.0
var send_moves := true
## An outdoor map (the farm, the wild): its edges lead to the next map, and the farmhouse door is not drawn yet.
var outdoor := false
## Set by the bot (and the spell wheel while it is open): walks this way instead of reading the Input Map.
var drive := Vector2.ZERO
var driven := false
## A window is open (the bag, a name box): stand still.
var frozen := false
var _send_in := 0.0
var _map_w := 64
var _map_h := 64
var _travel_at := -10.0
var _portals: Dictionary = {} ## Vector2i of a portal's `from` tile -> the portal
var _portal_at := -10.0 ## when I last stepped through the farmhouse door (snapshots from before it are stale)
signal portal_used(inside: bool)


func _init() -> void:
	actor = Actor.new()
	add_child(actor)


func reset() -> void:
	world = {}
	drive = Vector2.ZERO
	driven = false
	run_driven = false
	running = false
	riding = false
	boosted = false
	fight = false
	frozen = false
	px = 0.0
	py = 0.0
	facing = "down"
	moving = false
	speed_mul = 1.0
	position = Vector3.ZERO


func set_world(w: Dictionary, is_outdoor := false) -> void:
	world = w
	outdoor = is_outdoor
	# the farm's portals (PORTALS in map.ts) belong to the farm map only: a set of tiles, so a step costs a lookup
	_portals = {}
	if str(w.get("area", "")).is_empty() and w.get("biome") == null:
		for p in Data.portals:
			_portals[Vector2i(int(p.get("from", {}).get("x", -1)), int(p.get("from", {}).get("y", -1)))] = p
	_map_w = int(w.get("w", 64))
	_map_h = int(w.get("h", 64))


## The server's word on where you are (welcome, a warp, a snapshot far from where you thought).
func place(x: float, y: float) -> void:
	px = x
	py = y
	moving = false
	_sync_scene()


## A snapshot of me: taken when it is far from the prediction (the server corrected me on a wall or a gate).
func reconcile(snap: Dictionary) -> void:
	var sx := float(snap.get("x", px))
	var sy := float(snap.get("y", py))
	if Time.get_ticks_msec() / 1000.0 - _portal_at < 0.8:
		return # the server has not heard of the door yet: its snapshot still has me outside (or inside)
	if Vector2(sx - px, sy - py).length() > RECONCILE_PX:
		reconciled += 1
		place(sx, sy)


func _sync_scene() -> void:
	var tile := Data.tile()
	position = Vector3(px / tile, 0.0, py / tile)


func _physics_process(delta: float) -> void:
	if world.is_empty():
		return
	var dir := Vector2.ZERO if frozen else (drive if driven else Input.get_vector("move_left", "move_right", "move_up", "move_down"))
	var was_moving := moving
	running = dir.length() > 0.01 and not frozen and not riding and (run_driven if driven else _run_held())
	var before := Vector2(px, py)
	_step(dir, delta)
	if moving:
		walked_px += before.distance_to(Vector2(px, py))
		moving_s += delta
	if outdoor:
		_edge_travel(dir)
	_send_in -= delta
	if send_moves and ((moving and _send_in <= 0.0) or (was_moving and not moving)):
		_send_in = SEND_EVERY
		Net.send({"t": "move", "x": px, "y": py, "facing": facing, "moving": moving})


## Shift (the Input Map's `run`, which also holds the left trigger), or B on a pad outside a fight.
func _run_held() -> bool:
	if Input.is_action_pressed("run"):
		return true
	if not fight:
		for pad in Input.get_connected_joypads():
			if Input.is_joy_button_pressed(pad, JOY_BUTTON_B):
				return true
	return false


## How much faster the walking animation goes: the browser's 1.5 while running.
func walk_rate() -> float:
	return RUN_ANIM_RATE if (running or (boosted and not riding)) and moving else 1.0


## Walking off an edge of the map inside the opening in its middle asks the server for the next map, as the browser
## does (view.ts: at most once in 1.5 s, standing in the edge gap and pushing outwards).
func _edge_travel(dir: Vector2) -> void:
	if Time.get_ticks_msec() / 1000.0 - _travel_at < 1.5:
		return
	var tile := Data.tile()
	var hw := Data.constant("PLAYER_HALF_W", 5.0)
	var hh := Data.constant("PLAYER_HALF_H", 3.0)
	var tx := floori(px / tile)
	var ty := floori(py / tile)
	var gap := Data.constant("EDGE_GAP", 3.0)
	var w2 := _map_w / 2.0
	var h2 := _map_h / 2.0
	var in_gap := (absf(tx - w2) < gap and (ty < 4 or ty >= _map_h - 4)) or (absf(ty - h2) < gap and (tx < 4 or tx >= _map_w - 4))
	if not in_gap:
		return
	var d := ""
	if dir.y < -0.01 and py <= hh + 1.0:
		d = "n"
	elif dir.y > 0.01 and py >= _map_h * tile - hh - 1.0:
		d = "s"
	elif dir.x < -0.01 and px <= hw + 1.0:
		d = "w"
	elif dir.x > 0.01 and px >= _map_w * tile - hw - 1.0:
		d = "e"
	if d == "":
		return
	_travel_at = Time.get_ticks_msec() / 1000.0
	if send_moves:
		Net.send({"t": "move", "x": px, "y": py, "facing": facing, "moving": false})
		Net.send({"t": "travel", "dir": d})
	travel_asked.emit(d)


## stepPlayer in sim.ts.
func _step(dir: Vector2, delta: float) -> void:
	var len := dir.length()
	if len < 0.01 or speed_mul <= 0.0:
		moving = false
		return
	var ux := dir.x / len
	var uy := dir.y / len
	var mul := speed_mul * (Data.constant("RUN_SPEED_MUL", 1.7) if running else 1.0)
	var dist := Data.constant("PLAYER_SPEED", 64.0) * mul * delta
	var r := _resolve_move(px, py, px + ux * dist, py + uy * dist)
	moving = r.x != px or r.y != py
	px = r.x
	py = r.y
	if absf(ux) > absf(uy):
		facing = "right" if ux > 0.0 else "left"
	else:
		facing = "down" if uy > 0.0 else "up"
	if outdoor:
		_apply_portal()
	_sync_scene()


## resolveMove in sim.ts: slide along solids, one axis at a time, inside the map.
func _resolve_move(x: float, y: float, nx: float, ny: float) -> Vector2:
	var tile := Data.tile()
	var hw := Data.constant("PLAYER_HALF_W", 5.0)
	var hh := Data.constant("PLAYER_HALF_H", 3.0)
	var rx := clampf(nx, hw, _map_w * tile - hw)
	var ry := y
	if _box_blocked(rx, ry, hw, hh):
		rx = x
	ry = clampf(ny, hh, _map_h * tile - hh)
	if _box_blocked(rx, ry, hw, hh):
		ry = y
	return Vector2(rx, ry)


func _box_blocked(cx: float, cy: float, hw: float, hh: float) -> bool:
	var tile := Data.tile()
	var x0 := floori((cx - hw) / tile)
	var x1 := floori((cx + hw - 0.01) / tile)
	var y0 := floori((cy - hh) / tile)
	var y1 := floori((cy + hh - 0.01) / tile)
	for ty in range(y0, y1 + 1):
		for tx in range(x0, x1 + 1):
			if _is_solid(tx, ty):
				return true
	return false


## isSolidForPlayer in sim.ts, for a dungeon: the edge of the map, ground nobody walks on, and solid objects. (No
## villagers or vehicles in a dungeon; its monsters do not block you, as in the browser.)
func _is_solid(tx: int, ty: int) -> bool:
	if tx < 0 or ty < 0 or tx >= _map_w or ty >= _map_h:
		return true
	var terrain: Array = world.get("terrain", [])
	var i := ty * _map_w + tx
	if i < terrain.size() and Data.is_wall_terrain(str(terrain[i])):
		return true
	if outdoor and _is_portal_tile(tx, ty):
		return false # the farmhouse door is not solid (isSolidForPlayer in sim.ts): stepping on it takes me through
	var id: Variant = world.get("occupancy", {}).get("%d,%d" % [tx, ty])
	if id == null:
		return false
	var obj: Variant = world.get("objects", {}).get(str(int(id)))
	if not (obj is Dictionary):
		return false
	return bool(Data.object_def(str(obj.get("kind", ""))).get("solid", true))


## applyPortal in sim.ts: standing on the farmhouse door (or on the way out of its room) puts me at the other end, as the
## browser does; the next `move` tells the server, which accepts a jump between the two ends of a portal.
func _apply_portal() -> void:
	var tile := Data.tile()
	var tx := floori(px / tile)
	var ty := floori(py / tile)
	var p: Variant = _portals.get(Vector2i(tx, ty))
	if not (p is Dictionary):
		return
	var to: Dictionary = p.get("to", {})
	px = (float(to.get("x", tx)) + 0.5) * tile
	py = (float(to.get("y", ty)) + 0.5) * tile
	facing = str(p.get("facing", "down"))
	_portal_at = Time.get_ticks_msec() / 1000.0
	_send_in = 0.0
	portal_used.emit(Data.in_interior(int(to.get("x", tx)), int(to.get("y", ty))))


func _is_portal_tile(tx: int, ty: int) -> bool:
	return _portals.has(Vector2i(tx, ty))


## The swing of a spell: a lunge towards `at` (scene units) and a flash.
func swing(at: Vector3, colour: Color) -> void:
	actor.lunge(at - position, 0.3)
	actor.flash(colour, 0.15)


## The tile in front of me (facingTile in sim.ts: one tile on from the one I stand on).
func facing_tile() -> Vector2i:
	var tile := Data.tile()
	var tx := floori(px / tile)
	var ty := floori(py / tile)
	match facing:
		"left":
			tx -= 1
		"right":
			tx += 1
		"up":
			ty -= 1
		"down":
			ty += 1
	return Vector2i(tx, ty)


## What stands on the tile in front of me ({} when nothing).
func facing_object() -> Dictionary:
	var t := facing_tile()
	var id: Variant = world.get("occupancy", {}).get("%d,%d" % [t.x, t.y])
	if id == null:
		return {}
	var obj: Variant = world.get("objects", {}).get(str(int(id)))
	return obj if obj is Dictionary else {}
