class_name Figure3D
extends RefCounted
## The 3D trial's people (`--people3d`): a chibi figure put together from the parts of the KayKit Adventurers
## characters (they share one skeleton, Rig_Medium) and recoloured to a player's look from the character creator.
##
## Every character's texture is the same 8 × 4 grid of swatches, each a vertical gradient: (0,0) skin, (1,0) hair,
## (0,1) and (1,1) the main and second cloth colour, (7,1) trousers, (3,2) boots, (7,0) fur and leather. A look
## repaints those swatches with its colours (keeping each swatch's shading) in a small copy of each texture, so a
## head from one character and a body from another wear the same skin and cloth.
##
## Which parts: the head by hair style; the body and arms by the kind of shirt (plain, armour, mantle, fur); the legs
## by trousers or skirt; a hat by its kind (helmet, pointed hat, fur hood) or none when the pack has nothing like it.

const DIR := "res://assets/kaykit_adventurers/"
const HEADS := {"short": "Knight", "long": "Mage", "curly": "Rogue", "ponytail": "Rogue", "bald": "Barbarian"}
const SW := 64 ## the recoloured copy: 8 px per swatch across, 64 rows per swatch down (the gradients are vertical)
const SH := 256

static var _scenes: Dictionary = {}
static var _textures: Dictionary = {} ## [character, look key] -> ImageTexture
static var _sources: Dictionary = {} ## character -> Image (the small copy before recolouring)


## The body kind of a shirt item (its id says it: the shop's and the saga's names).
static func shirt_kind(item: String) -> String:
	for w in ["rustning", "brynja", "knight", "space"]:
		if item.contains(w):
			return "armour"
	for w in ["mantel", "drakt", "ghost"]:
		if item.contains(w):
			return "mantle"
	for w in ["fall", "skinn", "pals"]:
		if item.contains(w):
			return "fur"
	return "plain"


static func hat_kind(item: String) -> String:
	if item == "":
		return ""
	for w in ["hjalm", "viking", "space", "explorer"]:
		if item.contains(w):
			return "helmet"
	for w in ["oden", "runhatt", "witch", "party", "santa"]:
		if item.contains(w):
			return "pointed"
	for w in ["huva", "dino", "frog", "bunny", "beanie"]:
		if item.contains(w):
			return "hood"
	return ""


## A figure for the colours LookComposer.colours_for() gives: the root (named for the animations' tracks,
## Rig_Medium/Skeleton3D under it) or null when the pack is missing.
static func build(c: Dictionary) -> Node3D:
	var base := _instance("Rogue")
	if base == null:
		return null
	var skel := base.find_child("Skeleton3D", true, false) as Skeleton3D
	for mi in skel.find_children("*", "MeshInstance3D", false, false):
		mi.free()
	var key := str(hash(JSON.stringify([c.get("skin"), c.get("hair"), c.get("shirt_colour"), c.get("pants_colour"), c.get("shoes_colour"), c.get("hat_colour")])))
	var shirt := shirt_kind(str(c.get("shirt", "")))
	var torso := {"plain": "Rogue", "armour": "Knight", "mantle": "Mage", "fur": "Barbarian"}[shirt] as String
	var legs := "Mage" if str(c.get("pants", "")).contains("skirt") or shirt == "mantle" else "Rogue"
	var hat := hat_kind(str(c.get("hat", "")))
	var head: String = HEADS.get(str(c.get("style", "short")), "Knight")
	if hat == "helmet":
		head = "Knight" # the helmet fits the knight's head; long hair would poke through it
	var parts := [[torso, "Body"], [torso, "ArmLeft"], [torso, "ArmRight"], [legs, "LegLeft"], [legs, "LegRight"], [head, "Head"]]
	if shirt == "mantle":
		parts.append(["Mage", "Cape"])
	match hat:
		"helmet":
			parts.append(["Knight", "Helmet"])
		"pointed":
			parts.append(["Mage", "Hat"])
		"hood":
			parts.append(["Barbarian", "BearHat"])
	for p in parts:
		_add_part(skel, str(p[0]), str(p[1]), c, key)
	return base


static func _instance(character: String) -> Node3D:
	if not _scenes.has(character):
		var path := DIR + character + ".glb"
		_scenes[character] = load(path) if ResourceLoader.exists(path) else null
	var scene: Variant = _scenes[character]
	return (scene as PackedScene).instantiate() if scene is PackedScene else null


static func _add_part(skel: Skeleton3D, character: String, part: String, c: Dictionary, key: String) -> void:
	var src_root := _instance(character)
	if src_root == null:
		return
	var src := src_root.find_child("%s_%s" % [character, part], true, false) as MeshInstance3D
	if src != null:
		var mi := MeshInstance3D.new()
		mi.name = "%s_%s" % [character, part]
		mi.mesh = src.mesh
		mi.skin = src.skin
		skel.add_child(mi)
		mi.skeleton = NodePath("..")
		var m := StandardMaterial3D.new()
		m.albedo_texture = _texture(character, src, c, key)
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		m.roughness = 1.0
		mi.material_override = m
	src_root.free()


## The character's texture with the look's colours in its swatches, made once per look.
static func _texture(character: String, src: MeshInstance3D, c: Dictionary, key: String) -> Texture2D:
	var k := [character, key]
	if _textures.has(k):
		return _textures[k]
	if not _sources.has(character):
		var img: Image = null
		var mat := src.get_active_material(0) as BaseMaterial3D
		if mat != null and mat.albedo_texture != null:
			img = mat.albedo_texture.get_image()
			if img.is_compressed():
				img.decompress()
			img.convert(Image.FORMAT_RGBA8)
			img.resize(SW, SH, Image.INTERPOLATE_BILINEAR)
		_sources[character] = img
	var img: Image = _sources[character]
	if img == null:
		return null
	img = img.duplicate()
	var shirt: Variant = c.get("shirt_colour")
	var pants: Variant = c.get("pants_colour")
	_paint(img, 0, 0, c.get("skin"))
	_paint(img, 1, 0, c.get("hair"))
	_paint(img, 0, 1, shirt)
	_paint(img, 1, 1, c.get("hat_colour") if c.get("hat_colour") != null and character in ["Mage", "Barbarian"] else (shirt.lightened(0.15) if shirt is Color else null))
	_paint(img, 2, 1, shirt.darkened(0.25) if shirt is Color else null) # the mage's cape
	_paint(img, 7, 1, pants)
	_paint(img, 3, 2, c.get("shoes_colour"))
	if character == "Barbarian":
		_paint(img, 7, 0, c.get("hat_colour") if c.get("hat_colour") != null else shirt) # the fur
	var tex := ImageTexture.create_from_image(img)
	_textures[k] = tex
	return tex


## Repaints swatch (col, row) in `colour`, keeping its gradient: each pixel's lightness over the swatch's mean.
static func _paint(img: Image, col: int, row: int, colour: Variant) -> void:
	if not (colour is Color):
		return
	var w := SW / 8
	var h := SH / 4
	var mean := 0.0
	for y in range(h):
		mean += img.get_pixel(col * w + w / 2, row * h + y).get_luminance()
	mean = maxf(0.05, mean / h)
	for y in range(h):
		var k := img.get_pixel(col * w + w / 2, row * h + y).get_luminance() / mean
		var px: Color = (colour as Color) * clampf(k, 0.4, 1.6)
		px.a = 1.0
		for x in range(w):
			img.set_pixel(col * w + x, row * h + y, px)
