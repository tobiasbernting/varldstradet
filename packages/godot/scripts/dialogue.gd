class_name Dialogue
extends RefCounted
## The villagers' conversations: talkNode of shared/src/dialogue.ts, played from the same data (game.json `dialogue`,
## written by `pnpm godot:data`). A node is "start", "topics", "bye", "how[:good|tired|sad|angry]", "weather", "likes",
## "dislikes", "pet[:nice]", "joke[:i]", "riddle[:i[:answer|give]]", "rps[:hand]", "ask[:i]" or a villager's own node id.
## The random choices (which joke, which riddle, Elsa's hand in sten, sax, påse) are made here, so call it once per
## step and keep the result: {say: String, options: [{text, go}]}.

const DISLIKES := ["Spindlar i badkaret! Usch. 🕷️", "När strumporna blir blöta. Det är det värsta jag vet.", "Att gå och lägga mig när det är roligt. Precis som du, kanske?"]


static func _d() -> Dictionary:
	return Data.dialogue


static func _pick(list: Array, rnd: RandomNumberGenerator) -> Variant:
	return list[rnd.randi() % list.size()]


static func _fill(s: String, ctx: Dictionary, extra: Dictionary = {}) -> String:
	var out := s.replace("{name}", str(ctx.get("name", "")))
	for k in extra:
		out = out.replace("{%s}" % k, str(extra[k]))
	return out


static func _opt(text: String, go: String) -> Dictionary:
	return {"text": text, "go": go}


static func _back() -> Dictionary:
	var b: Array = _d().get("back", ["Prata om något annat", "topics"])
	return _opt(str(b[0]), str(b[1]))


static func _say(s: String, ctx: Dictionary, options: Array = [], extra: Dictionary = {}) -> Dictionary:
	return {"say": _fill(s, ctx, extra), "options": options if not options.is_empty() else [_back()]}


static func _topics(def: Dictionary, ctx: Dictionary) -> Array:
	var list: Array = []
	for t in def.get("topics", []):
		list.append([str(t[0]), str(t[1])])
	list.append(["Hur mår du?", "how"])
	if str(ctx.get("weather", "")) != "":
		list.append(["Vad tycker du om vädret?", "weather"])
	list.append_array([["Berätta ett skämt!", "joke"], ["Har du en gåta?", "riddle"], ["Vad tycker du om?", "likes"]])
	if not (ctx.get("pets", []) as Array).is_empty():
		list.append(["Jag har ett husdjur!", "pet"])
	list.append_array([["Fråga mig något!", "ask"], ["Hej då!", "bye"]])
	var out: Array = []
	for o in list:
		out.append(_opt(_fill(str(o[0]), ctx), str(o[1])))
	return out


static func _greeting(def: Dictionary, ctx: Dictionary) -> String:
	var f := float(ctx.get("dayFraction", 0.5))
	var time := "God morgon! " if f < 0.25 else ("Oj, är du uppe så här sent? " if f > 0.8 else "")
	var season := ""
	match str(ctx.get("season", "")):
		"jul":
			season = " God jul förresten! 🎄"
		"halloween":
			season = " Glad Halloween! 🎃"
		"pask":
			season = " Glad påsk! 🐣"
		"midsommar":
			season = " Glad midsommar! 🌸"
	return time + _fill(str(_pick(def.get("hello", ["Hej!"]), ctx["rnd"])), ctx) + season


static func talk_node(npc_id: String, node: String, ctx: Dictionary) -> Dictionary:
	var npcs: Dictionary = _d().get("npcs", {})
	var def: Variant = npcs.get(npc_id)
	if not (def is Dictionary):
		return {"say": "…", "options": [_opt("Hej då!", "")]}
	var rnd: RandomNumberGenerator = ctx["rnd"]
	var parts := node.split(":")
	match parts[0]:
		"start":
			return {"say": _greeting(def, ctx), "options": _topics(def, ctx)}
		"topics":
			return {"say": str(_pick(_d().get("hints", ["Vad vill du prata om?"]), rnd)), "options": _topics(def, ctx)}
		"bye":
			return _say(str(_pick(def.get("bye", ["Hej då!"]), rnd)), ctx, [_opt("Hej då! 👋", "")])
		"how":
			var how: Dictionary = _d().get("how", {})
			if parts.size() > 1 and parts[1] != "":
				return _say(str(_pick(how.get(parts[1], how.get("good", ["Fint!"])), rnd)), ctx)
			return _say("%s Och du då, {name}? Hur mår du?" % str(_pick(def.get("how", ["Bra!"]), rnd)), ctx, [_opt("Jättebra! 😄", "how:good"), _opt("Lite trött 😴", "how:tired"), _opt("Lite ledsen 😢", "how:sad"), _opt("Arg! 😠", "how:angry")])
		"weather":
			var w := str(ctx.get("weather", ""))
			if w == "":
				w = "sun"
			var own: Variant = def.get("weather", {}).get(w) if def.get("weather") is Dictionary else null
			return _say(str(own) if own != null else str(_pick(_d().get("weather", {}).get(w, ["Fint väder."]), rnd)), ctx)
		"likes":
			return _say(str(_pick(def.get("likes", ["Allt möjligt."]), rnd)), ctx, [_opt("Vad gillar du inte då?", "dislikes"), _back()])
		"dislikes":
			return _say(str(_pick(DISLIKES, rnd)), ctx)
		"pet":
			var pets: Array = ctx.get("pets", [])
			if parts.size() > 1 and parts[1] == "nice":
				return _say("Det märks! Djur som blir klappade blir alltid snälla. ❤️", ctx)
			if pets.is_empty():
				return _say("Ett husdjur? Det vore mysigt! I brevlådan kan man köpa hund eller katt.", ctx)
			var pet: Dictionary = _pick(pets, rnd)
			var lines: Array = def.get("pet", _d().get("pet", ["{pet}!"]))
			return _say(str(_pick(lines, rnd)), ctx, [_opt("%s är jättesnäll!" % str(pet.get("name", "")), "pet:nice"), _back()], {"pet": str(pet.get("name", ""))})
		"joke":
			var jokes: Array = _d().get("jokes", [])
			if parts.size() < 2:
				var i := int(rnd.randi() % jokes.size())
				return _say("Okej, här kommer ett: %s" % str(jokes[i].get("q", "")), ctx, [_opt("Vet inte, vad då?", "joke:%d" % i), _opt("Jag vet!", "joke:%d" % i)])
			var j: Dictionary = jokes[int(parts[1]) % jokes.size()]
			return _say("%s Hahaha!" % str(j.get("a", "")), ctx, [_opt("Haha! Ett till! 😂", "joke"), _back()])
		"riddle":
			var riddles: Array = _d().get("riddles", [])
			var i := int(rnd.randi() % riddles.size()) if parts.size() < 2 else int(parts[1]) % riddles.size()
			var r: Dictionary = riddles[i]
			var answers: Array = []
			var texts: Array = r.get("answers", [])
			for a in range(texts.size()):
				answers.append(_opt(str(texts[a]), "riddle:%d:%d" % [i, a]))
			if parts.size() < 3:
				return _say("Här är en gåta: %s" % str(r.get("q", "")), ctx, answers)
			var right := int(r.get("right", 0))
			if parts[2] == "give":
				return _say("Svaret är: %s! Klurig, va?" % str(texts[right]), ctx, [_opt("En till!", "riddle"), _back()])
			if int(parts[2]) == right:
				return _say("%s Svaret är %s." % [str(_pick(_d().get("right", ["Rätt!"]), rnd)), str(texts[right]).to_lower()], ctx, [_opt("En till!", "riddle"), _back()])
			var more := answers.duplicate()
			more.append(_opt("Jag ger upp", "riddle:%d:give" % i))
			return _say("%s %s" % [str(_pick(_d().get("wrong", ["Nej."]), rnd)), str(r.get("q", ""))], ctx, more)
		"rps":
			var hands := ["Sten ✊", "Sax ✌️", "Påse ✋"]
			if parts.size() < 2:
				var opts: Array = []
				for h in range(3):
					opts.append(_opt(hands[h], "rps:%d" % h))
				return _say("Sten, sax, påse… nu!", ctx, opts)
			var you := int(parts[1]) % 3
			var me := int(rnd.randi() % 3)
			var mine := str(hands[me]).split(" ")[0].to_lower()
			var result := "Lika! Vi tänker likadant!" if you == me else ("Du vann! Grattis! 🎉" if (you + 1) % 3 == me else "Jag vann! Jippi! 🎉")
			return _say("Jag tog %s! %s" % [mine, result], ctx, [_opt("Igen!", "rps"), _opt("Nu räcker det", "topics")])
		"ask":
			var ask: Dictionary = def.get("ask", {})
			var answers: Array = ask.get("answers", [])
			if parts.size() < 2:
				var opts2: Array = []
				for a in range(answers.size()):
					opts2.append(_opt(_fill(str(answers[a][0]), ctx), "ask:%d" % a))
				return _say(str(ask.get("q", "")), ctx, opts2)
			var idx := int(parts[1])
			return _say(str(answers[idx][1]) if idx >= 0 and idx < answers.size() else "Vad spännande!", ctx)
	var nodes: Dictionary = def.get("nodes", {})
	var n: Variant = nodes.get(node)
	if not (n is Dictionary):
		return {"say": str(_pick(_d().get("hints", ["…"]), rnd)), "options": _topics(def, ctx)}
	var say_v: Variant = n.get("say")
	var text := str(_pick(say_v, rnd)) if say_v is Array else str(say_v)
	var opts3: Array = []
	var raw: Array = n.get("opts", [])
	if raw.is_empty():
		opts3.append(_back())
	for o in raw:
		opts3.append(_opt(_fill(str(o[0]), ctx), str(o[1])))
	return _say(text, ctx, opts3)
