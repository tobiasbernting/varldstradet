class_name LoginScreen
extends Control
## The way in: the server's address and a join code, then the wait while a parent approves this device (with the
## 6-digit number to read out), then "Vem är du?". The same flow as the browser's /join and /access pages, over the
## JSON routes (POST /api/join, GET /api/gate, GET /api/players).

signal start_game(player_id: String)

const POLL_SECONDS := 3.0

var _can_create := true ## the gate's canCreate: a guest device may not make characters

@onready var title: Label = %Title
@onready var status: Label = %Status
@onready var form: VBoxContainer = %Form
@onready var url_label: Label = %UrlLabel
@onready var url: LineEdit = %Url

@onready var url_hint: Label = %UrlHint
@onready var code_label: Label = %CodeLabel
@onready var code: LineEdit = %Code
@onready var name_label: Label = %NameLabel
@onready var device_name: LineEdit = %Name
@onready var join_button: Button = %Join
@onready var waiting: VBoxContainer = %Waiting
@onready var wait_title: Label = %WaitTitle
@onready var wait_text: Label = %WaitText
@onready var wait_code_hint: Label = %WaitCodeHint
@onready var wait_code: Label = %WaitCode
@onready var wait_hint: Label = %WaitHint
@onready var picker: VBoxContainer = %Picker
@onready var pick_title: Label = %PickTitle
@onready var cards: VBoxContainer = %Cards
@onready var forget_button: Button = %Forget

var new_button: Button
var _creator: CreatorWindow
var _api: Api
var _polling := false
var _poll_in := 0.0
var _joining := false


func _ready() -> void:
	_api = Api.new()
	add_child(_api)
	title.text = Strings.t("sagaJournalTitle")
	url_label.text = Strings.t("serverUrl")
	url_hint.text = Strings.t("serverUrlHint")
	code_label.text = Strings.t("joinCode")
	name_label.text = Strings.t("deviceName")
	join_button.text = Strings.t("joinEnter")
	wait_title.text = Strings.t("gatePendingTitle")
	wait_code_hint.text = Strings.t("gatePendingCode")
	wait_hint.text = Strings.t("gatePendingWait")
	pick_title.text = Strings.t("whoAreYou")
	forget_button.text = Strings.t("forgetDevice")
	url.text = Settings.server_url
	url.placeholder_text = Settings.DEFAULT_URL
	code.placeholder_text = "ABCD-1234"
	join_button.pressed.connect(_on_join)
	code.text_submitted.connect(func(_text: String) -> void: _on_join())
	forget_button.pressed.connect(_on_forget)
	# "Ny karaktär", under the list of characters; the creator window sits on top of the login
	new_button = Button.new()
	new_button.text = Strings.t("creatorNewCharacter")
	new_button.custom_minimum_size = Vector2(0, 56)
	new_button.add_theme_font_size_override("font_size", 22)
	BagWindow.style_button(new_button)
	new_button.pressed.connect(_on_new_character)
	picker.add_child(new_button)
	_creator = CreatorWindow.new()
	add_child(_creator)
	_creator.created.connect(_on_created)
	_creator.cancelled.connect(func() -> void: new_button.grab_focus())
	if OS.get_cmdline_user_args().has("--creatorcheck"):
		var check := CreatorCheck.new() # tools/bot-check.mts: a headless run of the creator
		check.name = "CreatorCheck"
		check.login = self
		add_child(check)
	open()


## Shown again (at start, when the server closed the door, after the menu button): with a token, ask the gate first.
func open() -> void:
	_polling = false
	if Settings.token == "":
		_show("form", "")
	else:
		_show("form", Strings.t("connecting"))
		_check_gate()


## The gate's answer right now ("" when the server did not answer): main.gd asks after a dropped connection.
func gate_now() -> String:
	var r: Dictionary = await _api.gate()
	if r.status == 0 or not (r.body is Dictionary):
		return ""
	return str(r.body.get("gate", ""))


func _process(delta: float) -> void:
	if not _polling or not visible:
		return
	_poll_in -= delta
	if _poll_in <= 0.0:
		_poll_in = POLL_SECONDS
		_check_gate()


func _show(panel: String, message: String) -> void:
	status.text = message
	form.visible = panel == "form"
	waiting.visible = panel == "waiting"
	picker.visible = panel == "picker"
	forget_button.visible = Settings.token != ""
	if panel == "form":
		code.grab_focus()


func _on_join() -> void:
	if _joining:
		return
	var typed := code.text.strip_edges()
	if typed == "":
		return
	_joining = true
	_polling = false
	Settings.set_server_url(url.text)
	url.text = Settings.server_url
	status.text = Strings.t("connecting")
	var r: Dictionary = await _api.join(typed, device_name.text.strip_edges())
	_joining = false
	if not r.ok:
		_show("form", _error_text(r))
		return
	var body: Dictionary = r.body
	Settings.set_token(str(body.get("token", "")), str(body.get("pending", "")))
	code.text = ""
	_apply_gate(body)


func _check_gate() -> void:
	var r: Dictionary = await _api.gate()
	if _joining:
		return
	if r.status == 0:
		_show("form", _error_text(r))
		_polling = true # the server may be back in a moment
		return
	if r.body is Dictionary:
		_apply_gate(r.body)


## What the gate said: in, waiting for a parent, or shut for now (then keep asking every few seconds).
func _apply_gate(body: Dictionary) -> void:
	var gate := str(body.get("gate", "unknown"))
	_polling = false
	match gate:
		"ok":
			_can_create = bool(body.get("canCreate", true)) # (the server checks again on Skapa)
			new_button.visible = _can_create
			_show("picker", "")
			_load_players()
		"pending":
			wait_text.text = Strings.t("gatePending", {"name": str(body.get("name", ""))})
			wait_code.text = _spaced(Settings.pending_code)
			_show("waiting", "")
			_polling = true
		"unknown":
			var had_token := Settings.token != ""
			Settings.forget_device()
			_show("form", Strings.t("gateUnknown") if had_token else "")
		"paused":
			_show("form", Strings.t("gatePaused"))
			_polling = true
		"closed":
			_show("form", Strings.t("gateClosed"))
			_polling = true
		"guests-closed":
			_show("form", Strings.t("gateGuestsClosed"))
			_polling = true
		"hours":
			var hours: Dictionary = body.get("hours", {})
			_show("form", Strings.t("gateHours", {"from": str(hours.get("from", "")), "to": str(hours.get("to", ""))}))
			_polling = true
		_:
			_show("form", gate)
	_poll_in = POLL_SECONDS


func _load_players() -> void:
	var r: Dictionary = await _api.players()
	if not r.ok:
		if r.status == 403 and r.body is Dictionary:
			_apply_gate(r.body) # the gate shut meanwhile
		else:
			_show("form", _error_text(r))
		return
	for child in cards.get_children():
		child.queue_free()
	var list: Array = r.body if r.body is Array else []
	for entry in list:
		var p: Dictionary = entry
		var id := str(p.get("id", ""))
		var button := Button.new()
		button.text = str(p.get("name", "?"))
		button.custom_minimum_size = Vector2(0, 48)
		button.pressed.connect(func() -> void: _pick(id))
		cards.add_child(button)
		if id == Settings.player_id:
			button.grab_focus()
	if list.is_empty():
		var hint := Label.new()
		hint.text = Strings.t("noCharactersYet" if _can_create else "noCharactersGuest")
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		cards.add_child(hint)


func _on_new_character() -> void:
	_polling = false
	_creator.open()


## A character was made: the list is fetched again and the new one is the one selected (its card has the focus).
func _on_created(id: String) -> void:
	Settings.player_id = id
	Settings.save()
	_load_players()


func _pick(id: String) -> void:
	_polling = false
	Settings.player_id = id
	Settings.save()
	start_game.emit(id)


func _on_forget() -> void:
	_polling = false
	Settings.forget_device()
	_show("form", "")


func _error_text(r: Dictionary) -> String:
	if r.status == 0:
		return Strings.t("serverUnreachable", {"url": Settings.server_url})
	var err := str(r.body.get("error", "")) if r.body is Dictionary else ""
	match err:
		"limit":
			return Strings.t("joinLimit")
		"full":
			return Strings.t("joinFull")
		"invalid":
			return Strings.t("joinInvalid")
	return "%s (HTTP %d)" % [Strings.t("joinInvalid"), r.status]


static func _spaced(digits: String) -> String:
	return digits.substr(0, 3) + " " + digits.substr(3)
