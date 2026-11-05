class_name GodCivHud
extends CanvasLayer

# HUD shell, Phase 0: one top bar showing day, season, and time, plus
# a status line (generation progress, save confirmations) and a Save
# button. Villager/leader panels and the god bar arrive in later phases.

signal save_requested

var _day_label: Label
var _season_label: Label
var _time_label: Label
var _phase_label: Label
var _status_label: Label
var _last_clock_text: String = ""


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
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	panel.add_child(row)
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


func _make_label(parent: Control, text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 20)
	label.add_theme_color_override("font_color", Color(1, 1, 1))
	parent.add_child(label)
	return label


func update_clock(p_day: int, p_year: int, season_name: String, time_str: String, phase_name: String) -> void:
	var combined := "%d|%d|%s|%s|%s" % [p_day, p_year, season_name, time_str, phase_name]
	if combined == _last_clock_text:
		return
	_last_clock_text = combined
	_day_label.text = "Day %d · Year %d" % [p_day, p_year]
	_season_label.text = season_name
	_time_label.text = time_str
	_phase_label.text = phase_name


func set_status(text: String) -> void:
	_status_label.text = text
