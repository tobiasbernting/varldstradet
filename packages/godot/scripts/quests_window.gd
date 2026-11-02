class_name QuestsWindow
extends GameWindow
## The list of the day's önskningar (J, or the pause menu): every wish the villagers have that I have not done today,
## who asks, what they want against what I carry, and the reward. Handing one over is done at the villager (their
## window); this is for deciding where to walk. Wishes in the bag's reach are lit, the rest dimmed.


func _init() -> void:
	title_text = "📜 " + Strings.t("questsTitle")
	body_height = 380


func _purse_text(_me: Dictionary) -> String:
	return ""


func _fill() -> void:
	var me := model.my_player()
	var done: Array = me.get("questsDone", [])
	var any := false
	for q in model.quests():
		if done.has(str(q.get("id", ""))):
			continue
		any = true
		var want: Dictionary = q.get("want", {})
		var item := str(want.get("item", ""))
		var have := model.count_item(item)
		var ok := have >= int(want.get("count", 1))
		var npc: Dictionary = Data.npcs.get(str(q.get("npc", "")), {})
		var sub := "%s: %d %s (%s)\n%s: %s\n[color=#aaaaaa]%s[/color]" % [Strings.t("questWant"), int(want.get("count", 1)), Data.item_name(item).to_lower(), Strings.t("questHave", {"n": have}), Strings.t("questReward"), SagaState.reward_text(q.get("reward", {})), Strings.t("questsAt", {"npc": str(npc.get("name", ""))})]
		add_row(Data.item_icon(item), str(q.get("text", "")), coloured(sub, ok) if ok else sub, [], not ok)
	if not any:
		add_label(Strings.t("questsNone"), 16)
