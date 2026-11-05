class_name GodCivEvolutionSidebar
extends PanelContainer

# Collapsible sidebar for the evolution layer, Phase 3 fix (John,
# Nov 5, 2026): the top HUD stays simple — basic info only — and
# the whole evolution of tech advancements lives here, collapsed
# by default, opened by one tap on the Evolution button in the top
# bar. It shows the current discovery and its progress, the next
# discovery, the full tech tree (discovered / current / locked),
# and villager progression (class ladder, jobs unlocked per
# discovery, tool tiers). It only reads GodCivEconomy tables and
# the tech level/progress the HUD passes in — no sim rules live
# here. It closes via the X button, the Evolution button again, or
# a tap outside it (the HUD hides it when a villager card opens
# or an empty tap lands). It sits on the right edge and never
# covers the whole screen.
#
# Mobile pass (John, Nov 5, 2026): on a portrait phone the panel
# is most of the screen width, text is phone-sized, and the X is
# a plain ASCII "X" on a real thumb-sized button — the old "✕"
# glyph rendered as a fallback box on some fonts and the last
# play-check could not confirm it closed anything.

var _title_label: Label
var _body_label: Label
var _close_button: Button
var _tech_level: int = 0
var _tech_progress: int = 0
var _last_text: String = ""


func _ready() -> void:
	visible = false
	set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.82)
	style.content_margin_left = 16.0
	style.content_margin_right = 16.0
	style.content_margin_top = 12.0
	style.content_margin_bottom = 12.0
	add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	add_child(column)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	column.add_child(title_row)
	_title_label = Label.new()
	_title_label.text = "Evolution"
	_title_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(_title_label)
	_close_button = GodCivPhoneUI.make_close_button(get_viewport())
	_close_button.pressed.connect(hide_sidebar)
	title_row.add_child(_close_button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_body_label = Label.new()
	_body_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_body_label)
	apply_layout()


# Geometry + fonts for the current orientation. Called from
# _ready and from the HUD when the viewport flips.
func apply_layout() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var w: float = vp.get_visible_rect().size.x
	if phone:
		offset_left = -w * 0.88
		offset_top = -560
		offset_bottom = 560
	else:
		offset_left = -368
		offset_top = -300
		offset_bottom = 300
	offset_right = -8
	_title_label.add_theme_font_size_override("font_size", GodCivPhoneUI.title_font(vp))
	_body_label.add_theme_font_size_override("font_size", 44 if phone else 16)
	GodCivPhoneUI.style_close_button(_close_button, vp)


func show_sidebar() -> void:
	_fill()
	visible = true


func hide_sidebar() -> void:
	visible = false


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
	var lines: Array[String] = []
	var maxed: bool = level >= GodCivEconomy.DISCOVERIES.size() - 1
	var cur: Dictionary = GodCivEconomy.TECH_TIERS[level] as Dictionary
	lines.append("Now: %s" % String(cur.get("name", "—")))
	if maxed:
		lines.append("Every discovery made.")
	else:
		var need: int = int(GodCivEconomy.TECH_THRESHOLDS[level])
		lines.append("Progress: %d/%d" % [progress, need])
		var next_tier: Dictionary = GodCivEconomy.TECH_TIERS[level + 1] as Dictionary
		lines.append("Next: %s — %s" % [String(next_tier.get("name", "—")), GodCivEconomy.unlocks_text(level + 1)])
	lines.append(String(cur.get("blurb", "")))
	lines.append("")
	lines.append("Discoveries:")
	for i in range(GodCivEconomy.DISCOVERIES.size()):
		var d: Dictionary = GodCivEconomy.DISCOVERIES[i] as Dictionary
		var mark: String = "✓" if i < level else ("»" if i == level else "·")
		var locked: String = "" if i <= level else " (locked)"
		lines.append("%s %s — %s%s" % [mark, String(d.get("name", "—")), String(d.get("unlocks", "")), locked])
	lines.append("")
	lines.append("Villagers:")
	var classes: Array[String] = []
	for i in range(GodCivEconomy.CLASS_NAMES.size()):
		classes.append("%s %d" % [String(GodCivEconomy.CLASS_NAMES[i]), int(GodCivEconomy.CLASS_THRESHOLDS[i])])
	lines.append("Classes (standing): " + ", ".join(classes))
	for i in range(GodCivEconomy.DISCOVERIES.size()):
		var d2: Dictionary = GodCivEconomy.DISCOVERIES[i] as Dictionary
		var jobs: Array = d2.get("jobs", [])
		if not jobs.is_empty():
			var names: Array[String] = []
			for j in jobs:
				names.append(String(j))
			lines.append("%s jobs: %s" % [String(d2.get("name", "—")), ", ".join(names)])
	lines.append("Tools: crude → sturdy → fine → steel (sturdy needs Bronze, fine needs Iron, steel needs Steel works)")
	var text: String = "\n".join(lines)
	if text == _last_text:
		return
	_last_text = text
	_body_label.text = text
