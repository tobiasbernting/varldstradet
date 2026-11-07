class_name Main
extends Node
## Login first; the world once a character is picked; back to login when the server closes the door (4003) or the
## player picks "Byt spelare" in the pause menu. The command line (after `--`) can skip the login:
##   --demo[=farm|forest] the world plays a recorded fixture (no server needed): Draugkryptan (the default; with
##                       --fight a scripted fight runs on it), the farm, or the forest with the dungeon's arch;
##                       --demo=frost|surt|hel are the next dungeons; --demo=ending (Völvan's last hand-in) and --demo=loke --ending play the saga's ending (demo_ending.gd); --fight plays their bosses' moves (demo_bosses.gd), and
##                       --once leaves when it has played, --boss-move=<species>:<move>[:after] holds one move's marks for a picture;
##                       --time=0.7 --weather=rain --season=jul set the sky, --at=x,y where to stand
##                       --boost shows the speed boost's chip (a picture of where it sits)
##                       --people3d 3D bodies for people and creatures (figure_3d.gd, voxel_body.gd, skeleton_figure.gd)
##   --demo=lineup       the 3D bodies side by side on green, no world (demo_lineup.gd; --set=undead|animals, --zoom=0.9)
##   --bench[=preset]    the demo scene on each quality preset (or one: lag, mellan, hog) in steady state, printing
##                       frame times, draw calls, lights and the render timings (bench.gd)
##   --quality=lag|mellan|hog   (with --demo) this run's preset, not saved; --alive=all (M7a) turns the alive world's fireflies, butterflies,
##                       leaves, smoke and mist all on whatever the hour and season; --year=spring|summer|autumn|winter sets the season of the year
##   --farmbot           a headless player that farms against a local server (farm_bot.gd, M4b)
##   --runbot            a headless player that walks to the färdport, starts (or joins) a run and fights through its zones (run_bot.gd, M5c)
##   --settingscheck     the settings window: every setting changed through its controls, kept, saved and applied, then restored (settings_check.gd, M8b)
##   --voicecheck        Röstprat's codec, rules and (with the webrtc extension) a connection between two peers (voice_check.gd)
##   --bot               a headless player that logs in against a local server (ACCESS=open, DEV_TELEPORT=1), walks
##                       to the first pack, fights it and writes a report (bot.gd)

@onready var login: LoginScreen = $Login
@onready var world: WorldView = $World

var _quitting := false


func _ready() -> void:
	get_tree().auto_accept_quit = false # closing the window goes through quit_clean too
	login.start_game.connect(_on_start)
	world.left.connect(_on_left)
	Net.connection_changed.connect(_on_connection)
	var args := OS.get_cmdline_user_args()
	if args.has("--farmbot"):
		login.visible = false
		_set_world(true)
		var farmer := FarmBot.new()
		farmer.name = "FarmBot"
		farmer.world = world
		add_child(farmer)
	elif args.has("--runbot"):
		login.visible = false
		_set_world(true)
		var runner := RunBot.new()
		runner.name = "Bot"
		runner.world = world
		add_child(runner)
	elif args.has("--settingscheck"):
		login.visible = false
		var sc := SettingsCheck.new()
		sc.name = "SettingsCheck"
		add_child(sc)
	elif args.has("--voicecheck"):
		login.visible = false
		var vc := VoiceCheck.new()
		vc.name = "VoiceCheck"
		add_child(vc)
	elif args.has("--bot"):
		login.visible = false
		_set_world(true)
		var bot := Bot.new()
		bot.name = "Bot"
		bot.world = world
		add_child(bot)
	elif _flag(args, "--bench"):
		login.visible = false
		_set_world(true)
		var scene := _arg(args, "--scene", "draug")
		world.start_demo(scene)
		var fight: DemoFight = null
		if scene == "draug":
			fight = DemoFight.new()
			fight.name = "DemoFight"
			fight.world = world
			add_child(fight)
		var bench := Bench.new()
		bench.name = "Bench"
		bench.world = world
		bench.fight = fight
		add_child(bench)
	elif _flag(args, "--demo") and _demo_name(args) == "lineup":
		# the 3D bodies side by side (demo_lineup.gd): no world, no server
		login.visible = false
		world.queue_free()
		add_child((load("res://scenes/lineup.tscn") as PackedScene).instantiate())
	elif _flag(args, "--demo"):
		login.visible = false
		_set_world(true)
		world.start_demo(_demo_name(args))
		var demo_id := _demo_name(args)
		if args.has("--ending") or demo_id == "ending":
			# the saga's ending (M6c): what comes on screen when Loke falls (`--demo=loke --ending`) and when Völvan pays the last chapter (`--demo=ending`)
			var ending := DemoEnding.new()
			ending.name = "DemoEnding"
			ending.world = world
			ending.quit_when_done = args.has("--once")
			add_child(ending)
		elif args.has("--fight") and demo_id == "draug":
			var fight := DemoFight.new()
			fight.name = "DemoFight"
			fight.world = world
			add_child(fight)
		elif (args.has("--fight") or _flag(args, "--boss-move")) and Data.dungeon(demo_id).size() > 0:
			# the bosses of any other dungeon (M6a): every move of the mid-boss and the boss, from the data (demo_bosses.gd)
			var show := DemoBosses.new()
			show.name = "DemoFight"
			show.world = world
			show.only = _arg(args, "--boss-move", "")
			show.quit_when_done = args.has("--once")
			show.speed = 3.0 if show.quit_when_done else 1.0
			add_child(show)
	else:
		_show_login()


## The value of `--name=value` among the arguments (`fallback` when there is none).
func _arg(args: PackedStringArray, flag: String, fallback: String) -> String:
	for a in args:
		if a.begins_with(flag + "="):
			return a.substr(flag.length() + 1)
	return fallback


## The fixture `--demo=<name>` asks for ("draug" without a name).
func _demo_name(args: PackedStringArray) -> String:
	for a in args:
		if a.begins_with("--demo="):
			return a.substr(7)
	return "draug"


## `--name` or `--name=value` among the arguments.
func _flag(args: PackedStringArray, flag: String) -> bool:
	for a in args:
		if a == flag or a.begins_with(flag + "="):
			return true
	return false


func _show_login() -> void:
	_set_world(false)
	login.visible = true
	login.open()


func _set_world(on: bool) -> void:
	world.visible = on
	if not on:
		world.hide_look()
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


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		quit_clean()


## Quits with nothing left behind. The engine reports every object, resource and renderer allocation that is still
## alive when the process exits ("leaked at exit", "still in use at exit"): a world, its HUD and a playing sound are
## alive until the tree is torn down, and the renderer is gone by then. So the world and the drivers are freed first
## (the end of the frame frees them), the sounds are let go and have a moment to fade out, the connection is closed,
## and only then does the tree quit. Every way out of the game that the game itself chooses goes through here:
## --bench, --screenshot, a finished --bot, and closing the window. (--quit-after, which the CI uses, quits from the
## engine's own loop; the scenes are then torn down by the engine, and the same rules keep that clean.)
func quit_clean(code := 0) -> void:
	if _quitting:
		return
	_quitting = true
	Net.disconnect_now()
	Sfx.release()
	if is_instance_valid(world): # (the --demo=lineup scene has no world: it is freed in _ready)
		world.release_sounds()
	Voice.release()
	for child in get_children():
		child.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	get_tree().quit(code)
