class_name LandmarkModels
extends RefCounted
## The wild maps' landmarks (lm_*, shared/landmarks.ts) put together from pack models: each is a list of parts on
## the landmark's footprint (3 × 3 m, or 4 × 3, centred on the node), every part a baked mesh in the farm's prop
## material (so the season, the snow and the night glow act on it like on any prop). What no pack has (eggs, a tar
## pit, the ice-cream tower, the chocolate fountain, the satellite) is a small generated mesh (`gen:` names,
## FarmAssets._landmark_mesh). LICENSES.md lists the packs; ART.md says how the parts are scaled.
##
## A part is [model, recolour, scale, position (m), turn (radians)]. The model is a path under res://assets/ or a
## `gen:` name; the recolour is one of FarmAssets._recolour's modes. `fire` is where a flame burns (the vårdkase and
## the fire well); the light comes from the landmark's `light` flag (farm_view.gd) at `light_at`.

const PARTS := {
	# --- the forest: a ring of standing stones round a flat altar; the giant oak with lanterns inside
	"lm_stencirkel": [
		["kenney_nature/stone_tallA.glb", "kenney", 1.5, Vector3(0.0, 0.0, -1.2), 0.0],
		["kenney_nature/stone_tallC.glb", "kenney", 1.7, Vector3(1.15, 0.0, -0.4), 1.2],
		["kenney_nature/stone_tallA.glb", "kenney", 1.3, Vector3(0.75, 0.0, 1.0), 2.4],
		["kenney_nature/stone_tallC.glb", "kenney", 1.6, Vector3(-0.75, 0.0, 1.0), 3.6],
		["kenney_nature/stone_tallA.glb", "kenney", 1.4, Vector3(-1.15, 0.0, -0.4), 4.8],
		["kenney_nature/statue_block.glb", "kenney", 2.2, Vector3(0.0, 0.0, 0.0), 0.3],
	],
	"lm_jatteek": [
		["kaykit_forest/Tree_1_A_Color1.gltf", "forest", 0.95, Vector3(0.0, 0.0, 0.0), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.4, Vector3(0.9, 0.9, 0.9), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.4, Vector3(-1.1, 1.0, 0.6), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.4, Vector3(1.0, 1.1, -0.5), 0.0],
	],
	# --- the meadow: a stone beacon tower with a fire bowl on top; a maze of flower hedges
	"lm_vardkase": [
		["kaykit_hex/building_tower_A_red.gltf", "stone", 2.2, Vector3(0.0, 0.0, 0.0), 0.0],
		["kenney_nature/campfire_logs.glb", "kenney", 1.6, Vector3(0.0, 3.05, 0.0), 0.0],
	],
	"lm_blomsterlabyrint": [
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(-1.6, 0.0, -1.1), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(-0.8, 0.0, -1.1), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(0.0, 0.0, -1.1), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(0.8, 0.0, -1.1), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(1.6, 0.0, -1.1), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(-1.6, 0.0, -0.3), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(1.6, 0.0, -0.3), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(-0.8, 0.0, 0.5), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(0.0, 0.0, 0.5), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(1.6, 0.0, 0.5), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(-1.6, 0.0, 1.2), 0.0],
		["kenney_nature/plant_bushLarge.glb", "leaf", 2.4, Vector3(0.8, 0.0, 1.2), 0.0],
		["kenney_nature/flower_redA.glb", "leaf", 2.0, Vector3(-0.4, 0.0, -0.3), 0.0],
		["kenney_nature/flower_yellowA.glb", "leaf", 2.2, Vector3(0.4, 0.0, -0.4), 0.0],
		["kenney_nature/flower_purpleA.glb", "leaf", 2.0, Vector3(0.9, 0.0, 0.0), 0.0],
		["kenney_nature/flower_redA.glb", "leaf", 2.0, Vector3(-1.1, 0.0, 0.4), 0.0],
		["kenney_nature/statue_block.glb", "kenney", 1.2, Vector3(0.0, 0.0, -0.3), 0.0],
	],
	# --- the ice: a viking ship frozen in; the frost giant's ribs and skull
	"lm_frusetskepp": [
		["kenney_nature/canoe.glb", "kenney", 2.4, Vector3(0.0, 0.0, 0.0), PI / 2.0 + 0.3],
		["kaykit_hex/flag_red.gltf", "keep", 5.0, Vector3(0.1, 0.25, -0.1), 0.3],
		["kenney_nature/rock_largeA.glb", "ice", 1.4, Vector3(-0.9, -0.1, 0.9), 0.4],
		["kenney_nature/rock_largeA.glb", "ice", 1.2, Vector3(1.0, -0.1, -0.9), 2.0],
		["kenney_nature/rock_largeA.glb", "ice", 1.0, Vector3(-1.1, -0.1, -0.8), 4.0],
	],
	"lm_jatteskelett": [
		["kaykit_halloween/ribcage.gltf", "keep", 2.8, Vector3(-0.3, 0.0, 0.0), 0.2],
		["kaykit_halloween/skull.gltf", "keep", 1.8, Vector3(1.3, 0.0, 0.2), -0.5],
		["kaykit_halloween/bone_C.gltf", "keep", 1.6, Vector3(-1.4, 0.0, 0.8), 1.1],
		["kaykit_halloween/bone_A.gltf", "keep", 1.6, Vector3(-1.2, 0.0, -0.9), 0.4],
	],
	# --- the mountains: the dwarves' stone door with lanterns; the eagle's nest on a crag
	"lm_dvargport": [
		["kenney_nature/cliff_cave_rock.glb", "kenney", 3.0, Vector3(0.0, 0.0, -0.6), PI],
		["kaykit_halloween/lantern_standing.gltf", "lamp", 0.7, Vector3(-1.1, 0.0, 0.6), 0.0],
		["kaykit_halloween/lantern_standing.gltf", "lamp", 0.7, Vector3(1.1, 0.0, 0.6), 0.0],
		["kaykit_halloween/gravestone.gltf", "stone", 0.7, Vector3(0.0, 0.0, 0.8), 0.0],
	],
	"lm_ornnaste": [
		["kenney_nature/cliff_large_rock.glb", "kenney", 2.6, Vector3(0.0, 0.0, -0.3), PI],
		["kenney_nature/log.glb", "kenney", 1.6, Vector3(-0.35, 2.6, -0.2), 0.3],
		["kenney_nature/log.glb", "kenney", 1.6, Vector3(0.35, 2.6, -0.2), -0.3],
		["kenney_nature/log.glb", "kenney", 1.6, Vector3(0.0, 2.6, -0.6), PI / 2.0],
		["kenney_nature/log.glb", "kenney", 1.6, Vector3(0.0, 2.6, 0.2), PI / 2.0 + 0.2],
		["gen:eggs", "keep", 1.0, Vector3(0.0, 2.65, -0.2), 0.0],
	],
	# --- the beach: a church tower sunk in the sand; a whale skeleton to walk under
	"lm_klocktorn": [
		["kaykit_hex/building_church_red.gltf", "keep", 3.0, Vector3(0.0, -1.6, 0.0), 0.0],
		["kenney_nature/rock_largeA.glb", "kenney", 0.8, Vector3(1.1, 0.0, 1.0), 1.0],
	],
	"lm_valskelett": [
		["kaykit_halloween/ribcage.gltf", "keep", 2.2, Vector3(-0.9, 0.0, 0.0), PI / 2.0],
		["kaykit_halloween/ribcage.gltf", "keep", 2.4, Vector3(0.3, 0.0, 0.0), PI / 2.0],
		["kaykit_halloween/skull.gltf", "keep", 1.4, Vector3(1.6, 0.0, 0.0), -PI / 2.0],
		["kaykit_halloween/bone_C.gltf", "keep", 1.4, Vector3(-1.8, 0.0, 0.3), 0.2],
	],
	# --- the bog: the moss altar with will-o'-wisps; the old bridge that ends in the bog
	"lm_mossaltare": [
		["kaykit_halloween/shrine_candles.gltf", "stone", 1.1, Vector3(0.0, 0.0, -0.2), 0.0],
		["kenney_nature/hanging_moss.glb", "leaf", 2.0, Vector3(-0.35, 0.6, 0.15), 0.0],
		["kenney_nature/hanging_moss.glb", "leaf", 2.0, Vector3(0.35, 0.6, 0.15), 0.0],
		["kenney_nature/stone_largeA.glb", "kenney", 1.0, Vector3(-1.1, 0.0, 0.8), 0.5],
		["gen:wisp", "keep", 1.0, Vector3(-0.9, 0.3, -0.6), 0.0],
		["gen:wisp", "keep", 1.0, Vector3(0.9, 0.5, -0.4), 0.0],
		["gen:wisp", "keep", 1.0, Vector3(0.6, 0.2, 0.9), 0.0],
	],
	"lm_gamlabron": [
		["kenney_nature/bridge_wood.glb", "kenney", 1.4, Vector3(0.0, 0.0, 0.7), 0.0],
		["kenney_nature/bridge_wood.glb", "kenney", 1.4, Vector3(0.0, 0.0, -0.7), 0.0],
		["kenney_nature/log.glb", "kenney", 1.5, Vector3(-0.9, 0.0, -1.2), 0.6],
		["kenney_nature/log.glb", "kenney", 1.5, Vector3(0.8, 0.0, 1.3), 2.0],
	],
	# --- the mushroom wood: a fairy ring of giant mushrooms; the lantern tree
	"lm_svampring": [
		["kenney_nature/mushroom_redTall.glb", "kenney", 8.0, Vector3(0.0, 0.0, -1.2), 0.0],
		["kenney_nature/mushroom_tanTall.glb", "kenney", 7.0, Vector3(1.1, 0.0, -0.4), 1.0],
		["kenney_nature/mushroom_redTall.glb", "kenney", 5.5, Vector3(0.7, 0.0, 1.0), 2.0],
		["kenney_nature/mushroom_tanTall.glb", "kenney", 6.0, Vector3(-0.7, 0.0, 1.0), 3.0],
		["kenney_nature/mushroom_redTall.glb", "kenney", 5.0, Vector3(-1.1, 0.0, -0.4), 4.0],
	],
	"lm_lykttrad": [
		["kaykit_forest/Tree_2_A_Color1.gltf", "forest", 0.95, Vector3(0.0, 0.0, 0.0), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.45, Vector3(1.0, 0.9, 0.8), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.45, Vector3(-1.0, 1.0, 0.7), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.45, Vector3(1.1, 1.1, -0.4), 0.0],
		["kaykit_halloween/lantern_hanging.gltf", "lamp", 0.45, Vector3(-1.0, 1.2, -0.5), 0.0],
	],
	# --- Dinodalen: the nest with giant eggs; the tar pit with old bones
	"lm_dinobo": [
		["kenney_nature/log.glb", "kenney", 2.2, Vector3(-0.8, 0.0, 0.0), 0.2],
		["kenney_nature/log.glb", "kenney", 2.2, Vector3(0.8, 0.0, 0.0), -0.2],
		["kenney_nature/log.glb", "kenney", 2.2, Vector3(0.0, 0.0, -0.8), PI / 2.0 + 0.1],
		["kenney_nature/log.glb", "kenney", 2.2, Vector3(0.0, 0.0, 0.8), PI / 2.0 - 0.2],
		["gen:eggs_big", "keep", 1.0, Vector3(0.0, 0.0, 0.0), 0.0],
	],
	"lm_tjargrop": [
		["gen:tar", "keep", 1.0, Vector3(0.0, 0.0, 0.0), 0.0],
		["kenney_nature/rock_largeA.glb", "kenney", 1.0, Vector3(-1.2, 0.0, -0.9), 0.3],
		["kenney_nature/rock_largeA.glb", "kenney", 0.9, Vector3(1.2, 0.0, 0.8), 2.0],
		["kaykit_halloween/ribcage.gltf", "keep", 1.0, Vector3(0.3, -0.2, -0.2), 0.7],
		["kaykit_halloween/bone_C.gltf", "keep", 1.0, Vector3(-0.4, 0.0, 0.5), 1.9],
	],
	# --- the desert: the oasis with two palms and a tent; the sand giant's head
	"lm_oas": [
		["gen:pond", "keep", 1.0, Vector3(0.3, 0.0, 0.2), 0.0],
		["kenney_nature/tree_palmTall.glb", "leaf", 1.8, Vector3(-1.0, 0.0, -0.9), 0.0],
		["kenney_nature/tree_palmTall.glb", "leaf", 1.6, Vector3(1.1, 0.0, -1.0), 2.0],
		["kenney_nature/tent_detailedOpen.glb", "kenney", 1.6, Vector3(-0.9, 0.0, 0.9), 0.6],
		["kenney_nature/lily_large.glb", "leaf", 1.5, Vector3(0.5, 0.02, 0.4), 0.0],
	],
	"lm_sandjatte": [
		["kenney_nature/statue_head.glb", "sand", 2.9, Vector3(0.0, -0.2, 0.0), 0.0],
	],
	# --- the jungle: the ape king's stone throne; the waterfall into a clear pool
	"lm_apkungenstron": [
		["kenney_nature/statue_block.glb", "kenney", 3.6, Vector3(0.0, 0.0, 0.2), 0.0],
		["kenney_nature/statue_column.glb", "kenney", 2.4, Vector3(-0.75, 0.0, -0.5), 0.0],
		["kenney_nature/statue_column.glb", "kenney", 2.4, Vector3(0.75, 0.0, -0.5), 0.0],
		["kenney_nature/statue_block.glb", "kenney", 3.6, Vector3(0.0, 1.4, -0.55), 0.0],
		["kenney_nature/hanging_moss.glb", "leaf", 2.2, Vector3(-0.7, 1.3, -0.3), 0.0],
		["kenney_nature/hanging_moss.glb", "leaf", 2.2, Vector3(0.7, 1.3, -0.3), 0.0],
	],
	"lm_vattenfall": [
		["kenney_nature/cliff_waterfall_rock.glb", "kenney", 3.0, Vector3(0.0, 0.0, -1.2), PI],
		["gen:pond", "keep", 1.0, Vector3(0.0, 0.0, 0.4), 0.0],
		["kenney_nature/rock_largeA.glb", "kenney", 0.8, Vector3(1.2, 0.0, 0.9), 0.5],
		["kenney_nature/lily_small.glb", "leaf", 2.0, Vector3(-0.4, 0.02, 0.6), 0.0],
	],
	# --- the volcano: the fire well, a ring of rock round a flame; the giant turned to stone, kneeling
	"lm_eldbrunn": [
		["kenney_nature/rock_largeA.glb", "kenney", 1.3, Vector3(0.0, 0.0, -1.1), 0.0],
		["kenney_nature/rock_largeA.glb", "kenney", 1.3, Vector3(1.1, 0.0, 0.0), PI / 2.0],
		["kenney_nature/rock_largeA.glb", "kenney", 1.3, Vector3(0.0, 0.0, 1.1), PI],
		["kenney_nature/rock_largeA.glb", "kenney", 1.3, Vector3(-1.1, 0.0, 0.0), -PI / 2.0],
		["gen:embers", "keep", 1.0, Vector3(0.0, 0.0, 0.0), 0.0],
	],
	"lm_forstenadjatte": [
		["kenney_nature/rock_tallA.glb", "kenney", 2.0, Vector3(0.0, 0.0, -0.2), 0.0],
		["kenney_nature/rock_largeA.glb", "kenney", 1.4, Vector3(0.0, 0.0, 0.8), 0.0],
		["kenney_nature/statue_head.glb", "kenney", 1.3, Vector3(0.0, 1.85, -0.1), 0.0],
	],
	# --- Godislandet: the ice-cream tower; the chocolate fountain
	"lm_glasstorn": [["gen:icecream", "keep", 1.0, Vector3.ZERO, 0.0]],
	"lm_chokladfontan": [["gen:fountain", "keep", 1.0, Vector3.ZERO, 0.0]],
	# --- the space base and the moon: the fallen satellite; the moonstone arch
	"lm_satellit": [["gen:satellite", "keep", 1.0, Vector3.ZERO, 0.4]],
	"lm_manporten": [
		["kaykit_halloween/arch.gltf", "moon", 0.7, Vector3(0.0, 0.0, 0.0), 0.0],
	],
}

## Where the flame burns (landmarks with fire) and where the landmark's light sits.
const FIRE := {"lm_vardkase": Vector3(0.0, 3.25, 0.0), "lm_eldbrunn": Vector3(0.0, 0.15, 0.0)}
const LIGHT_AT := {"lm_jatteek": Vector3(0.0, 1.2, 0.9), "lm_lykttrad": Vector3(0.0, 1.2, 0.9), "lm_dvargport": Vector3(0.0, 1.0, 0.8), "lm_eldbrunn": Vector3(0.0, 0.8, 0.0), "lm_mossaltare": Vector3(0.0, 0.8, 0.0)}


static func has(kind: String) -> bool:
	return PARTS.has(kind)


## Where the landmark's lanterns are (its "lamp" parts), for the night glows farm_view.gd puts on them.
static func lamps(kind: String) -> Array:
	var out: Array = []
	for p in PARTS.get(kind, []):
		if str(p[1]) == "lamp":
			out.append((p[3] as Vector3) + Vector3(0.0, 0.35, 0.0))
	return out


## The landmark's parts as MeshInstances under `node`; false when none of them could be made (the cairn is used).
static func build(kind: String, node: Node3D, assets: FarmAssets) -> bool:
	var made := 0
	for p in PARTS.get(kind, []):
		var model := str(p[0])
		var mname := model if model.begins_with("gen:") else "pk:%s|%s|%s" % [model, str(p[1]), str(p[2])]
		var m := assets.mesh(mname)
		if m == null:
			continue
		var mi := MeshInstance3D.new()
		mi.mesh = m
		mi.material_override = assets.prop_mat
		mi.position = p[3]
		mi.rotation.y = float(p[4])
		node.add_child(mi)
		made += 1
	return made > 0
