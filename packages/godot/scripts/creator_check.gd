class_name CreatorCheck
extends Node
## `--creatorcheck`: a headless run of the character creator, for tools/bot-check.mts. Against a local server (ACCESS=open)
## it takes the real way: the login screen's "Ny karaktär" button opens the creator window, a name and a look are chosen,
## "Skapa" sends POST /api/players through Api, the picker lists the new character and has it selected, the card is
## pressed, and the game connects as it and is welcomed. A report says what happened; the empty-name error is checked too.
##
##   godot --headless --path packages/godot -- --creatorcheck --server=http://127.0.0.1:8097 --name=Bot-Skapare --report=/tmp/c.json

var login: LoginScreen
var char_name := "Bot-Skapare"
var report_path := ""
var _report := {"name": "", "ok": false, "id": "", "choice": {}, "steps": [], "errors": []}
var shot_path := ""
var _welcomed := ""


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--server="):
			Settings.server_url = arg.substr(9) # (not saved: this is a check, not a player's settings)
		elif arg.begins_with("--name="):
			char_name = arg.substr(7)
		elif arg.begins_with("--shot="):
			shot_path = arg.substr(7)
		elif arg.begins_with("--report="):
			report_path = arg.substr(9)
	_report["name"] = char_name
	Net.message.connect(func(msg: Dictionary) -> void:
		if str(msg.get("t", "")) == "welcome":
			_welcomed = str(msg.get("you", "")))
	_run()


func _step(step_name: String, ok: bool, detail: String = "") -> bool:
	_report["steps"].append({"name": step_name, "ok": ok, "detail": detail})
	print("creatorcheck: %s %s %s" % ["ok  " if ok else "FAIL", step_name, detail])
	if not ok:
		_report["errors"].append("%s: %s" % [step_name, detail])
	return ok


func _wait_until(cond: Callable, seconds: float) -> bool:
	var until := Time.get_ticks_msec() + int(seconds * 1000.0)
	while Time.get_ticks_msec() < until:
		if cond.call():
			return true
		await get_tree().process_frame
	return cond.call()


func _run() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if shot_path != "":
		await _shot()
		return
	var gate: String = await login.gate_now()
	if not _step("the gate lets the device in", gate == "ok", gate):
		return _finish()
	login._apply_gate({"gate": "ok", "canCreate": true})
	await get_tree().process_frame
	_step("the picker shows 'Ny karaktär'", login.picker.visible and login.new_button.visible and login.new_button.text == "Ny karaktär", login.new_button.text)
	login.new_button.pressed.emit()
	var win: CreatorWindow = login._creator
	_step("the creator window opens", win.is_open() and win.visible)
	# an empty name is refused before anything is sent, in Swedish
	var empty: Dictionary = await win._submit()
	_step("an empty name is refused", int(empty.get("status", 0)) == 400 and win._error.text == Strings.t("creatorErrName"), win._error.text)
	# the arrow buttons: each row's ▶ steps its choice on by one, ◀ steps it back (and wraps round)
	for row_id in ["skin", "hair", "style", "shirt"]:
		var row: Dictionary = win._rows[row_id]
		var before: int = win.get(row_id + "_i")
		var n: int = {"skin": win.skins.size(), "hair": win.hair_colors.size(), "style": win.HAIR_STYLES.size(), "shirt": win.shirts.size()}[row_id]
		(row["next"] as Button).pressed.emit()
		var after: int = win.get(row_id + "_i")
		(row["prev"] as Button).pressed.emit()
		var back: int = win.get(row_id + "_i")
		(row["prev"] as Button).pressed.emit()
		var wrapped: int = win.get(row_id + "_i")
		(row["next"] as Button).pressed.emit()
		_step("the %s arrows step the choice" % row_id, n < 2 or (after == (before + 1) % n and back == before and wrapped == posmod(before - 1, n) and win.get(row_id + "_i") == before), "%d -> %d -> %d -> %d of %d" % [before, after, back, wrapped, n])
	# a look: the 4th skin, the 7th hair colour, curly, the green shirt (through the arrow buttons' own step)
	win._input.text = "  " + char_name + "  "
	win.skin_i = 3
	win.hair_i = 6
	win.style_i = 2
	win.shirt_i = win.shirts.find("shirt_green")
	win._refresh()
	var want := win.choice()
	_report["choice"] = want
	_step("the preview is drawn", win._preview.texture != null and (win._preview.texture as AtlasTexture).atlas != null)
	var made: Dictionary = await win._submit()
	var body: Dictionary = made.body if made.get("body") is Dictionary else {}
	if not _step("Skapa makes the character (HTTP %s)" % str(made.get("status")), int(made.get("status", 0)) == 201 and str(body.get("id", "")) != "", str(body)):
		return _finish()
	var id := str(body["id"])
	_report["id"] = id
	var ap: Dictionary = body.get("appearance", {})
	_step("the server kept the look", ap.get("skin") == want["appearance"]["skin"] and ap.get("hair") == want["appearance"]["hair"] and ap.get("hairStyle") == "curly" and body.get("outfit", {}).get("shirt") == "shirt_green" and body.get("name") == char_name, JSON.stringify(body))
	_step("the window closed", not win.is_open() and not win.visible)
	# the picker is fetched again and has the new one selected
	await _wait_until(func() -> bool: return _card_named(char_name) != null, 10.0)
	var card := _card_named(char_name)
	_step("the picker lists the new character", card != null)
	_step("the new character is the selected one", Settings.player_id == id and card != null and card.has_focus(), Settings.player_id)
	if card == null:
		return _finish()
	# and playing as it works
	card.pressed.emit()
	var in_game := await _wait_until(func() -> bool: return _welcomed == id, 25.0)
	_step("the game welcomes the new character", in_game, _welcomed)
	_report["ok"] = _report["errors"].is_empty()
	_finish()


## `--shot=file.png` (needs a window, no server): the open creator with a name and a look, saved as a picture.
func _shot() -> void:
	var win: CreatorWindow = login._creator
	win.open()
	win._input.text = char_name
	win.skin_i = 2
	win.hair_i = 5
	win.style_i = 3
	win.shirt_i = win.shirts.find("shirt_green")
	win._refresh()
	win._input.release_focus()
	win._create.grab_focus()
	for i in range(20):
		await get_tree().process_frame
	var img := get_viewport().get_texture().get_image()
	if img != null:
		img.save_png(shot_path)
		print("screenshot saved to %s" % shot_path)
	Net.disconnect_now()
	(get_tree().current_scene as Main).quit_clean()


func _card_named(card_name: String) -> Button:
	for c in login.cards.get_children():
		if c is Button and (c as Button).text == card_name:
			return c
	return null


func _finish() -> void:
	_report["ok"] = _report["errors"].is_empty()
	if report_path != "":
		var fa := FileAccess.open(report_path, FileAccess.WRITE)
		if fa != null:
			fa.store_string(JSON.stringify(_report, "  "))
			fa.close()
	print("creatorcheck: %s (%d errors)" % ["ok" if _report["ok"] else "FAILED", _report["errors"].size()])
	Net.disconnect_now()
	await get_tree().create_timer(0.5).timeout
	(get_tree().current_scene as Main).quit_clean(0 if bool(_report["ok"]) else 1)
