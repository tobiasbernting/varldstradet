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
var grade: ScreenGrade ## the full-screen grade (world.gd sets it): saturation, vignette, night tint, lightning flash
var indoors := 0.0 ## 0..1, how far the hero is inside the farmhouse (world.gd sets it): no night tint there
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
var _rain_size := Vector3.ZERO ## the streak's size last written to the rain's mesh
var _flakes: GPUParticles3D
var _leaves: GPUParticles3D
var _flakes2: GPUParticles3D ## the big soft flakes (the small sharp ones are `_flakes`)
var _rings: GPUParticles3D ## splash rings on the ground in rain
var _dew: GPUParticles3D ## sparkles on the morning grass
var _puddle := 0.0 ## puddles fill in rain and linger ~40 s after it
var _cloudy := 0.0
var _slant := 0.2 ## how far the rain leans (the wind's)
var _rainbow: MeshInstance3D
var _bolt := 0.0
var _flash := 0.0 ## the whole-screen flash of a bolt, 1 -> 0 in a quarter of a second
var _flash_again := -1.0 ## seconds until the second, smaller flash (the browser's double flash)
var _gtint := Color.WHITE
var _dusk := 0.0
var _bolt_in := 4.0
var _t := 0.0
var _season := "none"
var _year := "summer"
var _under := false ## no sky here (a cave): the light stays what the map says
var _since := 0.0
var _lit := Color.WHITE ## the clock's light colour (the horizon of the sky the water mirrors)
var _sun_share := 1.0
var _f_now := 0.0
var _wind := -1.0 ## the weather's wind, eased so a gust front does not snap the trees
var _year_override := "" ## --year=summer|autumn|...: a fixed season of the year for pictures and the bench
var _rainbow_until := 0.0
var _rainbow_k := 0.0
var _rng := RandomNumberGenerator.new()
var sky_color := Color("#9ec8e8")


func _init() -> void:
	_rng.randomize()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--year="):
			_year_override = arg.substr(7)


func setup(v: FarmView, biome: String, key: String) -> void:
	view = v
	_biome = biome
	_key = key
	_clear_children()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_white = 4.0
	env.fog_enabled = true
	env.fog_density = 0.006
	env.fog_sky_affect = 1.0
	env.glow_intensity = 0.15
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
	_make_dew()
	_make_rainbow()


## The weather's particles made again after the player switched the weather on or off in the settings (nothing else is touched).
func rebuild_particles() -> void:
	for p in [_rain, _flakes, _flakes2, _leaves, _rings]:
		if p != null:
			p.queue_free()
	_rain = null
	_rain_size = Vector3.ZERO
	_flakes = null
	_flakes2 = null
	_leaves = null
	_rings = null
	_make_particles()


func _clear_children() -> void:
	for c in get_children():
		c.queue_free()
	_rain = null
	_rain_size = Vector3.ZERO
	_flakes = null
	_leaves = null
	_rainbow = null
	_flakes2 = null
	_rings = null
	_dew = null


## The hero went somewhere this sky does not cover (a dungeon): every particle system stops, the rainbow hides. `update_sky`
## starts them again where the weather wants them.
func suspend() -> void:
	for p in [_rain, _flakes, _flakes2, _leaves, _rings, _dew]:
		if p != null:
			p.emitting = false
	_rainbow_until = 0.0
	_rainbow_k = 0.0
	if _rainbow != null:
		_rainbow.visible = false


func follow(target: Node3D) -> void:
	_target = target


func _apply_quality() -> void:
	if sun == null:
		return
	var s := Quality.spec()
	var mode := int(s.get("sun_shadow", 0))
	sun.shadow_enabled = mode > 0
	sun.directional_shadow_max_distance = 26.0 if mode == 1 else 38.0
	# soft edges: the browser's sun shadows are a quarter-strength smudge, not a cut-out
	sun.light_angular_distance = 2.0 if mode <= 1 else 2.5
	sun.shadow_blur = 1.5 if mode <= 1 else 2.2
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL if mode <= 1 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	if mode > 0:
		RenderingServer.directional_shadow_atlas_set_size(1024 if mode == 1 else 2048, false)


func _make_particles() -> void:
	var n := int(Quality.value("sky_weather"))
	if n <= 0:
		return
	_rain = _particles(n * 2, 1.1, Vector3(0.0, -18.0, 0.0), Color(0.75, 0.85, 1.0, 0.5), Vector3(0.014, 0.6, 0.014))
	(_rain.process_material as ParticleProcessMaterial).particle_flag_align_y = true
	_flakes = _particles(int(n * 0.6), 6.0, Vector3(0.0, -1.4, 0.0), Color(1, 1, 1, 1.0), Vector3(0.08, 0.08, 0.08), 0.9)
	_flakes2 = _particles(int(n * 0.25), 7.0, Vector3(0.0, -1.0, 0.0), Color(1, 1, 1, 0.5), Vector3(0.14, 0.14, 0.14), 0.9)
	var qm := QuadMesh.new()
	qm.size = Vector2(0.14, 0.14)
	var smat := ShaderMaterial.new()
	smat.shader = _soft_shader()
	smat.set_shader_parameter("colour", Vector3(1.0, 1.0, 1.0))
	smat.set_shader_parameter("alpha", 0.9)
	qm.material = smat
	_flakes2.draw_pass_1 = qm
	_leaves = _particles(maxi(8, n / 24), 5.0, Vector3(-3.0, -0.4, 0.6), Color(0.85, 0.6, 0.2, 0.9), Vector3(0.1, 0.02, 0.1), 0.6)
	_rings = _make_rings(maxi(12, n / 5))
	for p in [_rain, _flakes, _flakes2, _leaves, _rings]:
		p.emitting = false
		add_child(p)


## A soft round patch: alpha falls off from the middle (a flake, a fog bank), blended, not added.
func _soft_shader() -> Shader:
	var sh := Shader.new()
	sh.code = "shader_type spatial;\nrender_mode unshaded, depth_draw_never, cull_disabled, fog_disabled;\nuniform vec3 colour = vec3(1.0);\nuniform float alpha = 0.3;\nuniform float seed = 0.0;\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }\nvoid fragment() {\n\tvec2 p = UV * 2.0 - 1.0;\n\tfloat k = clamp(1.0 - length(p), 0.0, 1.0);\n\tk = k * k * (3.0 - 2.0 * k);\n\tk *= 0.65 + 0.35 * vnoise(p * 2.5 + vec2(seed, seed * 1.7));\n\tALBEDO = colour;\n\tALPHA = alpha * k;\n}\n"
	return sh


## Splash rings: small flat rings on the ground round the hero that grow from 10 to 35 cm and fade in a third of a second.
func _make_rings(amount: int) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = 0.35
	p.explosiveness = 0.0
	p.visibility_aabb = AABB(Vector3(-20, -2, -20), Vector3(40, 4, 40))
	p.local_coords = false
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(10.0, 0.0, 8.0)
	pm.gravity = Vector3.ZERO
	pm.initial_velocity_min = 0.0
	pm.initial_velocity_max = 0.0
	pm.scale_min = 0.3
	pm.scale_max = 0.4
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 0.3))
	curve.add_point(Vector2(1.0, 1.0))
	var ct := CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 0.9))
	grad.set_color(1, Color(1, 1, 1, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	p.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(0.8, 0.8)
	q.orientation = PlaneMesh.FACE_Y
	var sh := Shader.new()
	sh.code = "shader_type spatial;\nrender_mode unshaded, depth_draw_never, cull_disabled, fog_disabled;\nvoid fragment() {\n\tfloat d = length(UV * 2.0 - 1.0);\n\tfloat ring = smoothstep(0.62, 0.8, d) * (1.0 - smoothstep(0.86, 1.0, d));\n\tALBEDO = vec3(0.85, 0.92, 1.0);\n\tALPHA = ring * COLOR.a * 0.55;\n}\n"
	var m := ShaderMaterial.new()
	m.shader = sh
	q.material = m
	p.draw_pass_1 = q
	return p


## Fog banks and dawn mist: a handful of big soft patches lying over the ground that drift slowly and wrap round the hero.
## The cozy extras that are not weather: fireflies and the morning's dew sparkle.
func _make_dew() -> void:
	_dew = GPUParticles3D.new()
	_dew.amount = 60
	_dew.lifetime = 1.1
	_dew.preprocess = 3.0
	_dew.local_coords = false
	_dew.visibility_aabb = AABB(Vector3(-14, -1, -12), Vector3(28, 3, 24))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(9.0, 0.0, 7.0)
	pm.gravity = Vector3.ZERO
	pm.initial_velocity_min = 0.0
	pm.initial_velocity_max = 0.0
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 0.0))
	grad.add_point(0.5, Color(1, 1, 1, 1.0))
	grad.set_color(grad.get_point_count() - 1, Color(1, 1, 1, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	_dew.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(0.09, 0.09)
	var sh := Shader.new()
	sh.code = "shader_type spatial;\nrender_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;\nvoid vertex() {\n\tMODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);\n}\nvoid fragment() {\n\tfloat k = clamp(1.0 - length(UV * 2.0 - 1.0), 0.0, 1.0);\n\tALBEDO = vec3(1.0, 0.98, 0.9) * k * COLOR.a * 2.0;\n}\n"
	var m := ShaderMaterial.new()
	m.shader = sh
	q.material = m
	_dew.draw_pass_1 = q
	_dew.emitting = false
	add_child(_dew)


## The dew each frame: it sparkles in the morning sun.
func _update_dew(f: float, kind: String, up: bool, at: Vector3) -> void:
	if _dew != null:
		var morning := up and f < 0.17 and (kind == "sun" or kind == "wind") and indoors < 0.5 and not _under
		_dew.emitting = morning
		_dew.amount_ratio = clampf(1.0 - f / 0.17, 0.1, 1.0) if morning else 0.1
		_dew.global_position = Vector3(at.x, 0.08, at.z)


func _particles(amount: int, life: float, vel: Vector3, col: Color, size: Vector3, spread := 0.08) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.visibility_aabb = AABB(Vector3(-20, -12, -20), Vector3(40, 24, 40))
	p.local_coords = false
	p.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
	p.preprocess = minf(4.0, life * 3.0) # the sky is already full when a picture is taken or the weather turns
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
	s.code = "shader_type spatial;\nrender_mode unshaded, blend_add, depth_draw_never, cull_disabled, depth_test_disabled, fog_disabled;\nuniform float amount = 0.0;\nvoid fragment() {\n\tvec2 p = (UV - vec2(0.5, 1.0)) * vec2(2.0, 2.0);\n\tfloat d = length(p);\n\tfloat band = (d - 0.72) / 0.26;\n\tif (band < 0.0 || band > 1.0 || UV.y < 0.0) discard;\n\tvec3 c = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + (1.0 - band) * 0.75));\n\tALBEDO = c * amount * 0.5 * sin(band * 3.1416);\n}\n"
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
	_f_now = f
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
	_lit = lit
	_sun_share = sun_share
	# The browser multiplies the whole picture by `amb`; in 3D that is the ambient light, the sun and the fog all
	# carrying the tint, with enough ambient that a sun shadow is a quarter darker than lit ground, not black.
	var tw := _dark * _dark
	# at dusk the green of the grass is pulled back, so the light reads mauve and not just dim
	var dusk := smoothstep(0.69, 0.76, f) * (1.0 - smoothstep(0.8, 0.86, f)) * (1.0 - float(_wvis["rain"]) * 0.5)
	_dusk = dusk
	# the ambient is a touch cooler than the sun, so a shadow is slightly blue
	var cool := 1.0 - _dark
	var amb_l := _ambient * Color(1.0 - 0.12 * dusk - 0.22 * cool, 1.0 - 0.02 * dusk - 0.04 * cool, 1.0 + 0.2 * dusk)
	env.ambient_light_color = amb_l.lerp(Color(0.22, 0.32, 0.95), tw * 0.9)
	env.ambient_light_energy = (lerpf(0.2, 0.28, _dark) + 0.03 * dusk) * lerpf(1.0, 2.2, clampf(1.0 - sun_share, 0.0, 1.0) * (1.0 - _dark))
	# the sun climbs in the east, stands south at noon and sets in the west; at night a pale moon takes its place
	if up:
		var low := clampf(1.0 - elevation * 2.2, 0.0, 1.0)
		var warm := Color(1.0, 0.94, 0.8).lerp(Color(1.0, 0.72, 0.46), low)
		sun.light_color = warm * Color(lit.r * 0.5 + 0.5, lit.g * 0.5 + 0.5, lit.b * 0.5 + 0.5).lerp(lit, low)
		sun.light_energy = 0.05 + 0.34 * sun_share * smoothstep(0.0, 0.25, elevation) + 0.18 * sun_share * low * (1.0 - _dark)
	else:
		sun.light_color = Color(0.5, 0.6, 0.95)
		sun.light_energy = 0.18 * (1.0 - _wet * 0.5)
	var el := deg_to_rad(lerpf(9.0, 62.0, elevation)) if up else deg_to_rad(48.0)
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
	env.fog_density = 0.03 * fog_k + 0.004 * _wvis["rain"]
	env.volumetric_fog_enabled = Quality.spec().get("fog", false) and fog_k > 0.1
	if env.volumetric_fog_enabled:
		env.volumetric_fog_density = 0.02 * fog_k
		env.volumetric_fog_albedo = sky_color
	# lightning
	_bolt = maxf(0.0, _bolt - delta * 3.0)
	_flash = maxf(0.0, _flash - delta * 4.0)
	if _flash_again >= 0.0:
		_flash_again -= delta
		if _flash_again < 0.0:
			_flash = 0.55
			_bolt = maxf(_bolt, 0.6)
	if kind == "storm":
		_bolt_in -= delta
		if _bolt_in <= 0.0:
			_bolt = 1.0
			_flash = 1.0
			_flash_again = 0.12 + _rng.randf() * 0.1
			_bolt_in = _rng.randf_range(4.0, 11.0)
	if Settings.reduce_motion:
		_bolt = Settings.calm(_bolt) # (M8b: a storm without the flashes: no light spike, no white screen)
		_flash = Settings.calm(_flash)
		_flash_again = -1.0
	if _bolt > 0.0:
		sun.light_energy += _bolt * 2.5
		env.ambient_light_energy += _bolt * 1.2
	_update_weather(delta, kind, w)
	_update_grade(delta, w)
	_update_materials(delta, kind, w, elevation, sun_share)
	view.set_dark(_dark)
	var cam := get_viewport().get_camera_3d()
	if view.ambient != null:
		view.ambient.update(delta, {"dark": _dark, "year": _year, "kind": kind, "wind": _wind, "f": f, "sky": sky_color, "fog": _wvis["fog"], "seasons": _biome_has_seasons()},
			_target.global_position if _target != null else Vector3.ZERO)
	if _target != null:
		var at := _target.global_position
		for p in [_rain, _flakes, _flakes2, _leaves]:
			if p != null:
				p.global_position = at + Vector3(0.0, 11.0, -1.0)
		if _rings != null:
			_rings.global_position = Vector3(at.x, 0.06, at.z)
			_update_dew(f, kind, up, at)
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


## The full-screen grade and the glow from the light of the moment: less colour in fog and rain and at night, a cooler cast
## under rain clouds, a vignette that closes in with the dark, and (never indoors) the blue of night and the flash.
func _update_grade(delta: float, w: Array) -> void:
	var fog := float(_wvis["fog"])
	var rain := float(_wvis["rain"])
	var open := 1.0 - indoors
	env.glow_hdr_threshold = lerpf(1.0, 0.7, _dark)
	env.glow_intensity = 0.2 + 0.5 * _dark
	env.glow_bloom = 0.04 + 0.1 * _dark
	if grade == null:
		return
	var cast: Color = w[1]
	var peak := maxf(cast.r, maxf(cast.g, cast.b))
	var want := Color.WHITE.lerp(Color(cast.r / peak, cast.g / peak, cast.b / peak), 0.7 * open)
	_gtint = _gtint.lerp(want, 1.0 - pow(0.12, delta))
	# rich, not pastel: a little more colour than the render by day, never less than 0.9 even in fog
	var sat := lerpf(1.08, 1.0, _dark)
	sat = lerpf(sat, 0.95, rain)
	sat = lerpf(sat, 0.9, fog)
	var contrast := lerpf(1.06, 1.0, _dark) * (1.0 - 0.06 * fog)
	grade.set_look(sat, smoothstep(0.35, 0.85, _dark) * open, 0.18 + 0.14 * _dark, _gtint, _flash * open, contrast, 1.0, _dusk * open)


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
	if _year_override != "":
		return _year_override
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


func _update_weather(delta: float, kind: String, w: Array) -> void:
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
	# puddles fill in a few seconds of rain and dry out over ~40 s
	_puddle = move_toward(_puddle, want_rain, delta / (7.0 if wet else 40.0))
	_cloudy = lerpf(_cloudy, 1.0 if kind == "cloudy" else 0.0, k)
	var wind := float(w[2])
	_slant = lerpf(_slant, 0.12 + 0.2 * wind + (0.15 if kind == "storm" else 0.0), k)
	if _rain != null:
		var storm := kind == "storm"
		_emit(_rain, _wvis["rain"] > 0.05)
		# the system holds twice the budget: rain and hail use half of it, a storm all (twice the streaks)
		_rain.amount_ratio = clampf(_wvis["rain"] * (1.0 if storm else 0.5), 0.025, 1.0)
		var rpm := _rain.process_material as ParticleProcessMaterial
		var hail := kind == "hail"
		rpm.direction = Vector3(-_slant, -1.0, 0.0).normalized()
		rpm.initial_velocity_min = 20.0 if hail else 16.0
		rpm.initial_velocity_max = 24.0 if hail else 20.0
		var rain_size := Vector3(0.05, 0.08, 0.05) if hail else Vector3(0.02, 1.2 if storm else 0.6, 0.02)
		if rain_size != _rain_size: # a mesh rebuild: only when the streak changes
			_rain_size = rain_size
			(_rain.draw_pass_1 as BoxMesh).size = rain_size
		(_rain.draw_pass_1.material as StandardMaterial3D).albedo_color = Color(0.9, 0.95, 1.0, 0.95) if hail else Color(0.75, 0.85, 1.0, 0.5)
		_emit(_rings, _wvis["rain"] > 0.1 and not hail)
		_rings.amount_ratio = clampf(_wvis["rain"] * (1.0 if storm else 0.6), 0.05, 1.0)
		var snow_on: bool = _wvis["snow"] > 0.05 or (_season == "jul" and _is_farm())
		var snow_k: float = clampf(maxf(_wvis["snow"], 0.35 if _season == "jul" else 0.0), 0.05, 1.0)
		_emit(_flakes, snow_on)
		_flakes.amount_ratio = snow_k
		_emit(_flakes2, snow_on)
		_flakes2.amount_ratio = snow_k
		# flakes drift sideways in the wind
		for fp in [_flakes, _flakes2]:
			(fp.process_material as ParticleProcessMaterial).direction = Vector3(-0.25 * wind - 0.05, -1.0, 0.1).normalized()
		# leaves blown across the map in wind weather (the autumn leaves in the trees are ambient_view.gd's)
		_emit(_leaves, kind == "wind")
		(_leaves.draw_pass_1.material as StandardMaterial3D).albedo_color = Color(0.85, 0.62, 0.22, 0.9) if _year != "spring" else Color(0.95, 0.75, 0.85, 0.9)


## Start or stop a particle system; a start restarts it so its preprocess fills the sky at once.
func _emit(p: GPUParticles3D, on: bool) -> void:
	if on and not p.emitting:
		p.emitting = true
		p.restart()
	elif not on and p.emitting:
		p.emitting = false


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
	_wind = float(w[2]) if _wind < 0.0 else lerpf(_wind, float(w[2]), 1.0 - pow(0.3, delta))
	a.prop_mat.set_shader_parameter("wind", _wind)
	a.prop_mat.set_shader_parameter("wind_level", Quality.alive("wind"))
	a.ground_mat.set_shader_parameter("snow", _snow)
	a.ground_mat.set_shader_parameter("wet", _wet)
	# cloud shadows: faint in sun, slow and big under cloudy skies; props darken with the ground
	var cloud := 0.0 if Quality.preset == "lag" else clampf(0.35 * sun_share + 0.6 * _cloudy, 0.0, 0.7) * clampf(elevation * 2.0, 0.0, 1.0) * (1.0 - _dark)
	a.ground_mat.set_shader_parameter("cloud", cloud)
	a.prop_mat.set_shader_parameter("cloud", cloud)
	a.ground_mat.set_shader_parameter("puddle", _puddle)
	a.ground_mat.set_shader_parameter("sky_colour", Vector3(sky_color.r, sky_color.g, sky_color.b))
	var glint := clampf(elevation * sun_share + 0.15, 0.0, 1.0)
	var water_level := Quality.alive("water")
	a.set_water_level(water_level)
	var wave := 0.45 + 0.6 * _wind
	# what the water mirrors: the clock's colour at the horizon, deep blue overhead (navy at night), grey under cloud
	var zenith := Color(0.30, 0.52, 0.95).lerp(Color(0.05, 0.07, 0.2), _dark)
	var horizon := _lit.lerp(Color(0.07, 0.09, 0.24), _dark * 0.8)
	var mirror := horizon.lerp(zenith, 0.5).lerp(Color(0.62, 0.66, 0.72) * (1.0 - _dark * 0.7), clampf(1.0 - _sun_share, 0.0, 1.0) * 0.7) * 0.82
	for m in [a.water_mat, a.bog_mat, a.choco_mat]:
		m.set_shader_parameter("glint", glint)
		m.set_shader_parameter("frozen", _snow * 0.55 if m == a.water_mat else 0.0)
		if water_level > 0:
			m.set_shader_parameter("wave", wave)
			m.set_shader_parameter("sky_colour", mirror)


func _biome_has_seasons() -> bool:
	return not (_biome in ["svamp", "djungel", "vulkan", "dino", "oken", "rymdbas", "godis"])


## For tests and screenshots: how white the map is now.
func snow_cover() -> float:
	return _snow


## What the soundscape needs of the sky (M7b): how dark it is, the weather here, its wind, the season of the year and the
## day's fraction.
func sound_state() -> Dictionary:
	return {"dark": _dark, "kind": _weather, "wind": maxf(0.0, _wind), "year": _year, "f": _f_now, "seasons": _biome_has_seasons(), "snow": _snow}


func weather_now() -> String:
	return _weather


func dark_now() -> float:
	return _dark
