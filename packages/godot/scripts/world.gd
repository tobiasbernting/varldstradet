class_name WorldView
extends Node3D
## The world on screen, milestone M3a: the dungeon you stand in, built from the server's data (dungeon_view.gd),
## you walking in it (hero.gd), everyone else and the monsters interpolated between the server's snapshots
## (actor.gd), the HUD (hud.gd) and the pause menu (menu.gd). Every message from the socket goes through the
## world model (world_model.gd), and the view follows its signals. A map the client does not draw yet (the farm,
## the world) shows a notice and the menu's way into Draugkryptan instead.
##
## Demo mode (`--demo` after `--` on the command line, or main.gd's start_demo): the messages recorded in
## assets/fixtures/draug.json are played instead of a socket, so the dungeon can be looked at without a server, and
## the Godot workflow exercises all of this headless.

signal left

## The camera sits here relative to the hero and looks at them (ART.md, "Camera").
const CAMERA_OFFSET := Vector3(0.0, 10.0, 8.0)
const CAMERA_LOOK := Vector3(0.0, 0.8, 0.0)
const PLAYER_JUMP_PX := 64.0
const ANIMAL_JUMP_PX := 48.0
const SHADOW_EVERY := 0.3

@onready var dungeon: DungeonView = $Dungeon
@onready var actors_root: Node3D = $Actors
@onready var hero: Hero = $Hero
@onready var rig: Node3D = $CameraRig
@onready var camera: Camera3D = $CameraRig/Camera3D

var model := WorldModel.new()
var hud: HudLayer
var menu: PauseMenu
var demo := false
var _area := "" ## the map drawn right now ("" when none)
var _actors: Dictionary = {} ## "p:<id>" or "a:<id>" -> Actor
var _shadow_in := 0.0
var _screenshot := ""
var _frames := 0


func _ready() -> void:
	hud = HudLayer.new()
	add_child(hud)
	menu = PauseMenu.new()
	add_child(menu)
	hud.menu_asked.connect(menu.open)
	menu.switch_player.connect(func() -> void: left.emit())
	menu.dev_enter.connect(_on_dev_enter)
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
	model.banner.connect(func(text: String, sub: String, _kind: String) -> void: hud.show_banner(text, sub))
	model.error.connect(hud.show_toast)
	Net.message.connect(_on_message)
	Net.connection_changed.connect(_on_connection)
	Quality.changed.connect(func(_p: String) -> void: _rebuild())
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--screenshot="):
			_screenshot = arg.substr("--screenshot=".length())


func reset() -> void:
	model.reset()
	_clear_actors()
	dungeon.clear()
	_area = ""
	hero.reset()
	hero.send_moves = true
	hud.reset()
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


func _on_message(msg: Dictionary) -> void:
	if not demo:
		model.apply(msg)


func _on_connection(status: String, _close_code: int) -> void:
	if not demo:
		hud.set_connection(status)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("menu"):
		menu.toggle()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("act") and not menu.is_open():
		_act()


## The use key: only what a dungeon lets you use without fighting (the way out, a chest, a rest stone). Spells
## and attacks are M3b.
func _act() -> void:
	if demo or _area == "":
		return
	var obj := hero.facing_object()
	if str(obj.get("kind", "")) in ["saga_exit", "saga_chest", "saga_rest"]:
		var t := hero.facing_tile()
		Net.send({"t": "act", "tx": t.x, "ty": t.y})


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
	if id == "" or not model.areas.has(key):
		dungeon.clear()
		_area = ""
		hero.set_world({})
		var shown := key
		if id != "":
			shown = str(Data.dungeon(id).get("name", key))
		hud.set_area(shown, false)
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


func _hero_sheet_of(p: Dictionary) -> String:
	var cls := str(p.get("saga", {}).get("cls", "krigare")) if p.get("saga") is Dictionary else "krigare"
	var skin := str(p.get("appearance", {}).get("skin", "")) if p.get("appearance") is Dictionary else ""
	return Data.hero_sheet(cls, skin)


func _scene_of(x: float, y: float) -> Vector3:
	var tile := Data.tile()
	return Vector3(x / tile, 0.0, y / tile)


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
			actor.set_label(str(rec.get("name", Data.mob_name(species))))
		actor.position = _scene_of(float(rec.get("x", 0)), float(rec.get("y", 0)))
		actors_root.add_child(actor)
		_actors[k] = actor


func _update_hud() -> void:
	var me := model.my_player()
	var f := model.my_fighter()
	var cls := str(me.get("saga", {}).get("cls", "")) if me.get("saga") is Dictionary else ""
	var max_hp := float(Data.classes.get(cls, {}).get("hp", 0))
	if f.size() >= 2:
		hud.set_hearts(float(f[0]), float(f[1]))
	else:
		hud.set_hearts(max_hp, max_hp)
	var rows: Array = []
	for id in model.players().keys():
		if id == model.me:
			continue
		var p: Dictionary = model.players()[id]
		if str(p.get("area", "farm")) != _area:
			continue
		var pf := model.fighter_of(id)
		var pcls := str(p.get("saga", {}).get("cls", "")) if p.get("saga") is Dictionary else ""
		var pmax := float(Data.classes.get(pcls, {}).get("hp", 0))
		rows.append({"name": p.get("name", ""), "hp": float(pf[0]) if pf.size() >= 2 else pmax, "max": float(pf[1]) if pf.size() >= 2 else pmax})
	hud.set_party(rows)
	hero.speed_mul = _my_speed_mul(f)


## sagaSpeed in the browser: fallen or frozen is 0, slowed is SLOW_MUL.
func _my_speed_mul(f: Array) -> float:
	if f.size() < 3:
		return 1.0
	var flags := int(f[2])
	if flags & (1 | 32):
		return 0.0
	if flags & 16:
		return Data.constant("SLOW_MUL", 0.6)
	return 1.0


func _clear_actors() -> void:
	for a in _actors.values():
		a.queue_free()
	_actors = {}


# ---------------------------------------------------------------------------
# Every frame


func _process(delta: float) -> void:
	if _area == "":
		return
	hero.actor.animate(hero.facing, hero.moving, delta)
	var k := 1.0 - pow(0.001, delta)
	var w: Dictionary = model.areas.get(_area, {})
	for key in _actors.keys():
		var actor: Actor = _actors[key]
		var id: String = key.substr(2)
		var snap: Variant
		var rec: Variant
		var jump_px: float
		if key.begins_with("p:"):
			snap = model.player_snaps.get(id)
			rec = model.players().get(id)
			jump_px = PLAYER_JUMP_PX
		else:
			snap = model.animal_snaps.get(id)
			rec = w.get("animals", {}).get(id)
			jump_px = ANIMAL_JUMP_PX
		if not (rec is Dictionary):
			continue
		if snap is Dictionary:
			var target := _scene_of(float(snap.get("x", 0)), float(snap.get("y", 0)))
			if actor.position.distance_to(target) > jump_px / Data.tile():
				actor.position = target
			else:
				actor.position = actor.position.lerp(target, k)
		actor.animate(str(rec.get("facing", "down")), bool(rec.get("moving", false)), delta)
	rig.position = rig.position.lerp(hero.position, 1.0 - pow(0.002, delta))
	_shadow_in -= delta
	if _shadow_in <= 0.0:
		_shadow_in = SHADOW_EVERY
		dungeon.update_shadows(camera.global_position, Quality.shadow_lights())
	_frames += 1
	if _screenshot != "" and _frames == 90:
		var img := get_viewport().get_texture().get_image()
		if img != null:
			img.save_png(_screenshot)
			print("screenshot saved to %s" % _screenshot)
		get_tree().quit()
