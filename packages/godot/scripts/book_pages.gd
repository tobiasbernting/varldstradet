class_name BookPages
extends RefCounted
## The pages of the books, drawn into a GameWindow's body: the Gårdsbok (the achievements with progress bars and stars; the browser's
## renderBook in client/src/ui/menus.ts). All of it is read from my player record; the server owns every number. A page is rebuilt
## whenever the window refreshes (a new record), never per frame.

const GOLD := Color("e8b830")
const DIM := Color(1, 1, 1, 0.65)


# ---------------------------------------------------------------------------
# Small pieces

static func _panel(parent: Control, tint := Color(0.16, 0.13, 0.1, 0.9)) -> VBoxContainer:
	var sb := StyleBoxFlat.new()
	sb.bg_color = tint
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", sb)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 3)
	p.add_child(v)
	return v


static func _text(parent: Control, text: String, size := 15, colour := Color(1, 1, 1, 0.92)) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_font_size_override("bold_font_size", size)
	r.add_theme_color_override("default_color", colour)
	r.text = text
	r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(r)
	return r


## A thin bar `k` full (0..1) with a line of text on it, the Gårdsbok's and the level's meter. The fill is a bright colour on a dark
## one, and the figures say the same, so no palette is needed.
static func meter(parent: Control, k: float, text: String, height := 18) -> Control:
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(0, height)
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(holder)
	var back := ColorRect.new()
	back.color = Color(0, 0, 0, 0.55)
	back.anchor_right = 1.0
	back.anchor_bottom = 1.0
	back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(back)
	var fill := ColorRect.new()
	fill.name = "Fill"
	fill.color = Palette.colour("safe") if Palette.mode() != "normal" else Color("e8b830")
	fill.anchor_bottom = 1.0
	fill.anchor_right = clampf(k, 0.0, 1.0)
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(fill)
	if text != "":
		var l := Label.new()
		l.text = text
		l.add_theme_font_size_override("font_size", maxi(11, height - 6))
		l.add_theme_color_override("font_color", Color.WHITE)
		l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
		l.add_theme_constant_override("outline_size", 4)
		l.anchor_right = 1.0
		l.anchor_bottom = 1.0
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(l)
	holder.set_meta("k", k)
	return holder


# ---------------------------------------------------------------------------
# The Gårdsbok

## Stars and "n av m bragder", then every achievement: a picture (a medal once done), its name and what to do, a bar of how far, and
## the stars it pays. The 78 of ACHIEVEMENTS (shared/src/data.ts) exported to game.json.
static func achievements(w: GameWindow) -> void:
	var me := w.model.my_player()
	var list: Array = Data.book.get("achievements", [])
	var have: Array = me.get("achievements", [])
	var stats: Dictionary = me.get("stats", {}) if me.get("stats") is Dictionary else {}
	var done := 0
	for a in list:
		if have.has(str(a.get("id", ""))):
			done += 1
	w.add_label("⭐ %d %s · %s" % [int(me.get("stars", 0)), Strings.t("stars"), Strings.t("achievementsDone", {"done": done, "total": list.size()})], 18, GOLD)
	for a in list:
		var unlocked := have.has(str(a.get("id", "")))
		var goal := int(a.get("goal", 1))
		var got := mini(goal, int(stats.get(str(a.get("stat", "")), 0)))
		var box := _panel(w._body, Color(0.2, 0.17, 0.08, 0.92) if unlocked else Color(0.16, 0.13, 0.1, 0.9))
		box.name = "ach_" + str(a.get("id", ""))
		var top := HBoxContainer.new()
		top.add_theme_constant_override("separation", 10)
		box.add_child(top)
		if unlocked:
			var medal := Label.new()
			medal.text = "🏅"
			medal.add_theme_font_size_override("font_size", 28)
			medal.custom_minimum_size = Vector2(40, 40)
			medal.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			top.add_child(medal)
		else:
			top.add_child(GameWindow.picture(Data.item_icon(str(a.get("icon", ""))), 40))
		var col := VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_theme_constant_override("separation", 0)
		top.add_child(col)
		var t := Label.new()
		t.text = str(a.get("title", ""))
		t.add_theme_font_size_override("font_size", 18)
		t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		col.add_child(t)
		_text(col, str(a.get("text", "")), 14, DIM)
		var right := Label.new()
		right.text = ("+%d ⭐" % int(a.get("stars", 0))) if unlocked else Strings.t("progress", {"have": got, "goal": goal})
		right.add_theme_font_size_override("font_size", 16)
		right.add_theme_color_override("font_color", GOLD if unlocked else Color.WHITE)
		top.add_child(right)
		meter(box, float(got) / float(maxi(1, goal)), "", 8)
	if list.is_empty():
		w.add_label(Strings.t("achievementsDone", {"done": 0, "total": 0}), 16)
