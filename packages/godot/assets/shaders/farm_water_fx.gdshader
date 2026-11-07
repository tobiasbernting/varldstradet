// Water on Mellan and Hög (M7a): gentle waves (four directional sines make the surface's slope, so the light, the
// glint and the reflection all ripple together), a foam line at the bank that washes in and out (only there), and a reflection of
// the sky and the shore found in the screen itself: the view ray is mirrored in the surface and marched through the
// depth buffer a few steps (`quality` 1: 16 steps over 8 m, 2: 28; the ray is flattened, see below); where it meets something standing above
// the water (a tree, a house, the far bank) that pixel's colour is the reflection, where it leaves the screen or
// meets nothing it is the sky's colour. It reads the screen and depth textures, so it is only used when the preset
// asks (farm_water.gdshader is the cheap one). Everything is plain GLSL ES 3 so it also compiles on Compatibility
// and Metal. The camera looks down at ~51 degrees: only what stands on the far side of a pond mirrors in it.
// `reflect_k` is 1 for water, a little for bog and chocolate and 0 for lava. `wave` follows the weather's wind.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_lambert, specular_schlick_ggx;

uniform vec3 shallow : source_color = vec3(0.32, 0.66, 0.82);
uniform vec3 deep : source_color = vec3(0.12, 0.34, 0.55);
uniform float glint = 1.0;
uniform float frozen = 0.0;
uniform float alpha = 0.84;
uniform int quality = 1;
uniform float reflect_k = 1.0;
uniform float wave = 1.0;
uniform vec3 sky_colour : source_color = vec3(0.55, 0.75, 0.92);
uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear;
uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;
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
	VERTEX.y += sin(TIME * 1.3 + v_wp.x * 1.7 + v_wp.z * 1.1) * 0.008 * wave;
}

// The scene's view-space position under a screen uv (reverse-Z in Forward+ and Mobile, -1..1 in Compatibility).
vec3 scene_at(vec2 uv, mat4 inv_proj) {
	float d = textureLod(depth_tex, uv, 0.0).x;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(uv, d) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(uv * 2.0 - 1.0, d);
#endif
	vec4 v = inv_proj * vec4(ndc, 1.0);
	return v.xyz / v.w;
}

void fragment() {
	vec2 p = v_wp.xz;
	float bank = COLOR.a;
	float open_water = 1.0 - bank;
	// the slope of four crossing swells (amplitude, wave number, speed): calmer near the bank, rougher in the open
	vec2 grad = vec2(0.0);
	vec4 w0 = vec4(0.030, 2.4, 1.1, 0.0);
	vec4 w1 = vec4(0.022, 4.3, 1.5, 1.0);
	vec4 w2 = vec4(0.014, 7.1, 2.1, 2.0);
	vec4 w3 = vec4(0.008, 11.0, 2.8, 3.0);
	vec2 d0 = vec2(0.86, 0.51);
	vec2 d1 = vec2(-0.45, 0.89);
	vec2 d2 = vec2(0.31, -0.95);
	vec2 d3 = vec2(-0.92, -0.38);
	float ph0 = dot(d0, p) * w0.y - TIME * w0.z;
	float ph1 = dot(d1, p) * w1.y - TIME * w1.z;
	float ph2 = dot(d2, p) * w2.y - TIME * w2.z;
	float ph3 = dot(d3, p) * w3.y - TIME * w3.z;
	grad += d0 * (w0.x * w0.y * cos(ph0)) + d1 * (w1.x * w1.y * cos(ph1)) + d2 * (w2.x * w2.y * cos(ph2)) + d3 * (w3.x * w3.y * cos(ph3));
	grad *= wave * (0.45 + 0.55 * open_water);
	vec3 nw = normalize(vec3(-grad.x * 0.4, 1.0, -grad.y * 0.4));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);

	float r1 = vnoise(p * 1.7 + vec2(TIME * 0.22, TIME * 0.13));
	float r2 = vnoise(p * 3.3 - vec2(TIME * 0.17, TIME * 0.25));
	float ripple = r1 * 0.6 + r2 * 0.4;
	vec3 col = mix(deep, shallow, 0.3 + 0.5 * ripple);
	col = mix(col, deep, 0.35 * open_water);

	// foam: the wash at the bank moves in and out, broken up by noise
	float wash = 0.5 + 0.5 * sin(TIME * 1.3 + r1 * 5.0 + bank * 4.0);
	float foam = smoothstep(0.78 - 0.18 * wash, 0.98, bank + 0.2 * (r2 - 0.5)) * (0.55 + 0.45 * vnoise(p * 7.0 + TIME * 0.3));
	col = mix(col, vec3(0.92, 0.97, 1.0), foam);
	float sp = smoothstep(0.82, 0.95, vnoise(p * 6.0 + vec2(TIME * 0.9, -TIME * 0.7)));
	col += vec3(1.0, 0.97, 0.85) * sp * glint * 0.12;
	col = mix(col, vec3(0.8, 0.9, 0.97), frozen);

	// the reflection
	vec3 view_dir = normalize(VERTEX);
	float fres = pow(1.0 - clamp(dot(-view_dir, NORMAL), 0.0, 1.0), 3.0);
	float amount = reflect_k * (0.14 + 0.5 * fres) * (1.0 - foam) * (1.0 - 0.5 * frozen);
	float hit_amount = reflect_k * 0.75 * (1.0 - foam);
	vec3 refl = sky_colour;
	if (amount > 0.01) {
		// the reflection sees a calmer surface than the light does: a coherent image, only gently wobbled
		vec3 calm_n = normalize(mix((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz, NORMAL, 0.3));
		vec3 rdir = reflect(view_dir, calm_n);
		// art direction: seen from 51 degrees the true mirror image of a far bank is mostly above the screen; a flatter
		// ray (as if the camera stood lower) finds the trees and the bank across the pond, which is what a pond shows
		vec3 up_v = (VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
		float climb = dot(rdir, up_v);
		rdir = normalize(rdir - up_v * (climb * 0.55));
		int steps = quality > 1 ? 28 : 16;
		float step_len = 8.0 / float(steps);
		float jitter = hash(FRAGCOORD.xy) * 0.5;
		float hit = 0.0;
		vec3 hit_col = vec3(0.0);
		if (rdir.z < 0.0) { // (not towards the camera)
			for (int i = 0; i < 28; i++) {
				if (i >= steps) {
					break;
				}
				vec3 pt = VERTEX + rdir * (step_len * (float(i) + 0.4 + jitter));
				vec4 clip = PROJECTION_MATRIX * vec4(pt, 1.0);
				vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
				if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
					break;
				}
				vec3 sc = scene_at(uv, INV_PROJECTION_MATRIX);
				float behind = sc.z - pt.z; // > 0: the ray point is farther from the camera than the surface it is over
				float above = (INV_VIEW_MATRIX * vec4(sc, 1.0)).y;
				if (behind > 0.0 && behind < step_len * 1.5 + 0.25 && above > 0.25) {
					vec2 edge = smoothstep(0.0, 0.08, uv) * (1.0 - smoothstep(0.92, 1.0, uv));
					hit = edge.x * edge.y * (1.0 - 0.75 * float(i) / float(steps)); // fainter the farther it is: near the bank it is a mirror, farther out the sky
					vec2 px = 1.6 / VIEWPORT_SIZE;
					hit_col = textureLod(screen_tex, uv, 0.0).rgb * 0.5 + textureLod(screen_tex, uv + px, 0.0).rgb * 0.25 + textureLod(screen_tex, uv - px, 0.0).rgb * 0.25;
					break;
				}
			}
		}
		refl = mix(sky_colour, hit_col, hit);
		amount = mix(amount, hit_amount, hit);
	}
	ALBEDO = col * (1.0 - amount * 0.6);
	EMISSION = refl * amount;
	ALPHA = mix(mix(alpha, 0.97, frozen), 1.0, clamp(amount, 0.0, 0.6));
	ROUGHNESS = 0.5;
	SPECULAR = 0.2;
}
