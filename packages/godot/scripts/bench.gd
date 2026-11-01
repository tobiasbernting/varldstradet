class_name Bench
extends Node
## `--bench`: the demo scene (with the scripted fight running, so telegraphs and effects are on screen) for 10 s on
## each quality preset, after a short warm-up, then the numbers on stdout: the average frame time and the "1 % low"
## (the mean of the slowest 1 % of frames) per preset, and the machine's name. Needs a window (or Xvfb): headless
## Godot does not render, so its frame times say nothing. Run it on the MacBook and on the Intel laptop:
##   godot --path packages/godot -- --bench
## (or the exported build with `-- --bench`), and send the lines back.

const WARMUP := 1.5
const MEASURE := 10.0

var world: WorldView
var _presets: Array = []
var _stage := -1
var _t := 0.0
var _times: Array = []
var _results: Array = []


func _ready() -> void:
	_presets = Quality.ORDER.duplicate()
	print("bench: %s, %s, %s" % [OS.get_name(), OS.get_processor_name(), RenderingServer.get_video_adapter_name()])
	print("bench: renderer %s, window %s, %d lights, %d actors" % [ProjectSettings.get_setting("rendering/renderer/rendering_method"), str(get_viewport().get_visible_rect().size), world.dungeon.light_count(), world.actors_root.get_child_count()])
	if DisplayServer.get_name() == "headless":
		print("bench: WARNING headless, nothing is rendered: the numbers below only say the scripts ran")
	_next()


func _next() -> void:
	_stage += 1
	if _stage >= _presets.size():
		_finish()
		return
	Quality.set_preset(str(_presets[_stage]))
	_t = 0.0
	_times = []


func _process(delta: float) -> void:
	if _stage < 0 or _stage >= _presets.size():
		return
	_t += delta
	if _t < WARMUP:
		return
	_times.append(delta)
	if _t >= WARMUP + MEASURE:
		var line := "bench: %s: %s (%d frames)" % [Quality.label_of(str(_presets[_stage])), HudLayer.perf_text(_times), _times.size()]
		print(line)
		_results.append(line)
		_next()


func _finish() -> void:
	print("bench: done")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			var f := FileAccess.open(arg.substr(6), FileAccess.WRITE)
			if f != null:
				f.store_string("\n".join(_results) + "\n")
	get_tree().quit()
