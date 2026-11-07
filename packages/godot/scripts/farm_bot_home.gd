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


## The paint screen and the paint buckets: a paper used on empty ground opens the screen; a drawing made with the mouse's own call, the
## keyboard's and the pad's (the canvas's input events) and the fill goes to the server, which turns the paper into a painted tavla;
## hung up, its picture frame shows exactly the server's cells (the frame's texture is compared cell by cell with the painting's
## `data` in the world); a bucket of paint on a wall piece and on the farmhouse sets the server's `variant`, and what is drawn is the
## mesh in that colour.
func paint() -> void:
	if model.my_area_key() != "farm":
		bot._step("paint", false, "not on the farm")
		return
	Net.send({"t": "dev", "a": "kit"})
	if not await bot._until(func() -> bool: return model.count_item("paper") >= 2 and model.count_item("paint_red") >= 2 and model.count_item("wall_wood") >= 1, 4.0):
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
	# drawing: the mouse (a press on a cell), the keyboard / pad (the cursor and the accept key), the fill tool and the eraser
	var cell := canvas.cell
	_press(win, "c:2")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(cell * 3.5, cell * 3.5)
	canvas._gui_input(click)
	click.pressed = false
	canvas._gui_input(click)
	var drag := InputEventMouseButton.new()
	drag.button_index = MOUSE_BUTTON_LEFT
	drag.pressed = true
	drag.position = Vector2(cell * 5.5, cell * 3.5)
	canvas._gui_input(drag)
	var move := InputEventMouseMotion.new()
	move.position = Vector2(cell * 9.5, cell * 3.5)
	move.button_mask = MOUSE_BUTTON_MASK_LEFT
	canvas._gui_input(move)
	drag.pressed = false
	canvas._gui_input(drag)
	var mouse_ok: bool = canvas.cells[3 * 16 + 3] == "2" and canvas.cells[3 * 16 + 7] == "2" and canvas.cells[3 * 16 + 9] == "2"
	_press(win, "c:7")
	canvas.cursor = Vector2i(2, 8)
	for dir in ["ui_right", "ui_right", "ui_down"]:
		var key := InputEventAction.new()
		key.action = dir
		key.pressed = true
		canvas._gui_input(key)
	var accept := InputEventAction.new()
	accept.action = "ui_accept"
	accept.pressed = true
	canvas._gui_input(accept)
	var pad_ok: bool = canvas.cursor == Vector2i(4, 9) and canvas.cells[9 * 16 + 4] == "7"
	_press(win, "tool:fill")
	canvas.cursor = Vector2i(12, 12)
	canvas._gui_input(accept)
	var filled: bool = canvas.cells[0] == "7" and canvas.cells[15 * 16 + 15] == "7" and canvas.cells[3 * 16 + 3] == "2"
	_press(win, "tool:eraser")
	canvas.cursor = Vector2i(0, 0)
	canvas._gui_input(accept)
	var erased: bool = canvas.cells[0] == "."
	_press(win, "tool:brush")
	await bot._wait(0.3)
	await bot._shot("paint", 0.1)
	bot._step("draw with the mouse, the keys and the fill", mouse_ok and pad_ok and filled and erased, "mouse %s, keyboard %s, fill %s, eraser %s" % [str(mouse_ok), str(pad_ok), str(filled), str(erased)])
	var drawing: String = canvas.pixels()
	var done := _press(win, "ok") and await bot._until(func() -> bool: return model.count_item("paper") == papers - 1 and model.count_item("painting") == 1, 4.0)
	var stack_data := ""
	for st in model.my_player().get("inventory", []):
		if st is Dictionary and str(st.get("item", "")) == "painting":
			stack_data = str(st.get("data", ""))
	bot._step("the painting reaches the bag", done and stack_data == drawing and not win.is_open(), "one paper became a tavla; the server kept my %d cells exactly (%s)" % [drawing.length(), str(stack_data == drawing)])
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
	# a wall piece, coloured with the bucket
	var spot3 := bot._find_patch()
	if spot3.is_empty() or not await bot._goto(spot3["stand"]):
		bot._step("paint a wall", false, "no free grass")
		return
	bot._face("down")
	await bot._use_item_slot("wall_wood")
	await bot._act()
	var wtile: Vector2i = spot3["tile"]
	var wall_up := await bot._until(func() -> bool: return str(_object_at(wtile).get("kind", "")) == "wall_wood", 4.0)
	await bot._wait(0.4)
	var wid := str(int(_object_at(wtile).get("id", -1)))
	var plain_mesh := world.farm.mesh_name_of(wid)
	await bot._use_item_slot("paint_red")
	await bot._act()
	var wall_painted := await bot._until(func() -> bool: return int(_object_at(wtile).get("variant", 0)) == 1, 4.0)
	await bot._wait(0.6)
	var wall_mesh := world.farm.mesh_name_of(wid)
	var wcol: Color = world.farm.assets.mesh(wall_mesh).surface_get_arrays(0)[Mesh.ARRAY_COLOR][0] if wall_mesh != "" else Color.BLACK
	bot._step("a painted wall is drawn painted", wall_up and wall_painted and plain_mesh == "wall_wood" and wall_mesh == "paint:wall_wood:%d" % int(_object_at(wtile).get("variant", 0)) and wcol.r > wcol.g * 1.5, "the server's variant is %d; the wall's mesh went from '%s' to '%s' (red %s)" % [int(_object_at(wtile).get("variant", 0)), plain_mesh, wall_mesh, str(wcol.r > wcol.g * 1.5)])
	await bot._shot("wall-painted", 0.3)
	# the farmhouse
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
	bot._step("the painted house is drawn painted", house_painted and house_before == "house" and house_after == "paint:house:1", "the farmhouse's mesh went from '%s' to '%s'" % [house_before, house_after])
	await bot._shot("house-painted", 0.3)


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
	var d := Data.item(weapon)
	var base_power := float((d.get("stats", {}) as Dictionary).get("power", 0.0))
	var rp := float((Data.gear.get("rarityPower", {}) as Dictionary).get(str(d.get("rarity", "common")), 1.0))
	var want_now := "💪 +%d %%" % roundi((rp * (1.0 + base_power) - 1.0) * 100.0)
	var want_next := "💪 +%d %%" % roundi((rp * (1.0 + base_power + 0.06) - 1.0) * 100.0)
	bot._step("Stina's forge window", button and not row.is_empty() and int(row.get("level", -1)) == 0 and str(row.get("now", "")) == want_now and str(row.get("next", "")) == want_next and bool(row.get("can", false)), "%s: now '%s', next '%s' (wanted '%s' and '%s'), cost %s" % [weapon, row.get("now", ""), row.get("next", ""), want_now, want_next, row.get("cost", "")])
	var stone := model.count_item("stone")
	var gold := model.count_item("gold")
	var coins := _coins()
	var level1 := _press(forge, "up:" + weapon) and await bot._until(func() -> bool: return Gear.forge_level(model.my_player(), weapon) == 1, 4.0)
	await bot._wait(0.5)
	var paid := model.count_item("stone") == stone - 6 and model.count_item("gold") == gold - 3 and _coins() == coins - 40
	row = forge.shown.get(weapon, {})
	bot._step("forge +1", level1 and paid and int(row.get("level", -1)) == 1 and str(row.get("now", "")) == want_next, "server forge level %d, stone %d -> %d, gold %d -> %d, coins %d -> %d; the window says level %s '%s'" % [Gear.forge_level(model.my_player(), weapon), stone, model.count_item("stone"), gold, model.count_item("gold"), coins, _coins(), row.get("level", "?"), row.get("now", "")])
	var level2 := _press(forge, "up:" + weapon) and await bot._until(func() -> bool: return Gear.forge_level(model.my_player(), weapon) == 2, 4.0)
	await bot._wait(0.5)
	row = forge.shown.get(weapon, {})
	var want_two := "💪 +%d %%" % roundi((rp * (1.0 + base_power + 0.12) - 1.0) * 100.0)
	bot._step("forge +2", level2 and int(row.get("level", -1)) == 2 and str(row.get("now", "")) == want_two and Gear.stats(model.my_player())["power"] > 1.0, "server forge level 2; the window says '%s' (wanted '%s')" % [row.get("now", ""), want_two])
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
