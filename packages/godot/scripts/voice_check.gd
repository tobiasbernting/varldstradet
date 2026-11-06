class_name VoiceCheck
extends Node
## `--voicecheck`: a headless check of Röstprat's parts that need no microphone and no second machine, for the Godot
## workflow. It checks the mu-law codec and the room rules (voice.gd against shared/src/voice.ts), and, when the
## webrtc-native GDExtension is loaded, makes two VoicePeers in this process, hands each one's handshake to the other
## (what the server does over the game socket) and sends sound packets across their data channel. `--require-webrtc`
## turns a missing extension into a failure (the workflow passes it once it has fetched the addon). Sound itself
## (the microphone, the speakers) cannot be checked headless.
##
##   godot --headless --path packages/godot -- --voicecheck [--require-webrtc]

var _failed := 0


func _ready() -> void:
	await get_tree().process_frame
	_codec()
	_rules()
	if Voice.available:
		await _connection()
	elif OS.get_cmdline_user_args().has("--require-webrtc"):
		_check("the webrtc-native extension is loaded", false, "GDExtensionManager lists %s" % str(GDExtensionManager.get_loaded_extensions()))
	else:
		print("voicecheck: skip the connection check: the webrtc-native extension is not loaded")
	print("voicecheck: %s" % ("FAILED (%d)" % _failed if _failed > 0 else "all ok"))
	get_tree().quit(1 if _failed > 0 else 0)


func _check(what: String, ok: bool, detail := "") -> void:
	print("voicecheck: %s %s %s" % ["ok  " if ok else "FAIL", what, detail])
	if not ok:
		_failed += 1


func _codec() -> void:
	var worst := 0.0
	for i in 400:
		var x := sin(float(i) * 0.37) * (0.02 + float(i) / 420.0)
		worst = maxf(worst, absf(VoiceCodec.decode_sample(VoiceCodec.encode_sample(x)) - x) / maxf(absf(x), 0.01))
	_check("mu-law keeps a sample within 4 % (relative)", worst < 0.04, "worst %.3f" % worst)
	_check("mu-law silence decodes to about zero", absf(VoiceCodec.decode_sample(VoiceCodec.encode_sample(0.0))) < 0.001)
	_check("mu-law keeps the sign", VoiceCodec.decode_sample(VoiceCodec.encode_sample(-0.5)) < -0.4 and VoiceCodec.decode_sample(VoiceCodec.encode_sample(0.5)) > 0.4)
	var samples := PackedFloat32Array()
	for i in VoiceCodec.FRAME:
		samples.append(sin(float(i) * 0.2) * 0.5)
	var packet := VoiceCodec.pack(65535, samples)
	_check("a packet is 2 + 320 bytes", packet.size() == VoiceCodec.HEADER + VoiceCodec.FRAME)
	var back := VoiceCodec.unpack(packet)
	_check("a packet unpacks to its sequence and samples", not back.is_empty() and back["seq"] == 65535 and (back["samples"] as PackedFloat32Array).size() == VoiceCodec.FRAME)
	_check("a foreign packet is refused", VoiceCodec.unpack(PackedByteArray([1, 2])).is_empty())
	_check("sequence numbers wrap", VoiceCodec.is_newer(0, 65535) and not VoiceCodec.is_newer(65535, 0) and not VoiceCodec.is_newer(5, 5))
	var frames := PackedVector2Array()
	frames.resize(48000)
	frames.fill(Vector2(0.5, 0.5))
	var carry := {}
	var mono := VoiceCodec.to_mono_16k(frames, 48000.0, carry)
	_check("a second at 48 kHz is 16000 samples at 16 kHz", absi(mono.size() - 16000) <= 1, str(mono.size()))
	_check("resampling keeps the level", absf(VoiceCodec.rms(mono) - 0.5) < 0.01)


func _rules() -> void:
	var st := {
		"allowed": true, "room": "a", "joined": true, "talking": [],
		"rooms": [
			{"id": "a", "members": [{"id": "p1", "name": "Ask", "joined": true}], "speaker": "p1"},
			{"id": "b", "members": [{"id": "p2", "name": "Embla", "joined": true}], "speaker": "p2"},
			{"id": "c", "members": [{"id": "p3", "name": "Frej", "joined": false}], "speaker": null},
		],
	}
	_check("voice_peers: the speakers of the other rooms", Voice.voice_peers(st) == ["p2"], str(Voice.voice_peers(st)))
	_check("my_speaker: my room's", Voice.my_speaker(st) == "p1")
	_check("offers: one side only", Voice.offers("p1", "p2") and not Voice.offers("p2", "p1"))


func _connection() -> void:
	var a := VoicePeer.new()
	var b := VoicePeer.new()
	add_child(a)
	add_child(b)
	# no STUN: both are on this machine, host candidates are enough
	var a_ok := a.start("b", true, [])
	var b_ok := b.start("a", false, [])
	_check("two peers start", a_ok and b_ok)
	if not (a_ok and b_ok):
		return
	a.signal_out.connect(func(d: Dictionary) -> void: b.on_signal(d))
	b.signal_out.connect(func(d: Dictionary) -> void: a.on_signal(d))
	var until := Time.get_ticks_msec() + 15000
	while Time.get_ticks_msec() < until and not (a.is_open() and b.is_open()):
		await get_tree().process_frame
	_check("the data channel opens on both sides", a.is_open() and b.is_open())
	_check("both peers say connected", a.state == "connected" and b.state == "connected", "%s %s" % [a.state, b.state])
	if a.is_open() and b.is_open():
		var samples := PackedFloat32Array()
		for i in VoiceCodec.FRAME:
			samples.append(sin(float(i) * 0.3) * 0.4)
		for i in 10:
			a.send_packet(VoiceCodec.pack(i + 1, samples))
			await get_tree().create_timer(0.02).timeout
		await get_tree().create_timer(0.5).timeout
		_check("sound packets cross (unreliable channel: most of ten)", b.packets_in >= 5, "%d of 10 arrived" % b.packets_in)
	a.close()
	b.close()
	a.queue_free()
	b.queue_free()
