class_name GodCivMain
extends Node2D

# Phase 3 + mobile pass: wires clock, world, lighting, camera,
# HUD, village, main menu, and loading screen. The player lands
# on the title menu first; the world only generates after
# Continue or New Game, so no sim days pass on the menu.
# Continue loads the v2 save exactly as before; New Game starts
# fresh (and only erases an existing save after the player
# confirms on the menu). The clock stays paused until the world
# finishes generating; the village is founded (or restored) only
# after generation, because it needs the terrain. The HUD stays
# hidden until the village is founded. Saves on the HUD Save
# button and on window close, only once a village exists.
# A tap (press + release within the phone tolerance and 500ms)
# selects the nearest villager within the tap radius and opens
# its card; a tap anywhere else closes the card (and the
# Evolution sidebar). On a portrait phone the tap radius and
# press tolerance are bigger, so villagers are actually
# tappable with a thumb.

const DEFAULT_SEED: int = 42
const VILLAGE_CENTER_PX: Vector2 = Vector2(392, 392)

var world: GodCivWorld
var camera: GodCivCamera
var clock: GodCivClock
var lighting: GodCivLighting
var hud: GodCivHud
var village: GodCivVillage
var menu: GodCivMainMenu
var loading: GodCivLoadingScreen

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
	hud.visible = false
	add_child(hud)
	hud.save_requested.connect(_on_save_requested)
	world.generation_progress.connect(_on_generation_progress)
	world.generation_finished.connect(_on_generation_finished)
	loading = GodCivLoadingScreen.new()
	add_child(loading)
	menu = GodCivMainMenu.new()
	add_child(menu)
	menu.continue_requested.connect(_on_continue_requested)
	menu.new_game_requested.connect(_on_new_game_requested)
	_save_data = GodCivSave.load_game()
	menu.show_menu(not _save_data.is_empty())


func _on_continue_requested() -> void:
	_start_game(_save_data)


func _on_new_game_requested() -> void:
	# The menu only emits this after its own confirm when a save
	# exists, so the old save is erased here, before the fresh
	# world starts.
	if not _save_data.is_empty():
		DirAccess.remove_absolute(GodCivSave.SAVE_PATH)
	_save_data = {}
	_start_game({})


func _start_game(save_data: Dictionary) -> void:
	_save_data = save_data
	menu.hide_menu()
	clock.from_save(save_data)
	var seed_value: int = int(save_data.get("seed", DEFAULT_SEED))
	var cam_pos := Vector2(
		float(save_data.get("camera_x", VILLAGE_CENTER_PX.x)),
		float(save_data.get("camera_y", VILLAGE_CENTER_PX.y))
	)
	var cam_zoom: float = float(save_data.get("camera_zoom", 1.0))
	camera.setup(cam_pos, GodCivWorld.WORLD_PX)
	camera.set_zoom_immediate(cam_zoom)
	loading.show_loading()
	loading.set_progress(0.0)
	world.generate_async(seed_value)


func _process(_delta: float) -> void:
	lighting.update_for_time(clock.time, camera, GodCivClock.season_of(clock.day))
	hud.update_clock(clock.day, clock.year(), GodCivClock.season_name_of(clock.day), clock.time_string(), clock.phase())


func _tap_radius() -> float:
	return 64.0 if GodCivPhoneUI.is_portrait(get_viewport()) else 24.0


func _press_tolerance() -> float:
	return 32.0 if GodCivPhoneUI.is_portrait(get_viewport()) else 12.0


func _unhandled_input(event: InputEvent) -> void:
	if village == null:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_press_pos = event.position
			_press_time = Time.get_ticks_msec() / 1000.0
		else:
			var held: float = Time.get_ticks_msec() / 1000.0 - _press_time
			if event.position.distance_to(_press_pos) < _press_tolerance() and held < 0.5:
				_tap_select(event.position)


func _tap_select(screen_pos: Vector2) -> void:
	var world_pos: Vector2 = get_canvas_transform().affine_inverse() * screen_pos
	var best: GodCivVillager = null
	var best_d: float = _tap_radius()
	for v in village.villagers:
		var d: float = v.position.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = v
	if best != null:
		hud.show_villager_card(best, village)
	else:
		hud.hide_villager_card()
		hud.hide_evolution_sidebar()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save_game()


func _on_generation_progress(f: float) -> void:
	loading.set_progress(f)


func _on_generation_finished() -> void:
	# The village needs the terrain, so it is founded only now that
	# generation is done. It restores its own save section when one
	# exists, otherwise it founds a fresh village on seed 42.
	loading.hide_loading()
	hud.visible = true
	village = GodCivVillage.new()
	add_child(village)
	village.setup(world, clock, world.seed, _save_data)
	hud.bless_requested.connect(village.try_bless)
	hud.whisper_requested.connect(village.try_whisper)
	hud.time_control_requested.connect(_on_time_control_requested)
	village.log_changed.connect(hud.set_log)
	village.stats_changed.connect(_on_village_stats)
	hud.set_log(village.last_log_lines())
	_on_village_stats()
	clock.paused = false
	# The clock may hold a saved speed (2x / 4x from a previous
	# session); show it on the HUD's speed buttons.
	hud.set_speed_state(clock.speed, clock.paused)


func _on_time_control_requested(speed: float, paused: bool) -> void:
	clock.speed = speed
	clock.paused = paused


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
	# Nothing to save before a village exists (e.g. closing the
	# game from the title menu): saving here would write a stub
	# with no village section.
	if village == null:
		return
	var data := {"seed": world.seed}
	data.merge(clock.to_save())
	data["camera_x"] = camera.target_position.x
	data["camera_y"] = camera.target_position.y
	data["camera_zoom"] = camera.target_zoom.x
	data.merge(village.to_save())
	GodCivSave.save_game(data)
