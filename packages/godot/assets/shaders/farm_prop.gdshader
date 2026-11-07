// Everything standing on the farm (trees, rocks, houses, furniture): vertex colours in the ART.md palette, flat
// shaded by the scene's lights. The colour's alpha is the foliage mask: where it is set the season's leaf colours
// replace the green (spring, summer, autumn; bare in winter is the snow), and the wind sways it. `snow` whitens
// every upward-facing surface (roofs, treetops, rocks), `wet` darkens everything in rain. The MultiMesh's custom
// data is (variation 0..1, sway phase, 0, 0). The UV's y is the sway weight of plants (grass, flowers, ferns, reeds,
// crops 1, bushes 0.5), which lean with the wind from the foot up; a crown (the foliage mask) sways from the trunk, and
// so does a baked pine (UV.y -1: stiffer, and it keeps its own colour).
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_back;

uniform float snow = 0.0;
uniform float wet = 0.0;
uniform float wind = 0.3;      // the weather's strength: calm about 0.35, wind 1.7, storm 1.5 (day_night.gd WEATHER)
uniform int wind_level = 2;    // quality.gd: 0 none, 1 crowns only (one sine), 2 + gusts that cross the map and grass, bushes and crops, 3 + leaf flutter
uniform float leaf_mix = 0.0;
uniform vec3 leaf_a : source_color = vec3(0.39, 0.66, 0.28);
uniform vec3 leaf_b : source_color = vec3(0.39, 0.66, 0.28);
uniform vec3 leaf_c : source_color = vec3(0.39, 0.66, 0.28);
uniform float glow = 0.0; // night glow of lit windows (vertices with a mask of 0.5)
uniform vec3 glow_colour : source_color = vec3(1.0, 0.8, 0.45);

varying float v_var;
varying float v_fol;

void vertex() {
	v_var = INSTANCE_CUSTOM.x;
	v_fol = UV.x;
	if (wind_level == 1) {
		// Låg: what the farm had before the alive world, to the instruction: every foliage vertex sways with one sine pair
		if (UV.x > 0.9 && wind > 0.0) {
			vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
			float ph = INSTANCE_CUSTOM.y * 6.28;
			float s = sin(TIME * 1.7 + wp.x * 0.6 + wp.z * 0.4 + ph) * 0.6 + sin(TIME * 2.9 + wp.z * 0.9 + ph) * 0.4;
			VERTEX.x += s * wind * 0.06 * clamp(VERTEX.y, 0.0, 3.0);
			VERTEX.z += s * wind * 0.03 * clamp(VERTEX.y, 0.0, 3.0);
		}
	} else if (wind_level > 1) {
		bool pine = UV.y < -0.5; // a baked pine: a stiff crown that does not take the leaf colours
		bool plant = UV.y > 0.01;
		if (plant || pine || UV.x > 0.9) {
			vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
			float ph = INSTANCE_CUSTOM.y * 6.28;
			float s = sin(TIME * 1.7 + wp.x * 0.6 + wp.z * 0.4 + ph) * 0.6 + sin(TIME * 2.9 + wp.z * 0.9 + ph) * 0.4;
			vec2 dir = vec2(0.86, 0.51);
			// gusts: bands of stronger wind that cross the map along the wind, quicker the stronger it blows
			float travel = dot(wp.xz, dir) * 0.21 - TIME * (0.7 + 0.5 * wind);
			float g = sin(travel) + 0.5 * sin(travel * 2.3 + 1.7);
			float lean = wind * (0.3 + 0.7 * smoothstep(-0.9, 1.2, g)); // along the wind, 0..~1.7
			float shake = s * wind * 0.5; // the old sway, across and back
			if (wind_level > 2) {
				shake += sin(TIME * (5.0 + 2.5 * wind) + wp.x * 1.9 + ph * 3.0) * wind * 0.22 * UV.x;
			}
			float disp;
			if (plant) {
				float h = clamp(VERTEX.y / 0.55, 0.0, 1.0);
				disp = (lean * 0.3 + shake * 0.1 + 0.015 * s) * h * h * UV.y;
			} else {
				disp = (lean * 0.07 + shake * 0.06) * clamp(VERTEX.y, 0.0, 3.0) * (pine ? 0.55 : 1.0);
			}
			// the wind's direction on the ground in this instance's own axes (a tree is turned at random)
			mat3 m = mat3(MODEL_MATRIX);
			vec3 ld = transpose(m) * vec3(dir.x, 0.0, dir.y) / max(dot(m[0], m[0]), 0.0001);
			VERTEX += ld * disp;
			VERTEX.y -= abs(disp) * 0.25 * float(plant);
		}
	}
}

void fragment() {
	vec3 col = COLOR.rgb;
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
	ALBEDO = col;
	ROUGHNESS = 1.0;
	if (v_fol < 0.6 && v_fol > 0.4) {
		EMISSION = glow_colour * glow * 1.4;
	}
}
