// Water on Låg (M7a): a flat, cheap look. Two colours, the pale line at the bank (the vertex colour's alpha says how
// near the bank a corner is) and a faint sheen of the sun; no noise, no waves, no screen reads (the screen texture is
// only copied when a visible material asks for it, so the cheap preset never pays for it). Mellan and Hög use
// farm_water_fx.gdshader, which has the same uniforms; farm_assets.gd swaps the shader by preset. The same shader
// draws bog, chocolate and lava with another colour.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_lambert, specular_disabled;

uniform vec3 shallow : source_color = vec3(0.32, 0.66, 0.82);
uniform vec3 deep : source_color = vec3(0.12, 0.34, 0.55);
uniform float glint = 1.0;
uniform float frozen = 0.0;
uniform float alpha = 0.84;

void fragment() {
	float bank = COLOR.a;
	vec3 col = mix(deep, shallow, 0.4 + 0.3 * bank);
	col = mix(col, vec3(0.9, 0.96, 1.0), smoothstep(0.6, 0.95, bank) * 0.8);
	col += vec3(1.0, 0.97, 0.85) * glint * 0.04;
	col = mix(col, vec3(0.8, 0.9, 0.97), frozen);
	ALBEDO = col;
	ALPHA = mix(alpha, 0.97, frozen);
	ROUGHNESS = 1.0;
}
