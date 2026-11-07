class_name FarmBotHome
extends RefCounted
## The farmer's M4c steps (farm_bot.gd runs them): the shop and the sell box, the workbench and building with the
## placement preview, the ownership refusal, the farmhouse door, the stove, the wardrobe, the villagers' talk and their
## wishes, the bus, the class stone, Völvan's chapter and the hero switch with the gear window. Every step goes through
## the same code a person's keys and clicks go through: the use key opens the window the server asks for, and the
## buttons of its rows are pressed (`pressed` is emitted), so the window's own handlers send the messages.

var bot: FarmBot
var world: WorldView
var model: WorldModel
var windows: FarmWindows
var _friend_fence: Dictionary = {}


func _init(b: FarmBot) -> void:
	bot = b
	world = b.world
	model = world.model
	windows = world.play.windows


# ---------------------------------------------------------------------------
# Helpers


## Presses the button of a window's row that carries this key (the rows' buttons are tagged); false when there is none
## or it is switched off (the window shows it dimmed).
func _press(win: GameWindow, key: String) -> bool:
	for b in win._find_buttons(win._body) + win._find_buttons(win._tabs) + win._find_buttons(win._foot):
		if b.has_meta("k") and str(b.get_meta("k")) == key:
			if b.disabled:
				return false
			b.pressed.emit()
			return true
	return false


func _has_button(win: GameWindow, key: String) -> bool:
	for b in win._find_buttons(win._body):
		if b.has_meta("k") and str(b.get_meta("k")) == key:
			return true
	return false


## Walks next to an object, faces it, holds something that does not use it up (the hoe) and presses the use key.
func _use_object(kinds: Array, window: GameWindow, hold := "hoe") -> bool:
	var obj := bot._nearest_object(kinds)
	if obj.is_empty():
		bot._error("no %s in reach" % str(kinds))
		return false
	var spot := bot._stand_next_to(obj)
	if spot.is_empty() or not await bot._goto(spot["stand"]):
		bot._error("could not walk to %s" % str(kinds))
		return false
	bot._face(spot["dir"])
	if hold != "":
		await bot._use_item_slot(hold)
	await bot._act()
	return await bot._until(func() -> bool: return window.is_open(), 4.0)


func _coins() -> int:
	return int(model.my_player().get("coins", 0))


func _stars() -> int:
	return int(model.my_player().get("stars", 0))


func _hud_coins_ok() -> bool:
	return str(world.hud.farm_labels["coins"].text).contains(str(_coins()))


func _my_tile() -> Vector2i:
	return bot._my_tile()


## Walks next to a villager (an orthogonal neighbour of the tile they stand on), faces them and uses the key until their
## window is open.
func _talk_to(id: String) -> bool:
	var tile := Data.tile()
	for attempt in range(6):
		var n: Variant = model.npc_snaps.get(id)
		if not (n is Dictionary):
			await bot._wait(0.5)
			continue
		var at := Vector2i(floori(float(n.get("x", 0)) / tile), floori(float(n.get("y", 0)) / tile))
		var dist := bot._distance_field(_my_tile())
		var best := Vector2i(-1, -1)
		var best_d := 100000
		var dir := ""
		for step in [Vector2i(0, 1), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(1, 0)]:
			var t: Vector2i = at + step
			if dist.has(t) and int(dist[t]) < best_d:
				best_d = dist[t]
				best = t
				dir = "up" if step.y > 0 else ("down" if step.y < 0 else ("right" if step.x < 0 else "left"))
		if best.x < 0:
			await bot._wait(0.5)
			continue
		if not await bot._goto(best, 25.0):
			continue
		n = model.npc_snaps.get(id)
		var now_at := Vector2i(floori(float(n.get("x", 0)) / tile), floori(float(n.get("y", 0)) / tile))
		if now_at != at:
			continue # they walked on
		bot._face(dir)
		await bot._use_item_slot("hoe")
		await bot._act()
		if await bot._until(func() -> bool: return windows.talk.is_open() and windows.talk.npc == id, 3.0):
			return true
	return false


# ---------------------------------------------------------------------------
# The shop


## The Gårdsbutik: five wheat seeds and a hat (coins checked against the server at the end of the run).
func shop_buy() -> void:
	var before := _coins()
	if not await _use_object(["mailbox", "market"], windows.shop):
		bot._step("the shop opens", false, "the use key on the shop stand did not open the window")
		return
	await bot._wait(0.3)
	await bot._shot("shop", 0.1)
	bot._step("the shop opens", true, "the window is open with %d tabs and %d coins" % [Data.shop_tabs.size(), before])
	var seeds_before := model.count_item("wheat_seed")
	var pressed := _press(windows.shop, "b:wheat_seed:5")
	var got := pressed and await bot._until(func() -> bool: return model.count_item("wheat_seed") == seeds_before + 5, 4.0)
	await bot._wait(0.3)
	var price := Data.item_buy("wheat_seed") * 5
	bot._step("buy seeds", got and _coins() == before - price and _hud_coins_ok(), "5 wheat seeds for %d kr: coins %d -> %d, the HUD says %s" % [price, before, _coins(), str(world.hud.farm_labels["coins"].text)])
	# a hat from the clothes tab (the cheapest one for sale)
	var hat := ""
	var hat_price := 100000
	for id in Data.shop_items:
		var d := Data.item(id)
		if str(d.get("slot", "")) == "hat" and Data.for_sale(id, model.season) and int(d.get("buy", -1)) >= 0 and int(d.get("buy", -1)) < hat_price and not d.has("stars"):
			hat = id
			hat_price = int(d.get("buy"))
	windows.shop._pick_tab("clothes")
	await bot._wait(0.2)
	var coins_before := _coins()
	var bought := hat != "" and _press(windows.shop, "b:%s:1" % hat)
	var owned := bought and await bot._until(func() -> bool: return (model.my_player().get("wardrobe", []) as Array).has(hat), 4.0)
	await bot._wait(0.3)
	bot._step("buy a hat", owned and _coins() == coins_before - hat_price, "%s for %d kr went to the wardrobe: coins %d -> %d" % [hat, hat_price, coins_before, _coins()])
	windows.shop.close()
	_wearing = hat


var _wearing := ""


func sell_crop() -> void:
	var before := _coins()
	var carrots := model.count_item("carrot")
	var slot := bot._slot_of("carrot")
	if slot < 0:
		bot._step("sell a crop", false, "no carrot to sell")
		return
	if not await _use_object(["sellbox", "sellstall"], windows.sell):
		bot._step("sell a crop", false, "the sell box did not open")
		return
	await bot._wait(0.3)
	await bot._shot("sell", 0.1)
	var price := Data.item_sell("carrot")
	var ok := _press(windows.sell, "s1:%d" % slot)
	var sold := ok and await bot._until(func() -> bool: return model.count_item("carrot") == carrots - 1, 4.0)
	await bot._wait(0.3)
	bot._step("sell a crop", sold and _coins() == before + price and _hud_coins_ok(), "a carrot fetched %d kr: coins %d -> %d, the HUD says %s" % [price, before, _coins(), str(world.hud.farm_labels["coins"].text)])
	windows.sell.close()


# ---------------------------------------------------------------------------
# Building


func build() -> void:
	var wood := model.count_item("wood")
	if wood < 2:
		bot._step("wood for fences", false, "only %d wood" % wood)
		return
	if not await _use_object(["start_bench", "workbench"], windows.craft):
		bot._step("the workbench opens", false, "the use key on the bench did not open the window")
		return
	await bot._wait(0.3)
	await bot._shot("workbench", 0.1)
	bot._step("the workbench opens", true, "%d recipes, the fence needs %s" % [Data.recipes.size(), "wood 2"])
	var fences := model.count_item("fence")
	var crafted := _press(windows.craft, "r:fence") and await bot._until(func() -> bool: return model.count_item("fence") >= fences + 4, 4.0)
	bot._step("craft fences", crafted and model.count_item("wood") == wood - 2, "wood %d -> %d, fences %d -> %d" % [wood, model.count_item("wood"), fences, model.count_item("fence")])
	windows.craft.close()
	await bot._wait(0.3)
	# the preview: red on water, green on free grass; then the fence goes down and it is mine
	var water := bot._find_water()
	if not water.is_empty() and await bot._goto(water["stand"]):
		bot._face(water["dir"])
		await bot._use_item_slot("fence")
		await bot._wait(0.5)
		var t := world.play.target
		bot._step("preview: no fence on water", t.placing and not t.can and t.text == Strings.t("actNoPlace"), "outline %s, says \"%s\"" % ["green" if t.can else "red", t.text])
	var spot := bot._find_patch()
	if spot.is_empty() or not await bot._goto(spot["stand"]):
		bot._step("place a fence", false, "no free grass")
		return
	bot._face("down")
	await bot._use_item_slot("fence")
	await bot._wait(0.5)
	var tgt := world.play.target
	var green: bool = tgt.placing and tgt.can
	var tile: Vector2i = spot["tile"]
	await bot._shot("build-preview", 0.1)
	await bot._act()
	var placed := await bot._until(func() -> bool: return _object_at(tile).get("kind", "") == "fence", 4.0)
	var mine: bool = str(_object_at(tile).get("by", "")) == model.me
	bot._step("place a fence", green and placed and mine, "preview %s, a fence stands on %s, built by me: %s (it remembers who)" % ["green" if green else "red", str(tile), str(mine)])
	# taking my own fence down gives it back; someone else's is refused
	var fences_now := model.count_item("fence")
	await bot._use_item_slot("hammer")
	await bot._wait(0.4)
	await bot._act()
	var removed := await bot._until(func() -> bool: return _object_at(tile).is_empty(), 4.0)
	bot._step("take my fence down", removed and model.count_item("fence") == fences_now + 1, "gone from %s, fences %d -> %d" % [str(tile), fences_now, model.count_item("fence")])
	await _refused()


func _object_at(t: Vector2i) -> Dictionary:
	var oid: Variant = world.hero.world.get("occupancy", {}).get("%d,%d" % [t.x, t.y])
	if oid == null:
		return {}
	var o: Variant = world.hero.world.get("objects", {}).get(str(int(oid)))
	return o if o is Dictionary else {}


func _refused() -> void:
	var theirs: Dictionary = {}
	for o in bot._objects_of(["fence"]):
		if o.get("by") != null and str(o.get("by")) != model.me:
			theirs = o
			break
	if theirs.is_empty():
		bot._step("someone else's fence is refused", false, "no fence built by another player on the farm (the neighbour did not build)")
		return
	var spot := bot._stand_next_to(theirs)
	if spot.is_empty() or not await bot._goto(spot["stand"]):
		bot._step("someone else's fence is refused", false, "could not walk to %s" % str(theirs))
		return
	bot._face(spot["dir"])
	await bot._use_item_slot("hammer")
	await bot._wait(0.5)
	var owner_name := str((model.players().get(str(theirs.get("by")), {}) as Dictionary).get("name", ""))
	var line := Strings.t("actBuiltBy", {"owner": owner_name, "name": Strings.object_name("fence")})
	var shows: bool = world.play.target.text == line and not world.play.target.can
	var toasts_before: int = bot._report["toasts"].size()
	await bot._act()
	var said := await bot._until(func() -> bool: return bot._report["toasts"].slice(toasts_before).has(Strings.t("notYourBuild", {"owner": owner_name})), 4.0)
	await bot._wait(0.4)
	var stands := not _object_at(Vector2i(int(theirs.get("x", 0)), int(theirs.get("y", 0)))).is_empty()
	await bot._shot("not-yours", 0.1)
	bot._step("someone else's fence is refused", said and stands and shows, "%s's fence stayed, the server said so (%s) and the prompt said \"%s\"" % [owner_name, str(said), world.play.target.text])


# ---------------------------------------------------------------------------
# The house


func _enter_door(from_kind: String) -> bool:
	# walk to the tile in front of the door and step through it with the stick (the door teleports: the walking helper
	# must not plan a route through it)
	var entering := from_kind == "in"
	var before := Vector2i(10, 9) if entering else Vector2i(57, 60)
	if not await bot._goto(before, 40.0):
		return false
	var hero := world.hero
	hero.driven = true
	hero.drive = Vector2(0, -1) if entering else Vector2(0, 1)
	var tile := Data.tile()
	var crossed := false
	for i in range(40):
		await bot.get_tree().physics_frame
		if Data.in_interior(floori(hero.px / tile), floori(hero.py / tile)) == entering:
			crossed = true
			break
	hero.drive = Vector2.ZERO
	await bot._wait(1.5) # the server's snapshots must agree (the door is a jump it accepts only between its two ends)
	var snap: Variant = model.player_snaps.get(model.me)
	var server_inside: bool = snap is Dictionary and Data.in_interior(floori(float(snap.get("x", 0)) / tile), floori(float(snap.get("y", 0)) / tile))
	var still := Data.in_interior(floori(hero.px / tile), floori(hero.py / tile)) == entering
	return crossed and still and server_inside == entering


func house_and_cook() -> void:
	var entered := await _enter_door("in")
	bot._step("into the farmhouse", entered, "through the door at 10,8 to %s; the server's snapshot agrees" % str(_my_tile()))
	if not entered:
		return
	await bot._wait(1.0)
	await bot._shot("house", 0.2)
	var wheat := model.count_item("wheat")
	if not await _use_object(["stove"], windows.stove):
		bot._step("the stove opens", false, "the use key on the stove did not open the window")
		return
	await bot._wait(0.3)
	await bot._shot("cook", 0.1)
	bot._step("the stove opens", true, "%d recipes; the bread needs wheat 3 and I have %d" % [Data.cooking.size(), wheat])
	await bot._sounds("by the stove indoors", ["fire"], ["birds", "crickets", "wind_soft"])
	var bread := model.count_item("bread")
	var cooked := wheat >= 3 and _press(windows.stove, "r:bread") and await bot._until(func() -> bool: return model.count_item("bread") >= bread + 2, 4.0)
	bot._step("cook bread", cooked and model.count_item("wheat") == wheat - 3, "wheat %d -> %d, bread %d -> %d" % [wheat, model.count_item("wheat"), bread, model.count_item("bread")])
	windows.stove.close()
	await bot._wait(0.3)
	var left := await _enter_door("out")
	bot._step("out of the farmhouse", left, "through the exit at 57,61 to %s; the server's snapshot agrees" % str(_my_tile()))


# ---------------------------------------------------------------------------
# The pizzeria on the village square, and eating


func pizza() -> void:
	if model.my_area_key() != "a:1,0" and not await to_village():
		bot._step("the pizzeria", false, "not in the village")
		return
	var coins := _coins()
	if not await _use_object(["pizzeria"], windows.pizza):
		bot._step("the pizzeria", false, "the use key on the pizzeria did not open the window")
		return
	await bot._wait(0.3)
	await bot._shot("pizzeria", 0.1)
	var price := Data.item_buy("pizza")
	var bought := _press(windows.pizza, "b:pizza:1") and await bot._until(func() -> bool: return model.count_item("pizza") == 1, 4.0)
	bot._step("buy a pizza", bought and _coins() == coins - price, "a pizza for %d kr: coins %d -> %d" % [price, coins, _coins()])
	windows.pizza.close()
	await bot._wait(0.3)
	await bot._use_item_slot("pizza")
	bot._face("down")
	await bot._wait(0.5)
	var text: String = world.play.target.text
	var toasts_before: int = bot._report["toasts"].size()
	await bot._act()
	var ate := await bot._until(func() -> bool: return model.count_item("pizza") == 0, 4.0)
	await bot._wait(0.3)
	var said: bool = bot._report["toasts"].slice(toasts_before).has(Strings.t("ate", {"item": Data.item_name("pizza")}))
	bot._step("eat the pizza", ate and said and text == Strings.t("actEat", {"item": Data.item_name("pizza")}), "the prompt said \"%s\", the server said it was eaten: %s" % [text, str(said)])


# ---------------------------------------------------------------------------
# The wardrobe


func wardrobe() -> void:
	if _wearing == "":
		bot._step("change the hat", false, "no hat was bought")
		return
	if not await _use_object(["wardrobe"], windows.wardrobe):
		bot._step("change the hat", false, "the wardrobe did not open")
		return
	await bot._wait(0.4)
	await bot._shot("wardrobe", 0.1)
	var pressed := _press(windows.wardrobe, "w:" + _wearing)
	var worn := pressed and await bot._until(func() -> bool: return str((model.my_player().get("outfit", {}) as Dictionary).get("hat", "")) == _wearing, 4.0)
	await bot._wait(0.4)
	await bot._shot("wardrobe-hat", 0.1)
	bot._step("change the hat", worn, "%s is on: the outfit says %s" % [_wearing, str((model.my_player().get("outfit", {}) as Dictionary).get("hat", ""))])
	windows.wardrobe.close()


# ---------------------------------------------------------------------------
# The villagers


## Talk to Tant Greta (she walks about the farm): the conversation's options, a joke and a riddle and a story, with the
## window's own buttons; then Elsa for sten, sax, påse.
func talk() -> void:
	if not await _talk_to("elsa"):
		bot._step("talk to Elsa", false, "could not get her window open")
		return
	await bot._wait(0.3)
	await bot._shot("talk", 0.1)
	var t := windows.talk
	bot._step("a villager's window", t.npc == "elsa", "Elsa's window is open with %d wishes" % t._wishes(model.my_player()).size())
	var went := _press(t, "chat")
	await bot._wait(0.3)
	var said: String = str(t._talk.get("say", "")) if t._talk is Dictionary else ""
	var topics: int = (t._talk.get("options", []) as Array).size() if t._talk is Dictionary else 0
	bot._step("start a conversation", went and said != "" and topics >= 6, "she says \"%s\" and there are %d things to say" % [said.left(60), topics])
	# a joke, then the answer
	t._say("joke", "Berätta ett skämt!")
	await bot._wait(0.2)
	var joke: String = str(t._talk.get("say", ""))
	var joke_go: String = str((t._talk.get("options", []) as Array)[0].get("go", ""))
	t._say(joke_go, "Vet inte, vad då?")
	await bot._wait(0.2)
	var answer: String = str(t._talk.get("say", ""))
	bot._step("a joke", joke.begins_with("Okej, här kommer ett") and answer.ends_with("Hahaha!"), "\"%s\" -> \"%s\"" % [joke.left(50), answer.left(50)])
	# a riddle with a right answer (found by trying each in turn: the data knows which is right)
	t._say("riddle", "Har du en gåta?")
	await bot._wait(0.2)
	var opts: Array = t._talk.get("options", [])
	var solved := false
	for o in opts:
		t._say(str(o.get("go", "")), str(o.get("text", "")))
		if str(t._talk.get("say", "")).begins_with("Rätt") or str(t._talk.get("say", "")).begins_with("Helt rätt") or str(t._talk.get("say", "")).begins_with("Ja!"):
			solved = true
			break
		t._say("riddle", "")
		opts = t._talk.get("options", [])
	bot._step("a riddle", solved or opts.size() == 3, "answered by the window's own options; solved: %s" % str(solved))
	t._say("rps", "Sten, sax, påse")
	await bot._wait(0.2)
	var hands: Array = t._talk.get("options", [])
	t._say(str((hands[0] as Dictionary).get("go", "")), "Sten ✊")
	var result: String = str(t._talk.get("say", ""))
	bot._step("sten, sax, påse", hands.size() == 3 and result.begins_with("Jag tog"), "\"%s\"" % result)
	t._to_front()
	t.close()
	await bot._wait(0.3)


## Elsa's wish (the fixed one for five stones) handed over through their window; Sven's for the rod the same way.
func hand_over(npc: String, quest: String, item: String) -> bool:
	if not await _talk_to(npc):
		return false
	await bot._wait(0.3)
	var coins := _coins()
	var stars := _stars()
	var had := model.count_item(item)
	var pressed := _press(windows.talk, "q:" + quest)
	var done := pressed and await bot._until(func() -> bool: return _stars() > stars or model.count_item(item) < had, 4.0)
	await bot._wait(0.5)
	await bot._shot("wish-" + npc, 0.1)
	windows.talk.close()
	bot._step("%ss önskning" % str(Data.npcs.get(npc, {}).get("name", npc)), done and _hud_coins_ok(), "handed over through their window: coins %d -> %d, stars %d -> %d, the toast said \"%s\"" % [coins, _coins(), stars, _stars(), str(bot._report["toasts"][-1]) if not (bot._report["toasts"] as Array).is_empty() else ""])
	return done


# ---------------------------------------------------------------------------
# The village


func to_village() -> bool:
	var here := model.my_area_key()
	if here == "a:1,0":
		return true
	if here == "a:0,-1":
		if not await bot._leave_by("s", "farm"):
			return false
	elif here != "farm":
		return false
	return await bot._leave_by("e", "a:1,0")


func class_and_chapter() -> void:
	if not await to_village():
		bot._step("walk to Köpingen", false, "never arrived in a:1,0 (in %s)" % model.my_area_key())
		return
	bot._step("walk to Köpingen", world._mode == "outdoor" and world._area == "a:1,0", "east through the opening: the village is drawn with %d objects" % world.farm.object_count())
	await bot._sounds("the village", ["murmur"])
	await bot._wait(1.5)
	await bot._shot("village", 0.2)
	var stone := bot._nearest_object(["saga_stone"])
	if stone.is_empty():
		bot._step("the class stone", false, "no Kämpastenen in the village")
		return
	if not await _use_object(["saga_stone"], windows.klass):
		bot._step("the class stone", false, "the stone did not open its window")
		return
	await bot._wait(0.3)
	windows.klass._view("krigare")
	await bot._wait(0.3)
	await bot._shot("class", 0.1)
	var picked := _press(windows.klass, "pick") and await bot._until(func() -> bool: return Gear.cls_of(model.my_player()) == "krigare", 4.0)
	await bot._wait(0.6)
	bot._step("pick a class", picked, "Krigare chosen at the stone: the server's record says %s" % Gear.cls_of(model.my_player()))
	windows.klass.close()
	# Völvan: the chapter, line by line, the promise, and the reward
	if not await _talk_to(Data.volva):
		bot._step("Völvan's chapter", false, "could not get her window open")
		return
	await bot._wait(0.4)
	await bot._shot("volva", 0.1)
	var t := windows.talk
	var lines := 0
	while _press(t, "more") and lines < 6:
		lines += 1
		await bot._wait(0.15)
	var promised := _press(t, "chapter") and await bot._until(func() -> bool: return SagaState.heard(model.my_player()), 4.0)
	await bot._wait(0.4)
	var coins := _coins()
	var stars := _stars()
	var rewarded := promised and await bot._until(func() -> bool: return SagaState.chapter_done(model.my_player()) and _has_button(t, "chapter"), 3.0)
	rewarded = rewarded and _press(t, "chapter") and await bot._until(func() -> bool: return SagaState.chapter_index(model.my_player()) == 1, 4.0)
	await bot._wait(0.5)
	bot._step("Völvan's chapter", promised and rewarded and _coins() == coins + 20 and _stars() == stars + 1, "%d lines read, promised, reward taken: chapter %d, coins %d -> %d, stars %d -> %d" % [lines + 1, SagaState.chapter_index(model.my_player()), coins, _coins(), stars, _stars()])
	t.close()


func hero_switch() -> void:
	if Gear.cls_of(model.my_player()) == "":
		bot._step("the hero switch", false, "no class")
		return
	# the farm outfit first (a cap), so the swap to the class's hat can be seen; and a starter weapon: the forge that makes it is
	# not in the new client yet, so the development message (DEV_TELEPORT=1) hands over the same set for free
	if _wearing != "":
		windows.wardrobe.open_window()
		_press(windows.wardrobe, "w:" + _wearing)
		await bot._until(func() -> bool: return str((model.my_player().get("outfit", {}) as Dictionary).get("hat", "")) == _wearing, 4.0)
		windows.wardrobe.close()
	Net.send({"t": "dev", "a": "starter"})
	await bot._until(func() -> bool: return model.count_item("jarnyxa") > 0, 4.0)
	bot._press_action("gear")
	if not await bot._until(func() -> bool: return windows.gear.is_open(), 3.0):
		bot._step("the gear window", false, "the G key did not open it")
		return
	await bot._wait(0.3)
	var weapon := ""
	for st in model.my_player().get("inventory", []):
		if st is Dictionary and str(Data.item(str(st.get("item", ""))).get("gearKind", "")) == "weapon":
			weapon = str(st.get("item", ""))
			break
	var equipped := false
	var had: String = str(Gear.gear_of(model.my_player()).get("weapon", ""))
	if weapon != "" and _press(windows.gear, "on:" + weapon):
		equipped = await bot._until(func() -> bool: return str(Gear.gear_of(model.my_player()).get("weapon", "")) == weapon, 4.0)
	elif had != "":
		equipped = true
		weapon = had
	await bot._wait(0.4)
	await bot._shot("gear", 0.1)
	bot._step("equip the weapon", equipped, "%s is worn (%s); kraft %d %%" % [weapon, Data.item_name(weapon), roundi((float(Gear.stats(model.my_player())["power"]) - 1.0) * 100.0)])
	var farm_hat := str((model.my_player().get("outfit", {}) as Dictionary).get("hat", ""))
	var on := _press(windows.gear, "hero") and await bot._until(func() -> bool: return Gear.hero_on(model.my_player()), 4.0)
	await bot._wait(0.5)
	var hero_hat := str((model.my_player().get("outfit", {}) as Dictionary).get("hat", ""))
	var class_hat := str(Data.classes.get("krigare", {}).get("outfit", {}).get("hat", ""))
	bot._step("the hero switch", on and hero_hat == class_hat and hero_hat != farm_hat, "hero mode on: the hat went from %s to %s (the class's)" % [farm_hat, hero_hat])
	await bot._shot("hero", 0.1)
	var off := _press(windows.gear, "hero") and await bot._until(func() -> bool: return not Gear.hero_on(model.my_player()), 4.0)
	await bot._wait(0.5)
	var back_hat := str((model.my_player().get("outfit", {}) as Dictionary).get("hat", ""))
	bot._step("back to the farm outfit", off and back_hat == farm_hat, "hero mode off: the hat is %s again" % back_hat)
	windows.gear.close()


## The paint screen and the paint buckets, through the client's real input: a paper used on empty ground opens the screen; the
## drawing is made with a mouse press and drag, then with the pad's keys (InputEventActions through the viewport, so the focus
## navigation runs: the cursor leaves the canvas for the colours, the tools and "Klar"); the wheel and slot_next step the colour and
## leave the hotbar alone; "Klar" sends the drawing and the server turns the paper into a painted tavla whose `data` is exactly the
## cells drawn; hung up, the frame's texture equals the server's `data` cell by cell; a run of wall pieces (wood, stone, a door, a window)
## painted with one bucket shares the server's `variant` (it flood-paints them) and each is drawn with the mesh in that colour; the
## farmhouse's recoloured plaster vertices are sampled, not only its mesh name.
func paint() -> void:
	if model.my_area_key() != "farm":
		bot._step("paint", false, "not on the farm")
		return
	Net.send({"t": "dev", "a": "kit"})
	if not await bot._until(func() -> bool: return model.count_item("paper") >= 2 and model.count_item("paint_red") >= 2 and model.count_item("wall_wood") >= 2 and model.count_item("wall_stone") >= 1 and model.count_item("door") >= 1 and model.count_item("window") >= 1, 4.0):
		bot._step("paint", false, "the kit never came")
		return
	var spot := bot._find_patch()
	if spot.is_empty() or not await bot._goto(spot["stand"]):
		bot._step("paint", false, "no free grass")
		return
	bot._face("down")
	await bot._use_item_slot("paper")
	await bot._act()
	var opened := await bot._until(func() -> bool: return windows.paint.is_open(), 3.0)
	await bot._wait(0.3)
	if not opened:
		bot._step("paper opens the paint screen", false, "the use key with a paper in hand did not open the window")
		return
	var win := windows.paint
	var canvas := win.canvas
	# an empty drawing is refused, here and by the server (the paper stays)
	var papers := model.count_item("paper")
	_press(win, "ok")
	await bot._wait(0.4)
	bot._step("an empty drawing is refused", win.is_open() and model.count_item("paper") == papers, "the window stays open with %d papers" % papers)
	# the mouse: a press, a drag along a row, and the wheel over the canvas steps the colour (the hotbar keeps its square)
	var cell := canvas.cell
	_press(win, "c:2")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(cell * 3.5, cell * 3.5)
	canvas._gui_input(click)
	var move := InputEventMouseMotion.new()
	move.position = Vector2(cell * 9.5, cell * 3.5)
	move.button_mask = MOUSE_BUTTON_MASK_LEFT
	canvas._gui_input(move)
	click.pressed = false
	canvas._gui_input(click)
	var mouse_ok: bool = canvas.cells[3 * 16 + 3] == "2" and canvas.cells[3 * 16 + 6] == "2" and canvas.cells[3 * 16 + 9] == "2"
	var held_before := int(model.my_player().get("selected", 0))
	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_DOWN
	wheel.pressed = true
	canvas._gui_input(wheel)
	var wheel_ok: bool = canvas.colour == "3"
	await _pad("slot_next")
	var slot_ok: bool = canvas.colour == "4" and int(model.my_player().get("selected", 0)) == held_before
	await _pad("slot_prev")
	wheel_ok = wheel_ok and canvas.colour == "3"
	bot._step("the mouse and the wheel", mouse_ok and wheel_ok, "a dragged row of cells is painted; the wheel and slot_prev step the colour (now %s)" % canvas.colour)
	bot._step("slot_next steps the colour, not the hotbar", slot_ok and int(model.my_player().get("selected", 0)) == held_before, "the held square stays %d while the paint screen is open" % held_before)
	# the pad: the canvas has the focus; the cursor moves with ui_* and accept paints; at the edge the focus moves to the colours
	canvas.grab_focus()
	await bot._wait(0.1)
	canvas.cursor = Vector2i(2, 8)
	await _pad("ui_accept")
	await _pad("ui_right")
	await _pad("ui_down")
	await _pad("ui_accept")
	var pad_ok: bool = canvas.cursor == Vector2i(3, 9) and canvas.cells[8 * 16 + 2] == "3" and canvas.cells[9 * 16 + 3] == "3"
	var steps := 0
	while is_instance_valid(win.get_viewport().gui_get_focus_owner()) and win.get_viewport().gui_get_focus_owner() == canvas and steps < 30:
		await _pad("ui_right")
		steps += 1
	var owner := win.get_viewport().gui_get_focus_owner()
	var on_swatch: bool = owner != null and owner.has_meta("k") and str(owner.get_meta("k")).begins_with("c:")
	# on the colours: right twice and accept picks the colour two along (the red at 2 was before it: "0" black, "1" white, "2" red)
	var first_key: String = str(owner.get_meta("k")) if owner != null and owner.has_meta("k") else ""
	await _pad("ui_right")
	await _pad("ui_right")
	await _pad("ui_accept")
	var picked_by_pad: bool = canvas.colour == "2" and on_swatch and first_key == "c:0"
	# then down off the colours onto the tools, along the row to "fill" and accept, and left along it and off its edge back to the canvas
	var reached_tool := false
	for i in range(6):
		await _pad("ui_down")
		var f := win.get_viewport().gui_get_focus_owner()
		if f != null and f.has_meta("k") and str(f.get_meta("k")).begins_with("tool:"):
			reached_tool = true
			break
	for i in range(3):
		var f2 := win.get_viewport().gui_get_focus_owner()
		if f2 != null and str(f2.get_meta("k", "")) == "tool:fill":
			break
		await _pad("ui_right" if str(f2.get_meta("k", "")) == "tool:brush" else "ui_left")
	await _pad("ui_accept")
	var fill_by_pad: bool = canvas.mode == "fill"
	for i in range(4):
		if win.get_viewport().gui_get_focus_owner() == canvas:
			break
		await _pad("ui_left")
	var back_on_canvas := win.get_viewport().gui_get_focus_owner() == canvas
	bot._step("the pad reaches the colours and the tools by focus", pad_ok and on_swatch and picked_by_pad and reached_tool and fill_by_pad and back_on_canvas, "painted by accept: %s; right off the canvas's edge landed on '%s' after %d steps; colour picked: %s; down to the tools: %s, fill chosen: %s; left is the canvas again: %s" % [str(pad_ok), first_key, steps, canvas.colour, str(reached_tool), str(fill_by_pad), str(back_on_canvas)])
	# the fill tool is on: fill the cell at (12, 12) with the pad on the canvas, then the eraser with the mouse-free tool button
	canvas.cursor = Vector2i(12, 12)
	canvas.grab_focus()
	await bot._wait(0.1)
	await _pad("ui_accept")
	var filled: bool = canvas.cells[15 * 16 + 15] == "2" and canvas.cells[3 * 16 + 3] == "2"
	_press(win, "tool:eraser")
	canvas.cursor = Vector2i(0, 0)
	await _pad("ui_accept")
	var erased: bool = canvas.cells[0] == "."
	_press(win, "tool:brush")
	await bot._wait(0.3)
	await bot._shot("paint", 0.1)
	bot._step("fill and eraser", filled and erased, "fill reached the far corner: %s; the eraser cleared a cell: %s" % [str(filled), str(erased)])
	# "Klar" by focus: down off the canvas to "Rensa", right to "Klar", accept
	canvas.grab_focus()
	await bot._wait(0.1)
	canvas.cursor = Vector2i(5, 15)
	await _pad("ui_down")
	var on_clear := win.get_viewport().gui_get_focus_owner() != null and str(win.get_viewport().gui_get_focus_owner().get_meta("k", "")) == "clear"
	await _pad("ui_right")
	var on_ok := win.get_viewport().gui_get_focus_owner() != null and str(win.get_viewport().gui_get_focus_owner().get_meta("k", "")) == "ok"
	var drawing: String = canvas.pixels()
	await _pad("ui_accept")
	var done := await bot._until(func() -> bool: return model.count_item("paper") == papers - 1 and model.count_item("painting") == 1, 4.0)
	var stack_data := ""
	for st in model.my_player().get("inventory", []):
		if st is Dictionary and str(st.get("item", "")) == "painting":
			stack_data = str(st.get("data", ""))
	bot._step("the painting reaches the bag", on_clear and on_ok and done and stack_data == drawing and not win.is_open(), "down to 'Rensa': %s, right to 'Klar': %s, accept: one paper became a tavla; the server kept my %d cells exactly (%s)" % [str(on_clear), str(on_ok), drawing.length(), str(stack_data == drawing)])
	# hang it on a free tile: the frame's picture is the server's painting
	var spot2 := bot._find_patch()
	if spot2.is_empty() or not await bot._goto(spot2["stand"]):
		bot._step("hang the painting", false, "no free grass")
		return
	bot._face("down")
	await bot._use_item_slot("painting")
	await bot._act()
	var tile: Vector2i = spot2["tile"]
	var hung := await bot._until(func() -> bool: return str(_object_at(tile).get("kind", "")) == "painting", 4.0)
	await bot._wait(0.6)
	var obj := _object_at(tile)
	var oid := str(int(obj.get("id", -1)))
	var tex := world.farm.picture_texture(oid)
	var server_data := str(obj.get("data", ""))
	bot._step("the frame shows the painting", hung and server_data == drawing and PaintArt.matches(tex, server_data), "hung on %s; the picture's texture matches the server's %d cells cell by cell: %s" % [str(tile), server_data.length(), str(PaintArt.matches(tex, server_data))])
	await bot._shot("painting", 0.3)
	# a run of wall pieces: wood, stone, a door and a window side by side; one bucket on the first colours the lot
	var run := _find_row(4)
	if run.is_empty():
		bot._step("paint a run of walls", false, "no free grass for four pieces in a row")
		return
	var kinds := ["wall_wood", "wall_stone", "door", "window"]
	var tiles: Array = []
	var placed_all := true
	for i in range(kinds.size()):
		var at: Vector2i = run["tile"] + Vector2i(i, 0)
		if not await bot._goto(at + Vector2i(0, -1)):
			placed_all = false
			break
		bot._face("down")
		await bot._use_item_slot(kinds[i])
		await bot._act()
		var up := await bot._until(func() -> bool: return str(_object_at(at).get("kind", "")) == kinds[i], 4.0)
		placed_all = placed_all and up
		tiles.append(at)
	await bot._wait(0.4)
	var ids: Array = []
	var plain: Array = []
	for at in tiles:
		var wid := str(int(_object_at(at).get("id", -1)))
		ids.append(wid)
		plain.append(world.farm.mesh_name_of(wid))
	await bot._use_item_slot("paint_red")
	bot._face("down")
	await bot._goto((tiles[0] as Vector2i) + Vector2i(0, -1))
	bot._face("down")
	await bot._act()
	var shared_variant := await bot._until(func() -> bool: return int(_object_at(tiles[0]).get("variant", 0)) == 1 and int(_object_at(tiles[3]).get("variant", 0)) == 1, 4.0)
	await bot._wait(0.8)
	var variants: Array = []
	var meshes: Array = []
	var all_red := true
	for i in range(tiles.size()):
		variants.append(int(_object_at(tiles[i]).get("variant", 0)))
		var mn := world.farm.mesh_name_of(ids[i])
		meshes.append(mn)
		var base: String = ["wall_wood", "wall_stone", "door", "window"][i]
		var m: ArrayMesh = world.farm.assets.mesh(mn) if mn != "" else null
		var col: Color = Color.BLACK
		if m != null:
			var cols: PackedColorArray = m.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
			# the largest part of a door or a window is the frame/leaf: some vertex in the bucket's red
			for c in cols:
				if c.r > c.g * 1.5 and c.r > c.b * 1.5:
					col = c
					break
		all_red = all_red and mn == "paint:%s:1" % base and plain[i] == base and col.r > col.g * 1.5
	bot._step("one bucket paints the whole run of walls", placed_all and shared_variant and variants == [1, 1, 1, 1] and all_red, "variants %s, meshes went from %s to %s" % [str(variants), str(plain), str(meshes)])
	await bot._shot("wall-painted", 0.3)
	# the farmhouse, and its recoloured plaster sampled vertex by vertex
	var house := bot._nearest_object(["house"])
	if house.is_empty():
		bot._step("paint the house", false, "no house in reach")
		return
	var hs := bot._stand_next_to(house)
	if hs.is_empty() or not await bot._goto(hs["stand"]):
		bot._step("paint the house", false, "could not walk to the house")
		return
	bot._face(hs["dir"])
	var hid := str(int(house.get("id", -1)))
	var house_before := world.farm.mesh_name_of(hid)
	await bot._use_item_slot("paint_red")
	await bot._act()
	var house_painted := await bot._until(func() -> bool: return int((world.hero.world.get("objects", {}).get(hid, {}) as Dictionary).get("variant", 0)) == 1, 4.0)
	await bot._wait(0.8)
	var house_after := world.farm.mesh_name_of(hid)
	var plain_arr: Array = world.farm.assets.mesh("house").surface_get_arrays(0)
	var red_arr: Array = world.farm.assets.mesh(house_after).surface_get_arrays(0) if house_after != "" else []
	var changed := 0
	var wrong := 0
	var roof_kept := true
	if not red_arr.is_empty():
		var c0: PackedColorArray = plain_arr[Mesh.ARRAY_COLOR]
		var c1: PackedColorArray = red_arr[Mesh.ARRAY_COLOR]
		for i in range(c0.size()):
			if c0[i] == c1[i]:
				continue
			changed += 1
			# only cool plaster changed, and what it became is red with its shade
			if not (c0[i].b >= c0[i].r * 1.02) or not (c1[i].r > c1[i].g * 1.5 and c1[i].r > c1[i].b * 1.5):
				wrong += 1
		# the roof (the warm red-brown that is not plaster) stayed as it was
		for i in range(c0.size()):
			if c0[i].r > c0[i].b * 1.3 and c0[i] != c1[i]:
				roof_kept = false
				break
	bot._step("the painted house's plaster is recoloured", house_painted and house_before == "house" and house_after == "paint:house:1" and changed >= 100 and wrong == 0 and roof_kept, "the mesh went from '%s' to '%s'; %d plaster vertices turned red, %d wrong, the roof and timber kept: %s" % [house_before, house_after, changed, wrong, str(roof_kept)])
	await bot._shot("house-painted", 0.3)
	# the textures made from paintings are kept in a capped cache (the hung frame holds its own)
	for i in range(PaintArt.CACHE_MAX + 20):
		var cells := ".".repeat(PaintArt.size() * PaintArt.size())
		PaintArt.texture_of(cells.substr(0, i) + "0" + cells.substr(i + 1))
	bot._step("the picture cache is capped", PaintArt.cache_size() <= PaintArt.CACHE_MAX and PaintArt.matches(world.farm.picture_texture(oid), server_data), "%d textures kept after %d made; the hung frame still shows its painting" % [PaintArt.cache_size(), PaintArt.CACHE_MAX + 20])


## The text size at 175 % (the 1280 × 720 window is then 731 × 411 points): the forge window and the paint screen both fit on the
## screen, their close buttons ("Avbryt", "OK") and, on the paint screen, "Klar" and the whole canvas are inside it, and the canvas is
## still big enough to draw on (cells of at least 10 points). The text size is put back as it was.
func ui_175() -> void:
	var was := Settings.ui_scale
	var win_size := world.get_window().size
	world.get_window().size = Vector2i(1280, 720) # (the window the 175 % is meant for: 731 × 411 points)
	Settings.set_ui_scale(1.75)
	await bot._wait(0.6)
	var view := world.get_viewport().get_visible_rect()
	var report: Array = []
	var all_ok := true
	for pair in [["forge", windows.forge], ["paint", windows.paint]]:
		var win: GameWindow = pair[1]
		if pair[0] == "forge":
			windows.forge.open_forge()
		else:
			windows.paint.open_paint()
		await bot._wait(0.6)
		var inside := func(c: Control) -> bool:
			var r: Rect2 = c.get_global_transform() * Rect2(Vector2.ZERO, c.size)
			return view.grow(1.0).encloses(r)
		var panel: Control = win._stack.get_parent()
		var ok: bool = inside.call(panel) and inside.call(win._foot.get_node("Close"))
		var detail := "panel %s of %s" % [str((panel.get_global_transform() * Rect2(Vector2.ZERO, panel.size)).size.round()), str(view.size)]
		if pair[0] == "paint":
			var canvas: Control = windows.paint.canvas
			var cr: Rect2 = canvas.get_global_transform() * Rect2(Vector2.ZERO, canvas.size)
			var klar: Control = null
			for b in win._find_buttons(win._body):
				if b.has_meta("k") and str(b.get_meta("k")) == "ok":
					klar = b
			ok = ok and inside.call(canvas) and klar != null and inside.call(klar) and cr.size.x >= 160.0 and windows.paint.canvas.cell >= 10
			detail += ", canvas %s at %s (cells of %d), Klar at %s, view %s" % [str(cr.size.round()), str(cr.position.round()), windows.paint.canvas.cell, str(klar.get_global_transform() * Rect2(Vector2.ZERO, klar.size)) if klar != null else "-", str(view)]
		await bot._shot(str(pair[0]) + "-175", 0.1)
		report.append("%s: %s (%s)" % [pair[0], "fits" if ok else "DOES NOT FIT", detail])
		all_ok = all_ok and ok
		win.close()
		await bot._wait(0.2)
	Settings.set_ui_scale(was)
	world.get_window().size = win_size
	await bot._wait(0.3)
	bot._step("the forge and the paint windows fit at 175 % text", all_ok and is_equal_approx(Settings.ui_scale, was) and absf(view.size.y - 411.4) < 2.0, "; ".join(report))


## A pad's or a key's action through the viewport (the focus navigation and the controls' own handlers see it as a press and a release).
func _pad(action: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	Input.parse_input_event(ev)
	await bot.get_tree().process_frame
	var up := InputEventAction.new()
	up.action = action
	up.pressed = false
	Input.parse_input_event(up)
	await bot.get_tree().process_frame


## The top-left tile of a run of `n` free grass tiles in a row with free grass above them to stand on (as _find_patch, for a wall).
func _find_row(n: int) -> Dictionary:
	var dist: Dictionary = bot._distance_field(_my_tile())
	var best: Dictionary = {}
	var best_d := 1000
	for t in dist.keys():
		var d: int = dist[t]
		if d > 25 or d >= best_d:
			continue
		var ok := true
		for i in range(n):
			var g: Vector2i = t + Vector2i(i, 1)
			var up: Vector2i = t + Vector2i(i, 0)
			if bot._terrain_at(g) != "grass" or world.hero._is_solid(g.x, g.y) or world.hero.world.get("occupancy", {}).has("%d,%d" % [g.x, g.y]) or bot._near_npc(g) or not dist.has(up):
				ok = false
				break
		if ok:
			best = {"tile": t + Vector2i(0, 1)}
			best_d = d
	return best


## Smedjan: Stina's window has the forge button, the forge window says what the worn weapon gives now and after one more
## level, forging sends `saga forge` and the server's forge level, the bag and the purse change by FORGE_COSTS, the window
## says the new numbers, a third level is out of reach (the rare things are missing: the button is off), a piece I do not
## own is refused with the server's own words, and the starter set Stina smiths for `saga craft` shows up in the bag.
func smedjan() -> void:
	if not await to_village():
		bot._step("Smedjan", false, "not in the village")
		return
	var smith := str(Data.gear.get("smith", "stina"))
	Net.send({"t": "dev", "a": "kit"})
	if not await bot._until(func() -> bool: return model.count_item("stone") >= 20 and _coins() >= 400, 4.0):
		bot._step("Smedjan", false, "the kit never came")
		return
	var weapon := str(Gear.gear_of(model.my_player()).get("weapon", ""))
	if weapon == "":
		bot._step("Smedjan", false, "no weapon worn")
		return
	if not await _talk_to(smith):
		bot._step("Smedjan", false, "could not get Stina's window open")
		return
	await bot._wait(0.3)
	var button := _press(windows.talk, "forge") and await bot._until(func() -> bool: return windows.forge.is_open(), 3.0)
	await bot._wait(0.4)
	await bot._shot("forge", 0.1)
	var forge := windows.forge
	var row: Dictionary = forge.shown.get(weapon, {})
	# the numbers to hold the client to come from the TS forgeStats / gearStats (exported into game.json by export-data.mts), not from the client's own formula
	var samples: Dictionary = Data.gear.get("forgeSamples", {})
	var sample: Array = samples.get(weapon, [])
	var bad_pieces: Array = []
	for id in samples.keys():
		for n in range((samples[id] as Array).size()):
			var want: Dictionary = samples[id][n]
			var got := Gear.forge_stats(str(id), n)
			if absf(float(got["power"]) - float(want["power"])) > 1e-9 or absf(float(got["hp"]) - float(want["hp"])) > 1e-9 or absf(float(got["armor"]) - float(want["armor"])) > 1e-9:
				bad_pieces.append("%s +%d" % [id, n])
	bot._step("the client's forge sums are the TS forgeStats", bad_pieces.is_empty() and not samples.is_empty(), "%d pieces at +0..+5 compared; differing: %s" % [samples.size(), str(bad_pieces)])
	var want_now := "💪 +%d %%" % roundi(float(sample[0]["shown"]) * 100.0) if not sample.is_empty() else "?"
	var want_next := "💪 +%d %%" % roundi(float(sample[1]["shown"]) * 100.0) if not sample.is_empty() else "?"
	bot._step("Stina's forge window", button and not row.is_empty() and int(row.get("level", -1)) == 0 and str(row.get("now", "")) == want_now and str(row.get("next", "")) == want_next and bool(row.get("can", false)), "%s: now '%s', next '%s' (wanted '%s' and '%s'), cost %s" % [weapon, row.get("now", ""), row.get("next", ""), want_now, want_next, row.get("cost", "")])
	var stone := model.count_item("stone")
	var gold := model.count_item("gold")
	var coins := _coins()
	var level1 := _press(forge, "up:" + weapon) and await bot._until(func() -> bool: return Gear.forge_level(model.my_player(), weapon) == 1, 4.0)
	await bot._wait(0.5)
	var paid := model.count_item("stone") == stone - 6 and model.count_item("gold") == gold - 3 and _coins() == coins - 40
	row = forge.shown.get(weapon, {})
	var rows1: Array = (Data.gear.get("heroSamples", {}) as Dictionary).get(str(Gear.level_of(model.my_player())), [])
	var sums1 := not rows1.is_empty() and absf(float(Gear.stats(model.my_player())["power"]) - float(rows1[1]["power"])) < 1e-6
	bot._step("forge +1", level1 and paid and sums1 and int(row.get("level", -1)) == 1 and str(row.get("now", "")) == want_next, "server forge level %d, stone %d -> %d, gold %d -> %d, coins %d -> %d; the window says level %s '%s'" % [Gear.forge_level(model.my_player(), weapon), stone, model.count_item("stone"), gold, model.count_item("gold"), coins, _coins(), row.get("level", "?"), row.get("now", "")])
	var level2 := _press(forge, "up:" + weapon) and await bot._until(func() -> bool: return Gear.forge_level(model.my_player(), weapon) == 2, 4.0)
	await bot._wait(0.5)
	row = forge.shown.get(weapon, {})
	var want_two := "💪 +%d %%" % roundi(float(sample[2]["shown"]) * 100.0) if not sample.is_empty() else "?"
	# what a fight would use: gearStats and the full health of the TS maths for a krigare of my hero level in this gear at forge +2
	var hero_rows: Array = (Data.gear.get("heroSamples", {}) as Dictionary).get(str(Gear.level_of(model.my_player())), [])
	var mine := Gear.stats(model.my_player())
	var sums_ok := not hero_rows.is_empty() and absf(float(mine["power"]) - float(hero_rows[2]["power"])) < 1e-6 and absf(float(mine["hp"]) - float(hero_rows[2]["hp"])) < 1e-6 and absf(float(mine["armor"]) - float(hero_rows[2]["armor"])) < 1e-6 and Gear.max_hp(model.my_player()) == int(hero_rows[2]["max"])
	bot._step("forge +2", level2 and int(row.get("level", -1)) == 2 and str(row.get("now", "")) == want_two and sums_ok, "server forge level 2; the window says '%s' (the TS maths: '%s'); my gear adds up to power %.5f, health %d (the TS gearStats: %s)" % [row.get("now", ""), want_two, float(mine["power"]), Gear.max_hp(model.my_player()), str(hero_rows[2]) if not hero_rows.is_empty() else "none"])
	var off := not bool(row.get("can", true)) and not _press(forge, "up:" + weapon)
	bot._step("level 3 is out of reach", off, "two of the rare things are missing: the button is off (cost %s)" % row.get("cost", ""))
	await bot._shot("forge2", 0.1)
	# the server's own words for a piece I do not own
	var toasts_before: int = bot._report["toasts"].size()
	Net.send({"t": "saga", "a": "forge", "item": "frostbett"})
	var refused := await bot._until(func() -> bool: return bot._report["toasts"].slice(toasts_before).any(func(t: String) -> bool: return t.contains(Data.item_name("frostbett")) and t.contains("inte")), 3.0)
	bot._step("a piece I do not own", refused and Gear.forge_level(model.my_player(), "frostbett") == 0, "refused: %s" % str(bot._report["toasts"].slice(toasts_before)))
	# smithing: a starter piece I do not have
	forge._set_tab("craft")
	await bot._wait(0.3)
	var piece := "jarnsvard"
	var crow: Dictionary = forge.shown.get(piece, {})
	await bot._shot("forge3", 0.1)
	var made := bool(crow.get("can", false)) and _press(forge, "craft:" + piece) and await bot._until(func() -> bool: return model.count_item(piece) > 0, 4.0)
	await bot._wait(0.4)
	crow = forge.shown.get(piece, {})
	bot._step("smith a sword", made and bool(crow.get("owned", false)) and not _press(forge, "craft:" + piece), "%s is in the bag; the window says it is owned and the button is off" % Data.item_name(piece))
	# the gear window shows the forge: the name carries +2 and the stars
	forge.close()
	windows.talk.close()
	bot._press_action("gear")
	await bot._wait(0.4)
	var texts := ""
	for lbl in windows.gear._body.find_children("*", "RichTextLabel", true, false):
		texts += (lbl as RichTextLabel).text + "\n"
	for lbl in windows.gear._body.find_children("*", "Label", true, false):
		texts += (lbl as Label).text + "\n"
	await bot._shot("gear-forged", 0.1)
	bot._step("the gear window shows the forge", texts.contains(Gear.forged_name(weapon, 2)) and texts.contains("★★☆☆☆"), "the name '%s' and the stars are on the gear window" % Gear.forged_name(weapon, 2))
	windows.gear.close()


func bus() -> void:
	if model.my_area_key() != "a:1,0":
		if not await to_village():
			bot._step("the bus", false, "not in the village")
			return
	var coins := _coins()
	if not await _use_object(["bus_stop"], windows.travel):
		bot._step("the bus", false, "the stop did not open the window")
		return
	await bot._wait(0.3)
	await bot._shot("bus", 0.1)
	var left := _press(windows.travel, "go:farm") and await bot._until(func() -> bool: return model.my_area_key() == "farm" and world._area == "farm", 8.0)
	await bot._wait(1.0)
	bot._step("the bus home", left, "from Köpingen to the farm for %d kr: coins %d -> %d" % [int(Data.transport_price.get("bus", 5)), coins, _coins()])
	if not left:
		return
	if not await _use_object(["bus_stop"], windows.travel):
		bot._step("the bus out", false, "the farm's stop did not open the window")
		return
	await bot._wait(0.3)
	var back := _press(windows.travel, "go:a:1,0") and await bot._until(func() -> bool: return model.my_area_key() == "a:1,0" and world._area == "a:1,0", 8.0)
	await bot._wait(1.0)
	bot._step("the bus to the village", back and _coins() == coins - 2 * int(Data.transport_price.get("bus", 5)), "and back to Köpingen: coins %d -> %d" % [coins, _coins()])
