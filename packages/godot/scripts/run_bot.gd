class_name RunBot
extends Bot
## `--runbot` (M5c): a headless player that plays a run through the client, on top of the combat bot (bot.gd: its path finding, its
## fighter and its telegraph dodging). Against a local server (ACCESS=open, DEV_TELEPORT=1) it logs in, picks the Krigare, takes the
## starter weapon (the development message), walks across the farm to the färdport and uses it - the arch window opens - and then:
##   --role=lead    waits for the other bot to stand at the arch (45 s at most), presses "Starta färden"
##   --role=follow  presses "Följ med" when it sees the run (it is taken along if it stands within 6 tiles when the lead starts)
## In a zone it fights every pack (bot.gd), walks to the exit and uses it, votes on the first card of the pick, and goes on. The
## report says which zones it entered, the exits it used, the picks it voted on and the runor taken. Without `--full` it is done
## when it has entered the second zone (what the CI can afford); with `--full` it plays on to the boss and home.
## `--shots=dir` (needs a window): pictures of the arch window, a zone, the cards, the end summary and the tree window.
##
##   godot --headless --path packages/godot -- --runbot --route=run --server=http://localhost:8080 --name=Bot-Ask --role=lead \
##         --report=/tmp/run.json [--seconds=420] [--full] [--shots=/tmp/dir]

var role := "lead"
var full := false
var shots_dir := ""
var _zones: Array = []
var _exited: Dictionary = {} ## zone -> true once the run reached the pick (the server let me through)
var _confirmed: Dictionary = {} ## zone -> true once the server's offer showed my vote
var _beat := 5.0
var _kit_t := -1.0
var _kit_sent := false
var _started := false
var _started_at := 0.0
var _window_t := 0.0
var _arch_shot := false
var _cards_shot := false
var _exit_t := 0.0
var _vote_t := 0.0
var _wait_t := 0.0
var _after_run := false
var _ended: Variant = null
var _to_exit := false
var _exit_tile := Vector2i.ZERO
var _replan_t := 0.0
var _replans := 0
var _leave_sent := false
var _goal_override := Vector2i(-1, -1)
var _tree_shot := false


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--role="):
			role = arg.substr(7)
		elif arg == "--full":
			full = true
		elif arg.begins_with("--shots="):
			shots_dir = arg.substr(8)
	super._ready()
	_report["run"] = {"role": role, "zones": [], "exits": 0, "presses": 0, "picks": 0, "runor": [], "started": false, "joined": false, "ended": null, "boss_down": false, "seeds": 0}
	world.model.run_ended.connect(_on_run_ended)


func _process(delta: float) -> void:
	if _phase != "done":
		_rb_tick(delta)
	super._process(delta)


func _arch() -> Dictionary:
	for o in world.model.farm.get("objects", {}).values():
		if o is Dictionary and str(o.get("kind", "")) == "fardport":
			return o
	return {}


## Is another human with a class standing within 5.5 tiles of the arch?
func _partner_near() -> bool:
	var arch := _arch()
	if arch.is_empty():
		return false
	var cx := (float(arch.get("x", 0)) + 1.5) * Data.tile()
	var cy := (float(arch.get("y", 0)) + 1.0) * Data.tile()
	for id in world.model.players().keys():
		if id == world.model.me:
			continue
		var p: Dictionary = world.model.players()[id]
		if bool(p.get("bot", false)) or str(p.get("area", "farm")) != "farm":
			continue
		var saga: Variant = p.get("saga")
		if not (saga is Dictionary and str(saga.get("cls", "")) != ""):
			continue
		var snap: Variant = world.model.player_snaps.get(id)
		var x := float(snap.get("x", p.get("x", 0))) if snap is Dictionary else float(p.get("x", 0))
		var y := float(snap.get("y", p.get("y", 0))) if snap is Dictionary else float(p.get("y", 0))
		if Vector2(x, y).distance_to(Vector2(cx, cy)) <= 5.5 * Data.tile():
			return true
	return false


func _rb_tick(delta: float) -> void:
	var m := world.model
	# a heartbeat every ten seconds, so a log says where the bot waits (the bot logs only events, and a long walk or fight is silent)
	_beat -= delta
	if _beat <= 0.0:
		_beat = 10.0
		var f := m.my_fighter()
		var alive := _pack_alive() if not _pack_ids.is_empty() else -1
		_log("tick %.0f s: phase %s, area %s, tile %s, hp %s, pack %s alive %d, target %s, %d fps, driven %s frozen %s speed %.1f, packs beaten %d, zones %s" % [
			_t, _phase, m.my_area_key(), str(_my_tile()), str(f), str(_pack_ids), alive, str(world.combat.live_target()), Engine.get_frames_per_second(),
			str(world.hero.driven), str(world.hero.frozen), world.hero.speed_mul, _packs_done, str(_zones)])
	# the starter weapon (once the class took), then wear it
	if not _kit_sent and Gear.cls_of(m.my_player()) != "":
		_kit_sent = true
		Net.send({"t": "dev", "a": "starter"})
		_kit_t = 1.0
	if _kit_t >= 0.0:
		_kit_t -= delta
		if _kit_t < 0.0:
			Net.send({"t": "saga", "a": "equip", "slot": "weapon", "item": "jarnyxa"})
			_log("starter weapon asked for")
	# the arch window on the farm
	var win := world.play.windows.run_arch
	if win.is_open():
		_window_t += delta
		if _window_t > 0.8 and not _arch_shot:
			_arch_shot = true
			_shot("m5c-arch", 0.0)
		if role == "lead":
			var ready := _partner_near() or _window_t > 45.0
			if ready and not _started and _window_t > 1.2 and win.start_button != null and not win.start_button.disabled:
				_started = true
				_started_at = _t
				_report["run"]["started"] = true
				_log("Starta färden")
				win.start_button.pressed.emit()
		elif win.join_button != null and _window_t > 0.5:
			_report["run"]["joined"] = true
			_log("Följ med")
			win.join_button.pressed.emit()
	else:
		_window_t = 0.0
	if world.play.windows.seed_tree.is_open() and shots_dir != "" and not _tree_shot:
		_tree_shot = true
		await _shot("m5c-tree", 0.6)
		_success()
		return
	if _started and not m.in_run() and _t - _started_at > 10.0 and m.run == null:
		_started = false # the server did not take it (a toast): try again
	# the pick: press the real first card (the button a player would press) and count the vote when the server's offer shows it
	if m.offer is Dictionary and world.run_pick.is_open():
		_vote_t += delta
		var zone := int(m.offer.get("zone", 0))
		var mine: Variant = m.offer.get("votes", {}).get(m.me)
		if mine != null and int(mine) == 0 and not _confirmed.has(zone):
			_confirmed[zone] = true
			_report["run"]["picks"] = int(_report["run"]["picks"]) + 1
			_log("the server shows my vote on card 0 after zone %d" % zone)
		if _vote_t > 0.9 and not _cards_shot and not _confirmed.has(zone):
			_cards_shot = true
			_shot("m5c-cards", 0.0)
		if _vote_t > 1.6 and not _confirmed.has(zone) and fmod(_vote_t, 2.0) < delta and not world.run_pick.buttons.is_empty():
			_log("pressing card 0 after zone %d" % zone)
			(world.run_pick.buttons[0] as Button).pressed.emit()
	else:
		_vote_t = 0.0
	if m.run is Dictionary and str(m.run.get("phase", "")) == "pick" and not _exited.has(int(m.run.get("zone", 0))):
		_exited[int(m.run.get("zone", 0))] = true
		_report["run"]["exits"] = int(_report["run"]["exits"]) + 1
	if m.run is Dictionary:
		_report["run"]["runor"] = m.run.get("runor", [])
		_report["run"]["seeds"] = int(m.run.get("earned", {}).get(m.me, 0))
		if str(m.run.get("phase", "")) == "victory" and not _leave_sent:
			_report["run"]["boss_down"] = true
			_leave_sent = true
			_log("the boss is down")
			Net.send({"t": "run", "a": "leave"})
	# walking to the exit
	if _phase == "rb_exit":
		_walk_to_exit(delta)


## On the farm: the arch's front. In a zone: the combat bot takes over.
func _route_plan() -> void:
	var m := world.model
	if m.in_run():
		_enter_zone()
		return
	if world._mode != "outdoor" or _after_run:
		return
	var arch := _arch()
	if arch.is_empty():
		_error("no färdport on the farm")
		_finish()
		return
	_route_goal = Vector2i(int(arch.get("x", 0)) + 1, int(arch.get("y", 0)) + 2)
	if _goal_override.x >= 0:
		_route_goal = _goal_override
	_route_act = true
	_route_acted = 0.0
	var start := _my_tile()
	var dist := _distance_field(start)
	_path = _path_to(start, _route_goal, dist)
	if _path.is_empty() and start != _route_goal:
		_error("no way from %s to the arch front %s" % [str(start), str(_route_goal)])
		_finish()
		return
	_log("to the färdport: %d steps" % _path.size())
	_phase = "route"
	world.hero.driven = true
	_stuck_t = 0.0


func _enter_zone() -> void:
	var key := world.model.my_area_key()
	var zi := Data.zone_index(key)
	if not _zones.has(zi):
		_zones.append(zi)
		_report["run"]["zones"] = _zones.duplicate()
		_log("in zone %d (%s)" % [zi, key])
		if shots_dir != "" and zi == 0:
			_shot("m5c-zone", 7.0)
	_report["area"] = key
	_to_exit = false
	if zi >= 1 and not full:
		if shots_dir != "":
			_pictures_after()
		else:
			_success()
		return
	_phase = "plan"
	_pack_ids = []
	world.hero.driven = true
	world.hero.drive = Vector2.ZERO


## All packs here are down: on to the exit, or (the boss's map) to the boss.
func _no_pack_left() -> void:
	var m := world.model
	var key := m.my_area_key()
	var w: Dictionary = m.areas.get(key, {})
	var inst: Dictionary = w.get("saga", {})
	if Data.zone_index(key) == 3:
		var boss_id := int(inst.get("boss", -1))
		var boss: Variant = w.get("animals", {}).get(str(boss_id))
		if boss is Dictionary:
			_pack_ids = [boss_id]
			_path = _path_to(_my_tile(), _tile_of(float(boss.get("x", 0)), float(boss.get("y", 0))), _distance_field(_my_tile()))
			_phase = "walk"
			world.hero.driven = true
			_log("to the boss")
			return
		# the boss is down: the run says victory and the bot leaves (see _rb_tick)
		_phase = "rb_wait"
		return
	for o in w.get("objects", {}).values():
		if o is Dictionary and str(o.get("kind", "")) == "run_exit":
			_exit_tile = Vector2i(int(o.get("x", 0)), int(o.get("y", 0)))
			_path = _path_to(_my_tile(), _exit_tile, _distance_field(_my_tile()))
			_replans = 0
			_phase = "rb_exit"
			_to_exit = true
			_exit_t = 0.0
			world.hero.driven = true
			_log("to the exit: %d steps" % _path.size())
			return
	_error("no run_exit in %s" % key)
	_finish()


func _walk_to_exit(delta: float) -> void:
	var tile := Data.tile()
	var me := Vector2(world.hero.px, world.hero.py)
	if not _path.is_empty():
		var next: Vector2i = _path[0]
		var target := Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
		if me.distance_to(target) < 3.0:
			_path.pop_front()
			return
		_drive_towards(target)
		return
	world.hero.drive = Vector2.ZERO
	if _my_tile() != _exit_tile:
		# not on the rune disc (no way yet: the gate may still be solid in the model, or I was pushed): plan again, for a while
		_replan_t += delta
		if _replan_t > 0.5:
			_replan_t = 0.0
			_replans += 1
			_path = _path_to(_my_tile(), _exit_tile, _distance_field(_my_tile()))
			_log("no path to the exit %s from %s, planning again (%d)" % [str(_exit_tile), str(_my_tile()), _replans])
			if _replans > 20:
				_error("could not reach the exit at %s" % str(_exit_tile))
				_finish()
		return
	_replans = 0
	# standing on the rune disc: use it every second and a half until the server lets us through (the gate opens when the packs are down)
	_exit_t -= delta
	if _exit_t <= 0.0:
		_exit_t = 1.5
		_report["run"]["presses"] = int(_report["run"]["presses"]) + 1
		world._act()


func _on_run_ended(summary: Dictionary) -> void:
	_ended = summary
	_report["run"]["ended"] = summary
	_log("run ended: %s" % str(summary))
	_after_run = true
	if shots_dir != "":
		return # (the picture sequence finishes the bot)
	if full and str(summary.get("outcome", "")) == "win":
		_success()
	elif str(summary.get("outcome", "")) == "leave" and bool(_report["run"]["boss_down"]):
		_success()
	elif _phase != "done":
		_error("the run ended: %s" % str(summary.get("outcome", "")))
		_finish()


## A pack is down: a run bot never stops for that (the combat bot would after `packs_wanted`); it plans the next pack, or the exit.
func _pack_done() -> void:
	_packs_done += 1
	_report["packs_beaten"] = _packs_done
	world.hero.drive = Vector2.ZERO
	_phase = "plan"


func _success() -> void:
	_report["ok"] = _report["errors"].is_empty()
	_finish()


## The picture run: leave the run after the second zone began, see the summary, then the tree.
func _pictures_after() -> void:
	if _leave_sent:
		return
	_leave_sent = true
	_phase = "rb_pictures"
	world.hero.drive = Vector2.ZERO
	await get_tree().create_timer(2.0).timeout
	await _shot("m5c-zone2", 0.2)
	Net.send({"t": "run", "a": "leave"})
	await get_tree().create_timer(2.0).timeout
	await _shot("m5c-end", 0.2)
	# the tree: walk to the tile in front of the shoot and use it (the route walker does the rest; _rb_tick sees the window)
	var shoot: Dictionary = {}
	for o in world.model.farm.get("objects", {}).values():
		if o is Dictionary and str(o.get("kind", "")) == "yggdrasil":
			shoot = o
	if shoot.is_empty():
		_success()
		return
	_goal_override = Vector2i(int(shoot.get("x", 0)), int(shoot.get("y", 0)) + 1)
	_after_run = false
	_phase = "route_plan"


func _shot(shot_name: String, after: float) -> void:
	if shots_dir == "" or DisplayServer.get_name() == "headless":
		return
	if after > 0.0:
		await get_tree().create_timer(after).timeout
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img != null:
		DirAccess.make_dir_recursive_absolute(shots_dir)
		img.save_png("%s/%s.png" % [shots_dir, shot_name])
		_log("picture %s" % shot_name)
