class_name MapWindow
extends GameWindow
## M9a: the world map with fast travel (the browser's `renderMap` in ui/menus.ts). A grid of the maps round the one I am on
## (seven by seven, north up): the ones I have been to with their place's emoji and name, the others "❔" (the space base's
## square, before anyone has found it, is "🚀"), "här" on mine, a "?" where I have seen a landmark I have not touched and a "🧭"
## where I found them all. A visited map is a button: it sends `{t: 'teleport', to}` and the server puts me down in the middle
## of it. "Åk hem" goes to the farm, "Månen" to the moon when I have been there, and "Minikarta av/på" is the button for the
## corner map (the pad's way to it). The rules are the server's (`teleport()` in sim.ts): not from inside a dungeon or a run,
## only to a map in my `visited`, never into a cave or a building; the window shows what it will refuse as greyed buttons.
## Keys: K or the left trigger (the `worldmap` action) open and close it; the pause menu has a button for it.

const R := 3 ## the grid reaches this many maps each way
const MOON_KEY := "moon"
const HERE_COLOUR := Color("e8b830")

var on_minimap: Callable ## the corner map's toggle (world.gd)
var _grid: GridContainer


func _init() -> void:
	title_text = "🗺️ " + Strings.t("worldMap")
	width = 660
	body_height = 480


func _purse_text(_me: Dictionary) -> String:
	return ""


func _fill() -> void:
	var me := model.my_player()
	var mine := model.my_area_key()
	var inside := _inside_dungeon(mine)
	var here := _outside_key(mine)
	var c := _coords(here)
	var visited: Array = me.get("visited", ["farm"])
	var marks := landmark_marks(me)
	var where := "%s %s" % [Strings.place_emoji(_biome_of(here)), Strings.place(_biome_of(here))]
	add_label("%s: %s" % [Strings.t("youAreHere"), where], 17, Color.WHITE)
	add_label(Strings.t("mapNoJump" if inside else "mapHint"), 14)
	_grid = GridContainer.new()
	_grid.columns = 2 * R + 1
	_grid.add_theme_constant_override("h_separation", 3)
	_grid.add_theme_constant_override("v_separation", 3)
	_grid.name = "Grid"
	_body.add_child(_grid)
	var rumour_key := "a:%d,%d" % [int(Data.constant("SPACEPORT_AX", 1.0)), int(Data.constant("SPACEPORT_AY", 3.0))]
	for dy in range(-R, R + 1):
		for dx in range(-R, R + 1):
			var ax: int = c.x + dx
			var ay: int = c.y + dy
			var k := "farm" if ax == 0 and ay == 0 else "a:%d,%d" % [ax, ay]
			var known := visited.has(k)
			var biome := "" if not known else ("farm" if k == "farm" else _biome_of(k))
			var rumour := not known and k == rumour_key
			var mark: String = marks.get(k, "") if known else ""
			var b := _cell(k, known, biome, rumour, mark, k == here, inside)
			_grid.add_child(b)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	var home := make_button("🏡 " + Strings.t("teleportHome"), _go.bind("farm"), "home")
	home.disabled = inside or mine == "farm"
	home.name = "Home"
	buttons.add_child(home)
	if visited.has(MOON_KEY):
		var moon := make_button("🌙 " + Strings.place("mane"), _go.bind(MOON_KEY), "moon")
		moon.disabled = inside or mine == MOON_KEY
		moon.name = "Moon"
		buttons.add_child(moon)
	var mini := make_button("🧭 %s (%s)" % [Strings.t("minimapToggle"), Strings.t("minimapKey")], _toggle_minimap, "minimap")
	mini.name = "Minimap"
	buttons.add_child(mini)
	_body.add_child(buttons)


func _cell(k: String, known: bool, biome: String, rumour: bool, mark: String, is_here: bool, inside: bool) -> Button:
	var emoji := Strings.place_emoji(biome) if known else ("🚀" if rumour else "❔")
	var name_text := Strings.place(biome) if known else ("?" if rumour else "")
	if is_here:
		name_text = Strings.t("mapHereTag")
	var b := make_button("", _go.bind(k), "cell:" + k)
	b.name = "Cell_" + k.replace(":", "_").replace(",", "_")
	b.custom_minimum_size = Vector2(84, 44)
	b.clip_contents = true
	# the emoji big, the name under it (a button's own text has one size)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", -2)
	col.anchor_right = 1.0
	col.anchor_bottom = 1.0
	b.add_child(col)
	var e := Label.new()
	e.text = emoji
	e.add_theme_font_size_override("font_size", 19)
	e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	e.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(e)
	var n := Label.new()
	n.text = name_text
	n.add_theme_font_size_override("font_size", 13)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(n)
	if mark != "":
		# Upptäcktsboken's mark in the corner: "?" a landmark seen and not touched, "🧭" all found
		var m := Label.new()
		m.text = "?" if mark == "seen" else "🧭"
		m.add_theme_font_size_override("font_size", 15)
		m.add_theme_color_override("font_color", Color("ffd84a"))
		m.mouse_filter = Control.MOUSE_FILTER_IGNORE
		m.anchor_left = 1.0
		m.anchor_right = 1.0
		m.offset_left = -20.0
		m.offset_top = 0.0
		b.add_child(m)
	var tip := Strings.t("notVisited")
	if known:
		tip = Strings.place(biome)
		if mark != "":
			tip += " · " + Strings.t("mapLandmarkSeen" if mark == "seen" else "mapLandmarkFound")
	elif rumour:
		tip = Strings.t("spaceportRumour")
	b.tooltip_text = tip
	# the server's rules: only a map I have been to, never the one I am on, never from inside a dungeon or a run
	b.disabled = not known or is_here or inside
	b.set_meta("known", known)
	if is_here:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.3, 0.24, 0.1, 0.95)
		sb.set_border_width_all(3)
		sb.border_color = HERE_COLOUR
		sb.set_corner_radius_all(6)
		for state in ["normal", "disabled", "hover", "pressed", "focus"]:
			b.add_theme_stylebox_override(state, sb)
	elif not known:
		b.modulate = Color(1, 1, 1, 0.55)
	elif inside:
		b.modulate = Color(1, 1, 1, 0.7)
	return b


## The map I am "at" for the grid: inside a dungeon its arch's map, inside a run the farm, on the moon the space base.
func _outside_key(key: String) -> String:
	var id := Data.dungeon_of_key(key)
	if id != "":
		return str(Data.dungeon(id).get("portal", {}).get("area", "farm"))
	if Data.is_saga_key(key) or key == "dungeon":
		return "farm"
	if key == MOON_KEY:
		return "a:%d,%d" % [int(Data.constant("SPACEPORT_AX", 1.0)), int(Data.constant("SPACEPORT_AY", 3.0))]
	if key.begins_with("g:"):
		var hash := key.rfind("#")
		return key.substr(2, hash - 2) if hash > 2 else "farm"
	if key.begins_with("bath:"):
		return key.substr(5)
	return key


## Inside a dungeon or a run (and the old farm cave): the server refuses the jump.
func _inside_dungeon(key: String) -> bool:
	return Data.is_saga_key(key) or key == "dungeon"


static func _coords(key: String) -> Vector2i:
	if key == "farm" or not key.begins_with("a:"):
		return Vector2i.ZERO
	var parts := key.substr(2).split(",")
	return Vector2i(int(parts[0]), int(parts[1])) if parts.size() == 2 else Vector2i.ZERO


func _biome_of(key: String) -> String:
	if key == "farm":
		return "farm"
	return str(model.biomes.get(key, model.areas.get(key, {}).get("biome", "ang")))


## Upptäcktsboken's marks (landmarkMarks in the browser's ui/saga.ts): for each map where I have seen a landmark, "seen" while
## one of them is still to be touched and "found" once every one seen there is found.
static func landmark_marks(me: Dictionary) -> Dictionary:
	var prog := Gear.progress(me)
	var found := {}
	for id in prog.get("discovered", []):
		found[str(id)] = true
	var marks := {}
	for s in prog.get("seen", []):
		var key := str(s)
		var i := key.rfind(":")
		if i <= 0:
			continue
		var area := key.substr(0, i)
		var id := key.substr(i + 1)
		if not found.has(id):
			marks[area] = "seen"
		elif not marks.has(area):
			marks[area] = "found"
	return marks


func _go(key: String) -> void:
	if _inside_dungeon(model.my_area_key()):
		return
	Net.send({"t": "teleport", "to": key})
	close()


func _toggle_minimap() -> void:
	if on_minimap.is_valid():
		on_minimap.call()
