class_name GodCivVillagerCard
extends PanelContainer

# Read-only villager card, Phase 2. Tapping a villager shows name,
# household and home, job, traits, skills, age, tool, education,
# class, coins, goods, and household members. No god actions per
# villager; the god bar stays as it is. The design doc's
# deliberation/intent fields are model work and are NOT in this
# card: no LLM anywhere in the rebuild.

var _title_label: Label
var _body_label: Label
var _close_button: Button
var _villager: Node = null
var _village: Node = null


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
	_title_label.add_theme_color_override("font_color", Color(1, 1, 1))
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(_title_label)
	_close_button = GodCivPhoneUI.make_close_button(get_viewport())
	_close_button.pressed.connect(hide_card)
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
# _ready and from the HUD when the viewport flips. Mobile pass
# (John, Nov 5, 2026): on a portrait phone the card is most of
# the screen width with phone-sized text, and the X is a plain
# ASCII "X" on a real thumb-sized button — the old "✕" glyph
# rendered as a fallback box on some fonts and the last
# play-check could not confirm it closed anything.
func apply_layout() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var w: float = vp.get_visible_rect().size.x
	if phone:
		offset_left = -w * 0.88
		offset_top = -520
		offset_bottom = 520
	else:
		offset_left = -384
		offset_top = -260
		offset_bottom = 260
	offset_right = -8
	_title_label.add_theme_font_size_override("font_size", GodCivPhoneUI.title_font(vp))
	_body_label.add_theme_font_size_override("font_size", 44 if phone else 16)
	GodCivPhoneUI.style_close_button(_close_button, vp)


func show_card(v: Node, village: Node) -> void:
	_villager = v
	_village = village
	_fill()
	visible = true


func refresh() -> void:
	if visible and _villager != null and is_instance_valid(_villager):
		_fill()


func hide_card() -> void:
	visible = false
	_villager = null
	_village = null


func _fill() -> void:
	var v: Node = _villager
	var cls: String = String(GodCivEconomy.CLASS_NAMES[int(v.class_level)])
	_title_label.text = "%s — %s" % [String(v.villager_name), cls]
	var lines: Array[String] = []
	var assigned: String = String(v.assigned_job) if String(v.assigned_job) != "" else "—"
	lines.append("Job: %s (assigned: %s) · %s" % [String(v.job), assigned, String(v.state)])
	lines.append("Age %d dawns · %s" % [int(v.age_days), "woman" if String(v.sex) == "F" else "man"])
	lines.append("Traits: " + ", ".join(v.traits))
	lines.append("Education %d/10 · Tool: %s" % [int(v.education), String(GodCivEconomy.TOOL_NAMES[int(v.tool)])])
	lines.append("Coins %d · Standing %d" % [int(v.coins), GodCivEconomy.standing_of(v)])
	var sk: Array[String] = []
	for j in GodCivEconomy.JOBS:
		sk.append("%s %d" % [j, int((v.skills as Dictionary).get(j, 0))])
	lines.append("Skills: " + ", ".join(sk))
	var gd: Array[String] = []
	for g in GodCivEconomy.PRICES.keys():
		var n: int = int((v.goods as Dictionary).get(g, 0))
		if n > 0:
			gd.append("%s %d" % [String(g), n])
	lines.append("Carrying: " + (", ".join(gd) if not gd.is_empty() else "nothing"))
	var home_key: String = String(v.home)
	if home_key == "":
		lines.append("Home: none — homeless")
	else:
		var parts := home_key.split(",")
		var btype: String = _village.building_type_at(int(parts[0]), int(parts[1]))
		# The towncenter is the town hall, not a house.
		var home_name: String = "town hall" if btype == "towncenter" else btype
		lines.append("Home: %s at (%s)" % [home_name, home_key])
		var names: Array[String] = []
		for m in _village.household_members(v):
			if m != v:
				names.append(String(m.villager_name))
		lines.append("Household: " + (", ".join(names) if not names.is_empty() else "lives alone"))
	var parents: Array = v.parents
	if parents.is_empty():
		lines.append("Parents: not recorded")
	else:
		var pn: Array[String] = []
		for pid in parents:
			var p = _village.villager_by_id(int(pid))
			pn.append(String(p.villager_name) if p != null else "?")
		lines.append("Parents: " + ", ".join(pn))
	lines.append("Hunger %d · Energy %d · Health %d" % [int(v.hunger), int(v.energy), int(v.health)])
	_body_label.text = "\n".join(lines)
