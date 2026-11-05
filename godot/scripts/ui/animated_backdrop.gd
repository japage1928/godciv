class_name GodCivAnimatedBackdrop
extends Control

# Procedural animated backdrop shared by the main menu and the
# loading screen, mobile pass (John, Nov 5, 2026): sky, sun,
# drifting clouds, birds, distant hills, and little villagers
# walking a dirt path along the bottom. All drawn in code — no
# assets — and driven by _process, so it animates in the web
# export exactly like everywhere else. Never eats input.

var _t: float = 0.0
var _clouds: Array[Dictionary] = []
var _walkers: Array[Dictionary] = []
var _birds: Array[Dictionary] = []
var _rng: RandomNumberGenerator


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_rng = RandomNumberGenerator.new()
	_rng.seed = 12345
	for i in 7:
		_clouds.append({
			"x": _rng.randf(),
			"y": 0.06 + _rng.randf() * 0.30,
			"s": 0.5 + _rng.randf() * 0.9,
			"v": 0.006 + _rng.randf() * 0.012,
		})
	for i in 5:
		_walkers.append({
			"x": _rng.randf(),
			"speed": 0.02 + _rng.randf() * 0.03,
			"phase": _rng.randf() * TAU,
			"hue": _rng.randf(),
		})
	for i in 3:
		_birds.append({
			"x": _rng.randf(),
			"y": 0.12 + _rng.randf() * 0.15,
			"v": 0.02 + _rng.randf() * 0.02,
			"phase": _rng.randf() * TAU,
		})


func _process(delta: float) -> void:
	_t += delta
	for c in _clouds:
		c["x"] = float(c["x"]) + float(c["v"]) * delta
		if float(c["x"]) > 1.25:
			c["x"] = -0.25
	for w in _walkers:
		w["x"] = float(w["x"]) + float(w["speed"]) * delta
		if float(w["x"]) > 1.05:
			w["x"] = -0.05
	for b in _birds:
		b["x"] = float(b["x"]) + float(b["v"]) * delta
		if float(b["x"]) > 1.05:
			b["x"] = -0.05
	queue_redraw()


func _draw() -> void:
	var s: Vector2 = size
	if s.x <= 0.0 or s.y <= 0.0:
		return
	# Sky: vertical bands, pale blue up top to warm near the horizon.
	var bands: int = 24
	for i in bands:
		var f: float = float(i) / float(bands - 1)
		var col: Color = Color(0.45, 0.68, 0.86).lerp(Color(0.87, 0.93, 0.78), f)
		draw_rect(Rect2(0, s.y * 0.72 * f, s.x, s.y * 0.72 / float(bands) + 1.0), col)
	# Sun.
	var sun_pos := Vector2(s.x * 0.82, s.y * 0.12)
	draw_circle(sun_pos, s.y * 0.05, Color(1.0, 0.9, 0.55, 0.9))
	draw_circle(sun_pos, s.y * 0.035, Color(1.0, 0.95, 0.7))
	# Clouds: clusters of soft circles, drifting.
	for c in _clouds:
		var cx: float = float(c["x"]) * s.x
		var cy: float = float(c["y"]) * s.y
		var r: float = float(c["s"]) * s.y * 0.045
		var cc := Color(1, 1, 1, 0.85)
		draw_circle(Vector2(cx, cy), r, cc)
		draw_circle(Vector2(cx + r * 0.9, cy + r * 0.15), r * 0.75, cc)
		draw_circle(Vector2(cx - r * 0.9, cy + r * 0.2), r * 0.7, cc)
		draw_circle(Vector2(cx + r * 0.3, cy - r * 0.45), r * 0.6, cc)
	# Birds: little flapping chevrons.
	for b in _birds:
		var bx: float = float(b["x"]) * s.x
		var by: float = float(b["y"]) * s.y + sin(_t * 3.0 + float(b["phase"])) * 6.0
		var flap: float = sin(_t * 8.0 + float(b["phase"])) * 6.0
		var bc := Color(0.15, 0.15, 0.2, 0.8)
		draw_line(Vector2(bx - 12, by - flap), Vector2(bx, by), bc, 2.0)
		draw_line(Vector2(bx, by), Vector2(bx + 12, by - flap), bc, 2.0)
	# Distant hills.
	var hill := PackedVector2Array()
	hill.append(Vector2(0, s.y * 0.72))
	for i in 25:
		var fx: float = float(i) / 24.0
		var hy: float = s.y * 0.72 - (sin(fx * 9.0 + 1.3) * 0.5 + 0.5) * s.y * 0.06 - s.y * 0.02
		hill.append(Vector2(fx * s.x, hy))
	hill.append(Vector2(s.x, s.y * 0.72))
	draw_colored_polygon(hill, Color(0.42, 0.62, 0.38))
	# Ground and a dirt path along the bottom.
	draw_rect(Rect2(0, s.y * 0.72, s.x, s.y * 0.28), Color(0.36, 0.58, 0.3))
	draw_rect(Rect2(0, s.y * 0.82, s.x, s.y * 0.05), Color(0.72, 0.6, 0.42))
	# Walking villagers: bobbing silhouettes on the path.
	for w in _walkers:
		var wx: float = float(w["x"]) * s.x
		var wy: float = s.y * 0.845
		var bob: float = absf(sin(_t * 5.0 + float(w["phase"]))) * 6.0
		var tc: Color = Color.from_hsv(float(w["hue"]), 0.45, 0.45)
		var sc: Color = Color.from_hsv(float(w["hue"]), 0.35, 0.6)
		draw_rect(Rect2(wx - 9, wy - 26 - bob, 18, 26), tc)
		draw_circle(Vector2(wx, wy - 32 - bob), 8.0, Color(0.85, 0.68, 0.52))
		draw_rect(Rect2(wx - 10, wy - 40 - bob, 20, 5), sc)
