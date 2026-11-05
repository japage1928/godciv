class_name GodCivHud
extends CanvasLayer

# HUD, designed-UI pass (John, Nov 5, 2026): the mobile pass made
# things big enough to tap, but they still read as plain engine
# text on a translucent strip. Now the top bar is a real designed
# information bar — dark moss panel with a gold border, the
# day/season/time in one gold clock chip, every resource as its
# own pill (dim label + bright value), and real styled buttons
# (gold primary: Evolution, Bless; dark wood secondary: Save,
# Whisper). The top bar stays simple, per John's Nov 5 rule: all
# tech/discovery detail lives in the sidebar, never up top.
#
# The Evolution sidebar and villager card dock BELOW the top bar
# (they used to overlap the Whisper button), slide in from the
# right edge on a tween, and collapse fully away when closed so
# the whole screen is visible again. On a portrait phone the log
# panel hides while a side panel is open (it would sit under it).
#
# Phone portrait: the whole 1280-unit canvas is squeezed into
# ~390 CSS px, so fonts scale ~2.6x, every button is a real
# thumb target (min ~44 CSS px), and the village/economy chips
# split across two rows so they fit. Rotating the phone rebuilds
# the top bar for the new orientation. Landscape keeps the
# desktop layout.

signal save_requested
signal bless_requested
signal whisper_requested(text: String)

var _top_panel: PanelContainer
var _log_panel: PanelContainer
var _day_label: Label
var _season_label: Label
var _time_label: Label
var _phase_label: Label
var _status_label: Label
var _chip_values: Dictionary = {}
var _last_chip: Dictionary = {}
var _bless_button: Button
var _save_button: Button
var _evolution_button: Button
var _whisper_edit: LineEdit
var _log_label: Label
var _log_text: String = ""
var _villager_card: GodCivVillagerCard
var _evolution_sidebar: GodCivEvolutionSidebar
var _phone: bool = false
var _last_clock_text: String = ""
var _last_bless_text: String = ""


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
	get_viewport().size_changed.connect(_on_viewport_resized)
	call_deferred("_position_panels")


func _add_row(column: VBoxContainer) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", 16 if _phone else 10)
	column.add_child(r)
	return r


# One stat pill in a chip row. The pill stretches to fill the row
# evenly with its siblings; the value label is kept so
# update_village can rewrite it without rebuilding the row.
func _add_chip(row: HBoxContainer, key: String, label_text: String) -> void:
	var vp := get_viewport()
	var c: Dictionary = GodCivTheme.make_chip(
		row, label_text, _phone,
		36 if _phone else 14, GodCivPhoneUI.body_font(vp)
	)
	(c["panel"] as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chip_values[key] = c["value"]


func _build_top_bar() -> void:
	# Rebuilt on rotation: the old panel (and its buttons) is
	# freed, the caches reset so the next update repopulates the
	# new labels, and everything is rebuilt for the new class.
	if is_instance_valid(_top_panel):
		_top_panel.free()
	_last_clock_text = ""
	_last_bless_text = ""
	_chip_values.clear()
	_last_chip.clear()
	var vp := get_viewport()
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
	# Row 1: clock chip + status + Save + Evolution.
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
	_time_label = Label.new()
	GodCivTheme.style_label(_time_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_MAIN, _phone)
	_time_label.text = "07:41"
	clock_row.add_child(_time_label)
	_phase_label = Label.new()
	GodCivTheme.style_label(_phase_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_MAIN, _phone)
	_phase_label.text = "Day"
	clock_row.add_child(_phase_label)
	row.add_child(clock_chip)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	# The status line ("Saved.") lives in the clock row on
	# desktop. On a phone it would push the buttons off the
	# right edge when it appears, so there the Save button
	# itself flashes "Saved!" instead (see set_status).
	if _phone:
		_status_label = null
	else:
		_status_label = Label.new()
		GodCivTheme.style_label(_status_label, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_DIM, _phone)
		row.add_child(_status_label)
	_save_button = GodCivPhoneUI.big_button(vp, "Save", "secondary")
	_save_button.pressed.connect(func() -> void: save_requested.emit())
	row.add_child(_save_button)
	_evolution_button = GodCivPhoneUI.big_button(vp, "Evolution", "primary")
	_evolution_button.pressed.connect(_on_evolution_button_pressed)
	row.add_child(_evolution_button)
	# Village numbers as pills: one row on desktop, two on phone
	# so the row fits the narrow screen at phone font size.
	var vrow := _add_row(column)
	_add_chip(vrow, "pop", "POP")
	_add_chip(vrow, "food", "FOOD")
	_add_chip(vrow, "wood", "WOOD")
	_add_chip(vrow, "stone", "STONE")
	if _phone:
		vrow = _add_row(column)
	_add_chip(vrow, "ore", "ORE")
	_add_chip(vrow, "faith", "FAITH")
	_add_chip(vrow, "morale", "MORALE")
	# Economy numbers as pills: same split as the village row.
	var erow := _add_row(column)
	_add_chip(erow, "fish", "FISH")
	_add_chip(erow, "meat", "MEAT")
	_add_chip(erow, "furniture", "FURNITURE")
	_add_chip(erow, "pottery", "POTTERY")
	if _phone:
		erow = _add_row(column)
	_add_chip(erow, "ironware", "IRONWARE")
	_add_chip(erow, "wares", "WARES")
	_add_chip(erow, "fund", "FUND")
	# God bar.
	var grow := HBoxContainer.new()
	grow.add_theme_constant_override("separation", 14 if _phone else 10)
	column.add_child(grow)
	_bless_button = GodCivPhoneUI.big_button(vp, "Bless", "primary")
	_bless_button.pressed.connect(func() -> void: bless_requested.emit())
	grow.add_child(_bless_button)
	_whisper_edit = LineEdit.new()
	_whisper_edit.placeholder_text = "Whisper to the village…"
	_whisper_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	GodCivTheme.style_line_edit(_whisper_edit, _phone, GodCivPhoneUI.button_font(vp))
	_whisper_edit.custom_minimum_size = Vector2(0, GodCivPhoneUI.thumb_min(vp).y)
	grow.add_child(_whisper_edit)
	var whisper_button := GodCivPhoneUI.big_button(vp, "Whisper", "secondary")
	whisper_button.pressed.connect(_on_whisper_pressed)
	grow.add_child(whisper_button)


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


# Side panels dock below the top bar so Bless/Whisper stay
# visible and tappable while one is open. Runs deferred after
# the top bar is built and on every top-bar resize (rotation).
func _position_panels() -> void:
	if not is_instance_valid(_top_panel):
		return
	var h: float = _top_panel.size.y
	if h < 10.0:
		# Layout hasn't run yet; resized will fire again.
		return
	_evolution_sidebar.set_docked_top(h)
	_villager_card.set_docked_top(h)


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


func _on_whisper_pressed() -> void:
	whisper_requested.emit(_whisper_edit.text)
	_whisper_edit.text = ""


func update_clock(p_day: int, p_year: int, season_name: String, time_str: String, phase_name: String) -> void:
	var combined := "%d|%d|%s|%s|%s" % [p_day, p_year, season_name, time_str, phase_name]
	if combined == _last_clock_text:
		return
	_last_clock_text = combined
	_day_label.text = "Day %d · Year %d" % [p_day, p_year]
	_season_label.text = season_name
	_time_label.text = time_str
	_phase_label.text = phase_name


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


func _on_evolution_button_pressed() -> void:
	hide_villager_card()
	_evolution_sidebar.toggle_sidebar()
	_update_log_visibility()


func refresh_villager_card() -> void:
	_villager_card.refresh()


func set_bless_cooldown(remaining: float) -> void:
	var text: String = "Bless" if remaining <= 0.0 else "Bless (%ds)" % int(ceil(remaining))
	if text == _last_bless_text:
		return
	_last_bless_text = text
	_bless_button.text = text
	_bless_button.disabled = remaining > 0.0


func set_log(lines: Array) -> void:
	_log_text = "\n".join(lines)
	_log_label.text = _log_text


func set_status(text: String) -> void:
	# Desktop shows the status in the clock row; on a phone
	# that would shove the buttons off-screen, so the Save
	# button flashes the confirmation instead.
	if _phone:
		if _save_button != null:
			_save_button.text = "Saved!" if text != "" else "Save"
	elif _status_label != null:
		_status_label.text = text
