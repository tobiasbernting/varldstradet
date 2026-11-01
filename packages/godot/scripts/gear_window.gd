class_name GearWindow
extends GameWindow
## The gear window (renderGear in the browser's ui/saga.ts), opened with G or from the pause menu: me in my clothes with
## my class, level and experience, what the gear adds up to (kraft, hälsa, skydd, from `Gear.stats`, the same sums as
## the server's gearStats), the three slots (weapon, offhand, amulet) with what is worn (tap to take it off,
## `saga equip` with item null), the gear in the bag (tap to put it on) and the hero switch (`saga hero`) that swaps the
## farm and the hero outfit out in the world. Clothes are the wardrobe's.

var looks: LookComposer


func _init() -> void:
	title_text = "⚔️ " + Strings.t("gearTitle")
	body_height = 420
	width = 680


func _purse_text(_me: Dictionary) -> String:
	return ""


func _fill() -> void:
	var me := model.my_player()
	var cls_id := Gear.cls_of(me)
	if cls_id == "":
		add_label(Strings.t("gearNoClass"), 18)
		return
	var cls: Dictionary = Data.classes.get(cls_id, {})
	var colour := Color.html(str(cls.get("color", "#ffffff")))
	var stats := Gear.stats(me)
	var xp := Gear.xp_of(me)
	var span := Gear.span(xp)
	# the hero
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	_body.add_child(top)
	var pic := picture(_portrait(me), 96)
	pic.custom_minimum_size = Vector2(64, 128)
	top.add_child(pic)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(col)
	var nm := Label.new()
	nm.text = str(me.get("name", ""))
	nm.add_theme_font_size_override("font_size", 22)
	col.add_child(nm)
	var cl := Label.new()
	cl.text = "%s %s · %s" % [cls.get("emoji", ""), cls.get("name", ""), cls.get("roleName", "")]
	cl.add_theme_font_size_override("font_size", 17)
	cl.add_theme_color_override("font_color", colour)
	col.add_child(cl)
	var lv := Label.new()
	lv.text = "⭐ " + Strings.t("sagaLevelOf", {"n": Gear.level_of_xp(xp), "max": Gear.max_level()})
	col.add_child(lv)
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 16)
	bar.show_percentage = false
	bar.min_value = 0
	bar.max_value = 1
	bar.value = 1.0 if int(span[1]) < 0 else float(xp - int(span[0])) / maxf(1.0, float(int(span[1]) - int(span[0])))
	col.add_child(bar)
	var totals := Label.new()
	totals.text = "💪 %s   ❤️ %s   🛡️ %s" % [Strings.t("sagaStatPower", {"n": roundi((float(stats["power"]) - 1.0) * 100.0)}), Strings.t("sagaHealth", {"hp": Gear.max_hp(me)}), Strings.t("sagaStatArmor", {"n": roundi(float(stats["armor"]) * 100.0)})]
	col.add_child(totals)
	var on := Gear.hero_on(me)
	var hb := make_button(("🧑‍🌾 " + Strings.t("sagaFarmerMode")) if on else ("%s %s" % [cls.get("emoji", ""), Strings.t("sagaHeroMode")]), _hero.bind(not on), "hero")
	col.add_child(hb)
	# what is worn
	var gear := Gear.gear_of(me)
	for slot in Gear.SLOTS:
		var id := str(gear.get(slot, ""))
		var label := Strings.t("gearSlot" + slot)
		if id == "":
			add_row(Data.icon("ui_" + ("sword" if slot == "weapon" else ("shield" if slot == "offhand" else "chest"))), label, Strings.t("gearEmpty"), [], true)
		else:
			var b := make_button(Strings.t("sagaTapOff"), _equip.bind(slot, null), "off:" + slot)
			add_row(Data.item_icon(id), "%s: %s" % [label, Data.item_name(id)], _stats_sub(id, Gear.forge_level(me, id)), [b])
	# the gear in the bag
	add_label("🎒 " + Strings.t("sagaGearBag"), 18, GOLD)
	var any := false
	for st in me.get("inventory", []):
		if not (st is Dictionary):
			continue
		var id := str(st.get("item", ""))
		var kind := str(Data.item(id).get("gearKind", ""))
		if kind == "":
			continue
		if str(gear.get(kind, "")) == id and not (progress_has_gear(me)):
			continue
		any = true
		var fits := (Data.item(id).get("classes", []) as Array).has(cls_id)
		var b2 := make_button(Strings.t("sagaTapOn"), _equip.bind(kind, id), "on:" + id)
		var sub := _stats_sub(id, Gear.forge_level(me, id))
		if (Data.item(id).get("classes", []) as Array).size() > 0:
			var names: Array = []
			for c in Data.item(id).get("classes", []):
				names.append(str(Data.classes.get(str(c), {}).get("name", c)))
			sub += "\n" + ("✓ " if fits else "") + Strings.t("sagaFits", {"classes": ", ".join(names)})
		add_row(Data.item_icon(id), Data.item_name(id), sub, [b2])
	if not any:
		add_label(Strings.t("sagaGearBagEmpty"), 15)


static func progress_has_gear(me: Dictionary) -> bool:
	return Gear.progress(me).get("gear") is Dictionary


func _stats_sub(id: String, level: int) -> String:
	var rar := str(Data.item(id).get("rarity", "common"))
	return "[color=#%s]%s[/color] · %s" % [Data.rarity_color(rar).to_html(false), str(Data.rarity_names.get(rar, rar)), Gear.stat_line(id, level)]


func _hero(on: bool) -> void:
	Net.send({"t": "saga", "a": "hero", "on": on})


func _equip(slot: String, item: Variant) -> void:
	Net.send({"t": "saga", "a": "equip", "slot": slot, "item": item})


func _portrait(me: Dictionary) -> Texture2D:
	if looks == null or not looks.available() or me.is_empty():
		return null
	var frames := looks.frames()
	var at := AtlasTexture.new()
	at.atlas = looks.texture_for(me)
	at.region = Rect2(maxi(0, frames.find("down0")) * 16, 0, 16, 32)
	return at
