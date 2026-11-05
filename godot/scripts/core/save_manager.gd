class_name GodCivSave
extends RefCounted

# Versioned save/load for a fresh Godot world. Save format version 2
# (Phase 1, kept in Phase 2): version 1 stored only the seed, clock,
# and camera; v2 adds the village section (see GodCivVillage.to_save).
# Phase 2 adds fields inside the v2 village section — tech, market
# timer, deer, households, building tiers, and the new villager
# fields — and every from_save reader defaults them, so a Phase 1
# save loads with Phase 2 defaults instead of breaking. The terrain
# itself is deterministic from the seed, so the save never stores
# the 320x320 grid — only the village's mutations of it. A version
# mismatch starts a fresh world instead of migrating blindly, so a
# Phase 0 (v1) save loads as a fresh village, not a broken one.

const SAVE_VERSION: int = 2
const SAVE_PATH: String = "user://savegame.json"


static func save_game(data: Dictionary) -> bool:
	var payload := {"version": SAVE_VERSION}
	payload.merge(data)
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload))
	file.close()
	return true


static func load_game() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return {}
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	if json.parse(text) != OK:
		return {}
	var data: Variant = json.data
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	var dict: Dictionary = data
	if int(dict.get("version", -1)) != SAVE_VERSION:
		return {}
	return dict


static func new_game_data(seed_value: int) -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"seed": seed_value,
		"day": 1,
		"time": 0.32,
		"camera_x": 392.0,
		"camera_y": 392.0,
		"camera_zoom": 1.0,
	}
