// A creature's voxel body (scripts/voxel_body.gd): vertex colours from the sprite's pixels, flat shaded by the
// scene's lights like the farm's props (same `vcol_fix`). `flash` blends the body toward `flash_colour` (the hit
// flash, bright whatever the light), `tint` multiplies it (the fallen grey), `night` lifts it a little in the dark
// the way the billboards' emission does.
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_back;

uniform float vcol_fix = 0.0; // 1 on the Compatibility renderer, which converts vertex colours from sRGB a second time: undone here
uniform vec3 tint = vec3(1.0);
uniform vec3 flash_colour : source_color = vec3(1.0);
uniform float flash = 0.0;
uniform float night = 0.0;

vec3 lin_to_srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void fragment() {
	vec3 col = mix(COLOR.rgb, lin_to_srgb(COLOR.rgb), vcol_fix) * tint;
	ALBEDO = mix(col, flash_colour, flash);
	// the lift is warm-neutral and a touch stronger than the sprites' so a white cow reads pale under the navy night grade, not electric blue
	EMISSION = col * vec3(1.0, 0.9, 0.72) * night * 0.5 + flash_colour * flash * 0.6;
	ROUGHNESS = 1.0;
}
