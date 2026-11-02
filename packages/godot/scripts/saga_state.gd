class_name SagaState
extends RefCounted
## Where my saga stands, read from my player record the way shared/src/sagasim.ts reads it: Völvan's chapter (told or
## not, done or not) and the villagers' saga quests (to take, going on, to hand in). The server decides; this is for
## what the Völvan's and the villagers' windows say and which buttons they offer.


static func chapter(me: Dictionary) -> Dictionary:
	var prog := Gear.progress(me)
	var i := int(prog.get("chapter", 0))
	var list: Array = Data.chapters
	return list[i] if i >= 0 and i < list.size() else {}


static func chapter_index(me: Dictionary) -> int:
	return int(Gear.progress(me).get("chapter", 0))


static func heard(me: Dictionary) -> bool:
	return bool(Gear.progress(me).get("heard", false))


static func field_count(me: Dictionary) -> int:
	var q: Variant = Gear.progress(me).get("quests")
	return int(q.get("field:%d" % chapter_index(me), 0)) if q is Dictionary else 0


## chapterDone: every part of the chapter Völvan has told is done.
static func chapter_done(me: Dictionary) -> bool:
	var ch := chapter(me)
	if ch.is_empty():
		return false
	var prog := Gear.progress(me)
	var dungeon: Variant = ch.get("dungeon")
	var field: Variant = ch.get("field")
	if dungeon == null and field == null:
		return str(prog.get("cls", "")) != ""
	var cleared: Array = prog.get("cleared", [])
	return (dungeon == null or cleared.has(str(dungeon))) and (field == null or field_count(me) >= int(field.get("count", 0)))


## "locked", "offer", "active", "ready" or "done" for a saga quest.
static func quest_state(me: Dictionary, q: Dictionary) -> String:
	var prog := Gear.progress(me)
	var qid := str(q.get("id", ""))
	if (prog.get("done", []) as Array).has(qid):
		return "done"
	var going: Dictionary = prog.get("quests", {}) if prog.get("quests") is Dictionary else {}
	if going.has(qid):
		return "ready" if quest_count(me, q) >= int(q.get("count", 1)) else "active"
	var ch := int(Data.dungeon(str(q.get("dungeon", ""))).get("chapter", 0))
	var here := int(prog.get("chapter", 0))
	if (prog.get("cleared", []) as Array).has(str(q.get("dungeon", ""))) or here > ch or (here == ch and bool(prog.get("heard", false))):
		return "offer"
	return "locked"


static func quest_count(me: Dictionary, q: Dictionary) -> int:
	if str(q.get("kind", "")) == "collect":
		var n := 0
		for st in me.get("inventory", []):
			if st is Dictionary and str(st.get("item", "")) == str(q.get("target", "")):
				n += int(st.get("count", 0))
		return n
	var going: Variant = Gear.progress(me).get("quests")
	return int(going.get(str(q.get("id", "")), 0)) if going is Dictionary else 0


## "20 kr + Flowerbox + 2 ⭐" of a reward.
static func reward_text(r: Dictionary) -> String:
	var parts: Array = []
	if int(r.get("coins", 0)) > 0:
		parts.append("%d %s" % [int(r["coins"]), Strings.t("coins")])
	if r.get("item") != null:
		var it: Variant = r["item"]
		parts.append(Data.item_name(str(it.get("item", ""))) if it is Dictionary else Data.item_name(str(it)))
	if int(r.get("stars", 0)) > 0:
		parts.append("%d ⭐" % int(r["stars"]))
	if r.get("title") != null:
		parts.append("👑 " + str(r["title"]))
	return " + ".join(parts)


## A villager's saga quests that are worth showing (to take, going on, or to hand in).
static func quests_of(me: Dictionary, npc: String) -> Array:
	var out: Array = []
	for q in Data.saga_quests:
		if str(q.get("npc", "")) == npc:
			var st := quest_state(me, q)
			if st == "offer" or st == "active" or st == "ready":
				out.append([q, st])
	return out
