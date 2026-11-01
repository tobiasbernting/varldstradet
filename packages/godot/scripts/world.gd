class_name WorldView
extends Node2D
## Milestone M2's world: no map yet. Shows the day, the season, the clock, how many are online and where you are,
## moves your hero (and tells the server), and logs every message type the server sends.

signal left

const DAY_MS := 600000.0 ## a day is 10 real minutes (shared/src/sim.ts)
const TILE := 16.0
const LOG_LINES := 14

@onready var hero: Hero = %Hero
@onready var day_label: Label = %Day
@onready var online_label: Label = %Online
@onready var position_label: Label = %Position
@onready var status_label: Label = %ConnStatus
@onready var log_title: Label = %LogTitle
@onready var log_label: RichTextLabel = %Log

var me := ""
var day := 0
var time_ms := 0.0
var season := "none"
var online := 0
var _lines := PackedStringArray()
var _last_line := ""
var _repeats := 0


func _ready() -> void:
	log_title.text = Strings.t("worldLogTitle")
	Net.message.connect(_on_message)
	Net.connection_changed.connect(_on_connection)
	_refresh()


func reset() -> void:
	me = ""
	online = 0
	_lines.clear()
	_last_line = ""
	_repeats = 0
	log_label.text = ""
	hero.reset()
	_refresh()


func _process(_delta: float) -> void:
	position_label.text = Strings.t("worldPosition", {"x": int(hero.position.x / TILE), "y": int(hero.position.y / TILE)})


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("menu"):
		left.emit()
	elif event.is_action_pressed("act"):
		_log("→ act (not sent in this milestone)")
	else:
		for i in range(1, 5):
			if event.is_action_pressed("spell_%d" % i):
				_log("→ spell_%d (not sent in this milestone)" % i)


func _on_connection(status: String, close_code: int) -> void:
	match status:
		"connecting":
			status_label.text = Strings.t("connecting")
		"open":
			status_label.text = ""
		_:
			status_label.text = Strings.t("disconnected")
	_log("socket: %s%s" % [status, "" if close_code == 0 else " (%d)" % close_code])


func _on_message(msg: Dictionary) -> void:
	var t := str(msg.get("t", "?"))
	match t:
		"welcome":
			me = str(msg.get("you", ""))
			var w: Dictionary = msg.get("world", {})
			day = int(w.get("day", 0))
			time_ms = float(w.get("timeMs", 0))
			season = str(msg.get("season", "none"))
			var players: Dictionary = w.get("players", {})
			var p: Dictionary = players.get(me, {})
			hero.place(Vector2(float(p.get("x", 0)), float(p.get("y", 0))), str(p.get("name", "")))
			_log("welcome: %s" % str(p.get("name", me)))
		"state":
			day = int(msg.get("day", day))
			time_ms = float(msg.get("timeMs", time_ms))
			season = str(msg.get("season", season))
			var list: Array = msg.get("players", [])
			online = list.size()
			for entry in list:
				var snap: Dictionary = entry
				# the server's word on where you stand; while you walk, your own steps win (it corrects you on a wall)
				if str(snap.get("id", "")) == me and not hero.moving:
					hero.place(Vector2(float(snap.get("x", 0)), float(snap.get("y", 0))), "")
			_log("state")
		"changes":
			var kinds := PackedStringArray()
			for entry in msg.get("changes", []):
				var c: Dictionary = entry
				var kind := str(c.get("t", "?"))
				kinds.append(kind)
				if kind == "warp" and str(c.get("id", "")) == me:
					hero.place(Vector2(float(c.get("x", 0)), float(c.get("y", 0))), "")
			_log("changes: " + ", ".join(kinds))
		"error":
			_log("error: " + str(msg.get("text", "")))
		_:
			_log(t)
	_refresh()


func _log(line: String) -> void:
	if line == _last_line and not _lines.is_empty():
		_repeats += 1
		_lines[_lines.size() - 1] = "%s ×%d" % [line, _repeats + 1]
	else:
		_last_line = line
		_repeats = 0
		_lines.append(line)
		while _lines.size() > LOG_LINES:
			_lines.remove_at(0)
	log_label.text = "\n".join(_lines)


func _refresh() -> void:
	var minutes := int(time_ms / DAY_MS * 24.0 * 60.0)
	day_label.text = "%s · %s · %02d:%02d" % [Strings.t("day", {"day": day}), Strings.season(season), minutes / 60, minutes % 60]
	online_label.text = Strings.t("worldOnline", {"n": online})
