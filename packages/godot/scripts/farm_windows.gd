class_name FarmWindows
extends Node
## Owns the windows the server's `open` changes ask for (the workbench, the stove, the shop, the sell box, the
## wardrobe, the villagers, Smed-Stina's forge, the paint screen, the Völvan, the class stone, the bus) and the ones the keys open (the gear, the wishes),
## answers "is a window open" for the use key and the hero, rebuilds the open ones when my record changes, and closes
## them all when the map changes. Each window is a GameWindow (game_window.gd) and only sends the browser's messages.

var view: WorldView
var model: WorldModel
var hero: Hero
var hud: HudLayer
var craft: CraftWindow
var stove: CraftWindow
var shop: ShopWindow
var pizza: ShopWindow
var sell: SellWindow
var wardrobe: WardrobeWindow
var gear: GearWindow
var talk: TalkWindow
var klass: ClassWindow
var travel: TravelWindow
var quests: QuestsWindow
var book: BookWindow ## B (the Gårdsbok), K (the journal), the level chip
var help: HelpWindow ## H or ?
var family: FamilyWindow ## P and the 👪 button
var forge: ForgeWindow
var paint: PaintWindow
var run_arch: RunWindow
var seed_tree: SeedWindow
var world_map: MapWindow
var _all: Array = []


func setup(v: WorldView) -> void:
	view = v
	model = v.model
	hero = v.hero
	hud = v.hud
	craft = _add(CraftWindow.new(false))
	stove = _add(CraftWindow.new(true))
	shop = _add(ShopWindow.new(false))
	pizza = _add(ShopWindow.new(true))
	sell = _add(SellWindow.new())
	wardrobe = _add(WardrobeWindow.new())
	wardrobe.looks = v.looks
	gear = _add(GearWindow.new())
	gear.looks = v.looks
	talk = _add(TalkWindow.new())
	talk.class_asked.connect(klass_open)
	forge = _add(ForgeWindow.new())
	talk.forge_asked.connect(forge.open_forge)
	paint = _add(PaintWindow.new())
	klass = _add(ClassWindow.new())
	travel = _add(TravelWindow.new())
	quests = _add(QuestsWindow.new())
	book = _add(BookWindow.new())
	help = _add(HelpWindow.new())
	family = _add(FamilyWindow.new())
	family.looks = v.looks
	run_arch = _add(RunWindow.new())
	seed_tree = _add(SeedWindow.new())
	world_map = _add(MapWindow.new())
	model.quests_changed.connect(refresh)
	model.fardkost_changed.connect(refresh)
	model.tree_changed.connect(refresh)
	model.run_changed.connect(refresh)
	model.saga_best_changed.connect(refresh)
	# the family list shows everyone: any player's record changing (online, where, asleep) redraws it while it is open
	model.player_changed.connect(func(_id: String, _p: Variant) -> void:
		if family.is_open():
			family.refresh())


func _add(w: GameWindow) -> GameWindow:
	w.model = model
	w.hero = hero
	view.add_child(w)
	_all.append(w)
	return w


func is_busy() -> bool:
	for w in _all:
		if w.is_open():
			return true
	return false


func close_all() -> void:
	for w in _all:
		w.close()


## My record or the day's wishes changed: the open windows are redrawn.
func refresh() -> void:
	for w in _all:
		if w.is_open():
			w.refresh()


## The server asked me to open a window (`open` change). True when the new client draws it.
func on_open(c: Dictionary) -> bool:
	match str(c.get("ui", "")):
		"workbench":
			craft.open_window()
		"cook":
			stove.open_window()
		"catalogue":
			shop.open_window()
		"pizzeria":
			pizza.open_window()
		"sell":
			sell.open_window()
		"wardrobe":
			wardrobe.open_window()
		"npc", "saga":
			talk.open_npc(str(c.get("npc", "")))
		"sagaClass":
			klass.open_window()
		"run":
			run_arch.open_window()
		"seed":
			seed_tree.open_window()
		"paint":
			paint.open_paint()
		"travel":
			var o: Variant = model.world_for(model.my_area_key()).get("objects", {}).get(str(int(c.get("id", -1))))
			travel.open_for("train" if o is Dictionary and str(o.get("kind", "")) == "train_station" else "bus")
		_:
			return false
	return true


func klass_open() -> void:
	klass.open_window()


## G: the gear window (only for someone with a class; without one it says where to get it).
func toggle_gear() -> void:
	if gear.is_open():
		gear.close()
	elif not is_busy():
		gear.open_window()


## J: the day's wishes.
func toggle_quests() -> void:
	if quests.is_open():
		quests.close()
	elif not is_busy():
		quests.open_window()


## N: the world map (anywhere a map is drawn; inside a dungeon it only shows where I am, the buttons are greyed).
func toggle_map() -> void:
	if world_map.is_open():
		world_map.close()
	elif not is_busy():
		world_map.open_window()


## B, K: the books on a page ("book", "journal" or "finds"); the same key again closes the window.
func toggle_book(page: String) -> void:
	if book.is_open():
		if book.tab == page:
			book.close()
		else:
			book.open_at(page)
	elif not is_busy():
		book.open_at(page)


## H or ?: the help.
func toggle_help() -> void:
	if help.is_open():
		help.close()
	elif not is_busy():
		help.open_window()


## P: the family.
func toggle_family() -> void:
	if family.is_open():
		family.close()
	elif not is_busy():
		family.open_window()


## True when `event` is the key of a book, the help or the family (or `?`), and it was used.
func handle_key(event: InputEvent) -> bool:
	if event.is_action_pressed("book"):
		toggle_book("book")
	elif event.is_action_pressed("journal"):
		toggle_book(BookWindow.page_for_key(model.my_player()))
	elif event.is_action_pressed("help") or (event is InputEventKey and event.pressed and not event.echo and (event as InputEventKey).keycode == KEY_QUESTION):
		toggle_help()
	elif event.is_action_pressed("family"):
		toggle_family()
	else:
		return false
	return true


func _unhandled_input(event: InputEvent) -> void:
	if world_map.is_open() and event.is_action_pressed("worldmap"):
		world_map.close()
		get_viewport().set_input_as_handled()
		return
	# the key that opened a book, the help or the family closes it again
	if (book.is_open() or help.is_open() or family.is_open()) and Time.get_ticks_msec() - 250 > maxi(book._opened_at, maxi(help._opened_at, family._opened_at)) and handle_key(event):
		get_viewport().set_input_as_handled()
		return
	# the key that opened the gear or the wishes closes them again
	if event.is_action_pressed("gear") and gear.is_open():
		gear.close()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("quests") and quests.is_open():
		quests.close()
		get_viewport().set_input_as_handled()
