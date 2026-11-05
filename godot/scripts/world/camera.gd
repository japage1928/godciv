class_name GodCivCamera
extends Camera2D

# Smooth pan/zoom camera, mouse AND touch.
# Mouse: left-drag pans, wheel zooms at the cursor.
# Touch: one finger drags, two-finger pinch zooms at the midpoint
# (trackpad pinch arrives as a magnify gesture and is handled too).
# Keys: WASD / arrows pan. Zoom clamps to 0.25x-4x; the view clamps to
# the world rect, centering when the view is larger than the world.

const MIN_ZOOM: float = 0.25
const MAX_ZOOM: float = 4.0
const PAN_SPEED: float = 900.0 # px/s at zoom 1
const SMOOTH_RATE: float = 10.0

var target_position: Vector2 = Vector2.ZERO
var target_zoom: Vector2 = Vector2.ONE
var world_rect: Rect2 = Rect2(0, 0, 5120, 5120)

var _dragging: bool = false
var _touches: Dictionary = {}
var _pinch_active: bool = false
var _pinch_start_dist: float = 0.0
var _pinch_start_zoom: float = 1.0


func _ready() -> void:
	make_current()
	target_position = position


func setup(center: Vector2, world_size_px: float) -> void:
	world_rect = Rect2(0, 0, world_size_px, world_size_px)
	position = center
	target_position = center
	_clamp_target()


func set_zoom_immediate(z: float) -> void:
	target_zoom = Vector2.ONE * clampf(z, MIN_ZOOM, MAX_ZOOM)
	zoom = target_zoom


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		dir.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		dir.y += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dir.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dir.x += 1.0
	if dir != Vector2.ZERO:
		target_position += dir.normalized() * PAN_SPEED * delta / target_zoom.x
	_clamp_target()
	var f: float = 1.0 - exp(-SMOOTH_RATE * delta)
	position = position.lerp(target_position, f)
	zoom = zoom.lerp(target_zoom, f)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_zoom_at(mb.position, 1.15)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_zoom_at(mb.position, 1.0 / 1.15)
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		target_position -= mm.relative / target_zoom.x
	elif event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_touches[st.index] = st.position
			if _touches.size() == 2:
				_pinch_active = true
				_pinch_start_dist = _touch_distance()
				_pinch_start_zoom = target_zoom.x
		else:
			_touches.erase(st.index)
			if _touches.size() < 2:
				_pinch_active = false
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		if _touches.has(sd.index):
			_touches[sd.index] = sd.position
		if _pinch_active and _touches.size() == 2:
			var d: float = _touch_distance()
			if _pinch_start_dist > 0.0:
				_zoom_at(_touch_midpoint(), (_pinch_start_zoom * d / _pinch_start_dist) / target_zoom.x)
		elif _touches.size() == 1:
			target_position -= sd.relative / target_zoom.x
	elif event is InputEventMagnifyGesture:
		var mg := event as InputEventMagnifyGesture
		_zoom_at(mg.position, mg.factor)


func _touch_distance() -> float:
	var pts: Array = _touches.values()
	if pts.size() < 2:
		return 0.0
	return (pts[0] as Vector2).distance_to(pts[1] as Vector2)


func _touch_midpoint() -> Vector2:
	var pts: Array = _touches.values()
	if pts.size() < 2:
		return Vector2.ZERO
	return ((pts[0] as Vector2) + (pts[1] as Vector2)) * 0.5


## Zoom so the world point under `screen_pos` stays under it.
func _zoom_at(screen_pos: Vector2, factor: float) -> void:
	var vp_center: Vector2 = get_viewport_rect().size * 0.5
	var world_before: Vector2 = target_position + (screen_pos - vp_center) / target_zoom.x
	var new_zoom: float = clampf(target_zoom.x * factor, MIN_ZOOM, MAX_ZOOM)
	target_position = world_before - (screen_pos - vp_center) / new_zoom
	target_zoom = Vector2.ONE * new_zoom
	_clamp_target()


func _clamp_target() -> void:
	var view: Vector2 = get_viewport_rect().size * 0.5 / target_zoom
	var min_p: Vector2 = view
	var max_p: Vector2 = Vector2(world_rect.size) - view
	if max_p.x < min_p.x:
		target_position.x = world_rect.size.x * 0.5
	else:
		target_position.x = clampf(target_position.x, min_p.x, max_p.x)
	if max_p.y < min_p.y:
		target_position.y = world_rect.size.y * 0.5
	else:
		target_position.y = clampf(target_position.y, min_p.y, max_p.y)
