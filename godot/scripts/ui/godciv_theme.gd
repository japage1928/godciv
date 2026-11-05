class_name GodCivTheme
extends RefCounted

# Shared visual language for every UI surface, designed-UI pass
# (John, Nov 5, 2026): the mobile pass made things big enough to
# tap, but they still read as plain engine text on a translucent
# strip. Everything now shares one look — dark moss-green panels
# with a gold border (the sun and the dirt path from the animated
# backdrop), warm parchment text, gold for the important numbers,
# real buttons with normal/hover/pressed states. All helpers take
# an explicit `phone` bool (callers read it from
# GodCivPhoneUI.is_portrait) so the theme itself never depends
# on the sizing helper and there is no circular reference.
#
# No unicode symbols the default font may lack: no check marks,
# arrows, or fancy glyphs in styled text — colour, panels, and
# plain ASCII do the work. The one exception is "·" (middle dot),
# already used in HUD text since Phase 2 and verified rendering.

# --- Palette (fits the backdrop: blue sky, green hills, gold sun) ---
const PANEL_BG := Color(0.09, 0.12, 0.08, 0.93)
const PANEL_BG_SOLID := Color(0.09, 0.12, 0.08, 1.0)
const PANEL_BG_SOFT := Color(0.14, 0.18, 0.11, 0.90)
const CHIP_BG := Color(0.0, 0.0, 0.0, 0.38)
const BORDER_GOLD := Color(0.85, 0.68, 0.32)
const BORDER_GOLD_DIM := Color(0.55, 0.45, 0.22)
const GOLD := Color(0.95, 0.78, 0.38)
const GOLD_DEEP := Color(0.78, 0.58, 0.18)
const TEXT_MAIN := Color(0.97, 0.95, 0.88)
const TEXT_DIM := Color(0.72, 0.68, 0.55)
const TEXT_DARK := Color(0.14, 0.09, 0.03)
const BTN_PRIMARY_BG := Color(0.83, 0.63, 0.20)
const BTN_PRIMARY_HOVER := Color(0.92, 0.72, 0.28)
const BTN_PRIMARY_PRESSED := Color(0.66, 0.48, 0.14)
const BTN_SECONDARY_BG := Color(0.30, 0.22, 0.13)
const BTN_SECONDARY_HOVER := Color(0.40, 0.30, 0.18)
const BTN_SECONDARY_PRESSED := Color(0.22, 0.16, 0.09)
const BTN_CLOSE_BG := Color(0.52, 0.18, 0.12)
const BTN_CLOSE_HOVER := Color(0.65, 0.24, 0.16)
const BTN_CLOSE_PRESSED := Color(0.40, 0.13, 0.09)
const BTN_DISABLED_BG := Color(0.25, 0.25, 0.23)
const BAR_BG := Color(0.0, 0.0, 0.0, 0.55)
const SHADOW := Color(0, 0, 0, 0.45)
const TEXT_SHADOW := Color(0, 0, 0, 0.65)


static func radius(phone: bool) -> int:
	return 20 if phone else 9


static func border_width(phone: bool) -> int:
	return 4 if phone else 2


static func _flat(bg: Color, border: Color, bw: int, r: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(r)
	return s


# Main panel: dark moss, gold border, soft drop shadow.
# round_top=false leaves the top edge square (top HUD bar).
static func panel_style(phone: bool, bg: Color = PANEL_BG, round_top: bool = true) -> StyleBoxFlat:
	var s := _flat(bg, BORDER_GOLD, border_width(phone), radius(phone))
	if not round_top:
		s.corner_radius_top_left = 0
		s.corner_radius_top_right = 0
	s.content_margin_left = 24.0 if phone else 14.0
	s.content_margin_right = 24.0 if phone else 14.0
	s.content_margin_top = 16.0 if phone else 10.0
	s.content_margin_bottom = 16.0 if phone else 10.0
	s.shadow_color = SHADOW
	s.shadow_size = 6 if phone else 3
	s.shadow_offset = Vector2(0, 3) if phone else Vector2(0, 2)
	return s


# Small stat pill: dark translucent, thin gold border, big radius.
static func chip_style(phone: bool) -> StyleBoxFlat:
	var s := _flat(CHIP_BG, BORDER_GOLD_DIM, border_width(phone), 40 if phone else 18)
	s.content_margin_left = 16.0 if phone else 9.0
	s.content_margin_right = 16.0 if phone else 9.0
	s.content_margin_top = 6.0 if phone else 3.0
	s.content_margin_bottom = 6.0 if phone else 3.0
	return s


# A stat chip: dim small-caps label + bright value, in a pill.
# Returns {"panel": PanelContainer, "value": Label}.
static func make_chip(parent: Control, label_text: String, phone: bool, label_size: int, value_size: int) -> Dictionary:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", chip_style(phone))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10 if phone else 6)
	panel.add_child(row)
	var lab := Label.new()
	lab.text = label_text
	lab.add_theme_font_size_override("font_size", label_size)
	lab.add_theme_color_override("font_color", TEXT_DIM)
	lab.add_theme_color_override("font_shadow_color", TEXT_SHADOW)
	lab.add_theme_constant_override("shadow_offset_x", 2 if phone else 1)
	lab.add_theme_constant_override("shadow_offset_y", 2 if phone else 1)
	row.add_child(lab)
	var val := Label.new()
	val.text = "—"
	val.add_theme_font_size_override("font_size", value_size)
	val.add_theme_color_override("font_color", TEXT_MAIN)
	val.add_theme_color_override("font_shadow_color", TEXT_SHADOW)
	val.add_theme_constant_override("shadow_offset_x", 2 if phone else 1)
	val.add_theme_constant_override("shadow_offset_y", 2 if phone else 1)
	row.add_child(val)
	parent.add_child(panel)
	return {"panel": panel, "value": val}


# --- Buttons ---
# kind: "primary" (gold — Evolution, Bless, New Game, Continue),
# "secondary" (dark wood — Save, Whisper, How to Play, Got it),
# "close" (dark red — the X).
static func _button_box(phone: bool, kind: String, state: String) -> StyleBoxFlat:
	var bg: Color
	var border: Color = BORDER_GOLD
	match kind:
		"primary":
			match state:
				"hover":
					bg = BTN_PRIMARY_HOVER
				"pressed":
					bg = BTN_PRIMARY_PRESSED
				"disabled":
					bg = BTN_DISABLED_BG
				_:
					bg = BTN_PRIMARY_BG
			border = GOLD_DEEP
		"close":
			match state:
				"hover":
					bg = BTN_CLOSE_HOVER
				"pressed":
					bg = BTN_CLOSE_PRESSED
				"disabled":
					bg = BTN_DISABLED_BG
				_:
					bg = BTN_CLOSE_BG
			border = Color(0.85, 0.45, 0.35)
		_:
			match state:
				"hover":
					bg = BTN_SECONDARY_HOVER
				"pressed":
					bg = BTN_SECONDARY_PRESSED
				"disabled":
					bg = BTN_DISABLED_BG
				_:
					bg = BTN_SECONDARY_BG
			border = BORDER_GOLD_DIM
	var s := _flat(bg, border, border_width(phone), radius(phone))
	s.content_margin_left = 18.0 if phone else 10.0
	s.content_margin_right = 18.0 if phone else 10.0
	s.content_margin_top = 10.0 if phone else 6.0
	s.content_margin_bottom = 10.0 if phone else 6.0
	s.shadow_color = SHADOW
	s.shadow_size = 5 if phone else 2
	s.shadow_offset = Vector2(0, 2) if phone else Vector2(0, 1)
	return s


static func style_button(b: Button, phone: bool, kind: String = "secondary") -> void:
	b.add_theme_stylebox_override("normal", _button_box(phone, kind, "normal"))
	b.add_theme_stylebox_override("hover", _button_box(phone, kind, "hover"))
	b.add_theme_stylebox_override("pressed", _button_box(phone, kind, "pressed"))
	b.add_theme_stylebox_override("disabled", _button_box(phone, kind, "disabled"))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var font_col: Color = TEXT_DARK if kind == "primary" else TEXT_MAIN
	b.add_theme_color_override("font_color", font_col)
	b.add_theme_color_override("font_hover_color", font_col)
	b.add_theme_color_override("font_pressed_color", font_col)
	b.add_theme_color_override("font_disabled_color", TEXT_DIM)
	b.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.0))
	b.focus_mode = Control.FOCUS_NONE


# --- Labels ---
static func style_label(l: Label, font_size: int, color: Color, phone: bool) -> void:
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", TEXT_SHADOW)
	l.add_theme_constant_override("shadow_offset_x", 2 if phone else 1)
	l.add_theme_constant_override("shadow_offset_y", 2 if phone else 1)


# Gold section header inside a panel ("NOW", "DISCOVERIES", ...).
static func section_header(parent: Control, text: String, phone: bool, font_size: int) -> Label:
	var l := Label.new()
	l.text = text
	style_label(l, font_size, GOLD, phone)
	parent.add_child(l)
	return l


# --- LineEdit (Whisper field) ---
static func style_line_edit(e: LineEdit, phone: bool, font_size: int) -> void:
	var bg := _flat(Color(0.0, 0.0, 0.0, 0.5), BORDER_GOLD_DIM, border_width(phone), radius(phone))
	bg.content_margin_left = 16.0 if phone else 9.0
	bg.content_margin_right = 16.0 if phone else 9.0
	bg.content_margin_top = 8.0 if phone else 4.0
	bg.content_margin_bottom = 8.0 if phone else 4.0
	e.add_theme_stylebox_override("normal", bg)
	e.add_theme_stylebox_override("focus", _flat(Color(0.0, 0.0, 0.0, 0.6), BORDER_GOLD, border_width(phone), radius(phone)))
	e.add_theme_font_size_override("font_size", font_size)
	e.add_theme_color_override("font_color", TEXT_MAIN)
	e.add_theme_color_override("font_placeholder_color", TEXT_DIM)


# --- ProgressBar (tech progress, loading) ---
static func style_progress_bar(bar: ProgressBar, phone: bool) -> void:
	var bg := _flat(BAR_BG, BORDER_GOLD_DIM, border_width(phone), 40 if phone else 18)
	bar.add_theme_stylebox_override("background", bg)
	var fill := _flat(GOLD, GOLD_DEEP, 0, 40 if phone else 18)
	bar.add_theme_stylebox_override("fill", fill)
