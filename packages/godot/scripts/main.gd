extends Node
## Login first; the world once a character is picked; back to login when the server closes the door (4003) or the
## player presses the menu button.

@onready var login: LoginScreen = $Login
@onready var world: WorldView = $World


func _ready() -> void:
	login.start_game.connect(_on_start)
	world.left.connect(_on_left)
	Net.connection_changed.connect(_on_connection)
	_show_login()


func _show_login() -> void:
	_set_world(false)
	login.visible = true
	login.open()


func _set_world(on: bool) -> void:
	world.visible = on
	world.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED


func _on_start(player_id: String) -> void:
	login.visible = false
	_set_world(true)
	world.reset()
	Net.connect_as(player_id)


func _on_left() -> void:
	Net.disconnect_now()
	_show_login()


func _on_connection(status: String, _close_code: int) -> void:
	if status == "no_access":
		# a parent closed the farm or took this device's access away: the login screen asks the gate why
		_show_login()
	elif status == "closed" and world.visible:
		# a dropped connection: Net reconnects by itself, unless the gate says this device may not play any more
		var gate: String = await login.gate_now()
		if gate != "" and gate != "ok" and world.visible:
			Net.disconnect_now()
			_show_login()
