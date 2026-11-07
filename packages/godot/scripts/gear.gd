class_name Gear
extends RefCounted
## What a player's gear and level give in a fight: gearStats, forgeStats, gearOf and the level maths of
## shared/src/saga.ts, read from the data in game.json (the gear's stats, the multipliers, the xp table). The server does
## the fighting with its own copy; this is for the gear window's numbers and the hero switch's checks.

const SLOTS := ["weapon", "offhand", "amulet"]


static func progress(me: Dictionary) -> Dictionary:
	var s: Variant = me.get("saga")
	return s if s is Dictionary else {}


static func cls_of(me: Dictionary) -> String:
	return str(progress(me).get("cls", ""))


static func hero_on(me: Dictionary) -> bool:
	return bool(progress(me).get("hero", false))


static func xp_of(me: Dictionary) -> int:
	return int(progress(me).get("xp", 0))


## The hero level (1..20) of an experience.
static func level_of_xp(xp: int) -> int:
	var table: Array = Data.gear.get("xpLevels", [0])
	var level := 1
	while level < table.size() and xp >= int(table[level]):
		level += 1
	return level


static func level_of(me: Dictionary) -> int:
	return level_of_xp(xp_of(me))


## [from, next] of the level the experience is in (next is -1 at the top).
static func span(xp: int) -> Array:
	var table: Array = Data.gear.get("xpLevels", [0])
	var level := level_of_xp(xp)
	return [int(table[level - 1]), int(table[level]) if level < table.size() else -1]


static func max_level() -> int:
	return (Data.gear.get("xpLevels", [0]) as Array).size()


## The gear on, by slot (saves from before gear: the best weapon in the bag, as gearOf does).
static func gear_of(me: Dictionary) -> Dictionary:
	var g: Variant = progress(me).get("gear")
	if g is Dictionary:
		return g
	var best := ""
	var best_p := 0.0
	var rp: Dictionary = Data.gear.get("rarityPower", {})
	for st in me.get("inventory", []):
		if st is Dictionary:
			var d := Data.item(str(st.get("item", "")))
			if str(d.get("gearKind", "")) == "weapon":
				var p := float(rp.get(str(d.get("rarity", "common")), 1.0))
				if best == "" or p > best_p:
					best = str(st.get("item", ""))
					best_p = p
	return {"weapon": best} if best != "" else {}


static func forge_level(me: Dictionary, id: String) -> int:
	var f: Variant = progress(me).get("forge")
	var n := int(f.get(id, 0)) if f is Dictionary else 0
	return clampi(n, 0, int(Data.gear.get("forgeMax", 5)))


## forgeStats: {power, hp, armor} of a piece at a forge level.
static func forge_stats(id: String, level: int) -> Dictionary:
	var d := Data.item(id)
	var base: Dictionary = d.get("stats", {}) if d.get("stats") is Dictionary else {}
	var st := {"power": float(base.get("power", 0.0)), "hp": float(base.get("hp", 0.0)), "armor": float(base.get("armor", 0.0))}
	var n := clampi(level, 0, int(Data.gear.get("forgeMax", 5)))
	if d.is_empty() or n == 0:
		return st
	match str(d.get("gearKind", "")):
		"weapon":
			st["power"] += 0.06 * n
		"offhand":
			if base.has("armor") and float(base["armor"]) != 0.0:
				st["armor"] += 0.02 * n
			if base.has("power") and float(base["power"]) != 0.0:
				st["power"] += 0.03 * n
		"amulet":
			st["hp"] += 8.0 * n
			if base.has("power") and float(base["power"]) != 0.0:
				st["power"] += 0.02 * n
	return st


## gearStats: what the gear and the level give together.
static func stats(me: Dictionary) -> Dictionary:
	var gear := gear_of(me)
	var cls := cls_of(me)
	var power := 0.0
	var hp := 0.0
	var armor := 0.0
	var fits := false
	var weapon_id := str(gear.get("weapon", ""))
	for slot in SLOTS:
		var id := str(gear.get(slot, ""))
		if id == "":
			continue
		var st := forge_stats(id, forge_level(me, id))
		power += float(st["power"])
		hp += float(st["hp"])
		armor += float(st["armor"])
		if cls != "" and (Data.item(id).get("classes", []) as Array).has(cls):
			fits = true
	var rp: Dictionary = Data.gear.get("rarityPower", {})
	var weapon_mul := float(rp.get(str(Data.item(weapon_id).get("rarity", "common")), 1.0)) if weapon_id != "" else 1.0
	var lvl := 1.0 + float(Data.gear.get("levelBonus", 0.015)) * (level_of(me) - 1)
	var total := weapon_mul * (1.0 + power) * (float(Data.gear.get("classFit", 1.05)) if fits else 1.0) * lvl
	return {"power": minf(float(Data.gear.get("powerCap", 2.0)), total), "hp": hp, "armor": minf(float(Data.gear.get("armorCap", 0.4)), armor)}


## fighterMax: the class's health with the gear's and a little more for every level.
static func max_hp(me: Dictionary) -> int:
	var cls := cls_of(me)
	if cls == "":
		return 0
	var base := float(Data.classes.get(cls, {}).get("hp", 100))
	return roundi((base + float(stats(me)["hp"])) * (1.0 + float(Data.gear.get("levelBonus", 0.015)) * (level_of(me) - 1)))


## "Kraft +5 % · Hälsa +20 · Skydd 10 %" of a piece's own stats.
static func stat_line(id: String, level := 0) -> String:
	var st := forge_stats(id, level)
	var parts: Array = []
	if float(st["power"]) > 0.0:
		parts.append(Strings.t("gearPower", {"n": "+%d" % roundi(float(st["power"]) * 100.0)}))
	if float(st["hp"]) > 0.0:
		parts.append(Strings.t("gearHp", {"n": "+%d" % roundi(float(st["hp"]))}))
	if float(st["armor"]) > 0.0:
		parts.append(Strings.t("gearArmor", {"n": roundi(float(st["armor"]) * 100.0)}))
	return " · ".join(parts)


# ---------------------------------------------------------------------------
# Smedjan (Smed-Stina's forge): what the window shows. The server decides and takes the payment (forgeGear, craftGear in
# shared/src/sagasim.ts); these are the same sums on the data in game.json (gear.forgeCosts, gear.forgeCrafts), so the
# window can say what a level gives and costs and whether I can pay before I press.
# ---------------------------------------------------------------------------


static func forge_max() -> int:
	return int(Data.gear.get("forgeMax", 5))


## "weapon", "offhand" or "amulet" for a piece of gear, "" for anything else.
static func slot_of(id: String) -> String:
	return str(Data.item(id).get("gearKind", ""))


## Every piece I own, as {item, slot, worn}: what I wear first, then the bag's (each once), as the browser's ownedGear.
static func owned(me: Dictionary) -> Array:
	var out: Array = []
	var seen: Dictionary = {}
	var worn := gear_of(me)
	for slot in SLOTS:
		var id := str(worn.get(slot, ""))
		if id != "" and not seen.has(id):
			seen[id] = true
			out.append({"item": id, "slot": slot_of(id) if slot_of(id) != "" else slot, "worn": true})
	for st in me.get("inventory", []):
		if not (st is Dictionary):
			continue
		var id := str(st.get("item", ""))
		var slot := slot_of(id)
		if slot == "" or seen.has(id):
			continue
		seen[id] = true
		out.append({"item": id, "slot": slot, "worn": false})
	return out


## Do I own the piece (worn or in the bag)? As the server's ownsGear.
static func owns(me: Dictionary, id: String) -> bool:
	if gear_of(me).values().has(id):
		return true
	for st in me.get("inventory", []):
		if st is Dictionary and str(st.get("item", "")) == id and int(st.get("count", 0)) > 0:
			return true
	return false


## "Järnsvärd +2" of a name and a forge level.
static func forged_name(id: String, level: int) -> String:
	return "%s +%d" % [Data.item_name(id), level] if level > 0 else Data.item_name(id)


## "★★☆☆☆" of a forge level.
static func stars(level: int) -> String:
	var n := clampi(level, 0, forge_max())
	return "★".repeat(n) + "☆".repeat(forge_max() - n)


## What a piece gives at a forge level, as one short line (its power, health and armour together; a weapon's power is its
## rarity's times what the forge and its own stats add, as gearStats counts it).
static func forge_line(id: String, level: int) -> String:
	var st := forge_stats(id, level)
	var power := float(st["power"])
	if slot_of(id) == "weapon":
		var rp: Dictionary = Data.gear.get("rarityPower", {})
		power = float(rp.get(str(Data.item(id).get("rarity", "common")), 1.0)) * (1.0 + power) - 1.0
	var parts: Array = []
	if power > 0.0005:
		parts.append("💪 +%d %%" % roundi(power * 100.0))
	if float(st["hp"]) > 0.0:
		parts.append("❤️ +%d" % roundi(float(st["hp"])))
	if float(st["armor"]) > 0.0:
		parts.append("🛡️ %d %%" % roundi(float(st["armor"]) * 100.0))
	return " ".join(parts)


## The cost of reaching `level` (1..forgeMax), or {} when there is no such step.
static func forge_cost(level: int) -> Dictionary:
	var c: Variant = (Data.gear.get("forgeCosts", {}) as Dictionary).get(str(level))
	return c if c is Dictionary else {}


## The cost of smithing a piece of the starter set, or {}.
static func craft_cost(id: String) -> Dictionary:
	var c: Variant = (Data.gear.get("forgeCrafts", {}) as Dictionary).get(id)
	return c if c is Dictionary else {}


static func count_of(me: Dictionary, id: String) -> int:
	var n := 0
	for st in me.get("inventory", []):
		if st is Dictionary and str(st.get("item", "")) == id:
			n += int(st.get("count", 0))
	return n


## A cost as parts, measured against my bag and purse: [{items: [ids], need, have}], the coins last with no items.
static func cost_parts(me: Dictionary, cost: Dictionary) -> Array:
	var parts: Array = []
	for pair in cost.get("items", []):
		parts.append({"items": [str(pair[0])], "need": int(pair[1]), "have": count_of(me, str(pair[0]))})
	var any: Variant = cost.get("anyOf")
	if any is Dictionary:
		var have := 0
		for id in any.get("items", []):
			have += count_of(me, str(id))
		parts.append({"items": any.get("items", []), "need": int(any.get("count", 1)), "have": have})
	parts.append({"items": [], "need": int(cost.get("kr", 0)), "have": int(me.get("coins", 0))})
	return parts


static func affordable(parts: Array) -> bool:
	for p in parts:
		if int(p["have"]) < int(p["need"]):
			return false
	return true


## "Sten 6/6 · Guld 3/3 · 40/200 kr" of cost parts, each coloured by whether I have enough (bbcode).
static func parts_text(parts: Array) -> String:
	var out: Array = []
	for p in parts:
		var ok := int(p["have"]) >= int(p["need"])
		var items: Array = p["items"]
		var label := ""
		if items.is_empty():
			label = "%d/%d %s" % [int(p["have"]), int(p["need"]), Strings.t("coins")]
		elif items.size() == 1:
			label = "%s %d/%d" % [Data.item_name(str(items[0])), mini(int(p["have"]), 999), int(p["need"])]
		else:
			var names: Array = []
			for id in items:
				names.append(Data.item_name(str(id)))
			label = "%s %d/%d" % [Strings.t("forgeAnyOf", {"items": ", ".join(names)}), mini(int(p["have"]), 999), int(p["need"])]
		out.append("[color=#%s]%s[/color]" % ["8fe08a" if ok else "e98a7a", label])
	return " · ".join(out)
