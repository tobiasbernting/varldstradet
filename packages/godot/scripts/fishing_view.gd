class_name FishingView
extends Node3D
## My fishing line: a bobber on the water where I cast, a thin line to my rod, and when a fish bites the bobber dips,
## a ring spreads and a "!" shows over it (the server's bite is the `napp` emote on my snapshot and a splash). The
## server does not tell the client where it cast, so the view remembers the tile of my last `act`; it is shown while
## my snapshot carries the `fiske` or `napp` emote (the server drops both when the fish is caught or lost, or when
## I walk away). Nodes are made once.

var model: WorldModel
var hero: Hero
var cast_tile := Vector2i.ZERO
var biting := false
var _bobber: MeshInstance3D
var _line: MeshInstance3D
var _ring: MeshInstance3D
var _mark: Label3D
var _t := 0.0
var _bite_t := 0.0


func _init() -> void:
	var sphere := SphereMesh.new()
	sphere.radius = 0.1
	sphere.height = 0.2
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("e8473a")
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sphere.material = mat
	_bobber = MeshInstance3D.new()
	_bobber.mesh = sphere
	add_child(_bobber)
	var box := BoxMesh.new()
	box.size = Vector3(0.015, 0.015, 1.0)
	var lm := StandardMaterial3D.new()
	lm.albedo_color = Color(1, 1, 1, 0.85)
	lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	box.material = lm
	_line = MeshInstance3D.new()
	_line.mesh = box
	add_child(_line)
	var torus := TorusMesh.new()
	torus.inner_radius = 0.28
	torus.outer_radius = 0.32
	var rm := StandardMaterial3D.new()
	rm.albedo_color = Color(1, 1, 1, 0.8)
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	torus.material = rm
	_ring = MeshInstance3D.new()
	_ring.mesh = torus
	_ring.scale = Vector3(1, 0.05, 1)
	add_child(_ring)
	_mark = Label3D.new()
	_mark.text = "❗"
	_mark.font_size = 72
	_mark.pixel_size = 0.008
	_mark.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_mark.no_depth_test = true
	_mark.position = Vector3(0, 0.9, 0)
	add_child(_mark)
	visible = false


func tick(delta: float) -> void:
	var emote: Variant = model.player_snaps.get(model.me, {}).get("emote")
	var id := ""
	if emote is Dictionary and float(emote.get("until", 0)) > model.server_now():
		id = str(emote.get("id", ""))
	if id != "fiske" and id != "napp":
		visible = false
		biting = false
		_bite_t = 0.0
		return
	visible = true
	_t += delta
	var on_bite := id == "napp"
	if on_bite and not biting:
		_bite_t = 0.0
		Sfx.play("bite")
	biting = on_bite
	_bite_t += delta
	var spot := Vector3(cast_tile.x + 0.5, 0.0, cast_tile.y + 0.5)
	position = spot
	var bob := 0.03 * sin(_t * 2.5)
	if biting:
		bob = -0.09 + 0.05 * sin(_t * 26.0)
	_bobber.position = Vector3(0, -0.04 + bob + 0.05, 0)
	_mark.visible = biting
	_ring.visible = biting
	if biting:
		var r := 1.0 + fmod(_bite_t, 0.7) * 2.2
		_ring.scale = Vector3(r, 0.05, r)
		_ring.position = Vector3(0, 0.0, 0)
	# the line, from the rod tip (over the hero's hand) to the bobber
	var tile := Data.tile()
	var hand := Vector3(hero.px / tile, 0.7, hero.py / tile) - spot
	var tip := _bobber.position
	var mid := (hand + tip) * 0.5
	_line.position = mid
	var len := hand.distance_to(tip)
	_line.scale = Vector3(1, 1, maxf(0.01, len))
	if len > 0.01:
		_line.look_at(position + hand, Vector3.UP)
