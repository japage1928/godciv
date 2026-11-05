class_name GodCivMain
extends Node2D

# Phase 3 vertical slice: wires the clock, world, lighting, camera,
# HUD, and the village. Loads the save if one exists
# (version-checked), otherwise starts a fresh world on the default
# seed. Saves on the HUD Save button and on window close. The clock
# stays paused until the world finishes generating so no days pass
# during the load; the village is founded (or restored) only after
# generation, because it needs the terrain. A tap (press + release
# under 12px and 500ms) selects the nearest villager within 24px
# and opens its card; a tap anywhere else closes the card. The
# camera also reads _unhandled_input for drags but never consumes
# the event, so both handlers see every tap.

const DEFAULT_SEED: int = 42
const VILLAGE_CENTER_PX: Vector2 = Vector2(392, 392)

var world: GodCivWorld
var camera: GodCivCamera
var clock: GodCivClock
var lighting: GodCivLighting
var hud: GodCivHud
var village: GodCivVillage

var _save_data: Dictionary = {}
var _press_pos: Vector2 = Vector2.ZERO
var _press_time: float = 0.0


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
	lighting.update_for_time(clock.time, camera, GodCivClock.season_of(clock.day))
	hud.update_clock(clock.day, clock.year(), GodCivClock.season_name_of(clock.day), clock.time_string(), clock.phase())


func _unhandled_input(event: InputEvent) -> void:
	if village == null:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_press_pos = event.position
			_press_time = Time.get_ticks_msec() / 1000.0
		else:
			var held: float = Time.get_ticks_msec() / 1000.0 - _press_time
			if event.position.distance_to(_press_pos) < 12.0 and held < 0.5:
				_tap_select(event.position)


func _tap_select(screen_pos: Vector2) -> void:
	var world_pos: Vector2 = get_canvas_transform().affine_inverse() * screen_pos
	var best: GodCivVillager = null
	var best_d: float = 24.0
	for v in village.villagers:
		var d: float = v.position.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = v
	if best != null:
		hud.show_villager_card(best, village)
	else:
		hud.hide_villager_card()


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
