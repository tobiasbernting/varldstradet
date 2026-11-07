class_name BookPages
extends RefCounted
## The pages of the books, drawn into a GameWindow's body: the journal (the hero's level and what each level gives, the chapters,
## the nine dungeons with how to beat their bosses, the family's best times, the titles), the Upptäcktsboken (the landmarks found,
## with their lore) and the Gårdsbok (the achievements with progress bars and stars). The browser's renderJournal, renderLevels,
## renderFinds and renderBook (client/src/ui/saga.ts, menus.ts). All of it is read from my player record, the day, and the farm's
## `sagaBest`; the server owns every number. A page is rebuilt whenever the window refreshes (a new record), never per frame.

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


static func heading(w: GameWindow, text: String) -> Label:
	var l := w.add_label(text, 20, GOLD)
	return l


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


# ---------------------------------------------------------------------------
# Upptäcktsboken

static func finds(w: GameWindow) -> void:
	var me := w.model.my_player()
	var found: Array = Gear.progress(me).get("discovered", [])
	var groups: Array = Data.book.get("landmarks", [])
	var total := 0
	var have := 0
	for g in groups:
		for l in g.get("items", []):
			total += 1
			if found.has(str(l.get("id", ""))):
				have += 1
	w.add_label(Strings.t("sagaFindsIntro"), 15, DIM)
	var all_box := _panel(w._body)
	meter(all_box, float(have) / float(maxi(1, total)), "🧭 " + Strings.t("sagaFindsAll", {"n": have, "total": total}), 22)
	for g in groups:
		var items: Array = g.get("items", [])
		var n := 0
		for l in items:
			if found.has(str(l.get("id", ""))):
				n += 1
		var biome := str(g.get("biome", ""))
		var box := _panel(w._body)
		box.name = "finds_" + biome
		_text(box, "[b]%s %s[/b]  [color=#%s]%s%s[/color]" % [Strings.biome_emoji(biome), Strings.place(biome), "8fe08a" if n == items.size() else "aaaaaa", "✓ " if n == items.size() else "", Strings.t("sagaFindsCount", {"n": n, "total": items.size()})], 17)
		for l in items:
			var known := found.has(str(l.get("id", "")))
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 8)
			box.add_child(row)
			var q := Label.new()
			q.text = "🧭" if known else "?"
			q.add_theme_font_size_override("font_size", 22)
			q.custom_minimum_size = Vector2(32, 0)
			q.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			row.add_child(q)
			var col := VBoxContainer.new()
			col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			col.add_theme_constant_override("separation", 0)
			row.add_child(col)
			var nm := Label.new()
			nm.text = str(l.get("name", "")) if known else "???"
			nm.add_theme_font_size_override("font_size", 16)
			col.add_child(nm)
			_text(col, str(l.get("lore", "")) if known else Strings.t("sagaFindsUnknown", {"biome": Strings.place(biome)}), 14, DIM if known else Color(1, 1, 1, 0.45))


# ---------------------------------------------------------------------------
# The journal

static func journal(w: GameWindow) -> void:
	var me := w.model.my_player()
	var prog := Gear.progress(me)
	_levels(w, me)
	heading(w, Strings.t("sagaChapters"))
	var chapter_now := int(prog.get("chapter", 0))
	var heard_it := bool(prog.get("heard", false))
	var act_two := int(Data.book.get("actTwo", 4))
	var list: Array = Data.chapters
	for i in range(list.size()):
		if i > chapter_now:
			break
		if i == act_two:
			w.add_label("🌀 " + Strings.t("sagaActTwo"), 17, GOLD)
		var ch: Dictionary = list[i]
		var done := i < chapter_now
		var name_text := str(ch.get("title", "")) if i == 0 else Strings.t("sagaChapter", {"n": i, "title": str(ch.get("title", ""))})
		var need := str((ch.get("done", [""]) as Array)[0]) if done else (str(ch.get("goal", "")) if heard_it else Strings.t("sagaVisitVolva"))
		var box := _panel(w._body, Color(0.12, 0.2, 0.12, 0.9) if done else Color(0.16, 0.13, 0.1, 0.9))
		box.name = "chapter_%d" % i
		var parts: Array = SagaState.chapter_parts(me, i) if (not done and heard_it) else []
		var line := "%s [b]%s[/b]%s\n[color=#aaaaaa]%s[/color]" % ["✅" if done else "📜", name_text, "" if done else "  [color=#e8b830](%s)[/color]" % Strings.t("sagaChapterNow"), need]
		for p in parts:
			line += "\n" + str(p["text"])
		_text(box, line, 15)
	heading(w, Strings.t("sagaDungeons"))
	var ids: Array = Data.dungeons.keys()
	for k in range(ids.size()):
		_dungeon_card(w, me, prog, str(ids[k]), str(ids[k - 1]) if k > 0 else "")
	heading(w, Strings.t("sagaTitles"))
	var titles: Array = prog.get("titles", [])
	if titles.is_empty():
		w.add_label(Strings.t("sagaNoTitles"), 15, DIM)
	else:
		var parts: Array = []
		for t in titles:
			parts.append("👑 " + str(t))
		w.add_label("   ".join(parts), 17)


## The hero level: where you are, the experience bar, and what every level gives (the ones reached are ticked, the next is lit).
static func _levels(w: GameWindow, me: Dictionary) -> void:
	var xp := Gear.xp_of(me)
	var level := Gear.level_of(me)
	heading(w, "⭐ " + Strings.t("sagaHeroLevelHead"))
	var box := _panel(w._body)
	box.name = "levels"
	_text(box, "[b]%s[/b]" % Strings.t("sagaLevelOf", {"n": level, "max": Gear.max_level()}), 18)
	var span := Gear.span(xp)
	var next: int = span[1]
	meter(box, 1.0 if next < 0 else float(xp - int(span[0])) / float(maxi(1, next - int(span[0]))), Strings.t("sagaXpMax") if next < 0 else Strings.t("sagaXpOf", {"xp": xp, "next": next}), 20)
	_text(box, Strings.t("sagaLevelIntro"), 14, DIM)
	var lv_keys: Array = []
	for k in Data.level_rewards.keys():
		lv_keys.append(int(k))
	lv_keys.sort()
	var next_shown := false
	for n in lv_keys:
		var got: bool = level >= n
		var is_next := not got and not next_shown
		if not got:
			next_shown = true
		var row := _panel(w._body, Color(0.2, 0.17, 0.08, 0.95) if is_next else Color(0.16, 0.13, 0.1, 0.9))
		row.name = "level_%d" % n
		var r: Dictionary = Data.level_rewards[str(n)] if Data.level_rewards.has(str(n)) else Data.level_rewards.get(n, {})
		var bits: Array = []
		if r.get("item") != null:
			bits.append(Data.item_name(str(r["item"])))
		if r.get("title") != null:
			bits.append("👑 " + Strings.t("sagaRewardTitle", {"title": str(r["title"])}))
		if r.get("aura") != null:
			bits.append(("🌈 " if int(r["aura"]) == 2 else "✨ ") + Strings.t("sagaRewardAura2" if int(r["aura"]) == 2 else "sagaRewardAura1"))
		_text(row, "[b]%s[/b]   %s%s" % [("✓ %d" % n) if got else Strings.t("sagaRewardLocked", {"n": n}), "  ".join(bits), "   [color=#e8b830]◀[/color]" if is_next else ""], 15, Color.WHITE if got else DIM)


static func _dungeon_card(w: GameWindow, me: Dictionary, prog: Dictionary, id: String, prev: String) -> void:
	var d := Data.dungeon(id)
	var cleared: bool = (prog.get("cleared", []) as Array).has(id)
	var open: bool = cleared or (str(prog.get("cls", "")) != "" and (prev == "" or (prog.get("cleared", []) as Array).has(prev)))
	var box := _panel(w._body, Color(0.12, 0.2, 0.12, 0.9) if cleared else (Color(0.16, 0.13, 0.1, 0.9) if open else Color(0.12, 0.1, 0.09, 0.9)))
	box.name = "dungeon_" + id
	var tag := Strings.t("sagaClearedTag") if cleared else ("" if open else "🔒 " + Strings.t("sagaSealed"))
	_text(box, "[b]⚔️ %s[/b]   [color=#e8b830]%s[/color]" % [str(d.get("name", id)), tag], 18)
	if not open:
		_text(box, Strings.t("sagaUnknown"), 14, DIM)
		return
	# today's treasure from each boss (full once a day, a smaller chest after that), and the family's best time
	var chest_day: Dictionary = prog.get("chestDay", {}) if prog.get("chestDay") is Dictionary else {}
	for b in [str(d.get("mini", "")), str(d.get("boss", ""))]:
		var taken: bool = chest_day.has(b) and int(chest_day[b]) == w.model.day
		_text(box, "%s %s: [b]%s %s[/b]" % ["📦" if taken else "🎁", str(Data.boss(b).get("name", b)), Strings.t("sagaChestToday"), Strings.t("sagaChestTaken") if taken else Strings.t("sagaChestLeft")], 14, DIM if taken else Color.WHITE)
	var best: Variant = (w.model.farm.get("sagaBest", {}) as Dictionary).get(id) if w.model.farm.get("sagaBest") is Dictionary else null
	if best is Dictionary:
		_text(box, "⏱️ " + Strings.t("sagaBestTime", {"time": SagaState.clock(float(best.get("ms", 0))), "names": ", ".join(best.get("names", []))}), 14, GOLD)
	else:
		_text(box, "⏱️ " + Strings.t("sagaNoBestTime"), 14, DIM)
	for b in [str(d.get("mini", "")), str(d.get("boss", ""))]:
		var def := Data.boss(b)
		var line := "[b]%s %s[/b] · %s" % ["💀" if bool(def.get("mini", false)) else "👑", str(def.get("name", b)), str(def.get("title", ""))]
		if cleared and str(def.get("lore", "")) != "":
			line += "\n[color=#aaaaaa]%s[/color]" % str(def.get("lore", ""))
		line += "\n" + Strings.t("sagaHowToFight", {"boss": str(def.get("name", b))})
		for mv in def.get("moves", []):
			line += "\n  %s [b]%s:[/b] %s" % ["🛡️" if bool(mv.get("interrupt", false)) else "🔴", str(mv.get("name", "")), str(mv.get("text", ""))]
		_text(box, line, 14)
