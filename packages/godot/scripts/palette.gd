class_name Palette
extends RefCounted
## M8b: the colours of danger and health, by the player's colour setting (Settings.colour_mode): "normal" (what the client always
## looked like), "rg" (deuteranopia and protanopia: red and green look alike, so danger is amber and safe is blue, and the hearts run
## blue, yellow, purple) and "tritan" (tritanopia: blue and green look alike, and yellow and pink: danger is pink-red, safe is green,
## and the hearts run green, orange, red). The numbers were picked against the Machado et al. (2009) simulations of each condition
## (the settings check holds them to a distance in CIELAB, see `distance_under`), because "looks different to me" is not a test.
##
## The colours are also never the only cue: with `Settings.danger_pattern` (on by itself with a colour-blind palette) a mark of a
## coming attack gets diagonal stripes (fx_view.gd) and a thicker bright edge, and the health bars carry their numbers.
## What reads these: fx_view.gd (the marks on the floor and the boss's gathering), hud.gd (the hearts, the bars), world.gd (the bars
## over the heads), settings_window.gd (the sample under the colour choice).

const MODES := {
	"normal": {
		"danger_base": Color(0.85, 0.08, 0.06), "danger_fill": Color(0.95, 0.12, 0.05), "danger_edge": Color(1.0, 0.18, 0.1),
		"stripe": Color(1.0, 0.85, 0.8), "safe": Color(0.45, 1.0, 0.55),
		"hp_high": Color("4fcf5a"), "hp_mid": Color("f2c33a"), "hp_low": Color("e8473a"),
		"foe": Color(0.95, 0.3, 0.25), "target": Color(1.0, 0.75, 0.3), "block": Color(0.6, 0.9, 1.0),
	},
	"rg": {
		"danger_base": Color("ffbf0d"), "danger_fill": Color("ffbf0d"), "danger_edge": Color("fff2a0"),
		"stripe": Color(0.05, 0.04, 0.03), "safe": Color("4099ff"),
		"hp_high": Color("2f7fff"), "hp_mid": Color("ffe13a"), "hp_low": Color("b8007a"),
		"foe": Color("b8007a"), "target": Color("ffe13a"), "block": Color("7fe0ff"),
	},
	"tritan": {
		"danger_base": Color("ff2a6a"), "danger_fill": Color("ff2a6a"), "danger_edge": Color("ffffff"),
		"stripe": Color(1.0, 1.0, 1.0), "safe": Color("39d98a"),
		"hp_high": Color("2fc46a"), "hp_mid": Color("ff9a1f"), "hp_low": Color("e8203a"),
		"foe": Color("e8203a"), "target": Color("ff9a1f"), "block": Color("39d98a"),
	},
}


static func mode() -> String:
	return Settings.colour_mode if MODES.has(Settings.colour_mode) else "normal"


## One of the palette's colours (the keys of MODES["normal"]).
static func colour(key: String, for_mode := "") -> Color:
	var m: String = for_mode if MODES.has(for_mode) else mode()
	return MODES[m][key]


## Stripes and a thick edge on the marks of coming attacks.
static func pattern() -> bool:
	return Settings.danger_pattern or mode() != "normal"


## The colour of the health at `k` (0 to 1): high above half, mid above a quarter.
static func hp(k: float, for_mode := "") -> Color:
	return colour("hp_high", for_mode) if k > 0.5 else (colour("hp_mid", for_mode) if k > 0.25 else colour("hp_low", for_mode))


## A move's own colour (the boss gathering power, the burst when it lands) through the palette: red and green are told apart for
## red-green blindness by moving greens towards blue and reds towards amber; a mend is the "safe" colour. Tritanopia keeps
## the move colours (cyan, violet, orange and green are what it still tells apart) and the marks on the floor carry the danger.
static func move(c: Color, move_name := "") -> Color:
	var m := mode()
	if m == "normal":
		return c
	if move_name == "mend":
		return colour("safe")
	if m == "rg":
		return _shift_rg(c)
	return c


static func _shift_rg(c: Color) -> Color:
	var h := c.h
	var out := h
	if h >= 0.2 and h <= 0.45:
		out = lerpf(0.55, 0.62, (h - 0.2) / 0.25) # green -> blue
	elif h <= 0.07 or h >= 0.95:
		out = 0.11 # red -> amber
	elif h > 0.07 and h < 0.2:
		out = h # orange and yellow stay
	var r := Color.from_hsv(out, c.s, c.v, c.a)
	return r


## How different two colours look to someone with the condition `kind` ("deut", "prot" or "trit"): the CIE76 distance in Lab of
## the Machado et al. (2009) simulation of each. Around 10 reads as "clearly different" for a patch you look at, 30+ as obvious.
## Used by the settings check, and by anyone changing the numbers above.
static func distance_under(a: Color, b: Color, kind: String) -> float:
	return _lab(_simulate(a, kind)).distance_to(_lab(_simulate(b, kind)))


const _MATRICES := {
	"deut": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
	"prot": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
	"trit": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


static func _simulate(c: Color, kind: String) -> Color:
	var lin := c.srgb_to_linear()
	var m: Array = _MATRICES.get(kind, [[1, 0, 0], [0, 1, 0], [0, 0, 1]])
	var v := Vector3(lin.r, lin.g, lin.b)
	var out := Color(
		clampf(float(m[0][0]) * v.x + float(m[0][1]) * v.y + float(m[0][2]) * v.z, 0.0, 1.0),
		clampf(float(m[1][0]) * v.x + float(m[1][1]) * v.y + float(m[1][2]) * v.z, 0.0, 1.0),
		clampf(float(m[2][0]) * v.x + float(m[2][1]) * v.y + float(m[2][2]) * v.z, 0.0, 1.0))
	return out.linear_to_srgb()


static func _lab(c: Color) -> Vector3:
	var l := c.srgb_to_linear()
	var x := 0.4124 * l.r + 0.3576 * l.g + 0.1805 * l.b
	var y := 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b
	var z := 0.0193 * l.r + 0.1192 * l.g + 0.9505 * l.b
	var fx := _f(x / 0.95047)
	var fy := _f(y)
	var fz := _f(z / 1.08883)
	return Vector3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz))


static func _f(t: float) -> float:
	return pow(t, 1.0 / 3.0) if t > 0.008856 else 7.787 * t + 16.0 / 116.0
