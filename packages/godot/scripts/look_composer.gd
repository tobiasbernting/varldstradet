class_name LookComposer
extends RefCounted
## Dresses a player for the farm: draws the layers tools/export-sprites.mts exported (pants, shoes, shirt, hands,
## head, hair, shading, hat), in the atlas's `layer_order` and by its `rules`, into one sheet of 12 frames, and keeps
## it for the next time the same look comes by. The result is pixel for pixel what the browser's drawCharacter draws.

var _images: Dictionary = {} ## file -> Image
var _cache: Dictionary = {} ## look key -> ImageTexture
var _farm: Dictionary = {}


func _init() -> void:
	_farm = Data.atlas.get("farm", {})


func frames() -> Array:
	return _farm.get("frames", [])


func available() -> bool:
	return not _farm.is_empty()


## The sheet texture for a player record's appearance and outfit.
func texture_for(p: Dictionary) -> Texture2D:
	var ap: Dictionary = p.get("appearance", {}) if p.get("appearance") is Dictionary else {}
	var of: Dictionary = p.get("outfit", {}) if p.get("outfit") is Dictionary else {}
	var skin := _nearest(str(ap.get("skin", "#f1c9a5")), _farm.get("skins", []))
	var hair_c := _nearest(str(ap.get("hair", "#5a3a1e")), _farm.get("hair_colors", []))
	var style := str(ap.get("hairStyle", "short"))
	var hat := str(of.get("hat", "")) if of.get("hat") != null else ""
	var shirt := str(of.get("shirt", "")) if of.get("shirt") != null else ""
	var pants := str(of.get("pants", "")) if of.get("pants") != null else ""
	var shoes := str(of.get("shoes", "")) if of.get("shoes") != null else ""
	var k := "%d|%d|%s|%s|%s|%s|%s" % [skin, hair_c, style, hat, shirt, pants, shoes]
	if _cache.has(k):
		return _cache[k]
	var tex := _compose(skin, hair_c, style, hat, shirt, pants, shoes)
	_cache[k] = tex
	return tex


func _nearest(hex: String, list: Array) -> int:
	var want := Color.html(hex) if hex.is_valid_html_color() else Color(0.9, 0.75, 0.6)
	var best := 0
	var best_d := INF
	for i in range(list.size()):
		var c := Color.html(str(list[i]))
		var d := (c.r - want.r) ** 2 + (c.g - want.g) ** 2 + (c.b - want.b) ** 2
		if d < best_d:
			best_d = d
			best = i
	return best


func _layer(key: String) -> Variant:
	var l: Variant = _farm.get("layers", {}).get(key)
	return l if l is Dictionary else null


func _image(file: String) -> Image:
	if _images.has(file):
		return _images[file]
	var img: Image = null
	var path := "res://assets/sprites/" + file
	if ResourceLoader.exists(path):
		var tex: Variant = load(path)
		if tex is Texture2D:
			img = (tex as Texture2D).get_image()
			if img != null:
				if img.is_compressed():
					img.decompress()
				img.convert(Image.FORMAT_RGBA8)
	_images[file] = img
	return img


func _cell(layer: Variant, i: int) -> Image:
	if layer == null:
		return null
	var img := _image(str(layer.get("file", "")))
	if img == null:
		return null
	var fw := int(_farm.get("frame_w", 16))
	var fh := int(_farm.get("frame_h", 32))
	var r := Rect2i(int(layer.get("x", 0)) + i * fw, int(layer.get("y", 0)), fw, fh)
	if not Rect2i(Vector2i.ZERO, img.get_size()).encloses(r):
		return null
	return img.get_region(r)


func _compose(skin: int, hair_c: int, style: String, hat: String, shirt: String, pants: String, shoes: String) -> Texture2D:
	var fw := int(_farm.get("frame_w", 16))
	var fh := int(_farm.get("frame_h", 32))
	var n := int(_farm.get("columns", 12))
	var items: Dictionary = _farm.get("items", {})
	# an item must sit in its own slot, else the default
	var shirt_k := _item_key("shirt", shirt, items)
	var pants_k := _item_key("pants", pants, items)
	var shoes_k := _item_key("shoes", shoes, items)
	var hat_k := _item_key("hat", hat, items) if hat != "" else ""
	var dress := bool((_layer("shirt_" + shirt_k) as Dictionary).get("dress", false)) if _layer("shirt_" + shirt_k) != null else false
	var hat_layer: Variant = _layer("hat_" + hat_k) if hat_k != "" else null
	var tucks: bool = hat_layer != null and bool(hat_layer.get("tucks_hair", false))
	var hair_style := style
	if tucks and (style == "long" or style == "ponytail"):
		hair_style = "short"
	var keys: Array = []
	for layer_name in _farm.get("layer_order", []):
		match str(layer_name):
			"pants":
				if not dress:
					keys.append("pants_" + pants_k)
			"shoes":
				keys.append("shoes_" + shoes_k + ("_dress" if dress else ""))
			"shirt", "shirt_over", "shirt_shade":
				keys.append("%s_%s" % [layer_name, shirt_k])
			"hands", "head", "head_shade":
				keys.append("%s_%d" % [layer_name, skin])
			"hair":
				if style != "bald":
					keys.append("hair_%s_%d" % [hair_style, hair_c])
			"hat":
				if hat_k != "":
					keys.append("hat_" + hat_k)
	var sheet := Image.create(fw * n, fh, false, Image.FORMAT_RGBA8)
	var outline := Color.html(str(_farm.get("outline", {}).get("color", "#2a2420")))
	for i in range(n):
		var frame := Image.create(fw, fh, false, Image.FORMAT_RGBA8)
		for k in keys:
			var layer: Variant = _layer(k)
			if layer == null:
				continue
			if str(k).begins_with("hat_") and layer.get("erase") != null:
				var er := _cell(_layer(str(layer.get("erase"))), i)
				if er != null:
					for y in range(fh):
						for x in range(fw):
							if er.get_pixel(x, y).a > 0.0:
								frame.set_pixel(x, y, Color(0, 0, 0, 0))
			var cell := _cell(layer, i)
			if cell != null:
				frame.blend_rect(cell, Rect2i(0, 0, fw, fh), Vector2i.ZERO)
		_outline(frame, outline, fw, fh)
		sheet.blit_rect(frame, Rect2i(0, 0, fw, fh), Vector2i(i * fw, 0))
	return ImageTexture.create_from_image(sheet)


func _item_key(slot: String, item: String, _items: Dictionary) -> String:
	if item != "" and _layer("%s_%s" % [slot, item]) != null:
		return item
	return "default"


func _outline(frame: Image, colour: Color, fw: int, fh: int) -> void:
	var out: Array = []
	for y in range(fh):
		for x in range(fw):
			if frame.get_pixel(x, y).a > 0.0:
				continue
			var near := false
			for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if nx >= 0 and ny >= 0 and nx < fw and ny < fh and frame.get_pixel(nx, ny).a > 0.0:
					near = true
					break
			if near:
				out.append(Vector2i(x, y))
	for p in out:
		frame.set_pixelv(p, colour)


## The colours of a look for the 3D figures (figure_3d.gd): skin and hair from the creator's palettes, and each
## worn item's main colour, the commonest opaque colour of its pixel layer that is not the outline. Item ids are
## the ones that have a layer (else ""), so the figure dresses exactly what the sprite would.
func colours_for(p: Dictionary) -> Dictionary:
	var ap: Dictionary = p.get("appearance", {}) if p.get("appearance") is Dictionary else {}
	var of: Dictionary = p.get("outfit", {}) if p.get("outfit") is Dictionary else {}
	var skins: Array = _farm.get("skins", [])
	var hairs: Array = _farm.get("hair_colors", [])
	var out := {
		"skin": Color.html(str(skins[_nearest(str(ap.get("skin", "#f1c9a5")), skins)])) if not skins.is_empty() else Color("#f1c9a5"),
		"hair": Color.html(str(hairs[_nearest(str(ap.get("hair", "#5a3a1e")), hairs)])) if not hairs.is_empty() else Color("#5a3a1e"),
		"style": str(ap.get("hairStyle", "short")),
	}
	for slot in ["shirt", "pants", "shoes", "hat"]:
		var item := str(of.get(slot, "")) if of.get(slot) != null else ""
		var k := _item_key(slot, item, {}) if item != "" else "default"
		out[slot] = item if k == item else ""
		out[slot + "_colour"] = _main_colour(_cell(_layer("%s_%s" % [slot, k]), 0))
	return out


func _main_colour(img: Image) -> Variant:
	if img == null:
		return null
	var outline := Color.html(str(_farm.get("outline", {}).get("color", "#2a2420")))
	var counts := {}
	for y in range(img.get_height()):
		for x in range(img.get_width()):
			var c := img.get_pixel(x, y)
			if c.a < 0.5 or c.is_equal_approx(outline):
				continue
			var key := c.to_html(false)
			counts[key] = int(counts.get(key, 0)) + 1
	var best := ""
	for key in counts:
		if best == "" or int(counts[key]) > int(counts[best]):
			best = key
	return Color.html(best) if best != "" else null
