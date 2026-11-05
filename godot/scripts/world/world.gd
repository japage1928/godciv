class_name GodCivWorld
extends Node2D

# The 320x320 world as three TileMapLayers (ground + features +
# buildings), generated from GodCivTerrain in chunks across frames
# so startup stays responsive. The TileSet texture is generated
# procedurally in code — no binary assets — so the whole project
# stays UTF-8 text.
#
# Ground tile by height band is a RENDER choice, not a sim rule: water
# and shore follow the PWA exactly (water = lake disc + h < 0.62;
# shore = land beside water); the grass/rock bands only shade the map.
#
# Phase 3: the texture is rebuilt when the season or the visual
# era stage changes, so trees and ground follow the seasons and
# roofs/walls grow up with the tech levels (the PWA's era stages:
# 0 timber/thatch, 1 stone/tile, 2 brick/paved, 3 concrete/glass).
# The village calls apply_season / apply_era_stage / apply_look;
# the swap reassigns the atlas source texture, which the layers
# pick up. Tree look is deterministic per cell (pine / broadleaf /
# round), so regrown trees match the forest around them.

signal generation_progress(fraction: float)
signal generation_finished

const TILE_SIZE: int = 16
const WORLD_PX: float = 320.0 * 16.0

const TILE_WATER: int = 0
const TILE_SHORE: int = 1
const TILE_GRASS_LOW: int = 2
const TILE_GRASS: int = 3
const TILE_GRASS_HIGH: int = 4
const TILE_ROCK: int = 5
const TILE_TREE: int = 6
const TILE_STONE: int = 7
const TILE_ORE: int = 8
const TILE_HUT: int = 9
const TILE_GRANARY: int = 10
const TILE_TOWNCENTER: int = 11
const TILE_ALTAR: int = 12
const TILE_ROAD: int = 13
const TILE_FARM: int = 14
const TILE_CROP1: int = 15
const TILE_CROP2: int = 16
const TILE_CROP3: int = 17
const TILE_WORKSHOP: int = 18
const TILE_KILN: int = 19
const TILE_SMITHY: int = 20
const TILE_FACTORY: int = 21
const TILE_SCHOOL: int = 22
const TILE_HEALER: int = 23
const TILE_WELL: int = 24
const TILE_SHRINE: int = 25
const TILE_LONGHOUSE: int = 26
const TILE_GREATHALL: int = 27
const TILE_FARMHOUSE: int = 28
# Phase 3 tiles: tree variety, meadow ground, paved roads, market
# stalls, street lamps, and housing-tier variants of the dwellings.
const TILE_TREE2: int = 29
const TILE_TREE3: int = 30
const TILE_MEADOW: int = 31
const TILE_ROAD_PAVED: int = 32
const TILE_STALL_FOOD: int = 33
const TILE_STALL_GOODS: int = 34
const TILE_STALL_CRAFT: int = 35
const TILE_STALL_GROCER: int = 36
const TILE_LAMP: int = 37
const TILE_HUT_T1: int = 38
const TILE_HUT_T2: int = 39
const TILE_LONGHOUSE_T1: int = 40
const TILE_FARMHOUSE_T1: int = 41
const TILE_GREATHALL_T1: int = 42
const TILE_COUNT: int = 43

var seed: int = 42
var terrain: GodCivTerrain
var ground_layer: TileMapLayer
var feature_layer: TileMapLayer
var building_layer: TileMapLayer
var generating: bool = false

var _tile_source_id: int = 0
var _tile_source: TileSetAtlasSource
var _season: String = "spring"
var _era_stage: int = 0


func _ready() -> void:
	terrain = GodCivTerrain.new()
	_build_tileset()


func generate_async(p_seed: int) -> void:
	seed = p_seed
	generating = true
	_generate_async()


func _generate_async() -> void:
	terrain.prepare(seed)
	terrain.generate_old_block()
	for cz in 3:
		for cx in 3:
			_paint_chunk(cx, cz)
	generation_progress.emit(0.02)
	await get_tree().process_frame
	var done: int = 0
	var total: int = GodCivTerrain.CHUNKS_ACROSS * GodCivTerrain.CHUNKS_ACROSS - 9
	for cz in GodCivTerrain.CHUNKS_ACROSS:
		for cx in GodCivTerrain.CHUNKS_ACROSS:
			if cx < 3 and cz < 3:
				continue
			terrain.generate_chunk(cx, cz)
			_paint_chunk(cx, cz)
			done += 1
			if done % 8 == 0:
				generation_progress.emit(0.02 + 0.98 * float(done) / float(total))
				await get_tree().process_frame
	generation_progress.emit(1.0)
	generating = false
	generation_finished.emit()


func _classify_ground(x: int, z: int) -> int:
	if terrain.is_water(x, z):
		return TILE_WATER
	for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var nx: int = x + d.x
		var nz: int = z + d.y
		if nx >= 0 and nz >= 0 and nx < GodCivTerrain.WORLD_SIZE and nz < GodCivTerrain.WORLD_SIZE and terrain.is_water(nx, nz):
			return TILE_SHORE
	var h: float = terrain.height_at(x, z)
	if h >= 0.62:
		return TILE_ROCK
	if h >= 0.55:
		return TILE_GRASS_HIGH
	if h < 0.40:
		return TILE_GRASS_LOW
	# Meadow: ~8% of mid grass, a wildflower patch. Deterministic
	# per cell, so the map looks the same every load.
	if GodCivRng.hash01(seed, x, z, 402) < 0.08:
		return TILE_MEADOW
	return TILE_GRASS


func _paint_chunk(cx: int, cz: int) -> void:
	for lz in GodCivTerrain.CHUNK:
		for lx in GodCivTerrain.CHUNK:
			var x: int = cx * GodCivTerrain.CHUNK + lx
			var z: int = cz * GodCivTerrain.CHUNK + lz
			var cell := Vector2i(x, z)
			if terrain.is_farm(x, z):
				ground_layer.set_cell(cell, _tile_source_id, Vector2i(TILE_FARM, 0))
			else:
				ground_layer.set_cell(cell, _tile_source_id, Vector2i(_classify_ground(x, z), 0))
			if terrain.has_tree(x, z):
				feature_layer.set_cell(cell, _tile_source_id, Vector2i(tree_tile_for(x, z), 0))
			elif terrain.has_stone(x, z):
				var tile: int = TILE_ORE if terrain.has_ore(x, z) else TILE_STONE
				feature_layer.set_cell(cell, _tile_source_id, Vector2i(tile, 0))


## Phase 1 cell setters, called by the village as the sim mutates
## the world. Ground layer carries roads and crop stages; the
## feature layer carries trees and stone; the building layer
## carries raised buildings.

func cell_to_px(cell: Vector2i) -> Vector2:
	return Vector2(float(cell.x) * TILE_SIZE + 8.0, float(cell.y) * TILE_SIZE + 8.0)


## Which tree look a cell wears: ~30% pine, ~25% broadleaf, the
## rest the round deciduous tree. Deterministic from the seed and
## the cell, so a regrown tree matches the forest around it.
func tree_tile_for(x: int, z: int) -> int:
	var h: float = GodCivRng.hash01(seed, x, z, 401)
	return TILE_TREE2 if h < 0.3 else (TILE_TREE3 if h < 0.55 else TILE_TREE)


func set_building_cell(x: int, z: int, building_type: String, tier: int = 0) -> void:
	var tile: int = TILE_HUT
	match building_type:
		"granary":
			tile = TILE_GRANARY
		"towncenter":
			tile = TILE_TOWNCENTER
		"altar":
			tile = TILE_ALTAR
		"workshop":
			tile = TILE_WORKSHOP
		"kiln":
			tile = TILE_KILN
		"smithy":
			tile = TILE_SMITHY
		"factory":
			tile = TILE_FACTORY
		"school":
			tile = TILE_SCHOOL
		"healer":
			tile = TILE_HEALER
		"well":
			tile = TILE_WELL
		"shrine":
			tile = TILE_SHRINE
		"longhouse":
			tile = TILE_LONGHOUSE_T1 if tier >= 1 else TILE_LONGHOUSE
		"greathall":
			tile = TILE_GREATHALL_T1 if tier >= 1 else TILE_GREATHALL
		"farmhouse":
			tile = TILE_FARMHOUSE_T1 if tier >= 1 else TILE_FARMHOUSE
		"hut":
			tile = TILE_HUT_T2 if tier >= 2 else (TILE_HUT_T1 if tier >= 1 else TILE_HUT)
		"stall_food":
			tile = TILE_STALL_FOOD
		"stall_goods":
			tile = TILE_STALL_GOODS
		"stall_craft":
			tile = TILE_STALL_CRAFT
		"stall_grocer":
			tile = TILE_STALL_GROCER
	building_layer.set_cell(Vector2i(x, z), _tile_source_id, Vector2i(tile, 0))


func clear_building_cell(x: int, z: int) -> void:
	building_layer.erase_cell(Vector2i(x, z))


func set_road_cell(x: int, z: int, paved: bool = false) -> void:
	var tile: int = TILE_ROAD_PAVED if paved else TILE_ROAD
	ground_layer.set_cell(Vector2i(x, z), _tile_source_id, Vector2i(tile, 0))


## A street lamp post on a road cell (feature layer, so it sits
## over the road without replacing it). Placed by the village at
## the Electric age; re-placed quietly on load from a tech 5+ save.
func set_lamp_cell(x: int, z: int) -> void:
	feature_layer.set_cell(Vector2i(x, z), _tile_source_id, Vector2i(TILE_LAMP, 0))


func set_crop_cell(x: int, z: int, stage: int) -> void:
	var tile: int = TILE_FARM
	if stage == 1:
		tile = TILE_CROP1
	elif stage == 2:
		tile = TILE_CROP2
	elif stage >= 3:
		tile = TILE_CROP3
	ground_layer.set_cell(Vector2i(x, z), _tile_source_id, Vector2i(tile, 0))


func set_feature_cell(x: int, z: int, tile: int) -> void:
	feature_layer.set_cell(Vector2i(x, z), _tile_source_id, Vector2i(tile, 0))


func clear_feature_cell(x: int, z: int) -> void:
	feature_layer.erase_cell(Vector2i(x, z))


func _build_tileset() -> void:
	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(TILE_SIZE, TILE_SIZE)
	var source := TileSetAtlasSource.new()
	source.texture = _make_tiles_texture()
	source.texture_region_size = Vector2i(TILE_SIZE, TILE_SIZE)
	_tile_source = source
	_tile_source_id = tile_set.add_source(source)
	for i in TILE_COUNT:
		source.create_tile(Vector2i(i, 0))
	ground_layer = TileMapLayer.new()
	ground_layer.name = "Ground"
	ground_layer.tile_set = tile_set
	add_child(ground_layer)
	feature_layer = TileMapLayer.new()
	feature_layer.name = "Features"
	feature_layer.tile_set = tile_set
	add_child(feature_layer)
	building_layer = TileMapLayer.new()
	building_layer.name = "Buildings"
	building_layer.tile_set = tile_set
	add_child(building_layer)


## Season or era change: rebuild the atlas texture in place. The
## layers keep their cells; only the pictures change, so a village
## founded in spring looks different by winter, and a village that
## reaches Iron craft sees its thatch turn to tile. A headless
## probe can verify the swap by reading the texture image back
## (e.g. a tree pixel at the TILE_TREE cell differs summer/winter).
func apply_season(season: String) -> void:
	if season == _season:
		return
	_season = season
	_rebuild_texture()


func apply_era_stage(era_stage: int) -> void:
	if era_stage == _era_stage:
		return
	_era_stage = era_stage
	_rebuild_texture()


func apply_look(season: String, era_stage: int) -> void:
	_season = season
	_era_stage = era_stage
	_rebuild_texture()


func _rebuild_texture() -> void:
	if _tile_source != null:
		_tile_source.texture = _make_tiles_texture(_season, _era_stage)


## Roof/wall palette per visual era stage (the PWA's eraStageOf):
## 0 timber/thatch, 1 stone/tile, 2 brick/paved, 3 concrete/glass.
## Production and civic buildings keep their own palettes — they
## are tools of their trade, not homes — but the dwellings and the
## town hall grow up with the village.
func _era_palette(era_stage: int) -> Dictionary:
	match era_stage:
		1:
			return {
				"hut_wall": Color(0.62, 0.58, 0.50), "hut_roof": Color(0.65, 0.30, 0.20),
				"long_wall": Color(0.60, 0.56, 0.48), "long_roof": Color(0.62, 0.28, 0.18),
				"great_wall": Color(0.58, 0.55, 0.50), "great_roof": Color(0.60, 0.25, 0.18),
				"farm_wall": Color(0.62, 0.28, 0.18), "farm_roof": Color(0.72, 0.68, 0.62),
				"chimney": Color(0.55, 0.53, 0.50), "window": Color(0.25, 0.18, 0.10),
			}
		2:
			return {
				"hut_wall": Color(0.58, 0.35, 0.25), "hut_roof": Color(0.45, 0.20, 0.15),
				"long_wall": Color(0.55, 0.32, 0.22), "long_roof": Color(0.42, 0.18, 0.14),
				"great_wall": Color(0.55, 0.30, 0.22), "great_roof": Color(0.40, 0.16, 0.12),
				"farm_wall": Color(0.60, 0.38, 0.28), "farm_roof": Color(0.45, 0.20, 0.15),
				"chimney": Color(0.45, 0.22, 0.15), "window": Color(0.25, 0.18, 0.10),
			}
		3:
			return {
				"hut_wall": Color(0.78, 0.78, 0.76), "hut_roof": Color(0.35, 0.42, 0.52),
				"long_wall": Color(0.75, 0.75, 0.73), "long_roof": Color(0.32, 0.38, 0.48),
				"great_wall": Color(0.72, 0.72, 0.70), "great_roof": Color(0.30, 0.36, 0.46),
				"farm_wall": Color(0.80, 0.80, 0.78), "farm_roof": Color(0.35, 0.42, 0.52),
				"chimney": Color(0.55, 0.53, 0.50), "window": Color(0.65, 0.80, 0.90),
			}
	return {
		"hut_wall": Color(0.55, 0.42, 0.28), "hut_roof": Color(0.72, 0.60, 0.32),
		"long_wall": Color(0.55, 0.42, 0.28), "long_roof": Color(0.72, 0.60, 0.32),
		"great_wall": Color(0.60, 0.58, 0.54), "great_roof": Color(0.45, 0.30, 0.22),
		"farm_wall": Color(0.60, 0.22, 0.15), "farm_roof": Color(0.75, 0.72, 0.68),
		"chimney": Color(0.55, 0.53, 0.50), "window": Color(0.25, 0.18, 0.10),
	}


## Ground palette per season: spring bright, summer deep, autumn
## ochre, winter pale. The lake stays blue; the meadow keeps its
## flowers in spring and summer only.
func _season_ground(season: String) -> Dictionary:
	match season:
		"summer":
			return {"low": Color(0.32, 0.55, 0.22), "grass": Color(0.40, 0.62, 0.26), "high": Color(0.52, 0.62, 0.28), "meadow_flowers": true}
		"autumn":
			return {"low": Color(0.55, 0.45, 0.22), "grass": Color(0.62, 0.50, 0.25), "high": Color(0.65, 0.55, 0.30), "meadow_flowers": false}
		"winter":
			return {"low": Color(0.55, 0.55, 0.48), "grass": Color(0.60, 0.60, 0.52), "high": Color(0.62, 0.62, 0.55), "meadow_flowers": false}
	return {"low": Color(0.38, 0.58, 0.28), "grass": Color(0.45, 0.65, 0.30), "high": Color(0.58, 0.65, 0.33), "meadow_flowers": true}


## Leaf color per season for the deciduous trees (round + broadleaf).
## Winter returns null: the trees stand bare, trunk and branches.
func _season_leaf(season: String) -> Color:
	match season:
		"summer":
			return Color(0.16, 0.42, 0.15)
		"autumn":
			return Color(0.75, 0.45, 0.15)
		"winter":
			return Color(0, 0, 0, 0)
	return Color(0.28, 0.55, 0.22)


func _make_tiles_texture(season: String = "spring", era_stage: int = 0) -> ImageTexture:
	var img := Image.create(TILE_COUNT * TILE_SIZE, TILE_SIZE, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var ground: Dictionary = _season_ground(season)
	var pal: Dictionary = _era_palette(era_stage)
	var leaf: Color = _season_leaf(season)
	_fill_ground_tile(img, TILE_WATER, Color(0.16, 0.38, 0.62))
	_fill_ground_tile(img, TILE_SHORE, Color(0.85, 0.76, 0.55))
	_fill_ground_tile(img, TILE_GRASS_LOW, ground["low"])
	_fill_ground_tile(img, TILE_GRASS, ground["grass"])
	_fill_ground_tile(img, TILE_GRASS_HIGH, ground["high"])
	_fill_ground_tile(img, TILE_ROCK, Color(0.55, 0.53, 0.50))
	_draw_tree_tile(img, TILE_TREE, leaf)
	_draw_pine_tile(img, TILE_TREE2, season)
	_draw_broadleaf_tile(img, TILE_TREE3, leaf)
	_draw_meadow_tile(img, TILE_MEADOW, ground["grass"], bool(ground["meadow_flowers"]))
	_draw_stone_tile(img, TILE_STONE, Color(0.58, 0.58, 0.55))
	_draw_ore_tile(img, TILE_ORE)
	_draw_hut_tile(img, TILE_HUT, pal["hut_wall"], pal["hut_roof"])
	_draw_hut_tile(img, TILE_HUT_T1, pal["hut_wall"], pal["hut_roof"], true, false, pal["window"])
	_draw_hut_tile(img, TILE_HUT_T2, pal["hut_wall"], pal["hut_roof"], true, true, pal["window"])
	_draw_granary_tile(img, TILE_GRANARY)
	_draw_towncenter_tile(img, TILE_TOWNCENTER, pal["great_roof"])
	_draw_altar_tile(img, TILE_ALTAR)
	_draw_road_tile(img, TILE_ROAD)
	_draw_paved_road_tile(img, TILE_ROAD_PAVED)
	_draw_crop_tile(img, TILE_FARM, 0)
	_draw_crop_tile(img, TILE_CROP1, 1)
	_draw_crop_tile(img, TILE_CROP2, 2)
	_draw_crop_tile(img, TILE_CROP3, 3)
	_draw_house_tile(img, TILE_WORKSHOP, Color(0.55, 0.42, 0.28), Color(0.40, 0.30, 0.22), Color(0.25, 0.18, 0.10))
	_draw_kiln_tile(img, TILE_KILN)
	_draw_house_tile(img, TILE_SMITHY, Color(0.35, 0.35, 0.36), Color(0.25, 0.25, 0.26), Color(0.95, 0.45, 0.10))
	_draw_factory_tile(img, TILE_FACTORY)
	_draw_house_tile(img, TILE_SCHOOL, Color(0.88, 0.85, 0.78), Color(0.65, 0.20, 0.15), Color(0.30, 0.25, 0.20))
	_draw_house_tile(img, TILE_HEALER, Color(0.88, 0.85, 0.78), Color(0.30, 0.50, 0.30), Color(0.25, 0.18, 0.10))
	_draw_well_tile(img, TILE_WELL)
	_draw_shrine_tile(img, TILE_SHRINE)
	_draw_longhouse_tile(img, TILE_LONGHOUSE, pal["long_wall"], pal["long_roof"])
	_draw_longhouse_tile(img, TILE_LONGHOUSE_T1, pal["long_wall"], pal["long_roof"], true, true)
	_draw_greathall_tile(img, TILE_GREATHALL, pal["great_wall"], pal["great_roof"])
	_draw_greathall_tile(img, TILE_GREATHALL_T1, pal["great_wall"], pal["great_roof"], true)
	_draw_house_tile(img, TILE_FARMHOUSE, pal["farm_wall"], pal["farm_roof"], Color(0.90, 0.88, 0.82))
	_draw_house_tile(img, TILE_FARMHOUSE_T1, pal["farm_wall"], pal["farm_roof"], Color(0.90, 0.88, 0.82))
	_draw_chimney(img, TILE_FARMHOUSE_T1, pal["chimney"])
	_draw_stall_tile(img, TILE_STALL_FOOD, Color(0.85, 0.20, 0.15), Color(0.90, 0.85, 0.70), [Color(0.80, 0.15, 0.10), Color(0.25, 0.55, 0.15), Color(0.90, 0.60, 0.10)])
	_draw_stall_tile(img, TILE_STALL_GOODS, Color(0.40, 0.30, 0.55), Color(0.90, 0.85, 0.70), [Color(0.55, 0.40, 0.20), Color(0.45, 0.35, 0.25), Color(0.60, 0.55, 0.50)])
	_draw_stall_tile(img, TILE_STALL_CRAFT, Color(0.55, 0.30, 0.60), Color(0.85, 0.80, 0.90), [Color(0.45, 0.30, 0.60), Color(0.60, 0.35, 0.20), Color(0.30, 0.50, 0.30)])
	_draw_stall_tile(img, TILE_STALL_GROCER, Color(0.25, 0.55, 0.25), Color(0.90, 0.85, 0.70), [Color(0.25, 0.55, 0.15), Color(0.90, 0.55, 0.10), Color(0.85, 0.75, 0.20)])
	_draw_lamp_tile(img, TILE_LAMP)
	return ImageTexture.create_from_image(img)


func _fill_ground_tile(img: Image, tile: int, base: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			var n: float = GodCivRng.hash01(12345, tile * 1000 + px, py, 77)
			var f: float = 0.92 + n * 0.16
			img.set_pixel(ox + px, py, Color(base.r * f, base.g * f, base.b * f, 1.0))


## Round deciduous tree. `leaf` is the season leaf color; winter
## passes a fully transparent color, so the tree stands bare:
## trunk and thin branches, no canopy.
func _draw_tree_tile(img: Image, tile: int, leaf: Color = Color(0.18, 0.42, 0.16)) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(11, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.42, 0.28, 0.14, 1.0))
	if leaf.a > 0.0:
		for py in TILE_SIZE:
			for px in TILE_SIZE:
				if Vector2(px, py).distance_to(Vector2(8, 6)) <= 5.5:
					var n: float = GodCivRng.hash01(54321, px, py, 9)
					var f: float = 0.9 + n * 0.2
					img.set_pixel(ox + px, py, Color(leaf.r * f, leaf.g * f, leaf.b * f, 1.0))
	else:
		# Bare branches: a few thin lines reaching up from the trunk.
		for p in [Vector2i(8, 10), Vector2i(8, 9), Vector2i(8, 8), Vector2i(7, 7), Vector2i(9, 7), Vector2i(6, 6), Vector2i(10, 6), Vector2i(5, 5), Vector2i(11, 5)]:
			img.set_pixel(ox + p.x, p.y, Color(0.42, 0.28, 0.14, 1.0))


## Pine: a dark green triangle stack, evergreen in every season
## (slightly greyed in winter).
func _draw_pine_tile(img: Image, tile: int, season: String) -> void:
	var ox: int = tile * TILE_SIZE
	var pine: Color = Color(0.20, 0.30, 0.22) if season == "winter" else Color(0.13, 0.32, 0.15)
	for py in range(12, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.42, 0.28, 0.14, 1.0))
	for row in range(0, 4):
		var y0: int = 2 + row * 3
		var half: int = 2 + row * 2
		for py in range(y0, y0 + 3):
			for px in range(8 - half, 8 + half):
				var n: float = GodCivRng.hash01(43210, tile * 1000 + px, py, 21)
				var f: float = 0.9 + n * 0.2
				img.set_pixel(ox + px, py, Color(pine.r * f, pine.g * f, pine.b * f, 1.0))


## Broadleaf: a bigger, flatter canopy than the round tree, same
## season leaf color. Bare in winter too.
func _draw_broadleaf_tile(img: Image, tile: int, leaf: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(11, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.42, 0.28, 0.14, 1.0))
	if leaf.a > 0.0:
		for py in TILE_SIZE:
			for px in TILE_SIZE:
				if Vector2(px, py).distance_to(Vector2(8, 7)) <= 6.5 and py <= 10:
					var n: float = GodCivRng.hash01(65432, px, py, 11)
					var f: float = 0.9 + n * 0.2
					img.set_pixel(ox + px, py, Color(leaf.r * f, leaf.g * f, leaf.b * f, 1.0))
	else:
		for p in [Vector2i(8, 10), Vector2i(8, 9), Vector2i(8, 8), Vector2i(7, 7), Vector2i(9, 7), Vector2i(6, 6), Vector2i(10, 6), Vector2i(5, 5), Vector2i(11, 5), Vector2i(4, 6), Vector2i(12, 6)]:
			img.set_pixel(ox + p.x, p.y, Color(0.42, 0.28, 0.14, 1.0))


## Meadow: grass with wildflower dots in spring and summer, plain
## grass with a few dry stalks in autumn and winter.
func _draw_meadow_tile(img: Image, tile: int, grass: Color, flowers: bool) -> void:
	_fill_ground_tile(img, tile, grass)
	var ox: int = tile * TILE_SIZE
	var dots: Array = [Color(0.95, 0.95, 0.90), Color(0.95, 0.85, 0.20), Color(0.90, 0.45, 0.60)] if flowers else [Color(0.70, 0.60, 0.35), Color(0.60, 0.50, 0.30)]
	var i: int = 0
	for p in [Vector2i(3, 4), Vector2i(11, 3), Vector2i(6, 9), Vector2i(13, 11), Vector2i(2, 12)]:
		img.set_pixel(ox + p.x, p.y, dots[i % dots.size()])
		i += 1


func _draw_stone_tile(img: Image, tile: int, base: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			var ex: float = (float(px) - 8.0) / 6.0
			var ey: float = (float(py) - 11.0) / 4.0
			var d: float = ex * ex + ey * ey
			if d <= 1.0:
				var f: float = 0.8 if d > 0.8 else 1.0
				img.set_pixel(ox + px, py, Color(base.r * f, base.g * f, base.b * f, 1.0))


func _draw_ore_tile(img: Image, tile: int) -> void:
	_draw_stone_tile(img, tile, Color(0.58, 0.58, 0.55))
	var ox: int = tile * TILE_SIZE
	var ore_color := Color(0.85, 0.5, 0.2, 1.0)
	for p in [Vector2i(5, 9), Vector2i(10, 8), Vector2i(8, 12), Vector2i(11, 11)]:
		img.set_pixel(ox + p.x, p.y, ore_color)


func _draw_hut_tile(img: Image, tile: int, wall: Color, roof: Color, chimney: bool = false, trim: bool = false, window: Color = Color(0, 0, 0, 0)) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(9, TILE_SIZE):
		for px in range(2, 14):
			img.set_pixel(ox + px, py, wall)
	for py in range(3, 10):
		var half: int = py - 2
		for px in range(8 - half, 8 + half):
			img.set_pixel(ox + px, py, roof)
	for py in range(11, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
	if trim:
		# Gentry trim: a gold band under the roofline.
		for px in range(2, 14):
			img.set_pixel(ox + px, 9, Color(0.85, 0.70, 0.25))
	if chimney:
		for py in range(2, 6):
			for px in range(11, 13):
				img.set_pixel(ox + px, py, Color(0.55, 0.53, 0.50))
	if window.a > 0.0:
		for py in range(11, 13):
			for px in range(4, 6):
				img.set_pixel(ox + px, py, window)
		if trim:
			for py in range(11, 13):
				for px in range(10, 12):
					img.set_pixel(ox + px, py, window)


## A chimney stack on a roof's right side, for the tier-1
## farmhouse (the house tile is generic, so the chimney is added
## after it by the texture builder).
func _draw_chimney(img: Image, tile: int, brick: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(2, 6):
		for px in range(11, 13):
			img.set_pixel(ox + px, py, brick)


func _draw_granary_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	var wall := Color(0.60, 0.46, 0.30)
	var roof := Color(0.68, 0.52, 0.28)
	for py in range(7, TILE_SIZE):
		for px in range(1, 15):
			img.set_pixel(ox + px, py, wall)
	for py in range(2, 8):
		var half: int = py - 1
		for px in range(8 - half, 8 + half):
			img.set_pixel(ox + px, py, roof)
	for py in [9, 12]:
		for px in range(1, 15):
			img.set_pixel(ox + px, py, Color(0.42, 0.30, 0.18))


func _draw_towncenter_tile(img: Image, tile: int, roof: Color) -> void:
	# The town hall: a wide stone hall with an arched door, two
	# windows, steps at the base, and a banner on a pole — the
	# village's civic heart, readable at a glance. Its roof grows
	# up with the era like the dwellings.
	var ox: int = tile * TILE_SIZE
	var stone := Color(0.62, 0.60, 0.56)
	var stone_dark := Color(0.50, 0.48, 0.44)
	for py in range(8, TILE_SIZE):
		for px in range(1, 15):
			img.set_pixel(ox + px, py, stone)
	for py in range(3, 9):
		var half: int = py - 2
		for px in range(8 - half, 8 + half):
			img.set_pixel(ox + px, py, roof)
	# Stone base row and steps.
	for px in range(1, 15):
		img.set_pixel(ox + px, 15, stone_dark)
	for px in range(5, 11):
		img.set_pixel(ox + px, 14, stone_dark)
	# Arched door: two wide, one narrow at the top.
	for py in range(11, 15):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
	img.set_pixel(ox + 7, 10, Color(0.25, 0.18, 0.10))
	# Two windows.
	for py in range(10, 12):
		for px in range(3, 5):
			img.set_pixel(ox + px, py, Color(0.65, 0.80, 0.90))
		for px in range(11, 13):
			img.set_pixel(ox + px, py, Color(0.65, 0.80, 0.90))
	# Banner on a pole.
	for py in range(0, 4):
		img.set_pixel(ox + 8, py, Color(0.30, 0.25, 0.20))
	for py in range(0, 3):
		for px in range(9, 14):
			img.set_pixel(ox + px, py, Color(0.75, 0.25, 0.20))
	img.set_pixel(ox + 13, 2, Color(0.75, 0.25, 0.20))


func _draw_altar_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	var stone := Color(0.66, 0.64, 0.60)
	for py in range(8, TILE_SIZE):
		for px in range(4, 12):
			img.set_pixel(ox + px, py, stone)
	for py in range(6, 8):
		for px in range(3, 13):
			img.set_pixel(ox + px, py, stone)
	img.set_pixel(ox + 8, 5, Color(0.95, 0.80, 0.30))


func _draw_road_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	var base := Color(0.72, 0.60, 0.42)
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			var n: float = GodCivRng.hash01(777, tile * 1000 + px, py, 31)
			var f: float = 0.9 + n * 0.2
			img.set_pixel(ox + px, py, Color(base.r * f, base.g * f, base.b * f, 1.0))


## Paved road (Steel works): grey cobbles with darker joints, so
## a paved street reads against a dirt one at a glance.
func _draw_paved_road_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	var base := Color(0.55, 0.55, 0.58)
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			var n: float = GodCivRng.hash01(778, tile * 1000 + px, py, 33)
			var f: float = 0.9 + n * 0.2
			img.set_pixel(ox + px, py, Color(base.r * f, base.g * f, base.b * f, 1.0))
	for py in [4, 11]:
		for px in TILE_SIZE:
			img.set_pixel(ox + px, py, Color(0.38, 0.38, 0.42))
	for px in [5, 10]:
		for py in TILE_SIZE:
			img.set_pixel(ox + px, py, Color(0.38, 0.38, 0.42))


## A market stall: striped awning, counter, and the goods it
## sells dotted on the counter. `goods` are three dot colors.
func _draw_stall_tile(img: Image, tile: int, awning: Color, cloth: Color, goods: Array) -> void:
	var ox: int = tile * TILE_SIZE
	# Awning: alternating stripes across the top.
	for px in TILE_SIZE:
		var c: Color = awning if (px / 2) % 2 == 0 else cloth
		for py in range(1, 5):
			img.set_pixel(ox + px, py, c)
	# Two posts.
	for py in range(5, 13):
		img.set_pixel(ox + 2, py, Color(0.42, 0.28, 0.14))
		img.set_pixel(ox + 13, py, Color(0.42, 0.28, 0.14))
	# Counter.
	for py in range(10, 13):
		for px in range(2, 14):
			img.set_pixel(ox + px, py, Color(0.55, 0.42, 0.28))
	# Goods on the counter.
	var i: int = 0
	for p in [Vector2i(4, 9), Vector2i(7, 9), Vector2i(10, 9), Vector2i(5, 8), Vector2i(9, 8)]:
		img.set_pixel(ox + p.x, p.y, goods[i % goods.size()])
		i += 1


## A street lamp: a dark post with a glowing bulb and halo. The
## tile itself is transparent around the post, so it sits over a
## road without hiding it.
func _draw_lamp_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(6, 15):
		img.set_pixel(ox + 8, py, Color(0.20, 0.18, 0.16))
	for py in range(13, 15):
		for px in range(6, 11):
			img.set_pixel(ox + px, py, Color(0.20, 0.18, 0.16))
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			if Vector2(px, py).distance_to(Vector2(8, 4)) <= 3.0:
				img.set_pixel(ox + px, py, Color(0.95, 0.85, 0.45, 0.35))
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			if Vector2(px, py).distance_to(Vector2(8, 4)) <= 2.0:
				img.set_pixel(ox + px, py, Color(1.0, 0.9, 0.5, 1.0))


func _draw_crop_tile(img: Image, tile: int, stage: int) -> void:
	var ox: int = tile * TILE_SIZE
	var soil := Color(0.42, 0.30, 0.18)
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			img.set_pixel(ox + px, py, soil)
	for px in [3, 7, 11, 14]:
		for py in TILE_SIZE:
			img.set_pixel(ox + px, py, Color(0.32, 0.22, 0.12))
	if stage >= 1:
		var sprout := Color(0.30, 0.60, 0.22) if stage < 3 else Color(0.85, 0.70, 0.25)
		var height: int = 2 if stage == 1 else (4 if stage == 2 else 6)
		for px in [2, 5, 8, 12]:
			for py in range(14 - height, 14):
				img.set_pixel(ox + px, py, sprout)


# Generic house: wall rect, triangular roof, door. The Phase 2
# production and civic buildings share the shape and differ by
# palette, so each reads at a glance on the map.
func _draw_house_tile(img: Image, tile: int, wall: Color, roof: Color, door: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(9, TILE_SIZE):
		for px in range(2, 14):
			img.set_pixel(ox + px, py, wall)
	for py in range(3, 10):
		var half: int = py - 2
		for px in range(8 - half, 8 + half):
			img.set_pixel(ox + px, py, roof)
	for py in range(11, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, door)


func _draw_kiln_tile(img: Image, tile: int) -> void:
	# A brick dome: round top, dark mouth.
	var ox: int = tile * TILE_SIZE
	var brick := Color(0.62, 0.30, 0.22)
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			if Vector2(px, py).distance_to(Vector2(8, 10)) <= 6.5 and py >= 4:
				img.set_pixel(ox + px, py, brick)
	for py in range(10, 15):
		for px in range(6, 10):
			img.set_pixel(ox + px, py, Color(0.15, 0.10, 0.08))
	img.set_pixel(ox + 8, 3, Color(0.95, 0.55, 0.15))


func _draw_factory_tile(img: Image, tile: int) -> void:
	# A tall grey block with a chimney: the village's first industry.
	var ox: int = tile * TILE_SIZE
	var block := Color(0.45, 0.45, 0.48)
	for py in range(4, TILE_SIZE):
		for px in range(1, 12):
			img.set_pixel(ox + px, py, block)
	for py in range(0, 8):
		for px in range(12, 15):
			img.set_pixel(ox + px, py, Color(0.55, 0.25, 0.20))
	for py in range(10, 13):
		for px in range(4, 7):
			img.set_pixel(ox + px, py, Color(0.95, 0.60, 0.15))
	for px in range(2, 11):
		img.set_pixel(ox + px, 4, Color(0.30, 0.30, 0.32))


func _draw_well_tile(img: Image, tile: int) -> void:
	# A stone ring with two posts and a little roof.
	var ox: int = tile * TILE_SIZE
	var stone := Color(0.60, 0.58, 0.54)
	for py in range(9, 15):
		for px in range(3, 13):
			if Vector2(px, py).distance_to(Vector2(8, 12)) <= 4.5:
				img.set_pixel(ox + px, py, stone)
	for py in range(11, 14):
		for px in range(5, 11):
			img.set_pixel(ox + px, py, Color(0.16, 0.38, 0.62))
	for py in range(3, 9):
		img.set_pixel(ox + 4, py, Color(0.42, 0.28, 0.14))
		img.set_pixel(ox + 11, py, Color(0.42, 0.28, 0.14))
	for py in range(1, 5):
		var half: int = py
		for px in range(8 - half, 8 + half):
			img.set_pixel(ox + px, py, Color(0.72, 0.60, 0.32))


func _draw_shrine_tile(img: Image, tile: int) -> void:
	# A taller altar with a gold flame: faith you can see.
	var ox: int = tile * TILE_SIZE
	var stone := Color(0.66, 0.64, 0.60)
	for py in range(9, TILE_SIZE):
		for px in range(3, 13):
			img.set_pixel(ox + px, py, stone)
	for py in range(7, 9):
		for px in range(2, 14):
			img.set_pixel(ox + px, py, stone)
	img.set_pixel(ox + 8, 6, Color(0.95, 0.80, 0.30))
	img.set_pixel(ox + 7, 5, Color(0.95, 0.60, 0.15))
	img.set_pixel(ox + 9, 5, Color(0.95, 0.60, 0.15))
	img.set_pixel(ox + 8, 4, Color(0.95, 0.80, 0.30))


func _draw_longhouse_tile(img: Image, tile: int, wall: Color, roof: Color, chimney: bool = false, trim: bool = false) -> void:
	# A long low timber hall: twice the hut, one long roof.
	var ox: int = tile * TILE_SIZE
	for py in range(10, TILE_SIZE):
		for px in range(0, 16):
			img.set_pixel(ox + px, py, wall)
	for py in range(4, 11):
		var half: int = (py - 3) * 2
		for px in range(maxi(0, 8 - half), mini(16, 8 + half)):
			img.set_pixel(ox + px, py, roof)
	for py in range(12, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
	if trim:
		# Timber trim: a pale band under the roofline, two windows.
		for px in range(0, 16):
			img.set_pixel(ox + px, 10, Color(0.85, 0.80, 0.70))
		for py in range(12, 14):
			for px in range(2, 4):
				img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
			for px in range(12, 14):
				img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
	if chimney:
		for py in range(2, 6):
			for px in range(12, 14):
				img.set_pixel(ox + px, py, Color(0.55, 0.53, 0.50))


func _draw_greathall_tile(img: Image, tile: int, wall: Color, roof: Color, grand: bool = false) -> void:
	# A great hall: tall roof, stone base, a banner on top.
	var ox: int = tile * TILE_SIZE
	for py in range(10, TILE_SIZE):
		for px in range(1, 15):
			img.set_pixel(ox + px, py, wall)
	for py in range(2, 11):
		var half: int = py - 1
		for px in range(maxi(1, 8 - half), mini(15, 8 + half)):
			img.set_pixel(ox + px, py, roof)
	for py in range(12, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.25, 0.18, 0.10))
	for py in range(0, 3):
		img.set_pixel(ox + 8, py, Color(0.30, 0.25, 0.20))
	for px in range(9, 13):
		img.set_pixel(ox + px, 1, Color(0.75, 0.25, 0.20))
	if grand:
		# A grand hall: a second banner and a stone base row.
		for px in range(3, 7):
			img.set_pixel(ox + px, 1, Color(0.75, 0.25, 0.20))
		for px in range(1, 15):
			img.set_pixel(ox + px, 15, Color(0.45, 0.43, 0.40))
