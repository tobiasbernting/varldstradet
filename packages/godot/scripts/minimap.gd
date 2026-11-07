class_name Minimap
extends Control
## M9a: the small map in the HUD's top right corner (the browser's ui/minimap.ts): the whole map I am on, one pixel a tile
## (terrain, trees, rocks, buildings), and on top of it who is where: me (a big yellow dot), the other players (white), the
## villagers (pink), the animals (cream) and the monsters (red), and the things worth finding (the dungeon arches in their own
## colour, the färdport, doors and caves, the bus stop and the station, Kämpastenen, the landmarks, the way out of a dungeon).
## Toggled with `M` or the left trigger (the `minimap` action), by the button in the world map, and remembered in
## settings.cfg (`Settings.minimap_on`). It is a part of the HUD, so it scales with the text-size setting and, being a
## picture of the model, costs a few draw calls: the picture is rebuilt when the map or its objects change, the dots
## four times a second.

const BOX := 144.0 ## the picture's longest side, in HUD points
const PAD := 5.0
const REDRAW_EVERY := 0.25
const COLORS := {
	"grass": "5f9f3c", "soil": "9a6a3a", "soil_wet": "5f3d1d", "water": "3f86d6", "pool": "4fc0e6", "sand": "e3d08f",
	"path_stone": "b5b2a8", "path_dirt": "c9a978", "floor_wood": "b07a44", "floor_stone": "9d9a92", "snow": "eef2f7",
	"gravel": "8f8a80", "ice": "bfe3f5", "road": "8a8077", "sidewalk": "b8ad9c", "crossing": "c9bfac", "rail": "6b5a40",
	"rock": "77736c", "sandstone": "b8643a", "basalt": "2c2a30", "lava": "f06a1a", "ash": "4a4448", "mud": "6a5a3a",
	"bog": "3d5a3a", "moss": "5a8a7a", "redsand": "d08a5a", "candy": "f4b8d4", "choco": "6a3a1e", "moon": "bdbdc6",
	"space": "0a0a1a", "crypt": "6a6e62", "forge": "3a2226", "bifrost": "e8e5f4",
}
const GROUND := Color("5f9f3c")
const CAVE_GROUND := Color("15151a")
## Objects that get a marker of their own on top of the picture: kind -> [colour, shape]. "dot" is a round marker, "box" a square one.
const MARKS := {
	"fardport": ["7fe8c0", "box"], "saga_stone": ["c88af0", "box"], "bus_stop": ["5aa8ff", "box"], "train_station": ["5aa8ff", "box"],
	"door_out": ["ffb347", "box"], "cave": ["ffffff", "box"], "cave_mouth": ["ffffff", "box"], "rocket": ["ff6a5a", "box"],
	"saga_exit": ["8fd0f0", "box"], "run_exit": ["8fd0f0", "box"], "cave_exit": ["8fd0f0", "box"], "saga_rest": ["5ae0f0", "dot"],
	"yggdrasil": ["bff7d8", "box"], "house": ["ffb347", "box"],
}

var model: WorldModel
var hero: Hero
var _tex: ImageTexture
var _map_key := ""
var _w := 64
var _h := 64
var _dirty := true
var _marks: Array = [] ## {x, y, w, h, colour, shape}: the things worth finding on this map
var _t := 0.0
var _redraw_t := 0.0
var _cave := false
var _built_objects := -1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	visible = false
	anchor_left = 1.0
	anchor_right = 1.0
	_layout()
	get_viewport().size_changed.connect(_layout)
	Settings.ui_scale_changed.connect(_layout)


func setup(m: WorldModel, h: Hero) -> void:
	model = m
	hero = h
	model.object_changed.connect(func(k: String, _id: String, _o: Variant) -> void:
		if k == _map_key:
			_dirty = true)
	model.terrain_changed.connect(func(k: String, _x: int, _y: int) -> void:
		if k == _map_key:
			_dirty = true)
	model.area_changed.connect(func(_k: String) -> void: _dirty = true)


## Shown when the setting is on and a map is drawn (the world calls this when the map changes and when the setting does).
func refresh_visible(drawn: bool) -> void:
	visible = Settings.minimap_on and drawn and model != null and not model.world_for(model.my_area_key()).is_empty()
	if visible:
		_dirty = true
		queue_redraw()


func toggle() -> void:
	Settings.minimap_on = not Settings.minimap_on
	Settings.save()
	refresh_visible(true)
	Sfx.play("target")


## Where the picture sits: under the connection dot and the farm chips on the right. On a narrow screen in a dungeon the
## boss's bar takes the right side at the top, so the map goes below it.
func _layout() -> void:
	var vw := get_viewport().get_visible_rect().size.x
	var below_boss := vw < 1050.0 and _cave
	var top := 156.0 if below_boss else 92.0
	offset_right = -16.0
	offset_left = -16.0 - (BOX + PAD * 2.0)
	offset_top = top
	offset_bottom = top + _size_of_box().y
	queue_redraw()


func _size_of_box() -> Vector2:
	var longest := float(maxi(_w, _h))
	var k := BOX / longest
	return Vector2(float(_w) * k, float(_h) * k) + Vector2(PAD, PAD) * 2.0


func _process(delta: float) -> void:
	if not visible or model == null:
		return
	_t += delta
	_redraw_t += delta
	var key := model.my_area_key()
	var objects: Dictionary = model.world_for(key).get("objects", {})
	if key != _map_key or _dirty or objects.size() != _built_objects:
		_rebuild(key)
	if _redraw_t >= REDRAW_EVERY:
		_redraw_t = 0.0
		queue_redraw()


## The map's picture: one pixel a tile.
func _rebuild(key: String) -> void:
	var world := model.world_for(key)
	if world.is_empty():
		return
	_dirty = false
	_map_key = key
	_w = model.map_w(world)
	_h = model.map_h(world)
	_cave = Data.is_saga_key(key)
	var img := Image.create(_w, _h, false, Image.FORMAT_RGBA8)
	img.fill(CAVE_GROUND if _cave else GROUND)
	var terrain: Array = world.get("terrain", [])
	var cols: Dictionary = {}
	for k in COLORS:
		cols[k] = Color(COLORS[k])
	for y in range(_h):
		for x in range(_w):
			var i := y * _w + x
			if i >= terrain.size():
				continue
			var t := str(terrain[i])
			# a dungeon is dark round its rooms, like a cave
			if _cave and (t == "rock" or t == "basalt"):
				continue
			img.set_pixel(x, y, cols.get(t, Color("888888")))
	_marks.clear()
	var objects: Dictionary = world.get("objects", {})
	_built_objects = objects.size()
	for o in objects.values():
		var kind := str(o.get("kind", ""))
		var d := Data.object_def(kind)
		var w := int(d.get("w", 1))
		var h := int(d.get("h", 1))
		var x := int(o.get("x", 0))
		var y := int(o.get("y", 0))
		var c := _object_colour(kind, o)
		if c.a > 0.0:
			for yy in range(h):
				for xx in range(w):
					if x + xx >= 0 and x + xx < _w and y + yy >= 0 and y + yy < _h:
						img.set_pixel(x + xx, y + yy, c)
		var mark := _mark_of(kind, o)
		if not mark.is_empty():
			_marks.append({"x": x, "y": y, "w": w, "h": h, "colour": mark["colour"], "shape": mark["shape"]})
	_tex = ImageTexture.create_from_image(img)
	_layout()


## The picture's colour of an object (the browser's table): trees green, rocks grey, buildings and so on; transparent for
## what is not drawn at all.
func _object_colour(kind: String, o: Dictionary) -> Color:
	if kind.begins_with("tree") or kind in ["bush", "palm", "cactus", "jungle_tree", "berry_bush", "blueberry_bush"] or kind.begins_with("giant_"):
		return Color("2f6e2a")
	if kind == "loot_chest" or kind == "dig_spot" or kind == "treasure" or kind == "saga_chest":
		return Color("f2d35a")
	if kind.begins_with("rock") or kind == "cave_rock" or kind == "ore" or kind.ends_with("_rock") or kind == "boulder":
		return Color("7d7a73")
	if kind == "house" or kind == "house_small":
		return Color("b5413a")
	if kind == "market" or kind == "sellstall" or kind == "mailbox" or kind == "sellbox" or kind == "workbench" or kind == "start_bench":
		return Color.WHITE
	if kind == "cave_wall":
		return Color("f5a623") if int(o.get("variant", 0)) == 1 else Color("3a3a40")
	if kind == "saga_wall":
		return Color("3a3a40")
	if kind == "saga_gate":
		return Color("8a8e9a")
	if kind == "saga_rest":
		return Color("5ae0f0")
	if kind == "fence" or kind == "gate" or kind.begins_with("wall"):
		return Color("8a5c30")
	if bool(Data.object_def(kind).get("houses", false)):
		return Color("c58f55")
	return Color(0, 0, 0, 0)


## The marker an object gets on top of the picture, or {} for none: the arches in their dungeon's colour, the landmarks in gold.
func _mark_of(kind: String, o: Dictionary) -> Dictionary:
	if kind == "saga_portal":
		return {"colour": DungeonLook.portal_colour(int(o.get("variant", 0))).lightened(0.35), "shape": "arch"}
	if kind.begins_with("lm_"):
		return {"colour": Color("ffd84a"), "shape": "dot"}
	if MARKS.has(kind) and not (kind == "house" and _cave):
		return {"colour": Color(MARKS[kind][0]), "shape": MARKS[kind][1]}
	return {}


func _draw() -> void:
	if not visible or _tex == null or model == null:
		return
	var box := _size_of_box()
	draw_rect(Rect2(Vector2.ZERO, box), Color(0.17, 0.14, 0.1, 0.86))
	draw_rect(Rect2(Vector2.ZERO, box), Color("0f0c08"), false, 2.0)
	var k := BOX / float(maxi(_w, _h))
	var origin := Vector2(PAD, PAD)
	draw_texture_rect(_tex, Rect2(origin, Vector2(float(_w), float(_h)) * k), false)
	# what is worth finding: a marker a few points wide whatever the object's size, with a dark rim so it shows on any ground
	var minimum := 6.0
	for m in _marks:
		var c: Color = m["colour"]
		var centre := origin + (Vector2(float(m["x"]) + float(m["w"]) / 2.0, float(m["y"]) + float(m["h"]) / 2.0)) * k
		match str(m["shape"]):
			"dot":
				draw_circle(centre, minimum * 0.5 + 1.0, Color("0f0c08"))
				draw_circle(centre, minimum * 0.5, c)
			"arch":
				var s := maxf(float(m["w"]) * k, minimum + 2.0)
				var r := Rect2(centre - Vector2(s, s * 0.66) / 2.0, Vector2(s, s * 0.66))
				draw_rect(r.grow(1.5), Color("0f0c08"))
				draw_rect(r, c)
				draw_rect(Rect2(r.position + Vector2(s * 0.3, s * 0.2), Vector2(s * 0.4, s * 0.46)), Color("0f0c08"))
			_:
				var r2 := Rect2(centre - Vector2(minimum, minimum) / 2.0, Vector2(minimum, minimum))
				draw_rect(r2.grow(1.0), Color("0f0c08"))
				draw_rect(r2, c)
	var tile := Data.tile()
	var to_map := func(px: float, py: float) -> Vector2:
		return origin + Vector2(px / tile, py / tile) * k
	var dot := func(p: Vector2, c: Color, r: float) -> void:
		draw_rect(Rect2(p - Vector2(r, r) / 2.0, Vector2(r, r)), c)
	for n in model.npc_snaps.values():
		dot.call(to_map.call(float(n.get("x", 0)), float(n.get("y", 0))), Color("ff8ae0"), 4.0)
	var world := model.world_for(model.my_area_key())
	var animals: Dictionary = world.get("animals", {})
	for id in model.animal_snaps.keys():
		var snap: Dictionary = model.animal_snaps[id]
		var rec: Variant = animals.get(id)
		var def: Dictionary = Data.animals.get(str(rec.get("species", "")), {}) if rec is Dictionary else {}
		var mob: bool = bool(def.get("mob", false)) or bool(def.get("saga", false))
		dot.call(to_map.call(float(snap.get("x", 0)), float(snap.get("y", 0))), Color("ff4a4a") if mob else Color("f4ead8"), 4.0 if mob else 3.0)
	var mine := model.my_area_key()
	for id in model.player_snaps.keys():
		if id == model.me:
			continue
		var p: Dictionary = model.player_snaps[id]
		if str(p.get("area", "farm")) != mine:
			continue
		dot.call(to_map.call(float(p.get("x", 0)), float(p.get("y", 0))), Color.WHITE, 6.0)
	if hero != null:
		var me_at: Vector2 = to_map.call(hero.px, hero.py)
		dot.call(me_at, Color("0f0c08"), 9.0)
		dot.call(me_at, Color("ffe14a"), 7.0)
