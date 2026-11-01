extends Node
## Login first; the world once a character is picked; back to login when the server closes the door (4003) or the
## player picks "Byt spelare" in the pause menu. The command line (after `--`) can skip the login:
##   --demo              the world plays the recorded Draugkryptan fixture (no server needed); with --fight a
##                       scripted fight runs on it (telegraphs, a boss, hits, a chest), for screenshots
##   --bench             the demo for 10 s on each quality preset, printing the average and 1 % low frame times
##   --bot               a headless player that logs in against a local server (ACCESS=open, DEV_TELEPORT=1), walks
##                       to the first pack, fights it and writes a report (bot.gd)

@onready var login: LoginScreen = $Login
@onready var world: WorldView = $World


func _ready() -> void:
	login.start_game.connect(_on_start)
	world.left.connect(_on_left)
	Net.connection_changed.connect(_on_connection)
	var args := OS.get_cmdline_user_args()
	if args.has("--bot"):
		login.visible = false
		_set_world(true)
		var bot := Bot.new()
		bot.name = "Bot"
		bot.world = world
		add_child(bot)
	elif args.has("--bench"):
		login.visible = false
		_set_world(true)
		world.start_demo()
		var fight := DemoFight.new()
		fight.name = "DemoFight"
		fight.world = world
		add_child(fight)
		var bench := Bench.new()
		bench.name = "Bench"
		bench.world = world
		add_child(bench)
	elif args.has("--demo"):
		login.visible = false
		_set_world(true)
		world.start_demo()
		if args.has("--fight"):
			var fight := DemoFight.new()
			fight.name = "DemoFight"
			fight.world = world
			add_child(fight)
	else:
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
	if world.demo or has_node("Bot"):
		return
	if status == "no_access":
		# a parent closed the farm or took this device's access away: the login screen asks the gate why
		_show_login()
	elif status == "closed" and world.visible:
		# a dropped connection: Net reconnects by itself, unless the gate says this device may not play any more
		var gate: String = await login.gate_now()
		if gate != "" and gate != "ok" and world.visible:
			Net.disconnect_now()
			_show_login()
