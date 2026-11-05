class_name GodCivHud
extends CanvasLayer

# HUD, Phase 3 fix: one top bar with four rows — the clock row (Phase 0),
# a village row (population, stockpile, faith, morale), an economy
# row (fish, meat, products, fund), and the god bar (Bless + Whisper)
# — plus a log panel at the bottom left, a villager card on the right
# when a villager is tapped, and a collapsible Evolution sidebar
# (collapsed by default). The top bar stays simple, per John's Nov 5
# rule: all tech/discovery detail lives in the sidebar, never up top.

signal save_requested
signal bless_requested
signal whisper_requested(text: String)

var _day_label: Label
var _season_label: Label
var _time_label: Label
var _phase_label: Label
var _status_label: Label
var _village_label: Label
var _economy_label: Label
var _bless_button: Button
var _evolution_button: Button
var _whisper_edit: LineEdit
var _log_label: Label
var _villager_card: GodCivVillagerCard
var _evolution_sidebar: GodCivEvolutionSidebar
var _last_clock_text: String = ""
var _last_village_text: String = ""
var _last_economy_text: String = ""
var _last_bless_text: String = ""


func _ready() -> void:
	layer = 10
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.5)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	panel.add_child(column)
	# Row 1: clock (Phase 0).
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	column.add_child(row)
	_day_label = _make_label(row, "Day 1")
	_season_label = _make_label(row, "Spring")
	_time_label = _make_label(row, "07:41")
	_phase_label = _make_label(row, "Day")
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	_status_label = _make_label(row, "")
	var save_button := Button.new()
	save_button.text = "Save"
	save_button.pressed.connect(func() -> void: save_requested.emit())
	row.add_child(save_button)
	_evolution_button = Button.new()
	_evolution_button.text = "Evolution"
	_evolution_button.pressed.connect(_on_evolution_button_pressed)
	row.add_child(_evolution_button)
	# Row 2: village numbers.
	var vrow := HBoxContainer.new()
	vrow.add_theme_constant_override("separation", 18)
	column.add_child(vrow)
	_village_label = _make_label(vrow, "Pop 0/12 · Food 0 · Wood 0 · Stone 0 · Ore 0 · Faith 0 · Morale 0")
	_village_label.add_theme_font_size_override("font_size", 17)
	# Row 3: economy numbers (Phase 2).
	var erow := HBoxContainer.new()
	erow.add_theme_constant_override("separation", 18)
	column.add_child(erow)
	_economy_label = _make_label(erow, "Fish 0 · Meat 0 · Furniture 0 · Pottery 0 · Ironware 0 · Wares 0 · Fund 20")
	_economy_label.add_theme_font_size_override("font_size", 17)
	# Row 4: god bar.
	var grow := HBoxContainer.new()
	grow.add_theme_constant_override("separation", 10)
	column.add_child(grow)
	_bless_button = Button.new()
	_bless_button.text = "Bless"
	_bless_button.pressed.connect(func() -> void: bless_requested.emit())
	grow.add_child(_bless_button)
	_whisper_edit = LineEdit.new()
	_whisper_edit.placeholder_text = "Whisper to the village…"
	_whisper_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grow.add_child(_whisper_edit)
	var whisper_button := Button.new()
	whisper_button.text = "Whisper"
	whisper_button.pressed.connect(_on_whisper_pressed)
	grow.add_child(whisper_button)
	# Log panel, bottom left. It never eats input: taps pass
	# through to the camera drag underneath.
	var log_panel := PanelContainer.new()
	log_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	log_panel.offset_left = 8
	log_panel.offset_top = -150
	log_panel.offset_right = 460
	log_panel.offset_bottom = -8
	var log_style := StyleBoxFlat.new()
	log_style.bg_color = Color(0.0, 0.0, 0.0, 0.45)
	log_style.content_margin_left = 10.0
	log_style.content_margin_right = 10.0
	log_style.content_margin_top = 6.0
	log_style.content_margin_bottom = 6.0
	log_panel.add_theme_stylebox_override("panel", log_style)
	log_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(log_panel)
	_log_label = Label.new()
	_log_label.add_theme_font_size_override("font_size", 15)
	_log_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	log_panel.add_child(_log_label)
	# Villager card, right side, hidden until a villager is tapped.
	_villager_card = GodCivVillagerCard.new()
	add_child(_villager_card)
	# Evolution sidebar, right side, collapsed by default. It holds
	# all tech/discovery detail so the top bar stays simple.
	_evolution_sidebar = GodCivEvolutionSidebar.new()
	add_child(_evolution_sidebar)


func _make_label(parent: Control, text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 20)
	label.add_theme_color_override("font_color", Color(1, 1, 1))
	parent.add_child(label)
	return label


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
	# Each row updates on its own text. Tech progress moves at dawn
	# without any village number changing, so the sidebar gets the
	# fresh tech level/progress on every stats update too.
	var combined := "Pop %d/%d · Food %d · Wood %d · Stone %d · Ore %d · Faith %d · Morale %d" % [
		int(stats.get("pop", 0)), int(stats.get("pop_cap", 0)),
		int(stats.get("food", 0)), int(stats.get("wood", 0)),
		int(stats.get("stone", 0)), int(stats.get("ore", 0)),
		int(stats.get("faith", 0)), int(stats.get("morale", 0)),
	]
	if combined != _last_village_text:
		_last_village_text = combined
		_village_label.text = combined
	var economy := "Fish %d · Meat %d · Furniture %d · Pottery %d · Ironware %d · Wares %d · Fund %d" % [
		int(stats.get("fish", 0)), int(stats.get("meat", 0)),
		int(stats.get("furniture", 0)), int(stats.get("pottery", 0)),
		int(stats.get("ironware", 0)), int(stats.get("wares", 0)),
		int(stats.get("fund", 0)),
	]
	if economy != _last_economy_text:
		_last_economy_text = economy
		_economy_label.text = economy
	_evolution_sidebar.set_progress(int(stats.get("tech_level", 0)), int(stats.get("tech_progress", 0)))
	refresh_villager_card()


func show_villager_card(v: Node, village: Node) -> void:
	_evolution_sidebar.hide_sidebar()
	_villager_card.show_card(v, village)


func hide_villager_card() -> void:
	_villager_card.hide_card()


func hide_evolution_sidebar() -> void:
	_evolution_sidebar.hide_sidebar()


func _on_evolution_button_pressed() -> void:
	hide_villager_card()
	_evolution_sidebar.toggle_sidebar()


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
	_log_label.text = "\n".join(lines)


func set_status(text: String) -> void:
	_status_label.text = text
