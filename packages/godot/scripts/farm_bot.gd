class_name FarmBot
extends Node
## `--farmbot`: a headless player that farms against a local server (ACCESS=open, DEV_TELEPORT=1), through the same
## code a person's keys go through (farm_play.gd, the hero's walking, the bag window's squares). It logs in, then:
##   till a patch of grass with the hoe, plant a carrot, water it, roll the day over (the dev `nextDay`, watering each
##   morning) until it is ripe, harvest it, drop a carrot and walk over it to pick it up, chop trees and mine rocks for
##   wood and stone, hand the stone to Elsa and the wood to Fiskar-Sven (coins, stars and a fishing rod), fill the
##   watering can at the pond, fish until something bites and is caught, open a chest and the bag (a swap and a sort),
##   and walk north to pet a wild animal.
## The report (`--report=file.json`) says what each step saw and ends with my bag, coins and stars as this client
## shows them; tools/bot-check.mts compares them with the server's own record of the player.
##
##   godot --headless --path packages/godot -- --farmbot --server=http://localhost:8080 --name=Bot-Bonde \
##         --report=/tmp/farm.json [--seconds=150] [--shots=/tmp/dir]   (--shots needs a window: run it under Xvfb)

var world: WorldView
var server_url := "http://localhost:8080"
var bot_name := "Bot-Bonde"
var report_path := ""
var seconds := 150.0
var shots_dir := ""
var only := "" ## --only=pet,bag: just these steps (for working on one of them)
var _api: Api
var _t := 0.0
var _done := false
var _report := {"name": "", "ok": false, "seconds": 0.0, "steps": [], "errors": [], "toasts": [], "inventory": {}, "coins": 0, "stars": 0, "hud_coins": "", "hud_stars": "", "day": 0, "route": [], "hearts_seen": 0}
var _plot := Vector2i.ZERO
var _wheat_plots: Array = [] ## {tile, stand} of the wheat planted beside the carrot (for the bread)
var _via_door := false ## walking may use the farmhouse door (it teleports): otherwise the door tile is not a floor
var _home: FarmBotHome


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
		elif arg.begins_with("--shots="):
			shots_dir = arg.substr(8)
		elif arg.begins_with("--only="):
			only = arg.substr(7)
	_report["name"] = bot_name
	_api = Api.new()
	add_child(_api)
	Settings.server_url = Settings.normalize_url(server_url)
	Settings.token = ""
	Settings.pending_code = ""
	world.reset()
	world.hud.set_connection("bot")
	world.model.toast.connect(func(text: String) -> void:
		_report["toasts"].append(text)
		_log("toast: " + text))
	world.model.error.connect(func(text: String) -> void: _error("server: " + text))
	world.model.area_changed.connect(func(key: String) -> void:
		if _report["route"].is_empty() or _report["route"][-1] != key:
			_report["route"].append(key))
	world.model.change.connect(func(c: Dictionary) -> void:
		if str(c.get("t", "")) == "fx" and str(c.get("kind", "")) == "heart":
			_report["hearts_seen"] += 1)
	Net.connection_changed.connect(func(status: String, code: int) -> void: _log("socket %s (%d)" % [status, code]))
	_run()


func _process(delta: float) -> void:
	_t += delta
	_report["seconds"] = _t
	if not _done and _t > seconds:
		_error("time is up")
		_finish()


func _log(text: String) -> void:
	print("bot %s: %s" % [bot_name, text])


func _error(text: String) -> void:
	_report["errors"].append(text)
	_log("ERROR " + text)


## One step's result: what it was, whether it held, and what it saw.
func _step(step_name: String, ok: bool, detail := "") -> bool:
	_report["steps"].append({"name": step_name, "ok": ok, "detail": detail, "at": snappedf(_t, 0.1)})
	_log("step %s: %s %s" % [step_name, "ok" if ok else "FAILED", detail])
	if not ok:
		_error("step %s failed: %s" % [step_name, detail])
	return ok


func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout


## Waits until `cond` is true (checked every frame) or `timeout` seconds pass; true when it held.
func _until(cond: Callable, timeout := 6.0) -> bool:
	var until := Time.get_ticks_msec() + int(timeout * 1000.0)
	while Time.get_ticks_msec() < until:
		if cond.call():
			return true
		await get_tree().process_frame
	return bool(cond.call())


func _run() -> void:
	if not await _login():
		return
	if not await _until(func() -> bool: return world._mode == "outdoor" and Net.is_open(), 20.0):
		_error("never got the farm")
		_finish()
		return
	await _wait(0.5)
	_log("on the farm at %s as %s" % [str(_my_tile()), world.model.me])
	_home = FarmBotHome.new(self)
	var stages := {
		"shop": _home.shop_buy, "patch": _farm_patch, "keys": _keys_and_pets, "drop": _drop_and_pick_up, "sell": _home.sell_crop, "gather": _gather, "quests": _quests, "pond": _pond_and_fishing, "bag": _bag_and_chest,
		"build": _home.build, "house": _home.house_and_cook, "paint": _home.paint, "wardrobe": _home.wardrobe, "talk": _home.talk, "pet": _pet_wild,
		"village": _home.class_and_chapter, "pizza": _home.pizza, "hero": _home.hero_switch, "smed": _home.smedjan, "ui175": _home.ui_175, "bus": _home.bus,
	}
	for key in stages.keys():
		if _done:
			return
		if only == "" or only.split(",").has(key):
			await stages[key].call()
	_sound_totals()
	_final_state()
	_finish()


func _login() -> bool:
	var gate: Dictionary = await _api.request_json_retrying(HTTPClient.METHOD_GET, "/api/gate")
	if not bool(gate.get("ok", false)) or str(gate.get("body", {}).get("gate", "")) != "ok":
		_error("gate: %s" % str(gate))
		_finish()
		return false
	var list: Dictionary = await _api.request_json_retrying(HTTPClient.METHOD_GET, "/api/players")
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
			return false
		id = str(made["body"].get("id", ""))
	_log("playing as %s (%s)" % [bot_name, id])
	world.reset()
	Net.connect_as(id)
	return true


# ---------------------------------------------------------------------------
# The steps


## Till, plant, water, wait for it to grow, harvest.
func _farm_patch() -> void:
	var spot := _find_patch()
	if spot.is_empty():
		_step("find a patch", false, "no free grass near the start")
		return
	_plot = spot["tile"]
	var stand: Vector2i = spot["stand"]
	var model := world.model
	if not await _goto(stand):
		_step("walk to the patch", false, str(stand))
		return
	_face("down")
	var carrots_before := model.count_item("carrot")
	var seeds_before := model.count_item("carrot_seed")
	await _use_item_slot("hoe")
	await _act()
	var tilled := await _until(func() -> bool: return _terrain_at(_plot) == "soil", 4.0)
	_step("till", tilled, "tile %s is %s" % [str(_plot), _terrain_at(_plot)])
	await _use_item_slot("carrot_seed")
	await _act()
	var planted := await _until(func() -> bool: return _crop_at(_plot) is Dictionary, 4.0)
	_step("plant", planted and model.count_item("carrot_seed") == seeds_before - 1, "a carrot seed went into the ground (%d seeds left)" % model.count_item("carrot_seed"))
	var can_before := _can_charges()
	await _use_item_slot("can")
	await _act("watering")
	var watered := await _until(func() -> bool: return _crop_at(_plot) is Dictionary and bool(_crop_at(_plot).get("watered", false)), 4.0)
	_step("water", watered and _can_charges() == can_before - 1, "can %d -> %d charges" % [can_before, _can_charges()])
	await _plant_wheat()
	# the days: every morning the crop grows one step if it was watered, then the soil is dry again
	var stages: int = int(Data.crops.get("carrot", {}).get("stages", 3))
	var day0 := model.day
	var grew := true
	for i in range(stages):
		var before := int(_crop_at(_plot).get("stage", 0)) if _crop_at(_plot) is Dictionary else -1
		Net.send({"t": "dev", "a": "nextDay"})
		var rolled := await _until(func() -> bool: return model.day > day0 + i, 5.0)
		await _wait(0.3)
		var crop: Variant = _crop_at(_plot)
		var after := int(crop.get("stage", 0)) if crop is Dictionary else -1
		if not rolled or after != before + 1:
			grew = false
			_error("day %d: stage %d -> %d (rolled %s)" % [i + 1, before, after, str(rolled)])
		if i < stages - 1:
			await _water_wheat()
			await _goto(stand)
			_face("down")
			await _use_item_slot("can")
			await _act() # water it again for tomorrow
			await _until(func() -> bool: return _crop_at(_plot) is Dictionary and bool(_crop_at(_plot).get("watered", false)), 3.0)
	_step("grow", grew and model.day == day0 + stages, "day %d -> %d, the crop is at stage %s of %d" % [day0, model.day, str(_crop_at(_plot).get("stage", "?")) if _crop_at(_plot) is Dictionary else "-", stages])
	await _act() # harvest: any held thing does it
	var harvested := await _until(func() -> bool: return _crop_at(_plot) == null, 4.0)
	await _wait(0.4)
	_step("harvest", harvested and model.count_item("carrot") > carrots_before and model.count_item("carrot_seed") >= seeds_before, "carrots %d -> %d, seeds %d -> %d" % [carrots_before, model.count_item("carrot"), seeds_before, model.count_item("carrot_seed")])
	await _harvest_wheat()


## Three wheat plants beside the carrot (the seeds came from the shop): bread for the stove later.
func _plant_wheat() -> void:
	_wheat_plots = []
	if world.model.count_item("wheat_seed") < 3:
		return
	for i in range(3):
		var spot := _find_patch()
		if spot.is_empty() or not await _goto(spot["stand"]):
			break
		_face("down")
		var tile: Vector2i = spot["tile"]
		await _use_item_slot("hoe")
		await _act()
		await _until(func() -> bool: return _terrain_at(tile) == "soil", 3.0)
		await _use_item_slot("wheat_seed")
		await _act()
		await _until(func() -> bool: return _crop_at(tile) is Dictionary, 3.0)
		await _use_item_slot("can")
		await _act()
		await _until(func() -> bool: return _crop_at(tile) is Dictionary and bool(_crop_at(tile).get("watered", false)), 3.0)
		_wheat_plots.append(spot)
	_step("plant wheat", _wheat_plots.size() == 3, "%d wheat plants beside the carrot" % _wheat_plots.size())


func _water_wheat() -> void:
	for spot in _wheat_plots:
		if not await _goto(spot["stand"]):
			continue
		_face("down")
		await _use_item_slot("can")
		await _act()
		await _until(func() -> bool: return _crop_at(spot["tile"]) is Dictionary and bool(_crop_at(spot["tile"]).get("watered", false)), 3.0)


func _harvest_wheat() -> void:
	if _wheat_plots.is_empty():
		return
	for spot in _wheat_plots:
		if await _goto(spot["stand"]):
			_face("down")
			await _act()
			await _until(func() -> bool: return _crop_at(spot["tile"]) == null, 3.0)
	await _wait(0.4)
	_step("harvest wheat", world.model.count_item("wheat") >= 3, "wheat %d (bread needs 3)" % world.model.count_item("wheat"))


## The keys themselves, sent as input events through the engine (the Input Map, then the view, then farm_play.gd):
## the digit keys and the shoulder buttons pick hotbar squares, X and V talk to the pets (there are none on a new farm,
## and the server says so).
func _keys_and_pets() -> void:
	var model := world.model
	var inv: Array = model.my_player().get("inventory", [])
	_press_key(KEY_3)
	var third := await _until(func() -> bool: return str(model.held().get("item", "")) == str(inv[2].get("item", "")), 2.0)
	_press_action("slot_next")
	var next := await _until(func() -> bool: return str(model.held().get("item", "")) == str(inv[3].get("item", "")), 2.0)
	_press_action("slot_prev")
	var back := await _until(func() -> bool: return str(model.held().get("item", "")) == str(inv[2].get("item", "")), 2.0)
	_step("hotbar keys", third and next and back, "3 holds %s, the next square %s, the one before %s again" % [str(inv[2].get("item", "")), str(inv[3].get("item", "")), str(inv[2].get("item", ""))])
	var told := 0
	for cmd in [["pets_stay", "noPetsHere"], ["pets_come", "noPets"]]:
		var before: int = _report["toasts"].size()
		_press_action(cmd[0])
		if await _until(func() -> bool: return _report["toasts"].slice(before).has(Strings.t(cmd[1])), 3.0):
			told += 1
	_step("pets commands", told == 2, "stay (X) and whistle (V) reached the server, which has no pets to tell: %d of 2 answered" % told)


func _press_key(code: Key) -> void:
	var ev := InputEventKey.new()
	ev.physical_keycode = code
	ev.keycode = code
	ev.pressed = true
	Input.parse_input_event(ev)
	var up := InputEventKey.new()
	up.physical_keycode = code
	up.keycode = code
	up.pressed = false
	Input.parse_input_event(up)


func _press_action(action: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	Input.parse_input_event(ev)
	var up := InputEventAction.new()
	up.action = action
	up.pressed = false
	Input.parse_input_event(up)


## Put a carrot on the ground, see it drawn, walk over it.
func _drop_and_pick_up() -> void:
	var model := world.model
	var carrots := model.count_item("carrot")
	var slot := _slot_of("carrot")
	if slot < 0:
		_step("drop", false, "no carrot to drop")
		return
	_face("down")
	var drops_before := _drop_count()
	Net.send({"t": "drop", "slot": slot, "qty": 1})
	var dropped := await _until(func() -> bool: return _drop_count() == drops_before + 1 and world.play.drops.count() == drops_before + 1, 4.0)
	_step("drop", dropped and model.count_item("carrot") == carrots - 1, "one carrot on the ground, drawn: %d sprites" % world.play.drops.count())
	await _wait(3.5) # the dropper may not pick it up at once (60 ticks)
	# walk to where it lies (not to the plot: the bot may be standing elsewhere when it drops it)
	var lies := _plot
	for d in world.hero.world.get("drops", {}).values():
		if d is Dictionary and str(d.get("item", "")) == "carrot":
			lies = Vector2i(floori(float(d.get("x", 0)) / Data.tile()), floori(float(d.get("y", 0)) / Data.tile()))
	await _goto(lies)
	var back := await _until(func() -> bool: return model.count_item("carrot") == carrots and _drop_count() == drops_before, 4.0)
	_step("pick up", back, "walked over it: carrots %d, drops left %d, sprites %d" % [model.count_item("carrot"), _drop_count(), world.play.drops.count()])


## Wood from trees and stone from rocks.
func _gather() -> void:
	var model := world.model
	var trees := 0
	while model.count_item("wood") < 8 and trees < 8 and not _done:
		var t := _nearest_object(["tree", "tree_pine", "tree_apple", "bush"])
		if t.is_empty():
			break
		trees += 1
		if not await _break(t, "axe"):
			_step("chop", false, "could not reach %s" % str(t))
			return
	_step("chop", model.count_item("wood") >= 7, "%d trees, wood %d" % [trees, model.count_item("wood")])
	var rocks := 0
	while model.count_item("stone") < 5 and rocks < 6 and not _done:
		var r := _nearest_object(["rock", "rock_small"])
		if r.is_empty():
			break
		rocks += 1
		if not await _break(r, "pick"):
			break
	_step("mine", model.count_item("stone") >= 5, "%d rocks, stone %d" % [rocks, model.count_item("stone")])


## Elsa pays 20 kr and 2 stars for five stones; Fiskar-Sven a rod and a star for five wood. Both are handed over through
## the villager's window (M4c): walk to them, press the use key, press "Lämna" on the wish.
func _quests() -> void:
	var model := world.model
	if model.count_item("stone") >= 5:
		await _home.hand_over("elsa", "elsa_flowerbox", "stone")
	else:
		_step("Elsas önskning", false, "no stone")
	if model.count_item("wood") >= 5:
		await _home.hand_over("sven", "sven_rod", "wood")
	else:
		_step("Svens önskning", false, "no wood")


## Fill the can at the pond, then fish.
func _pond_and_fishing() -> void:
	var model := world.model
	var spot := _find_water()
	if spot.is_empty():
		_step("pond", false, "no water in reach")
		return
	if not await _goto(spot["stand"]):
		_step("pond", false, "could not walk to the water")
		return
	_face(spot["dir"])
	await _use_item_slot("can")
	var before := _can_charges()
	await _act()
	var filled := await _until(func() -> bool: return _can_charges() == int(Data.constant("WATERING_CAN_CHARGES", 20.0)), 4.0)
	_step("fill the can", filled, "charges %d -> %d" % [before, _can_charges()])
	if model.count_item("rod") == 0:
		_step("fishing", false, "no rod")
		return
	await _use_item_slot("rod")
	var fish_start := _fish_count()
	var bites := 0
	for attempt in range(8):
		if _fish_count() > fish_start:
			break
		await _act()
		if not await _until(func() -> bool: return world.play.fishing.visible, 3.0):
			continue
		if await _until(func() -> bool: return world.play.fishing.biting, 9.0):
			bites += 1
			var fish_before := _fish_count()
			world.play.act() # at once: the bite lasts 1.3 s, and a slow machine has few frames in it
			await _shot("fishing-bite", 0.15)
			# the answer is a catch or "the fish swam away"; a slow runner may take a moment to say either
			await _until(func() -> bool: return _fish_count() > fish_before or _report["toasts"].back() == Strings.t("fishingLost"), 3.0)
			await _wait(0.3)
		else:
			await _act()
			await _wait(0.4)
	# honest, not strict: a bite can be missed on a slow machine (that is timing, not a bug). What must hold is that
	# a fish bit, a fish was caught, and no fish came without a bite.
	var fish := _fish_count() - fish_start
	var missed := maxi(0, bites - fish)
	_step("fishing", bites >= 1 and fish >= 1 and fish <= bites, "%d bites, %d fish caught (note: %d bites missed)" % [bites, fish, missed])


## The chest by the house, the bag, a move between squares and the sort.
func _bag_and_chest() -> void:
	var model := world.model
	var chest := _nearest_object(["start_chest", "chest"])
	if chest.is_empty():
		_step("chest", false, "no chest")
		return
	var spot := _stand_next_to(chest)
	if spot.is_empty() or not await _goto(spot["stand"]):
		_step("chest", false, "could not walk to the chest")
		return
	_face(spot["dir"])
	await _use_item_slot("hoe")
	await _act()
	var opened := await _until(func() -> bool: return world.play.bag.is_open(), 4.0)
	await _wait(0.2)
	await _shot("bag-open", 0.1)
	_step("open the chest", opened, "the bag window is %s, chest %d" % ["open" if opened else "shut", world.play.bag._chest_id])
	if opened:
		world.play.bag._on_sort()
		world.play.bag._on_stack()
		await _wait(0.4)
		world.play.bag.close()
	# a move between squares through the window's own press handler: the hoe from slot 0 to an empty backpack square
	world.play.open_bag()
	var window := await _until(func() -> bool: return world.play.bag.is_open(), 2.0)
	var from_slot: ItemSlot = world.play.bag._bag_slots[_slot_of("hoe")]
	var empty_slot := _empty_slot()
	if window and empty_slot >= 0:
		world.play.bag._tap(from_slot)
		world.play.bag._tap(world.play.bag._bag_slots[empty_slot])
		var moved := await _until(func() -> bool: return str((model.my_player().get("inventory", []) as Array)[empty_slot].get("item", "") if (model.my_player().get("inventory", []) as Array)[empty_slot] is Dictionary else "") == "hoe", 4.0)
		_step("move a stack", moved, "the hoe went to square %d" % empty_slot)
		world.play.bag._on_sort()
		await _wait(0.5)
	else:
		_step("move a stack", false, "no window or no free square")
	world.play.bag.close()
	# the hoe must be back on the hotbar for whatever comes next: hold anything (the rod)
	await _use_item_slot("rod")


## Walk to the forest in the north and pet a wild animal (the heart and the server's answer). Foxes and hedgehogs
## are tame enough; wolves, bears and the roaming monsters bite, so the bot keeps away from them and goes home to try
## again if it faints.
var _startles: Dictionary = {} ## the wild animals watched: id -> {home (px), away (most tiles from home), back (tiles from home when next to me)}


func _pet_wild() -> void:
	var model := world.model
	var petted := false
	var brushed := false
	for trip in range(3):
		if petted or _done:
			break
		if model.my_area_key() != "a:0,-1" and not await _leave_by("n", "a:0,-1"):
			continue
		var until := Time.get_ticks_msec() + 40000
		while Time.get_ticks_msec() < until and not petted and not _done and model.my_area_key() == "a:0,-1":
			var hearts := int(_report["hearts_seen"])
			var danger := _hostile_near(Vector2(world.hero.px, world.hero.py), 6.0)
			if danger != Vector2.INF:
				var away := Vector2(world.hero.px, world.hero.py) - danger
				world.hero.driven = true
				world.hero.drive = away.normalized()
				await _wait(1.0)
				world.hero.drive = Vector2.ZERO
				continue
			var a := _nearest_wild()
			if a.is_empty():
				await _wait(1.0)
				continue
			var spot := _stand_next_to_animal(a)
			if spot.is_empty():
				await _wait(0.5)
				continue
			var wild_id := str(int(a.get("id", 0)))
			if not _startles.has(wild_id): # (every animal watched gets its own record: the nearest one changes as they run)
				_startles[wild_id] = {"home": _animal_px(a), "away": 0.0, "peak": 0.0, "back": INF}
			var rec: Dictionary = _startles[wild_id]
			var far_at := Vector2(world.hero.px, world.hero.py).distance_to(_animal_px(a)) / Data.tile()
			# Walk right up to it: a hero who walks at a wild animal startles it when within 4 tiles (the server's tickStartle). The
			# forest is 95 tiles across and the animals can start anywhere in it, so this needs time (25 s, not the 4 s it once had:
			# a bot that gave up 10 tiles short stood still out of range for the whole wait below, and never startled anything).
			await _goto(spot["stand"], 25.0)
			var left := _animal_by_id(wild_id)
			rec["far"] = far_at # (kept in the step's detail below: a failing run then shows how far the animals were, and how close the walk got)
			rec["near"] = Vector2(world.hero.px, world.hero.py).distance_to(_animal_px(left)) / Data.tile() if not left.is_empty() else -1.0
			# M7b: standing still now (moving would startle it again), it runs off, catches its breath, walks back and creeps up to
			# me, and then it can be petted. That takes the bolt (1.8 s), about 3 s of calming down, the walk back at a wander pace
			# (2.5 tiles a second: up to 5 s for 12 tiles) and the creep: about 15 s of game time. The server's game clock runs slower than the
			# wall clock when a runner is starved (a bot on one CPU saw animals still 6 tiles off after 45 s), so wait up to 120 s and
			# stop as soon as it is next to me. Watch it all (`_startles`).
			await _until(func() -> bool:
				var b := _animal_by_id(wild_id)
				if b.is_empty():
					return true
				_watch_startle(rec, b)
				var tile := _animal_tile(b)
				var here := _my_tile()
				return absi(tile.y - here.y) + absi(tile.x - here.x) == 1, 120.0)
			a = _animal_by_id(wild_id)
			if a.is_empty():
				continue
			var tile := _animal_tile(a)
			var me := _my_tile()
			var next_to_it := absi(tile.x - me.x) + absi(tile.y - me.y) == 1
			if next_to_it and float(rec["away"]) < 3.0 and not rec.has("pushed"):
				# It never bolted: it stood next to where I came in, so I was within its reach but barely moving. Walking away from
				# it startles it from this close too (the server's rule is "a moving hero within 4 tiles"); then wait for it below.
				rec["pushed"] = true
				var from_it := Vector2(world.hero.px, world.hero.py) - _animal_px(a)
				world.hero.driven = true
				world.hero.drive = from_it.normalized() if from_it.length() > 0.5 else Vector2.RIGHT
				await _wait(1.0)
				world.hero.drive = Vector2.ZERO
				await _until(func() -> bool:
					var b := _animal_by_id(wild_id)
					if b.is_empty():
						return true
					_watch_startle(rec, b)
					return float(rec["away"]) >= 3.0, 4.0)
				continue
			if next_to_it:
				_face("right" if tile.x > me.x else ("left" if tile.x < me.x else ("down" if tile.y > me.y else "up")))
				# the brush first (the animal is "fin"), then a pat with the hoe in hand (the rod would not touch it)
				var toasts_before: int = _report["toasts"].size()
				await _use_item_slot("brush")
				await _act()
				await _wait(0.3)
				brushed = brushed or _report["toasts"].slice(toasts_before).any(func(t: String) -> bool: return t.ends_with(" är fin!"))
				await _use_item_slot("hoe")
				await _act()
				await _wait(0.4)
				if int(_report["hearts_seen"]) > hearts:
					petted = true
					await _shot("pet", 0.1)
		if not petted:
			_log("trip %d: no pet yet (in %s, %d hearts)" % [trip + 1, model.my_area_key(), int(model.my_player().get("hearts", 0))])
			if model.my_area_key() != "farm":
				await _leave_by("s", "farm")
			await _wait(4.0)
	# an animal counts if it ran off (more than 3 tiles from me) and later came back to me (within 2.5 tiles) while I stood still
	var best: Dictionary = {}
	for r in _startles.values():
		if float(r["peak"]) > 3.0 and float(r["back"]) <= 2.5 and (best.is_empty() or float(r["peak"]) > float(best["peak"])):
			best = r
	_step("startle", not best.is_empty(), "%s (%d watched: %s)" % [("a wild animal ran off and came back to me while I stood still" if not best.is_empty() else "no animal both ran off and came back"), _startles.size(), _startles_detail()])
	await _sounds_any("the forest", ["birds", "crickets", "rain", "wind_hard"]) # (not wind_soft: it has a floor and always sounds)
	_step("pet", petted, "a wild animal was brushed (%s) and petted, %d hearts seen in all (Elsa's and Sven's are two of them)" % [str(brushed), int(_report["hearts_seen"])])


## One sample of a wild animal being watched, in tiles. `away`: how far it has been from where it stood. `peak`: the farthest it has
## been from me (I stand still while I watch), and `back`: the nearest it has been to me since that farthest point, which starts
## over whenever it runs farther. The server's rule (sim.ts `tickStartle`): a moving hero within 4 tiles startles it, it bolts away
## from them, and once it has calmed down it creeps to the tile next to a quiet hero and stays there. So "ran off" is: it was
## more than 3 tiles from me (a creeping animal is 1 to 2 away), and "came back" is: it was then beside me (the middle of an
## adjacent tile is at most about 2.2 tiles from me).
func _watch_startle(rec: Dictionary, animal: Dictionary) -> void:
	var tile := Data.tile()
	var at := _animal_px(animal)
	var d_bot := at.distance_to(Vector2(world.hero.px, world.hero.py)) / tile
	rec["away"] = maxf(float(rec["away"]), at.distance_to(rec["home"]) / tile)
	if d_bot > float(rec["peak"]):
		rec["peak"] = d_bot
		rec["back"] = INF
	else:
		rec["back"] = minf(float(rec["back"]), d_bot)


## For the startle step's detail: per animal watched, how far it was when the bot set off, how close the walk got, the most it ran
## from its place, the most it was from me and the nearest it came back to its place after that (INF: it did not).
func _startles_detail() -> String:
	var parts: Array = []
	for id in _startles.keys():
		var r: Dictionary = _startles[id]
		var back: float = r["back"]
		parts.append("#%s %.0f tiles off, %.1f after the walk, ran %.1f from its place (up to %.1f from me), %s" % [id, float(r.get("far", -1.0)), float(r.get("near", -1.0)), float(r["away"]), float(r["peak"]), ("then came back to %.1f of me" % back) if back < INF else "did not come back"])
	return "; ".join(parts)


## The nearest roaming monster or predator within `tiles` of a point (px), or INF.
func _hostile_near(at: Vector2, tiles: float) -> Vector2:
	var w := world.model.world_for(world.model.my_area_key())
	for id in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][id]
		var def: Dictionary = Data.animals.get(str(a.get("species", "")), {})
		if bool(def.get("predator", false)) or bool(def.get("mob", false)):
			var p := _animal_px(a)
			if p.distance_to(at) < tiles * Data.tile():
				return p
	return Vector2.INF


## M7b: the ambience mix has these layers sounding (the soundscape eases them in over a couple of seconds; headless nothing
## is played, but the mix, the players and the fades all run), and the `muffled` ones, if any, are quiet (indoors the outdoors is at 15 %).
func _sounds(label: String, expect: Array, muffled: Array = []) -> void:
	var ok := await _until(func() -> bool:
		var layers: Dictionary = world.soundscape.report()["layers"]
		return expect.all(func(l: String) -> bool: return layers.has(l)) and muffled.all(func(l: String) -> bool: return float(layers.get(l, 0.0)) < 0.2), 12.0)
	_step("sound: " + label, ok, "sounding now: %s" % str(world.soundscape.report()["layers"]))


## M7b: at least one of these layers (the ones a place, an hour or a weather adds, not the always-on wind) is sounding.
func _sounds_any(label: String, any_of: Array) -> void:
	var ok := await _until(func() -> bool:
		var layers: Dictionary = world.soundscape.report()["layers"]
		return any_of.any(func(l: String) -> bool: return layers.has(l)), 12.0)
	_step("sound: " + label, ok, "sounding now: %s (one of %s wanted)" % [str(world.soundscape.report()["layers"]), str(any_of)])


## M7b: the footsteps made it from the grass to the wooden floor of the farmhouse and the village's stones, the ambience
## switched layers on the way, and no sound node piled up.
func _sound_totals() -> void:
	var st: Dictionary = world.steps.stats
	var kinds: Dictionary = st["kinds"]
	_step("sound: footsteps", int(st["steps"]) >= 30 and kinds.has("grass") and kinds.has("wood") and kinds.size() >= 3, "%d steps in all, by ground: %s" % [int(st["steps"]), str(kinds)])
	# the route went by a pond (water on and off), the stove (fire on and off), the village (murmur on and off) and the farm's
	# birds and wind: at least 8 layers started or ended; and no sound node piled up (one player a layer and the owl's)
	var rep: Dictionary = world.soundscape.report()
	_step("sound: ambience", int(rep["fades"]) >= 8 and world.soundscape.get_child_count() <= Soundscape.LAYERS.size() + 1,
		"%d layers started or ended, %d players, %d children" % [int(rep["fades"]), int(rep["players"]), world.soundscape.get_child_count()])


func _final_state() -> void:
	var me := world.model.my_player()
	var totals: Dictionary = {}
	for st in me.get("inventory", []):
		if st is Dictionary:
			totals[str(st.get("item", ""))] = int(totals.get(str(st.get("item", "")), 0)) + int(st.get("count", 1))
	_report["inventory"] = totals
	_report["coins"] = int(me.get("coins", 0))
	_report["stars"] = int(me.get("stars", 0))
	_report["hud_coins"] = world.hud.farm_labels["coins"].text
	_report["hud_stars"] = world.hud.farm_labels["stars"].text
	_report["day"] = world.model.day
	_report["id"] = world.model.me


# ---------------------------------------------------------------------------
# Helpers: the map, the model, walking


func _my_tile() -> Vector2i:
	var tile := Data.tile()
	return Vector2i(floori(world.hero.px / tile), floori(world.hero.py / tile))


func _terrain_at(t: Vector2i) -> String:
	var w := world.hero.world
	var i := t.y * int(w.get("w", 64)) + t.x
	var terrain: Array = w.get("terrain", [])
	return str(terrain[i]) if i >= 0 and i < terrain.size() else ""


func _crop_at(t: Vector2i) -> Variant:
	return world.hero.world.get("crops", {}).get("%d,%d" % [t.x, t.y])


func _drop_count() -> int:
	return world.hero.world.get("drops", {}).size()


func _can_charges() -> int:
	for st in world.model.my_player().get("inventory", []):
		if st is Dictionary and str(st.get("item", "")) == "can":
			return int(st.get("charges", 0))
	return -1


func _fish_count() -> int:
	var n := 0
	for st in world.model.my_player().get("inventory", []):
		if st is Dictionary and str(st.get("item", "")).begins_with("fish_"):
			n += int(st.get("count", 0))
	return n


func _slot_of(item: String) -> int:
	var inv: Array = world.model.my_player().get("inventory", [])
	for i in range(inv.size()):
		if inv[i] is Dictionary and str(inv[i].get("item", "")) == item:
			return i
	return -1


func _empty_slot() -> int:
	var inv: Array = world.model.my_player().get("inventory", [])
	for i in range(int(Data.constant("HOTBAR_SIZE", 8.0)), inv.size()):
		if inv[i] == null:
			return i
	return -1


## Holds the item (the hotbar's key press: `select`).
func _use_item_slot(item: String) -> void:
	var slot := _slot_of(item)
	if slot < 0:
		_error("no %s to hold" % item)
		return
	world.play.select_slot(slot)
	await _until(func() -> bool: return str(world.model.held().get("item", "")) == item, 2.0)
	await _wait(0.1)


## The use key.
func _act(picture := "") -> void:
	await _wait(0.2) # (a use is never sent twice within play.ACT_GAP)
	world.play.act()
	if picture != "":
		await _shot(picture, 0.2) # (the swing and the splash are at their best a moment after the use)
		await _wait(0.2)
	else:
		await _wait(0.35)


## Turn on the spot, and tell the server (it keeps the way I face for `drop`).
func _face(dir: String) -> void:
	world.hero.drive = Vector2.ZERO
	world.hero.facing = dir
	Net.send({"t": "move", "x": world.hero.px, "y": world.hero.py, "facing": dir, "moving": false})


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
			if world._mode == "outdoor" and world._area == "farm" and not _via_door and world.hero._is_portal_tile(nxt.x, nxt.y):
				continue # (the farmhouse door and the way out of its room teleport: only when asked)
			dist[nxt] = d + 1
			queue.append(nxt)
	return dist


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


## Walks to the middle of a tile; false when there is no way or it takes too long.
func _goto(goal: Vector2i, timeout := 120.0) -> bool:
	var hero := world.hero
	var tile := Data.tile()
	hero.driven = true
	var until := Time.get_ticks_msec() + int(timeout * 1000.0)
	var stuck := 0.0
	var last := Vector2(hero.px, hero.py)
	var path_from := Vector2i(-9999, -9999) ## (the route is worked out again only when I enter a new tile: a slow window must not spend its frames on it)
	var path: Array = []
	while Time.get_ticks_msec() < until and not _done:
		var start := _my_tile()
		var here := Vector2(hero.px, hero.py)
		var centre := Vector2((goal.x + 0.5) * tile, (goal.y + 0.5) * tile)
		if start == goal and here.distance_to(centre) < 2.0:
			hero.drive = Vector2.ZERO
			await _wait(0.25)
			return true
		if start != path_from:
			path_from = start
			path = _path_to(start, goal, _distance_field(start))
		if path.is_empty() and start != goal:
			hero.drive = Vector2.ZERO
			return false
		var next: Vector2i = path[0] if path.size() > 0 else goal
		var target := Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
		if start == next or here.distance_to(target) < 2.0:
			if path.size() > 1:
				next = path[1]
				target = Vector2((next.x + 0.5) * tile, (next.y + 0.5) * tile)
			else:
				target = centre
		var d := target - here
		hero.drive = d.normalized() if d.length() > 0.6 else Vector2.ZERO
		await get_tree().physics_frame
		stuck = stuck + get_physics_process_delta_time() if here.distance_to(last) < 0.05 else 0.0
		last = here
		if stuck > 1.5:
			# a villager or an animal in the way (the server's solid, not the client's): wait for it to move on
			hero.drive = Vector2.ZERO
			await _wait(0.6)
			stuck = 0.0
	hero.drive = Vector2.ZERO
	return false


## A free grass tile near the start, with the tile above it to stand on (facing down at it: the camera looks over the
## hero's shoulder at what is in front of him, and a hero facing up would stand in front of his own patch).
func _find_patch() -> Dictionary:
	var start := _my_tile()
	var dist := _distance_field(start)
	var best: Dictionary = {}
	var best_d := 1000
	for tile in dist.keys():
		var d: int = dist[tile]
		if d > 14 or d >= best_d:
			continue
		var g: Vector2i = tile + Vector2i(0, 1)
		var stand: Vector2i = tile
		if _terrain_at(g) != "grass" or world.hero._is_solid(g.x, g.y) or _crop_at(g) != null:
			continue
		if world.hero.world.get("occupancy", {}).has("%d,%d" % [g.x, g.y]):
			continue
		if _near_npc(g):
			continue
		best = {"tile": g, "stand": stand}
		best_d = d
	return best


func _near_npc(t: Vector2i) -> bool:
	var tile := Data.tile()
	for n in world.model.npc_snaps.values():
		if absf(float(n.get("x", -99)) / tile - t.x) < 3.0 and absf(float(n.get("y", -99)) / tile - t.y) < 3.0:
			return true
	return false


func _objects_of(kinds: Array) -> Array:
	var out: Array = []
	for o in world.hero.world.get("objects", {}).values():
		if o is Dictionary and kinds.has(str(o.get("kind", ""))):
			out.append(o)
	return out


## A reachable tile beside an object, and the way to face it from there.
func _stand_next_to(obj: Dictionary, dist: Dictionary = {}) -> Dictionary:
	if dist.is_empty():
		dist = _distance_field(_my_tile())
	var def := Data.object_def(str(obj.get("kind", "")))
	var best: Dictionary = {}
	var best_d := 100000
	for dy in range(-1, int(def.get("h", 1)) + 1):
		for dx in range(-1, int(def.get("w", 1)) + 1):
			var inside_x: bool = dx >= 0 and dx < int(def.get("w", 1))
			var inside_y: bool = dy >= 0 and dy < int(def.get("h", 1))
			if inside_x == inside_y:
				continue # (corners and the object itself)
			var stand := Vector2i(int(obj.get("x", 0)) + dx, int(obj.get("y", 0)) + dy)
			if not dist.has(stand) or int(dist[stand]) >= best_d:
				continue
			var dir := "down" if dy < 0 else ("up" if dy >= int(def.get("h", 1)) else ("right" if dx < 0 else "left"))
			best = {"stand": stand, "dir": dir}
			best_d = dist[stand]
	return best


## The nearest object of one of the kinds that can be reached.
func _nearest_object(kinds: Array) -> Dictionary:
	var dist := _distance_field(_my_tile())
	var best: Dictionary = {}
	var best_d := 100000
	for o in _objects_of(kinds):
		var spot := _stand_next_to(o, dist)
		if spot.is_empty():
			continue
		var d: int = dist[spot["stand"]]
		if d < best_d:
			best_d = d
			best = o
	return best


## Walks beside an object and uses the held tool on it until it is gone.
func _break(obj: Dictionary, tool_item: String) -> bool:
	var spot := _stand_next_to(obj)
	if spot.is_empty() or not await _goto(spot["stand"]):
		return false
	_face(spot["dir"])
	await _use_item_slot(tool_item)
	var id := str(int(obj.get("id", 0)))
	for i in range(4):
		await _act()
		if await _until(func() -> bool: return not world.hero.world.get("objects", {}).has(id), 2.0):
			await _wait(0.3)
			return true
	return false


func _walk_to_npc(id: String) -> bool:
	for attempt in range(6):
		var n: Variant = world.model.npc_snaps.get(id)
		if not (n is Dictionary):
			await _wait(0.5)
			continue
		var tile := Data.tile()
		var at := Vector2i(floori(float(n.get("x", 0)) / tile), floori(float(n.get("y", 0)) / tile))
		var dist := _distance_field(_my_tile())
		var best := Vector2i(-1, -1)
		var best_d := 100000
		for dx in range(-1, 2):
			for dy in range(-1, 2):
				var t := at + Vector2i(dx, dy)
				if t != at and dist.has(t) and int(dist[t]) < best_d:
					best_d = dist[t]
					best = t
		if best.x < 0:
			await _wait(0.5)
			continue
		if await _goto(best, 25.0):
			await _wait(0.4)
			# still close to where they stand now (they walk)?
			n = world.model.npc_snaps.get(id)
			var now_at := Vector2i(floori(float(n.get("x", 0)) / tile), floori(float(n.get("y", 0)) / tile))
			if absi(now_at.x - _my_tile().x) <= 2 and absi(now_at.y - _my_tile().y) <= 2:
				return true
	return false


func _find_water() -> Dictionary:
	var dist := _distance_field(_my_tile())
	var best: Dictionary = {}
	var best_d := 100000
	var w := world.hero.world
	var mw := int(w.get("w", 64))
	var terrain: Array = w.get("terrain", [])
	for i in range(terrain.size()):
		if str(terrain[i]) != "water":
			continue
		var wt := Vector2i(i % mw, i / mw)
		for step in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
			var stand: Vector2i = wt + step
			if dist.has(stand) and int(dist[stand]) < best_d:
				var dir := "down" if step.y < 0 else ("up" if step.y > 0 else ("right" if step.x < 0 else "left"))
				best = {"stand": stand, "dir": dir, "water": wt}
				best_d = dist[stand]
	return best


## Walks off an edge of the map through its opening and waits for the next map.
func _leave_by(dir: String, key: String) -> bool:
	var w := world.hero.world
	var mw := int(w.get("w", 64))
	var mh := int(w.get("h", 64))
	var goal := Vector2i(mw / 2, 1) if dir == "n" else (Vector2i(mw / 2, mh - 2) if dir == "s" else (Vector2i(mw - 2, mh / 2) if dir == "e" else Vector2i(1, mh / 2)))
	if not await _goto(goal, 180.0):
		return false
	world.hero.drive = Vector2(0, -1) if dir == "n" else (Vector2(0, 1) if dir == "s" else (Vector2(1, 0) if dir == "e" else Vector2(-1, 0)))
	var arrived := await _until(func() -> bool: return world.model.my_area_key() == key and world._mode == "outdoor" and world._area == key, 12.0)
	world.hero.drive = Vector2.ZERO
	await _wait(0.8)
	return arrived


func _nearest_wild() -> Dictionary:
	var w := world.model.world_for(world.model.my_area_key())
	var best: Dictionary = {}
	var best_d := 100000.0
	var me := Vector2(world.hero.px, world.hero.py)
	for id in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][id]
		var def: Dictionary = Data.animals.get(str(a.get("species", "")), {})
		if not bool(def.get("wild", false)) or bool(def.get("predator", false)) or bool(def.get("mob", false)) or a.get("owner") != null:
			continue
		if bool(a.get("petted", false)):
			continue
		var p := _animal_px(a)
		if _hostile_near(p, 9.0) != Vector2.INF:
			continue
		if p.distance_to(me) < best_d:
			best_d = p.distance_to(me)
			best = a
	return best


func _animal_by_id(id: String) -> Dictionary:
	var a: Variant = world.model.world_for(world.model.my_area_key()).get("animals", {}).get(id)
	return a if a is Dictionary else {}


func _animal_px(a: Dictionary) -> Vector2:
	var snap: Variant = world.model.animal_snaps.get(str(int(a.get("id", 0))))
	if snap is Dictionary:
		return Vector2(float(snap.get("x", 0)), float(snap.get("y", 0)))
	return Vector2(float(a.get("x", 0)), float(a.get("y", 0)))


func _animal_tile(a: Dictionary) -> Vector2i:
	var p := _animal_px(a)
	var tile := Data.tile()
	return Vector2i(floori(p.x / tile), floori(p.y / tile))


func _stand_next_to_animal(a: Dictionary) -> Dictionary:
	var dist := _distance_field(_my_tile())
	var at := _animal_tile(a)
	var best: Dictionary = {}
	var best_d := 100000
	for step in [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]:
		var stand: Vector2i = at + step
		if dist.has(stand) and int(dist[stand]) < best_d:
			best = {"stand": stand}
			best_d = dist[stand]
	return best


## A picture of the window as it is a moment after an event (needs a real window: under Xvfb, not --headless).
func _shot(shot_name: String, after: float) -> void:
	if shots_dir == "" or DisplayServer.get_name() == "headless":
		return
	await _wait(after)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img != null:
		DirAccess.make_dir_recursive_absolute(shots_dir)
		img.save_png("%s/%s.png" % [shots_dir, shot_name])
		_log("picture %s" % shot_name)


func _finish() -> void:
	if _done:
		return
	_done = true
	world.hero.drive = Vector2.ZERO
	world.hero.driven = false
	var steps: Array = _report["steps"]
	var failed := 0
	for s in steps:
		if not bool(s["ok"]):
			failed += 1
	_report["ok"] = _report["errors"].is_empty() and failed == 0 and (steps.size() >= 40 or only != "")
	_log("%d steps, %d failed, %d errors" % [steps.size(), failed, _report["errors"].size()])
	if report_path != "":
		var fa := FileAccess.open(report_path, FileAccess.WRITE)
		if fa != null:
			fa.store_string(JSON.stringify(_report, "  "))
			fa.close()
			_log("report written to %s" % report_path)
	Net.disconnect_now()
	await get_tree().create_timer(0.5).timeout
	(get_tree().current_scene as Main).quit_clean(0 if bool(_report["ok"]) else 1)
