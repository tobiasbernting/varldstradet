// Dawn mist (M7a): big, soft, patchy sheets lying low on the ground that drift slowly round the hero. Flat quads
// (the instance's scale is its size), no depth reads: only a faint alpha, so a trunk crossing one is not noticed.
shader_type spatial;
render_mode blend_mix, unshaded, depth_draw_never, cull_disabled, fog_disabled;

uniform vec3 center = vec3(0.0);
uniform vec2 box = vec2(30.0, 24.0);
uniform float fade = 1.0;
uniform float strength = 1.0; // 1 at dawn, more in fog weather
uniform vec3 colour : source_color = vec3(0.85, 0.88, 0.92);
varying float v_a;
varying float v_seed;

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
	vec3 a = MODEL_MATRIX[3].xyz;
	float ph = INSTANCE_CUSTOM.x * 6.2831;
	vec2 rel = a.xz - center.xz;
	rel = mod(rel + box * 0.5, box) - box * 0.5;
	vec3 pos = vec3(center.x + rel.x, 0.28 + 0.25 * INSTANCE_CUSTOM.y, center.z + rel.y);
	pos.x += sin(TIME * 0.05 + ph) * 1.6;
	pos.z += cos(TIME * 0.04 + ph * 1.7) * 1.6;
	vec2 e = abs(rel) / (box * 0.5);
	v_a = fade * (0.6 + 0.4 * sin(TIME * 0.15 + ph * 2.0)) * (1.0 - smoothstep(0.6, 1.0, max(e.x, e.y)));
	v_seed = INSTANCE_CUSTOM.x * 30.0;
	float size = 6.0 + 4.0 * INSTANCE_CUSTOM.y;
	VERTEX = vec3(VERTEX.x * size, 0.0, VERTEX.z * size) + pos;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(VERTEX, 1.0);
}

void fragment() {
	vec2 q = (UV - vec2(0.5)) * 2.0;
	float k = clamp(1.0 - length(q), 0.0, 1.0);
	float n = vnoise(UV * 4.0 + v_seed) * 0.6 + vnoise(UV * 9.0 - v_seed) * 0.4;
	ALBEDO = colour;
	ALPHA = k * k * (0.25 + 0.75 * n) * v_a * 0.32 * strength;
}
