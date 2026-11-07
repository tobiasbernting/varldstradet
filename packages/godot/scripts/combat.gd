class_name Combat
extends RefCounted
## The fight from my side, a port of packages/client/src/saga.ts: the monster or friend I aim at, my spells'
## cooldowns (they start when the server says a spell went off, like the short pause after every spell), a press
## while a spell is cooling that waits for it, the potion, and the rules for when nothing may be cast (fallen,
## frozen, a spell on its way). The server does the targeting itself when I send no target (nearest hostile in
## reach, line of sight for a ranged spell, the friend who is hurt worst for a heal, myself for a buff); I send the
## one I aim at when I have one, exactly as the browser does.

signal target_changed(target: Variant) ## an animal id (int), a player id (String) or null
signal pressed(spell: String) ## a spell button was pressed (for the bar's flash), "potion" too
signal cast_sent(spell: String, target: Variant) ## a `cast` left for the server (the bot counts them)

const QUEUE_MS := 1500.0
const IN_FLIGHT_MS := 350.0
const LET_GO_TILES := 16.0

var model: WorldModel
var hero: Hero
var target: Variant = null
var _ready_at: Dictionary = {} ## spell -> server ms when it is ready again
var _gcd_until := 0.0
var _potion_at := 0.0
var _in_flight := 0.0 ## local ms until which a spell is on its way
var _queued := ""
var pressed_at: Dictionary = {} ## spell -> local ms of the last press


func _init(m: WorldModel, h: Hero) -> void:
	model = m
	hero = h


## A new dungeon (or none): a fresh fighter, nothing aimed at.
func reset() -> void:
	_ready_at = {}
	_gcd_until = 0.0
	_potion_at = 0.0
	_in_flight = 0.0
	_queued = ""
	set_target(null)


static func local_ms() -> float:
	return Time.get_ticks_msec()


func in_saga() -> bool:
	return Data.is_saga_key(model.my_area_key())


func my_class() -> String:
	var me := model.my_player()
	return str(me.get("saga", {}).get("cls", "")) if me.get("saga") is Dictionary else ""


func my_spells() -> Array:
	return Data.class_spells(my_class())


func my_flags() -> int:
	var f := model.my_fighter()
	return int(f[2]) if f.size() >= 3 else 0


## Fallen or frozen: no walking and no spells.
func can_act() -> bool:
	return in_saga() and (my_flags() & (Data.flag("down") | Data.flag("frozen"))) == 0


# ---------------------------------------------------------------------------
# The target


func set_target(t: Variant) -> void:
	if typeof(t) == typeof(target) and t == target:
		return
	target = t
	target_changed.emit(t)


## Is this animal one of the dungeon's monsters (a boss, a helper or an ice block too)?
func is_foe(animal: Dictionary) -> bool:
	return not Data.mob(str(animal.get("species", ""))).is_empty()


func animal(id: int) -> Dictionary:
	var a: Variant = model.world_for(model.my_area_key()).get("animals", {}).get(str(id))
	return a if a is Dictionary else {}


## The target if it is still there: a monster on this map, or a friend in this dungeon.
func live_target() -> Variant:
	if target == null:
		return null
	if target is int:
		return target if is_foe(animal(target)) else null
	return target if not model.fighter_of(str(target)).is_empty() else null


## Where a monster or player is now (the server's latest positions; me where I predict I stand), in px.
func pos_of(id: Variant) -> Variant:
	if id is int:
		var snap: Variant = model.animal_snaps.get(str(id))
		if snap is Dictionary:
			return Vector2(float(snap.get("x", 0)), float(snap.get("y", 0)))
		var a := animal(id)
		return Vector2(float(a.get("x", 0)), float(a.get("y", 0))) if not a.is_empty() else null
	if str(id) == model.me:
		return Vector2(hero.px, hero.py)
	var ps: Variant = model.player_snaps.get(str(id))
	if ps is Dictionary:
		return Vector2(float(ps.get("x", 0)), float(ps.get("y", 0)))
	return null


## Monsters near me, nearest first; ice blocks holding a friend and monsters already fighting come first.
func nearby_monsters(max_tiles := 12.0) -> Array:
	var me := Vector2(hero.px, hero.py)
	var list: Array = []
	var w := model.world_for(model.my_area_key())
	for key in w.get("animals", {}).keys():
		var a: Dictionary = w["animals"][key]
		if not is_foe(a):
			continue
		var id := int(key)
		var at: Variant = pos_of(id)
		if at == null:
			continue
		var d: float = (at as Vector2).distance_to(me) / Data.tile()
		if d > max_tiles:
			continue
		if Data.is_block(str(a.get("species", ""))):
			d -= 200.0
		if not model.mob_hp(key).is_empty():
			d -= 100.0
		list.append([d, id])
	list.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
	var out: Array = []
	for e in list:
		out.append(e[1])
	return out


## Tab: the next monster near me.
func cycle_target() -> void:
	var list := nearby_monsters()
	if list.is_empty():
		set_target(null)
		return
	var i := list.find(target) if target is int else -1
	set_target(list[(i + 1) % list.size()])


## Picks the monster nearest to a point on the floor (a click); true if one was there.
func pick_near(px_at: Vector2, within_px := 20.0) -> bool:
	var best: Variant = null
	var best_d := within_px
	for id in nearby_monsters(40.0):
		var at: Variant = pos_of(id)
		if at == null:
			continue
		var d: float = (at as Vector2).distance_to(px_at)
		if d < best_d:
			best_d = d
			best = id
	if best == null:
		return false
	set_target(best)
	return true


# ---------------------------------------------------------------------------
# Spells


## Time left before a spell can go again, and how long that wait is in all (ms).
func cooldown(spell: String) -> Dictionary:
	var now := model.server_now()
	var own := maxf(0.0, float(_ready_at.get(spell, 0.0)) - now)
	var gcd := maxf(0.0, _gcd_until - now)
	if own >= gcd:
		return {"left": own, "total": float(Data.spell(spell).get("cd", 1000))}
	return {"left": gcd, "total": Data.constant("GCD_MS", 400.0)}


func potion_cooldown() -> Dictionary:
	return {"left": maxf(0.0, _potion_at - model.server_now()), "total": Data.constant("POTION_CD", 15000.0)}


func potion_count() -> int:
	return model.count_item("healing_potion")


## Presses spell button `slot` (0–3) of my class.
func cast_slot(slot: int) -> void:
	var spells := my_spells()
	if slot >= 0 and slot < spells.size():
		cast(str(spells[slot]))


func cast(spell: String) -> void:
	if not can_act():
		return
	pressed_at[spell] = local_ms()
	pressed.emit(spell)
	var left := float(cooldown(spell).get("left", 0.0))
	if left > 0.0 or local_ms() < _in_flight:
		# mashing keys still works: a press while the spell is cooling waits for it
		if left < QUEUE_MS:
			_queued = spell
		return
	_send(spell)


## The use key with nothing to use: my everyday attack at the monster I aim at when it is in reach (the browser's
## attackTarget); true if a spell went. Without a target the caller sends `act` and the server swings quietly.
func attack_target() -> bool:
	var t: Variant = live_target()
	if not (t is int) or not can_act():
		return false
	var spell := attack_spell()
	var sp := Data.spell(spell)
	var at: Variant = pos_of(t)
	if sp.is_empty() or not bool(sp.get("attack", false)) or at == null:
		return false
	if (at as Vector2).distance_to(Vector2(hero.px, hero.py)) / Data.tile() > float(sp.get("range", 0)) + 0.6:
		return false
	cast(spell)
	return true


## A class's everyday attack: its first spell aimed at a monster.
func attack_spell() -> String:
	for id in my_spells():
		if bool(Data.spell(str(id)).get("attack", false)):
			return str(id)
	var spells := my_spells()
	return str(spells[0]) if not spells.is_empty() else ""


func _send(spell: String) -> void:
	_queued = ""
	_in_flight = local_ms() + IN_FLIGHT_MS
	var t: Variant = live_target()
	var msg := {"t": "cast", "spell": spell}
	if t != null:
		msg["target"] = t
	Net.send(msg)
	cast_sent.emit(spell, t)


func drink_potion() -> void:
	if not can_act():
		return
	pressed_at["potion"] = local_ms()
	pressed.emit("potion")
	if float(potion_cooldown().get("left", 0.0)) > 0.0:
		return
	if potion_count() <= 0:
		model.toast.emit(Strings.t("sagaNoPotion"))
		return
	Net.send({"t": "potion"})


## Is the spell's target out of reach (or none in reach at all)? For the bar's buttons.
func out_of_reach(spell: String) -> bool:
	var sp := Data.spell(spell)
	var t: Variant = live_target()
	if sp.is_empty() or t == null:
		return false
	var aimed: bool = (bool(sp.get("attack", false)) and t is int) or (bool(sp.get("friend", false)) and t is String)
	if not aimed:
		return false
	var at: Variant = pos_of(t)
	return at != null and (at as Vector2).distance_to(Vector2(hero.px, hero.py)) / Data.tile() > float(sp.get("range", 0)) + 0.6


## Every frame in a dungeon: lets go of a monster left far behind, sends a waiting spell once it is ready.
func tick() -> void:
	if target is int:
		var at: Variant = pos_of(target)
		if at != null and (at as Vector2).distance_to(Vector2(hero.px, hero.py)) > LET_GO_TILES * Data.tile():
			set_target(null)
	if _queued == "" or local_ms() < _in_flight:
		return
	if not can_act():
		_queued = ""
		return
	if float(cooldown(_queued).get("left", 0.0)) <= 0.0:
		_send(_queued)


## A change from the server: my own spell came back (its cooldown starts now), a beaten monster is let go.
func on_change(c: Dictionary) -> void:
	var t := str(c.get("t", ""))
	if t == "spell" and str(c.get("by", "")) == model.me and c.get("by") is String:
		var now := model.server_now()
		var spell := str(c.get("spell", ""))
		if spell == "potion":
			_potion_at = now + Data.constant("POTION_CD", 15000.0)
			return
		var sp := Data.spell(spell)
		if sp.is_empty():
			return
		_ready_at[spell] = now + float(sp.get("cd", 1000))
		_gcd_until = now + Data.constant("GCD_MS", 400.0)
		_in_flight = 0.0
		# the monster the server picked becomes my target, so I can see its health
		var on: Variant = c.get("on")
		if (on is float or on is int) and live_target() == null:
			set_target(int(on))
	elif t == "animal" and c.get("animal") == null and target is int and int(c.get("id", -1)) == target:
		set_target(null)
