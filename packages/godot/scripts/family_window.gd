class_name FamilyWindow
extends GameWindow
## Familjen (P, the HUD's 👪 button and the pause menu): everyone in the family, the ones online first, with where they are, and
## "✨ Hoppa till" for the ones online (`{t:'jump', to}`): the server puts me beside them (or them beside me when I am the
## one in a dungeon, and it says no when a dungeon is in the way, which the button's greyed-out state tells in advance as
## the browser does). The browser's renderFamily in client/src/ui/saga.ts.

var looks: LookComposer


func _init() -> void:
	width = 620
	body_height = 380
	title_text = "👪 " + Strings.t("familyTitle")


func _purse_text(_me: Dictionary) -> String:
	return ""


## Where a player is, for the list (placeOf in the browser).
func place_of(area: String) -> String:
	if area == "farm":
		return "%s %s" % [Strings.biome_emoji("farm"), Strings.place("farm")]
	if area.begins_with("bath:"):
		return "🏊 " + Strings.t("bathhouseName")
	if area == "dungeon":
		return "%s %s" % [Strings.biome_emoji("dungeon"), Strings.place("dungeon")]
	if Data.is_run_key(area):
		return Strings.t("familyOnRun")
	if Data.is_saga_key(area):
		return "⚔️ " + str(Data.dungeon(Data.dungeon_of_key(area)).get("name", Strings.t("sagaDungeons")))
	var biome := str(model.biomes.get(area, model.areas.get(area, {}).get("biome", "")))
	return "%s %s" % [Strings.biome_emoji(biome), Strings.place(biome)]


## The family as [player records], online first, then by name.
func members() -> Array:
	var out: Array = model.players().values()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var oa := bool(a.get("online", false))
		var ob := bool(b.get("online", false))
		if oa != ob:
			return oa
		return str(a.get("name", "")) < str(b.get("name", "")))
	return out


## Can I jump to this player now? jumpTo's refusals (shared/src/sagasim.ts): myself, someone not online, I am asleep, the old cave
## or a run's zone on either side; a dungeon takes only those who have picked a way. The button says no before I try.
static func can_jump_to(my_id: String, me: Dictionary, p: Dictionary) -> bool:
	var there := str(p.get("area", ""))
	var here := str(me.get("area", ""))
	if str(p.get("id", "")) == my_id or not bool(p.get("online", false)) or bool(me.get("sleeping", false)):
		return false
	if there == "dungeon" or here == "dungeon" or Data.is_run_key(there) or Data.is_run_key(here):
		return false
	return not (Data.is_saga_key(there) and Gear.cls_of(me) == "")


func can_jump(p: Dictionary) -> bool:
	return can_jump_to(model.me, model.my_player(), p)


func _fill() -> void:
	add_label(Strings.t("familyHint"), 15, Color(1, 1, 1, 0.75))
	var any_other := false
	for p in members():
		var is_me := str(p.get("id", "")) == model.me
		any_other = any_other or not is_me
		var online := bool(p.get("online", false))
		var cls: Dictionary = Data.classes.get(Gear.cls_of(p), {})
		var titles: Array = Gear.progress(p).get("titles", [])
		var name_text := "%s%s%s" % [(str(cls.get("emoji", "")) + " ") if not cls.is_empty() else "", str(p.get("name", "")), (" (%s)" % Strings.t("sagaYou").to_lower()) if is_me else ""]
		if not titles.is_empty():
			name_text += " <%s>" % str(titles[-1])
		var sub := place_of(str(p.get("area", "farm"))) if online else Strings.t("familyAway")
		var buttons: Array = []
		if not is_me and online:
			var b := make_button(Strings.t("familyJump"), _jump.bind(str(p.get("id", ""))), "jump:" + str(p.get("id", "")))
			b.disabled = not can_jump(p)
			buttons.append(b)
		add_row(_face(p), name_text, "[color=#%s]%s[/color]" % ["dddddd" if online else "888888", sub], buttons, not online)
	if not any_other:
		add_label(Strings.t("familyNobodyElse"), 15)


func _face(p: Dictionary) -> Texture2D:
	if looks == null or not looks.available():
		return null
	var sheet := looks.texture_for(p)
	var frames := looks.frames()
	var at := AtlasTexture.new()
	at.atlas = sheet
	at.region = Rect2(maxi(0, frames.find("down0")) * 16, 0, 16, 32)
	return at


func _jump(id: String) -> void:
	# the list may be a moment old: ask again with what I know now (the server answers a refused jump with a toast, not silence)
	if not can_jump(model.players().get(id, {})):
		refresh()
		return
	Net.send({"t": "jump", "to": id})
	close()
