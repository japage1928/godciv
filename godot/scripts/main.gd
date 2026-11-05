extends Node2D

# Phase 0 scaffold: wires the clock, world, lighting, camera, and HUD.
# Loads the save if one exists (version-checked), otherwise starts a
# fresh world on the default seed. Saves on the HUD Save button and on
# window close. The clock stays paused until the world finishes
# generating so no days pass during the load.

const DEFAULT_SEED: int = 42
const VILLAGE_CENTER_PX: Vector2 = Vector2(392, 392)

var world: GodCivWorld
var camera: GodCivCamera
var clock: GodCivClock
var lighting: GodCivLighting
var hud: GodCivHud


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
	clock.paused = false
	hud.set_status("")


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
	GodCivSave.save_game(data)
