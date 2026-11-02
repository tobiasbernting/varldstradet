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
