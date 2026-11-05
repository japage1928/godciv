class_name GodCivEvolutionSidebar
extends PanelContainer

# Collapsible sidebar for the evolution layer, designed-UI pass
# (John, Nov 5, 2026): the top HUD stays simple — basic info
# only — and the whole evolution of tech advancements lives here.
# It is a real designed panel now: moss panel with a gold border
# and a header (title + X), the current discovery with a gold
# progress bar, the next discovery, the full tech tree as rows
# with NOW / DONE / LOCKED pills, and villager progression. It
# slides in from the right edge on a tween and collapses fully
# away when closed, so the whole screen is visible again. It
# docks BELOW the top HUD (the HUD tells it the bar's height),
# so Bless/Whisper stay visible and tappable while it is open.
# It only reads GodCivEconomy tables and the tech level/progress
# the HUD passes in — no sim rules live here. It closes via the
# X button, the Evolution button again, or a tap outside it (the
# HUD hides it when a villager card opens or an empty tap lands).
# No unicode symbols the default font may lack: state is shown
# with plain text pills (NOW / DONE / LOCKED), not glyphs.

signal closed

var _title_label: Label
var _close_button: Button
var _body_vbox: VBoxContainer
var _now_name: Label
var _now_bar: ProgressBar
var _now_pct: Label
var _now_blurb: Label
var _next_text: Label
var _discovery_marks: Array = []
var _tech_level: int = 0
var _tech_progress: int = 0
var _dock_top: float = -1.0
var _rest_left: float = -368.0
var _slide_tween: Tween = null
var _hiding: bool = false


func _ready() -> void:
	visible = false
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	add_theme_stylebox_override("panel", GodCivTheme.panel_style(false))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	add_child(column)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	column.add_child(title_row)
	_title_label = Label.new()
	_title_label.text = "Evolution"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(_title_label)
	_close_button = GodCivPhoneUI.make_close_button(get_viewport())
	_close_button.pressed.connect(hide_sidebar)
	title_row.add_child(_close_button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_body_vbox = VBoxContainer.new()
	_body_vbox.add_theme_constant_override("separation", 6)
	_body_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_body_vbox)
	_build_body()
	apply_layout()


func _header(text: String) -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	GodCivTheme.section_header(_body_vbox, text, phone, GodCivPhoneUI.small_font(vp))


func _text_label(text: String, color: Color, font_size: int, wrap: bool = true) -> Label:
	var l := Label.new()
	l.text = text
	GodCivTheme.style_label(l, font_size, color, GodCivPhoneUI.is_portrait(get_viewport()))
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_vbox.add_child(l)
	return l


func _mark_pill() -> Dictionary:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var panel := PanelContainer.new()
	var lab := Label.new()
	lab.text = "LOCKED"
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	GodCivTheme.style_label(lab, GodCivPhoneUI.small_font(vp), GodCivTheme.TEXT_MAIN, phone)
	panel.add_child(lab)
	panel.custom_minimum_size = Vector2(230 if phone else 92, 0)
	return {"panel": panel, "label": lab}


func _set_mark(mark: Dictionary, state: String) -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var bg: Color
	var fg: Color = GodCivTheme.TEXT_MAIN
	match state:
		"NOW":
			bg = GodCivTheme.GOLD_DEEP
			fg = GodCivTheme.TEXT_DARK
		"DONE":
			bg = Color(0.22, 0.45, 0.22)
		_:
			bg = Color(0.22, 0.22, 0.20)
			fg = GodCivTheme.TEXT_DIM
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(30 if phone else 14)
	s.content_margin_left = 14.0 if phone else 7.0
	s.content_margin_right = 14.0 if phone else 7.0
	s.content_margin_top = 4.0 if phone else 2.0
	s.content_margin_bottom = 4.0 if phone else 2.0
	(mark["panel"] as PanelContainer).add_theme_stylebox_override("panel", s)
	(mark["label"] as Label).text = state
	(mark["label"] as Label).add_theme_color_override("font_color", fg)


func _build_body() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var body_font: int = GodCivPhoneUI.body_font(vp)
	var small_font: int = GodCivPhoneUI.small_font(vp)
	_header("NOW")
	_now_name = _text_label("—", GodCivTheme.GOLD, GodCivPhoneUI.title_font(vp), false)
	var bar_row := HBoxContainer.new()
	bar_row.add_theme_constant_override("separation", 12 if phone else 8)
	_body_vbox.add_child(bar_row)
	_now_bar = ProgressBar.new()
	_now_bar.min_value = 0.0
	_now_bar.max_value = 100.0
	_now_bar.value = 0.0
	_now_bar.show_percentage = false
	_now_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_now_bar.custom_minimum_size = Vector2(0, 44 if phone else 22)
	GodCivTheme.style_progress_bar(_now_bar, phone)
	bar_row.add_child(_now_bar)
	_now_pct = Label.new()
	_now_pct.text = "0/0"
	GodCivTheme.style_label(_now_pct, small_font, GodCivTheme.TEXT_MAIN, phone)
	bar_row.add_child(_now_pct)
	_now_blurb = _text_label("", GodCivTheme.TEXT_DIM, small_font)
	_header("NEXT")
	_next_text = _text_label("—", GodCivTheme.TEXT_MAIN, small_font)
	_header("DISCOVERIES")
	for i in range(GodCivEconomy.DISCOVERIES.size()):
		var d: Dictionary = GodCivEconomy.DISCOVERIES[i] as Dictionary
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12 if phone else 8)
		_body_vbox.add_child(row)
		var mark := _mark_pill()
		row.add_child(mark["panel"])
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 2)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(col)
		var nm := Label.new()
		nm.text = String(d.get("name", "—"))
		GodCivTheme.style_label(nm, body_font, GodCivTheme.TEXT_MAIN, phone)
		col.add_child(nm)
		var un := Label.new()
		un.text = String(d.get("unlocks", ""))
		GodCivTheme.style_label(un, small_font, GodCivTheme.TEXT_DIM, phone)
		un.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		un.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_child(un)
		_discovery_marks.append(mark)
	_header("VILLAGERS")
	for i in range(GodCivEconomy.CLASS_NAMES.size()):
		var row2 := HBoxContainer.new()
		row2.add_theme_constant_override("separation", 12 if phone else 8)
		_body_vbox.add_child(row2)
		var nm2 := Label.new()
		nm2.text = String(GodCivEconomy.CLASS_NAMES[i])
		GodCivTheme.style_label(nm2, body_font, GodCivTheme.TEXT_MAIN, phone)
		nm2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row2.add_child(nm2)
		var vv := Label.new()
		vv.text = str(int(GodCivEconomy.CLASS_THRESHOLDS[i]))
		GodCivTheme.style_label(vv, body_font, GodCivTheme.GOLD, phone)
		row2.add_child(vv)
	var jobs_lines: Array[String] = []
	for i in range(GodCivEconomy.DISCOVERIES.size()):
		var d2: Dictionary = GodCivEconomy.DISCOVERIES[i] as Dictionary
		var jobs: Array = d2.get("jobs", [])
		if not jobs.is_empty():
			var names: Array[String] = []
			for j in jobs:
				names.append(String(j))
			jobs_lines.append("%s: %s" % [String(d2.get("name", "—")), ", ".join(names)])
	_text_label("\n".join(jobs_lines), GodCivTheme.TEXT_DIM, small_font)
	_text_label("Tools: crude to sturdy to fine to steel (sturdy needs Bronze, fine needs Iron, steel needs Steel works)", GodCivTheme.TEXT_DIM, small_font)


# Geometry + fonts for the current orientation. Called from
# _ready, from the HUD when the viewport flips, and when the HUD
# docks the panel below the top bar.
func apply_layout() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var w: float = vp.get_visible_rect().size.x
	var panel_w: float = w * 0.88 if phone else 368.0
	_rest_left = -panel_w
	offset_right = -8
	if _dock_top >= 0.0:
		# anchor_bottom must be 1 or offset_bottom=-8 puts the
		# bottom edge 8px above the TOP of the screen: negative
		# panel height, zero-height ScrollContainer, and the whole
		# body clipped invisible (only the title row showed).
		anchor_bottom = 1.0
		offset_top = _dock_top + 12
		offset_bottom = -8
	else:
		anchor_bottom = 0.0
		offset_top = -560
		offset_bottom = 560
	if visible and _slide_tween == null:
		offset_left = _rest_left
	_title_label.add_theme_font_size_override("font_size", GodCivPhoneUI.title_font(vp))
	GodCivTheme.style_label(_title_label, GodCivPhoneUI.title_font(vp), GodCivTheme.GOLD, phone)
	add_theme_stylebox_override("panel", GodCivTheme.panel_style(phone))
	GodCivPhoneUI.style_close_button(_close_button, vp)


# The HUD calls this with the top bar's height so the panel sits
# below it instead of covering Bless/Whisper.
func set_docked_top(top_y: float) -> void:
	_dock_top = top_y
	apply_layout()


func _kill_tween() -> void:
	if _slide_tween != null and _slide_tween.is_valid():
		_slide_tween.kill()
	_slide_tween = null


func show_sidebar() -> void:
	_fill()
	visible = true
	_hiding = false
	_kill_tween()
	offset_left = 8.0
	_slide_tween = create_tween()
	_slide_tween.tween_property(self, "offset_left", _rest_left, 0.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func hide_sidebar() -> void:
	if not visible:
		return
	_hiding = true
	_kill_tween()
	_slide_tween = create_tween()
	_slide_tween.tween_property(self, "offset_left", 8.0, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_slide_tween.finished.connect(_on_slide_finished)


func _on_slide_finished() -> void:
	if _hiding:
		visible = false
		closed.emit()


func toggle_sidebar() -> void:
	if visible:
		hide_sidebar()
	else:
		show_sidebar()


func is_open() -> bool:
	return visible


func set_progress(level: int, progress: int) -> void:
	if level == _tech_level and progress == _tech_progress:
		return
	_tech_level = level
	_tech_progress = progress
	if visible:
		_fill()


func _fill() -> void:
	var level: int = clampi(_tech_level, 0, GodCivEconomy.DISCOVERIES.size() - 1)
	var progress: int = _tech_progress
	var maxed: bool = level >= GodCivEconomy.DISCOVERIES.size() - 1
	var cur: Dictionary = GodCivEconomy.TECH_TIERS[level] as Dictionary
	_now_name.text = String(cur.get("name", "—"))
	if maxed:
		_now_bar.value = 100.0
		_now_pct.text = "Done"
	else:
		var need: int = int(GodCivEconomy.TECH_THRESHOLDS[level])
		_now_bar.value = 100.0 * float(progress) / float(maxi(need, 1))
		_now_pct.text = "%d/%d" % [progress, need]
		var next_tier: Dictionary = GodCivEconomy.TECH_TIERS[level + 1] as Dictionary
		_next_text.text = "%s — %s" % [String(next_tier.get("name", "—")), GodCivEconomy.unlocks_text(level + 1)]
	_now_blurb.text = String(cur.get("blurb", ""))
	if maxed:
		_next_text.text = "Every discovery made."
	for i in range(GodCivEconomy.DISCOVERIES.size()):
		var state: String = "DONE" if i < level else ("NOW" if i == level else "LOCKED")
		_set_mark(_discovery_marks[i], state)
