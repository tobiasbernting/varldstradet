class_name BookWindow
extends GameWindow
## The books, as the tabs of one window (the browser's journal and Gårdsbok are two windows; a pad is easier with one):
## "📖 Sagan" (the journal: hero level and rewards, chapters, dungeons with best times, titles) and "📕 Gårdsbok" (the
## achievements). B opens it on the Gårdsbok, K on the journal, the HUD's level chip and the pause menu on either. The pages are in book_pages.gd.

var tab := "journal" ## "journal" or "book"


func _init() -> void:
	width = 700
	body_height = 440


func _purse_text(_me: Dictionary) -> String:
	return ""


## Open on a page ("journal" or "book").
func open_at(page: String) -> void:
	tab = page
	_set_tabs()
	_scroll.scroll_vertical = 0 if _scroll != null else 0
	open_window()


func _on_open() -> void:
	set_title(("📕 " + Strings.t("book")) if tab == "book" else ("📖 " + Strings.t("sagaJournalTitle")))
	_scroll.scroll_vertical = 0


func _set_tabs() -> void:
	clear_tabs()
	add_tab(Strings.t("sagaJournalTab"), tab == "journal", _show.bind("journal"))
	add_tab("📕 " + Strings.t("book"), tab == "book", _show.bind("book"))


func _show(page: String) -> void:
	tab = page
	_set_tabs()
	set_title(("📕 " + Strings.t("book")) if tab == "book" else ("📖 " + Strings.t("sagaJournalTitle")))
	refresh()
	_scroll.scroll_vertical = 0
	# the new tab button holds the focus (the rebuilt tab row lost it)
	for b in _find_buttons(_tabs):
		if b.button_pressed:
			b.grab_focus.call_deferred()


func _fill() -> void:
	match tab:
		"book":
			BookPages.achievements(self)
		_:
			BookPages.journal(self)


## K: the journal.
static func page_for_key(_me: Dictionary) -> String:
	return "journal"
