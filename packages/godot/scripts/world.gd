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
## Inside the farmhouse the camera stands higher over the hero and nearer, looking down steeper (the same distance in the
## same direction would put it among the crowns of the trees behind the room's south wall).
const INSIDE_OFFSET := Vector3(0.0, 9.6, 5.2)
const USABLE := {"saga_exit": "actExit", "saga_chest": "actChest", "saga_rest": "actRest", "saga_plate": "actPlate", "saga_gate": "actGate", "run_exit": "actRunExit"}
## Outdoors only the dungeons' arches work yet; the other things you can use say so (M4b and M4c make them work).
const ARCH := "saga_portal"

@onready var dungeon: DungeonView = $Dungeon
@onready var farm: FarmView = $Farm
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
var run_hud: RunHud
var run_pick: RunPick
var run_end: RunEnd
var wheel: Wheel
var play: FarmPlay
var demo := false
var looks: LookComposer
## The 3D trial: `--people3d` gives people and creatures 3D bodies: players and villagers as chibi figures put
## together from KayKit Adventurers parts and dressed in their look (figure_3d.gd), animals and monsters as voxel
## bodies extruded from their own sprites (voxel_body.gd), instead of pixel sprites. Vehicles stay billboards.
const VEHICLES: Array[String] = ["bus", "car", "train", "motorcycle"]
var _people3d := OS.get_cmdline_user_args().has("--people3d")
var _mode := "" ## "dungeon", "outdoor" (the farm and the wild maps) or "" (nothing drawn)
var _demo_time := -1.0 ## --time=<0..1>: a fixed time of day for pictures
var _demo_rain := false
var _lapse := 0.0 ## --daylapse=<s>: a whole day in that many real seconds (demo only)
var _weathers := PackedStringArray() ## --weathers=sun,rain,...: the demo steps through them every --weather-every seconds
var _weather_every := 20.0
var _weather_i := 0
var _weather_t := 0.0
var _lantern: OmniLight3D ## the hero's lantern outdoors after dark (the browser's: "a lantern only outdoors after dark")
var _lantern_glow: MeshInstance3D
var grade := ScreenGrade.new() ## the last pass over the 3D picture (under the HUD)
var _area := "" ## the map drawn right now ("" when none)
var _actors: Dictionary = {} ## "p:<id>" or "a:<id>" -> Actor
var _prev_pos: Dictionary = {} ## actor key -> last scene position (facing from velocity)
var _emote_shown: Dictionary = {} ## player id -> until
var _shadow_in := 0.0
var _screenshot := ""
var _frames := 0
var _rest_glow_in := 0.0
var _cam_k := 0.0 ## 0 outdoors, 1 inside the farmhouse: how far the camera has moved to its closer, steeper place
var _hint_for := ""
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	looks = LookComposer.new()
	combat = Combat.new(model, hero)
	fx = FxView.new()
	fx.name = "Fx"
	add_child(fx)
	fx.setup(model, _find_actor)
	add_child(grade)
	hud = HudLayer.new()
	add_child(hud)
	run_hud = RunHud.new()
	run_hud.model = model
	add_child(run_hud)
	run_pick = RunPick.new()
	run_pick.model = model
	add_child(run_pick)
	run_end = RunEnd.new()
	run_end.model = model
	add_child(run_end)
	menu = PauseMenu.new()
	add_child(menu)
	loot = LootWindow.new()
	add_child(loot)
	chat = ChatUi.new()
	add_child(chat)
	wheel = Wheel.new()
	add_child(wheel)
	play = FarmPlay.new()
	add_child(play)
	play.setup(self)
	_make_lantern()
	hud.menu_asked.connect(menu.open)
	menu.switch_player.connect(func() -> void: left.emit())
	menu.dev_enter.connect(_on_dev_enter)
	menu.fps_toggled.connect(hud.set_fps_shown)
	menu.window_asked.connect(func(which: String) -> void:
		if _mode == "outdoor" and not demo:
			play.windows.toggle_gear() if which == "gear" else play.windows.toggle_quests())
	camera.position = CAMERA_OFFSET
	camera.look_at_from_position(CAMERA_OFFSET, CAMERA_LOOK)
	camera.fov = 40.0
	model.area_changed.connect(_on_area_changed)
	model.object_changed.connect(_on_object_changed)
	model.terrain_changed.connect(func(k: String, x: int, y: int) -> void:
		if k == _area and _mode == "outdoor":
			farm.update_terrain(x, y))
	model.crop_changed.connect(func(k: String, ck: String, crop: Variant) -> void:
		if k == _area and _mode == "outdoor":
			farm.update_crop(ck, crop))
	hero.travel_asked.connect(_on_travel_asked)
	model.animal_changed.connect(func(key: String, _id: String, _a: Variant) -> void:
		if key == _area:
			_sync_actors())
	model.player_changed.connect(func(id: String, _p: Variant) -> void:
		_sync_actors()
		if id == model.me and _area != "":
			_update_hud())
	model.snapshot.connect(_on_snapshot)
	model.run_changed.connect(_on_run_changed)
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
	farm.clear()
	fx.clear()
	combat.reset()
	_area = ""
	_mode = ""
	hero.reset()
	hero.send_moves = true
	play.leave()
	hud.reset()
	chat.reset()
	demo = false


## Plays the recorded messages of assets/fixtures/draug.json instead of a socket.
func start_demo(fixture := "draug") -> void:
	reset()
	demo = true
	# `--demo=house` is the farm with me standing in the farmhouse's room (the camera closes in there)
	var house := fixture == "house"
	if house:
		fixture = "farm"
	hero.send_moves = false
	hud.set_connection("demo")
	var text := FileAccess.get_file_as_string("res://assets/fixtures/%s.json" % fixture)
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		push_error("assets/fixtures/%s.json is missing or broken: run `pnpm godot:fixture`" % fixture)
		return
	for m in parsed.get("messages", []):
		if m is Dictionary:
			model.apply(m)
	# --time=0.7 (a fraction of the day), --weather=rain, --season=jul: a fixed sky, for pictures
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--time="):
			_demo_time = float(arg.substr(7))
		elif arg.begins_with("--weather="):
			model.weather = {"kind": arg.substr(10), "since": model.server_now() - 60000.0, "until": model.server_now() + 600000.0}
		elif arg.begins_with("--season="):
			model.season = arg.substr(9)
		elif arg.begins_with("--daylapse="):
			_lapse = maxf(float(arg.substr(11)), 1.0)
			if _demo_time < 0.0:
				_demo_time = fposmod(model.time_ms / Data.constant("DAY_LENGTH_MS", 600000.0), 1.0)
		elif arg.begins_with("--weathers="):
			_weathers = arg.substr(11).split(",", false)
		elif arg.begins_with("--weather-every="):
			_weather_every = maxf(float(arg.substr(16)), 1.0)
	if _weathers.size() > 0:
		model.weather = {"kind": _weathers[0], "since": model.server_now() - 60000.0, "until": model.server_now() + 600000.0}
	# --at=x,y (tiles) after --demo: stand somewhere else, for looking around and for screenshots
	if house and _area != "":
		var tile_px := Data.tile()
		hero.place(57.5 * tile_px, 58.5 * tile_px)
		rig.position = hero.position
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--at="):
			var parts := arg.substr("--at=".length()).split(",")
			if parts.size() == 2 and _area != "":
				var tile := Data.tile()
				hero.place((float(parts[0]) + 0.5) * tile, (float(parts[1]) + 0.5) * tile)
				rig.position = hero.position
	print("demo: %s drawn (%s) with %d objects, %d lights and %d actors" % [_area, _mode, (farm.object_count() if _mode == "outdoor" else (dungeon.get_node("Objects").get_child_count() if _area != "" else 0)), (farm.light_count() if _mode == "outdoor" else dungeon.light_count()), _actors.size()])


## The hero's lantern: a warm light that follows them outdoors after dark so the wild stays readable near them. No shadow
## (a budget), no lantern for the other players. Off by day, indoors and in dungeons (`_light_lantern`).
func _make_lantern() -> void:
	_lantern = OmniLight3D.new()
	_lantern.name = "Lantern"
	_lantern.light_color = Color(1.0, 0.78, 0.5)
	_lantern.omni_range = 5.5
	_lantern.omni_attenuation = 1.1
	_lantern.shadow_enabled = false
	_lantern.position = Vector3(0.3, 1.0, 0.3)
	_lantern.visible = false
	hero.add_child(_lantern)
	_lantern_glow = farm.assets.glow_quad(Color(1.0, 0.78, 0.5), 0.9, 0.0)
	_lantern_glow.position = Vector3(0.3, 0.9, 0.35)
	_lantern_glow.rotation_degrees = Vector3(-51.0, 0.0, 0.0)
	_lantern_glow.visible = false
	hero.add_child(_lantern_glow)


func _light_lantern(dark: float, open: float) -> void:
	var k := smoothstep(0.45, 0.8, dark) * open
	_lantern.visible = k > 0.01
	_lantern.light_energy = 1.5 * k * (0.94 + 0.06 * sin(Time.get_ticks_msec() * 0.011))
	_lantern_glow.visible = k > 0.01
	(_lantern_glow.material_override as ShaderMaterial).set_shader_parameter("energy", 0.8 * k)


## A message as if from the server (the demo's scripted fight in bench and screenshot runs).
func feed(msg: Dictionary) -> void:
	model.apply(msg)


func _on_message(msg: Dictionary) -> void:
	if not demo:
		model.apply(msg)
		if str(msg.get("t", "")) == "welcome":
			# a run may be going and the shoot has my sagafrön: ask (the server answers with changes)
			Net.send({"t": "run", "a": "state"})
			Net.send({"t": "seed", "a": "state"})


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
	if menu.is_open() or chat.is_open() or loot.is_open() or wheel.is_open() or run_pick.is_open() or _area == "" or play.is_busy():
		return
	if event.is_action_pressed("chat"):
		chat.open()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("emote"):
		_open_emotes()
		get_viewport().set_input_as_handled()
		return
	# out in the world the hotbar, the bag, the pets, the use key and a click on a tile are the farm's (farm_play.gd)
	if _mode == "outdoor" and play.handle_input(event):
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
	if _mode == "outdoor":
		_act_outdoors(obj, kind)
		return
	# a run's way on is a flat rune disc: standing on it counts as facing it
	var exit_here := _run_exit_here()
	if not exit_here.is_empty():
		Net.send({"t": "act", "tx": int(exit_here.get("x", 0)), "ty": int(exit_here.get("y", 0))})
		return
	if USABLE.has(kind):
		var t := hero.facing_tile()
		Net.send({"t": "act", "tx": t.x, "ty": t.y})
		return
	if combat.attack_target():
		return
	var t := hero.facing_tile()
	Net.send({"t": "act", "tx": t.x, "ty": t.y})


## The use key out in the world (farm_play.gd): the tile in front of me; a dungeon's arch goes in as the server does
## for the browser, a window the new client does not have yet says so.
func _act_outdoors(_obj: Dictionary, _kind: String) -> void:
	play.act()


## The run's exit I stand on or face ({} when none).
func _run_exit_here() -> Dictionary:
	if _mode != "dungeon" or not Data.is_run_key(_area):
		return {}
	var tile := Data.tile()
	var tx := floori(hero.px / tile)
	var ty := floori(hero.py / tile)
	var id: Variant = hero.world.get("occupancy", {}).get("%d,%d" % [tx, ty])
	if id != null:
		var o: Variant = hero.world.get("objects", {}).get(str(int(id)))
		if o is Dictionary and str(o.get("kind", "")) == "run_exit":
			return o
	var f := hero.facing_object()
	return f if str(f.get("kind", "")) == "run_exit" else {}


func _arch_name(obj: Dictionary) -> String:
	var ids := Data.dungeons.keys()
	var v := int(obj.get("variant", 0))
	return str(Data.dungeon(str(ids[v])).get("name", "")) if v >= 0 and v < ids.size() else ""


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


func is_outdoor() -> bool:
	return _mode == "outdoor"


func _is_outdoor_key(key: String) -> bool:
	return key == "farm" or key.begins_with("a:")


func _clear_views() -> void:
	dungeon.clear()
	farm.clear()
	_mode = ""


func _rebuild() -> void:
	play.leave()
	var key := model.my_area_key()
	var id := Data.dungeon_of_key(key)
	var is_zone := Data.is_run_key(key)
	_clear_actors()
	fx.clear()
	combat.reset()
	var w := model.world_for(key)
	var outdoor: bool = id == "" and _is_outdoor_key(key) and w.get("terrain", []).size() > 0
	if not outdoor and ((id == "" and not is_zone) or not model.areas.has(key)):
		_clear_views()
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
	var me := model.my_player()
	if outdoor:
		_clear_views()
		farm.build(w, key)
		farm.sky.follow(rig)
		_mode = "outdoor"
		_area = key
		fx.area = key
		fx.me_id = model.me
		hero.set_world(w, true)
		play.enter(w)
		hud.set_area(_place_name(key, w), true)
		hud.build_spell_bar("")
		hud.units.visible = false
	else:
		w = model.areas[key]
		_clear_views()
		var look: Dictionary = {}
		if is_zone:
			look = Data.zone_look(key, model.run, w)
		dungeon.build(w, key, look)
		_mode = "dungeon"
		_area = key
		hud.farm_box.visible = false
		hero.set_world(w)
		hud.set_area(str(look.get("name", key)) if is_zone else str(Data.dungeon(id).get("name", key)), true)
		if is_zone:
			dungeon.set_weather(_zone_weather())
		fx.load_area(key)
	hero.place(float(me.get("x", 0)), float(me.get("y", 0)))
	_dress_hero(me)
	hero.actor.set_label(str(me.get("name", "")))
	rig.position = hero.position
	if _mode == "dungeon":
		fx.warm_up(hero.position)
		hud.build_spell_bar(combat.my_class())
		if _hint_for != key:
			_hint_for = key
			hud.show_hint(Strings.t("sagaTargetHint") + "  ·  " + Strings.t("chatHint"), 10.0)
	_sync_actors()
	_update_hud()


## The weather of the map the run is on now ("" when the snapshot has not come).
func _zone_weather() -> String:
	return str(model.run.get("weather", "")) if model.run is Dictionary else ""


## The run snapshot came or changed: a zone drawn before it arrived is redrawn with its right look; its weather follows.
func _on_run_changed() -> void:
	if _mode == "dungeon" and Data.is_run_key(_area):
		var look := Data.zone_look(_area, model.run, model.areas.get(_area, {}))
		if str(look.get("biome", look.get("name", ""))) != dungeon.look_name:
			_rebuild()
			return
		dungeon.set_weather(_zone_weather())
		hud.set_area(str(look.get("name", "")), true)


func _place_name(key: String, w: Dictionary) -> String:
	if key == "farm":
		return Strings.place("farm")
	return Strings.place(str(w.get("biome", "")))


## My own figure: on the farm in my outfit, in a dungeon in my class's.
func _dress_hero(me: Dictionary) -> void:
	hero.actor.night_exempt = true
	if _people3d and _dress_figure(hero.actor, me):
		return
	if _mode == "outdoor" and looks.available():
		hero.actor.set_texture(looks.texture_for(me), looks.frames(), 16, 32, 8)
		hero.actor.set_meta("look", _look_key(me))
	else:
		hero.actor.set_sheet(_hero_sheet_of(me))


func _look_key(p: Dictionary) -> String:
	return str(hash(JSON.stringify([p.get("appearance"), p.get("outfit")])))


func _on_travel_asked(dir: String) -> void:
	if demo:
		hud.show_toast(Strings.t("areaNotDrawn", {"name": dir}))


func _on_object_changed(key: String, id: String, obj: Variant) -> void:
	if key != _area:
		return
	if _mode == "outdoor":
		farm.update_object(id, obj)
	else:
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
	if _mode == "outdoor":
		play.on_change(c)
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


## The 3D trial's figure for a player: on the farm in their outfit, in a dungeon in their class's hat and shirt
## (as the sprites are). false when the pack or the layers are missing (the sprite is used).
func _dress_figure(actor: Actor, p: Dictionary) -> bool:
	if not looks.available():
		return false
	var rec := p.duplicate()
	if _mode != "outdoor":
		var cls := str(p.get("saga", {}).get("cls", "krigare")) if p.get("saga") is Dictionary else "krigare"
		var of: Dictionary = (p.get("outfit", {}) as Dictionary).duplicate() if p.get("outfit") is Dictionary else {}
		of.merge(Data.classes.get(cls, {}).get("outfit", {}), true)
		rec["outfit"] = of
	var colours := looks.colours_for(rec)
	var key := str(hash(JSON.stringify(colours)))
	if actor.has_figure(key):
		return true
	return actor.set_figure(Figure3D.build(colours), key)


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


## One actor for every other player on my map, every animal or monster in it and (outdoors) every villager; gone
## ones go. On the farm a player is dressed from the layers (look_composer.gd) and redressed when the outfit changes.
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
	var w: Dictionary = model.areas.get(_area, model.farm if _area == "farm" else {})
	for id in w.get("animals", {}).keys():
		wanted["a:" + str(id)] = w["animals"][id]
	if _mode == "outdoor":
		for id in model.npc_snaps.keys():
			wanted["n:" + str(id)] = model.npc_snaps[id]
	for k in _actors.keys():
		if not wanted.has(k):
			_actors[k].queue_free()
			_actors.erase(k)
			_prev_pos.erase(k)
	for k in wanted.keys():
		var rec: Dictionary = wanted[k]
		if _actors.has(k):
			if k.begins_with("p:") and _mode == "outdoor" and str(_actors[k].get_meta("look", "")) != _look_key(rec):
				_dress(_actors[k], rec)
			continue
		var actor := Actor.new()
		if k.begins_with("p:"):
			_dress(actor, rec)
			actor.set_label(str(rec.get("name", "")))
		elif k.begins_with("n:"):
			var npc: Dictionary = Data.npcs.get(k.substr(2), {})
			if not (_people3d and npc.get("appearance") is Dictionary and _dress_figure(actor, npc)):
				actor.set_sheet(Data.npc_sheet(k.substr(2)))
			actor.set_label(str(Data.npcs.get(k.substr(2), {}).get("name", "")))
		else:
			var species := str(rec.get("species", ""))
			var sheet := Data.mob_sheet(species, int(rec.get("variant", 0))) if not Data.mob(species).is_empty() else ""
			if sheet == "":
				# the farm's animals and the wild ones: a baby while it is young, in its winter hat at Christmas
				var grow := int(Data.animals.get(species, {}).get("growDays", 3))
				sheet = Data.animal_sheet(species, int(rec.get("age", 99)) < grow, model.season == "jul", int(rec.get("variant", 0)))
			actor.set_sheet(sheet)
			if _people3d and SkeletonFigure.has(species):
				actor.set_figure(SkeletonFigure.build(species), "skel:" + species, SkeletonFigure.height_of(species), SkeletonFigure.rig(species))
			elif _people3d and not VEHICLES.has(species) and sheet != "":
				actor.set_voxel(VoxelBody.frames(sheet), sheet)
			# dungeon monsters show their own bars instead of the name labels (the browser's ownsLabel)
			actor.set_label("" if (_mode == "dungeon" and not Data.mob(species).is_empty()) else str(rec.get("name", Data.mob_name(species))))
		actor.position = _scene_of(float(rec.get("x", 0)), float(rec.get("y", 0)))
		actors_root.add_child(actor)
		_actors[k] = actor


func _dress(actor: Actor, rec: Dictionary) -> void:
	# the hired Hirdmannen (a player record with bot: true) is always a hero sprite of its class, never a composed outfit
	if bool(rec.get("bot", false)):
		actor.set_sheet(_hero_sheet_of(rec))
		return
	if _people3d and _dress_figure(actor, rec):
		actor.set_meta("look", _look_key(rec))
		return
	if _mode == "outdoor" and looks.available():
		actor.set_texture(looks.texture_for(rec), looks.frames(), 16, 32, 8)
		actor.set_meta("look", _look_key(rec))
	else:
		actor.set_sheet(_hero_sheet_of(rec))


func _update_hud() -> void:
	var me := model.my_player()
	if _mode == "outdoor":
		hud.set_farm_status(model, me)
		return
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
	if demo:
		_demo_clock(delta)
	if _area == "":
		return
	if _mode == "outdoor":
		farm.sky.grade = grade
		farm.sky.indoors = _cam_k
		_light_lantern(farm.sky.dark_now(), 1.0 - _cam_k)
		Actor.night_lift = smoothstep(0.3, 0.8, farm.sky.dark_now()) * (1.0 - _cam_k)
		farm.sky.update_sky(delta, _clock_ms(), model.season, model.weather, model.server_now())
	elif _mode == "dungeon":
		grade.dungeon_look()
		Actor.night_lift = 0.0
		_light_lantern(0.0, 0.0)
	else:
		_light_lantern(0.0, 0.0)
		Actor.night_lift = 0.0
	combat.tick()
	fx.tick(delta)
	play.tick(delta)
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
		elif key.begins_with("n:"):
			snapshot = model.npc_snaps.get(id)
			rec = snapshot
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
		if key.begins_with("n:"):
			pass
		elif key.begins_with("p:"):
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
	_frame_camera(delta)
	var shake := fx.shake
	var wobble := Vector3((_rng.randf() - 0.5) * shake * 0.5, (_rng.randf() - 0.5) * shake * 0.3, 0.0) if shake > 0.0 else Vector3.ZERO
	rig.position = rig.position.lerp(hero.position, 1.0 - pow(0.002, delta)) + wobble
	_shadow_in -= delta
	if _shadow_in <= 0.0:
		_shadow_in = SHADOW_EVERY
		dungeon.update_shadows(camera.global_position, Quality.shadow_lights())
	if _mode == "dungeon":
		dungeon.follow_weather(hero.position)
		hero.frozen = run_pick.is_open()
	hud.tick_spell_bar(combat, snap.get("b") is Dictionary and snap["b"].get("cast") is Dictionary and bool(snap["b"]["cast"].get("kick", false)))
	_frames += 1
	if _screenshot != "" and _frames == 90:
		var img := get_viewport().get_texture().get_image()
		if img != null:
			img.save_png(_screenshot)
			print("screenshot saved to %s" % _screenshot)
		(get_tree().current_scene as Main).quit_clean()


## The browser closes in inside the farmhouse (a small room at the same zoom would be a postage stamp): the camera
## moves to a closer, steeper place there and eases back out through the door.
## The camera is a child of the rig that follows the hero: its place and aim are in the rig's own space.
func _aim_camera(off: Vector3) -> void:
	camera.transform = Transform3D(Basis.looking_at(CAMERA_LOOK - off, Vector3.UP), off)


func _frame_camera(delta: float) -> void:
	var inside := false
	if _mode == "outdoor" and _area == "farm":
		var tile := Data.tile()
		inside = Data.in_interior(floori(hero.px / tile), floori(hero.py / tile))
	var want := 1.0 if inside else 0.0
	if absf(_cam_k - want) < 0.002:
		if _cam_k != want:
			_cam_k = want
			_aim_camera(CAMERA_OFFSET.lerp(INSIDE_OFFSET, _cam_k))
		return
	_cam_k = lerpf(_cam_k, want, 1.0 - pow(0.02, delta))
	_aim_camera(CAMERA_OFFSET.lerp(INSIDE_OFFSET, _cam_k))


## The demo's running clock and weather (--daylapse, --weathers): off unless the flags are there.
func _demo_clock(delta: float) -> void:
	if _lapse > 0.0 and _demo_time >= 0.0:
		_demo_time = fposmod(_demo_time + delta / _lapse, 1.0)
	if _weathers.size() > 1:
		_weather_t += delta
		if _weather_t >= _weather_every:
			_weather_t = 0.0
			var prev := str((model.weather as Dictionary).get("kind", "sun")) if model.weather is Dictionary else "sun"
			_weather_i = (_weather_i + 1) % _weathers.size()
			var now := model.server_now()
			model.weather = {"kind": _weathers[_weather_i], "prev": prev, "since": now, "until": now + 600000.0}


## The time of day (ms into the day): the server's, running on between its snapshots; fixed in the demo's --time.
func _clock_ms() -> float:
	var day_ms := Data.constant("DAY_LENGTH_MS", 600000.0)
	if _demo_time >= 0.0:
		return _demo_time * day_ms
	if demo:
		return model.time_ms
	return model.time_ms + float(Time.get_ticks_msec() - model.time_at)


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
	var facing := hero.facing_object()
	var kind := str(facing.get("kind", ""))
	if _mode == "outdoor":
		return # (farm_play.gd sets the prompt: what the use key does on the tile in front)
	if not _run_exit_here().is_empty():
		hud.set_prompt("%s · %s" % [Strings.t("actKey"), Strings.t("actRunExit")])
	elif USABLE.has(kind):
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
