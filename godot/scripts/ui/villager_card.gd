class_name GodCivVillagerCard
extends PanelContainer

# Read-only villager card, designed-UI pass (John, Nov 5, 2026):
# a real designed panel now — moss with a gold border, header
# (name + class + X), labeled rows (Job, Age, Traits, Education,
# Coins), skills as small pills, vitals as three chips. It slides
# in from the right edge on a tween and collapses fully away
# when closed, so the whole screen is visible again. It docks
# BELOW the top HUD (the HUD tells it the bar's height), so
# Bless/Whisper stay visible and tappable while it is open.
# The design doc's deliberation/intent fields are model work and
# are NOT in this card: no LLM anywhere in the rebuild.

var _title_label: Label
var _body_vbox: VBoxContainer
var _close_button: Button
var _villager: Node = null
var _village: Node = null
var _kv_values: Dictionary = {}
var _skill_pills: Array = []
var _vital_values: Dictionary = {}
var _last_sig: String = ""
var _dock_top: float = -1.0
var _rest_left: float = -384.0
var _slide_tween: Tween = null
var _hiding: bool = false


func _ready() -> void:
	visible = false
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	add_theme_stylebox_override("panel", GodCivTheme.panel_style(false))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	add_child(column)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	column.add_child(title_row)
	_title_label = Label.new()
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(_title_label)
	_close_button = GodCivPhoneUI.make_close_button(get_viewport())
	_close_button.pressed.connect(hide_card)
	title_row.add_child(_close_button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_body_vbox = VBoxContainer.new()
	_body_vbox.add_theme_constant_override("separation", 6)
	_body_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_body_vbox)
	_build_body()
	apply_layout()


func _header(text: String) -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	GodCivTheme.section_header(_body_vbox, text, phone, GodCivPhoneUI.small_font(vp))


# One labeled row: dim small-caps label, bright value. Returns
# the value label so _fill can rewrite it.
func _kv_row(label_text: String) -> Label:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14 if phone else 8)
	_body_vbox.add_child(row)
	var lab := Label.new()
	lab.text = label_text
	GodCivTheme.style_label(lab, GodCivPhoneUI.small_font(vp), GodCivTheme.TEXT_DIM, phone)
	lab.custom_minimum_size = Vector2(300 if phone else 120, 0)
	row.add_child(lab)
	var val := Label.new()
	val.text = "—"
	GodCivTheme.style_label(val, GodCivPhoneUI.body_font(vp), GodCivTheme.TEXT_MAIN, phone)
	val.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	val.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(val)
	return val


func _build_body() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	_kv_values["job"] = _kv_row("JOB")
	_kv_values["age"] = _kv_row("AGE")
	_kv_values["traits"] = _kv_row("TRAITS")
	_kv_values["edu"] = _kv_row("EDUCATION")
	_kv_values["coins"] = _kv_row("COINS")
	_kv_values["carrying"] = _kv_row("CARRYING")
	_kv_values["home"] = _kv_row("HOME")
	_kv_values["household"] = _kv_row("HOUSEHOLD")
	_kv_values["parents"] = _kv_row("PARENTS")
	_header("SKILLS")
	var grid := GridContainer.new()
	grid.columns = 2 if phone else 3
	grid.add_theme_constant_override("h_separation", 10 if phone else 8)
	grid.add_theme_constant_override("v_separation", 10 if phone else 8)
	_body_vbox.add_child(grid)
	for j in GodCivEconomy.JOBS:
		var panel := PanelContainer.new()
		var lab := Label.new()
		lab.text = "%s 0" % String(j)
		lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		GodCivTheme.style_label(lab, GodCivPhoneUI.small_font(vp), GodCivTheme.TEXT_DIM, phone)
		panel.add_child(lab)
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(panel)
		_skill_pills.append({"panel": panel, "label": lab})
	_header("VITALS")
	var vrow := HBoxContainer.new()
	vrow.add_theme_constant_override("separation", 12 if phone else 8)
	_body_vbox.add_child(vrow)
	for key in ["hunger", "energy", "health"]:
		var c: Dictionary = GodCivTheme.make_chip(
			vrow, key.to_upper(), phone,
			36 if phone else 14, GodCivPhoneUI.body_font(vp)
		)
		(c["panel"] as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_vital_values[key] = c["value"]


# Geometry + fonts for the current orientation. Called from
# _ready, from the HUD when the viewport flips, and when the HUD
# docks the panel below the top bar.
func apply_layout() -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var w: float = vp.get_visible_rect().size.x
	var panel_w: float = w * 0.88 if phone else 384.0
	_rest_left = -panel_w
	offset_right = -8
	if _dock_top >= 0.0:
		offset_top = _dock_top + 12
		offset_bottom = -8
	else:
		offset_top = -520
		offset_bottom = 520
	if visible and _slide_tween == null:
		offset_left = _rest_left
	_title_label.add_theme_font_size_override("font_size", GodCivPhoneUI.title_font(vp))
	GodCivTheme.style_label(_title_label, GodCivPhoneUI.title_font(vp), GodCivTheme.GOLD, phone)
	add_theme_stylebox_override("panel", GodCivTheme.panel_style(phone))
	GodCivPhoneUI.style_close_button(_close_button, vp)


# The HUD calls this with the top bar's height so the panel sits
# below it instead of covering Bless/Whisper.
func set_docked_top(top_y: float) -> void:
	_dock_top = top_y
	apply_layout()


func _kill_tween() -> void:
	if _slide_tween != null and _slide_tween.is_valid():
		_slide_tween.kill()
	_slide_tween = null


func show_card(v: Node, village: Node) -> void:
	_villager = v
	_village = village
	_last_sig = ""
	_fill()
	visible = true
	_hiding = false
	_kill_tween()
	offset_left = 8.0
	_slide_tween = create_tween()
	_slide_tween.tween_property(self, "offset_left", _rest_left, 0.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func refresh() -> void:
	if visible and _villager != null and is_instance_valid(_villager):
		_fill()


func hide_card() -> void:
	if not visible:
		return
	_hiding = true
	_kill_tween()
	_slide_tween = create_tween()
	_slide_tween.tween_property(self, "offset_left", 8.0, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_slide_tween.finished.connect(_on_slide_finished)


func _on_slide_finished() -> void:
	if _hiding:
		visible = false
		_villager = null
		_village = null


func is_open() -> bool:
	return visible


func _set_skill_pill(pill: Dictionary, job_name: String, level: int) -> void:
	var vp := get_viewport()
	var phone: bool = GodCivPhoneUI.is_portrait(vp)
	var trained: bool = level > 0
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.30, 0.38, 0.20) if trained else Color(0.0, 0.0, 0.0, 0.38)
	s.border_color = GodCivTheme.BORDER_GOLD_DIM if trained else Color(0.35, 0.35, 0.30)
	s.set_border_width_all(GodCivTheme.border_width(phone))
	s.set_corner_radius_all(30 if phone else 14)
	s.content_margin_left = 12.0 if phone else 6.0
	s.content_margin_right = 12.0 if phone else 6.0
	s.content_margin_top = 4.0 if phone else 2.0
	s.content_margin_bottom = 4.0 if phone else 2.0
	(pill["panel"] as PanelContainer).add_theme_stylebox_override("panel", s)
	var lab: Label = pill["label"]
	lab.text = "%s %d" % [job_name, level]
	lab.add_theme_color_override("font_color", GodCivTheme.TEXT_MAIN if trained else GodCivTheme.TEXT_DIM)


func _fill() -> void:
	var v: Node = _villager
	if v == null:
		return
	var sig_parts: Array[String] = []
	sig_parts.append(String(v.villager_name))
	sig_parts.append(str(int(v.class_level)))
	sig_parts.append(String(v.job))
	sig_parts.append(String(v.assigned_job))
	sig_parts.append(String(v.state))
	sig_parts.append(str(int(v.age_days)))
	sig_parts.append(String(v.sex))
	sig_parts.append(", ".join(v.traits))
	sig_parts.append(str(int(v.education)))
	sig_parts.append(str(int(v.tool)))
	sig_parts.append(str(int(v.coins)))
	sig_parts.append(str(GodCivEconomy.standing_of(v)))
	var sk: Dictionary = v.skills as Dictionary
	for j in GodCivEconomy.JOBS:
		sig_parts.append(str(int(sk.get(j, 0))))
	sig_parts.append(String(v.home))
	sig_parts.append(str(int(v.hunger)))
	sig_parts.append(str(int(v.energy)))
	sig_parts.append(str(int(v.health)))
	var sig: String = "|".join(sig_parts)
	if sig == _last_sig:
		return
	_last_sig = sig
	var cls: String = String(GodCivEconomy.CLASS_NAMES[int(v.class_level)])
	_title_label.text = "%s — %s" % [String(v.villager_name), cls]
	var assigned: String = String(v.assigned_job) if String(v.assigned_job) != "" else "—"
	(_kv_values["job"] as Label).text = "%s (assigned: %s) · %s" % [String(v.job), assigned, String(v.state)]
	(_kv_values["age"] as Label).text = "%d dawns · %s" % [int(v.age_days), "woman" if String(v.sex) == "F" else "man"]
	(_kv_values["traits"] as Label).text = ", ".join(v.traits)
	(_kv_values["edu"] as Label).text = "%d/10 · Tool: %s" % [int(v.education), String(GodCivEconomy.TOOL_NAMES[int(v.tool)])]
	(_kv_values["coins"] as Label).text = "%d · Standing %d" % [int(v.coins), GodCivEconomy.standing_of(v)]
	var gd: Array[String] = []
	for g in GodCivEconomy.PRICES.keys():
		var n: int = int((v.goods as Dictionary).get(g, 0))
		if n > 0:
			gd.append("%s %d" % [String(g), n])
	(_kv_values["carrying"] as Label).text = ", ".join(gd) if not gd.is_empty() else "nothing"
	var home_key: String = String(v.home)
	if home_key == "":
		(_kv_values["home"] as Label).text = "none — homeless"
		(_kv_values["household"] as Label).text = "—"
	else:
		var parts := home_key.split(",")
		var btype: String = _village.building_type_at(int(parts[0]), int(parts[1]))
		# The towncenter is the town hall, not a house.
		var home_name: String = "town hall" if btype == "towncenter" else btype
		(_kv_values["home"] as Label).text = "%s at (%s)" % [home_name, home_key]
		var names: Array[String] = []
		for m in _village.household_members(v):
			if m != v:
				names.append(String(m.villager_name))
		(_kv_values["household"] as Label).text = ", ".join(names) if not names.is_empty() else "lives alone"
	var parents: Array = v.parents
	if parents.is_empty():
		(_kv_values["parents"] as Label).text = "not recorded"
	else:
		var pn: Array[String] = []
		for pid in parents:
			var p = _village.villager_by_id(int(pid))
			pn.append(String(p.villager_name) if p != null else "?")
		(_kv_values["parents"] as Label).text = ", ".join(pn)
	for i in range(GodCivEconomy.JOBS.size()):
		_set_skill_pill(_skill_pills[i], String(GodCivEconomy.JOBS[i]), int(sk.get(GodCivEconomy.JOBS[i], 0)))
	(_vital_values["hunger"] as Label).text = str(int(v.hunger))
	(_vital_values["energy"] as Label).text = str(int(v.energy))
	(_vital_values["health"] as Label).text = str(int(v.health))
