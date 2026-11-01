class_name DayNight
extends Node3D
## The look of the day on an outdoor map: the sun (a DirectionalLight3D) and the environment's ambient light, fog and
## background from the clock (a port of the browser's sky.ts `skyLight`), the season's leaf colours and the snow
## cover on the shaders of farm_assets.gd's materials, and the weather: rain, snow, hail, wind and fog as particles
## that follow the hero, a flash of lightning in storms, and a rainbow after rain. The camera looks down at 51°, so
## the sky itself is never on screen: the background is the horizon colour and what carries the mood is the light.
## Particle counts and shadows come from the quality preset (quality.gd), so Låg stays a plain render.

const DAY: Array = [
	[0.0, Color(1.0, 0.84, 0.68)], [0.1, Color(1.0, 0.95, 0.88)], [0.25, Color(1.0, 1.0, 0.98)], [0.5, Color(1.0, 0.98, 0.93)],
	[0.62, Color(1.0, 0.86, 0.66)], [0.7, Color(0.94, 0.6, 0.5)], [0.76, Color(0.48, 0.36, 0.56)], [0.82, Color(0.23, 0.25, 0.43)],
	[0.9, Color(0.21, 0.24, 0.43)], [0.955, Color(0.23, 0.25, 0.43)], [0.985, Color(0.62, 0.46, 0.55)], [1.0, Color(1.0, 0.84, 0.68)],
]
## weather -> [sun share, tint (r, g, b), wind]
const WEATHER := {
	"sun": [1.0, Color(1, 1, 1), 0.35], "cloudy": [0.35, Color(0.86, 0.88, 0.92), 0.55], "rain": [0.0, Color(0.72, 0.77, 0.86), 0.7],
	"storm": [0.0, Color(0.52, 0.56, 0.68), 1.5], "snow": [0.2, Color(0.93, 0.96, 1.0), 0.45], "hail": [0.0, Color(0.7, 0.75, 0.82), 0.9],
	"wind": [0.85, Color(1.0, 0.97, 0.93), 1.7], "fog": [0.15, Color(0.88, 0.9, 0.93), 0.15],
}
const SPRING := Color("#8cc85a")
const SUMMER := Color("#64a848")
const AUTUMN := [Color("#d8841f"), Color("#b8501c"), Color("#d8b02a")]
const BROWN := Color("#8a6a3a")

var view: FarmView
var sun: DirectionalLight3D
var env: Environment
var world_env: WorldEnvironment
var _biome := ""
var _key := ""
var _weather := "sun"
var _weather_now := "sun"
var _wvis := {"rain": 0.0, "snow": 0.0, "fog": 0.0}
var _prev := ""
var _snow := 0.0
var _wet := 0.0
var _dark := 0.0
var _ambient := Color.WHITE
var _target: Node3D ## what the particles and the rainbow follow
var _rain: GPUParticles3D
var _flakes: GPUParticles3D
var _leaves: GPUParticles3D
var _rainbow: MeshInstance3D
var _bolt := 0.0
var _bolt_in := 4.0
var _t := 0.0
var _season := "none"
var _year := "summer"
var _under := false ## no sky here (a cave): the light stays what the map says
var _since := 0.0
var _rainbow_until := 0.0
var _rainbow_k := 0.0
var _rng := RandomNumberGenerator.new()
var sky_color := Color("#9ec8e8")


func _init() -> void:
	_rng.randomize()


func setup(v: FarmView, biome: String, key: String) -> void:
	view = v
	_biome = biome
	_key = key
	_clear_children()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_density = 0.006
	env.fog_sky_affect = 1.0
	env.glow_intensity = 0.4
	env.glow_bloom = 0.04
	env.ssao_radius = 0.6
	env.ssao_intensity = 1.2
	env.ssao_light_affect = 0.0
	env.volumetric_fog_density = 0.0
	Quality.apply_environment(env)
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_energy = 1.0
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	add_child(sun)
	_apply_quality()
	_make_particles()
	_make_rainbow()


func _clear_children() -> void:
	for c in get_children():
		c.queue_free()
	_rain = null
	_flakes = null
	_leaves = null
	_rainbow = null


func follow(target: Node3D) -> void:
	_target = target


func _apply_quality() -> void:
	if sun == null:
		return
	var s := Quality.spec()
	var mode := int(s.get("sun_shadow", 0))
	sun.shadow_enabled = mode > 0
	sun.directional_shadow_max_distance = 26.0 if mode == 1 else 38.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL if mode <= 1 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	if mode > 0:
		RenderingServer.directional_shadow_atlas_set_size(1024 if mode == 1 else 2048, false)


func _make_particles() -> void:
	var n := int(Quality.spec().get("weather", 0))
	if n <= 0:
		return
	_rain = _particles(n, 1.1, Vector3(0.0, -18.0, 0.0), Color(0.75, 0.85, 1.0, 0.55), Vector3(0.02, 0.45, 0.02))
	_flakes = _particles(int(n * 0.8), 6.0, Vector3(0.0, -1.4, 0.0), Color(1, 1, 1, 0.9), Vector3(0.07, 0.07, 0.07), 0.9)
	_leaves = _particles(maxi(8, n / 24), 5.0, Vector3(-3.0, -0.4, 0.6), Color(0.85, 0.6, 0.2, 0.9), Vector3(0.1, 0.02, 0.1), 0.6)
	for p in [_rain, _flakes, _leaves]:
		p.emitting = false
		add_child(p)


func _particles(amount: int, life: float, vel: Vector3, col: Color, size: Vector3, spread := 0.08) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.visibility_aabb = AABB(Vector3(-20, -12, -20), Vector3(40, 24, 40))
	p.local_coords = false
	p.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(15.0, 0.5, 11.0)
	pm.direction = vel.normalized()
	pm.spread = spread * 90.0
	pm.initial_velocity_min = vel.length() * 0.9
	pm.initial_velocity_max = vel.length() * 1.1
	pm.gravity = Vector3.ZERO
	p.process_material = pm
	var mesh := BoxMesh.new()
	mesh.size = size
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = col
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh.material = mat
	p.draw_pass_1 = mesh
	return p


func _make_rainbow() -> void:
	_rainbow = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(30.0, 15.0)
	_rainbow.mesh = q
	var s := Shader.new()
	s.code = "shader_type spatial;\nrender_mode unshaded, blend_add, depth_draw_never, cull_disabled, depth_test_disabled;\nuniform float amount = 0.0;\nvoid fragment() {\n\tvec2 p = (UV - vec2(0.5, 1.0)) * vec2(2.0, 2.0);\n\tfloat d = length(p);\n\tfloat band = (d - 0.72) / 0.26;\n\tif (band < 0.0 || band > 1.0 || UV.y < 0.0) discard;\n\tvec3 c = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + (1.0 - band) * 0.75));\n\tALBEDO = c * amount * 0.5 * sin(band * 3.1416);\n}\n"
	var m := ShaderMaterial.new()
	m.shader = s
	_rainbow.material_override = m
	_rainbow.visible = false
	_rainbow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_rainbow)


## Called every frame by the world: the clock, the season and the weather as the server sent them.
func update_sky(delta: float, time_ms: float, season: String, weather: Variant, now_ms: float, under_roof := false) -> void:
	if env == null or view == null:
		return
	_t += delta
	_season = season
	var kind := "sun"
	var prev := ""
	var since := now_ms
	if weather is Dictionary:
		kind = str(weather.get("kind", "sun"))
		prev = str(weather.get("prev", ""))
		since = float(weather.get("since", now_ms))
	kind = _local_weather(kind)
	_weather = kind
	if kind == "sun" and (prev == "rain" or prev == "storm") and now_ms - since < 30000.0 and _rainbow_until < Time.get_ticks_msec() / 1000.0:
		_rainbow_until = Time.get_ticks_msec() / 1000.0 + 45.0
	_year = _year_season(season)
	var f := fposmod(time_ms / Data.constant("DAY_LENGTH_MS", 600000.0), 1.0)
	var w: Array = WEATHER.get(kind, WEATHER["sun"])
	var night := clampf((f - 0.74) / 0.08, 0.0, 1.0) * clampf((0.99 - f) / 0.04, 0.0, 1.0)
	var amb := _sample(f)
	if season == "halloween":
		amb = amb.lerp(Color(0.27, 0.18, 0.43), night * 0.85)
	elif season == "jul":
		amb = amb.lerp(Color(0.27, 0.32, 0.48), night * 0.8)
	var tint: Color = w[1]
	amb = amb.lerp(amb * tint, 1.0 - night * 0.7)
	var dark := clampf(1.0 - (amb.r * 0.3 + amb.g * 0.55 + amb.b * 0.15 - 0.2) / 0.6, 0.0, 1.0)
	var sun_t := (f + 0.02) / 0.74
	var up := sun_t > 0.0 and sun_t < 1.0
	var elevation := sin(PI * sun_t) if up else 0.0
	var az := PI * clampf(sun_t, 0.0, 1.0)
	var sun_share := float(w[0])
	_ambient = _ambient.lerp(amb, 1.0 - pow(0.05, delta))
	_dark = lerpf(_dark, dark, 1.0 - pow(0.05, delta))
	var lit := amb
	env.ambient_light_color = _ambient.lerp(Color(0.35, 0.4, 0.6), _dark * 0.4)
	env.ambient_light_energy = 0.38 + 0.2 * (1.0 - _dark)
	# the sun climbs in the east, stands south at noon and sets in the west; at night a pale moon takes its place
	sun.light_color = (Color(1.0, 0.92, 0.8).lerp(Color(1.0, 0.7, 0.45), clampf(1.0 - elevation * 2.2, 0.0, 1.0)) if up else Color(0.55, 0.62, 0.9))
	sun.light_energy = (0.15 + 0.8 * sun_share * smoothstep(0.0, 0.25, elevation)) if up else 0.22 * (1.0 - _wet * 0.5)
	var el := deg_to_rad(lerpf(14.0, 62.0, elevation)) if up else deg_to_rad(48.0)
	var az2 := (az - PI * 0.5) if up else 0.6
	sun.rotation = Vector3(-el, az2 + PI, 0.0)
	# the horizon colour is the background and the fog: it carries the time of day to the edge of the map
	sky_color = Color(0.62, 0.8, 0.94).lerp(lit, 0.55) * Color(lit.r * 0.55 + 0.45, lit.g * 0.55 + 0.45, lit.b * 0.55 + 0.45)
	sky_color = sky_color.lerp(Color(0.16, 0.18, 0.32), _dark * 0.85)
	var grey := Color(0.66, 0.7, 0.76) * (1.0 - _dark * 0.7)
	sky_color = sky_color.lerp(grey, clampf(1.0 - sun_share, 0.0, 1.0) * 0.6)
	env.background_color = sky_color
	env.fog_light_color = sky_color
	var fog_k := _wvis["fog"] as float
	env.fog_density = 0.002 + 0.045 * fog_k + 0.006 * _wvis["rain"]
	env.volumetric_fog_enabled = Quality.spec().get("fog", false) and fog_k > 0.1
	if env.volumetric_fog_enabled:
		env.volumetric_fog_density = 0.02 * fog_k
		env.volumetric_fog_albedo = sky_color
	# lightning
	_bolt = maxf(0.0, _bolt - delta * 3.0)
	if kind == "storm":
		_bolt_in -= delta
		if _bolt_in <= 0.0:
			_bolt = 1.0
			_bolt_in = _rng.randf_range(4.0, 11.0)
	if _bolt > 0.0:
		sun.light_energy += _bolt * 2.5
		env.ambient_light_energy += _bolt * 1.2
	_update_weather(delta, kind)
	_update_materials(delta, kind, w, elevation, sun_share)
	view.set_dark(_dark)
	var cam := get_viewport().get_camera_3d()
	if _target != null:
		var at := _target.global_position
		for p in [_rain, _flakes, _leaves]:
			if p != null:
				p.global_position = at + Vector3(0.0, 11.0, -1.0)
		if _rainbow != null:
			_rainbow.global_position = at + Vector3(0.0, 4.5, -15.0)
			_rainbow.rotation_degrees = Vector3(-8.0, 0.0, 0.0)
	var now_s := Time.get_ticks_msec() / 1000.0
	var want_rb := 0.0
	if kind == "sun" and _rainbow_until > now_s:
		want_rb = minf(1.0, minf((_rainbow_until - now_s) / 5.0, (45.0 - (_rainbow_until - now_s)) / 4.0))
	_rainbow_k = lerpf(_rainbow_k, want_rb, 1.0 - pow(0.1, delta))
	if _rainbow != null:
		_rainbow.visible = _rainbow_k > 0.01 and Quality.preset != "lag"
		(_rainbow.material_override as ShaderMaterial).set_shader_parameter("amount", _rainbow_k)
	if cam == null:
		return


func _local_weather(kind: String) -> String:
	var cold := kind == "snow" or kind == "hail"
	var b := _biome
	if b == "is" and (kind == "rain" or kind == "storm" or kind == "hail"):
		return "snow"
	if (b == "oken" or b == "rymdbas") and (kind == "rain" or kind == "storm" or cold or kind == "fog"):
		return "wind"
	if (b == "dino" or b == "vulkan") and cold:
		return "wind"
	if b == "djungel" and cold:
		return "rain"
	if b == "trask" and kind == "cloudy":
		return "fog"
	return kind


func _sample(f: float) -> Color:
	for i in range(1, DAY.size()):
		var f1: float = DAY[i][0]
		var f0: float = DAY[i - 1][0]
		if f <= f1:
			var t := smoothstep(0.0, 1.0, (f - f0) / (f1 - f0))
			return (DAY[i - 1][1] as Color).lerp(DAY[i][1], t)
	return DAY[DAY.size() - 1][1]


## The browser's yearSeason: Christmas is always winter, otherwise the calendar (December to February winter).
func _year_season(season: String) -> String:
	if season == "jul":
		return "winter"
	var m := int(Time.get_datetime_dict_from_system().get("month", 6))
	if m == 12 or m <= 2:
		return "winter"
	if m <= 5:
		return "spring"
	if m <= 8:
		return "summer"
	return "autumn"


func _update_weather(delta: float, kind: String) -> void:
	var k := 1.0 - pow(0.12, delta)
	var wet := kind == "rain" or kind == "storm" or kind == "hail"
	var snowy := kind == "snow"
	var want_rain := 1.0 if wet else 0.0
	var want_snow := 1.0 if snowy else 0.0
	var want_fog := 1.0 if kind == "fog" else 0.0
	_wvis["rain"] = lerpf(_wvis["rain"], want_rain, k)
	_wvis["snow"] = lerpf(_wvis["snow"], want_snow, k)
	_wvis["fog"] = lerpf(_wvis["fog"], want_fog, k)
	_wet = lerpf(_wet, want_rain * 0.8, 1.0 - pow(0.3, delta))
	if _rain != null:
		_rain.emitting = _wvis["rain"] > 0.05
		_rain.amount_ratio = clampf(_wvis["rain"] * (1.0 if kind != "storm" else 1.0), 0.05, 1.0)
		(_rain.draw_pass_1.material as StandardMaterial3D).albedo_color = Color(0.75, 0.85, 1.0, 0.55) if kind != "hail" else Color(0.9, 0.95, 1.0, 0.9)
		_flakes.emitting = _wvis["snow"] > 0.05 or (_season == "jul" and _is_farm())
		_flakes.amount_ratio = clampf(maxf(_wvis["snow"], 0.35 if _season == "jul" else 0.0), 0.05, 1.0)
		_leaves.emitting = kind == "wind"
		(_leaves.draw_pass_1.material as StandardMaterial3D).albedo_color = Color(0.85, 0.62, 0.22, 0.9) if _year != "spring" else Color(0.95, 0.75, 0.85, 0.9)


func _is_farm() -> bool:
	return _key == "farm"


func _update_materials(delta: float, kind: String, w: Array, elevation: float, sun_share: float) -> void:
	var a := view.assets
	if a == null or a.prop_mat == null:
		return
	# snow ground: Christmas, or snow that has been falling a while (the browser's wantSnowGround)
	var want_snow := 0.0
	if _season == "jul" and _biome_has_seasons():
		want_snow = 1.0
	elif kind == "snow" or _biome == "is":
		want_snow = 1.0 if kind == "snow" else (0.9 if _biome == "is" else 0.0)
	_snow = lerpf(_snow, want_snow, 1.0 - pow(0.6, delta))
	var leaf_a: Color = SUMMER
	var leaf_b: Color = SUMMER
	var leaf_c: Color = SUMMER
	var mix := 1.0
	match _year:
		"spring":
			leaf_a = SPRING
			leaf_b = SPRING.lightened(0.1)
			leaf_c = SPRING.darkened(0.08)
		"autumn":
			leaf_a = AUTUMN[0]
			leaf_b = AUTUMN[1]
			leaf_c = AUTUMN[2]
		"winter":
			leaf_a = SUMMER.darkened(0.25)
			leaf_b = SUMMER.darkened(0.3)
			leaf_c = BROWN
		_:
			leaf_a = SUMMER.lightened(0.0)
			leaf_b = SUMMER.darkened(0.08)
			leaf_c = SUMMER.lightened(0.1)
	if _biome == "svamp" or _biome == "djungel":
		mix = 0.0 # these woods keep their own colours
	a.prop_mat.set_shader_parameter("leaf_a", leaf_a)
	a.prop_mat.set_shader_parameter("leaf_b", leaf_b)
	a.prop_mat.set_shader_parameter("leaf_c", leaf_c)
	a.prop_mat.set_shader_parameter("leaf_mix", mix)
	a.prop_mat.set_shader_parameter("snow", _snow)
	a.prop_mat.set_shader_parameter("wet", _wet)
	a.prop_mat.set_shader_parameter("wind", float(w[2]))
	a.ground_mat.set_shader_parameter("snow", _snow)
	a.ground_mat.set_shader_parameter("wet", _wet)
	a.ground_mat.set_shader_parameter("cloud", 0.0 if Quality.preset == "lag" else sun_share * elevation)
	var glint := clampf(elevation * sun_share + 0.15, 0.0, 1.0)
	for m in [a.water_mat, a.bog_mat, a.choco_mat]:
		m.set_shader_parameter("glint", glint)
		m.set_shader_parameter("frozen", _snow * 0.55 if m == a.water_mat else 0.0)


func _biome_has_seasons() -> bool:
	return not (_biome in ["svamp", "djungel", "vulkan", "dino", "oken", "rymdbas", "godis"])


## For tests and screenshots: how white the map is now.
func snow_cover() -> float:
	return _snow


func weather_now() -> String:
	return _weather


func dark_now() -> float:
	return _dark
