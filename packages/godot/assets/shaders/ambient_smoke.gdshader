// Chimney smoke (M7a): puffs that rise from the chimney's top (the instance's origin), swell, thin out and bend
// with the wind (the weather's `wind`). Several puffs per chimney, each a phase of the same loop (custom x).
shader_type spatial;
render_mode blend_mix, unshaded, depth_draw_never, cull_disabled, fog_disabled;

uniform float fade = 1.0;
uniform float wind = 0.35;
uniform float shade = 1.0;
uniform vec3 colour : source_color = vec3(0.78, 0.78, 0.8);
varying float v_a;
varying float v_seed;

void vertex() {
	vec3 a = MODEL_MATRIX[3].xyz;
	float life = fract(TIME * 0.2 + INSTANCE_CUSTOM.x);
	vec2 dir = vec2(0.86, 0.51);
	float ph = INSTANCE_CUSTOM.y * 6.28;
	vec3 pos = a + vec3(0.0, life * 2.5, 0.0);
	pos.xz += dir * life * life * (0.8 + 1.9 * wind) + vec2(-dir.y, dir.x) * sin(life * 7.0 + ph) * 0.12 * life;
	float size = mix(0.22, 0.95, sqrt(life));
	v_a = smoothstep(0.0, 0.12, life) * (1.0 - life) * (1.0 - life) * 0.9 * fade;
	v_seed = INSTANCE_CUSTOM.y;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(pos + (right * VERTEX.x + up * VERTEX.y) * size, 1.0);
}

void fragment() {
	vec2 q = (UV - vec2(0.5)) * 2.0;
	float r = length(q);
	float n = 0.85 + 0.15 * sin(atan(q.y, q.x) * 3.0 + v_seed * 20.0);
	ALBEDO = colour * shade;
	ALPHA = smoothstep(n, 0.1, r) * v_a;
}
