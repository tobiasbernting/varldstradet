class_name SellWindow
extends GameWindow
## The säljlåda (`sell`, renderSell in the browser): what in the bag can be sold, one or all of a stack, with what it
## fetches; the coins go up at once (the server pays and sends my record, which redraws this and the HUD).

var _query := ""
var _search: LineEdit


func _init() -> void:
	title_text = "📦 " + Strings.t("sellTitle")
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


func _on_open() -> void:
	_query = ""
	_search.text = ""


func _fill() -> void:
	var inv: Array = model.my_player().get("inventory", [])
	var any := false
	var sellable := false
	for slot in range(inv.size()):
		var st: Variant = inv[slot]
		if not (st is Dictionary):
			continue
		var id := str(st.get("item", ""))
		if Data.item_sell(id) < 0:
			continue
		sellable = true
		if _query != "" and not Data.item_name(id).to_lower().contains(_query):
			continue
		any = true
		var n := int(st.get("count", 1))
		var price := Data.painted_sell if st.has("data") else Data.item_sell(id)
		var buttons: Array = [make_button("%s (%d %s)" % [Strings.t("sellOne"), price, Strings.t("coins")], _sell.bind(slot, 1), "s1:%d" % slot)]
		if n > 1:
			buttons.append(make_button("%s (%d %s)" % [Strings.t("sellAll"), price * n, Strings.t("coins")], _sell.bind(slot, n), "sa:%d" % slot))
		add_row(Data.item_icon(id), "%s × %d" % [Data.item_name(id), n], "", buttons)
	if not any:
		add_label(Strings.t("noMatch") if sellable and _query != "" else Strings.t("nothingToSell"), 16)


func _sell(slot: int, qty: int) -> void:
	Net.send({"t": "sell", "slot": slot, "qty": qty})
