shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix, fog_disabled;

// M8b: the diagonal stripes over a mark of a coming attack (fx_view.gd, Settings.danger_pattern): danger that does not rely on
// colour alone. The stripes are laid out in world metres, not in the mesh's own units (the marks are scaled to their radius), so a
// small mark and a big one have the same stripes; they crawl slowly along the mark so that a still picture and a moving one both read.

uniform vec4 colour : source_color = vec4(0.05, 0.04, 0.03, 0.7);
uniform float period = 0.9;   // metres from one stripe to the next
uniform float duty = 0.45;    // the part of the period that is stripe

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float u = (world_pos.x + world_pos.z) / period + TIME * 0.35;
	float stripe = step(fract(u), duty);
	ALBEDO = colour.rgb;
	ALPHA = colour.a * stripe;
}
