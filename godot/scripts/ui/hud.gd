class_name GodCivHud
extends CanvasLayer

# HUD, designed-UI pass (John, Nov 5, 2026): the mobile pass made
# things big enough to tap, but they still read as plain engine
# text on a translucent strip. Now the top bar is a real designed
# information bar — dark moss panel with a gold border, the
# day/season/time in one gold clock chip, every resource as its
# own pill (dim label + bright value), and real styled buttons
# (dark wood secondary: Save). The top bar stays simple, per John's Nov 5 rule: all
# tech/discovery detail lives in the sidebar, never up top.
#
# Single-line bar (John, Nov 5, 2026): the info line is ONE
# horizontal line — day, year, season, time, phase, population
# and every resource, never two rows. The resource pills ride in
# a horizontal scroll container, so on a narrow phone the line
# scrolls sideways instead of wrapping. The old SPEED row of
# buttons is gone: the TIME itself is a tappable chip, and
# tapping it opens a dropdown (Pause / 1x / 2x / 4x) hanging
# below the bar. Picking a speed applies it and closes the
# dropdown; tapping the time again or anywhere else closes it
# without changing speed. While paused, the phase label reads
# "Paused". The Save button lives on a slim action row beneath
# the info line. (John, Nov 5, 2026: Bless, Whisper and Evolution
# were removed from the HUD — the god-action logic and the
# Evolution sidebar code stay in the codebase, just not surfaced.)
#
# The Evolution sidebar and villager card dock BELOW the top bar,
# slide in from the right edge on a tween, and collapse fully away
# when closed so the whole screen is visible again. On a portrait
# phone the log panel hides while a side panel is open (it would
# sit under it).
#
# Phone portrait: the whole 1280-unit canvas is squeezed into
# ~390 CSS px, so fonts scale ~2.6x, every button is a real
# thumb target (min ~44 CSS px). Rotating the phone rebuilds
# the top bar for the new orientation. Landscape keeps the
# desktop layout.

signal save_requested
# God-action signals: kept so main.gd's wiring and the village
# bless/whisper logic stay intact. Nothing in the HUD emits them
# anymore (John removed the Bless/Whisper buttons, Nov 5, 2026).
signal bless_requested
signal whisper_requested(text: String)
signal time_control_requested(speed: float, paused: bool)

# Time speeds: 1x is the clock's default 3.0 sim-seconds per real
# second; 2x / 4x are multiples of it. Pause is not a speed, it
# sets clock.paused.
const SPEED_1X: float = 3.0
const SPEED_2X: float = 6.0
const SPEED_4X: float = 12.0

var _top_panel: PanelContainer
var _log_panel: PanelContainer
var _day_label: Label
var _season_label: Label
var _time_button: Button
var _phase_label: Label
var _status_label: Label
var _chip_values: Dictionary = {}
var _last_chip: Dictionary = {}
var _save_button: Button
var _log_label: Label
var _log_text: String = ""
var _villager_card: GodCivVillagerCard
var _evolution_sidebar: GodCivEvolutionSidebar
var _phone: bool = false
var _last_clock_text: String = ""
var _speed: float = SPEED_1X
var _paused: bool = false
var _speed_buttons: Dictionary = {}
var _speed_dropdown: PanelContainer
var _speed_overlay: Control
var _info_scroll: ScrollContainer
var _info_chip_row: HBoxContainer


func _ready() -> void:
	layer = 10
	_phone = GodCivPhoneUI.is_portrait(get_viewport())
	_build_top_bar()
	_build_log_panel()
	# Villager card, right side, hidden until a villager is tapped.
	_villager_card = GodCivVillagerCard.new()
	add_child(_villager_card)
	# Evolution sidebar, right side, collapsed by default. It holds
	# all tech/discovery detail so the top bar stays simple.
	_evolution_sidebar = GodCivEvolutionSidebar.new()
	add_child(_evolution_sidebar)
	# When a panel finishes sliding closed, the phone log may
	# need to come back (see _update_log_visibility).
	_evolution_sidebar.closed.connect(_update_log_visibility)
	_villager_card.closed.connect(_update_log_visibility)
	get_viewport().size_changed.connect(_on_viewport_resized)
	call_deferred("_position_panels")


func _add_row(column: VBoxContainer) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", 16 if _phone else 10)
	column.add_child(r)
	return r


# One stat pill in a chip row. The pill sizes to its content
# (the info line scrolls sideways instead of stretching pills
# to fill); the value label is kept so update_village can
# rewrite it without rebuilding the row.
func _add_chip(row: HBoxContainer, key: String, label_text: String) -> void:
	var vp := get_viewport()
	var c: Dictionary = GodCivTheme.make_chip(
		row, label_text, _phone,
		36 if _phone else 14, GodCivPhoneUI.body_font(vp)
	)
	_chip_values[key] = c["value"]


func _build_top_bar() -> void:
	# Rebuilt on rotation: the old panel (and its buttons) is
	# freed, the caches reset so the next update repopulates the
	# new labels, and everything is rebuilt for the new class.
	if is_instance_valid(_top_panel):
		_top_panel.free()
	if is_instance_valid(_speed_dropdown):
		_speed_dropdown.free()
	if is_instance_valid(_speed_overlay):
		_speed_overlay.free()
	_last_clock_text = ""
	_chip_values.clear()
	_last_chip.clear()
	_speed_buttons.clear()
	_speed_dropdown = null
	_speed_overlay = null
	var vp := get_viewport()
	# Invisible full-screen catcher, BELOW the top bar in draw
	# order: while the speed dropdown is open, any tap outside
	# it (or the bar) closes the dropdown without changing
	# speed. It never blocks the bar itself (built after it) or
	# the side panels (built after the bar).
	_speed_overlay = Control.new()
	_speed_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_speed_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_speed_overlay.visible = false
	_speed_overlay.gui_input.connect(_on_speed_overlay_input)
	add_child(_speed_overlay)
	_top_panel = PanelContainer.new()
	_top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_top_panel.add_theme_stylebox_override(
		"panel", GodCivTheme.panel_style(_phone, GodCivTheme.PANEL_BG, false)
	)
	_top_panel.resized.connect(_position_panels)
	add_child(_top_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10 if _phone else 6)
	_top_panel.add_child(column)
	# Row 1 — the ONE info line (John, Nov 5, 2026): day, year,
	# season, time, phase, population and every resource, all on
	# a single horizontal line. The chips ride in a horizontal
	# scroll container, so on a narrow phone the line scrolls
	# sideways instead of wrapping to a second row.
	var row := _add_row(column)
	var clock_chip := PanelContainer.new()
	clock_chip.add_theme_stylebox_override("panel", GodCivTheme.chip_style(_phone))
	var clock_row := HBoxContainer.new()
	clock_row.add_theme_constant_override("separation", 14 if _phone else 8)
	clock_chip.add_child(clock_row)
	_day_label = Label.new()
	GodCivTheme.style_label(_day_label, GodCivPhoneUI.body_font(vp), GodCivTheme.GOLD, _phone)
	_day_label.text = "Day 1 · Year 1"
	clock_row.add_child(_day_label)
	var sep := Label.new()
	GodCivTheme.style_label(sep, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_DIM, _phone)
	sep.text = "·"
	clock_row.add_child(sep)
	_season_label = Label.new()
	GodCivTheme.style_label(_season_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_MAIN, _phone)
	_season_label.text = "Spring"
	clock_row.add_child(_season_label)
	# The time is a tappable chip: tapping it opens the speed
	# dropdown (Pause / 1x / 2x / 4x). A flat button reads as
	# plain text but takes taps; the trailing "v" marks it as a
	# dropdown. (No unicode arrow: the default font may lack it.)
	_time_button = Button.new()
	_time_button.name = "TimeChip"
	_time_button.flat = true
	_time_button.focus_mode = Control.FOCUS_NONE
	_time_button.add_theme_font_size_override("font_size", GodCivPhoneUI.body_font(vp))
	_time_button.add_theme_color_override("font_color", GodCivTheme.TEXT_MAIN)
	_time_button.add_theme_color_override("font_hover_color", GodCivTheme.GOLD)
	_time_button.add_theme_color_override("font_pressed_color", GodCivTheme.GOLD)
	_time_button.add_theme_color_override("font_shadow_color", GodCivTheme.TEXT_SHADOW)
	_time_button.add_theme_constant_override("shadow_offset_x", 2 if _phone else 1)
	_time_button.add_theme_constant_override("shadow_offset_y", 2 if _phone else 1)
	_time_button.text = "07:41 v"
	_time_button.pressed.connect(_toggle_speed_dropdown)
	clock_row.add_child(_time_button)
	_phase_label = Label.new()
	GodCivTheme.style_label(_phase_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_MAIN, _phone)
	_phase_label.text = "Day"
	clock_row.add_child(_phase_label)
	row.add_child(clock_chip)
	_info_scroll = ScrollContainer.new()
	_info_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_info_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_info_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_info_scroll.follow_focus = false
	row.add_child(_info_scroll)
	_info_chip_row = HBoxContainer.new()
	_info_chip_row.add_theme_constant_override("separation", 10 if _phone else 8)
	_info_scroll.add_child(_info_chip_row)
	_add_chip(_info_chip_row, "pop", "POP")
	_add_chip(_info_chip_row, "food", "FOOD")
	_add_chip(_info_chip_row, "wood", "WOOD")
	_add_chip(_info_chip_row, "stone", "STONE")
	_add_chip(_info_chip_row, "ore", "ORE")
	_add_chip(_info_chip_row, "faith", "FAITH")
	_add_chip(_info_chip_row, "morale", "MORALE")
	_add_chip(_info_chip_row, "fish", "FISH")
	_add_chip(_info_chip_row, "meat", "MEAT")
	_add_chip(_info_chip_row, "furniture", "FURNITURE")
	_add_chip(_info_chip_row, "pottery", "POTTERY")
	_add_chip(_info_chip_row, "ironware", "IRONWARE")
	_add_chip(_info_chip_row, "wares", "WARES")
	_add_chip(_info_chip_row, "fund", "FUND")
	# The status line ("Saved.") lives at the right end of the
	# info line on desktop. On a phone it would push the chips
	# off the edge, so there the Save button itself flashes
	# "Saved!" instead (see set_status).
	if _phone:
		_status_label = null
	else:
		_status_label = Label.new()
		GodCivTheme.style_label(_status_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_DIM, _phone)
		row.add_child(_status_label)
	# Row 2 — the slim action row, Save only. (John, Nov 5,
	# 2026: Bless, Whisper and Evolution were removed from the
	# HUD — the god-action logic and the Evolution sidebar code
	# stay in the codebase, just not surfaced here.)
	var arow := _add_row(column)
	_save_button = GodCivPhoneUI.big_button(vp, "Save", "secondary")
	_save_button.pressed.connect(_on_save_button_pressed)
	arow.add_child(_save_button)
	# Speed dropdown: a small panel that hangs below the top
	# bar, opened by tapping the time chip. Same four options
	# as the old SPEED row (Pause / 1x / 2x / 4x), same gold
	# selected state; picking one applies it and closes the
	# dropdown. Hidden until opened; positioned by
	# _position_panels once the bar has laid out.
	_speed_dropdown = PanelContainer.new()
	_speed_dropdown.name = "SpeedDropdown"
	_speed_dropdown.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_speed_dropdown.add_theme_stylebox_override(
		"panel", GodCivTheme.panel_style(_phone, GodCivTheme.PANEL_BG_SOLID)
	)
	_speed_dropdown.visible = false
	add_child(_speed_dropdown)
	var drop_col := VBoxContainer.new()
	drop_col.add_theme_constant_override("separation", 8 if _phone else 6)
	_speed_dropdown.add_child(drop_col)
	var speed_group := ButtonGroup.new()
	_add_speed_button(drop_col, speed_group, "Pause", "pause")
	_add_speed_button(drop_col, speed_group, "1x", "1x")
	_add_speed_button(drop_col, speed_group, "2x", "2x")
	_add_speed_button(drop_col, speed_group, "4x", "4x")
	_apply_speed_states()
	_speed_dropdown.reset_size()
	_position_panels()


func _build_log_panel() -> void:
	# Log panel, bottom left. It never eats input: taps pass
	# through to the camera drag underneath. On a portrait phone
	# it hides while a side panel is open (see
	# _update_log_visibility) so it never sits under one.
	if is_instance_valid(_log_panel):
		_log_panel.free()
	_log_panel = PanelContainer.new()
	_log_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	var vw: float = get_viewport().get_visible_rect().size.x
	if _phone:
		_log_panel.offset_left = 8
		_log_panel.offset_top = -460
		_log_panel.offset_right = vw * 0.94
		_log_panel.offset_bottom = -8
	else:
		_log_panel.offset_left = 8
		_log_panel.offset_top = -150
		_log_panel.offset_right = 460
		_log_panel.offset_bottom = -8
	var log_style := GodCivTheme.panel_style(_phone)
	log_style.bg_color = Color(0.05, 0.07, 0.05, 0.55)
	log_style.border_color = GodCivTheme.BORDER_GOLD_DIM
	_log_panel.add_theme_stylebox_override("panel", log_style)
	_log_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_log_panel)
	_log_label = Label.new()
	_log_label.add_theme_font_size_override("font_size", GodCivPhoneUI.log_font(get_viewport()))
	_log_label.add_theme_color_override("font_color", GodCivTheme.TEXT_MAIN)
	_log_label.add_theme_color_override("font_shadow_color", GodCivTheme.TEXT_SHADOW)
	_log_label.add_theme_constant_override("shadow_offset_x", 1)
	_log_label.add_theme_constant_override("shadow_offset_y", 1)
	_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_log_label.text = _log_text
	_log_panel.add_child(_log_label)


# Side panels dock below the top bar. Runs deferred after
# the top bar is built and on every top-bar resize (rotation).
# The speed dropdown hangs below the bar too, at its left edge
# under the time chip.
func _position_panels() -> void:
	if not is_instance_valid(_top_panel):
		return
	var h: float = _top_panel.size.y
	if h < 10.0:
		# Layout hasn't run yet; resized will fire again.
		return
	# _build_top_bar runs before the panels are created, and its
	# resized signal can fire during layout — guard the nils so
	# the early call is a no-op; the deferred call at the end of
	# _ready docks them once they exist.
	if is_instance_valid(_evolution_sidebar):
		_evolution_sidebar.set_docked_top(h)
	if is_instance_valid(_villager_card):
		_villager_card.set_docked_top(h)
	if is_instance_valid(_speed_dropdown):
		_speed_dropdown.position = Vector2(8, h + 4)


func _update_log_visibility() -> void:
	if not is_instance_valid(_log_panel):
		return
	var panel_open: bool = _evolution_sidebar.is_open() or _villager_card.is_open()
	_log_panel.visible = not (_phone and panel_open)


func _on_viewport_resized() -> void:
	var now_phone: bool = GodCivPhoneUI.is_portrait(get_viewport())
	if now_phone == _phone:
		return
	_phone = now_phone
	_build_top_bar()
	_build_log_panel()
	_villager_card.apply_layout()
	_evolution_sidebar.apply_layout()
	call_deferred("_position_panels")


# Speed dropdown: tapping the time chip toggles it; picking an
# option applies it and closes; tapping the time again or
# anywhere outside closes it without changing speed.
func _toggle_speed_dropdown() -> void:
	if is_instance_valid(_speed_dropdown) and _speed_dropdown.visible:
		_close_speed_dropdown()
	else:
		_open_speed_dropdown()


func _open_speed_dropdown() -> void:
	if not is_instance_valid(_speed_dropdown):
		return
	_apply_speed_states()
	_speed_dropdown.visible = true
	_speed_overlay.visible = true


func _close_speed_dropdown() -> void:
	if is_instance_valid(_speed_dropdown):
		_speed_dropdown.visible = false
	if is_instance_valid(_speed_overlay):
		_speed_overlay.visible = false


func _on_speed_overlay_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			_close_speed_dropdown()


func _on_save_button_pressed() -> void:
	_close_speed_dropdown()
	save_requested.emit()


func update_clock(p_day: int, p_year: int, season_name: String, time_str: String, phase_name: String) -> void:
	# The paused state is part of the key: pausing freezes the
	# clock text, so without it the "Paused" phase label would
	# never refresh.
	var combined := "%d|%d|%s|%s|%s|%s" % [p_day, p_year, season_name, time_str, phase_name, "P" if _paused else ""]
	if combined == _last_clock_text:
		return
	_last_clock_text = combined
	_day_label.text = "Day %d · Year %d" % [p_day, p_year]
	_season_label.text = season_name
	_time_button.text = "%s v" % time_str
	_phase_label.text = "Paused" if _paused else phase_name


func update_village(stats: Dictionary) -> void:
	# Each chip updates on its own value. Tech progress moves at
	# dawn without any village number changing, so the sidebar
	# gets the fresh tech level/progress on every stats update too.
	var values := {
		"pop": "%d/%d" % [int(stats.get("pop", 0)), int(stats.get("pop_cap", 0))],
		"food": str(int(stats.get("food", 0))),
		"wood": str(int(stats.get("wood", 0))),
		"stone": str(int(stats.get("stone", 0))),
		"ore": str(int(stats.get("ore", 0))),
		"faith": str(int(stats.get("faith", 0))),
		"morale": str(int(stats.get("morale", 0))),
		"fish": str(int(stats.get("fish", 0))),
		"meat": str(int(stats.get("meat", 0))),
		"furniture": str(int(stats.get("furniture", 0))),
		"pottery": str(int(stats.get("pottery", 0))),
		"ironware": str(int(stats.get("ironware", 0))),
		"wares": str(int(stats.get("wares", 0))),
		"fund": str(int(stats.get("fund", 0))),
	}
	for k in values:
		if String(_last_chip.get(k, "")) != String(values[k]):
			_last_chip[k] = values[k]
			var lab: Label = _chip_values.get(k)
			if lab != null:
				lab.text = String(values[k])
	_evolution_sidebar.set_progress(int(stats.get("tech_level", 0)), int(stats.get("tech_progress", 0)))
	refresh_villager_card()


func show_villager_card(v: Node, village: Node) -> void:
	_evolution_sidebar.hide_sidebar()
	_villager_card.show_card(v, village)
	_update_log_visibility()


func hide_villager_card() -> void:
	_villager_card.hide_card()
	_update_log_visibility()


func hide_evolution_sidebar() -> void:
	_evolution_sidebar.hide_sidebar()
	_update_log_visibility()


func _add_speed_button(parent: Container, group: ButtonGroup, label: String, key: String) -> void:
	var b := GodCivPhoneUI.big_button(get_viewport(), label, "secondary")
	GodCivTheme.style_speed_button(b, _phone)
	b.toggle_mode = true
	b.button_group = group
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if key == "pause":
		b.pressed.connect(_on_pause_button)
	else:
		var s: float = SPEED_1X
		if key == "2x":
			s = SPEED_2X
		elif key == "4x":
			s = SPEED_4X
		b.pressed.connect(func() -> void: _on_speed_button(s))
	parent.add_child(b)
	_speed_buttons[key] = b


func _apply_speed_states() -> void:
	if _speed_buttons.is_empty():
		return
	(_speed_buttons["pause"] as Button).button_pressed = _paused
	(_speed_buttons["1x"] as Button).button_pressed = not _paused and _speed == SPEED_1X
	(_speed_buttons["2x"] as Button).button_pressed = not _paused and _speed == SPEED_2X
	(_speed_buttons["4x"] as Button).button_pressed = not _paused and _speed == SPEED_4X


# Called by main after generation/loading so the buttons show
# the clock's real state (a save may hold 2x or 4x).
func set_speed_state(speed: float, paused: bool) -> void:
	_speed = speed
	_paused = paused
	_apply_speed_states()


func _on_pause_button() -> void:
	_paused = true
	_apply_speed_states()
	_close_speed_dropdown()
	time_control_requested.emit(_speed, true)


func _on_speed_button(s: float) -> void:
	_speed = s
	_paused = false
	_apply_speed_states()
	_close_speed_dropdown()
	time_control_requested.emit(s, false)


func refresh_villager_card() -> void:
	_villager_card.refresh()


# Kept as a no-op so main.gd's per-update call still works: the
# Bless button it used to drive is gone (John, Nov 5, 2026), but
# the village bless logic itself is untouched.
func set_bless_cooldown(_remaining: float) -> void:
	pass


func set_log(lines: Array) -> void:
	_log_text = "\n".join(lines)
	_log_label.text = _log_text


func set_status(text: String) -> void:
	# Desktop shows the status at the right end of the info
	# line; on a phone that would shove the chips off-screen,
	# so the Save button flashes the confirmation instead.
	if _phone:
		if _save_button != null:
			_save_button.text = "Saved!" if text != "" else "Save"
	elif _status_label != null:
		_status_label.text = text
