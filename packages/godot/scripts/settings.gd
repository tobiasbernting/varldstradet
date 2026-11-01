extends Node
## What this machine remembers, in user://settings.cfg: the server's address, this device's token (the same long
## random token the browser keeps in a cookie; the server stores only its hash), the number to show while a parent
## approves the device, the last character picked, and the graphics quality preset (quality.gd).

const FILE := "user://settings.cfg"
const DEFAULT_URL := "https://example.invalid"

var server_url: String = DEFAULT_URL
var token: String = ""
var pending_code: String = ""
var player_id: String = ""
var quality: String = "mellan"
## "buttons": the four spells on X, Y, B and RB (the browser's layout); "wheel": one button opens a radial wheel.
var spell_input: String = "buttons"
var show_fps: bool = false


func _ready() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(FILE) != OK:
		return
	server_url = str(cfg.get_value("server", "url", DEFAULT_URL))
	token = str(cfg.get_value("device", "token", ""))
	pending_code = str(cfg.get_value("device", "pending", ""))
	player_id = str(cfg.get_value("device", "player", ""))
	quality = str(cfg.get_value("graphics", "quality", "mellan"))
	spell_input = str(cfg.get_value("input", "spells", "buttons"))
	show_fps = bool(cfg.get_value("graphics", "fps", false))


func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("server", "url", server_url)
	cfg.set_value("device", "token", token)
	cfg.set_value("device", "pending", pending_code)
	cfg.set_value("device", "player", player_id)
	cfg.set_value("graphics", "quality", quality)
	cfg.set_value("input", "spells", spell_input)
	cfg.set_value("graphics", "fps", show_fps)
	var err := cfg.save(FILE)
	if err != OK:
		push_warning("could not save %s: %s" % [FILE, error_string(err)])


## "gard.example.se", "http://localhost:8080/" and so on, made into an address the client can use: https unless it
## is this computer (then plain http, like the browser against `pnpm dev`), and no trailing slash.
static func normalize_url(typed: String) -> String:
	var u := typed.strip_edges()
	if u == "":
		return DEFAULT_URL
	if not (u.begins_with("http://") or u.begins_with("https://")):
		var host: String = u.split("/")[0].split(":")[0]
		u = ("http://" if host in ["localhost", "127.0.0.1", "::1"] else "https://") + u
	while u.ends_with("/"):
		u = u.substr(0, u.length() - 1)
	return u


func set_server_url(typed: String) -> void:
	server_url = normalize_url(typed)
	save()


func set_token(new_token: String, pending: String) -> void:
	token = new_token
	pending_code = pending
	save()


func forget_device() -> void:
	token = ""
	pending_code = ""
	player_id = ""
	save()


func http_url(path: String) -> String:
	return server_url + path


## The game socket: wss for https, ws for http (localhost).
func ws_url() -> String:
	var u := server_url
	if u.begins_with("https://"):
		u = "wss://" + u.substr(8)
	elif u.begins_with("http://"):
		u = "ws://" + u.substr(7)
	return u + "/ws"
