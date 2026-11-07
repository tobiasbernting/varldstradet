class_name ForgeWindow
extends GameWindow
## Smedjan: Smed-Stina's forge (renderForge and forgeCard in the browser's ui/saga.ts). Opened from her window (the
## "Smedjan" button in talk_window.gd). Two tabs: "Förbättra" lists every piece of gear I wear or carry with its five
## stars, what it gives now and after the next level (Gear.forge_line, the same sums as the server's forgeStats), what the
## next level costs (each material and the coins coloured by whether I can pay) and the button that sends
## `{t:'saga', a:'forge', item}`; "Smid" lists the starter set she makes once for each hero (`{t:'saga', a:'craft', item}`).
## The server checks everything (that I stand by Stina, that I own the piece, the payment) and answers a refusal as a
## toast, which the HUD shows; this window only offers what I can pay for and redraws when my record changes.
## `shown` holds the numbers the rows say, by item, for the checks: {level, now, next, cost (text), can}.

const FAR_TILES := 5.0

var tab := "upgrade"
var shown: Dictionary = {}
var _far_in := 0.0
var _last_forged := ""


func _init() -> void:
	title_text = "🔨 " + Strings.t("forgeTitle")
	body_height = 430
	width = 700


func open_forge() -> void:
	tab = "upgrade"
	_last_forged = _forged_key()
	_set_tabs()
	open_window()


func _set_tabs() -> void:
	clear_tabs()
	add_tab("⚒️ " + Strings.t("forgeTabUpgrade"), tab == "upgrade", _set_tab.bind("upgrade")).set_meta("k", "tab:upgrade")
	add_tab("🔥 " + Strings.t("forgeTabCraft"), tab == "craft", _set_tab.bind("craft")).set_meta("k", "tab:craft")


func _set_tab(t: String) -> void:
	if tab == t:
		_set_tabs()
		return
	tab = t
	Sfx.play("target")
	_set_tabs()
	refresh()


func _fill() -> void:
	shown.clear()
	var me := model.my_player()
	var smith := str(Data.gear.get("smith", "stina"))
	add_bubble(npc_portrait(smith), Strings.t("forgeIntro") if tab == "upgrade" else Strings.t("forgeCraftIntro"))
	if tab == "upgrade":
		_fill_upgrade(me)
	else:
		_fill_craft(me)
	# the anvil rings when a piece gains a level or a new one is smithed (not for the first draw)
	var key := _forged_key()
	if key != _last_forged:
		_last_forged = key
		Sfx.play("pick")


func _forged_key() -> String:
	var me := model.my_player() if model != null else {}
	var f: Variant = Gear.progress(me).get("forge")
	var found: Variant = Gear.progress(me).get("found")
	return "%s|%s" % [JSON.stringify(f if f is Dictionary else {}), JSON.stringify(found if found is Array else [])]


func _fill_upgrade(me: Dictionary) -> void:
	var pieces := Gear.owned(me)
	if pieces.is_empty():
		add_label(Strings.t("forgeNone"), 16)
		return
	for g in pieces:
		var id := str(g["item"])
		var level := Gear.forge_level(me, id)
		var max_ := level >= Gear.forge_max()
		var cost: Dictionary = {} if max_ else Gear.forge_cost(level + 1)
		var parts: Array = [] if cost.is_empty() else Gear.cost_parts(me, cost)
		var can := not cost.is_empty() and Gear.affordable(parts)
		var now := Gear.forge_line(id, level)
		var next := "" if max_ else Gear.forge_line(id, level + 1)
		var rar := str(Data.item(id).get("rarity", "common"))
		var sub := "[color=#%s]%s[/color] · %s%s\n[color=#e8b830]%s[/color]\n%s" % [
			Data.rarity_color(rar).to_html(false), str(Data.rarity_names.get(rar, rar)), Strings.t("gearSlot" + str(g["slot"])),
			(" · " + Strings.t("forgeWorn")) if bool(g["worn"]) else "", Gear.stars(level),
			(now if now != "" else "–") + ("" if max_ else "  →  [b]" + next + "[/b]")]
		if not cost.is_empty():
			sub += "\n" + Gear.parts_text(parts)
		var label := ("🏆 " + Strings.t("forgeMax")) if max_ else ("⚒️ " + Strings.t("forgeUpgrade"))
		var b := make_button(label, _forge.bind(id), "up:" + id)
		b.disabled = not can
		add_row(Data.item_icon(id), Gear.forged_name(id, level), sub, [b], false)
		shown[id] = {"level": level, "now": now, "next": next, "cost": Gear.parts_text(parts), "can": can}


func _fill_craft(me: Dictionary) -> void:
	var found: Array = Gear.progress(me).get("found", []) if Gear.progress(me).get("found") is Array else []
	var ids: Array = (Data.gear.get("forgeCrafts", {}) as Dictionary).keys()
	for id in ids:
		var slot := Gear.slot_of(str(id))
		if slot == "":
			continue
		var have := found.has(id) or Gear.owns(me, str(id))
		var parts := Gear.cost_parts(me, Gear.craft_cost(str(id)))
		var can := not have and Gear.affordable(parts)
		var rar := str(Data.item(str(id)).get("rarity", "common"))
		var sub := "[color=#%s]%s[/color] · %s\n%s" % [Data.rarity_color(rar).to_html(false), str(Data.rarity_names.get(rar, rar)), Strings.t("gearSlot" + slot), Gear.stat_line(str(id), 0)]
		if not have:
			sub += "\n" + Gear.parts_text(parts)
		var b := make_button(("✓ " + Strings.t("forgeOwned")) if have else ("🔨 " + Strings.t("forgeCraft")), _craft.bind(str(id)), "craft:" + str(id))
		b.disabled = not can
		add_row(Data.item_icon(str(id)), Data.item_name(str(id)), sub, [b], have)
		shown[str(id)] = {"owned": have, "cost": Gear.parts_text(parts), "can": can}


func _forge(id: String) -> void:
	Net.send({"t": "saga", "a": "forge", "item": id})
	Sfx.play("target")


func _craft(id: String) -> void:
	Net.send({"t": "saga", "a": "craft", "item": id})
	Sfx.play("target")


## Stina is at her forge: walking away from her closes the window (the server would refuse with "Gå till Smed-Stina").
func _process(delta: float) -> void:
	if not is_open():
		return
	_far_in -= delta
	if _far_in > 0.0:
		return
	_far_in = 0.25
	var n: Variant = model.npc_snaps.get(str(Data.gear.get("smith", "stina")))
	if n is Dictionary:
		var tile := Data.tile()
		if Vector2(float(n.get("x", 0)) - hero.px, float(n.get("y", 0)) - hero.py).length() / tile > FAR_TILES:
			close()
