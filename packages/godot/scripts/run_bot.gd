class_name RunBot
extends Bot
## `--runbot` (M5c): a headless player that plays a run through the client, on top of the combat bot (bot.gd: its path finding, its
## fighter and its telegraph dodging). Against a local server (ACCESS=open, DEV_TELEPORT=1) it logs in, picks the Krigare, takes the
## starter weapon (the development message), walks across the farm to the färdport and uses it - the arch window opens - and then:
##   --role=lead    waits for the other bot to stand at the arch (45 s at most), presses "Starta färden"
##   --role=follow  presses "Följ med" when it sees the run (it is taken along if it stands within 6 tiles when the lead starts)
## In a stop it fights every pack (bot.gd), votes on the first card of the pick, and chooses the way on by walking onto a väg-runa
## (GAME2.md section 2): `--lane=rest` (the default) takes a Vilosten whenever one is offered, the quick way through a wing,
## `--lane=safe` one only when the party is hurt, `--lane=random` any. The Mellanboss and the boss it walks up to and fights. The
## report says which rows and kinds of stop it entered, the runes it took, the picks it voted on, the runor taken, what the HUD's
## rail and the map showed. Without `--full` it is done when it has entered row 5, the Mellanboss's (the first wing walked: what the
## CI can afford; `--rows=N` another row); with `--full` it plays on to the boss and home.
## `--shots=dir` (needs a window): pictures of the arch window, a zone, the cards, the end summary and the tree window.
##
##   godot --headless --path packages/godot -- --runbot --route=run --server=http://localhost:8080 --name=Bot-Ask --role=lead \
##         --report=/tmp/run.json [--seconds=420] [--full] [--max-wipes=2] [--shots=/tmp/dir]
## `--max-wipes=N`: how many wipes the bot retries from the arch (default 2, the CI's tolerance; 0 makes a wipe fail the run).

var role := "lead"
var level := -1 ## --level=0|1: the difficulty the lead picks at the arch window (-1: leave the window's own choice, Vanlig)
var full := false
var shots_dir := ""
var lane := "rest" ## --lane=rest|safe|random: how the way on is chosen
var stop_row := 5 ## --rows=N: the row whose stop ends the bot's run (not --full)
var _rows: Array = [] ## the rows of the stops entered
var _kinds: Array = [] ## and their kinds
var _exited: Dictionary = {} ## node -> true once the run reached the route vote (the server let me through)
var _pressed: Dictionary = {} ## node -> true once I pressed a card
var _confirmed: Dictionary = {} ## node -> true once the server's offer showed my vote
var _runes_taken := 0
var _map_checked := false
var _beat := 5.0
var _rest_t := 0.0
var _wipes := 0
const DEFAULT_MAX_WIPES := 2
var max_wipes := DEFAULT_MAX_WIPES
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
		elif arg.begins_with("--max-wipes="):
			var v := arg.substr(12)
			if not v.is_valid_int() or int(v) < 0:
				push_error("--max-wipes needs a whole number, 0 or more (got '%s')" % v)
				get_tree().quit(2)
				return
			max_wipes = int(v)
		elif arg.begins_with("--level="):
			var lv := arg.substr(8)
			if lv != "0" and lv != "1":
				push_error("--level needs 0 (Lätt) or 1 (Vanlig) (got '%s')" % lv)
				get_tree().quit(2)
				return
			level = int(lv)
		elif arg.begins_with("--lane="):
			lane = arg.substr(7)
			if not ["rest", "safe", "random"].has(lane):
				push_error("--lane needs rest, safe or random (got '%s')" % lane)
				get_tree().quit(2)
				return
		elif arg.begins_with("--rows="):
			var rv := arg.substr(7)
			if not rv.is_valid_int() or int(rv) < 2 or int(rv) > 10:
				push_error("--rows needs a whole number from 2 to 10 (got '%s')" % rv)
				get_tree().quit(2)
				return
			stop_row = int(rv)
		elif arg == "--full":
			full = true
		elif arg.begins_with("--shots="):
			shots_dir = arg.substr(8)
	super._ready()
	_report["run"] = {"role": role, "rows": [], "kinds": [], "exits": 0, "presses": 0, "picks": 0, "runor": [], "started": false, "joined": false, "ended": null, "boss_down": false, "seeds": 0}
	world.model.run_ended.connect(_on_run_ended)
	world.model.toast.connect(func(text: String) -> void:
		if text.contains("har fallit"):
			_forgive_until = Time.get_ticks_msec() + 10000.0)


var _forgive_until := 0.0 ## local ms until which a monster's health may rise: a fall sends the monsters home, and they mend on the way

## A monster sent home by the server (the party fell, or one was dragged past its leash while the other lay down) is at full health
## again: that is the server's word (a rise to 85 % or more, or any rise for 10 s after a fall). Any other rise is still a client error.
func _rose(where: String, id: Variant, from: float, to: float) -> void:
	# (a route has more and wider fights, so more packs are dragged past their leash: the monster is at full health at home, and the
	# first hit it takes when it is pulled again shows as 85-99 %)
	if to >= 0.85 or Time.get_ticks_msec() < _forgive_until:
		_log("monster %s is home again (%s)" % [str(id), where])
		return
	super._rose(where, id, from, to)


## Is everyone in the party (a fallen one counts as not) at 85 % health or more?
func _party_rested() -> bool:
	var f: Dictionary = world.model.saga.get(world.model.my_area_key(), {}).get("f", {})
	for id in f.keys():
		var hp: Variant = f[id]
		if not (hp is Array and hp.size() >= 2) or float(hp[0]) < 0.85 * float(hp[1]):
			return false
	return not f.is_empty()


## How many monsters of this map stand within 6 tiles of me (the snapshot's positions; the map's own record before the first snapshot).
func _enemy_near() -> int:
	var n := 0
	var me := Vector2(world.hero.px, world.hero.py)
	var animals: Dictionary = world.model.areas.get(world.model.my_area_key(), {}).get("animals", {})
	for id in animals.keys():
		var at: Variant = world.combat.pos_of(int(id))
		if at != null and (at as Vector2).distance_to(me) < 6.0 * Data.tile():
			n += 1
	return n


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
		_log("tick %.0f s: phase %s, area %s, tile %s, hp %s, pack %s alive %d, target %s, %d fps, driven %s frozen %s speed %.1f, packs beaten %d, rows %s" % [
			_t, _phase, m.my_area_key(), str(_my_tile()), str(f), str(_pack_ids), alive, str(world.combat.live_target()), Engine.get_frames_per_second(),
			str(world.hero.driven), str(world.hero.frozen), world.hero.speed_mul, _packs_done, str(_rows)])
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
	if win.is_open() and _leave_sent and m.my_area_key() == "farm":
		win.close() # (it is still open when the run ends: a window freezes the hero, and the walk to the tree needs it free)
	elif win.is_open():
		_window_t += delta
		if _window_t > 0.8 and not _arch_shot:
			_arch_shot = true
			_shot("m5c-arch", 0.0)
		if role == "lead":
			var ready := _partner_near() or _window_t > 45.0
			if ready and level >= 0 and RunWindow.level != level and _window_t > 1.0 and win.latt_button != null:
				_log("picks the level: %s" % ("Lätt" if level == 0 else "Vanlig"))
				(win.latt_button if level == 0 else win.vanlig_button).pressed.emit()
			elif ready and not _started and _window_t > 1.2 and win.start_button != null and not win.start_button.disabled and (level < 0 or RunWindow.level == level):
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
		var node := int(m.offer.get("node", 0))
		var mine: Variant = m.offer.get("votes", {}).get(m.me)
		if mine != null and int(mine) == 0 and not _confirmed.has(node):
			_confirmed[node] = true
			_report["run"]["picks"] = int(_report["run"]["picks"]) + 1
			_log("the server shows my vote on card 0 at stop %d" % node)
		if _vote_t > 0.9 and not _cards_shot and not _confirmed.has(node):
			_cards_shot = true
			_shot("m5c-cards", 0.0)
		if _vote_t > 1.6 and not _confirmed.has(node) and fmod(_vote_t, 2.0) < delta and not world.run_pick.buttons.is_empty():
			_log("pressing card 0 at stop %d" % node)
			_pressed[node] = true
			(world.run_pick.buttons[0] as Button).pressed.emit()
	else:
		_vote_t = 0.0
		# the last voter's press settles the pick at once, so the offer never shows that vote: it counts when the run went on to the
		# way on (or the next stop) after I pressed (a lone vote would not have settled it before the time ran out)
		for node in _pressed.keys():
			if not _confirmed.has(node) and m.run is Dictionary and (str(m.run.get("phase", "")) == "route" or int(m.run.get("node", 0)) != int(node)):
				_confirmed[node] = true
				_report["run"]["picks"] = int(_report["run"]["picks"]) + 1
				_log("the pick at stop %d went through after my press" % int(node))
	if m.run is Dictionary and str(m.run.get("phase", "")) == "route" and not _exited.has(int(m.run.get("node", 0))):
		_exited[int(m.run.get("node", 0))] = true
		_report["run"]["exits"] = int(_report["run"]["exits"]) + 1
	if m.run is Dictionary:
		_report["run"]["runor"] = m.run.get("runor", [])
		_report["run"]["seeds"] = int(m.run.get("earned", {}).get(m.me, 0))
		_report["run"]["level"] = int(m.run.get("level", 1))
		_report["run"]["spirit"] = int(m.run.get("spirit", 0))
		if world.run_hud != null and world.run_hud.visible:
			_report["run"]["hud_spirit"] = world.run_hud.spirit_text()
			_report["run"]["hud_rail"] = world.run_hud.rail_text()
		# the map of the route, opened once the way is known (the key does the same): the bot reports how many stops it drew
		if not _map_checked and world.route_view != null and m.in_run() and (m.run.get("route", []) as Array).size() > 0 and _t - _started_at > 3.0:
			_map_checked = true
			_check_map()
		if str(m.run.get("phase", "")) == "victory" and not _leave_sent:
			_report["run"]["boss_down"] = true
			_leave_sent = true
			_log("the boss is down")
			Net.send({"t": "run", "a": "leave"})
	if _phase == "rb_rest":
		world.hero.drive = Vector2.ZERO
		_rest_t += delta
		if _enemy_near() > 0:
			_phase = "plan" # (another pack joined the fight: resting under its claws is how a pair wipes)
		elif _rest_t > 25.0 or (_rest_t > 1.0 and _party_rested()):
			_phase = "plan"
	# waiting for the runes to come out (the cards are voted first), then walking onto one
	if _phase == "rb_runes":
		_rest_t += delta
		_choose_rune()
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
	var node := Data.stop_node(key)
	var info := _stop_info(node)
	if info.is_empty():
		return # (the run's snapshot has not come yet: asked again next frame)
	var row := int(info.get("row", 1))
	if not _rows.has(row):
		_rows.append(row)
		_kinds.append(str(info.get("kind", "")))
		_report["run"]["rows"] = _rows.duplicate()
		_report["run"]["kinds"] = _kinds.duplicate()
		_log("in stop %d, row %d (%s) %s" % [node, row, str(info.get("kind", "")), key])
		if shots_dir != "" and row == 1:
			_shot("m5c-zone", 7.0)
		if row > 1:
			_runes_taken += 1
			_report["run"]["runes"] = _runes_taken
	_report["area"] = key
	_to_exit = false
	if row >= stop_row and not full:
		if shots_dir != "":
			_pictures_after()
		else:
			_success()
		return
	_phase = "plan"
	_pack_ids = []
	world.hero.driven = true
	world.hero.drive = Vector2.ZERO


## Opens the route map for a moment and reports what it drew.
func _check_map() -> void:
	world.route_view.set_map_open(true)
	await get_tree().process_frame
	await get_tree().process_frame
	_report["run"]["map"] = world.route_view.map_summary()
	_shot("route-map", 0.1)
	await get_tree().process_frame
	world.route_view.set_map_open(false)


## The route's record of stop `node` ({id, row, lane, lanes, kind, next}), or {} before the run's snapshot has come.
func _stop_info(node: int) -> Dictionary:
	if not (world.model.run is Dictionary):
		return {}
	for n in world.model.run.get("route", []):
		if n is Dictionary and int(n.get("id", -1)) == node:
			return n
	return {}


## All packs here are down: the Mellanboss or the boss to fight if this stop has one, else the väg-runor (when they are out).
func _no_pack_left() -> void:
	var m := world.model
	var key := m.my_area_key()
	var w: Dictionary = m.areas.get(key, {})
	var inst: Dictionary = w.get("saga", {})
	var kind := str(_stop_info(Data.stop_node(key)).get("kind", ""))
	if kind == "boss" or kind == "mini":
		var big_id := int(inst.get("boss" if kind == "boss" else "mini", -1))
		var big: Variant = w.get("animals", {}).get(str(big_id))
		if big is Dictionary:
			_pack_ids = [big_id]
			_path = _path_to(_my_tile(), _tile_of(float(big.get("x", 0)), float(big.get("y", 0))), _distance_field(_my_tile()))
			_phase = "walk"
			world.hero.driven = true
			_log("to the %s" % ("boss" if kind == "boss" else "Mellanboss"))
			return
		if kind == "boss":
			# the boss is down: the run says victory and the bot leaves (see _rb_tick)
			_phase = "rb_wait"
			return
	_rest_t = 0.0
	_phase = "rb_runes"
	world.hero.driven = true
	world.hero.drive = Vector2.ZERO


## The runes are out when the pick is over: choose one by the lane, walk onto it.
func _choose_rune() -> void:
	var m := world.model
	if not (m.run is Dictionary) or str(m.run.get("phase", "")) != "route":
		return
	var key := m.my_area_key()
	var w: Dictionary = m.areas.get(key, {})
	var runes: Array = []
	for o in w.get("objects", {}).values():
		if o is Dictionary and str(o.get("kind", "")) == "run_exit":
			runes.append(o)
	if runes.is_empty():
		return
	var kind := str(_stop_info(Data.stop_node(key)).get("kind", ""))
	# (a Vilosten is for resting: stay at the stone until the party is well, then go)
	if kind == "rest" and not _party_rested() and _rest_t < 30.0:
		return
	var pick: Dictionary = runes[0]
	var rest_at := -1
	var fight_at := -1
	for i in range(runes.size()):
		if int(runes[i].get("variant", 0)) == 1 and rest_at < 0:
			rest_at = i
		elif int(runes[i].get("variant", 0)) != 1 and fight_at < 0:
			fight_at = i
	match lane:
		"rest":
			pick = runes[rest_at if rest_at >= 0 else 0]
		"safe":
			pick = runes[rest_at if (rest_at >= 0 and not _party_rested()) or fight_at < 0 else fight_at]
		_:
			pick = runes[randi() % runes.size()]
	_exit_tile = Vector2i(int(pick.get("x", 0)), int(pick.get("y", 0)))
	_path = _path_to(_my_tile(), _exit_tile, _distance_field(_my_tile()))
	_replans = 0
	_phase = "rb_exit"
	_to_exit = true
	_exit_t = 0.0
	_log("to a väg-runa (%s) at %s: %d steps" % ["Vilosten" if int(pick.get("variant", 0)) == 1 else "stop", str(_exit_tile), _path.size()])


func _walk_to_exit(delta: float) -> void:
	var tile := Data.tile()
	var me := Vector2(world.hero.px, world.hero.py)
	if not _path.is_empty():
		var next: Vector2i = _path[0]
		var target := Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
		if me.distance_to(target) < _reach(delta):
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
	# standing on the väg-runa: use it every second and a half until the vote is done (a press counts at once; staying counts after a moment)
	_exit_t -= delta
	if _exit_t <= 0.0:
		_exit_t = 1.5
		_report["run"]["presses"] = int(_report["run"]["presses"]) + 1
		world._act()


func _on_run_ended(summary: Dictionary) -> void:
	_ended = summary
	_report["run"]["ended"] = summary
	_log("run ended: %s" % str(summary))
	if str(summary.get("outcome", "")) == "wipe" and _wipes < max_wipes and not _leave_sent:
		# the pair fell: a game outcome, not a client defect (and at 2-3 fps in a window nobody can step out of a telegraph). Back to the arch.
		_wipes += 1
		_report["run"]["wipes"] = _wipes
		_log("the pair fell (%d of %d tries): back to the arch" % [_wipes, max_wipes])
		_started = false
		_window_t = 0.0
		_to_exit = false
		_pack_ids = []
		_path = []
		_after_run = false
		world.hero.drive = Vector2.ZERO
		_phase = "route_plan"
		return
	_after_run = true
	if shots_dir != "" and str(summary.get("outcome", "")) != "wipe":
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
	# health comes back by itself out of a fight (3 % a second after a calm); pulling the next pack on a sliver of it is how a pair wipes
	_rest_t = 0.0
	_phase = "rb_rest" if _enemy_near() == 0 else "plan"


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
