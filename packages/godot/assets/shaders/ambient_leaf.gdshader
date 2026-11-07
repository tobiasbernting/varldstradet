// Falling leaves (M7a): each leaf starts in a tree's crown (the instance's origin) and falls to the ground in a
// loop, swaying, tumbling and carried along the wind (the weather's `wind`), fading in and out. Colours of the season.
shader_type spatial;
render_mode blend_mix, unshaded, depth_draw_never, cull_disabled, fog_disabled;

uniform float fade = 1.0;
uniform float wind = 0.35;
uniform float shade = 1.0;
uniform vec3 colour_a : source_color = vec3(0.85, 0.5, 0.12);
uniform vec3 colour_b : source_color = vec3(0.7, 0.28, 0.1);
uniform vec3 colour_c : source_color = vec3(0.85, 0.65, 0.15);
varying vec3 v_col;
varying float v_a;

void vertex() {
	vec3 a = MODEL_MATRIX[3].xyz;
	float ph = INSTANCE_CUSTOM.x;
	float life = fract(TIME * (0.07 + 0.05 * INSTANCE_CUSTOM.y) + ph * 7.0);
	vec2 dir = vec2(0.86, 0.51);
	vec2 side = vec2(-dir.y, dir.x);
	vec3 pos = a;
	pos.y = max(0.05, a.y * (1.0 - life) + 0.05);
	pos.xz += dir * life * (0.6 + wind * 2.2) * 2.0 + side * sin(life * 13.0 + ph * 6.28) * 0.35 * (0.3 + life);
	float ang = TIME * (1.5 + INSTANCE_CUSTOM.y * 2.0) + ph * 6.28;
	vec2 q = VERTEX.xy;
	q = vec2(q.x * cos(ang) - q.y * sin(ang), q.x * sin(ang) + q.y * cos(ang));
	q.x *= 0.35 + 0.65 * abs(cos(ang * 0.7));
	v_a = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.88, 1.0, life)) * fade;
	v_col = (ph < 0.33 ? colour_a : (ph < 0.67 ? colour_b : colour_c)) * shade * (0.85 + 0.3 * INSTANCE_CUSTOM.y);
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(pos + (right * q.x + up * q.y) * 0.3, 1.0);
}

void fragment() {
	vec2 q = (UV - vec2(0.5)) * 2.0;
	float leaf = 1.0 - smoothstep(0.7, 1.0, length(q * vec2(0.8, 1.15)));
	ALBEDO = v_col * (0.85 + 0.25 * q.y);
	ALPHA = leaf * v_a;
}
