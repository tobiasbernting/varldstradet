extends Node
## Röstprat in the native client (DESIGN.md "Röstprat" and "Godot client: Röstprat"). An autoload: it listens to the game
## socket for the server's `voice` messages and does the rest on its own, so no scene needs to know about it.
##
## The rules are the browser client's and shared/src/voice.ts's: voice is per room, you never hear your own room, one
## device per room is the speakerphone (the "högtalare") and only it opens its microphone and connects, to the speaker of
## every other room (a mesh of at most eight), with `offers()` deciding who makes the offer. The server introduces the
## speakers (`voice state`), gives the STUN/TURN servers (`voice ice`) and relays the handshake (`voice signal`).
## What differs: Godot's WebRTC has data channels only, so the sound is mu-law packets on a data channel
## (voice_codec.gd, voice_peer.gd), and the microphone is an AudioStreamMicrophone read through an AudioEffectCapture.
## Without the webrtc-native GDExtension (addons/webrtc) `available` is false and this device never picks up the phone
## (it would take the room's speakerphone and not be able to use it).

signal changed ## the state, the peers or the microphone changed: the window and the HUD button redraw
signal window_asked ## the pause menu or the HUD button wants the Röstprat window
signal rang(player_name: String) ## a speaker in another room picked up

const THRESHOLD := 0.02 ## the RMS (of -1..1) above which a frame is speech
const HOLD := 0.4 ## seconds the microphone stays "talking" after the last loud frame
const FRAME_SECONDS := 0.02
const RETRY_SECONDS := 3.0
const TALKING_MIN_MSEC := 150 ## the server ignores a `talking` report this soon after the last one it took (VOICE_TALKING_MIN_MS)
const BUS := "VoiceIn"

var available := false ## webrtc-native is loaded
var state: Dictionary = {} ## the last `voice state` (shared VoiceState), empty before the first / after a disconnect
var talking_ids: Array = [] ## speakers whose room is talking right now
var ice: Array = [] ## the server's STUN/TURN servers
var mic_present := true ## false when the machine has no microphone: this device then only listens
var talking := false ## my microphone is carrying speech right now
var ptt_button := false ## the window's hold-to-talk button is down
var peers: Dictionary = {} ## player id -> VoicePeer
var room_mode := "auto" ## how I chose my room: "auto" (everyone at this address), "alone" or "with"

var _want_join := false
var _ice_ready := false
var _early: Dictionary = {} ## player id -> handshake messages that came before the peer was opened
var _retry: Dictionary = {} ## player id -> seconds until a failed peer is rebuilt
var _window: Node = null
var _mic_player: AudioStreamPlayer = null
var _capture: AudioEffectCapture = null
var _mic_on := false
var _acc := PackedFloat32Array()
var _carry := {}
var _seq := 0
var _hold := 0.0
var _talking_sent := false ## what the server has accepted as my room's talking state
var _talking_want := false ## what it should be: sent as soon as TALKING_MIN_MSEC have passed since the last report
var _talking_at := -TALKING_MIN_MSEC ## Time.get_ticks_msec() of the last report sent
var _auto_ok := true
var _demo_on := false


func _ready() -> void:
	available = _probe()
	var args := OS.get_cmdline_user_args()
	# the other checks (bots, demos, benches) must not pick up the phone
	for a in ["--bot", "--farmbot", "--demo", "--bench", "--creatorcheck", "--voicecheck", "--voicedemo"]:
		for arg in args:
			if arg == a or arg.begins_with(a + "="):
				_auto_ok = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	if args.has("--voicedemo"):
		_demo()
	Net.message.connect(_on_message)
	Net.connection_changed.connect(_on_connection)


## `--voicedemo` (for the picture in docs): a made-up call, no network and no sound, with the window open.
func _demo() -> void:
	available = true
	_auto_ok = false
	Net.player_id = "p1"
	state = {
		"allowed": true, "room": "a", "joined": true, "talking": ["p2"],
		"rooms": [
			{"id": "a", "members": [{"id": "p1", "name": "Ask", "joined": true}, {"id": "p4", "name": "Saga", "joined": false}], "speaker": "p1"},
			{"id": "b", "members": [{"id": "p2", "name": "Farmor", "joined": true}], "speaker": "p2"},
			{"id": "c", "members": [{"id": "p3", "name": "Morbror Olle", "joined": true}], "speaker": "p3"},
		],
	}
	talking_ids = ["p2"]
	_demo_on = true
	await get_tree().create_timer(0.3).timeout
	open_window()


## "connecting" | "connected" | "failed" for the speaker `id` (the demo says connected).
func peer_state(id: String) -> String:
	var p: VoicePeer = peers.get(id)
	if p != null:
		return p.state
	return "connected" if _demo_on else "connecting"


## Frees the window, the connections and the microphone before the game quits (the leak check at exit wants them gone).
func release() -> void:
	_close_all()
	_mic_stop()
	if _mic_player != null:
		_mic_player.queue_free()
		_mic_player = null
	if _window != null:
		_window.queue_free()
		_window = null


## Whether the webrtc-native GDExtension is loaded (a WebRTCPeerConnection made without it only prints errors).
static func _probe() -> bool:
	for path in GDExtensionManager.get_loaded_extensions():
		if str(path).to_lower().contains("webrtc"):
			return true
	return false


# ---------------------------------------------------------------------------
# The rules (shared/src/voice.ts)


## The speakers of the other rooms: the ones my device connects to when it is my room's speaker.
static func voice_peers(st: Dictionary) -> Array:
	var out: Array = []
	for r in st.get("rooms", []):
		if str(r.get("id", "")) != str(st.get("room", "")) and r.get("speaker") != null:
			out.append(str(r["speaker"]))
	return out


## Which of two speakers makes the offer: the same answer on both sides.
static func offers(me: String, peer: String) -> bool:
	return me < peer


## My room's speaker, or "".
static func my_speaker(st: Dictionary) -> String:
	for r in st.get("rooms", []):
		if str(r.get("id", "")) == str(st.get("room", "")) and r.get("speaker") != null:
			return str(r["speaker"])
	return ""


func is_joined() -> bool:
	return bool(state.get("joined", false))


func is_allowed() -> bool:
	return bool(state.get("allowed", false))


func is_speaker() -> bool:
	return is_joined() and my_speaker(state) == Net.player_id and Net.player_id != ""


func name_of(id: String) -> String:
	for r in state.get("rooms", []):
		for m in r.get("members", []):
			if str(m.get("id", "")) == id:
				return str(m.get("name", "?"))
	return "?"


## The room that holds this player (a dictionary of the state), or {}.
func room_of(id: String) -> Dictionary:
	for r in state.get("rooms", []):
		for m in r.get("members", []):
			if str(m.get("id", "")) == id:
				return r
	return {}


func is_talking_room(r: Dictionary) -> bool:
	return r.get("speaker") != null and talking_ids.has(str(r["speaker"]))


## "" when everything is fine, else a key of Strings that says what is wrong with this device's voice.
func problem() -> String:
	if not available:
		return "voiceUnavailable"
	if state.is_empty():
		return "voiceNoServer"
	if not is_allowed():
		return "voiceNotAllowed"
	return ""


# ---------------------------------------------------------------------------
# What the player asks for


func open_window() -> void:
	window_asked.emit()
	if _window == null:
		_window = VoiceWindow.new()
		# a child of the running scene, not of this autoload: the scene is torn down in an order that leaves nothing behind
		(get_tree().current_scene if get_tree().current_scene != null else self).add_child(_window)
	_window.open_window()


func window_open() -> bool:
	return _window != null and _window.is_open()


func call_up() -> void:
	Settings.voice_auto = true
	Settings.save()
	_join()


func hang_up() -> void:
	Settings.voice_auto = false
	Settings.save()
	_want_join = false
	if is_joined():
		Net.send({"t": "voice", "a": "leave"})


func become_speaker() -> void:
	Net.send({"t": "voice", "a": "speaker"})


## mode "auto" | "alone" | "with" (and the player to sit with)
func set_room(mode: String, with := "") -> void:
	room_mode = mode
	var msg := {"t": "voice", "a": "room", "mode": mode}
	if mode == "with":
		msg["with"] = with
	Net.send(msg)


func set_mic(on: bool) -> void:
	Settings.voice_mic = on
	Settings.save()
	changed.emit()


func set_mode(mode: String) -> void:
	Settings.voice_mode = mode
	Settings.save()
	changed.emit()


func set_volume(v: float) -> void:
	Settings.voice_volume = clampf(v, 0.0, 1.0)
	Settings.save()
	for p in peers.values():
		p.set_volume(Settings.voice_volume)


func _join() -> void:
	if available and is_allowed() and not is_joined():
		Net.send({"t": "voice", "a": "join"})


# ---------------------------------------------------------------------------
# The server's messages


func _on_connection(status: String, _code: int) -> void:
	if status != "open":
		_reset()


func _reset() -> void:
	_close_all()
	state = {}
	room_mode = "auto"
	talking_ids = []
	ice = []
	_ice_ready = false
	_early.clear()
	_want_join = false
	_set_talking(false, false)
	changed.emit()


func _on_message(msg: Dictionary) -> void:
	var t := str(msg.get("t", ""))
	if t == "welcome":
		# a new session: the server sends the voice state after it, and the phone is picked up on login
		_reset()
		_want_join = Settings.voice_auto and _auto_ok
		return
	if t != "voice":
		return
	match str(msg.get("ev", "")):
		"state":
			_on_state(msg.get("state", {}))
		"ice":
			ice = msg.get("servers", [])
			_ice_ready = true
			_sync()
		"signal":
			_on_signal(str(msg.get("from", "")), msg.get("data", {}))
		"talking":
			var id := str(msg.get("id", ""))
			talking_ids.erase(id)
			if bool(msg.get("on", false)):
				talking_ids.append(id)
			changed.emit()


func _on_state(st: Dictionary) -> void:
	var was_speaker := is_speaker()
	var before := voice_peers(state)
	state = st
	talking_ids = (st.get("talking", []) as Array).duplicate()
	if _want_join and is_allowed():
		_want_join = false
		_join()
	if was_speaker and is_speaker():
		for id in voice_peers(state):
			if not before.has(id):
				rang.emit(name_of(id))
	_sync()
	changed.emit()


## Opens and closes connections to match the state: only a joined speaker has any.
func _sync() -> void:
	if not is_speaker() or not available:
		_close_all()
		if not is_speaker():
			_ice_ready = false
		_mic_stop()
		return
	var want := voice_peers(state)
	for id in peers.keys():
		if not want.has(id):
			_drop(id)
	for id in _retry.keys():
		if not want.has(id):
			_retry.erase(id)
	if _ice_ready:
		for id in want:
			if not peers.has(id) and not _retry.has(id):
				_open_peer(id)
	_mic_start()


func _open_peer(id: String) -> VoicePeer:
	var p := VoicePeer.new()
	p.name = "Peer-" + id.replace(":", "_")
	add_child(p)
	if not p.start(id, offers(Net.player_id, id), ice):
		p.queue_free()
		_retry[id] = RETRY_SECONDS
		return null
	p.signal_out.connect(func(data: Dictionary) -> void:
		Net.send({"t": "voice", "a": "signal", "to": id, "data": data}))
	p.state_changed.connect(func(s: String) -> void:
		if s == "failed" and peers.get(id) == p:
			_drop(id)
			_retry[id] = RETRY_SECONDS
		changed.emit())
	peers[id] = p
	for early in _early.get(id, []):
		p.on_signal(early)
	_early.erase(id)
	changed.emit()
	return p


func _drop(id: String) -> void:
	var p: VoicePeer = peers.get(id)
	peers.erase(id)
	if p != null:
		p.close()
		p.queue_free()


func _close_all() -> void:
	for id in peers.keys():
		_drop(id)
	_retry.clear()


func _on_signal(from: String, data: Variant) -> void:
	if not (data is Dictionary) or not is_speaker() or not voice_peers(state).has(from):
		return
	var d: Dictionary = data
	if str(d.get("k", "")) == "sdp" and str(d.get("type", "")) == "offer" and peers.has(from) and peers[from].has_remote():
		_drop(from) # the other side starts over: so do we (a peer with nothing from it yet is simply waiting for this offer)
	var p: VoicePeer = peers.get(from)
	if p == null:
		if _ice_ready and available and not _retry.has(from):
			p = _open_peer(from)
		if p == null:
			var list: Array = _early.get(from, [])
			list.append(d)
			_early[from] = list
			return
	p.on_signal(d)


# ---------------------------------------------------------------------------
# The microphone


func _mic_start() -> void:
	if _mic_on:
		return
	if AudioServer.get_input_device_list().size() == 0:
		mic_present = false
		return
	mic_present = true
	if _mic_player == null:
		var idx := AudioServer.get_bus_index(BUS)
		if idx < 0:
			idx = AudioServer.bus_count
			AudioServer.add_bus(idx)
			AudioServer.set_bus_name(idx, BUS)
			AudioServer.set_bus_mute(idx, true) # what the microphone hears is sent, never played back
			_capture = AudioEffectCapture.new()
			_capture.buffer_length = 0.25
			AudioServer.add_bus_effect(idx, _capture)
		else:
			_capture = AudioServer.get_bus_effect(idx, 0) as AudioEffectCapture
		_mic_player = AudioStreamPlayer.new()
		_mic_player.stream = AudioStreamMicrophone.new()
		_mic_player.bus = BUS
		add_child(_mic_player)
	_mic_player.play()
	_capture.clear_buffer()
	_acc.clear()
	_carry = {}
	_mic_on = true


func _mic_stop() -> void:
	if not _mic_on:
		return
	_mic_on = false
	if _mic_player != null:
		_mic_player.stop()
	_set_talking(false, true)


## Whether sound goes out now: the microphone is on and (open microphone, or the key or the button is held).
func transmitting() -> bool:
	if not Settings.voice_mic or not _mic_on:
		return false
	return Settings.voice_mode == "open" or _ptt_held()


func _ptt_held() -> bool:
	if ptt_button:
		return true
	if not InputMap.has_action("voice_ptt") or not Input.is_action_pressed("voice_ptt"):
		return false
	var f := get_viewport().gui_get_focus_owner()
	return not (f is LineEdit or f is TextEdit) # the chat box takes the key as a letter


func _process(delta: float) -> void:
	_flush_talking()
	for id in _retry.keys():
		_retry[id] -= delta
		if _retry[id] <= 0.0:
			_retry.erase(id)
			_sync()
	if _mic_on and _capture != null:
		var n := _capture.get_frames_available()
		if n > 0:
			_acc.append_array(VoiceCodec.to_mono_16k(_capture.get_buffer(n), AudioServer.get_mix_rate(), _carry))
			while _acc.size() >= VoiceCodec.FRAME:
				_frame(_acc.slice(0, VoiceCodec.FRAME))
				_acc = _acc.slice(VoiceCodec.FRAME)


func _frame(samples: PackedFloat32Array) -> void:
	if not transmitting():
		_hold = 0.0
		_set_talking(false, true)
		return
	if VoiceCodec.rms(samples) > THRESHOLD:
		_hold = HOLD
	else:
		_hold = maxf(0.0, _hold - FRAME_SECONDS)
	if _hold <= 0.0:
		_set_talking(false, true)
		return
	_set_talking(true, true)
	_seq = (_seq + 1) & 0xFFFF
	var packet := VoiceCodec.pack(_seq, samples)
	for p in peers.values():
		p.send_packet(packet)


func _set_talking(on: bool, report: bool) -> void:
	if on != talking:
		talking = on
		changed.emit()
	if report:
		_talking_want = on
		_flush_talking()
	else:
		_talking_sent = false
		_talking_want = false


## Tells the server about the talking state, but never sooner than TALKING_MIN_MSEC after the last report: the server
## drops one that comes sooner, and a dropped "off" would leave the room talking for good. Called again from _process
## until what the server has matches what is wanted.
func _flush_talking() -> void:
	if _talking_want == _talking_sent or not is_speaker():
		return
	if Time.get_ticks_msec() - _talking_at < TALKING_MIN_MSEC:
		return
	_talking_sent = _talking_want
	_talking_at = Time.get_ticks_msec()
	Net.send({"t": "voice", "a": "talking", "on": _talking_sent})
