class_name VoicePeer
extends Node
## One connection of the voice mesh: a WebRTCPeerConnection to one other room's speaker, with one pre-agreed
## ("negotiated") unreliable, unordered data channel that carries the sound (voice_codec.gd), and a player that plays
## what comes in. The handshake goes out as `signal_out` (voice.gd sends it as `voice signal` over the game socket) and
## comes in through `on_signal`. The side `offers()` picks makes the offer; the other answers. Needs the webrtc-native
## GDExtension (addons/webrtc): without it `start` returns false and nothing else here runs.

## A handshake message for the other speaker: {"k": "sdp", "type", "sdp"} or {"k": "ice", "media", "index", "name"}
signal signal_out(data: Dictionary)
## "connecting" | "connected" | "failed" (voice.gd rebuilds a failed peer after a pause)
signal state_changed(state: String)

const CHANNEL_ID := 1
const CONNECT_TIMEOUT := 20.0
## The most sound waiting in the player before new packets are dropped (a late burst must not become a delay).
const MAX_BUFFER := 0.25
const PRIME := 0.06

var peer_id := ""
var state := "connecting"
var level := 0.0 ## the RMS of the last packet played, for the window's meter
var packets_in := 0
var packets_out := 0

var _pc: WebRTCPeerConnection
var _chan: WebRTCDataChannel
var _offerer := false
var _pending_ice: Array = []
var _have_remote := false
var _age := 0.0
var _player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback
var _last_seq := -1
var _started := false
var _capacity := 0 ## the generator's real ring buffer size in frames (Godot rounds buffer_length up to a power of two)


## Opens the connection. `ice` is the server's list ({urls, username?, credential?}). False without the extension.
func start(id: String, offerer: bool, ice: Array) -> bool:
	peer_id = id
	_offerer = offerer
	_pc = WebRTCPeerConnection.new()
	var servers: Array = []
	for s in ice:
		if s is Dictionary and s.has("urls"):
			var entry := {"urls": s["urls"]}
			if s.has("username"):
				entry["username"] = s["username"]
			if s.has("credential"):
				entry["credential"] = s["credential"]
			servers.append(entry)
	if _pc.initialize({"iceServers": servers}) != OK:
		_pc = null
		return false
	_pc.session_description_created.connect(_on_description)
	_pc.ice_candidate_created.connect(_on_candidate)
	_chan = _pc.create_data_channel("audio", {"negotiated": true, "id": CHANNEL_ID, "ordered": false, "maxRetransmits": 0})
	if _chan == null:
		_pc.close()
		_pc = null
		return false
	_chan.write_mode = WebRTCDataChannel.WRITE_MODE_BINARY
	_build_player()
	_started = true
	if _offerer:
		_pc.create_offer()
	return true


func _build_player() -> void:
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = VoiceCodec.RATE
	gen.buffer_length = 0.5
	_player = AudioStreamPlayer.new()
	_player.stream = gen
	_player.volume_db = linear_to_db(maxf(0.0001, Settings.voice_volume))
	add_child(_player)
	_player.play()
	_playback = _player.get_stream_playback() as AudioStreamGeneratorPlayback
	# nothing is pushed yet, so everything is free: that is the real capacity, not buffer_length * RATE
	_capacity = _playback.get_frames_available() if _playback != null else int(gen.buffer_length * VoiceCodec.RATE)


func set_volume(v: float) -> void:
	if _player != null:
		_player.volume_db = linear_to_db(maxf(0.0001, v))


func _on_description(type: String, sdp: String) -> void:
	if _pc == null:
		return
	_pc.set_local_description(type, sdp)
	signal_out.emit({"k": "sdp", "type": type, "sdp": sdp})


func _on_candidate(media: String, index: int, candidate_name: String) -> void:
	signal_out.emit({"k": "ice", "media": media, "index": index, "name": candidate_name})


## Whether the other side's description has arrived (an offer that comes again then means it started over).
func has_remote() -> bool:
	return _have_remote


## A handshake message from the other speaker.
func on_signal(data: Dictionary) -> void:
	if _pc == null:
		return
	match str(data.get("k", "")):
		"sdp":
			var type := str(data.get("type", ""))
			if type == "offer" and _offerer:
				return # both sides never offer at once (offers() is the same answer on both); ignore a stray one
			if type == "answer" and not _offerer:
				return
			if _pc.set_remote_description(type, str(data.get("sdp", ""))) != OK:
				return
			_have_remote = true
			for c in _pending_ice:
				_add_candidate(c)
			_pending_ice.clear()
		"ice":
			if _have_remote:
				_add_candidate(data)
			else:
				_pending_ice.append(data)


func _add_candidate(c: Dictionary) -> void:
	_pc.add_ice_candidate(str(c.get("media", "")), int(c.get("index", 0)), str(c.get("name", "")))


func is_open() -> bool:
	return _chan != null and _chan.get_ready_state() == WebRTCDataChannel.STATE_OPEN


## Sends one packet (voice_codec.gd's `pack`) when the channel is up.
func send_packet(data: PackedByteArray) -> void:
	if is_open():
		_chan.put_packet(data)
		packets_out += 1


func _process(delta: float) -> void:
	if _pc == null:
		return
	_pc.poll()
	_age += delta
	var next := state
	match _pc.get_connection_state():
		WebRTCPeerConnection.STATE_CONNECTED:
			next = "connected"
		WebRTCPeerConnection.STATE_FAILED, WebRTCPeerConnection.STATE_CLOSED:
			next = "failed"
		_:
			if state != "connected":
				next = "failed" if _age > CONNECT_TIMEOUT else "connecting"
	if next != state:
		state = next
		state_changed.emit(state)
	if _chan != null:
		while _chan.get_available_packet_count() > 0:
			_play(_chan.get_packet())
	level = maxf(0.0, level - delta * 2.0)


func _play(data: PackedByteArray) -> void:
	var p := VoiceCodec.unpack(data)
	if p.is_empty() or _playback == null:
		return
	var seq: int = p["seq"]
	if _last_seq >= 0 and not VoiceCodec.is_newer(seq, _last_seq):
		return # a late or repeated packet
	_last_seq = seq
	packets_in += 1
	var samples: PackedFloat32Array = p["samples"]
	var buffered := _capacity - _playback.get_frames_available()
	if buffered > int(MAX_BUFFER * VoiceCodec.RATE):
		return
	var frames := PackedVector2Array()
	if buffered <= 0:
		# the player ran dry: put a little silence in front so a jittery next packet does not click
		frames.resize(int(PRIME * VoiceCodec.RATE))
	for s in samples:
		frames.append(Vector2(s, s))
	if _playback.can_push_buffer(frames.size()):
		_playback.push_buffer(frames)
	level = maxf(level, minf(1.0, VoiceCodec.rms(samples) * 4.0))


func close() -> void:
	if _chan != null:
		_chan.close()
	if _pc != null:
		_pc.close()
	_chan = null
	_pc = null
	_playback = null
	if _player != null:
		_player.stop()
		_player.stream = null
