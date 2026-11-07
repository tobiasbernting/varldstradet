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
	var props: Array = []
	var zoom := 0.95
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--set="):
			names = SETS.get(a.substr(6), names)
		elif a.begins_with("--props="):
			# object kinds of the wild maps, drawn as the farm view draws them (SPECS, wild_meshes.gd), in rows by footprint
			props = a.substr(8).split(",")
			names = []
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
	if not props.is_empty():
		_props(props, zoom)
		return
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


## `--props=a,b,c`: the object kinds standing side by side in rows (a kind's footprint decides its room), lit like day, with the
## camera pulled back to hold them all. `--zoom` scales the camera distance.
func _props(kinds: Array, zoom: float) -> void:
	var assets := FarmAssets.new()
	var row_w := 15.0
	var x := 0.0
	var z := 0.0
	var row_d := 1.0
	var max_x := 0.0
	var cells: Array = []
	for k in kinds:
		var kind := str(k)
		var def := Data.object_def(kind)
		var w := float(def.get("w", 1))
		var h := float(def.get("h", 1))
		if x > 0.0 and x + w > row_w:
			x = 0.0
			z += row_d + 0.9
			row_d = 1.0
		cells.append([kind, x + w * 0.5, z + h * 0.5, w, h])
		x += w + 0.7
		row_d = maxf(row_d, h)
		max_x = maxf(max_x, x - 0.7)
	var depth := z + row_d
	for c in cells:
		var spec := assets.spec(c[0])
		var list: Array = spec.get("m", [])
		if list.is_empty():
			continue
		for v in range(maxi(1, int(spec.get("show", 1)))):
			var m := assets.mesh(str(list[0]))
			if m == null:
				continue
			var mi := MeshInstance3D.new()
			mi.mesh = m
			mi.material_override = assets.prop_mat
			add_child(mi)
			mi.position = Vector3(float(c[1]) - max_x * 0.5, float(spec.get("lift", 0.0)), float(c[2]) - depth * 0.5)
			var lab := Label3D.new()
			lab.text = c[0]
			lab.font_size = 28
			lab.pixel_size = 0.012
			lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			lab.no_depth_test = true
			lab.modulate = Color.WHITE
			lab.outline_size = 8
			add_child(lab)
			lab.position = Vector3(float(c[1]) - max_x * 0.5, 0.05, float(c[2]) + float(c[4]) * 0.5 - depth * 0.5 + 0.35)
	var span := maxf(max_x * 0.5, depth * 1.0) * 0.8 + 2.0
	var cam := Camera3D.new()
	cam.fov = 40.0
	add_child(cam)
	cam.position = Vector3(0.0, span * 1.05 * zoom, span * 0.9 * zoom + 1.5)
	cam.look_at(Vector3(0.0, 0.5, 0.0))
	cam.make_current()
	set_meta("assets", assets)


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
