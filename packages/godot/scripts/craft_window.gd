class_name CraftWindow
extends GameWindow
## The workbench (`craft`) and the stove (`cook`): the recipes of the shared data with a picture of what they make, what
## they need with what is missing shown in red (what I have over what it takes), and a button that is on when the bag
## has it all (renderCraft in the browser's ui/menus.ts). The server takes the ingredients and gives the thing.

var cooking := false


func _init(cook_mode := false) -> void:
	cooking = cook_mode
	title_text = ("🍳 " + Strings.t("cook")) if cook_mode else ("🔨 " + Strings.object_name("workbench"))


func _fill() -> void:
	var recipes: Array = Data.cooking if cooking else Data.recipes
	for r in recipes:
		var out: Dictionary = r.get("out", {})
		var ing: Array = r.get("in", [])
		var ok := true
		for i in ing:
			if model.count_item(str(i.get("item", ""))) < int(i.get("count", 1)):
				ok = false
		var item := str(out.get("item", ""))
		var n := int(out.get("count", 1))
		var b := make_button(Strings.t("cook") if cooking else Strings.t("craft"), _make.bind(str(r.get("id", ""))), "r:" + str(r.get("id", "")))
		b.disabled = not ok
		add_row(Data.item_icon(item), Data.item_name(item) + (" × %d" % n if n > 1 else ""), needs_line(model, ing), [b], not ok)


func _make(recipe: String) -> void:
	Net.send({"t": "cook" if cooking else "craft", "recipe": recipe})
