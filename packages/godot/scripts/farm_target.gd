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
	position = Vector3(t.x + 0.5, 0.06, t.y + 0.5)
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
	# a villager: their window is M4c's
	for n in model.npc_snaps.values():
		if floori(float(n.get("x", -99)) / Data.tile()) == tx and floori(float(n.get("y", -99)) / Data.tile()) == ty:
			return ""
	var a := animal_at(tx, ty)
	if not a.is_empty():
		return _animal_text(a, id, tool)
	var obj := object_at(tx, ty)
	if not obj.is_empty():
		var kind := str(obj.get("kind", ""))
		var def := Data.object_def(kind)
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
					return Strings.object_name(kind)
		var inter := str(def.get("interact", ""))
		if inter == "chest":
			return Strings.t("actChest")
		if inter == "water" and tool == "can":
			return Strings.t("actFillCan")
		if inter != "":
			return Strings.object_name(kind)
		if not (bool(def.get("flat", false)) and (tool == "can" or id == "")):
			return ""
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
