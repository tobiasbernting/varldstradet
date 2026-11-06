class_name SeedWindow
extends GameWindow
## The sagaträd (`open` with ui "seed", the prompt on the Yggdrasil shoot). Filled in by the step that draws the tree.


func _init() -> void:
	title_text = "🌳 " + Strings.t("treeTitle")
