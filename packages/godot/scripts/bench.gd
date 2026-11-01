class_name Bench
extends Node
## `--bench`: the demo scene (with the scripted fight running, so telegraphs and effects are on screen) on each
## quality preset, then the numbers on stdout. Needs a window (or Xvfb): headless Godot does not render, so its frame
## times say nothing. Run it on the MacBook and on the Intel laptop:
##   godot --path packages/godot -- --bench            (all three presets)
##   godot --path packages/godot -- --bench=mellan     (one: lag, mellan or hog)
## (or the exported build with `-- --bench`), and send the lines back. `--out=<file>` also writes them to a file.
##
## Steady state: a preset is set (which rebuilds the dungeon), then SETTLE seconds pass unmeasured, then the scripted
## fight plays once unmeasured (WARM: every material, glyph and pipeline the fight uses is created and compiled on
## this preset), then the fight is restarted and MEASURE seconds are recorded. Every preset therefore sees the same
## frames of the same fight, none of them the first use of anything.
##
## Per preset it prints the frame times (average, "1 % low": the mean of the slowest 1 % of frames), what the renderer
## drew (draw calls, primitives, objects: the engine's own counters, averaged over the window), the lights (how many
## exist, how many are in reach of the camera, how many throw shadows), the render thread's own timings (CPU and GPU
## milliseconds per frame, the GPU's only where the driver can say), the time every script's _process took per frame, and how the number of
## objects and nodes moved (a steady scene should not grow).

const SETTLE := 1.0
const WARM := 10.0
const MEASURE := 10.0
const SAMPLE_EVERY := 6 ## frames between two readings of the render counters

var world: WorldView
var fight: DemoFight
var _presets: Array = []
var _stage := -1
var _phase := "settle"
var _t := 0.0
var _frame := 0
var _times: Array = []
var _results: Array = []
var _samples: Dictionary = {}
var _script_from := 0
var _script_usec := 0
var _objects_at_start := 0
var _nodes_at_start := 0


## A node that runs last in every frame's _process (priority 1000), the counterpart of this one (priority -1000):
## the time between the two is what every script's _process took.
class EndMark extends Node:
	var done: Callable

	func _process(_delta: float) -> void:
		done.call()


func _ready() -> void:
	process_priority = -1000
	var end := EndMark.new()
	end.process_priority = 1000
	end.done = func() -> void: _script_usec = Time.get_ticks_usec() - _script_from
	add_child(end)
	_presets = Quality.ORDER.duplicate()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--bench=") and Quality.PRESETS.has(arg.substr(8)):
			_presets = [arg.substr(8)]
	var info := Engine.get_version_info()
	_say("Godot %s, %s, %s (%s)" % [info.get("string", "?"), RenderingServer.get_current_rendering_method(), RenderingServer.get_current_rendering_driver_name(), OS.get_name()])
	_say("%s, %s" % [OS.get_processor_name(), RenderingServer.get_video_adapter_name()])
	_say("%d objects, %d lights, %d actors" % [world.dungeon.object_count(), world.dungeon.light_count(), world.actors_root.get_child_count()])
	if DisplayServer.get_name() == "headless":
		_say("WARNING headless, nothing is rendered: the numbers below only say the scripts ran")
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	_next()


func _say(text: String) -> void:
	print("bench: ", text)


func _next() -> void:
	_stage += 1
	if _stage >= _presets.size():
		_finish()
		return
	Quality.set_preset(str(_presets[_stage]))
	_enter("settle")


func _enter(phase: String) -> void:
	_phase = phase
	_t = 0.0
	if phase == "warm" or phase == "measure":
		fight.restart()
	if phase == "measure":
		_frame = 0
		_times = []
		_samples = {"draw": [], "prims": [], "objects": [], "cpu": [], "gpu": [], "script": [], "active": [], "shadows": []}
		_objects_at_start = int(Performance.get_monitor(Performance.OBJECT_COUNT))
		_nodes_at_start = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))


func _process(delta: float) -> void:
	_script_from = Time.get_ticks_usec()
	if _stage < 0 or _stage >= _presets.size():
		return
	_t += delta
	match _phase:
		"settle":
			if _t >= SETTLE:
				_enter("warm")
		"warm":
			if _t >= WARM:
				_enter("measure")
		"measure":
			_times.append(delta)
			_frame += 1
			if _frame % SAMPLE_EVERY == 0:
				_sample()
			if _t >= MEASURE:
				_report()
				_next()


func _sample() -> void:
	var rid := get_viewport().get_viewport_rid()
	_samples["draw"].append(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME))
	_samples["prims"].append(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME))
	_samples["objects"].append(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME))
	_samples["cpu"].append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
	_samples["gpu"].append(RenderingServer.viewport_get_measured_render_time_gpu(rid))
	_samples["script"].append(_script_usec / 1000.0)
	_samples["active"].append(world.dungeon.lights_near(world.camera.global_position))
	_samples["shadows"].append(world.dungeon.shadow_light_count())


func _mean(key: String) -> float:
	var a: Array = _samples.get(key, [])
	if a.is_empty():
		return 0.0
	var sum := 0.0
	for v in a:
		sum += float(v)
	return sum / a.size()


## The window in points (what the game lays out), in pixels (what the screen shows: twice as many each way on a
## Retina display), and the 3D scene's own size after the preset's scaling (what the GPU shades).
func _size_text() -> String:
	var win := get_window()
	var vp := get_viewport()
	var px := Vector2(win.size)
	var scene := px * vp.scaling_3d_scale
	return "window %s points, %s pixels, 3D %s pixels (%.2f Mpix, scale %.2f)" % [str(vp.get_visible_rect().size), str(px), str(scene.round()), scene.x * scene.y / 1.0e6, vp.scaling_3d_scale]


func _report() -> void:
	var name := Quality.label_of(str(_presets[_stage]))
	var line := "%s: %s (%d frames)" % [name, HudLayer.perf_text(_times, false), _times.size()]
	var counters := "  %s render: %d draw calls · %d primitives · %d objects · lights %d, %d in reach, %d with shadows · render cpu %.1f ms, gpu %.1f ms · scripts %.2f ms · objects %+d, nodes %+d" % [
		name, roundi(_mean("draw")), roundi(_mean("prims")), roundi(_mean("objects")), world.dungeon.light_count(), roundi(_mean("active")), roundi(_mean("shadows")),
		_mean("cpu"), _mean("gpu"), _mean("script"),
		int(Performance.get_monitor(Performance.OBJECT_COUNT)) - _objects_at_start, int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)) - _nodes_at_start]
	var size := "  %s: %s" % [name, _size_text()]
	_say(line)
	_say(counters)
	_say(size)
	_results.append(line)
	_results.append(counters)
	_results.append(size)


func _finish() -> void:
	_say("done")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			var f := FileAccess.open(arg.substr(6), FileAccess.WRITE)
			if f != null:
				f.store_string("\n".join(_results) + "\n")
	get_tree().quit()
