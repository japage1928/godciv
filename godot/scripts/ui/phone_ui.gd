class_name GodCivPhoneUI
extends RefCounted

# Shared phone/desktop sizing for every UI panel, mobile pass
# (John, Nov 5, 2026). On a portrait phone the 1280-unit-wide
# canvas is squeezed into ~390 CSS px, so desktop-sized text and
# buttons are unreadably small and untappable. Portrait gets a
# ~2.6x font scale and real thumb-sized buttons (~44 CSS px tall);
# landscape keeps the desktop sizes. All helpers read the live
# viewport, so rotating the phone flips the class and the HUD
# rebuilds its layout for the new orientation.

static func is_portrait(vp: Viewport) -> bool:
	var s: Vector2 = vp.get_visible_rect().size
	return s.y > s.x * 1.05

static func body_font(vp: Viewport) -> int:
	return 52 if is_portrait(vp) else 20

static func small_font(vp: Viewport) -> int:
	return 44 if is_portrait(vp) else 17

static func log_font(vp: Viewport) -> int:
	return 40 if is_portrait(vp) else 15

static func title_font(vp: Viewport) -> int:
	return 56 if is_portrait(vp) else 20

static func button_font(vp: Viewport) -> int:
	return 48 if is_portrait(vp) else 22

static func thumb_min(vp: Viewport) -> Vector2:
	if is_portrait(vp):
		return Vector2(170, 130)
	return Vector2(72, 52)

static func big_button(vp: Viewport, text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", button_font(vp))
	b.custom_minimum_size = thumb_min(vp)
	return b

# The close button. Plain ASCII "X": the old "✕" glyph rendered
# as a fallback box on some fonts and the last play-check could
# not confirm it closed anything. Big and thumb-sized on phone.
static func make_close_button(vp: Viewport) -> Button:
	var b := Button.new()
	style_close_button(b, vp)
	return b

static func style_close_button(b: Button, vp: Viewport) -> void:
	b.text = "X"
	b.tooltip_text = "Close"
	b.add_theme_font_size_override("font_size", 56 if is_portrait(vp) else 28)
	b.custom_minimum_size = Vector2(120, 120) if is_portrait(vp) else Vector2(64, 64)
