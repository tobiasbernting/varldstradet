class_name WorldView
extends Node3D
## The world on screen: the dungeon you stand in, built from the server's data (dungeon_view.gd), you walking in it
## (hero.gd), everyone else and the monsters interpolated between the server's snapshots (actor.gd), the fight
## (combat.gd for my spells and target, fx_view.gd for everything the server says happened), the HUD (hud.gd), the
## loot window, the chat, the wheels and the pause menu (menu.gd). Every message from the socket goes through the
## world model (world_model.gd), and the view follows its signals. A map the client does not draw yet (the farm,
## the world) shows a notice and the menu's way into Draugkryptan instead.
##
## Demo mode (`--demo` after `--` on the command line, or main.gd's start_demo): the messages recorded in
## assets/fixtures/draug.json are played instead of a socket, so the dungeon can be looked at without a server, and
## the Godot workflow exercises all of this headless. `--bench` and `--bot` are main.gd's (bench.gd, bot.gd).

signal left

## The camera sits here relative to the hero and looks at them (ART.md, "Camera").
const CAMERA_OFFSET := Vector3(0.0, 10.0, 8.0)
const CAMERA_LOOK := Vector3(0.0, 0.8, 0.0)
const PLAYER_JUMP_PX := 64.0
const ANIMAL_JUMP_PX := 48.0
const SHADOW_EVERY := 0.3
const USABLE := {"saga_exit": "actExit", "saga_chest": "actChest", "saga_rest": "actRest", "saga_plate": "actPlate", "saga_gate": "actGate"}

@onready var dungeon: DungeonView = $Dungeon
@onready var actors_root: Node3D = $Actors
@onready var hero: Hero = $Hero
@onready var rig: Node3D = $CameraRig
@onready var camera: Camera3D = $CameraRig/Camera3D

var model := WorldModel.new()
var combat: Combat
var fx: FxView
var hud: HudLayer
var menu: PauseMenu
var loot: LootWindow
var chat: ChatUi
var wheel: Wheel
var demo := false
var _area := "" ## the map drawn right now ("" when none)
var _actors: Dictionary = {} ## "p:<id>" or "a:<id>" -> Actor
var _prev_pos: Dictionary = {} ## actor key -> last scene position (facing from velocity)
var _emote_shown: Dictionary = {} ## player id -> until
var _shadow_in := 0.0
var _screenshot := ""
var _frames := 0
var _rest_glow_in := 0.0
var _hint_for := ""
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	combat = Combat.new(model, hero)
	fx = FxView.new()
	fx.name = "Fx"
	add_child(fx)
	fx.setup(model, _find_actor)
	hud = HudLayer.new()
	add_child(hud)
	menu = PauseMenu.new()
	add_child(menu)
	loot = LootWindow.new()
	add_child(loot)
	chat = ChatUi.new()
	add_child(chat)
	wheel = Wheel.new()
	add_child(wheel)
	hud.menu_asked.connect(menu.open)
	menu.switch_player.connect(func() -> void: left.emit())
	menu.dev_enter.connect(_on_dev_enter)
	menu.fps_toggled.connect(hud.set_fps_shown)
	camera.position = CAMERA_OFFSET
	camera.look_at_from_position(CAMERA_OFFSET, CAMERA_LOOK)
	camera.fov = 40.0
	model.area_changed.connect(_on_area_changed)
	model.object_changed.connect(_on_object_changed)
	model.animal_changed.connect(func(key: String, _id: String, _a: Variant) -> void:
		if key == _area:
			_sync_actors())
	model.player_changed.connect(func(_id: String, _p: Variant) -> void: _sync_actors())
	model.snapshot.connect(_on_snapshot)
	model.warped.connect(_on_warped)
	model.toast.connect(hud.show_toast)
	model.banner.connect(hud.show_banner)
	model.error.connect(hud.show_toast)
	model.change.connect(_on_change)
	combat.target_changed.connect(func(t: Variant) -> void:
		fx.target = t
		if t != null:
			Sfx.play("target"))
	wheel.picked.connect(_on_wheel_pick)
	Net.message.connect(_on_message)
	Net.connection_changed.connect(_on_connection)
	Quality.changed.connect(func(_p: String) -> void: _rebuild())
	_rng.randomize()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--screenshot="):
			_screenshot = arg.substr("--screenshot=".length())


func reset() -> void:
	model.reset()
	_clear_actors()
	dungeon.clear()
	fx.clear()
	combat.reset()
	_area = ""
	hero.reset()
	hero.send_moves = true
	hud.reset()
	chat.reset()
	demo = false


## Plays the recorded messages of assets/fixtures/draug.json instead of a socket.
func start_demo() -> void:
	reset()
	demo = true
	hero.send_moves = false
	hud.set_connection("demo")
	var text := FileAccess.get_file_as_string("res://assets/fixtures/draug.json")
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		push_error("assets/fixtures/draug.json is missing or broken: run `pnpm godot:fixture`")
		return
	for m in parsed.get("messages", []):
		if m is Dictionary:
			model.apply(m)
	# --at=x,y (tiles) after --demo: stand somewhere else, for looking around and for screenshots
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--at="):
			var parts := arg.substr("--at=".length()).split(",")
			if parts.size() == 2 and _area != "":
				var tile := Data.tile()
				hero.place((float(parts[0]) + 0.5) * tile, (float(parts[1]) + 0.5) * tile)
				rig.position = hero.position
	print("demo: %s drawn with %d objects, %d lights and %d actors" % [_area, dungeon.get_node("Objects").get_child_count() if _area != "" else 0, dungeon.light_count(), _actors.size()])


## A message as if from the server (the demo's scripted fight in bench and screenshot runs).
func feed(msg: Dictionary) -> void:
	model.apply(msg)


func _on_message(msg: Dictionary) -> void:
	if not demo:
		model.apply(msg)


func _on_connection(status: String, _close_code: int) -> void:
	if not demo:
		hud.set_connection(status)


# ---------------------------------------------------------------------------
# Keys, buttons and the mouse


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("menu"):
		if combat.live_target() != null and not menu.is_open():
			combat.set_target(null)
		else:
			menu.toggle()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("fps"):
		Settings.show_fps = not Settings.show_fps
		Settings.save()
		hud.set_fps_shown(Settings.show_fps)
		get_viewport().set_input_as_handled()
		return
	if menu.is_open() or chat.is_open() or loot.is_open() or wheel.is_open() or _area == "":
		return
	if event.is_action_pressed("chat"):
		chat.open()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("emote"):
		_open_emotes()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("spell_wheel") and (Settings.spell_input == "wheel" or event is InputEventKey):
		_open_spell_wheel()
		get_viewport().set_input_as_handled()
		return
	var wheel_pad: bool = Settings.spell_input == "wheel" and event is InputEventJoypadButton
	for i in range(4):
		if event.is_action_pressed("spell_%d" % (i + 1)):
			# in wheel mode the pad's fourth button is the wheel's, not a spell's
			if not (wheel_pad and i == 3):
				combat.cast_slot(i)
			get_viewport().set_input_as_handled()
			return
	if event.is_action_pressed("potion"):
		combat.drink_potion()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("target_next"):
		combat.cycle_target()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("act"):
		_act()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# a click on a monster aims at it and, when it is in reach, swings at it (the browser's tap)
		var at := _floor_under_mouse(event.position)
		if at != Vector3.INF and combat.pick_near(Vector2(at.x, at.z) * Data.tile(), 24.0):
			combat.attack_target()
			get_viewport().set_input_as_handled()


## Where a screen point meets the floor (y = 0), or INF.
func _floor_under_mouse(screen: Vector2) -> Vector3:
	var from := camera.project_ray_origin(screen)
	var dir := camera.project_ray_normal(screen)
	if absf(dir.y) < 0.0001:
		return Vector3.INF
	var t := -from.y / dir.y
	return from + dir * t if t > 0.0 else Vector3.INF


## The use key: the way out, a chest, a rest stone, a plate (the server answers); with nothing to use, my everyday
## attack at my target when it is in reach, else `act` on the tile in front (the server swings quietly).
func _act() -> void:
	if demo or _area == "":
		return
	var obj := hero.facing_object()
	var kind := str(obj.get("kind", ""))
	if USABLE.has(kind):
		var t := hero.facing_tile()
		Net.send({"t": "act", "tx": t.x, "ty": t.y})
		return
	if combat.attack_target():
		return
	var t := hero.facing_tile()
	Net.send({"t": "act", "tx": t.x, "ty": t.y})


func _open_emotes() -> void:
	var entries: Array = []
	for id in Strings.list("emotes"):
		entries.append({"id": "emote:" + str(id), "icon": Data.icon("emote_" + str(id)), "name": str(id)})
	wheel.open(Strings.t("emotesTitle"), entries, "")


func _open_spell_wheel() -> void:
	var entries: Array = []
	for id in combat.my_spells():
		entries.append({"id": "spell:" + str(id), "icon": Data.icon("spell_" + str(id)), "name": str(Data.spell(str(id)).get("name", id))})
	if entries.is_empty():
		return
	wheel.open(Strings.t("settingsSpells"), entries, "spell_wheel")


func _on_wheel_pick(id: String) -> void:
	if id.begins_with("emote:"):
		Net.send({"t": "emote", "id": id.substr(6)})
	elif id.begins_with("spell:"):
		combat.cast(id.substr(6))


func _on_dev_enter(dungeon_id: String) -> void:
	if demo:
		hud.show_toast("Demo")
		return
	Net.send({"t": "dev", "a": "saga", "id": dungeon_id})


# ---------------------------------------------------------------------------
# What the model says


func _on_area_changed(_key: String) -> void:
	_rebuild()


func _rebuild() -> void:
	var key := model.my_area_key()
	var id := Data.dungeon_of_key(key)
	_clear_actors()
	fx.clear()
	combat.reset()
	if id == "" or not model.areas.has(key):
		dungeon.clear()
		_area = ""
		hero.set_world({})
		hero.actor.set_pose("")
		var shown := key
		if id != "":
			shown = str(Data.dungeon(id).get("name", key))
		hud.set_area(shown, false)
		hud.build_spell_bar("")
		hud.units.visible = false
		return
	var w: Dictionary = model.areas[key]
	dungeon.build(w, key)
	_area = key
	hero.set_world(w)
	var me := model.my_player()
	hero.place(float(me.get("x", 0)), float(me.get("y", 0)))
	hero.actor.set_sheet(_hero_sheet_of(me))
	hero.actor.set_label(str(me.get("name", "")))
	rig.position = hero.position
	hud.set_area(str(Data.dungeon(id).get("name", key)), true)
	fx.load_area(key)
	fx.warm_up(hero.position)
	hud.build_spell_bar(combat.my_class())
	if _hint_for != key:
		_hint_for = key
		hud.show_hint(Strings.t("sagaTargetHint") + "  ·  " + Strings.t("chatHint"), 10.0)
	_sync_actors()
	_update_hud()


func _on_object_changed(key: String, id: String, obj: Variant) -> void:
	if key == _area:
		dungeon.update_object(id, obj)


func _on_snapshot() -> void:
	if _area == "":
		return
	var snap: Variant = model.player_snaps.get(model.me)
	if snap is Dictionary:
		hero.reconcile(snap)
	_sync_actors()
	_update_hud()


func _on_warped(id: String, x: float, y: float) -> void:
	if id == model.me:
		hero.place(x, y)
	else:
		var actor: Variant = _actors.get("p:" + id)
		if actor is Actor:
			actor.position = _scene_of(x, y)


## Every change from the server: the fight's messages go to the combat rules and the effects, the rest to the HUD.
func _on_change(c: Dictionary) -> void:
	var t := str(c.get("t", ""))
	if t == "chat":
		chat.add_line(c, model.me)
		if not bool(c.get("old", false)):
			var who := str(c.get("from", ""))
			var a: Variant = _find_actor(who)
			if a is Actor:
				(a as Actor).set_bubble(str(c.get("text", "")), null, Data.constant("CHAT_BUBBLE_MS", 6000.0) / 1000.0)
		return
	if _area == "":
		return
	if c.has("area") and str(c.get("area")) != _area:
		return
	combat.on_change(c)
	fx.on_change(c)
	match t:
		"yell":
			hud.show_yell(str(c.get("name", "")), str(c.get("text", "")))
			chat.add_line({"from": "", "name": "⚔️ " + str(c.get("name", "")), "text": str(c.get("text", ""))}, model.me)
		"loot":
			if str(c.get("to", "")) == model.me:
				loot.show_loot(c)
				var names: Array = []
				for it in c.get("items", []):
					names.append(Data.item_name(str(it.get("item", ""))))
				hud.show_toast(Strings.t("sagaLootToast", {"from": str(c.get("from", "")), "items": ", ".join(names)}))


func _hero_sheet_of(p: Dictionary) -> String:
	var cls := str(p.get("saga", {}).get("cls", "krigare")) if p.get("saga") is Dictionary else "krigare"
	var skin := str(p.get("appearance", {}).get("skin", "")) if p.get("appearance") is Dictionary else ""
	return Data.hero_sheet(cls, skin)


func _scene_of(x: float, y: float) -> Vector3:
	var tile := Data.tile()
	return Vector3(x / tile, 0.0, y / tile)


## The actor of a player id (String) or a monster's animal id (int); null when none is drawn.
func _find_actor(id: Variant) -> Variant:
	if id == null:
		return null
	if id is int or id is float:
		return _actors.get("a:" + str(int(id)))
	if str(id) == model.me:
		return hero.actor if _area != "" else null
	return _actors.get("p:" + str(id))


## One actor for every other player on my map and every monster in it; gone ones go.
func _sync_actors() -> void:
	if _area == "":
		return
	var wanted: Dictionary = {}
	for id in model.players().keys():
		if id == model.me:
			continue
		var p: Dictionary = model.players()[id]
		if str(p.get("area", "farm")) != _area:
			continue
		wanted["p:" + id] = p
	var w: Dictionary = model.areas.get(_area, {})
	for id in w.get("animals", {}).keys():
		wanted["a:" + str(id)] = w["animals"][id]
	for k in _actors.keys():
		if not wanted.has(k):
			_actors[k].queue_free()
			_actors.erase(k)
			_prev_pos.erase(k)
	for k in wanted.keys():
		if _actors.has(k):
			continue
		var rec: Dictionary = wanted[k]
		var actor := Actor.new()
		if k.begins_with("p:"):
			actor.set_sheet(_hero_sheet_of(rec))
			actor.set_label(str(rec.get("name", "")))
		else:
			var species := str(rec.get("species", ""))
			actor.set_sheet(Data.mob_sheet(species))
			# dungeon monsters show their own bars instead of the name labels (the browser's ownsLabel)
			actor.set_label("" if not Data.mob(species).is_empty() else str(rec.get("name", Data.mob_name(species))))
		actor.position = _scene_of(float(rec.get("x", 0)), float(rec.get("y", 0)))
		actors_root.add_child(actor)
		_actors[k] = actor


func _update_hud() -> void:
	var me := model.my_player()
	var f := model.my_fighter()
	var cls := combat.my_class()
	var max_hp := float(Data.classes.get(cls, {}).get("hp", 0))
	if f.size() >= 2:
		hud.set_hearts(float(f[0]), float(f[1]))
	else:
		hud.set_hearts(max_hp, max_hp)
	var t: Variant = combat.live_target()
	var rows: Array = []
	var snap := model.my_saga()
	for id in snap.get("f", {}).keys():
		var p: Dictionary = model.players().get(id, {})
		var pf := model.fighter_of(id)
		rows.append({"name": p.get("name", ""), "hp": float(pf[0]) if pf.size() >= 2 else 0.0, "max": float(pf[1]) if pf.size() >= 2 else 0.0, "flags": int(pf[2]) if pf.size() >= 3 else 0, "cls": str(p.get("saga", {}).get("cls", "")) if p.get("saga") is Dictionary else "", "me": id == model.me, "target": t is String and t == id})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a["me"] != b["me"]:
			return a["me"]
		return str(a["name"]) < str(b["name"]))
	hud.set_party(rows)
	hero.speed_mul = _my_speed_mul(f)
	# me and my target
	var b: Variant = snap.get("b")
	var boss_id := int(b.get("id", -1)) if b is Dictionary else -1
	var t_shown: Variant = null if (t == null or (t is int and t == boss_id)) else t
	var t_name := ""
	var t_f: Array = []
	var t_kind := "mob"
	if t_shown is String:
		var p: Dictionary = model.players().get(t_shown, {})
		t_name = str(p.get("name", ""))
		t_f = model.fighter_of(t_shown)
		t_kind = "friend"
	elif t_shown is int:
		var a := combat.animal(t_shown)
		var species := str(a.get("species", ""))
		t_name = str(a.get("name", Data.mob_name(species)))
		var m := model.mob_hp(str(t_shown))
		t_f = [m[0], m[1], 0] if m.size() >= 2 else []
		t_kind = "web" if species == "spindelnat" else ("ice" if Data.is_block(species) else ("boss" if Data.is_boss(species) else "mob"))
	hud.set_units(str(me.get("name", "")), cls, f, t_shown, t_name, t_f, t_kind)
	# the boss
	var boss_species := str(combat.animal(boss_id).get("species", "")) if boss_id >= 0 else ""
	hud.set_boss(b, boss_species, model.mob_hp(str(boss_id)) if boss_id >= 0 else [], model.server_now())
	# fallen, frozen, webbed
	var flags := int(f[2]) if f.size() >= 3 else 0
	var all_down: bool = not snap.get("f", {}).is_empty()
	for id in snap.get("f", {}).keys():
		var pf: Array = snap["f"][id]
		if pf.size() < 3 or (int(pf[2]) & Data.flag("down")) == 0:
			all_down = false
	hud.set_down(flags, all_down, _webbed(model.me), model.server_now())


## sagaSpeed in the browser: fallen or frozen is 0, slowed is SLOW_MUL.
func _my_speed_mul(f: Array) -> float:
	if f.size() < 3:
		return 1.0
	var flags := int(f[2])
	if flags & (Data.flag("down") | Data.flag("frozen")):
		return 0.0
	if flags & Data.flag("slow"):
		return Data.constant("SLOW_MUL", 0.6)
	return 1.0


## The ice block or web holding a frozen friend: the block animal nearest to them (the browser's blockOf).
func _block_of(id: String) -> Dictionary:
	var at: Variant = combat.pos_of(id)
	if at == null:
		return {}
	var best: Dictionary = {}
	var best_d := 2.0 * Data.tile()
	var w: Dictionary = model.areas.get(_area, {})
	for key in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][key]
		if not Data.is_block(str(a.get("species", ""))):
			continue
		var d := Vector2(float(a.get("x", 0)), float(a.get("y", 0))).distance_to(at)
		if d < best_d:
			best_d = d
			best = a
	return best


func _webbed(id: String) -> bool:
	return str(_block_of(id).get("species", "")) == "spindelnat"


func _pose_of(id: String) -> String:
	var pf := model.fighter_of(id)
	if pf.size() < 3:
		return ""
	var flags := int(pf[2])
	if flags & Data.flag("down"):
		return "down"
	if flags & Data.flag("frozen"):
		return "web" if _webbed(id) else "frozen"
	return ""


func _clear_actors() -> void:
	for a in _actors.values():
		a.queue_free()
	_actors = {}
	_prev_pos = {}
	_emote_shown = {}


# ---------------------------------------------------------------------------
# Every frame


func _process(delta: float) -> void:
	if _area == "":
		return
	combat.tick()
	fx.tick(delta)
	hero.actor.animate(hero.facing, hero.moving, delta)
	hero.actor.set_pose(_pose_of(model.me))
	_bubble_of(model.me, hero.actor)
	var k := 1.0 - pow(0.001, delta)
	var w: Dictionary = model.areas.get(_area, {})
	var snap := model.my_saga()
	var boss_id := int(snap.get("b", {}).get("id", -1)) if snap.get("b") is Dictionary else -1
	var t: Variant = combat.live_target()
	var me_pos := hero.position
	for key in _actors.keys():
		var actor: Actor = _actors[key]
		var id: String = key.substr(2)
		var snapshot: Variant
		var rec: Variant
		var jump_px: float
		if key.begins_with("p:"):
			snapshot = model.player_snaps.get(id)
			rec = model.players().get(id)
			jump_px = PLAYER_JUMP_PX
		else:
			snapshot = model.animal_snaps.get(id)
			rec = w.get("animals", {}).get(id)
			jump_px = ANIMAL_JUMP_PX
		if not (rec is Dictionary):
			continue
		if snapshot is Dictionary:
			var target := _scene_of(float(snapshot.get("x", 0)), float(snapshot.get("y", 0)))
			if actor.position.distance_to(target) > jump_px / Data.tile():
				actor.position = target
			else:
				actor.position = actor.position.lerp(target, k)
		# facing from the velocity on screen (a monster has one side view: left or right); the record's when still
		var prev: Vector3 = _prev_pos.get(key, actor.position)
		var vel := (actor.position - prev) / maxf(0.001, delta)
		_prev_pos[key] = actor.position
		var facing := str(rec.get("facing", "down"))
		var moving := bool(rec.get("moving", false))
		if vel.length() > 0.25:
			moving = true
			if absf(vel.x) > absf(vel.z) or key.begins_with("a:"):
				facing = "right" if vel.x > 0.0 else "left"
			else:
				facing = "down" if vel.z > 0.0 else "up"
		elif key.begins_with("a:") and not moving:
			moving = false
		actor.animate(facing, moving, delta)
		if key.begins_with("p:"):
			actor.set_pose(_pose_of(id))
			_bubble_of(id, actor)
			var pf := model.fighter_of(id)
			if pf.size() >= 2 and (int(pf[2]) & Data.flag("down")) == 0:
				var kk := float(pf[0]) / maxf(1.0, float(pf[1]))
				actor.set_health(kk, true, HudLayer.hp_colour(kk))
			else:
				actor.set_health(0.0, false, Color.WHITE)
		else:
			var species := str(rec.get("species", ""))
			var m := model.mob_hp(id)
			var is_target: bool = t is int and t == int(id)
			var block := Data.is_block(species)
			var boss := Data.is_boss(species)
			if int(id) == boss_id:
				actor.set_health(0.0, false, Color.WHITE)
			elif not m.is_empty():
				var kk := float(m[0]) / maxf(1.0, float(m[1]))
				actor.set_health(kk, true, Color(0.6, 0.9, 1.0) if block else (Color(0.95, 0.3, 0.25) if not is_target else Color(1.0, 0.75, 0.3)), str(rec.get("name", Data.mob_name(species))) if (boss or is_target or block) else "")
			elif is_target:
				actor.set_health(1.0, true, Color(1.0, 0.75, 0.3), str(rec.get("name", Data.mob_name(species))))
			else:
				actor.set_health(0.0, false, Color.WHITE)
			actor.set_marker(_chasing_me(actor, vel, moving, species, m, me_pos))
	_update_prompt()
	_rest_glow(delta, snap)
	var shake := fx.shake
	var wobble := Vector3((_rng.randf() - 0.5) * shake * 0.5, (_rng.randf() - 0.5) * shake * 0.3, 0.0) if shake > 0.0 else Vector3.ZERO
	rig.position = rig.position.lerp(hero.position, 1.0 - pow(0.002, delta)) + wobble
	_shadow_in -= delta
	if _shadow_in <= 0.0:
		_shadow_in = SHADOW_EVERY
		dungeon.update_shadows(camera.global_position, Quality.shadow_lights())
	hud.tick_spell_bar(combat, snap.get("b") is Dictionary and snap["b"].get("cast") is Dictionary and bool(snap["b"]["cast"].get("kick", false)))
	_frames += 1
	if _screenshot != "" and _frames == 90:
		var img := get_viewport().get_texture().get_image()
		if img != null:
			img.save_png(_screenshot)
			print("screenshot saved to %s" % _screenshot)
		(get_tree().current_scene as Main).quit_clean()


## Is this monster after me? The server keeps threat to itself, so the client reads it off the screen: a fighting
## monster moving my way, or standing in reach of me and nearer to me than to anyone else.
func _chasing_me(actor: Actor, vel: Vector3, moving: bool, species: String, m: Array, me_pos: Vector3) -> bool:
	if m.is_empty() or Data.is_block(species):
		return false
	var to_me := me_pos - actor.position
	var d := to_me.length()
	if moving and vel.length() > 0.3:
		return d < 14.0 and vel.normalized().dot(to_me.normalized()) > 0.8
	var reach := float(Data.mob(species).get("reach", 1.4))
	if d > reach + 0.9:
		return false
	for key in _actors.keys():
		if key.begins_with("p:") and _actors[key].position.distance_to(actor.position) < d - 0.1:
			return false
	return true


## The chat line or the emote over someone's head.
func _bubble_of(id: String, actor: Actor) -> void:
	var snapshot: Variant = model.player_snaps.get(id)
	if not (snapshot is Dictionary):
		return
	var emote: Variant = snapshot.get("emote")
	if emote is Dictionary:
		var until := float(emote.get("until", 0))
		if until > model.server_now() and float(_emote_shown.get(id, 0.0)) != until:
			_emote_shown[id] = until
			actor.set_bubble("", Data.icon("emote_" + str(emote.get("id", ""))), (until - model.server_now()) / 1000.0)


## "E · Öppna kistan" when something usable is in front of me.
func _update_prompt() -> void:
	if demo:
		return
	var kind := str(hero.facing_object().get("kind", ""))
	if USABLE.has(kind):
		hud.set_prompt("%s · %s" % [Strings.t("actKey"), Strings.t(USABLE[kind])])
	else:
		hud.set_prompt("")


## By a lit rest stone and hurt: the stone's healing shown as sparkles at my feet and a line under the hearts.
func _rest_glow(delta: float, snap: Dictionary) -> void:
	_rest_glow_in -= delta
	if _rest_glow_in > 0.0:
		return
	_rest_glow_in = 0.7
	var f := model.my_fighter()
	if f.size() < 2 or float(f[0]) >= float(f[1]):
		return
	var w: Dictionary = model.areas.get(_area, {})
	var inst: Variant = w.get("saga")
	if not (inst is Dictionary):
		return
	var tile := Data.tile()
	for r in inst.get("rests", []):
		var at := Vector2((float(r.get("x", 0)) + 0.5) * tile, (float(r.get("y", 0)) + 0.5) * tile)
		if at.distance_to(Vector2(hero.px, hero.py)) / tile <= 3.0 and snap.get("m", {}).is_empty():
			fx.sparkle(hero.position)
			hud.show_hint(Strings.t("sagaRestHealing"), 1.2)
			return
