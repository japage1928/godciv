class_name GodCivMain
extends Node2D

# Phase 1 vertical slice: wires the clock, world, lighting, camera,
# HUD, and the village. Loads the save if one exists
# (version-checked), otherwise starts a fresh world on the default
# seed. Saves on the HUD Save button and on window close. The clock
# stays paused until the world finishes generating so no days pass
# during the load; the village is founded (or restored) only after
# generation, because it needs the terrain.

const DEFAULT_SEED: int = 42
const VILLAGE_CENTER_PX: Vector2 = Vector2(392, 392)

var world: GodCivWorld
var camera: GodCivCamera
var clock: GodCivClock
var lighting: GodCivLighting
var hud: GodCivHud
var village: GodCivVillage

var _save_data: Dictionary = {}


func _ready() -> void:
	clock = GodCivClock.new()
	clock.paused = true
	add_child(clock)
	world = GodCivWorld.new()
	add_child(world)
	lighting = GodCivLighting.new()
	add_child(lighting)
	camera = GodCivCamera.new()
	add_child(camera)
	hud = GodCivHud.new()
	add_child(hud)
	hud.save_requested.connect(_on_save_requested)
	world.generation_progress.connect(_on_generation_progress)
	world.generation_finished.connect(_on_generation_finished)
	var save_data := GodCivSave.load_game()
	_save_data = save_data
	var seed_value: int = int(save_data.get("seed", DEFAULT_SEED))
	clock.from_save(save_data)
	var cam_pos := Vector2(
		float(save_data.get("camera_x", VILLAGE_CENTER_PX.x)),
		float(save_data.get("camera_y", VILLAGE_CENTER_PX.y))
	)
	var cam_zoom: float = float(save_data.get("camera_zoom", 1.0))
	camera.setup(cam_pos, GodCivWorld.WORLD_PX)
	camera.set_zoom_immediate(cam_zoom)
	hud.set_status("Generating world…")
	world.generate_async(seed_value)


func _process(_delta: float) -> void:
	lighting.update_for_time(clock.time, camera)
	hud.update_clock(clock.day, clock.year(), GodCivClock.season_name_of(clock.day), clock.time_string(), clock.phase())


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save_game()


func _on_generation_progress(f: float) -> void:
	hud.set_status("Generating world… %d%%" % int(f * 100.0))


func _on_generation_finished() -> void:
	# The village needs the terrain, so it is founded only now that
	# generation is done. It restores its own save section when one
	# exists, otherwise it founds a fresh village on seed 42.
	village = GodCivVillage.new()
	add_child(village)
	village.setup(world, clock, world.seed, _save_data)
	hud.bless_requested.connect(village.try_bless)
	hud.whisper_requested.connect(village.try_whisper)
	village.log_changed.connect(hud.set_log)
	village.stats_changed.connect(_on_village_stats)
	hud.set_log(village.last_log_lines())
	_on_village_stats()
	clock.paused = false
	hud.set_status("")


func _on_village_stats() -> void:
	if village == null:
		return
	hud.update_village(village.stats_dict())
	hud.set_bless_cooldown(village.bless_cooldown_remaining())


func _on_save_requested() -> void:
	_save_game()
	hud.set_status("Saved.")
	get_tree().create_timer(2.0).timeout.connect(func() -> void: hud.set_status(""))


func _save_game() -> void:
	var data := {"seed": world.seed}
	data.merge(clock.to_save())
	data["camera_x"] = camera.target_position.x
	data["camera_y"] = camera.target_position.y
	data["camera_zoom"] = camera.target_zoom.x
	if village != null:
		data.merge(village.to_save())
	GodCivSave.save_game(data)
