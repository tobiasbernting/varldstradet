// Water: a flat translucent sheet over the pond's dark bed, with two slow ripple layers, a sparkle of the sun and a
// pale foam line at the bank (the vertex colour's alpha says how near the bank a corner is). `glint` is the sun's
// brightness (0 at night, so the moon does not glitter like noon). The same shader draws bog, chocolate and lava
// with another colour.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_lambert, specular_schlick_ggx;

uniform vec3 shallow : source_color = vec3(0.32, 0.66, 0.82);
uniform vec3 deep : source_color = vec3(0.12, 0.34, 0.55);
uniform float glint = 1.0;
uniform float frozen = 0.0;
uniform float alpha = 0.84;
uniform float night = 0.0; // 0..1: the pond takes the dark sky's colour and shows cool star glints
uniform vec3 sky_colour = vec3(0.16, 0.18, 0.32);
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
	VERTEX.y += sin(TIME * 1.3 + v_wp.x * 1.7 + v_wp.z * 1.1) * 0.008;
}

void fragment() {
	vec2 p = v_wp.xz;
	float r1 = vnoise(p * 1.7 + vec2(TIME * 0.22, TIME * 0.13));
	float r2 = vnoise(p * 3.3 - vec2(TIME * 0.17, TIME * 0.25));
	float ripple = r1 * 0.6 + r2 * 0.4;
	vec3 col = mix(deep, shallow, 0.35 + 0.5 * ripple);
	float bank = COLOR.a;
	col = mix(col, vec3(0.9, 0.96, 1.0), smoothstep(0.55, 0.95, bank) * (0.5 + 0.5 * ripple));
	float sp = smoothstep(0.82, 0.95, vnoise(p * 6.0 + vec2(TIME * 0.9, -TIME * 0.7)));
	col += vec3(1.0, 0.97, 0.85) * sp * glint * 0.55;
	// night: the sky's dark blue, with slow cool glints (stars) in place of the sun's sparkle
	col = mix(col, sky_colour * 0.8 + vec3(0.0, 0.02, 0.05), night * 0.55);
	float st = smoothstep(0.86, 0.96, vnoise(p * 7.0 + vec2(TIME * 0.35, -TIME * 0.25)));
	col += vec3(0.7, 0.85, 1.0) * st * night * 0.7;
	col = mix(col, vec3(0.8, 0.9, 0.97), frozen);
	ALBEDO = col;
	ALPHA = mix(alpha, 0.97, frozen);
	ROUGHNESS = 0.25;
	SPECULAR = 0.5;
}
