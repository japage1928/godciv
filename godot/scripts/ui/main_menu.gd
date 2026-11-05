class_name GodCivMainMenu
extends CanvasLayer

# Title screen, mobile pass (John, Nov 5, 2026): the player lands
# here on launch, NOT straight in the village. Continue (only
# when a v2 save exists), New Game, and a How to Play blurb. New
# Game with an existing save asks first — the old village is only
# erased when the player confirms. Animated backdrop, same as the
# loading screen. The clock stays paused and no sim runs until
# the player enters the game: main only starts generation after
# a menu choice, and the HUD stays hidden until the village is
# founded.

signal continue_requested
signal new_game_requested

const HOW_TO_TEXT: String = """You are the god of a small village.

Tap a villager to see their life — job, skills, family, home.
Bless the village for food and faith. Whisper, and the village remembers.
Open Evolution to see what your people have discovered and what unlocks next — nothing advanced can be built until it is discovered.
Drag to look around. Pinch or scroll to zoom.

Keep them fed, keep them faithful, and guide them from stone tools to a modern city."""

var _continue_button: Button
var _how_panel: Control
var _confirm_panel: Control
var _has_save: bool = false
var _title_label: Label
var _t: float = 0.0


func _ready() -> void:
	layer = 25
	visible = false
	var backdrop := GodCivAnimatedBackdrop.new()
	add_child(backdrop)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 28)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(column)
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	_title_label = Label.new()
	_title_label.text = "GodCiv"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_font_size_override("font_size", 170 if phone else 120)
	_title_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_title_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_title_label.add_theme_constant_override("shadow_offset_x", 4)
	_title_label.add_theme_constant_override("shadow_offset_y", 4)
	column.add_child(_title_label)
	var tag := Label.new()
	tag.text = "Raise a village. Guide its people. Watch it grow."
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tag.add_theme_font_size_override("font_size", GodCivPhoneUI.body_font(vp))
	tag.add_theme_color_override("font_color", Color(1, 1, 1))
	tag.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	tag.add_theme_constant_override("shadow_offset_x", 2)
	tag.add_theme_constant_override("shadow_offset_y", 2)
	column.add_child(tag)
	var btn_size := Vector2(560, 120) if phone else Vector2(420, 90)
	var btn_font: int = GodCivPhoneUI.button_font(vp)
	_continue_button = _menu_button("Continue", btn_size, btn_font)
	_continue_button.pressed.connect(func() -> void: continue_requested.emit())
	column.add_child(_continue_button)
	var new_button := _menu_button("New Game", btn_size, btn_font)
	new_button.pressed.connect(_on_new_game_pressed)
	column.add_child(new_button)
	var how_button := _menu_button("How to Play", btn_size, btn_font)
	how_button.pressed.connect(func() -> void: _how_panel.visible = true)
	column.add_child(how_button)
	_how_panel = _overlay_panel(func(col: VBoxContainer) -> void:
		var how_label := Label.new()
		how_label.text = HOW_TO_TEXT
		how_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		how_label.add_theme_font_size_override("font_size", 40 if phone else 22)
		how_label.add_theme_color_override("font_color", Color(1, 1, 1))
		col.add_child(how_label)
		var how_close := GodCivPhoneUI.big_button(vp, "Got it")
		how_close.pressed.connect(func() -> void: _how_panel.visible = false)
		col.add_child(how_close)
	)
	add_child(_how_panel)
	_confirm_panel = _overlay_panel(func(col: VBoxContainer) -> void:
		var confirm_label := Label.new()
		confirm_label.text = "A saved village already exists.\nStart a new village and erase the old one?"
		confirm_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		confirm_label.add_theme_font_size_override("font_size", 44 if phone else 24)
		confirm_label.add_theme_color_override("font_color", Color(1, 1, 1))
		col.add_child(confirm_label)
		var yes_button := GodCivPhoneUI.big_button(vp, "Yes, start over")
		yes_button.pressed.connect(func() -> void: new_game_requested.emit())
		col.add_child(yes_button)
		var no_button := GodCivPhoneUI.big_button(vp, "No, keep my village")
		no_button.pressed.connect(func() -> void: _confirm_panel.visible = false)
		col.add_child(no_button)
	)
	add_child(_confirm_panel)


func _process(delta: float) -> void:
	if not visible:
		return
	_t += delta
	_title_label.modulate.a = 0.85 + 0.15 * sin(_t * 2.0)


func _menu_button(text: String, min_size: Vector2, font_size: int) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", font_size)
	return b


# A centered dimmed overlay holding one panel, hidden by default.
# The build callable fills the panel's column with labels/buttons.
func _overlay_panel(build: Callable) -> Control:
	var overlay := Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.08, 0.1, 0.95)
	style.content_margin_left = 28.0
	style.content_margin_right = 28.0
	style.content_margin_top = 24.0
	style.content_margin_bottom = 24.0
	panel.add_theme_stylebox_override("panel", style)
	var w: float = get_viewport().get_visible_rect().size.x
	panel.custom_minimum_size = Vector2(minf(w * 0.88, 900.0), 0)
	center.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 24)
	panel.add_child(column)
	build.call(column)
	return overlay


func show_menu(has_save: bool) -> void:
	_has_save = has_save
	_continue_button.visible = has_save
	_continue_button.disabled = not has_save
	_how_panel.visible = false
	_confirm_panel.visible = false
	visible = true


func hide_menu() -> void:
	visible = false


func _on_new_game_pressed() -> void:
	if _has_save:
		_confirm_panel.visible = true
	else:
		new_game_requested.emit()
