class_name VoiceWindow
extends GameWindow
## The Röstprat window (the pause menu's "Röstprat" and the HUD's Röstprat button): ring up or hang up, the people you can hear
## with "pratar" in green by the room that is talking, which device is your room's speakerphone, the room choices (another room,
## someone else's room), and the microphone: on or off, hold-to-talk or open, and how loud the others are. The logic is
## voice.gd's; this only shows it and sends the player's choices. The microphone and volume controls sit in the toolbar
## (built once) so a redraw of the list never lets go of a slider or a held button.

var _mic_button: Button
var _ptt_button: Button
var _open_button: Button
var _hold_button: Button
var _volume: HSlider
var _changing := false


func _init() -> void:
	title_text = Strings.t("voiceWindow")
	width = 640
	body_height = 340


func _purse_text(_me: Dictionary) -> String:
	return ""


func _build() -> void:
	_toolbar.add_theme_constant_override("separation", 8)
	_mic_button = make_button("", func() -> void: Voice.set_mic(not Settings.voice_mic), "mic")
	_toolbar.add_child(_mic_button)
	_ptt_button = make_button(Strings.t("voiceModePtt"), func() -> void: Voice.set_mode("ptt"), "ptt")
	_ptt_button.toggle_mode = true
	_toolbar.add_child(_ptt_button)
	_open_button = make_button(Strings.t("voiceModeOpen"), func() -> void: Voice.set_mode("open"), "open")
	_open_button.toggle_mode = true
	_toolbar.add_child(_open_button)
	_hold_button = make_button(Strings.t("voiceHold", {"key": Settings.ptt_key_name()}), func() -> void: pass, "hold")
	_hold_button.button_down.connect(func() -> void:
		Voice.ptt_button = true
		Voice.changed.emit())
	_hold_button.button_up.connect(func() -> void:
		Voice.ptt_button = false
		Voice.changed.emit())
	_foot.add_child(_hold_button)
	_foot.move_child(_hold_button, 0)
	var vol_label := Label.new()
	vol_label.text = Strings.t("voiceVolume")
	_foot.add_child(vol_label)
	_foot.move_child(vol_label, 1)
	_volume = HSlider.new()
	_volume.min_value = 0.0
	_volume.max_value = 1.0
	_volume.step = 0.05
	_volume.custom_minimum_size = Vector2(140, 0)
	_volume.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_volume.value_changed.connect(func(v: float) -> void:
		if not _changing:
			Voice.set_volume(v))
	_foot.add_child(_volume)
	_foot.move_child(_volume, 2)
	Voice.changed.connect(refresh)


func _on_open() -> void:
	_changing = true
	_volume.value = Settings.voice_volume
	_changing = false


func _on_close() -> void:
	Voice.ptt_button = false


# (the world's own handler would open the pause menu on Escape before this window, a child of an autoload, saw it)
func _input(event: InputEvent) -> void:
	if is_open() and Time.get_ticks_msec() - _opened_at > 250 and (event.is_action_pressed("menu") or event.is_action_pressed("ui_cancel")):
		close()
		get_viewport().set_input_as_handled()


func _fill() -> void:
	var problem := Voice.problem()
	var usable := problem == ""
	_toolbar.visible = usable and Voice.is_joined()
	_hold_button.visible = usable and Voice.is_joined() and Settings.voice_mode == "ptt"
	_mic_button.text = Strings.t("voiceMute") if Settings.voice_mic else Strings.t("voiceUnmute")
	_hold_button.text = Strings.t("voiceHold", {"key": Settings.ptt_key_name()}) # (the key is a setting since M8b)
	_ptt_button.button_pressed = Settings.voice_mode == "ptt"
	_open_button.button_pressed = Settings.voice_mode == "open"
	if not usable:
		add_label(Strings.t(problem), 18, BAD)
		return
	add_label(Strings.t("voiceHint"), 15, Color(1, 1, 1, 0.7))
	if not Voice.is_joined():
		_body.add_child(make_button(Strings.t("voiceCall"), Voice.call_up, "call"))
		return
	_body.add_child(make_button(Strings.t("voiceHangUp"), Voice.hang_up, "hang"))
	if not Voice.mic_present:
		add_label(Strings.t("voiceListenOnlyStatus"), 15, GOLD)
	_fill_my_room()
	_fill_other_rooms()


func _fill_my_room() -> void:
	var st := Voice.state
	var mine := {}
	for r in st.get("rooms", []):
		if str(r.get("id", "")) == str(st.get("room", "")):
			mine = r
	var names: Array = []
	for m in mine.get("members", []):
		names.append(str(m.get("name", "?")) + ("" if bool(m.get("joined", false)) else " (-)"))
	var speaker := Voice.my_speaker(st)
	var sub: String
	if Voice.is_speaker():
		sub = Strings.t("voiceYouSpeaker")
		if Voice.talking:
			sub = "[color=#8fe08a]%s[/color] · %s" % [Strings.t("voiceTalking"), sub]
	elif speaker != "":
		sub = Strings.t("voiceSpeaker", {"name": Voice.name_of(speaker)})
	else:
		sub = Strings.t("voiceNoSpeaker")
	var buttons: Array = []
	if not Voice.is_speaker():
		buttons.append(make_button(Strings.t("voiceBeSpeaker"), Voice.become_speaker, "speaker"))
	add_label(Strings.t("voiceMyRoom"), 18, GOLD)
	add_row(null, ", ".join(names), sub, buttons)
	if Voice.room_mode != "auto":
		_body.add_child(make_button(Strings.t("voiceBack"), func() -> void: Voice.set_room("auto"), "auto"))
	else:
		_body.add_child(make_button(Strings.t("voiceAlone"), func() -> void: Voice.set_room("alone"), "alone"))


func _fill_other_rooms() -> void:
	add_label(Strings.t("voiceOtherRooms"), 18, GOLD)
	var any := false
	for r in Voice.state.get("rooms", []):
		if str(r.get("id", "")) == str(Voice.state.get("room", "")):
			continue
		any = true
		var names: Array = []
		var first := ""
		for m in r.get("members", []):
			if first == "":
				first = str(m.get("id", ""))
			names.append(str(m.get("name", "?")))
		var sub: String
		var speaker = r.get("speaker")
		if speaker == null:
			sub = Strings.t("voiceNoSpeaker")
		else:
			sub = Strings.t("voiceSpeaker", {"name": Voice.name_of(str(speaker))})
			var status: String = {"connected": "voiceConnected", "failed": "voiceFailed"}.get(Voice.peer_state(str(speaker)), "voiceConnecting")
			sub += " · " + Strings.t(status)
			if Voice.is_talking_room(r):
				sub += " · [color=#8fe08a]%s[/color]" % Strings.t("voiceTalking")
		var buttons: Array = []
		if first != "":
			var with_id := first
			buttons.append(make_button(Strings.t("voiceWith", {"name": str(names[0])}), func() -> void: Voice.set_room("with", with_id), "with:" + with_id))
		add_row(null, ", ".join(names), sub, buttons, speaker == null)
	if not any:
		add_label(Strings.t("voiceNobodyElse"), 16)
