class_name DemoLineup
extends Node3D
## `--demo=lineup`: the 3D bodies side by side on green at the game's camera angle, for pictures and for judging them
## (no server, no world). `--set=undead` (default: the crypt's undead, the rat and the beetle) or `--set=animals`,
## each with a KayKit figure for scale; `--zoom=0.9` the camera distance, `--screenshot=/abs/path.png` saves the
## picture after a moment and quits. `--sheets=a,b,c` shows any sheets of the atlas (a `skel:<species>` for a figure).

const SETS := {
	"undead": ["skel:skelett", "skel:draugkung", "skel:gravvaktare", "mob_gravrotta", "mob_draugbage", "skel:vandrardraug", "skel:sjodraug", "skel:gengangare"],
	"animals": ["animal_wolf", "animal_hen", "animal_cow", "animal_slime", "animal_bear", "animal_hedgehog", "animal_trollunge"],
}
const SPACING := 1.7
const FRAMES := 40

var _frames := 0
var _shot := ""
var _actors: Array[Actor] = []


func _ready() -> void:
	var names: Array = SETS["undead"]
	var zoom := 0.95
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--set="):
			names = SETS.get(a.substr(6), names)
		elif a.begins_with("--sheets="):
			names = a.substr(9).split(",")
		elif a.begins_with("--zoom="):
			zoom = float(a.substr(7))
		elif a.begins_with("--screenshot="):
			_shot = a.substr(13)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("#8fc46a")
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(0.75, 0.78, 0.85)
	env.environment.ambient_light_energy = 0.6
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_energy = 1.1
	add_child(sun)
	var n := names.size() + 1
	for i in range(names.size()):
		var a := Actor.new()
		var sheet := str(names[i])
		if sheet.begins_with("skel:"):
			var sp := sheet.substr(5)
			a.set_figure(SkeletonFigure.build(sp), sheet, SkeletonFigure.height_of(sp), SkeletonFigure.rig(sp))
			a.set_label(sp)
		else:
			a.set_sheet(sheet)
			a.set_voxel(VoxelBody.frames(sheet), sheet)
			a.set_label(sheet.get_slice("_", 1))
		add_child(a)
		a.position = Vector3((i - n / 2.0 + 0.5) * SPACING, 0.0, 0.0)
		_actors.append(a)
	var fig := Actor.new()
	add_child(fig)
	fig.set_figure(Figure3D.build(LookComposer.new().colours_for({})), "lineup", 1.5)
	fig.position = Vector3((n / 2.0 - 0.5) * SPACING, 0.0, 0.0)
	_actors.append(fig)
	var cam := Camera3D.new()
	cam.fov = 40.0
	add_child(cam)
	cam.position = Vector3(0.0, 9.2 * zoom, 8.0 * zoom)
	cam.look_at(Vector3(0.0, 0.5, -0.5))
	cam.make_current()


func _process(delta: float) -> void:
	for a in _actors:
		a.animate("down", false, delta)
	_frames += 1
	if _shot != "" and _frames == FRAMES:
		var img := get_viewport().get_texture().get_image()
		if img != null:
			img.save_png(_shot)
			print("screenshot saved to %s" % _shot)
		(get_tree().current_scene as Main).quit_clean()
