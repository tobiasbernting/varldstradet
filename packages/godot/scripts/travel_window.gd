class_name TravelWindow
extends GameWindow
## The bus stop and the train station (`ride`, renderTravel in the browser): where I can go (home, and the villages
## I have been to; the train also to one village nobody has seen), with the fare. The server checks that I stand by
## the stop, takes the fare and puts me down by the stop at the other end.

var via := "bus"


func _init() -> void:
	title_text = "🐴 " + Strings.t("travelTitle")
	body_height = 300


func open_for(kind: String) -> void:
	via = kind
	set_title(("⛏️ " if kind == "train" else "🐴 ") + Strings.t("travelTitle"))
	open_window()


func _fill() -> void:
	add_label(Strings.t("travelHint"), 16)
	var me := model.my_player()
	var here := model.my_area_key()
	var price := int(Data.transport_price.get(via, 5))
	var visited: Array = me.get("visited", ["farm"])
	var dests: Array = []
	if here != "farm":
		dests.append({"key": "farm", "name": Strings.t("travelHome"), "unknown": false})
	for k in visited:
		var key := str(k)
		if key == "farm" or key == here:
			continue
		if str(model.biomes.get(key, "")) != "by":
			continue
		dests.append({"key": key, "name": city_name(key), "unknown": false})
	if dests.is_empty():
		add_label(Strings.t("noDestinations"), 16)
		return
	for d in dests:
		var b := make_button(("⛏️ " if via == "train" else "🐴 ") + Strings.t("go"), _go.bind(str(d["key"])), "go:" + str(d["key"]))
		b.disabled = int(me.get("coins", 0)) < price
		add_row(null, str(d["name"]), "[color=#e8b830]%d %s[/color]" % [price, Strings.t("coins")], [b])


## cityName in sim.ts: the first village is just "Köpingen", the others get their map's coordinates.
static func city_name(key: String) -> String:
	if key == "farm":
		return Strings.t("travelHome")
	var parts := key.substr(2).split(",")
	if not key.begins_with("a:") or parts.size() != 2:
		return Strings.place("by")
	if int(parts[0]) == 1 and int(parts[1]) == 0:
		return Strings.place("by")
	return "%s %s,%s" % [Strings.t("cityName"), parts[0], parts[1]]


func _go(key: String) -> void:
	Net.send({"t": "ride", "via": via, "to": key})
	close()
