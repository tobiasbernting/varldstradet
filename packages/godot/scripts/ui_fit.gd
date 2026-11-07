class_name UiFit
extends RefCounted
## M8b: a window whose panel is bigger than the screen (the bag with a chest open or the character creator at 175 % text, where the
## 1280 × 720 window is 731 × 411 points) is scaled down to fit, about its middle, instead of clipping. It only ever shrinks (never
## below 40 %), and it follows the panel's own size, the window's size and the text size. A window made of a scrolling body (GameWindow)
## does not need this for its height, but gets it as a net for the width.


## Keeps `panel` (a child of a CenterContainer) inside the screen.
static func attach(panel: Control) -> void:
	var refit := func() -> void:
		if is_instance_valid(panel):
			fit(panel)
	# (the screen's size changes a frame after the content scale does, and a window's panel is measured when it is shown: so
	# every trigger also looks again on the next frame)
	var later := func() -> void:
		if is_instance_valid(panel):
			refit.call_deferred()
	panel.minimum_size_changed.connect(later)
	panel.resized.connect(later)
	panel.visibility_changed.connect(later)
	var root := (Engine.get_main_loop() as SceneTree).root
	root.size_changed.connect(later)
	Settings.ui_scale_changed.connect(later)
	# a panel that is freed lets go of the two signals that outlive it
	panel.tree_exited.connect(func() -> void:
		if root.size_changed.is_connected(later):
			root.size_changed.disconnect(later)
		if Settings.ui_scale_changed.is_connected(later):
			Settings.ui_scale_changed.disconnect(later))


static func fit(panel: Control) -> void:
	if not panel.is_inside_tree():
		return
	var view := panel.get_viewport().get_visible_rect().size
	var need := panel.get_combined_minimum_size()
	if need.x <= 0.0 or need.y <= 0.0:
		return
	var k := clampf(minf((view.x - 24.0) / need.x, (view.y - 24.0) / need.y), 0.4, 1.0)
	var s := Vector2(k, k)
	if panel.scale != s:
		panel.scale = s
	# The container puts a panel that is too big at the top-left of the screen (it does not centre what overflows), so the pivot is
	# chosen so that the shrunken panel lands in the middle of the screen: position + pivot * (1 - k) + size * k / 2 = view / 2.
	var pivot := panel.size / 2.0
	if k < 0.999:
		pivot = (view / 2.0 - panel.position - panel.size * k / 2.0) / (1.0 - k)
	if panel.pivot_offset != pivot:
		panel.pivot_offset = pivot
