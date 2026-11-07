class_name NpcTalk
extends RefCounted
## What a villager shows over the head (`updateNpcTalk` in the browser's clientljs/src/view.ts): a speech bubble when I come
## close (a greeting for the time of day) or when another villager does (a line to them), and otherwise a mark that says who
## has something for me: a yellow ! (a new quest of the saga to take), a yellow ? (a saga quest to hand in), ❗ (a wish of the day
## I can fill from my bag now), ? (a wish I cannot fill yet), and a dim ? while a saga quest goes on. A child who cannot read sees
## who to walk to. The marks are shapes and a bright colour against a dim one (not only red and green), so the colour-blind
## palettes need no change. The server owns the quests; this only reads my record and the day's wishes.

const NEAR_ME_TILES := 2.5 ## a villager greets a player this close (the browser's 2.5 tiles)
const NEAR_NPC_TILES := 2.2 ## and chats with another villager this close
const SAY_MS := 3500
const COOLDOWN_MS := 8000

var _state: Dictionary = {} ## npc id -> {partner, until, text, cooldown_until}
var _rng := RandomNumberGenerator.new()
var said: Array = [] ## the latest lines spoken, {id, text, to_me}: what the check asks about (at most 20)


func _init() -> void:
	_rng.randomize()


## The mark a villager has for me now: {"text": "!", "kind": "new"|"give"|"busy"} or {}. Pure (the check calls it too).
static func mark_for(model: WorldModel, me: Dictionary, npc: String) -> Dictionary:
	var saga := SagaState.marker(me, npc)
	var done: Array = me.get("questsDone", [])
	var wishes := 0
	var can_hand_in := false
	for q in model.quests():
		if str(q.get("npc", "")) != npc or done.has(str(q.get("id", ""))):
			continue
		wishes += 1
		var want: Dictionary = q.get("want", {})
		if model.count_item(str(want.get("item", ""))) >= int(want.get("count", 1)):
			can_hand_in = true
	if saga == "hand":
		return {"text": "?", "kind": "new"}
	if saga == "offer":
		return {"text": "!", "kind": "new"}
	if can_hand_in:
		return {"text": "❗", "kind": "give"}
	if wishes > 0:
		return {"text": "?", "kind": "give"}
	if saga == "busy":
		return {"text": "?", "kind": "busy"}
	return {}


## Once a frame: `npcs` is npc id -> Actor, `me_pos` my place in the scene (a tile is one unit).
func tick(model: WorldModel, npcs: Dictionary, me_pos: Vector3) -> void:
	var me := model.my_player()
	if me.is_empty():
		return
	var now := Time.get_ticks_msec()
	var f := fposmod(model.time_ms + (0.0 if model.time_at == 0 else float(Time.get_ticks_msec() - model.time_at)), Data.constant("DAY_LENGTH_MS", 600000.0)) / Data.constant("DAY_LENGTH_MS", 600000.0)
	for id in npcs.keys():
		var actor: Actor = npcs[id]
		var st: Dictionary = _state.get(id, {"partner": "", "until": 0, "text": "", "cooldown_until": 0})
		_state[id] = st
		var near_me := actor.position.distance_to(me_pos) < NEAR_ME_TILES
		var npc_near := ""
		if not near_me:
			for oid in npcs.keys():
				if oid != id and (npcs[oid] as Actor).position.distance_to(actor.position) < NEAR_NPC_TILES:
					npc_near = str(oid)
		var partner := model.me if near_me else npc_near
		if partner != "" and partner != str(st["partner"]) and now > int(st["cooldown_until"]):
			var lines: Dictionary = Data.book.get("npcLines", {}).get(id, {})
			var pool: Array = lines.get("meet", []) if not near_me else lines.get("morning", []) if f < 0.25 else (lines.get("evening", []) if f > 0.65 else lines.get("day", []))
			if not pool.is_empty():
				st["text"] = str(pool[_rng.randi() % pool.size()]).replace("{name}", str(me.get("name", "")))
				st["until"] = now + SAY_MS + (int(_rng.randf() * 2000.0) if npc_near != "" else 0)
				actor.set_bubble(str(st["text"]), null, float(int(st["until"]) - now) / 1000.0)
				said.append({"id": str(id), "text": str(st["text"]), "to_me": near_me})
				if said.size() > 20:
					said.pop_front()
			st["partner"] = partner
			st["cooldown_until"] = now + COOLDOWN_MS
		if partner == "":
			st["partner"] = ""
		if now < int(st["until"]):
			actor.set_mark("") # (the bubble holds the place)
			continue
		var m := mark_for(model, me, str(id))
		actor.set_mark(str(m.get("text", "")), str(m.get("kind", "new")))
