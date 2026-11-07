// Sparrows (M7b): small brown birds that potter and hop on the grass and lift and scatter away from the hero when he or she
// comes near. Stateless: where a bird is follows from how far the hero is, so it also glides back when the hero leaves.
// The instance's origin is its place on the ground; custom data x/y are random. Billboards, a cut-out bird, no blending.
shader_type spatial;
render_mode unshaded, cull_disabled, fog_disabled;

uniform vec3 center = vec3(0.0);
uniform float fade = 1.0;
uniform float shade = 1.0;
uniform float scare = 4.5; // metres: the hero this close flushes it
varying float v_face;
varying float v_fly;
varying float v_k;

void vertex() {
	vec3 home = MODEL_MATRIX[3].xyz;
	float ph = INSTANCE_CUSTOM.x * 6.2831;
	float r = INSTANCE_CUSTOM.y;
	vec2 rel = home.xz - center.xz;
	float d = length(rel);
	vec2 away = rel / max(d, 0.001);
	float near = 1.0 - smoothstep(1.2, scare, d);
	float fly = smoothstep(0.0, 0.5, near);
	// pottering about on the ground in bursts of hops
	float clock = TIME * (0.7 + 0.5 * r) + ph;
	float burst = step(0.5, fract(clock * 0.31));
	float hop = burst * abs(sin(clock * 8.0)) * 0.07;
	vec3 pos = home;
	pos.xz += vec2(sin(TIME * 0.21 + ph), cos(TIME * 0.17 + ph * 1.7)) * 0.4 * (1.0 - fly);
	pos.xz += away * fly * 7.0;
	pos.y += hop * (1.0 - fly) + fly * (0.9 + 0.35 * sin(TIME * 3.0 + ph));
	float flap = abs(sin(TIME * 24.0 + ph * 4.0));
	v_fly = fly;
	v_face = mix((r < 0.5) ? -1.0 : 1.0, sign(dot(away, INV_VIEW_MATRIX[0].xz) + 0.001), fly);
	v_k = fade * (1.0 - smoothstep(14.0, 18.0, d)) * (1.0 - step(30.0, d));
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec2 q = VERTEX.xy * 0.36 * clamp(v_k * 3.0, 0.0, 1.0);
	q.y += 0.12 * clamp(v_k * 3.0, 0.0, 1.0) + fly * flap * 0.01;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(pos + right * q.x * v_face + up * q.y, 1.0);
}

void fragment() {
	vec2 q = (UV - vec2(0.5)) * 2.0;
	q.y = -q.y; // (UV y runs down the quad)
	float body = length((q - vec2(0.0, -0.1)) / vec2(0.62, 0.42));
	float head = length((q - vec2(0.5, 0.18)) / vec2(0.3, 0.3));
	float tail = length((q - vec2(-0.72, -0.05)) / vec2(0.3, 0.1));
	float beak = length((q - vec2(0.86, 0.14)) / vec2(0.14, 0.06));
	if (min(min(body, head), min(tail, beak)) > 1.0) {
		discard;
	}
	vec3 c = vec3(0.36, 0.22, 0.11);
	c = mix(c, vec3(0.62, 0.5, 0.36), (1.0 - smoothstep(-0.5, -0.05, q.y)) * step(body, 1.0)); // a paler belly
	c = mix(c, vec3(0.2, 0.12, 0.06), step(length((q - vec2(-0.1, 0.0 + v_fly * 0.2)) / vec2(0.4, 0.2)), 1.0) * step(body, 1.0)); // the wing
	c = mix(c, vec3(0.1, 0.08, 0.06), step(head, 0.28) * step(0.2, q.x)); // the black bib / eye patch
	c = mix(c, vec3(0.3, 0.22, 0.14), step(beak, 1.0) * step(1.0, min(body, head)));
	ALBEDO = c * (0.5 + 0.5 * shade);
}
