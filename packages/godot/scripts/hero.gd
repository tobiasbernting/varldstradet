class_name Hero
extends Node2D
## Your own hero as a placeholder drawing (no art yet). Moves with the Input Map's move actions at the server's
## speed and tells the server (`move`, at most 20 a second like the browser client), so everyone else sees it.

const SPEED := 64.0 ## px per second: PLAYER_SPEED in shared/src/types.ts
const SEND_EVERY := 0.05

var moving := false
var facing := "down"
var display_name := ""
var _send_in := 0.0


func reset() -> void:
	moving = false
	facing = "down"
	display_name = ""
	position = Vector2.ZERO
	queue_redraw()


## The server's word on where you are (welcome, a state snapshot while you stand still, a warp).
func place(at: Vector2, who: String) -> void:
	position = at
	if who != "":
		display_name = who
	queue_redraw()


func _physics_process(delta: float) -> void:
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var was_moving := moving
	moving = dir != Vector2.ZERO
	if moving:
		position += dir * SPEED * delta
		if absf(dir.x) > absf(dir.y):
			facing = "right" if dir.x > 0.0 else "left"
		else:
			facing = "down" if dir.y > 0.0 else "up"
		queue_redraw()
	_send_in -= delta
	if (moving and _send_in <= 0.0) or (was_moving and not moving):
		_send_in = SEND_EVERY
		Net.send({"t": "move", "x": position.x, "y": position.y, "facing": facing, "moving": moving})


func _draw() -> void:
	# a little figure: body, head, and an eye on the side it faces
	draw_rect(Rect2(-5.0, -12.0, 10.0, 12.0), Color(0.36, 0.55, 0.85))
	draw_circle(Vector2(0.0, -16.0), 5.0, Color(0.95, 0.79, 0.65))
	var eyes := {"down": Vector2(0, -14), "up": Vector2(0, -19), "left": Vector2(-4, -16), "right": Vector2(4, -16)}
	var eye: Vector2 = eyes[facing]
	draw_circle(eye, 1.2, Color(0.1, 0.1, 0.1))
	if display_name != "":
		draw_string(ThemeDB.fallback_font, Vector2(-40.0, -24.0), display_name, HORIZONTAL_ALIGNMENT_CENTER, 80.0, 8)
