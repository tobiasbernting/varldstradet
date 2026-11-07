class_name FarmBotBooks
extends RefCounted
## The farmer's M9b steps (farm_bot.gd runs them): the Gårdsbok on B, the journal on K and Völvan's journal tab, the finds, the level chip
## and the saga tracker on the HUD, the help on H and ?, the pause menu's way to the books, the pet buttons, and (from the village,
## with a second player `tools/mate.mts` online on the farm) the family window and "Hoppa till". Every step goes through the keys, the
## clicks and the buttons a person uses; what the windows show is put in the report (`books`), and tools/bot-check.mts compares it with
## the server's own record of the player (the achievements it has and how far each is) and with the shared data.

var bot: FarmBot
var world: WorldView
var model: WorldModel
var windows: FarmWindows
var home: FarmBotHome


func _init(b: FarmBot, h: FarmBotHome) -> void:
	bot = b
	world = b.world
	model = world.model
	windows = world.play.windows
	home = h
	bot._report["books"] = {}


func _books() -> Dictionary:
	return bot._report["books"]


func _nodes_named(win: GameWindow, prefix: String) -> Array:
	var out: Array = []
	for c in win._body.get_children():
		for d in _descend(c):
			if str(d.name).begins_with(prefix):
				out.append(d)
	return out


func _descend(n: Node) -> Array:
	var out: Array = [n]
	for c in n.get_children():
		out.append_array(_descend(c))
	return out


func _texts(win: GameWindow) -> String:
	var parts: PackedStringArray = []
	for c in win._body.get_children():
		for d in _descend(c):
			if d is Label:
				parts.append((d as Label).text)
			elif d is RichTextLabel:
				parts.append((d as RichTextLabel).get_parsed_text())
	return "\n".join(parts)


func _close_all() -> void:
	windows.close_all()
	await bot._wait(0.15)


## B, K: the Gårdsbok and the journal (and the finds) through their keys.
func books() -> void:
	await _close_all()
	# the Gårdsbok on B
	bot._press_action("book")
	var open := await bot._until(func() -> bool: return windows.book.is_open() and windows.book.tab == "book", 3.0)
	await bot._wait(0.3)
	var rows := _nodes_named(windows.book, "ach_")
	var shown := {}
	var medals := 0
	for r in rows:
		var id := str(r.name).substr(4)
		var unlocked := false
		for d in _descend(r):
			if d is Label and (d as Label).text == "🏅":
				unlocked = true
		var k := -1.0
		for d in _descend(r):
			if d.name == "Fill" and d is ColorRect:
				k = (d as ColorRect).anchor_right
		shown[id] = {"unlocked": unlocked, "k": snappedf(k, 0.0001)}
		medals += 1 if unlocked else 0
	_books()["achievements"] = shown
	var chest_fallbacks: Array = []
	for a in Data.book["achievements"]:
		if Data.icon("item_" + str(a["icon"])) == null and not BookPages.NO_ICON.has(str(a["icon"])):
			chest_fallbacks.append(str(a["icon"]))
	bot._step("every achievement has a picture", chest_fallbacks.is_empty(), "no Gårdsbok row falls back to the chest (without: %s)" % ", ".join(chest_fallbacks))
	var head := _texts(windows.book).get_slice("\n", 0)
	bot._step("the Gårdsbok", open and rows.size() == Data.book["achievements"].size() and rows.size() >= 70, "B opened it: %d bragder drawn (%d done), \"%s\"" % [rows.size(), medals, head])
	await bot._shot("book", 0.1)
	# B again closes it
	bot._press_action("book")
	var closed := await bot._until(func() -> bool: return not windows.book.is_open(), 3.0)
	bot._step("the Gårdsbok closes on B", closed, "the same key shuts it")
	# a pad can reach every button of the window: the tabs and the footer's OK take the focus, and at the end of a page "down" goes on to them
	windows.book.open_at("book")
	await bot._wait(0.3)
	var reach_ok := true
	var buttons: Array = windows.book._find_buttons(windows.book._tabs) + windows.book._find_buttons(windows.book._foot)
	for b in buttons:
		reach_ok = reach_ok and (b as Button).focus_mode == Control.FOCUS_ALL and (b as Button).is_visible_in_tree() and not (b as Button).disabled
	windows.book._scroll.scroll_vertical = 0
	var top_edge: bool = windows.book.scroll_at_edge(false) and not windows.book.scroll_at_edge(true)
	windows.book._scroll.scroll_vertical = 100000
	await bot._wait(0.1)
	var bottom_edge: bool = windows.book.scroll_at_edge(true)
	bot._step("a pad reaches the tabs, the page and the OK button", reach_ok and not buttons.is_empty() and top_edge and bottom_edge, "%d buttons take the focus; \"down\" scrolls the page and, at its end, goes on to the footer (top edge %s, bottom edge %s)" % [buttons.size(), str(top_edge), str(bottom_edge)])
	windows.book.close()
	await bot._wait(0.15)
	# the journal on K
	bot._press_action("journal")
	open = await bot._until(func() -> bool: return windows.book.is_open() and windows.book.tab == "journal", 3.0)
	await bot._wait(0.3)
	var me := model.my_player()
	var chapters := _nodes_named(windows.book, "chapter_").size()
	var dungeons := _nodes_named(windows.book, "dungeon_").size()
	var levels := _nodes_named(windows.book, "level_").size()
	var level_text := _texts(windows.book)
	var journal := {"chapters": chapters, "dungeons": dungeons, "levels": levels, "level": Gear.level_of(me), "chapter": SagaState.chapter_index(me), "has_level_line": level_text.contains(Strings.t("sagaLevelOf", {"n": Gear.level_of(me), "max": Gear.max_level()})), "cleared": (Gear.progress(me).get("cleared", []) as Array).size()}
	_books()["journal"] = journal
	bot._step("the journal", open and chapters == SagaState.chapter_index(me) + 1 and dungeons == Data.dungeons.size() and levels == Data.level_rewards.size() and journal["has_level_line"], "K opened it: %d chapters (the saga is at %d), %d dungeons, %d level rewards, hero level %d" % [chapters, SagaState.chapter_index(me), dungeons, levels, Gear.level_of(me)])
	await bot._shot("journal", 0.1)
	# the dungeons' best times: the server (DEV_TELEPORT) records one through the real path and says so in a `sagaBest` change; the card shows
	# the server's own time and name
	Net.send({"t": "dev", "a": "sagaBest", "id": "draug", "ms": 754000})
	var got := await bot._until(func() -> bool: return model.farm.get("sagaBest") is Dictionary and (model.farm["sagaBest"] as Dictionary).has("draug"), 4.0)
	await bot._wait(0.3)
	var card_text := ""
	for d in _nodes_named(windows.book, "dungeon_draug"):
		for e in _descend(d):
			if e is RichTextLabel:
				card_text += (e as RichTextLabel).get_parsed_text() + "\n"
	var server_best: Dictionary = (model.farm["sagaBest"] as Dictionary).get("draug", {}) if got else {}
	var shown_time := SagaState.clock(float(server_best.get("ms", 0)))
	bot._step("the family's best time", got and shown_time == "12:34" and card_text.contains(shown_time) and card_text.contains(str(model.my_player().get("name", "?"))), "the server recorded %s for Draugkryptan (dev sagaBest) and the card shows \"%s\" with my name" % [str(server_best), shown_time])
	# the finds on a tab
	var tab_ok := home._press(windows.book, "tab:" + Strings.t("sagaFindsTab"))
	await bot._wait(0.3)
	var total := 0
	for g in Data.book["landmarks"]:
		total += (g["items"] as Array).size()
	var groups := _nodes_named(windows.book, "finds_").size()
	var found := (Gear.progress(model.my_player()).get("discovered", []) as Array).size()
	var finds_text := _texts(windows.book)
	_books()["finds"] = {"total": total, "found": found, "groups": groups, "unknown": finds_text.count("???"), "all_line": finds_text.contains(Strings.t("sagaFindsAll", {"n": found, "total": total}))}
	bot._step("the Upptäcktsbok", tab_ok and groups == Data.book["landmarks"].size() and finds_text.count("???") == total - found and finds_text.contains(Strings.t("sagaFindsAll", {"n": found, "total": total})), "%d places in %d biomes, %d found: the rest are ???" % [total, groups, found])
	await bot._shot("finds", 0.1)
	windows.book.close()
	await bot._wait(0.2)


## The HUD: the level chip (a click opens the journal), the tracker (folds on a click), the side buttons.
func hud() -> void:
	await _close_all()
	var hud: HudLayer = world.hud
	var me := model.my_player()
	var chip: Label = hud.farm_labels["level"]
	var want := "⭐ " + Strings.t("sagaLevelChip", {"n": Gear.level_of(me)})
	var panel: Control = chip.get_meta("panel")
	bot._step("the level chip", chip.text == want and panel.visible, "the HUD shows \"%s\" for hero level %d" % [chip.text, Gear.level_of(me)])
	# a click on the chip: the left button pressed, delivered to the chip's own handler (headless there is no pointer for the engine to
	# hit-test with, so the event is handed to the control; the chip must be a visible, mouse-stopping control with a size)
	var at := panel.get_global_rect().get_center()
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = true
	ev.position = panel.size / 2.0
	ev.global_position = at
	var hit := panel.is_visible_in_tree() and panel.mouse_filter == Control.MOUSE_FILTER_STOP and panel.size.x > 20.0
	panel.gui_input.emit(ev)
	var opened := await bot._until(func() -> bool: return windows.book.is_open() and windows.book.tab == "journal", 3.0)
	bot._step("the level chip opens the journal", opened and hit, "a left click on the chip (at %s, %s) opened the journal" % [str(at), "a visible, mouse-stopping control" if hit else "NOT clickable"])
	windows.book.close()
	await bot._wait(0.2)
	# the tracker
	var lines := SagaState.tracker_lines(model.my_player())
	var shown: Array = []
	for l in hud.tracker_lines.get_children():
		shown.append((l as Label).text)
	var first_ok: bool = not lines.is_empty() and shown.size() == lines.size() and shown[0].ends_with(str(lines[0]["text"]))
	_books()["tracker"] = {"visible": hud.tracker.visible, "lines": shown}
	bot._step("the saga tracker", hud.tracker.visible and first_ok, "the tracker is on the HUD with %d lines: \"%s\"" % [shown.size(), shown[0] if not shown.is_empty() else ""])
	await bot._shot("tracker", 0.1)
	hud.tracker_head.pressed.emit()
	await bot._wait(0.2)
	var folded := hud.tracker_lines.get_child_count() == 0
	hud.tracker_head.pressed.emit()
	await bot._wait(0.2)
	bot._step("the tracker folds", folded and hud.tracker_lines.get_child_count() == lines.size(), "a click on the header hid the lines, another showed them again")
	# the family button is there; the pet buttons only with a pet or a horse
	var pets_before := hud.stay_button.visible
	var before: int = bot._report["toasts"].size()
	hud.set_side_buttons(true)
	hud.stay_button.pressed.emit()
	var told := await bot._until(func() -> bool: return bot._report["toasts"].slice(before).has(Strings.t("noPetsHere")), 3.0)
	hud.set_side_buttons(model.owns_callable())
	# which animals count: the shared isCallable (a table: pets, horses, mounts and tamed wild animals; never a vehicle, a stranger's, a wild one nobody owns)
	var table := [["dog", "me", true], ["cat", "me", true], ["horse", "me", true], ["fox", "me", true], ["sleipner", "me", true], ["fox", "", false], ["dog", "other", false], ["car", "me", false], ["hen", "me", false]]
	var table_ok := true
	for row in table:
		var got := WorldModel.is_callable({"species": row[0], "owner": row[1] if row[1] != "me" else model.me}, model.me)
		if got != bool(row[2]):
			table_ok = false
			bot._error("is_callable(%s owned by %s) = %s, the rules say %s" % [row[0], row[1], str(got), str(row[2])])
	bot._step("which animals the pet buttons answer for", table_ok, "%d cases of isCallable: pets, horses, tamed wild animals yes; vehicles, strangers', unowned wild and hens no" % table.size())
	bot._step("the family and pet buttons", hud.family_button.visible and not pets_before and told and not hud.stay_button.visible, "👪 is on the HUD; stay and whistle show only with a pet (none here); pressed, stay reached the server (\"%s\")" % Strings.t("noPetsHere"))


## H and ?: the help, every topic.
func help() -> void:
	await _close_all()
	bot._press_action("help")
	var open := await bot._until(func() -> bool: return windows.help.is_open(), 3.0)
	await bot._wait(0.3)
	var topics: Array = Data.book["help"]
	var ok_all := true
	var rows_total := 0
	var placeholder := false
	var houses := 0
	for t in topics:
		windows.help._pick(str(t["id"]))
		await bot._wait(0.05)
		var txt := _texts(windows.help)
		var n := 0
		for c in windows.help._body.get_children():
			if c is HBoxContainer and c.get_child_count() >= 2 and c.get_child(0) is Label and (c.get_child(0) as Label).text.ends_with("."):
				n += 1
		rows_total += n
		if n != (t["steps"] as Array).size():
			ok_all = false
		if txt.contains("{recipe:") or txt.contains("{price:") or txt.contains("{name:"):
			placeholder = true
		if bool(t.get("houses", false)):
			houses = (txt.count("→"))
	_books()["help"] = {"topics": topics.size(), "rows": rows_total, "placeholder": placeholder, "houses": houses}
	bot._step("the help", open and ok_all and not placeholder and houses == Data.book["houses"].size(), "H opened it: %d topics, %d steps drawn, the animal-house list has %d rows, no placeholders left" % [topics.size(), rows_total, houses])
	windows.help._pick("controls")
	await bot._wait(0.2)
	await bot._shot("help", 0.1)
	# ? closes it again, and opens it again
	var q := InputEventKey.new()
	q.keycode = KEY_QUESTION
	q.physical_keycode = KEY_SLASH
	q.pressed = true
	Input.parse_input_event(q)
	var closed := await bot._until(func() -> bool: return not windows.help.is_open(), 3.0)
	Input.parse_input_event(q)
	var reopened := await bot._until(func() -> bool: return windows.help.is_open(), 3.0)
	bot._step("the help on ?", closed and reopened, "? shut it and opened it again")
	windows.help.close()
	await bot._wait(0.2)


## The pause menu has the books, the family and the help (a pad's way: Start, then A), and each button opens its window.
func pause_menu() -> void:
	await _close_all()
	var pressed_all := true
	for which in ["book", "journal", "family", "help"]:
		world.menu.open()
		await bot._wait(0.1)
		var b := _menu_button(which)
		if b == null:
			pressed_all = false
			continue
		b.pressed.emit()
		var win: GameWindow = {"book": windows.book, "journal": windows.book, "family": windows.family, "help": windows.help}[which]
		pressed_all = pressed_all and await bot._until(func() -> bool: return win.is_open(), 2.0)
		windows.close_all()
		await bot._wait(0.15)
	bot._step("the pause menu opens the books", pressed_all, "Paus has Gårdsbok, Sagans dagbok, Familjen and Hjälp, and each opens its window")


func _menu_button(which: String) -> Button:
	return world.menu.find_child("Ask_" + which, true, false) as Button


## Völvan's window has a journal tab.
func volva_journal() -> void:
	await _close_all()
	if not await home._talk_to(Data.volva):
		bot._step("Völvan's journal tab", false, "could not get her window open")
		return
	await bot._wait(0.3)
	var pressed := home._press(windows.talk, "tab:" + Strings.t("sagaJournalTab"))
	await bot._wait(0.3)
	var txt := _texts(windows.talk)
	bot._step("Völvan's journal tab", pressed and txt.contains(Strings.t("sagaChapters")) and txt.contains(Strings.t("sagaDungeons")), "her window has the journal as a tab: chapters and dungeons are there")
	await bot._shot("volva-journal", 0.1)
	windows.talk.close()


## P: the family, and a jump to the second player (tools/mate.mts, online on the farm) from wherever I stand.
func family() -> void:
	await _close_all()
	var mate_id := ""
	for id in model.players().keys():
		if str(model.players()[id].get("name", "")) == "Bot-Syskon":
			mate_id = str(id)
	if mate_id == "":
		bot._step("the family window", false, "the second player was not in the family list at all")
		return
	await bot._until(func() -> bool: return bool(model.players()[mate_id].get("online", false)), 6.0)
	bot._press_action("family")
	var open := await bot._until(func() -> bool: return windows.family.is_open(), 3.0)
	await bot._wait(0.3)
	var fam: FamilyWindow = windows.family
	var members := fam.members()
	var txt := _texts(fam)
	var where := fam.place_of(str(model.players()[mate_id].get("area", "farm")))
	var rows := 0
	for m in members:
		if txt.contains(str(m.get("name", ""))):
			rows += 1
	# when "Hoppa till" is on: the same table as shared/src/saga.test.ts's jumpTo cases (each there is a refusal of the server or a jump that works)
	var cases := [
		["offline", "farm", "farm", false, false, true, false], ["asleep", "farm", "farm", true, true, true, false],
		["they are in the old cave", "farm", "dungeon", true, false, true, false], ["I am in the old cave", "dungeon", "farm", true, false, true, false],
		["they are in a run", "farm", "saga:run1z0", true, false, true, false], ["I am in a run", "saga:run1z0", "farm", true, false, true, false],
		["a dungeon and no class", "farm", "saga:draug", true, false, false, false], ["a dungeon with a class", "farm", "saga:draug", true, false, true, true],
		["both on the farm", "farm", "farm", true, false, false, true],
	]
	var jump_ok := true
	for c in cases:
		var me_rec := {"id": "me", "area": c[1], "sleeping": c[4], "saga": {"cls": "helare"} if c[5] else {}}
		var them := {"id": "them", "area": c[2], "online": c[3]}
		var got := FamilyWindow.can_jump_to("me", me_rec, them)
		if got != bool(c[6]):
			jump_ok = false
			bot._error("can_jump_to(%s) = %s, jumpTo says %s" % [c[0], str(got), str(c[6])])
	bot._step("Hoppa till is on exactly where jumpTo accepts", jump_ok, "%d cases (offline, asleep, the old cave, a run, a dungeon with and without a class, the farm)" % cases.size())
	# where everyone can be, named (not "Äng" for what the table does not know)
	var places := {"farm": Strings.place("farm"), "dungeon": Strings.place("dungeon"), "bath:1": Strings.t("bathhouseName"), "saga:draug": str(Data.dungeon("draug").get("name", "")), "saga:run2z1": Strings.t("familyOnRun"), "a:1,0": ""}
	var places_ok := true
	for k in places.keys():
		var named := fam.place_of(str(k))
		if str(places[k]) != "" and not named.contains(str(places[k])):
			places_ok = false
			bot._error("place_of(%s) = %s, expected %s in it" % [k, named, places[k]])
		if named.contains(Strings.place("ang")) and str(k) != "a:1,0" and Strings.place("ang") != str(places[k]):
			places_ok = false
	bot._step("the family window names every place", places_ok, "the farm, the old cave, the bath house, a dungeon and a run are each named: %s" % ", ".join(PackedStringArray(places.keys().map(func(k): return fam.place_of(str(k))))))
	_books()["family"] = {"members": members.size(), "rows": rows, "mate_online": bool(model.players()[mate_id].get("online", false)), "place": where}
	bot._step("the family window", open and rows == members.size() and txt.contains(where) and bool(model.players()[mate_id].get("online", false)), "P opened it: %d in the family, %s is online \"%s\"" % [members.size(), "Bot-Syskon", where])
	await bot._shot("family", 0.1)
	# the list follows the family while it is open: the mate goes offline (a player change from the server), the button goes; back, it returns
	var rec: Dictionary = (model.players()[mate_id] as Dictionary).duplicate(true)
	var gone := rec.duplicate(true)
	gone["online"] = false
	model.apply({"t": "changes", "changes": [{"t": "player", "id": mate_id, "player": gone}]})
	await bot._wait(0.3)
	var off_ok := not home._has_button(fam, "jump:" + mate_id)
	model.apply({"t": "changes", "changes": [{"t": "player", "id": mate_id, "player": rec}]})
	await bot._wait(0.3)
	var on_ok := home._has_button(fam, "jump:" + mate_id)
	bot._step("the family list follows the family", off_ok and on_ok, "Bot-Syskon offline: no \"Hoppa till\"; online again: it is back")
	var from := model.my_area_key()
	var jumped := home._press(fam, "jump:" + mate_id) and await bot._until(func() -> bool: return model.my_area_key() == str(model.players()[mate_id].get("area", "farm")), 6.0)
	await bot._wait(0.8)
	var mate_snap: Variant = model.player_snaps.get(mate_id)
	var my_snap: Variant = model.player_snaps.get(model.me)
	var dist := 999.0
	if mate_snap is Dictionary and my_snap is Dictionary:
		dist = Vector2(float(mate_snap.get("x", 0)), float(mate_snap.get("y", 0))).distance_to(Vector2(float(my_snap.get("x", 0)), float(my_snap.get("y", 0)))) / Data.tile()
	bot._step("jump to the family", jumped and dist < 3.5 and not fam.is_open(), "from %s to %s, %.1f tiles from Bot-Syskon, the toast said \"%s\"" % [from, model.my_area_key(), dist, str(bot._report["toasts"][-1]) if not (bot._report["toasts"] as Array).is_empty() else ""])
	_books()["jump"] = {"from": from, "to": model.my_area_key(), "tiles": snappedf(dist, 0.1)}


## At the largest text (175 %, where the 1280 × 720 window is 731 × 411 points) every window still lies inside the screen and the HUD's new
## parts (the tracker on the left, the level chip row on the right, the family button) do not lie over one another. The text size is put back.
func hud_pets_for_test(on: bool) -> void:
	world.hud.set_side_buttons(on)


func large_text() -> void:
	await _close_all()
	# for this run only (the saved setting is never touched, so an aborted step leaves nothing behind)
	var before := Settings.ui_scale
	Settings._override("ui_scale", 1.75)
	Settings.apply_ui_scale()
	hud_pets_for_test(true)
	await bot._wait(0.6)
	var view: Rect2 = world.get_viewport().get_visible_rect()
	var inside := true
	var report: Array = []
	var wins: Array = [["book", windows.book, "book"], ["journal", windows.book, "journal"], ["finds", windows.book, "finds"], ["help", windows.help, ""], ["family", windows.family, ""]]
	for w in wins:
		var win: GameWindow = w[1]
		if w[0] == "help":
			win.open_window()
		elif w[0] == "family":
			win.open_window()
		else:
			(win as BookWindow).open_at(w[2])
		await bot._wait(0.5)
		var r: Rect2 = win._stack.get_global_rect()
		var ok := view.grow(1.0).encloses(r) and win._scroll.size.y >= 100.0
		inside = inside and ok
		report.append("%s %s" % [w[0], "fits" if ok else "OUT %s in %s" % [str(r), str(view)]])
		if w[0] == "book":
			# the longest Gårdsbok row (name, text, bar, "x av y") stays inside the panel's width, not under the scroll bar
			var widest := 0.0
			for row in _nodes_named(win, "ach_"):
				widest = maxf(widest, (row as Control).get_global_rect().end.x - win._scroll.get_global_rect().position.x)
			var row_ok := widest <= win._scroll.size.x + 1.0
			inside = inside and row_ok
			report.append("a bragd row %s (%.0f of %.0f wide)" % ["fits" if row_ok else "TOO WIDE", widest, win._scroll.size.x])
		if w[0] == "journal":
			await bot._shot("book-175", 0.1)
		if w[0] == "help":
			await bot._shot("help-175", 0.1)
		win.close()
		await bot._wait(0.2)
	var hud: HudLayer = world.hud
	var rects: Dictionary = {"tracker": hud.tracker.get_global_rect(), "chips": hud.farm_box.get_global_rect(), "side": hud.side_box.get_global_rect()}
	var apart := not (rects["tracker"] as Rect2).intersects(rects["chips"]) and not (rects["side"] as Rect2).intersects(rects["chips"]) and not (rects["tracker"] as Rect2).intersects(rects["side"]) and view.grow(1.0).encloses(rects["side"]) and view.grow(1.0).encloses(rects["tracker"])
	await bot._shot("hud-175", 0.1)
	hud_pets_for_test(model.owns_callable())
	Settings.ui_scale = before
	Settings._run_only.erase("ui_scale")
	Settings.apply_ui_scale()
	await bot._wait(0.4)
	bot._step("large text fits", inside and apart, "at 175 %% (%s): %s; tracker %s, chips %s, side buttons %s %s" % [str(view.size), ", ".join(report), str(rects["tracker"]), str(rects["chips"]), str(rects["side"]), "apart" if apart else "OVERLAP"])
