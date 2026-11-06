// A pool of light on the ground (a lamp's, round) or a beam of it (a door's or a window's, long, fading away from the
// wall): a flat additive quad laid just above the ground. This is what reads as light on the Låg preset, where the
// OmniLight is cheap and unshadowed, and it is the browser's `glow` and `beam`. For a beam the quad's V runs from the
// wall (0) outwards (1).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;

uniform vec3 colour : source_color = vec3(1.0, 0.72, 0.42);
uniform float energy = 1.0;
uniform float beam = 0.0;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float k;
	if (beam > 0.5) {
		float along = 1.0 - UV.y;
		float across = 1.0 - abs(p.x);
		k = pow(clamp(across, 0.0, 1.0), 1.4) * pow(clamp(along, 0.0, 1.0), 1.6);
	} else {
		k = clamp(1.0 - length(p), 0.0, 1.0);
		k = k * k * (3.0 - 2.0 * k);
		k *= k;
	}
	ALBEDO = colour * energy * k;
}
