extends Node
## The dungeon's sounds, made in code like the browser's (packages/client/src/sagasfx.ts and sound.ts): no audio
## files. Every sound is a small recipe of tones, noise and filtered sweeps rendered once into a short PCM buffer
## (22 050 Hz, mono), kept as an AudioStreamWAV, and played through a handful of players. `play(name)` is the hook
## the rest of the client calls: a spell id (`yxhugg`, `claw`, `mob_draugbage`…), `land_<move>` for a boss's attack
## landing, `windup_<move>` for the gathering of power, or one of the HUD's own (hurt, crit, stun, kick, yell,
## banner, fanfare, fanfare_big, sombre, calm, chime, plate, warn, fall, rise, target, loot, loot_big, chat, poof).
## Unknown names are quiet. Headless (the bot and CI) nothing is heard, but the recipes still render, so a broken
## one shows up there too.

const RATE := 22050
const PLAYERS := 8
const MASTER := 0.9

var _cache: Dictionary = {} ## name -> AudioStreamWAV
var _players: Array[AudioStreamPlayer] = []
var _next := 0
var muted := false


func _ready() -> void:
	for i in range(PLAYERS):
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_players.append(p)


## Plays a named sound (see the top of the file). `ms` is the boss's warning time for a `windup_*`.
func play(sound_name: String, ms: float = 1500.0) -> void:
	if muted:
		return
	var key := sound_name
	if sound_name.begins_with("windup_"):
		key = "%s@%d" % [sound_name, int(clampf(ms, 400.0, 3000.0) / 100.0)]
	var stream: AudioStreamWAV = _cache.get(key)
	if stream == null:
		if _cache.has(key):
			return
		stream = _render(sound_name, ms)
		_cache[key] = stream
		if stream == null:
			return
	var p := _players[_next]
	_next = (_next + 1) % PLAYERS
	p.stream = stream
	p.play()


# ---------------------------------------------------------------------------
# Rendering: a mix buffer of floats, and the browser's primitives written into it at an offset


class Mix:
	const RATE := 22050
	const MASTER := 0.9
	var data := PackedFloat32Array()

	func _init(seconds: float) -> void:
		data.resize(int(seconds * RATE) + 1)
		data.fill(0.0)

	func need(seconds: float) -> void:
		var n := int(seconds * RATE) + 1
		if n > data.size():
			var old := data.size()
			data.resize(n)
			for i in range(old, n):
				data[i] = 0.0

	func to_stream() -> AudioStreamWAV:
		var s := AudioStreamWAV.new()
		s.format = AudioStreamWAV.FORMAT_16_BITS
		s.mix_rate = RATE
		s.stereo = false
		var bytes := PackedByteArray()
		bytes.resize(data.size() * 2)
		for i in range(data.size()):
			var v := int(clampf(data[i] * MASTER, -1.0, 1.0) * 32767.0)
			bytes.encode_s16(i * 2, v)
		s.data = bytes
		return s


static func _osc(kind: String, phase: float) -> float:
	var p := fmod(phase, 1.0)
	match kind:
		"square":
			return 1.0 if p < 0.5 else -1.0
		"sawtooth":
			return 2.0 * p - 1.0
		"triangle":
			return 4.0 * absf(p - 0.5) - 1.0
	return sin(p * TAU)


## tone(freq, dur, type, vol, slide): a wave that fades out exponentially, sliding `slide` Hz by the end.
static func tone(m: Mix, at: float, freq: float, dur: float, kind: String = "square", vol: float = 0.08, slide: float = 0.0) -> void:
	m.need(at + dur)
	var start := int(at * RATE)
	var n := int(dur * RATE)
	var phase := 0.0
	var f1 := maxf(40.0, freq + slide)
	for i in range(n):
		var k := float(i) / maxf(1.0, float(n))
		var f := freq * pow(f1 / freq, k) if slide != 0.0 else freq
		phase += f / RATE
		var env := pow(0.001, k) # exponential ramp from vol to 0.001·vol, as the gain node does
		var j := start + i
		if j < m.data.size():
			m.data[j] += _osc(kind, phase) * vol * env


## noise(dur, vol): white noise fading linearly.
static func noise(m: Mix, at: float, dur: float, vol: float = 0.06) -> void:
	m.need(at + dur)
	var start := int(at * RATE)
	var n := int(dur * RATE)
	for i in range(n):
		var j := start + i
		if j < m.data.size():
			m.data[j] += (randf() * 2.0 - 1.0) * (1.0 - float(i) / float(n)) * vol


## sweep(dur, from, to, vol, type, q): noise through a filter whose centre slides from one pitch to another.
static func sweep(m: Mix, at: float, dur: float, from: float, to: float, vol: float = 0.05, kind: String = "bandpass", q: float = 1.2) -> void:
	m.need(at + dur)
	var start := int(at * RATE)
	var n := int(dur * RATE)
	var low := 0.0
	var band := 0.0
	var attack := minf(0.05, dur / 3.0)
	for i in range(n):
		var k := float(i) / maxf(1.0, float(n))
		var fc := from * pow(maxf(40.0, to) / from, k)
		var f := 2.0 * sin(PI * minf(fc, RATE * 0.45) / RATE)
		var x := randf() * 2.0 - 1.0
		# a Chamberlin state-variable filter: low, band and high outputs
		low += f * band
		var high := x - low - band / q
		band += f * high
		var y := band if kind == "bandpass" else (low if kind == "lowpass" else high)
		var t := float(i) / RATE
		var env: float
		if t < attack:
			env = t / attack
		else:
			env = pow(0.001, (t - attack) / maxf(0.001, dur - attack))
		var j := start + i
		if j < m.data.size():
			m.data[j] += clampf(y, -1.5, 1.5) * vol * env


## swell(freq, dur, to, vol, type): a tone that grows slowly and slides up (a boss gathering power).
static func swell(m: Mix, at: float, freq: float, dur: float, to: float, vol: float = 0.05, kind: String = "sine") -> void:
	m.need(at + dur)
	var start := int(at * RATE)
	var n := int(dur * RATE)
	var phase := 0.0
	for i in range(n):
		var k := float(i) / maxf(1.0, float(n))
		var f := freq * pow(to / freq, k)
		phase += f / RATE
		var env := pow(1000.0, k / 0.85) * 0.001 if k < 0.85 else pow(0.001, (k - 0.85) / 0.15)
		var j := start + i
		if j < m.data.size():
			m.data[j] += _osc(kind, phase) * vol * minf(1.0, env)


static func notes(m: Mix, at: float, freqs: Array, step: float, dur: float, kind: String = "triangle", vol: float = 0.05) -> void:
	for i in range(freqs.size()):
		tone(m, at + i * step, float(freqs[i]), dur, kind, vol)


static func slash(m: Mix, at: float, pitch: float = 1.0) -> void:
	sweep(m, at, 0.12, 2500.0 * pitch, 700.0 * pitch, 0.07, "highpass", 0.7)
	tone(m, at, 260.0 * pitch, 0.08, "square", 0.035, -120.0)


static func thud(m: Mix, at: float) -> void:
	tone(m, at, 110.0, 0.14, "square", 0.06, -50.0)
	noise(m, at, 0.06, 0.06)


static func boom(m: Mix, at: float, big: float = 1.0) -> void:
	noise(m, at, 0.25 + big * 0.15, 0.07 + big * 0.04)
	tone(m, at, 80.0, 0.3 + big * 0.1, "triangle", 0.08, -40.0)


# ---------------------------------------------------------------------------
# The recipes (sagasfx.ts, SPELL_SOUNDS, bossWindup, bossLand and SAGA_SFX)


func _render(sound_name: String, ms: float) -> AudioStreamWAV:
	var m := Mix.new(0.3)
	var known := true
	if sound_name.begins_with("windup_"):
		_windup(m, sound_name.substr(7), ms)
	elif sound_name.begins_with("land_"):
		_land(m, sound_name.substr(5))
	else:
		known = _recipe(m, sound_name)
	if not known:
		return null
	return m.to_stream()


func _recipe(m: Mix, n: String) -> bool:
	match n:
		"hugg":
			slash(m, 0.0, 1.0)
		"utmana":
			tone(m, 0.0, 220.0, 0.28, "sawtooth", 0.045, 110.0)
			tone(m, 0.09, 330.0, 0.3, "sawtooth", 0.035, 60.0)
		"skoldslag":
			thud(m, 0.0)
			tone(m, 0.04, 1250.0, 0.12, "triangle", 0.04, -300.0)
		"skoldmur":
			tone(m, 0.0, 196.0, 0.5, "triangle", 0.06, 98.0)
			tone(m, 0.06, 392.0, 0.4, "sine", 0.04)
		"lakerunan":
			notes(m, 0.0, [660, 880, 1100], 0.06, 0.18, "sine", 0.045)
		"ljuspil":
			tone(m, 0.0, 1100.0, 0.16, "triangle", 0.045, 900.0)
		"lakekrets":
			notes(m, 0.0, [523, 659, 784, 1047, 1319], 0.07, 0.22, "sine", 0.04)
		"vackupp":
			notes(m, 0.0, [392, 523, 659, 784, 1047], 0.09, 0.3, "triangle", 0.05)
		"yxhugg":
			slash(m, 0.0, 0.7)
			thud(m, 0.05)
		"stormsteg":
			sweep(m, 0.0, 0.3, 400.0, 2400.0, 0.07)
			thud(m, 0.22)
		"virvelvind":
			for i in range(3):
				sweep(m, i * 0.11, 0.16, 900.0 + i * 400.0, 2600.0 + i * 300.0, 0.06)
		"raseri":
			tone(m, 0.0, 110.0, 0.5, "sawtooth", 0.055, -30.0)
			tone(m, 0.0, 165.0, 0.45, "square", 0.03, -40.0)
			sweep(m, 0.0, 0.4, 300.0, 1200.0, 0.04, "lowpass")
		"eldboll":
			sweep(m, 0.0, 0.3, 300.0, 1500.0, 0.06, "lowpass", 0.6)
			boom(m, 0.26, 0.3)
		"isspjut":
			tone(m, 0.0, 2100.0, 0.12, "triangle", 0.04, -900.0)
			notes(m, 0.14, [2637, 3136], 0.04, 0.1, "sine", 0.03)
		"askregn":
			noise(m, 0.0, 0.35, 0.09)
			tone(m, 0.0, 60.0, 0.5, "square", 0.05, -20.0)
			for i in range(3):
				sweep(m, 0.08 + i * 0.09, 0.08, 4000.0, 1500.0, 0.06, "highpass")
		"blink":
			tone(m, 0.0, 600.0, 0.16, "sine", 0.05, 1400.0)
			tone(m, 0.09, 1800.0, 0.14, "triangle", 0.035, 600.0)
		"potion":
			tone(m, 0.0, 320.0, 0.08, "sine", 0.06, 200.0)
			tone(m, 0.11, 360.0, 0.08, "sine", 0.06, 240.0)
			notes(m, 0.24, [784, 1047], 0.06, 0.12, "sine", 0.035)
		"claw":
			sweep(m, 0.0, 0.08, 1800.0, 600.0, 0.05, "highpass")
			tone(m, 0.0, 180.0, 0.06, "square", 0.03, -80.0)
		"mob_draugbage":
			tone(m, 0.0, 900.0, 0.08, "sine", 0.04, 500.0)
		"mob_isande":
			tone(m, 0.0, 1500.0, 0.18, "sine", 0.04, -700.0)
		"charge_land":
			boom(m, 0.0, 0.6)
			sweep(m, 0.0, 0.3, 2000.0, 300.0, 0.05, "lowpass")
		"hurt":
			tone(m, 0.0, 300.0, 0.09, "square", 0.045, -120.0)
		"crit":
			thud(m, 0.0)
			tone(m, 0.03, 1600.0, 0.08, "triangle", 0.035, -500.0)
		"stun":
			notes(m, 0.0, [1568, 1319, 1568], 0.05, 0.07, "triangle", 0.03)
		"kick":
			thud(m, 0.0)
			notes(m, 0.06, [784, 1175], 0.07, 0.15, "triangle", 0.05)
		"yell":
			tone(m, 0.0, 150.0, 0.4, "sawtooth", 0.05, -60.0)
			tone(m, 0.06, 98.0, 0.5, "square", 0.035, -25.0)
			sweep(m, 0.0, 0.45, 500.0, 200.0, 0.04, "bandpass", 2.0)
		"banner":
			tone(m, 0.0, 196.0, 1.2, "sine", 0.06)
			tone(m, 0.0, 294.0, 1.0, "sine", 0.035)
			tone(m, 0.12, 392.0, 0.8, "triangle", 0.025)
		"fanfare", "fanfare_big":
			notes(m, 0.0, [392, 523, 659, 784], 0.11, 0.22, "square", 0.035)
			tone(m, 0.46, 1047.0, 0.7, "triangle", 0.05)
			tone(m, 0.46, 784.0, 0.7, "triangle", 0.035)
			tone(m, 0.46, 523.0, 0.7, "sine", 0.035)
			if n == "fanfare_big":
				for i in range(4):
					sweep(m, 0.8 + i * 0.28, 0.25, 600.0, 3000.0, 0.03, "bandpass", 3.0)
					noise(m, 1.04 + i * 0.28, 0.18, 0.05)
		"sombre":
			notes(m, 0.0, [294, 277, 220], 0.38, 0.7, "sine", 0.05)
			tone(m, 0.0, 73.0, 1.6, "triangle", 0.05)
		"calm":
			notes(m, 0.0, [523, 784, 1047, 784], 0.18, 0.6, "sine", 0.03)
		"chime":
			notes(m, 0.0, [1047, 1319, 1568, 2093], 0.07, 0.45, "sine", 0.04)
			tone(m, 0.32, 2637.0, 0.6, "triangle", 0.02)
		"plate":
			notes(m, 0.0, [784, 1175], 0.09, 0.35, "sine", 0.04)
		"warn":
			tone(m, 0.0, 880.0, 0.06, "square", 0.025)
			tone(m, 0.11, 880.0, 0.06, "square", 0.025)
		"fall":
			notes(m, 0.0, [440, 370, 294, 220], 0.13, 0.22, "triangle", 0.05)
		"rise":
			notes(m, 0.0, [330, 440, 554, 660], 0.09, 0.2, "triangle", 0.05)
		"target":
			tone(m, 0.0, 900.0, 0.035, "triangle", 0.03)
		"loot", "loot_big":
			notes(m, 0.0, [523, 659, 784, 1047], 0.08, 0.25, "triangle", 0.05)
			if n == "loot_big":
				notes(m, 0.38, [1319, 1568, 2093], 0.07, 0.35, "sine", 0.04)
				notes(m, 0.65, [1047, 1319, 1568, 2093, 2637], 0.06, 0.6, "triangle", 0.035)
		"chat":
			tone(m, 0.0, 740.0, 0.05, "sine", 0.04)
			tone(m, 0.055, 990.0, 0.07, "sine", 0.035)
		"poof":
			noise(m, 0.0, 0.18, 0.05)
			tone(m, 0.0, 420.0, 0.12, "sine", 0.03, 300.0)
		_:
			if n.begins_with("mob_"):
				# a monster's bolt with no sound of its own: the archer's twang
				tone(m, 0.0, 900.0, 0.08, "sine", 0.04, 500.0)
			else:
				return false
	return true


## bossWindup(move, ms): a boss gathering power, as long as the warning on the ground.
func _windup(m: Mix, move: String, ms: float) -> void:
	var dur := clampf(ms / 1000.0, 0.4, 3.0)
	match move:
		"line":
			sweep(m, 0.0, dur, 300.0, 2600.0, 0.045, "highpass", 0.8)
			swell(m, 0.0, 90.0, dur, 180.0, 0.04, "sawtooth")
		"pull":
			swell(m, 0.0, 60.0, dur, 120.0, 0.05, "triangle")
			for i in range(3):
				sweep(m, i * dur / 3.0, dur / 3.0, 1800.0, 300.0, 0.04, "bandpass", 2.0)
		"mend":
			notes(m, 0.0, [392, 330, 294, 262], dur / 5.0, 0.5, "sine", 0.035)
			swell(m, 0.0, 196.0, dur, 262.0, 0.02, "sine")
		"summon":
			swell(m, 0.0, 220.0, dur * 0.7, 440.0, 0.045, "sawtooth")
			tone(m, dur * 0.7, 440.0, 0.4, "triangle", 0.035, -180.0)
		_:
			var base := 70.0 if move == "nova" else (220.0 if move in ["freeze", "rain"] else (90.0 if move == "pools" else 110.0))
			swell(m, 0.0, base, dur, base * 2.2, 0.05, "triangle")
			swell(m, 0.0, base * 1.5, dur, base * 3.0, 0.025, "sine")


## bossLand(move): a boss's big attack lands.
func _land(m: Mix, move: String) -> void:
	match move:
		"freeze", "rain":
			notes(m, 0.0, [1760, 1319, 2093], 0.03, 0.12, "triangle", 0.04)
			noise(m, 0.0, 0.15, 0.05)
		"pools":
			sweep(m, 0.0, 0.5, 200.0, 900.0, 0.07, "lowpass", 0.7)
			boom(m, 0.0, 0.3)
		"cleave":
			slash(m, 0.0, 0.5)
			boom(m, 0.0, 0.5)
		"line":
			sweep(m, 0.0, 0.45, 3000.0, 400.0, 0.08, "bandpass", 0.8)
			boom(m, 0.0, 0.6)
		"pull":
			sweep(m, 0.0, 0.35, 2500.0, 200.0, 0.07, "lowpass", 0.7)
			thud(m, 0.28)
		"mend":
			notes(m, 0.0, [523, 659, 784], 0.07, 0.3, "sine", 0.04)
		"summon":
			noise(m, 0.0, 0.2, 0.06)
			tone(m, 0.08, 660.0, 0.12, "triangle", 0.035, 300.0)
		_:
			boom(m, 0.0, 1.4 if move == "nova" else 1.0)
