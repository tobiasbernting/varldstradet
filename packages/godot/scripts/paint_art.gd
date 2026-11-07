class_name PaintArt
extends RefCounted
## What the paint screen, the picture frames and the bag share about a painting: shared/src/paint.ts's palette (16 × 16 cells, a
## cell is one character of a 256-character string: "0".."9", "a", "b" for the palette's colours, "." for paper), the
## framed picture the browser drew (art/painting.ts) and the paint buckets' colours (art/world.ts PAINT_COLORS, which the
## server's `variant` 1..6 indexes). The server only keeps the string (`paint`, the `painting` item's `data`); this draws it.

const PAPER := Color("#f6efdc")
const FRAME := Color("#a5733a")
const FRAME_DARK := Color("#6b4420")
## A paint bucket's colour by the `variant` the server sets on a painted house or wall (0 is unpainted).
const BUCKET: Array = ["", "#c9433c", "#f0d060", "#6a9fd8", "#7fb86a", "#f4f2ec", "#f0a8c8"]

## Textures made from paintings, by the string, least recently used first; at most CACHE_MAX are kept (a frame holds its own texture
## while it hangs, the cache only saves making it again), and `clear_cache` lets them all go when the game closes.
const CACHE_MAX := 48
static var _cache: Dictionary = {}
static var _order: Array = []


static func size() -> int:
	return int((Data.paint as Dictionary).get("size", 16))


static func chars() -> String:
	return str((Data.paint as Dictionary).get("chars", "0123456789ab"))


static func palette() -> Array:
	return (Data.paint as Dictionary).get("palette", [])


static func empty() -> String:
	return ".".repeat(size() * size())


## The colour of a cell's character; null for paper ('.') and anything unknown.
static func colour_of(ch: String) -> Variant:
	var i := chars().find(ch)
	return null if i < 0 else Color.html(str(palette()[i]))


## The wall colour of a paint bucket's variant (Color.TRANSPARENT for 0, unpainted).
static func bucket(variant: int) -> Color:
	if variant <= 0 or variant >= BUCKET.size():
		return Color.TRANSPARENT
	return Color.html(str(BUCKET[variant]))


## Is it a painting the server would take (right length, only palette characters and '.', not empty)?
static func valid(pixels: String) -> bool:
	if pixels.length() != size() * size() or pixels == empty():
		return false
	for i in range(pixels.length()):
		if pixels[i] != "." and chars().find(pixels[i]) < 0:
			return false
	return true


## The drawing alone: 16 × 16, paper where nothing is painted.
static func image_of(pixels: String) -> Image:
	var n := size()
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for i in range(mini(pixels.length(), n * n)):
		var c: Variant = colour_of(pixels[i])
		img.set_pixel(i % n, i / n, c if c is Color else PAPER)
	return img


## The framed picture (art/painting.ts paintingPx): 20 × 20 with a 2 px wooden frame, for a bag slot.
static func framed_image(pixels: String) -> Image:
	var n := size()
	var img := Image.create(n + 4, n + 4, false, Image.FORMAT_RGBA8)
	img.fill(FRAME)
	for k in range(n + 4):
		for e in [0, n + 3]:
			img.set_pixel(k, e, FRAME_DARK)
			img.set_pixel(e, k, FRAME_DARK)
	img.blit_rect(image_of(pixels), Rect2i(0, 0, n, n), Vector2i(2, 2))
	return img


## The drawing as a texture for a picture frame (nearest-filtered by the material; kept by the string).
static func texture_of(pixels: String) -> ImageTexture:
	return _cached("t" + pixels, pixels, false)


## The framed picture for a bag slot or a window.
static func icon_of(pixels: String) -> ImageTexture:
	return _cached("i" + pixels, pixels, true)


static func _cached(key: String, pixels: String, framed: bool) -> ImageTexture:
	if _cache.has(key):
		_order.erase(key)
		_order.append(key)
		return _cache[key]
	var tex := ImageTexture.create_from_image(framed_image(pixels) if framed else image_of(pixels))
	_cache[key] = tex
	_order.append(key)
	while _order.size() > CACHE_MAX:
		_cache.erase(_order.pop_front())
	return tex


## Lets every cached texture go (the game is closing, or a check wants to see none left).
static func clear_cache() -> void:
	_cache.clear()
	_order.clear()


static func cache_size() -> int:
	return _cache.size()


## Does a texture show exactly the painting (every cell its palette colour, paper where nothing is painted)?
static func matches(tex: Texture2D, pixels: String) -> bool:
	if tex == null:
		return false
	var got := tex.get_image()
	var want := image_of(pixels)
	if got == null or got.get_size() != want.get_size():
		return false
	for y in range(want.get_height()):
		for x in range(want.get_width()):
			if not got.get_pixel(x, y).is_equal_approx(want.get_pixel(x, y)):
				return false
	return true


## The flood fill of the fill tool on a list of characters (as the browser's flood): the cell's connected run of the same character.
static func flood(cells: Array, x: int, y: int, to: String) -> void:
	var n := size()
	var from: String = cells[y * n + x]
	if from == to:
		return
	var todo: Array = [Vector2i(x, y)]
	while not todo.is_empty():
		var c: Vector2i = todo.pop_back()
		if c.x < 0 or c.y < 0 or c.x >= n or c.y >= n or cells[c.y * n + c.x] != from:
			continue
		cells[c.y * n + c.x] = to
		todo.append_array([Vector2i(c.x + 1, c.y), Vector2i(c.x - 1, c.y), Vector2i(c.x, c.y + 1), Vector2i(c.x, c.y - 1)])
