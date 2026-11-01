class_name Hotbar
extends VBoxContainer
## The eight hotbar squares at the bottom of the screen on the farm (the browser's `.hotbar`): the held one is lit,
## the number is the key that picks it, the watering can shows its charges, and the held thing's name stands over
## them. A click picks a square, a click on the held one opens the bag (as in the browser). Built once; `show_inventory`
## runs when my record changes and only redraws what changed.

signal picked(slot: int)
signal bag_asked

var slots: Array[ItemSlot] = []
var held_label: Label
var _selected := -1


func _init() -> void:
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 1.0
	anchor_bottom = 1.0
	offset_top = -96
	offset_bottom = -12
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_theme_constant_override("separation", 4)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	held_label = Label.new()
	held_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	held_label.add_theme_font_size_override("font_size", 18)
	held_label.add_theme_color_override("font_outline_color", Color("2b2419"))
	held_label.add_theme_constant_override("outline_size", 8)
	held_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(held_label)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 4)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)
	for i in range(int(Data.constant("HOTBAR_SIZE", 8.0))):
		var s := ItemSlot.new()
		s.slot = i
		s.focus_mode = Control.FOCUS_NONE
		s.set_key(str(i + 1))
		s.pressed.connect(_on_pressed.bind(i))
		row.add_child(s)
		slots.append(s)
	visible = false


func _on_pressed(i: int) -> void:
	if i == _selected:
		bag_asked.emit()
	else:
		picked.emit(i)


## Redraws from my inventory (an Array of stacks and nulls) and the held slot.
func show_inventory(inv: Array, selected: int) -> void:
	_selected = selected
	for i in range(slots.size()):
		slots[i].show_stack(inv[i] if i < inv.size() else null, i == selected)
	var held: Variant = inv[selected] if selected >= 0 and selected < inv.size() else null
	var text := ""
	if held is Dictionary:
		text = Data.item_name(str(held.get("item", "")))
		if held.has("charges"):
			text += "  " + Strings.t("canCharges", {"n": int(held.get("charges", 0)), "max": int(Data.constant("WATERING_CAN_CHARGES", 20.0))})
	if held_label.text != text:
		held_label.text = text
