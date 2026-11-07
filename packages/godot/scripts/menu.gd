class_name PauseMenu
extends CanvasLayer
## The pause menu (the `menu` action: Escape or the gamepad's start button): continue, the settings window (settings_window.gd),
## the gear and quest windows, Röstprat, the development way into the dungeons that have no arch drawn yet (the server's `dev`
## message, DEV_TELEPORT=1), and back to the login screen. Built in code; the texts come from assets/sv.json.

signal resumed
signal switch_player
signal dev_enter(dungeon: String)
signal fps_toggled(on: bool)
signal window_asked(which: String) ## "gear", "quests", "book", "journal", "help" or "family": the windows the keys open, for a pad

var _root: Control
var _main: VBoxContainer
var _settings_window: SettingsWindow
var _continue_button: Button
var _sound_off: Label ## "Allt ljud är avstängt" when the master volume is 0 (it is kept from one start to the next)


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
	_sound_off = Label.new()
	_sound_off.text = Strings.t("soundOffHint")
	_sound_off.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sound_off.custom_minimum_size = Vector2(380, 0)
	_sound_off.add_theme_color_override("font_color", Color("e8b830"))
	_sound_off.visible = false
	_main.add_child(_sound_off)
	_continue_button = _button(Strings.t("menuContinue"), func() -> void: close())
	_main.add_child(_continue_button)
	_main.add_child(_button(Strings.t("menuSettings"), func() -> void: open_settings()))
	_main.add_child(_button("%s (%s)" % [Strings.t("gearTitle"), Strings.t("gearKey")], func() -> void:
		close()
		window_asked.emit("gear")))
	_main.add_child(_button("%s (%s)" % [Strings.t("questsTitle"), Strings.t("questsKey")], func() -> void:
		close()
		window_asked.emit("quests")))
	for entry in [["📕 " + Strings.t("book"), "bookKey", "book"], ["📖 " + Strings.t("journalMenu"), "journalKey", "journal"], ["👪 " + Strings.t("familyTitle"), "familyKey", "family"], ["❓ " + Strings.t("helpTitle"), "helpKey", "help"]]:
		var which: String = entry[2]
		var b := _button("%s (%s)" % [entry[0], Strings.t(entry[1])], func() -> void:
			close()
			window_asked.emit(which))
		b.name = "Ask_" + which
		_main.add_child(b)
	if Voice.available:
		_main.add_child(_button(Strings.t("voiceWindow"), func() -> void:
			close()
			Voice.open_window()))
	else:
		# without the webrtc-native extension: shown greyed, with the reason, rather than hidden
		var off := _button(Strings.t("voiceUnavailable"), func() -> void: pass)
		off.disabled = true
		_main.add_child(off)
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

	# the settings window (M8b) lives over this menu
	_settings_window = SettingsWindow.new()
	_settings_window.name = "SettingsWindow"
	add_child(_settings_window)
	_settings_window.fps_changed.connect(func(on: bool) -> void: fps_toggled.emit(on))


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
	_sound_off.visible = Settings.master_volume <= 0.001
	_continue_button.grab_focus()


func close() -> void:
	if _settings_window.is_open():
		_settings_window.close()
	visible = false
	resumed.emit()


## The settings window over the menu (also what the check opens).
func open_settings() -> SettingsWindow:
	_settings_window.open_window()
	return _settings_window


func settings_window() -> SettingsWindow:
	return _settings_window
