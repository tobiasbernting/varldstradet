class_name PauseMenu
extends CanvasLayer
## The pause menu (the `menu` action: Escape or the gamepad's start button): continue, settings (the quality
## presets of quality.gd), the development way into the dungeons that have no arch drawn yet (the server's `dev` message, DEV_TELEPORT=1), and
## back to the login screen. Built in code; the texts come from assets/sv.json.

signal resumed
signal switch_player
signal dev_enter(dungeon: String)
signal fps_toggled(on: bool)

var _root: Control
var _main: VBoxContainer
var _settings: VBoxContainer
var _quality_buttons: Dictionary = {}
var _hint: Label
var _spell_buttons: Dictionary = {}
var _spell_hint: Label
var _fps_check: CheckButton


func _ready() -> void:
	layer = 10
	visible = false
	_root = Control.new()
	_root.anchor_right = 1.0
	_root.anchor_bottom = 1.0
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	var dim := ColorRect.new()
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.color = Color(0, 0, 0, 0.55)
	_root.add_child(dim)
	var centre := CenterContainer.new()
	centre.anchor_right = 1.0
	centre.anchor_bottom = 1.0
	_root.add_child(centre)
	var panel := PanelContainer.new()
	centre.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		margin.add_theme_constant_override(side, 24)
	panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(420, 0)
	margin.add_child(stack)

	_main = VBoxContainer.new()
	_main.add_theme_constant_override("separation", 10)
	stack.add_child(_main)
	_main.add_child(_title(Strings.t("menuTitle")))
	_main.add_child(_button(Strings.t("menuContinue"), func() -> void: close()))
	_main.add_child(_button(Strings.t("menuSettings"), func() -> void: _show_settings(true)))
	var dev_title := _title(Strings.t("devTitle"))
	dev_title.add_theme_font_size_override("font_size", 16)
	dev_title.modulate = Color(1, 1, 1, 0.7)
	_main.add_child(dev_title)
	# Draugkryptan has its real way in (the arch in the forest); the other eight have none drawn yet
	for id in Data.dungeons.keys():
		if str(id) == "draug":
			continue
		var did: String = str(id)
		_main.add_child(_button(Strings.t("devEnterDungeon", {"name": str(Data.dungeon(did).get("name", did))}), func() -> void:
			dev_enter.emit(did)
			close()))
	var dev_hint := Label.new()
	dev_hint.text = Strings.t("devEnterHint")
	dev_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dev_hint.add_theme_font_size_override("font_size", 13)
	dev_hint.modulate = Color(1, 1, 1, 0.7)
	_main.add_child(dev_hint)
	_main.add_child(_button(Strings.t("menuSwitchPlayer"), func() -> void:
		close()
		switch_player.emit()))

	_settings = VBoxContainer.new()
	_settings.add_theme_constant_override("separation", 10)
	_settings.visible = false
	stack.add_child(_settings)
	_settings.add_child(_title(Strings.t("menuSettings")))
	var quality_label := Label.new()
	quality_label.text = Strings.t("settingsQuality")
	_settings.add_child(quality_label)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_settings.add_child(row)
	for p in Quality.ORDER:
		var b := Button.new()
		b.text = Quality.label_of(p)
		b.toggle_mode = true
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 44)
		b.pressed.connect(func() -> void: _pick(p))
		row.add_child(b)
		_quality_buttons[p] = b
	_hint = Label.new()
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.custom_minimum_size = Vector2(0, 60)
	_settings.add_child(_hint)
	# the kids' gamepads: the four spells on the face buttons, or one button and a wheel (PLAN.md section 7)
	var spells_label := Label.new()
	spells_label.text = Strings.t("settingsSpells")
	_settings.add_child(spells_label)
	var spell_row := HBoxContainer.new()
	spell_row.add_theme_constant_override("separation", 8)
	_settings.add_child(spell_row)
	for mode in ["buttons", "wheel"]:
		var b := Button.new()
		b.text = Strings.t("spellsButtons" if mode == "buttons" else "spellsWheel")
		b.toggle_mode = true
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 44)
		b.pressed.connect(func() -> void: _pick_spells(mode))
		spell_row.add_child(b)
		_spell_buttons[mode] = b
	_spell_hint = Label.new()
	_spell_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_spell_hint.custom_minimum_size = Vector2(0, 50)
	_settings.add_child(_spell_hint)
	_fps_check = CheckButton.new()
	_fps_check.text = Strings.t("settingsFps")
	_fps_check.button_pressed = Settings.show_fps
	_fps_check.toggled.connect(func(on: bool) -> void:
		Settings.show_fps = on
		Settings.save()
		fps_toggled.emit(on))
	_settings.add_child(_fps_check)
	_settings.add_child(_button(Strings.t("back"), func() -> void: _show_settings(false)))
	_refresh_quality()
	_refresh_spells()


func _title(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 28)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


func _button(text: String, on_pressed: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(on_pressed)
	return b


func is_open() -> bool:
	return visible


func toggle() -> void:
	if visible:
		close()
	else:
		open()


func open() -> void:
	visible = true
	_fps_check.button_pressed = Settings.show_fps
	_show_settings(false)


func close() -> void:
	visible = false
	resumed.emit()


func _show_settings(on: bool) -> void:
	_settings.visible = on
	_main.visible = not on
	var first: Control = (_quality_buttons[Quality.preset] if on else _main.get_child(1))
	if first is Control:
		first.grab_focus()


func _pick(p: String) -> void:
	Quality.set_preset(p)
	_refresh_quality()


func _pick_spells(mode: String) -> void:
	Settings.spell_input = mode
	Settings.save()
	_refresh_spells()


func _refresh_spells() -> void:
	for mode in _spell_buttons.keys():
		_spell_buttons[mode].button_pressed = mode == Settings.spell_input
	_spell_hint.text = Strings.t("spellsButtonsHint" if Settings.spell_input == "buttons" else "spellsWheelHint")


func _refresh_quality() -> void:
	for p in _quality_buttons.keys():
		_quality_buttons[p].button_pressed = p == Quality.preset
	_hint.text = Quality.hint_of(Quality.preset)
