class_name FarmWindows
extends Node
## Owns the windows the server's `open` changes ask for (the workbench, the stove, the shop, the sell box, the
## wardrobe, the villagers, the Völvan, the class stone, the bus) and the ones the keys open (the gear, the wishes),
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
var run_arch: RunWindow
var seed_tree: SeedWindow
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
	klass = _add(ClassWindow.new())
	travel = _add(TravelWindow.new())
	quests = _add(QuestsWindow.new())
	run_arch = _add(RunWindow.new())
	seed_tree = _add(SeedWindow.new())
	model.quests_changed.connect(refresh)
	model.fardkost_changed.connect(refresh)
	model.tree_changed.connect(refresh)
	model.run_changed.connect(refresh)


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


func _unhandled_input(event: InputEvent) -> void:
	# the key that opened the gear or the wishes closes them again
	if event.is_action_pressed("gear") and gear.is_open():
		gear.close()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("quests") and quests.is_open():
		quests.close()
		get_viewport().set_input_as_handled()
