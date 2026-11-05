class_name GodCivHud
extends CanvasLayer

# HUD, mobile pass (John, Nov 5, 2026): one top bar — the clock
# row (Day/Season/time/phase + status + Save + Evolution),
# village numbers, economy numbers, and the god bar (Bless +
# Whisper) — plus a log panel at the bottom left, a villager
# card on the right when a villager is tapped, and a collapsible
# Evolution sidebar (collapsed by default). The top bar stays
# simple, per John's Nov 5 rule: all tech/discovery detail
# lives in the sidebar, never up top.
#
# Phone portrait: the whole 1280-unit canvas is squeezed into
# ~390 CSS px, so fonts scale ~2.6x, every button is a real
# thumb target (min ~44 CSS px), and the village/economy rows
# split across two lines so they fit. Rotating the phone
# rebuilds the top bar for the new orientation. Landscape keeps
# the desktop layout.

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
var _village_label: Label
var _village_label_b: Label
var _economy_label: Label
var _economy_label_b: Label
var _bless_button: Button
var _evolution_button: Button
var _whisper_edit: LineEdit
var _log_label: Label
var _log_text: String = ""
var _villager_card: GodCivVillagerCard
var _evolution_sidebar: GodCivEvolutionSidebar
var _phone: bool = false
var _last_clock_text: String = ""
var _last_village_text: String = ""
var _last_economy_text: String = ""
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


func _add_row(column: VBoxContainer) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", 22 if _phone else 18)
	column.add_child(r)
	return r


func _make_label(parent: Control, text: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color(1, 1, 1))
	parent.add_child(label)
	return label


func _build_top_bar() -> void:
	# Rebuilt on rotation: the old panel (and its buttons) is
	# freed, the caches reset so the next update repopulates the
	# new labels, and everything is rebuilt for the new class.
	if is_instance_valid(_top_panel):
		_top_panel.free()
	_last_clock_text = ""
	_last_village_text = ""
	_last_economy_text = ""
	_last_bless_text = ""
	var vp := get_viewport()
	_top_panel = PanelContainer.new()
	_top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.5)
	style.content_margin_left = 16.0 if _phone else 12.0
	style.content_margin_right = 16.0 if _phone else 12.0
	style.content_margin_top = 8.0 if _phone else 6.0
	style.content_margin_bottom = 8.0 if _phone else 6.0
	_top_panel.add_theme_stylebox_override("panel", style)
	add_child(_top_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4 if _phone else 2)
	_top_panel.add_child(column)
	# Row 1: clock.
	var row := _add_row(column)
	_day_label = _make_label(row, "Day 1", GodCivPhoneUI.body_font(vp))
	_season_label = _make_label(row, "Spring", GodCivPhoneUI.body_font(vp))
	_time_label = _make_label(row, "07:41", GodCivPhoneUI.body_font(vp))
	_phase_label = _make_label(row, "Day", GodCivPhoneUI.body_font(vp))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	_status_label = _make_label(row, "", GodCivPhoneUI.body_font(vp))
	var save_button := GodCivPhoneUI.big_button(vp, "Save")
	save_button.pressed.connect(func() -> void: save_requested.emit())
	row.add_child(save_button)
	_evolution_button = GodCivPhoneUI.big_button(vp, "Evolution")
	_evolution_button.pressed.connect(_on_evolution_button_pressed)
	row.add_child(_evolution_button)
	# Village numbers: one line on desktop, two on phone so the
	# line fits the narrow screen at phone font size.
	_village_label = _make_label(_add_row(column), "", GodCivPhoneUI.small_font(vp))
	if _phone:
		_village_label_b = _make_label(_add_row(column), "", GodCivPhoneUI.small_font(vp))
	else:
		_village_label_b = null
	# Economy numbers: same split as the village row.
	_economy_label = _make_label(_add_row(column), "", GodCivPhoneUI.small_font(vp))
	if _phone:
		_economy_label_b = _make_label(_add_row(column), "", GodCivPhoneUI.small_font(vp))
	else:
		_economy_label_b = null
	# God bar.
	var grow := HBoxContainer.new()
	grow.add_theme_constant_override("separation", 14 if _phone else 10)
	column.add_child(grow)
	_bless_button = GodCivPhoneUI.big_button(vp, "Bless")
	_bless_button.pressed.connect(func() -> void: bless_requested.emit())
	grow.add_child(_bless_button)
	_whisper_edit = LineEdit.new()
	_whisper_edit.placeholder_text = "Whisper to the village…"
	_whisper_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_whisper_edit.add_theme_font_size_override("font_size", GodCivPhoneUI.button_font(vp))
	_whisper_edit.custom_minimum_size = Vector2(0, GodCivPhoneUI.thumb_min(vp).y)
	grow.add_child(_whisper_edit)
	var whisper_button := GodCivPhoneUI.big_button(vp, "Whisper")
	whisper_button.pressed.connect(_on_whisper_pressed)
	grow.add_child(whisper_button)


func _build_log_panel() -> void:
	# Log panel, bottom left. It never eats input: taps pass
	# through to the camera drag underneath.
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
	var log_style := StyleBoxFlat.new()
	log_style.bg_color = Color(0.0, 0.0, 0.0, 0.45)
	log_style.content_margin_left = 10.0
	log_style.content_margin_right = 10.0
	log_style.content_margin_top = 6.0
	log_style.content_margin_bottom = 6.0
	_log_panel.add_theme_stylebox_override("panel", log_style)
	_log_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_log_panel)
	_log_label = Label.new()
	_log_label.add_theme_font_size_override("font_size", GodCivPhoneUI.log_font(get_viewport()))
	_log_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_log_label.text = _log_text
	_log_panel.add_child(_log_label)


func _on_viewport_resized() -> void:
	var now_phone: bool = GodCivPhoneUI.is_portrait(get_viewport())
	if now_phone == _phone:
		return
	_phone = now_phone
	_build_top_bar()
	_build_log_panel()
	_villager_card.apply_layout()
	_evolution_sidebar.apply_layout()


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
	var pop: int = int(stats.get("pop", 0))
	var pop_cap: int = int(stats.get("pop_cap", 0))
	var food: int = int(stats.get("food", 0))
	var wood: int = int(stats.get("wood", 0))
	var stone: int = int(stats.get("stone", 0))
	var ore: int = int(stats.get("ore", 0))
	var faith: int = int(stats.get("faith", 0))
	var morale: int = int(stats.get("morale", 0))
	var combined := "Pop %d/%d · Food %d · Wood %d · Stone %d · Ore %d · Faith %d · Morale %d" % [
		pop, pop_cap, food, wood, stone, ore, faith, morale,
	]
	if combined != _last_village_text:
		_last_village_text = combined
		if _phone:
			_village_label.text = "Pop %d/%d · Food %d · Wood %d · Stone %d" % [pop, pop_cap, food, wood, stone]
			_village_label_b.text = "Ore %d · Faith %d · Morale %d" % [ore, faith, morale]
		else:
			_village_label.text = combined
	var fish: int = int(stats.get("fish", 0))
	var meat: int = int(stats.get("meat", 0))
	var furniture: int = int(stats.get("furniture", 0))
	var pottery: int = int(stats.get("pottery", 0))
	var ironware: int = int(stats.get("ironware", 0))
	var wares: int = int(stats.get("wares", 0))
	var fund: int = int(stats.get("fund", 0))
	var economy := "Fish %d · Meat %d · Furniture %d · Pottery %d · Ironware %d · Wares %d · Fund %d" % [
		fish, meat, furniture, pottery, ironware, wares, fund,
	]
	if economy != _last_economy_text:
		_last_economy_text = economy
		if _phone:
			_economy_label.text = "Fish %d · Meat %d · Furniture %d · Pottery %d" % [fish, meat, furniture, pottery]
			_economy_label_b.text = "Ironware %d · Wares %d · Fund %d" % [ironware, wares, fund]
		else:
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
	_log_text = "\n".join(lines)
	_log_label.text = _log_text


func set_status(text: String) -> void:
	_status_label.text = text
