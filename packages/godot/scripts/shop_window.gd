class_name ShopWindow
extends GameWindow
## The Gårdsbutik (`buy`, renderCatalogue in the browser's ui/menus.ts): tabs (frön, djur, fordon, foder, material,
## möbler, kläder, säsong, stjärnor), a search that looks in every tab, "Du har N" per item, animals with the house they
## need and everyone's animals on the way for tomorrow, prices in kr or stars. The pizzeria on the square is the same
## window with its own list. The server checks the money, the room in the bag and the animal house; the toast says
## what it said.

var pizzeria := false
var _tab := "seeds"
var _query := ""
var _search: LineEdit


func _init(pizza := false) -> void:
	pizzeria = pizza
	title_text = ("🍕 " + Strings.t("pizzeria")) if pizza else ("🛒 " + Strings.t("catalogue"))
	body_height = 380


func _build() -> void:
	_search = LineEdit.new()
	_search.placeholder_text = Strings.t("search")
	_search.clear_button_enabled = true
	_search.custom_minimum_size = Vector2(260, 36)
	_search.text_changed.connect(func(t: String) -> void:
		_query = t.strip_edges().to_lower()
		refresh())
	_toolbar.add_child(_search)
	_search.visible = not pizzeria


func _on_open() -> void:
	_query = ""
	_search.text = ""
	_search.visible = not pizzeria
	_build_tabs()


func _build_tabs() -> void:
	clear_tabs()
	if pizzeria:
		return
	var season := model.season
	for t in Data.shop_tabs:
		var id := str(t.get("id", ""))
		if id == "season" and season == "none":
			continue
		add_tab(str(t.get("name", id)), id == _tab, _pick_tab.bind(id))


func _pick_tab(id: String) -> void:
	_tab = id
	_query = ""
	_search.text = ""
	_build_tabs()
	refresh()
	_scroll.scroll_vertical = 0


func _purse_text(me: Dictionary) -> String:
	return "%d %s   ⭐ %d" % [int(me.get("coins", 0)), Strings.t("coins"), int(me.get("stars", 0))]


func _fill() -> void:
	var me := model.my_player()
	var season := model.season
	var searching := _query != "" and not pizzeria
	if pizzeria:
		add_label(Strings.t("pizzeriaHint"), 15)
	var shown := 0
	if (_tab == "animals" or searching) and not pizzeria:
		_pending_orders()
	for id in Data.shop_items:
		var d := Data.item(id)
		var tab := str(d.get("tab", ""))
		if pizzeria:
			if tab != "pizzeria":
				continue
		elif tab == "pizzeria":
			continue
		elif searching:
			if not _matches(id):
				continue
		elif tab != _tab:
			continue
		if not Data.for_sale(id, season):
			continue
		shown += 1
		_row(id, d, me, searching)
	if shown == 0:
		add_label(Strings.t("noMatch") if searching else Strings.t("nothingHere"), 16)


func _matches(id: String) -> bool:
	return _display_name(id).to_lower().contains(_query) or Data.item_name(id).to_lower().contains(_query)


func _display_name(id: String) -> String:
	var d := Data.item(id)
	if str(d.get("category", "")) == "animal" and d.has("species") and not str(d.get("tab", "")) == "vehicles":
		var house := str(d.get("house", ""))
		var base := Strings.species(str(d.get("species", "")))
		return base + (" (%s %s)" % [Strings.t("needs"), Data.item_name(house)] if house != "" else "")
	return Data.item_name(id)


func _row(id: String, d: Dictionary, me: Dictionary, searching: bool) -> void:
	var cat := str(d.get("category", ""))
	var owned := cat == "clothing" and (me.get("wardrobe", []) as Array).has(id)
	var stars := int(d.get("stars", -1))
	var price := ("⭐ %d" % stars) if stars >= 0 else ("%d %s" % [int(d.get("buy", 0)), Strings.t("coins")])
	var sub := "[color=#e8b830]%s[/color]" % price
	var have := 0 if cat == "clothing" else model.count_item(id)
	if have > 0:
		sub += "  ·  " + Strings.t("youHave", {"n": have})
	if searching and d.has("tab"):
		sub += "  ·  [color=#aaaaaa]%s[/color]" % _tab_name(str(d.get("tab", "")))
	var buttons: Array = []
	if owned:
		sub += "  ·  " + Strings.t("alreadyOwn")
	elif stars >= 0:
		var b := make_button(Strings.t("buy"), _buy.bind(id, 1), "b:" + id)
		b.disabled = int(me.get("stars", 0)) < stars
		buttons.append(b)
	else:
		var qtys: Array = [1, 5, 10] if cat in ["seed", "feed", "material"] else [1]
		for q in qtys:
			var b := make_button(("%s %d" % [Strings.t("buy"), q]) if qtys.size() > 1 else Strings.t("buy"), _buy.bind(id, q), "b:%s:%d" % [id, q])
			b.disabled = int(me.get("coins", 0)) < int(d.get("buy", 0)) * q
			buttons.append(b)
	add_row(Data.item_icon(id), _display_name(id), sub, buttons, owned)


func _tab_name(id: String) -> String:
	for t in Data.shop_tabs:
		if str(t.get("id", "")) == id:
			return str(t.get("name", id))
	return id


## Animals ordered by anyone, arriving tomorrow.
func _pending_orders() -> void:
	var rows: Array = []
	for p in model.players().values():
		for o in p.get("orders", []):
			var species := str(o.get("species", ""))
			if _query == "" or Strings.species(species).to_lower().contains(_query):
				rows.append([species, str(p.get("name", ""))])
	if rows.is_empty():
		return
	add_label("🚚 " + Strings.t("onTheWay"), 15, GOLD)
	for r in rows:
		add_row(Data.item_icon("animal_" + str(r[0])), Strings.species(str(r[0])), str(r[1]), [])


func _buy(id: String, qty: int) -> void:
	Net.send({"t": "buy", "item": id, "qty": qty})
