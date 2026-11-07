// Fireflies (M7a): glowing points that drift and pulse, in a box round the hero. One MultiMesh of quads, every
// instance's path computed here from the clock, so the CPU only sends `center` once a frame. The instance's origin is
// where it starts (anywhere; the box wraps round the hero so they stay near him), custom data is (random, random).
shader_type spatial;
render_mode blend_add, unshaded, depth_draw_never, cull_disabled, fog_disabled;

uniform vec3 center = vec3(0.0);
uniform vec2 box = vec2(30.0, 24.0);
uniform float fade = 1.0;
uniform vec3 tint : source_color = vec3(1.0, 0.9, 0.3);
varying float v_k;

void vertex() {
	vec3 a = MODEL_MATRIX[3].xyz;
	float ph = INSTANCE_CUSTOM.x * 6.2831;
	vec2 rel = a.xz - center.xz;
	rel = mod(rel + box * 0.5, box) - box * 0.5;
	vec3 pos = vec3(center.x + rel.x, a.y, center.z + rel.y);
	pos.x += sin(TIME * 0.31 + ph) * 1.3 + sin(TIME * 0.83 + ph * 2.1) * 0.45;
	pos.z += cos(TIME * 0.27 + ph * 1.3) * 1.3 + cos(TIME * 0.71 + ph * 0.7) * 0.45;
	pos.y += sin(TIME * 0.5 + ph * 1.7) * 0.35;
	float pulse = 0.5 + 0.5 * sin(TIME * (1.6 + INSTANCE_CUSTOM.y * 1.8) + ph * 5.0);
	vec2 e = abs(rel) / (box * 0.5);
	v_k = smoothstep(0.1, 0.85, pulse) * fade * (1.0 - smoothstep(0.7, 1.0, max(e.x, e.y)));
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(pos + (right * VERTEX.x + up * VERTEX.y) * 0.38, 1.0);
}

void fragment() {
	float k = clamp(1.0 - length(UV - vec2(0.5)) * 2.0, 0.0, 1.0);
	ALBEDO = tint * (k * k * 0.7 + pow(k, 9.0) * 2.2) * v_k;
}
