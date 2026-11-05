class_name GodCivWorld
extends Node2D

# The 320x320 world as two TileMapLayers (ground + features), generated
# from GodCivTerrain in chunks across frames so startup stays responsive.
# The TileSet texture is generated procedurally in code — no binary
# assets — so the whole project stays UTF-8 text.
#
# Ground tile by height band is a RENDER choice, not a sim rule: water
# and shore follow the PWA exactly (water = lake disc + h < 0.62;
# shore = land beside water); the grass/rock bands only shade the map.

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
const TILE_COUNT: int = 9

var seed: int = 42
var terrain: GodCivTerrain
var ground_layer: TileMapLayer
var feature_layer: TileMapLayer
var generating: bool = false

var _tile_source_id: int = 0


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
	return TILE_GRASS


func _paint_chunk(cx: int, cz: int) -> void:
	for lz in GodCivTerrain.CHUNK:
		for lx in GodCivTerrain.CHUNK:
			var x: int = cx * GodCivTerrain.CHUNK + lx
			var z: int = cz * GodCivTerrain.CHUNK + lz
			var cell := Vector2i(x, z)
			ground_layer.set_cell(cell, _tile_source_id, Vector2i(_classify_ground(x, z), 0))
			if terrain.has_tree(x, z):
				feature_layer.set_cell(cell, _tile_source_id, Vector2i(TILE_TREE, 0))
			elif terrain.has_stone(x, z):
				var tile: int = TILE_ORE if terrain.has_ore(x, z) else TILE_STONE
				feature_layer.set_cell(cell, _tile_source_id, Vector2i(tile, 0))


func _build_tileset() -> void:
	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(TILE_SIZE, TILE_SIZE)
	var source := TileSetAtlasSource.new()
	source.texture = _make_tiles_texture()
	source.texture_region_size = Vector2i(TILE_SIZE, TILE_SIZE)
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


func _make_tiles_texture() -> ImageTexture:
	var img := Image.create(TILE_COUNT * TILE_SIZE, TILE_SIZE, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_ground_tile(img, TILE_WATER, Color(0.16, 0.38, 0.62))
	_fill_ground_tile(img, TILE_SHORE, Color(0.85, 0.76, 0.55))
	_fill_ground_tile(img, TILE_GRASS_LOW, Color(0.35, 0.55, 0.25))
	_fill_ground_tile(img, TILE_GRASS, Color(0.42, 0.62, 0.28))
	_fill_ground_tile(img, TILE_GRASS_HIGH, Color(0.55, 0.62, 0.30))
	_fill_ground_tile(img, TILE_ROCK, Color(0.55, 0.53, 0.50))
	_draw_tree_tile(img, TILE_TREE)
	_draw_stone_tile(img, TILE_STONE, Color(0.58, 0.58, 0.55))
	_draw_ore_tile(img, TILE_ORE)
	return ImageTexture.create_from_image(img)


func _fill_ground_tile(img: Image, tile: int, base: Color) -> void:
	var ox: int = tile * TILE_SIZE
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			var n: float = GodCivRng.hash01(12345, tile * 1000 + px, py, 77)
			var f: float = 0.92 + n * 0.16
			img.set_pixel(ox + px, py, Color(base.r * f, base.g * f, base.b * f, 1.0))


func _draw_tree_tile(img: Image, tile: int) -> void:
	var ox: int = tile * TILE_SIZE
	for py in range(11, TILE_SIZE):
		for px in range(7, 9):
			img.set_pixel(ox + px, py, Color(0.42, 0.28, 0.14, 1.0))
	for py in TILE_SIZE:
		for px in TILE_SIZE:
			if Vector2(px, py).distance_to(Vector2(8, 6)) <= 5.5:
				var n: float = GodCivRng.hash01(54321, px, py, 9)
				var f: float = 0.9 + n * 0.2
				img.set_pixel(ox + px, py, Color(0.18 * f, 0.42 * f, 0.16 * f, 1.0))


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
