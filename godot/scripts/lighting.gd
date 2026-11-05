class_name GodCivLighting
extends Node2D

# Day/night lighting baseline. The phase boundaries are the PWA's
# (0.22 / 0.32 / 0.72 / 0.84); the colors are a Phase 0 render choice,
# not sim rules. CanvasModulate tints the whole world; a large soft
# PointLight2D follows the camera as the sun by day and the moon by
# night. Lamps, torches, and window lights arrive in later phases.

var canvas_modulate: CanvasModulate
var sun_light: PointLight2D

const KEYFRAMES: Array = [
	[0.00, Color(0.20, 0.24, 0.38)],
	[0.22, Color(0.28, 0.28, 0.42)],
	[0.32, Color(0.98, 0.78, 0.58)],
	[0.50, Color(1.0, 1.0, 1.0)],
	[0.72, Color(1.0, 0.82, 0.60)],
	[0.84, Color(0.42, 0.34, 0.50)],
	[1.00, Color(0.20, 0.24, 0.38)],
]


func _ready() -> void:
	canvas_modulate = CanvasModulate.new()
	canvas_modulate.color = Color(1, 1, 1)
	add_child(canvas_modulate)
	sun_light = PointLight2D.new()
	sun_light.texture = _make_radial_texture(256)
	sun_light.texture_scale = 12.0
	sun_light.color = Color(1.0, 0.95, 0.8)
	sun_light.energy = 0.25
	add_child(sun_light)


func update_for_time(p_time: float, camera: Camera2D) -> void:
	canvas_modulate.color = _color_at(p_time)
	var phase := GodCivClock.phase_of(p_time)
	if phase == "night":
		sun_light.color = Color(0.6, 0.7, 1.0)
		sun_light.energy = 0.45
	elif phase == "day":
		sun_light.color = Color(1.0, 0.95, 0.8)
		sun_light.energy = 0.25
	else:
		sun_light.color = Color(1.0, 0.7, 0.45)
		sun_light.energy = 0.35
	if camera != null:
		sun_light.position = camera.position


func _color_at(t: float) -> Color:
	var prev: Array = KEYFRAMES[0]
	for kf in KEYFRAMES:
		if t < float(kf[0]):
			var span: float = float(kf[0]) - float(prev[0])
			var f: float = 0.0 if span <= 0.0 else (t - float(prev[0])) / span
			return (prev[1] as Color).lerp(kf[1] as Color, f)
		prev = kf
	return KEYFRAMES[KEYFRAMES.size() - 1][1] as Color


func _make_radial_texture(size: int) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var center := Vector2(size, size) * 0.5
	var max_d: float = center.length()
	for y in size:
		for x in size:
			var d: float = Vector2(x, y).distance_to(center) / max_d
			var a: float = clampf(1.0 - d * d, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)
