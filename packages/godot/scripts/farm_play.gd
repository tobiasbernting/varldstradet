class_name FarmPlay
extends Node
## Playing the farm: what the keys, the pad and the mouse do out in the world, and the pieces that show it. The server
## does the farming (`act` on a tile, resolved by performAction in shared/src/sim.ts); this sends the intent and draws
## what comes back:
##  - the hotbar (1-8, the shoulder buttons, the mouse wheel), the bag and a chest's window (Q or I, Y on a pad,
##    a click on the held square), the name box for an animal nobody named,
##  - the use key (E, space, A, a click on a tile beside you) with the tile in front outlined and its action in words,
##    the tool swinging, the water splash, hearts, chips and coins from the server's `fx` changes (fx_view.gd),
##  - things on the ground (drops_view.gd), my fishing line (fishing_view.gd) and the "+2 Morot" lines for what came
##    into my bag (pickup_feed.gd),
##  - the pets: X tells them to stay, V whistles (`pets`),
##  - riding: the speed of the mount, and the hero lifted onto it.
## The villagers' windows, the shop, the workbench and the like are M4c's: the server's `open` for them becomes a
## notice that they are not drawn yet.

const ARCH := "saga_portal"
## The objects whose `interact` is safe to ask the server for from here (it answers with changes this client draws).
const INTERACT_OK := ["chest", "water", "feed", "saga", "loot", "fairy", "landmark", "workbench", "cook", "catalogue", "sell", "wardrobe", "pizzeria", "sagaclass", "bus", "train", "sleep", "fardport", "yggdrasil", "runexit"]
const ACT_GAP := 0.16

var view: WorldView
var model: WorldModel
var hero: Hero
var hud: HudLayer
var hotbar: Hotbar
var bag: BagWindow
var namer: NameWindow
var windows: FarmWindows
var feed: PickupFeed
var target: FarmTarget
var drops: DropsView
var fishing: FishingView
var active := false
var _totals: Dictionary = {} ## item -> how many I hold, to tell what came in
var _have_totals := false
var _ride_mul := 1.0
var _riding := false
var _boost_until := 0.0 ## the pizza's speed boost (boostUntil, the server's clock in ms)
var _lifted := false
var _act_at := 0.0
var _last_text := "\u0001"
var _last_busy := false
var _last_can := false
var _wheel_at := 0.0
var _sleeping := false
var _sleep: CanvasLayer


func setup(v: WorldView) -> void:
	view = v
	model = v.model
	hero = v.hero
	hud = v.hud
	hotbar = Hotbar.new()
	hud.add_child(hotbar)
	hotbar.picked.connect(select_slot)
	hotbar.bag_asked.connect(open_bag)
	feed = PickupFeed.new()
	hud.add_child(feed)
	bag = BagWindow.new()
	bag.model = model
	bag.hero = hero
	v.add_child(bag)
	namer = NameWindow.new()
	v.add_child(namer)
	windows = FarmWindows.new()
	v.add_child(windows)
	windows.setup(v)
	target = FarmTarget.new()
	target.model = model
	target.hero = hero
	v.add_child(target)
	drops = DropsView.new()
	v.add_child(drops)
	fishing = FishingView.new()
	fishing.model = model
	fishing.hero = hero
	v.add_child(fishing)
	_sleep = CanvasLayer.new()
	_sleep.layer = 7
	_sleep.visible = false
	v.add_child(_sleep)
	var night := ColorRect.new()
	night.anchor_right = 1.0
	night.anchor_bottom = 1.0
	night.color = Color(0.02, 0.03, 0.1, 0.8)
	night.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sleep.add_child(night)
	var zzz := Label.new()
	zzz.text = "💤  " + Strings.t("sleepHint")
	zzz.anchor_left = 0.0
	zzz.anchor_right = 1.0
	zzz.anchor_top = 0.45
	zzz.anchor_bottom = 0.55
	zzz.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	zzz.add_theme_font_size_override("font_size", 30)
	zzz.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sleep.add_child(zzz)
	model.drop_changed.connect(func(k: String, id: String, d: Variant) -> void:
		if active and k == view._area:
			drops.update_drop(id, d))
	model.object_changed.connect(func(_k: String, _id: String, _o: Variant) -> void: bag.refresh())
	model.player_changed.connect(_on_player_changed)


func is_busy() -> bool:
	return bag.is_open() or namer.is_open() or windows.is_busy() or Voice.window_open()


## An outdoor map was drawn.
func enter(w: Dictionary) -> void:
	active = true
	drops.build(w)
	hotbar.visible = true
	_have_totals = false
	feed.clear()
	_refresh_inventory()
	_totals = _totals_of(model.my_player())
	_have_totals = true
	for arg in OS.get_cmdline_user_args():
		if arg == "--bag" and view.demo:
			open_bag.call_deferred()
		elif arg == "--bag=chest" and view.demo:
			bag.pinned = true # (a picture: the bag with a chest beside it, the biggest window; the demo has no chest to stay near)
			open_bag.call_deferred(0)


## The map is something else (a dungeon, or nothing).
func leave() -> void:
	active = false
	_riding = false
	_ride_mul = 1.0
	_boost_until = 0.0
	# (a dungeon entered from horseback: the hero runs there, and the rule of the pad's B is the dungeon's)
	hero.riding = false
	hero.boosted = false
	hero.speed_mul = 1.0
	_last_text = "\u0001"
	hotbar.visible = false
	target.visible = false
	fishing.visible = false
	drops.clear()
	bag.close()
	namer.close()
	windows.close_all()
	_sleeping = false
	_sleep.visible = false
	hero.frozen = false
	if _lifted:
		hero.actor.position.y = 0.0
		_lifted = false
	_ride_mul = 1.0


# ---------------------------------------------------------------------------
# Keys, buttons and the mouse (called first by the view while an outdoor map is up)


## True when the event was used here.
func handle_input(event: InputEvent) -> bool:
	if not active or is_busy():
		return false
	if event.is_action_pressed("bag"):
		open_bag()
		return true
	if event.is_action_pressed("gear"):
		windows.toggle_gear()
		return true
	if event.is_action_pressed("quests"):
		windows.toggle_quests()
		return true
	if event is InputEventKey and event.pressed and not event.echo:
		var code: int = event.physical_keycode
		if code >= KEY_1 and code <= KEY_8:
			select_slot(code - KEY_1)
			return true
	if event.is_action_pressed("slot_next"):
		_cycle(1)
		return true
	if event.is_action_pressed("slot_prev"):
		_cycle(-1)
		return true
	if event is InputEventMouseButton and event.pressed:
		var now := Time.get_ticks_msec() / 1000.0
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN or event.button_index == MOUSE_BUTTON_WHEEL_UP:
			if now - _wheel_at > 0.08:
				_wheel_at = now
				_cycle(1 if event.button_index == MOUSE_BUTTON_WHEEL_DOWN else -1)
			return true
		if event.button_index == MOUSE_BUTTON_LEFT:
			return _click(event.position)
	if event.is_action_pressed("pets_stay"):
		Net.send({"t": "pets", "cmd": "stay"})
		return true
	if event.is_action_pressed("pets_come"):
		Net.send({"t": "pets", "cmd": "come"})
		return true
	if event.is_action_pressed("act"):
		act()
		return true
	return false


func _cycle(d: int) -> void:
	var n := int(Data.constant("HOTBAR_SIZE", 8.0))
	var sel := int(model.my_player().get("selected", 0))
	select_slot(posmod(sel + d, n))


func select_slot(i: int) -> void:
	var me := model.my_player()
	if me.is_empty() or int(me.get("selected", 0)) == i:
		return
	me["selected"] = i
	Net.send({"t": "select", "slot": i})
	_refresh_inventory()
	Sfx.play("target")


func open_bag(chest_id := -1) -> void:
	if not active or model.my_player().is_empty():
		return
	bag.open_bag(chest_id)


## The use key: the tile in front of me.
func act() -> void:
	if view.demo or not active or is_busy():
		return
	_act_on(hero.facing_tile())


func _click(screen: Vector2) -> bool:
	var at := view._floor_under_mouse(screen)
	if at == Vector3.INF or view.demo:
		return false
	var tx := floori(at.x)
	var ty := floori(at.z)
	var tile := Data.tile()
	var hx := floori(hero.px / tile)
	var hy := floori(hero.py / tile)
	if absi(tx - hx) > 1 or absi(ty - hy) > 1 or (tx == hx and ty == hy):
		return false
	if tx != hx or ty != hy:
		hero.facing = ("right" if tx > hx else "left") if absi(tx - hx) >= absi(ty - hy) else ("down" if ty > hy else "up")
	_act_on(Vector2i(tx, ty))
	return true


func _act_on(t: Vector2i) -> void:
	var now := Time.get_ticks_msec() / 1000.0
	if now - _act_at < ACT_GAP:
		return
	_act_at = now
	var oid: Variant = hero.world.get("occupancy", {}).get("%d,%d" % [t.x, t.y])
	if oid != null:
		var obj: Variant = hero.world.get("objects", {}).get(str(int(oid)))
		if obj is Dictionary:
			var kind := str(obj.get("kind", ""))
			var inter := str(Data.object_def(kind).get("interact", ""))
			if kind != ARCH and inter != "" and not INTERACT_OK.has(inter):
				# a window or a place the new client does not have yet (M4c, or the caves and the bus later)
				hud.show_toast(Strings.t("notDrawnBus") if inter == "bus" else Strings.t("notDrawnThing", {"name": Strings.object_name(kind)}))
				return
	fishing.cast_tile = t
	Net.send({"t": "act", "tx": t.x, "ty": t.y})
	var held := model.held()
	var id := str(held.get("item", ""))
	if id != "" and not _riding and (Data.item_tool(id) != "" or Data.item_category(id) == "seed"):
		hero.actor.swing(Data.item_icon(id), hero.facing)
		Sfx.play("cast" if Data.item_tool(id) == "rod" else "swing")


# ---------------------------------------------------------------------------
# What the model says


func on_change(c: Dictionary) -> void:
	if str(c.get("t", "")) != "open" or str(c.get("to", "")) != model.me:
		return
	var ui := str(c.get("ui", ""))
	if windows.on_open(c):
		return
	match ui:
		"chest":
			open_bag(int(c.get("id", -1)))
		"nameAnimal":
			var a: Variant = hero.world.get("animals", {}).get(str(int(c.get("id", -1))))
			if a is Dictionary:
				namer.open_for(int(a.get("id", -1)), str(a.get("species", "")), str(a.get("name", "")))
		_:
			hud.show_toast(Strings.t("notDrawnThing", {"name": Strings.t(ui)}))


func _on_player_changed(id: String, rec: Variant) -> void:
	if id != model.me or not (rec is Dictionary) or not active:
		return
	_refresh_inventory()
	bag.refresh()
	windows.refresh()
	_sleeping = bool(rec.get("sleeping", false))
	_sleep.visible = _sleeping
	# riding: the mount's speed (a horse has no speed of its own: RIDE_SPEED_MUL)
	_ride_mul = 1.0
	_boost_until = float(rec.get("boostUntil", 0.0))
	var riding: Variant = rec.get("riding")
	_riding = riding != null
	if riding != null:
		var a: Variant = hero.world.get("animals", {}).get(str(int(riding)))
		var def: Dictionary = Data.animals.get(str(a.get("species", "")), {}) if a is Dictionary else {}
		_ride_mul = float(def.get("mount", Data.constant("RIDE_SPEED_MUL", 1.8)))
	# what came into the bag
	var totals := _totals_of(rec)
	if _have_totals:
		for item in totals.keys():
			var gain: int = int(totals[item]) - int(_totals.get(item, 0))
			if gain > 0:
				feed.add(str(item), gain)
				Sfx.play("pick")
	_totals = totals
	_have_totals = true


static func _totals_of(rec: Dictionary) -> Dictionary:
	var t: Dictionary = {}
	for st in rec.get("inventory", []):
		if st is Dictionary:
			var item := str(st.get("item", ""))
			t[item] = int(t.get(item, 0)) + int(st.get("count", 1))
	return t


func _refresh_inventory() -> void:
	var me := model.my_player()
	hotbar.show_inventory(me.get("inventory", []), int(me.get("selected", 0)))


# ---------------------------------------------------------------------------
# Every frame


func tick(delta: float) -> void:
	if not active:
		return
	hero.frozen = is_busy() or _sleeping
	hero.speed_mul = _ride_mul * (Data.constant("BOOST_SPEED_MUL", 1.3) if _boost_until > model.server_now() else 1.0)
	hero.riding = _riding
	hero.boosted = _boost_until > model.server_now()
	hero.fight = false
	if _riding != _lifted:
		_lifted = _riding
		hero.actor.position.y = 0.32 if _riding else 0.0
	drops.tick(delta)
	target.tick(delta)
	fishing.tick(delta)
	# the prompt is rebuilt only when what it says changed (no strings made every frame)
	var busy := is_busy()
	if not view.demo and (target.text != _last_text or busy != _last_busy or target.can != _last_can):
		_last_text = target.text
		_last_busy = busy
		_last_can = target.can
		hud.set_prompt(("%s · %s" % [Strings.t("actKey"), target.text] if target.can else target.text) if target.text != "" and not busy else "")
