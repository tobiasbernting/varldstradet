class_name VoiceCodec
extends RefCounted
## What Röstprat puts on the wire. Godot's WebRTC has no media tracks (only data channels), so the sound travels as
## small packets on an unreliable, unordered data channel: 16 kHz mono, 20 ms (320 samples) a packet, each sample one
## byte of 8-bit mu-law (G.711 style), which is half of plain 16-bit PCM: 16 kB/s a peer, about 130 kB/s out to the
## most a mesh has (seven peers). A packet is a 16-bit sequence number (little endian) and the 320 bytes.
## No echo cancellation: the room and speakerphone rules (shared/src/voice.ts) are what keep echo away.

const RATE := 16000
const FRAME := 320 ## samples in a packet: 20 ms
const HEADER := 2
const BIAS := 0x84
const CLIP := 32635

static var _decode_table := PackedFloat32Array()


## One mu-law byte for a sample in -1..1.
static func encode_sample(x: float) -> int:
	var s := clampi(int(x * 32767.0), -32767, 32767)
	var sign_bit := 0
	if s < 0:
		s = -s
		sign_bit = 0x80
	s = mini(s, CLIP) + BIAS
	var exponent := 7
	var mask := 0x4000
	while exponent > 0 and (s & mask) == 0:
		exponent -= 1
		mask >>= 1
	var mantissa := (s >> (exponent + 3)) & 0x0F
	return (~(sign_bit | (exponent << 4) | mantissa)) & 0xFF


static func _table() -> PackedFloat32Array:
	if _decode_table.is_empty():
		_decode_table.resize(256)
		for i in 256:
			var u := (~i) & 0xFF
			var sign_bit := u & 0x80
			var exponent := (u >> 4) & 0x07
			var mantissa := u & 0x0F
			var v := (((mantissa << 3) + BIAS) << exponent) - BIAS
			_decode_table[i] = (-v if sign_bit != 0 else v) / 32768.0
	return _decode_table


static func decode_sample(b: int) -> float:
	return _table()[b & 0xFF]


## A packet from 320 samples (-1..1).
static func pack(seq: int, samples: PackedFloat32Array) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(HEADER + samples.size())
	out[0] = seq & 0xFF
	out[1] = (seq >> 8) & 0xFF
	for i in samples.size():
		out[HEADER + i] = encode_sample(samples[i])
	return out


## {"seq": int, "samples": PackedFloat32Array}, or an empty dictionary for a packet that is not ours.
static func unpack(data: PackedByteArray) -> Dictionary:
	if data.size() <= HEADER or data.size() > HEADER + FRAME * 4:
		return {}
	var t := _table()
	var samples := PackedFloat32Array()
	samples.resize(data.size() - HEADER)
	for i in samples.size():
		samples[i] = t[data[HEADER + i]]
	return {"seq": data[0] | (data[1] << 8), "samples": samples}


## True when `seq` comes after `last` on a 16-bit counter that wraps (so a late straggler is dropped).
static func is_newer(seq: int, last: int) -> bool:
	var d := (seq - last) & 0xFFFF
	return d != 0 and d < 0x8000


## The microphone's stereo frames at the mix rate -> mono at 16 kHz, each output sample the mean of the input samples it
## covers (a box filter, enough for speech). `carry` is the fractional position left over from the last call.
static func to_mono_16k(frames: PackedVector2Array, mix_rate: float, carry: Dictionary) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var step := mix_rate / float(RATE)
	var pos: float = carry.get("pos", 0.0)
	var acc: float = carry.get("acc", 0.0)
	var n: int = carry.get("n", 0)
	for f in frames:
		acc += (f.x + f.y) * 0.5
		n += 1
		pos += 1.0
		if pos >= step:
			pos -= step
			out.append(acc / float(n))
			acc = 0.0
			n = 0
	carry["pos"] = pos
	carry["acc"] = acc
	carry["n"] = n
	return out


static func rms(samples: PackedFloat32Array) -> float:
	if samples.is_empty():
		return 0.0
	var sum := 0.0
	for s in samples:
		sum += s * s
	return sqrt(sum / float(samples.size()))
