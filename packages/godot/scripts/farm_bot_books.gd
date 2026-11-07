class_name FarmBotBooks
extends RefCounted
## The farmer's M9b steps (farm_bot.gd runs them): the Gårdsbok on B and the pause menu's way to it. Every step goes through the keys, the
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


## B: the Gårdsbok through its key.
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
	windows.book.close()
	await bot._wait(0.2)


## The pause menu has the books (a pad's way: Start, then A), and each button opens its window.
func pause_menu() -> void:
	await _close_all()
	var pressed_all := true
	for which in ["book"]:
		world.menu.open()
		await bot._wait(0.1)
		var b := _menu_button(which)
		if b == null:
			pressed_all = false
			continue
		b.pressed.emit()
		var win: GameWindow = windows.book
		pressed_all = pressed_all and await bot._until(func() -> bool: return win.is_open(), 2.0)
		windows.close_all()
		await bot._wait(0.15)
	bot._step("the pause menu opens the books", pressed_all, "Paus has Gårdsbok, and it opens its window")


func _menu_button(which: String) -> Button:
	return world.menu.find_child("Ask_" + which, true, false) as Button


## At the largest text (175 %, where the 1280 × 720 window is 731 × 411 points) every window still lies inside the screen.
## The text size is put back.
func large_text() -> void:
	await _close_all()
	var before := Settings.ui_scale
	Settings.set_ui_scale(1.75)
	await bot._wait(0.6)
	var view: Rect2 = world.get_viewport().get_visible_rect()
	var inside := true
	var report: Array = []
	var wins: Array = [["book", windows.book, "book"]]
	for w in wins:
		var win: GameWindow = w[1]
		(win as BookWindow).open_at(w[2])
		await bot._wait(0.5)
		var r: Rect2 = win._stack.get_global_rect()
		var ok := view.grow(1.0).encloses(r) and win._scroll.size.y >= 100.0
		inside = inside and ok
		report.append("%s %s" % [w[0], "fits" if ok else "OUT %s in %s" % [str(r), str(view)]])
		await bot._shot("book-175", 0.1)
		win.close()
		await bot._wait(0.2)
	Settings.set_ui_scale(before)
	await bot._wait(0.4)
	bot._step("large text fits", inside, "at 175 %% (%s): %s" % [str(view.size), ", ".join(report)])
