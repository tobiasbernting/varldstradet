class_name SkeletonFigure
extends RefCounted
## The crypt's undead as KayKit Skeletons figures (`--people3d`, ART.md "Creatures in 3D"): the pack's Warrior,
## Rogue and Minion on the shared rig, with the pack's sword and shield in their hands, tinted per creature. The four
## characters share one skeleton and one 1024 px swatch texture, but the texture is not the Adventurers' 8 × 4 layout
## (its swatches are bone, cloth, metal and leather, not skin and hair), so a creature's colour is the material's
## albedo multiplied over the texture, not a repaint of swatches. The animations (95 of them) are in the Warrior's
## file only; the Rogue's and the Minion's are stripped (tools/strip_glb_animations.py) and play the Warrior's.
##
## What the sprites of these creatures show decides who wears what (KINDS): a creature missing here keeps its voxel body.

const DIR := "res://assets/kaykit_skeletons/"
const SKY := "res://assets/kaykit_skeletons/skeleton_texture.png"
## species -> character, height in metres, tint (white: none), opacity, hand items and the animations it uses
const KINDS := {
	"skelett": {"char": "Warrior", "height": 1.45, "sword": true, "shield": true, "attack": "1H_Melee_Attack_Chop"},
	"draugkung": {"char": "Warrior", "height": 1.9, "tint": Color("#9cff8a"), "tint_k": 0.4, "glow": Color("#9cff8a"), "sword": true, "shield": true, "attack": "1H_Melee_Attack_Slice_Horizontal"},
	"gravvaktare": {"char": "Rogue", "height": 2.2, "sword": true, "attack": "1H_Melee_Attack_Stab"},
	"vandrardraug": {"char": "Minion", "height": 1.5, "tint": Color("#a8805a"), "tint_k": 0.8, "attack": "Unarmed_Melee_Attack_Punch_A"},
	"sjodraug": {"char": "Minion", "height": 1.5, "tint": Color("#7fd6b4"), "tint_k": 0.8, "attack": "Unarmed_Melee_Attack_Punch_A"},
	"gengangare": {"char": "Minion", "height": 1.5, "alpha": 0.4, "attack": "Unarmed_Melee_Attack_Punch_B"},
}
## How the hand items sit in the hand slots (degrees): the sword stands up from the fist, the shield faces out.
const SWORD_ROT := Vector3(0.0, 0.0, 90.0)
const LOOPED := ["Idle", "Walking_A", "Walking_D_Skeletons", "Running_A"]

static var _scenes: Dictionary = {}
static var _lib: AnimationLibrary = null


static func has(species: String) -> bool:
	return KINDS.has(species) and ResourceLoader.exists(DIR + "Skeleton_%s.glb" % KINDS[species]["char"])


static func height_of(species: String) -> float:
	return float(KINDS[species]["height"])


## The `rig` Actor.set_figure() takes for this creature: the Skeletons' animation library and the names it plays.
static func rig(species: String) -> Dictionary:
	return {"libs": [_animations()], "idle": "Skel/Idle", "walk": "Skel/Walking_D_Skeletons", "death": "Skel/Death_A", "hit": "Skel/Hit_A", "attack": "Skel/" + str(KINDS[species]["attack"])}


## The figure for a species: the root named for the animations' tracks (Rig/Skeleton3D under it), or null.
static func build(species: String) -> Node3D:
	if not has(species):
		return null
	var k: Dictionary = KINDS[species]
	var ch: String = k["char"]
	if not _scenes.has(ch):
		_scenes[ch] = load(DIR + "Skeleton_%s.glb" % ch)
	var root := (_scenes[ch] as PackedScene).instantiate() as Node3D
	var ap := root.find_child("AnimationPlayer", true, false)
	if ap != null:
		ap.free() # the actor's own player plays the shared library
	var skel := root.find_child("Skeleton3D", true, false) as Skeleton3D
	_colour(root, k)
	if k.get("sword", false):
		_hold(skel, "Skeleton_Blade", "handslot.r", SWORD_ROT)
	if k.get("shield", false):
		_hold(skel, "Skeleton_Shield_Small_A", "handslot.l", Vector3.ZERO)
	return root


## One library for all the figures (the Warrior's file has the pack's animations): idle and walk loop.
static func _animations() -> AnimationLibrary:
	if _lib == null:
		var scene := load(DIR + "Skeleton_Warrior.glb") as PackedScene
		var root := scene.instantiate()
		var src := root.find_child("AnimationPlayer", true, false) as AnimationPlayer
		_lib = src.get_animation_library("").duplicate(true)
		for n in LOOPED:
			if _lib.has_animation(n):
				_lib.get_animation(n).loop_mode = Animation.LOOP_LINEAR
		_lib.set_meta("name", "Skel")
		root.free()
	return _lib


## The creature's colour over the texture (its own copy of the pack's material), and its eyes' glow.
static func _colour(root: Node3D, k: Dictionary) -> void:
	var tint: Color = k.get("tint", Color.WHITE)
	var paint := Color.WHITE.lerp(tint, float(k.get("tint_k", 1.0)))
	paint.a = float(k.get("alpha", 1.0))
	var copies := {}
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		for s in range(m.mesh.get_surface_count()):
			var src := m.get_active_material(s) as StandardMaterial3D
			if src == null:
				continue
			if not copies.has(src):
				var d := src.duplicate() as StandardMaterial3D
				d.roughness = 1.0
				if src.emission_enabled:
					if k.has("glow"):
						d.emission = k["glow"]
						d.albedo_color = k["glow"]
				else:
					d.albedo_color = paint
					d.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
				if paint.a < 1.0:
					d.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
					d.albedo_color.a = paint.a
				copies[src] = d
			m.set_surface_override_material(s, copies[src])


## A hand item of the pack on a hand slot of the skeleton.
static func _hold(skel: Skeleton3D, item: String, bone: String, rot: Vector3) -> void:
	var path := DIR + item + ".gltf"
	if skel == null or skel.find_bone(bone) < 0 or not ResourceLoader.exists(path):
		return
	var att := BoneAttachment3D.new()
	att.bone_name = bone
	skel.add_child(att)
	var item_node := (load(path) as PackedScene).instantiate() as Node3D
	item_node.rotation_degrees = rot
	att.add_child(item_node)
