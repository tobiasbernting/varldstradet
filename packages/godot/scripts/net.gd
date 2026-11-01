extends Node
## The game socket, like packages/client/src/net.ts: wss to the server (ws for localhost), this device's token as a
## bearer header on the upgrade, `hello` with the chosen character, a `ping` every 15 s, and a reconnect with
## backoff when the connection drops. A 4003 close means the server took this device's access away: no reconnect.

## "connecting" | "open" | "closed" | "no_access"; the close code when there is one (-1 when the socket just dropped)
signal connection_changed(status: String, close_code: int)
## Every message from the server, parsed (the shapes in packages/shared/src/protocol.ts)
signal message(msg: Dictionary)

const CLOSE_NO_ACCESS := 4003
const PING_SECONDS := 15.0
const BACKOFF_MIN := 0.5
const BACKOFF_MAX := 8.0

var player_id := ""
var _ws: WebSocketPeer = null
var _wanted := false
var _was_open := false
var _backoff := BACKOFF_MIN
var _retry_in := 0.0
var _ping_in := PING_SECONDS


func connect_as(id: String) -> void:
	player_id = id
	_wanted = true
	_backoff = BACKOFF_MIN
	_open()


func disconnect_now() -> void:
	_wanted = false
	_retry_in = 0.0
	if _ws != null:
		_ws.close()
		_ws = null


func is_open() -> bool:
	return _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN


func send(msg: Dictionary) -> void:
	if is_open():
		_ws.send_text(JSON.stringify(msg))


func _open() -> void:
	_ws = WebSocketPeer.new()
	# the welcome carries the whole farm and an areaData a whole dungeon (hundreds of kB); the default inbound
	# buffer is 64 KiB and the server's close code 1009 ("too big") was all a client saw of them
	_ws.inbound_buffer_size = 8 << 20
	_ws.max_queued_packets = 4096
	_was_open = false
	var headers := PackedStringArray()
	if Settings.token != "":
		headers.append("Authorization: Bearer " + Settings.token)
	_ws.handshake_headers = headers
	var err := _ws.connect_to_url(Settings.ws_url())
	if err != OK:
		push_warning("socket: could not connect to %s (%s)" % [Settings.ws_url(), error_string(err)])
		_ws = null
		_retry()
		return
	connection_changed.emit("connecting", 0)


func _retry() -> void:
	_retry_in = _backoff
	_backoff = minf(BACKOFF_MAX, _backoff * 2.0)


func _process(delta: float) -> void:
	if _ws == null:
		if _wanted and _retry_in > 0.0:
			_retry_in -= delta
			if _retry_in <= 0.0:
				_open()
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if not _was_open:
				_was_open = true
				_backoff = BACKOFF_MIN
				_ping_in = PING_SECONDS
				connection_changed.emit("open", 0)
				send({"t": "hello", "playerId": player_id})
			while _ws.get_available_packet_count() > 0:
				_receive(_ws.get_packet().get_string_from_utf8())
			_ping_in -= delta
			if _ping_in <= 0.0:
				_ping_in = PING_SECONDS
				send({"t": "ping"})
		WebSocketPeer.STATE_CLOSED:
			var code := _ws.get_close_code()
			_ws = null
			if not _wanted:
				connection_changed.emit("closed", code)
			elif code == CLOSE_NO_ACCESS:
				_wanted = false
				connection_changed.emit("no_access", code)
			else:
				connection_changed.emit("closed", code)
				_retry()


func _receive(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary and parsed.has("t"):
		message.emit(parsed)
