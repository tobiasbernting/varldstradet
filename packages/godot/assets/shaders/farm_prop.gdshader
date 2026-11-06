// Everything standing on the farm (trees, rocks, houses, furniture): vertex colours in the ART.md palette, flat
// shaded by the scene's lights. The colour's alpha is the foliage mask: where it is set the season's leaf colours
// replace the green (spring, summer, autumn; bare in winter is the snow), and the wind sways it. `snow` whitens
// every upward-facing surface (roofs, treetops, rocks), `wet` darkens everything in rain. The MultiMesh's custom
// data is (variation 0..1, sway phase, 0, 0).
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_back;

uniform float snow = 0.0;
uniform float wet = 0.0;
uniform float vcol_fix = 0.0; // 1 on the Compatibility renderer, which converts vertex colours from sRGB a second time: undone here
vec3 lin_to_srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
uniform float wind = 0.3;
uniform float leaf_mix = 0.0;
uniform vec3 leaf_a : source_color = vec3(0.39, 0.66, 0.28);
uniform vec3 leaf_b : source_color = vec3(0.39, 0.66, 0.28);
uniform vec3 leaf_c : source_color = vec3(0.39, 0.66, 0.28);
uniform float glow = 0.0; // night glow of lit windows (vertices with a mask of 0.5)
uniform vec3 glow_colour : source_color = vec3(1.0, 0.8, 0.45);

uniform float cloud = 0.0; // the same drifting cloud shadows as the ground
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

varying float v_var;
varying float v_fol;

void vertex() {
	v_wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_var = INSTANCE_CUSTOM.x;
	v_fol = UV.x;
	if (UV.x > 0.9 && wind > 0.0) {
		vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		float ph = INSTANCE_CUSTOM.y * 6.28;
		float s = sin(TIME * 1.7 + wp.x * 0.6 + wp.z * 0.4 + ph) * 0.6 + sin(TIME * 2.9 + wp.z * 0.9 + ph) * 0.4;
		VERTEX.x += s * wind * 0.06 * clamp(VERTEX.y, 0.0, 3.0);
		VERTEX.z += s * wind * 0.03 * clamp(VERTEX.y, 0.0, 3.0);
	}
}

void fragment() {
	vec3 col = COLOR.rgb;
	col = mix(col, lin_to_srgb(col), vcol_fix);
	float var_k = 0.9 + 0.2 * v_var;
	if (v_fol > 0.9) {
		float lum = dot(col, vec3(0.30, 0.59, 0.11));
		vec3 target = v_var < 0.34 ? leaf_a : (v_var < 0.67 ? leaf_b : leaf_c);
		vec3 lc = target * clamp(lum * 4.0, 0.45, 1.5) * var_k;
		col = mix(col * var_k, lc, leaf_mix);
	} else if (v_fol < 0.6 && v_fol > 0.4) {
		col = mix(col, glow_colour, glow);
	} else {
		col *= var_k;
	}
	vec3 wn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float up = clamp(wn.y, 0.0, 1.0);
	float s = snow * smoothstep(0.3, 0.75, up);
	col = mix(col, vec3(0.86, 0.9, 0.96), s);
	col *= 1.0 - 0.22 * wet;
	col *= 1.0 - cloud * smoothstep(0.5, 0.75, vnoise(v_wp.xz * 0.09 + vec2(TIME * 0.35, TIME * 0.12))) * 0.3;
	ALBEDO = col;
	ROUGHNESS = 1.0;
	if (v_fol < 0.6 && v_fol > 0.4) {
		EMISSION = glow_colour * glow * 1.4;
	}
}
