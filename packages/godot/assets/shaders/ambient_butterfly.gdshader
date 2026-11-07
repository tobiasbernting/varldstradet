// Butterflies (M7a): two wings that beat, on a looping flight in a box round the hero. The instance colour is the
// wings' colour. Billboards (the camera never turns), a cut-out wing shape, no blending.
shader_type spatial;
render_mode unshaded, cull_disabled, fog_disabled;

uniform vec3 center = vec3(0.0);
uniform vec2 box = vec2(30.0, 24.0);
uniform float fade = 1.0;
uniform float shade = 1.0;
varying vec3 v_col;
varying float v_k;

void vertex() {
	vec3 a = MODEL_MATRIX[3].xyz;
	float ph = INSTANCE_CUSTOM.x * 6.2831;
	vec2 rel = a.xz - center.xz;
	rel = mod(rel + box * 0.5, box) - box * 0.5;
	vec3 pos = vec3(center.x + rel.x, a.y, center.z + rel.y);
	float sp = 0.18 + 0.12 * INSTANCE_CUSTOM.y;
	pos.x += sin(TIME * sp + ph) * 3.2 + sin(TIME * sp * 2.7 + ph * 2.0) * 0.8;
	pos.z += cos(TIME * sp * 0.9 + ph * 1.3) * 3.2 + cos(TIME * sp * 2.3 + ph) * 0.8;
	float flap = abs(sin(TIME * (10.0 + 4.0 * INSTANCE_CUSTOM.y) + ph * 3.0));
	pos.y += sin(TIME * 2.2 + ph) * 0.22 + flap * 0.06;
	vec2 e = abs(rel) / (box * 0.5);
	v_k = fade * (1.0 - smoothstep(0.7, 1.0, max(e.x, e.y)));
	v_col = COLOR.rgb * shade;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec2 q = VERTEX.xy * 0.42 * clamp(v_k * 3.0, 0.0, 1.0);
	q.x *= 0.22 + 0.78 * flap;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(pos + right * q.x + up * q.y, 1.0);
}

void fragment() {
	vec2 q = (UV - vec2(0.5)) * 2.0;
	q.x = abs(q.x);
	float upper = length((q - vec2(0.5, 0.3)) / vec2(0.5, 0.62));
	float lower = length((q - vec2(0.4, -0.42)) / vec2(0.36, 0.4));
	float wing = min(upper, lower);
	float body = step(q.x, 0.07) * step(abs(q.y), 0.7);
	if (wing > 1.0 && body < 0.5) {
		discard;
	}
	vec3 c = v_col * (0.8 + 0.3 * smoothstep(0.55, 1.0, wing)); // a lighter rim
	c = mix(c, vec3(0.08, 0.06, 0.05) * 0.8, body);
	c = mix(c, vec3(1.0, 0.97, 0.9) * 0.8, smoothstep(0.1, 0.0, length(q - vec2(0.55, 0.45))) * 0.7);
	ALBEDO = c;
}
