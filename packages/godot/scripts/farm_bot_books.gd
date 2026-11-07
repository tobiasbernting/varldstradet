class_name FarmBotBooks
extends RefCounted
## The farmer's M9b steps (farm_bot.gd runs them): the Gårdsbok on B, the journal on K and Völvan's journal tab, the finds, the level chip
## and the saga tracker on the HUD, the pause menu's way to the books. Every step goes through the keys, the
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
	var head := _texts(windows.book).get_slice("\n", 0)
	bot._step("the Gårdsbok", open and rows.size() == Data.book["achievements"].size() and rows.size() >= 70, "B opened it: %d bragder drawn (%d done), \"%s\"" % [rows.size(), medals, head])
	await bot._shot("book", 0.1)
	# B again closes it
	bot._press_action("book")
	var closed := await bot._until(func() -> bool: return not windows.book.is_open(), 3.0)
	bot._step("the Gårdsbok closes on B", closed, "the same key shuts it")
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
	# the dungeons' best times: the server says a record in a `sagaBest` change; the card shows the time and the names
	var change := {"t": "sagaBest", "dungeon": "draug", "best": {"ms": 754000, "names": ["Bot-Bonde", "Bot-Syskon"], "day": model.day}}
	model.apply({"t": "changes", "changes": [change]})
	await bot._wait(0.3)
	var card_text := ""
	for d in _nodes_named(windows.book, "dungeon_draug"):
		for e in _descend(d):
			if e is RichTextLabel:
				card_text += (e as RichTextLabel).get_parsed_text() + "\n"
	bot._step("the family's best time", card_text.contains("12:34") and card_text.contains("Bot-Syskon"), "Draugkryptan's card shows the time of a sagaBest change (12:34, both names)")
	(model.farm["sagaBest"] as Dictionary).erase("draug")
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


## The HUD: the level chip (a click opens the journal) and the tracker (folds on a click).
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


## The pause menu has the books (a pad's way: Start, then A), and each button opens its window.
func pause_menu() -> void:
	await _close_all()
	var pressed_all := true
	for which in ["book", "journal"]:
		world.menu.open()
		await bot._wait(0.1)
		var b := _menu_button(which)
		if b == null:
			pressed_all = false
			continue
		b.pressed.emit()
		var win: GameWindow = {"book": windows.book, "journal": windows.book}[which]
		pressed_all = pressed_all and await bot._until(func() -> bool: return win.is_open(), 2.0)
		windows.close_all()
		await bot._wait(0.15)
	bot._step("the pause menu opens the books", pressed_all, "Paus has Gårdsbok and Sagans dagbok, and each opens its window")


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


## At the largest text (175 %, where the 1280 × 720 window is 731 × 411 points) every window still lies inside the screen and the HUD's new
## parts (the tracker on the left, the level chip row on the right) do not lie over one another. The text size is put back.
func large_text() -> void:
	await _close_all()
	var before := Settings.ui_scale
	Settings.set_ui_scale(1.75)
	await bot._wait(0.6)
	var view: Rect2 = world.get_viewport().get_visible_rect()
	var inside := true
	var report: Array = []
	var wins: Array = [["book", windows.book, "book"], ["journal", windows.book, "journal"], ["finds", windows.book, "finds"]]
	for w in wins:
		var win: GameWindow = w[1]
		(win as BookWindow).open_at(w[2])
		await bot._wait(0.5)
		var r: Rect2 = win._stack.get_global_rect()
		var ok := view.grow(1.0).encloses(r) and win._scroll.size.y >= 100.0
		inside = inside and ok
		report.append("%s %s" % [w[0], "fits" if ok else "OUT %s in %s" % [str(r), str(view)]])
		if w[0] == "journal":
			await bot._shot("book-175", 0.1)
		win.close()
		await bot._wait(0.2)
	var hud: HudLayer = world.hud
	var rects: Dictionary = {"tracker": hud.tracker.get_global_rect(), "chips": hud.farm_box.get_global_rect()}
	var apart := not (rects["tracker"] as Rect2).intersects(rects["chips"]) and view.grow(1.0).encloses(rects["tracker"])
	await bot._shot("hud-175", 0.1)
	Settings.set_ui_scale(before)
	await bot._wait(0.4)
	bot._step("large text fits", inside and apart, "at 175 %% (%s): %s; tracker %s, chips %s %s" % [str(view.size), ", ".join(report), str(rects["tracker"]), str(rects["chips"]), "apart" if apart else "OVERLAP"])
