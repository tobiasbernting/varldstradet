// The ground of a map: one chunk mesh per 16 x 16 tiles with a vertex colour per tile. UV.x says how much snow
// settles on it (grass and earth 1, paths 0.7, stone 0.35, water 0), UV.y how glowing it is (lava). `snow` is the
// whole map's snow cover 0..1, which comes in patches so the first flakes do not whiten everything at once.
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_back;

uniform float snow = 0.0;
uniform float wet = 0.0;
uniform float cloud = 0.0;
varying vec3 v_wp;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void vertex() {
	v_wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 col = COLOR.rgb;
	// a little grain so a field of one colour is not a flat sheet
	float grain = vnoise(v_wp.xz * 3.1) * 0.5 + vnoise(v_wp.xz * 9.0) * 0.5;
	col *= 0.93 + 0.14 * grain;
	float patch = vnoise(v_wp.xz * 0.35);
	float cover = clamp(snow * 1.6 - patch * 0.6, 0.0, 1.0) * UV.x;
	col = mix(col, vec3(0.9, 0.93, 0.98) * (0.97 + 0.05 * grain), smoothstep(0.1, 0.5, cover));
	col *= 1.0 - 0.28 * wet;
	// drifting cloud shadows on a bright day
	float cs = vnoise(v_wp.xz * 0.09 + vec2(TIME * 0.35, TIME * 0.12));
	col *= 1.0 - cloud * smoothstep(0.55, 0.8, cs) * 0.22;
	ALBEDO = col;
	ROUGHNESS = 1.0;
	EMISSION = col * UV.y * 1.6;
}
