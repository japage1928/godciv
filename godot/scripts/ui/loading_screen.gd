class_name GodCivLoadingScreen
extends CanvasLayer

# Animated loading screen, mobile pass (John, Nov 5, 2026): the
# Godot web splash is static, so this takes over while the world
# generates — animated title, the drifting-cloud backdrop, and a
# live progress bar tied to world generation. Shown only during
# generation; hidden the moment the village is founded. The bar
# reads the generation_progress signal (0.02 at the old block,
# up to 1.0 when the last chunk lands).

var _title_label: Label
var _status_label: Label
var _bar: ProgressBar
var _t: float = 0.0
var _pct: float = 0.0
var _phase_text: String = "Shaping the land"
var _dots: int = 0
var _dot_timer: float = 0.0


func _ready() -> void:
	layer = 30
	visible = false
	var backdrop := GodCivAnimatedBackdrop.new()
	add_child(backdrop)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 28)
	center.add_child(column)
	_title_label = Label.new()
	_title_label.text = "GodCiv"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_font_size_override("font_size", 150 if GodCivPhoneUI.is_portrait(get_viewport()) else 110)
	_title_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_title_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_title_label.add_theme_constant_override("shadow_offset_x", 3)
	_title_label.add_theme_constant_override("shadow_offset_y", 3)
	column.add_child(_title_label)
	var tag := Label.new()
	tag.text = "Raising a village from nothing"
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.add_theme_font_size_override("font_size", GodCivPhoneUI.body_font(get_viewport()))
	tag.add_theme_color_override("font_color", Color(1, 1, 1))
	tag.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	tag.add_theme_constant_override("shadow_offset_x", 2)
	tag.add_theme_constant_override("shadow_offset_y", 2)
	column.add_child(tag)
	_bar = ProgressBar.new()
	_bar.min_value = 0.0
	_bar.max_value = 100.0
	_bar.value = 0.0
	_bar.show_percentage = false
	_bar.custom_minimum_size = Vector2(900, 56) if GodCivPhoneUI.is_portrait(get_viewport()) else Vector2(700, 40)
	column.add_child(_bar)
	_status_label = Label.new()
	_status_label.text = "Shaping the land… 0%"
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.add_theme_font_size_override("font_size", GodCivPhoneUI.body_font(get_viewport()))
	_status_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_status_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_status_label.add_theme_constant_override("shadow_offset_x", 2)
	_status_label.add_theme_constant_override("shadow_offset_y", 2)
	column.add_child(_status_label)


func _process(delta: float) -> void:
	if not visible:
		return
	_t += delta
	_title_label.modulate.a = 0.85 + 0.15 * sin(_t * 2.5)
	_dot_timer += delta
	if _dot_timer >= 0.4:
		_dot_timer = 0.0
		_dots = (_dots + 1) % 4
		_status_label.text = "%s%s %d%%" % [_phase_text, ".".repeat(_dots), int(_pct * 100.0)]


func show_loading() -> void:
	_pct = 0.0
	_phase_text = "Shaping the land"
	_dots = 0
	_bar.value = 0.0
	_status_label.text = "Shaping the land… 0%"
	visible = true


func set_progress(f: float) -> void:
	_pct = clampf(f, 0.0, 1.0)
	_bar.value = _pct * 100.0
	if _pct < 0.25:
		_phase_text = "Shaping the land"
	elif _pct < 0.55:
		_phase_text = "Planting forests"
	elif _pct < 0.8:
		_phase_text = "Raising the village"
	elif _pct < 1.0:
		_phase_text = "Waking the villagers"
	else:
		_phase_text = "Almost there"
	_status_label.text = "%s… %d%%" % [_phase_text, int(_pct * 100.0)]


func hide_loading() -> void:
	visible = false
