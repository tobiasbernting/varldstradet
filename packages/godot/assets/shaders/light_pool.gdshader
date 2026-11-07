// A pool of light on the ground (a lamp's, round): a flat additive quad laid just above the ground. This is what reads
// as light on the Låg preset, where the OmniLight is cheap and unshadowed, and it is the browser's `glow`.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;

uniform vec3 colour : source_color = vec3(1.0, 0.72, 0.42);
uniform float energy = 1.0;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float k = clamp(1.0 - length(p), 0.0, 1.0);
	k = k * k * (3.0 - 2.0 * k);
	k *= k;
	ALBEDO = colour * energy * k;
}
