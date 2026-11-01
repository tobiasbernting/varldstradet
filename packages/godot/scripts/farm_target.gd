class_name FarmTarget
extends Node3D
## The tile in front of me, outlined as the browser does, and the line that says what the use key will do there
## ("E · Vattna"). The text follows performAction in shared/src/sim.ts: a ripe crop is harvested whatever you hold,
## a can waters, a hoe tills grass, seeds go in tilled soil, the axe, pick and scythe take what they can, a brush
## and hay go to an animal, and so on. It is only a hint (the server decides when `act` arrives); when nothing would
## happen the outline is grey and the line empty. The outline is one mesh made once; the line is worked out ten
## times a second and only when something it depends on changed.

const WATER := ["water", "bog"]
const SOIL := ["soil", "soil_wet"]
const GOOD := Color(0.55, 1.0, 0.5)
const IDLE := Color(1.0, 1.0, 1.0)

var model: WorldModel
var hero: Hero
var text := "" ## what the use key does on the tile in front of me ("" for nothing)
var can := false ## something would happen
var tile := Vector2i.ZERO
var size := Vector2i.ONE ## the outline's footprint in tiles (a placeable's; 1 × 1 otherwise)
var placing := false ## I hold something that puts a thing down, and the outline is its footprint
var _ring: MeshInstance3D
var _mat: StandardMaterial3D
var _t := 0.0
var _in := 0.0
var _sig := ""


func _init() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var o := 0.47
	var i := 0.38
	var quads := [
		[Vector2(-o, -o), Vector2(o, -o), Vector2(o, -i), Vector2(-o, -i)],
		[Vector2(-o, i), Vector2(o, i), Vector2(o, o), Vector2(-o, o)],
		[Vector2(-o, -i), Vector2(-i, -i), Vector2(-i, i), Vector2(-o, i)],
		[Vector2(i, -i), Vector2(o, -i), Vector2(o, i), Vector2(i, i)],
	]
	for q in quads:
		for idx in [0, 2, 1, 0, 3, 2]:
			st.add_vertex(Vector3(q[idx].x, 0.0, q[idx].y))
	_ring = MeshInstance3D.new()
	_ring.mesh = st.commit()
	_mat = StandardMaterial3D.new()
	_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mat.albedo_color = Color(1, 1, 1, 0.6)
	_mat.no_depth_test = true
	_mat.render_priority = 2
	_ring.material_override = _mat
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_ring)
	visible = false


func tick(delta: float) -> void:
	if hero.world.is_empty():
		visible = false
		return
	visible = true
	_t += delta
	var t := hero.facing_tile()
	position = Vector3(t.x + size.x / 2.0, 0.06, t.y + size.y / 2.0)
	_ring.scale = Vector3(size.x, 1.0, size.y)
	_in -= delta
	if _in <= 0.0 or t != tile:
		_in = 0.1
		tile = t
		_describe(t.x, t.y)
	var c := GOOD if can else IDLE
	_mat.albedo_color = Color(c.r, c.g, c.b, (0.55 + 0.25 * sin(_t * 5.0)) if can else 0.28)


func _describe(tx: int, ty: int) -> void:
	var sig := "%d,%d" % [tx, ty]
	can = true
	var me := model.my_player()
	var held := model.held()
	var id := str(held.get("item", ""))
	var tool := Data.item_tool(id)
	size = Vector2i.ONE
	placing = false
	var next := _text_for(tx, ty, me, id, tool)
	if next == "":
		can = false
	text = next
	_sig = sig


func _text_for(tx: int, ty: int, me: Dictionary, id: String, tool: String) -> String:
	if me.get("riding") != null:
		return Strings.t("actDismount")
	var emote: Variant = model.player_snaps.get(model.me, {}).get("emote")
	if emote is Dictionary and float(emote.get("until", 0)) > model.server_now():
		var e := str(emote.get("id", ""))
		if e == "napp":
			return Strings.t("actReel")
		if e == "fiske":
			can = false
			return Strings.t("actWaiting")
	var w := hero.world
	# a villager: a talk
	for nid in model.npc_snaps.keys():
		var n: Dictionary = model.npc_snaps[nid]
		if floori(float(n.get("x", -99)) / Data.tile()) == tx and floori(float(n.get("y", -99)) / Data.tile()) == ty:
			return Strings.t("actTalk", {"name": str(Data.npcs.get(str(nid), {}).get("name", ""))})
	var obj := object_at(tx, ty)
	# food: eaten (unless I point at something that opens)
	if id != "" and Data.item(id).has("food") and (obj.is_empty() or str(Data.object_def(str(obj.get("kind", ""))).get("interact", "")) == ""):
		return Strings.t("actEat", {"item": Data.item_name(id)})
	var a := animal_at(tx, ty)
	if not a.is_empty():
		return _animal_text(a, id, tool)
	if not obj.is_empty():
		var kind := str(obj.get("kind", ""))
		var def := Data.object_def(kind)
		var builder := _builder_other(obj)
		if builder != "" and (bool(def.get("harvest", false)) or (str(def.get("breakWith", "")) != "" and str(def.get("breakWith", "")) == tool)):
			# the server refuses: only the one who built it takes it down (DESIGN.md, Ownership)
			can = false
			return Strings.t("actBuiltBy", {"owner": builder, "name": Strings.object_name(kind)})
		if kind == "saga_portal":
			return Strings.t("actPortal", {"name": _arch_name(obj)})
		if bool(def.get("harvest", false)):
			return Strings.t("actPick")
		var bw := str(def.get("breakWith", ""))
		if bw != "" and bw == tool:
			match bw:
				"axe":
					return Strings.t("actChop")
				"pick":
					return Strings.t("actMine")
				"scythe":
					return Strings.t("actCutGrass")
				"hoe":
					return Strings.t("actTill")
				_:
					return Strings.t("actRemove", {"name": Strings.object_name(kind)})
		var inter := str(def.get("interact", ""))
		if inter == "chest":
			return Strings.t("actChest")
		if inter == "water" and tool == "can":
			return Strings.t("actFillCan")
		if inter == "sleep":
			return Strings.t("actSleep")
		if inter != "":
			return Strings.t("actUse", {"name": Strings.object_name(kind)})
		if not (bool(def.get("flat", false)) and (tool == "can" or id == "")):
			return ""
	var places := str(Data.item(id).get("places", ""))
	if places != "" and obj.is_empty():
		return _place_text(tx, ty, places)
	var ck := "%d,%d" % [tx, ty]
	var crop: Variant = w.get("crops", {}).get(ck)
	if crop is Dictionary:
		var stages := int(Data.crops.get(str(crop.get("crop", "")), {}).get("stages", 99))
		if int(crop.get("stage", 0)) >= stages:
			return Strings.t("actHarvest")
		if tool == "can" and not bool(crop.get("watered", false)):
			return Strings.t("actWater") if int(held_charges()) > 0 else ""
		if tool == "hoe":
			return Strings.t("actUndo")
		return ""
	var t := terrain_at(tx, ty)
	match tool:
		"hoe":
			return Strings.t("actTill") if (t == "grass" or t == "dirt") else ""
		"can":
			if WATER.has(t):
				return Strings.t("actFillCan")
			if t == "soil" and held_charges() > 0:
				return Strings.t("actWater")
			return ""
		"scythe":
			return Strings.t("actCutGrass") if SOIL.has(t) else ""
		"rod":
			return Strings.t("actFish") if WATER.has(t) else ""
	if Data.item_category(id) == "seed" and SOIL.has(t):
		return Strings.t("actPlant", {"item": Data.item_name(id)})
	return ""


## The name of the one who built this and is still on the farm, when it is not me ("" when I may take it down).
func _builder_other(obj: Dictionary) -> String:
	var by: Variant = obj.get("by")
	if by == null or str(by) == model.me:
		return ""
	var p: Variant = model.players().get(str(by))
	return str(p.get("name", "")) if p is Dictionary else ""


## The placement preview: the footprint of what I hold on the tile in front of me, green when the server would put it
## there (addObject and the floor rules in sim.ts), red when not.
func _place_text(tx: int, ty: int, places: String) -> String:
	var def := Data.object_def(places)
	var floor_kind: bool = Data.floors.has(places)
	placing = true
	var label := Strings.object_name(places)
	if floor_kind:
		size = Vector2i.ONE
	else:
		size = Vector2i(int(def.get("w", 1)), int(def.get("h", 1)))
	if _can_place(tx, ty, places, floor_kind):
		return Strings.t("actPlace", {"name": label})
	can = false
	return Strings.t("actNoPlace")


func _can_place(tx: int, ty: int, places: String, floor_kind: bool) -> bool:
	var t := terrain_at(tx, ty)
	if t == "" or t == "pool" or (Data.is_wall_terrain(t) and t != "water"):
		return false
	var w := hero.world
	var crops: Dictionary = w.get("crops", {})
	if floor_kind:
		if t == "water" or t == places:
			return false
		if crops.has("%d,%d" % [tx, ty]) and SOIL.has(t):
			return false
		var o := object_at(tx, ty)
		return o.is_empty() or not bool(Data.object_def(str(o.get("kind", ""))).get("solid", true))
	var def := Data.object_def(places)
	for dy in range(size.y):
		for dx in range(size.x):
			var x := tx + dx
			var y := ty + dy
			var tt := terrain_at(x, y)
			if tt == "" or tt == "water" or not object_at(x, y).is_empty() or crops.has("%d,%d" % [x, y]):
				return false
	return not _someone_in(tx, ty, size.x, size.y)


## footprintOccupied in sim.ts: a player or an animal standing in the footprint.
func _someone_in(x: int, y: int, w: int, h: int) -> bool:
	var tile_px := Data.tile()
	var hw := Data.constant("PLAYER_HALF_W", 5.0)
	var hh := Data.constant("PLAYER_HALF_H", 3.0)
	var spots: Array = [Vector2(hero.px, hero.py)]
	for id in model.player_snaps.keys():
		if str(id) != model.me:
			var s: Dictionary = model.player_snaps[id]
			spots.append(Vector2(float(s.get("x", -99)), float(s.get("y", -99))))
	for s in model.animal_snaps.values():
		spots.append(Vector2(float(s.get("x", -99)), float(s.get("y", -99))))
	for p in spots:
		if p.x + hw > x * tile_px and p.x - hw < (x + w) * tile_px and p.y + hh > y * tile_px and p.y - hh < (y + h) * tile_px:
			return true
	return false


func held_charges() -> int:
	return int(model.held().get("charges", 0))


func _animal_text(a: Dictionary, id: String, tool: String) -> String:
	var species := str(a.get("species", ""))
	var def: Dictionary = Data.animals.get(species, {})
	var name_text := str(a.get("name", "")) if str(a.get("name", "")) != "" else Strings.species(species)
	var wild := bool(def.get("wild", false)) and a.get("owner") == null
	if id == "hay" and not wild:
		return Strings.t("actFeed", {"name": name_text}) if not bool(a.get("fed", false)) else ""
	if tool == "brush":
		return Strings.t("actBrush", {"name": name_text})
	if bool(a.get("hasProduct", false)) and def.has("product"):
		return Strings.t("actCollect", {"item": Data.item_name(str(def["product"])), "name": name_text})
	if def.has("mount") or species == "horse":
		if bool(a.get("petted", false)) and bool(a.get("named", false)):
			return Strings.t("actRide", {"name": name_text})
	return Strings.t("actPet", {"name": name_text})


func _arch_name(obj: Dictionary) -> String:
	var ids := Data.dungeons.keys()
	var v := int(obj.get("variant", 0))
	return str(Data.dungeon(str(ids[v])).get("name", "")) if v >= 0 and v < ids.size() else ""


func terrain_at(tx: int, ty: int) -> String:
	var w := hero.world
	var mw := int(w.get("w", 64))
	var terrain: Array = w.get("terrain", [])
	var i := ty * mw + tx
	return str(terrain[i]) if tx >= 0 and ty >= 0 and tx < mw and i < terrain.size() else ""


func object_at(tx: int, ty: int) -> Dictionary:
	var oid: Variant = hero.world.get("occupancy", {}).get("%d,%d" % [tx, ty])
	if oid == null:
		return {}
	var o: Variant = hero.world.get("objects", {}).get(str(int(oid)))
	return o if o is Dictionary else {}


## The animal standing on a tile (the server's animalAt): positions come from the latest snapshot.
func animal_at(tx: int, ty: int) -> Dictionary:
	var tile_px := Data.tile()
	var animals: Dictionary = hero.world.get("animals", {})
	for id in animals.keys():
		var a: Dictionary = animals[id]
		var snap: Variant = model.animal_snaps.get(id)
		var ax := float(snap.get("x", 0)) if snap is Dictionary else float(a.get("x", 0))
		var ay := float(snap.get("y", 0)) if snap is Dictionary else float(a.get("y", 0))
		if floori(ax / tile_px) == tx and floori(ay / tile_px) == ty:
			return a
	return {}
