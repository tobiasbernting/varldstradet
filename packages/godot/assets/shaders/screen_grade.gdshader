// The picture's last pass (the browser's main.ts ends every frame the same way): a warm grade, a saturation control,
// a push toward blue at night, a vignette and a lightning flash. One full-screen read of the screen texture, on every
// quality preset. The canvas works in sRGB, like the browser's, so the numbers are the browser's.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_nearest;
uniform float warm = 1.0;       // 0..1, how much of the browser's warm grade
uniform float saturation = 0.9; // 1 is the picture as rendered
uniform float contrast = 1.0;   // below 1 in fog
uniform float night_tint = 0.0; // 0..1, the push toward blue
uniform float dusk = 0.0;       // 0..1, the mauve of the minutes after sunset
uniform float vignette = 0.3;
uniform float flash = 0.0;      // 0..1, lightning
uniform vec3 tint = vec3(1.0);  // the weather's cooler or greyer cast

void fragment() {
	vec3 c = textureLod(screen_tex, SCREEN_UV, 0.0).rgb;
	c = mix(c, c * vec3(1.03, 1.0, 0.95) + vec3(0.012, 0.007, 0.0), warm);
	float luma = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(vec3(luma), c, saturation);
	c = mix(vec3(0.5), c, contrast);
	c *= tint;
	// night: toward blue-teal, with a little lift in the darks so the shadows are blue and not black
	vec3 blue = c * vec3(1.14, 0.9, 1.5) + vec3(0.0, 0.012, 0.045) * (1.0 - luma);
	c = mix(c, blue, night_tint * (1.0 - smoothstep(0.35, 0.8, luma))); // lamps and windows keep their warmth
	c = mix(c, c * vec3(1.1, 0.9, 1.12), dusk);
	float d = length(SCREEN_UV - vec2(0.5)) * 1.4142;
	c *= 1.0 - vignette * pow(d, 2.4);
	c = mix(c, vec3(0.88, 0.92, 1.0), flash * 0.85);
	COLOR = vec4(clamp(c, 0.0, 1.0), 1.0);
}
