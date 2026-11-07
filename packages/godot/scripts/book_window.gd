class_name BookWindow
extends GameWindow
## The Gårdsbok (the browser's achievements book; B, and the pause menu): a window over the pages in book_pages.gd. More pages
## (the journal, the finds) join it as tabs.

var tab := "book" ## the page shown ("book": the Gårdsbok)


func _init() -> void:
	width = 700
	body_height = 440


func _purse_text(_me: Dictionary) -> String:
	return ""


## Open on a page ("book").
func open_at(page: String) -> void:
	tab = page
	open_window()


func _on_open() -> void:
	set_title("📕 " + Strings.t("book"))
	_scroll.scroll_vertical = 0


func _fill() -> void:
	BookPages.achievements(self)
