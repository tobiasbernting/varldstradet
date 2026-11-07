class_name DemoEnding
extends Node
## The saga's ending on screen (`--demo=ending --once` and `--demo=loke --ending --once`): the changes the server sends when
## Loke falls and when the last chapter is handed in to Völvan, taken from assets/fixtures/ending.json (made by the shared
## rules, `pnpm godot:fixture`), fed to the world, and what is on screen checked. In the dungeon: the "cleared" banner
## with Bifrost's name and the family's toast. In Völvan's village: every banner of the hand-in (a level-up, then the
## chapter's "klart"), every toast (the achievements and the title, which used to wipe each other) shown in order, the
## hero's record past the last chapter, and Völvan's window saying the saga is over. Prints `ending: ok` or `ending: FAIL`.

var world: WorldView
var quit_when_done := false
var _t := 0.0
var _fed := false
var _done := false
var _fails := 0
var _checks := 0
var _in_dungeon := false
var _changes: Array = [] ## what is fed
var _want_banners: Array = [] ## [text, sub, kind] of the banners meant for me
var _want_toasts: Array = []
var _banners_shown: Array = [] ## the distinct banner titles the HUD showed, in order
var _toasts_shown: Array = [] ## the distinct toast texts the HUD showed, in order
var _asked: Array = [] ## the banners the model announced
var _sub_of: Dictionary = {} ## banner title -> the second line shown with it
var _stage := "play"
var _frames := 0
var _fx_before := 0 ## effects in the fx view before the feed
var _burst_t := 0.0
var _burst_seen: Array = [] ## the toasts of the HUD's own burst test, as they were shown


func _ready() -> void:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/fixtures/ending.json"))
	if not (parsed is Dictionary):
		_check(false, "assets/fixtures/ending.json is missing: run `pnpm godot:fixture`")
		_finish()
		return
	_in_dungeon = world.model.my_area_key().begins_with("saga:")
	_changes = parsed.get("fall" if _in_dungeon else "handin", [])
	for c in _changes:
		var to: Variant = c.get("to")
		if to != null and str(to) != world.model.me:
			continue
		if str(c.get("t", "")) == "banner":
			_want_banners.append([str(c.get("text", "")), str(c.get("sub", "")), str(c.get("kind", ""))])
		elif str(c.get("t", "")) == "toast":
			_want_toasts.append(str(c.get("text", "")))
	world.model.banner.connect(func(text: String, sub: String, kind: String) -> void: _asked.append([text, sub, kind]))
	_check(not _want_banners.is_empty() and not _want_toasts.is_empty(), "the fixture has banners and toasts to play (%d, %d)" % [_want_banners.size(), _want_toasts.size()])


func _process(delta: float) -> void:
	if _done:
		return
	_t += delta
	if not _fed:
		if _t > 0.5:
			_fed = true
			_fx_before = world.fx._list.size()
			world.feed({"t": "changes", "changes": _changes})
			_frames = 0
		return
	_frames += 1
	if _frames == 2 and not _in_dungeon:
		# the hand-in's sparkle is drawn at once, and its experience floats over my hero as "+100 xp" (the village's fx view is the hero's area)
		_check(world.fx._list.size() > _fx_before, "the hand-in's sparkle is drawn (%d effects before, %d after)" % [_fx_before, world.fx._list.size()])
		var xp_text := ""
		for c in _changes:
			if str(c.get("t", "")) == "xp":
				xp_text = Strings.t("sagaXpFloat", {"n": int(c.get("n", 0))})
		var floated := false
		for fl in world.fx._floaters:
			if (fl["label"] as Label3D).text == xp_text:
				floated = true
		_check(xp_text != "" and floated, "the hand-in's experience floats over the hero ('%s')" % xp_text)
	if _stage == "burst":
		_burst_step(delta)
		return
	_note(_toasts_shown, world.hud.toast_label.text)
	_note(_banners_shown, world.hud.banner_label.text)
	if world.hud.banner_label.text != "":
		_sub_of[world.hud.banner_label.text] = world.hud.banner_sub.text
	if _stage == "play":
		var titles: Array = _want_banners.map(func(b: Array) -> String: return b[0])
		var all_in := _in_order(_banners_shown, titles) and _in_order(_toasts_shown, _want_toasts)
		if _in_dungeon:
			# the "cleared" banner (after the level-up the boss's experience may bring) comes on screen with its second line, and the toast is up
			if all_in:
				var cleared := ""
				var sub := ""
				for b in _want_banners:
					if b[2] == "cleared":
						cleared = b[0]
						sub = b[1]
				_check(cleared.begins_with("Loke"), "Loke's fall: the server sent a 'cleared' banner naming Loke (%s)" % str(_want_banners))
				_check(_sub_of.get(cleared, "") == sub and sub.contains("Bifrost"), "Loke's fall: '%s' is on screen with '%s' ('%s')" % [cleared, sub, str(_sub_of.get(cleared, ""))])
				_check((Gear.progress(world.model.my_player()).get("cleared", []) as Array).has("loke"), "Loke's fall: Bifrost is in my cleared dungeons")
				_finish()
			elif _t > 20.0:
				_check(false, "Loke's fall: not everything came on screen (banners %s of %s; toasts %s of %s)" % [str(_banners_shown), str(titles), str(_toasts_shown), str(_want_toasts)])
				_finish()
			return
		if all_in or _t > 40.0:
			_check(_in_order(_banners_shown, titles), "the hand-in: every banner is shown, in order (%s of %s)" % [str(_banners_shown), str(titles)])
			_check(_in_order(_toasts_shown, _want_toasts), "the hand-in: every toast is shown, none wiped by the next (%s of %s)" % [str(_toasts_shown), str(_want_toasts)])
			var me := world.model.my_player()
			_check(SagaState.chapter_index(me) == Data.chapters.size() and SagaState.chapter(me).is_empty(), "my record is past the last chapter (%d of %d)" % [SagaState.chapter_index(me), Data.chapters.size()])
			world.play.windows.talk.open_npc(Data.volva)
			_stage = "talk"
			_frames = 0
	elif _stage == "talk":
		_frames += 1
		if _frames >= 3:
			_check(_has_text(world.play.windows.talk, Strings.t("sagaAllDone")), "Völvan's window says the saga is over ('%s')" % Strings.t("sagaAllDone"))
			world.play.windows.talk.close()
			# the HUD's toast queue, on its own: A B C A in one frame, a friend's D and a repeated B half a second later: A B C D, each once
			for t in ["A", "B", "C", "A"]:
				world.hud.show_toast(t)
			_burst_t = 0.0
			_stage = "burst"
			_burst_sent = false


var _burst_sent := false


func _burst_step(delta: float) -> void:
	_burst_t += delta
	_note(_burst_seen, world.hud.toast_label.text)
	if not _burst_sent and _burst_t > 0.6:
		_burst_sent = true
		world.hud.show_toast("D")
		world.hud.show_toast("B")
	if _burst_t > 30.0 or (_burst_seen.size() >= 4 and world.hud.toast_label.text == "D" and _burst_t > 12.0):
		_check(_burst_seen == ["A", "B", "C", "D"], "the HUD's toast queue: a repeat drops nothing and a toast in the middle of a burst joins it (%s)" % str(_burst_seen))
		_finish()


## Adds a banner title or toast text to the list of what the HUD has shown (when it is new).
func _note(list: Array, text: String) -> void:
	if text != "" and (list.is_empty() or list[-1] != text):
		list.append(text)


## `got` has every `want` in order (other entries may sit between them).
func _in_order(got: Array, want: Array) -> bool:
	var i := 0
	for g in got:
		if i < want.size() and str(g) == str(want[i]):
			i += 1
	return i == want.size()


func _has_text(node: Node, text: String) -> bool:
	if node is Label and (node as Label).text.contains(text):
		return true
	for c in node.get_children():
		if _has_text(c, text):
			return true
	return false


func _check(ok: bool, what: String) -> void:
	_checks += 1
	if not ok:
		_fails += 1
		print("ending: FAIL %s" % what)


func _finish() -> void:
	if _done:
		return
	_done = true
	print("ending: %s (%d checks, %d failed)" % ["ok" if _fails == 0 and _checks > 0 else "FAIL", _checks, _fails])
	if quit_when_done:
		(get_tree().current_scene as Main).quit_clean()
