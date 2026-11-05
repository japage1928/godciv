class_name GodCivTerrain
extends RefCounted

# Seeded terrain, ported faithfully from the PWA:
#   src/sim/core.js     (WORLD_SIZE, CHUNK, OLD_SIZE, mulberry32)
#   src/sim/terrain.js  (terrainHeight, chunkLake, isLandAt, generateOldBlock)
#   src/sim/grid.js     (genChunkCells: new-territory tree/stone rules)
# No new terrain rules are invented here. Height bands used for tile
# rendering live in world.gd and are a render choice, not sim rules.
#
# Layout: the 48x48 old block keeps its exact PWA coordinates
# (center (24, 24), lake at (36, 36)), reproduced from the same RNG
# stream in the same draw order. New territory is pure hash arithmetic
# of (seed, chunk, cell), so generation order cannot change a cell.
#
# DEFERRED to Phase 4 (neighbor villages): the neighbor-village site
# clearing in genChunkCells, which needs pickVillageSites. The terrain
# itself is complete without it.

const WORLD_SIZE: int = 320
const CHUNK: int = 16
const CHUNKS_ACROSS: int = 20
const OLD_SIZE: int = 48
const OLD_CENTER: int = 24
const WATER_HEIGHT: float = 0.62
const OLD_LAKE: Vector2i = Vector2i(36, 36)
const OLD_LAKE_RADIUS: float = 6.5

const FLAG_WATER: int = 1
const FLAG_TREE: int = 2
const FLAG_STONE: int = 4
const FLAG_ORE: int = 8
const FLAG_FARM: int = 16

var seed: int = 42
var heights: PackedFloat32Array = PackedFloat32Array()
var flags: PackedByteArray = PackedByteArray()

var _coarse: PackedFloat32Array = PackedFloat32Array()
var _lattice_cache: Dictionary = {}


func _index(x: int, z: int) -> int:
	return x + z * WORLD_SIZE


func _has_flag(idx: int, flag: int) -> bool:
	return (flags[idx] & flag) != 0


func is_water(x: int, z: int) -> bool:
	return _has_flag(_index(x, z), FLAG_WATER)


func has_tree(x: int, z: int) -> bool:
	return _has_flag(_index(x, z), FLAG_TREE)


func has_stone(x: int, z: int) -> bool:
	return _has_flag(_index(x, z), FLAG_STONE)


func has_ore(x: int, z: int) -> bool:
	return _has_flag(_index(x, z), FLAG_ORE)


func is_farm(x: int, z: int) -> bool:
	return _has_flag(_index(x, z), FLAG_FARM)


func height_at(x: int, z: int) -> float:
	return heights[_index(x, z)]


static func _smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)


## Allocate the grids and build the 9x9 coarse lattice from the first
## 81 draws of mulberry32(seed). Same values the old block draws.
func prepare(p_seed: int) -> void:
	seed = p_seed
	_lattice_cache.clear()
	heights = PackedFloat32Array()
	heights.resize(WORLD_SIZE * WORLD_SIZE)
	flags = PackedByteArray()
	flags.resize(WORLD_SIZE * WORLD_SIZE)
	var rng := GodCivRng.new(seed)
	_coarse = PackedFloat32Array()
	_coarse.resize(81)
	for i in 81:
		_coarse[i] = rng.next_float()


func _lattice_value(lx: int, lz: int) -> float:
	if lx >= 0 and lx <= 8 and lz >= 0 and lz <= 8:
		return _coarse[lx * 9 + lz]
	var k := Vector2i(lx, lz)
	if _lattice_cache.has(k):
		return float(_lattice_cache[k])
	var v: float = GodCivRng.hash01(seed, lx, lz, 101)
	_lattice_cache[k] = v
	return v


## Terrain height. The noise span stays pinned at 48 (OLD_SIZE): the
## formula is (x / 48) * 8 at every map size, so old-world heights
## never shift. The lattice extends past 8x8 by hash.
func terrain_height(x: int, z: int) -> float:
	var gx: float = (float(x) / float(OLD_SIZE)) * 8.0
	var gz: float = (float(z) / float(OLD_SIZE)) * 8.0
	var x0: int = int(floor(gx))
	var z0: int = int(floor(gz))
	var fx: float = gx - float(x0)
	var fz: float = gz - float(z0)
	var a: float = _lattice_value(x0, z0)
	var b: float = _lattice_value(x0 + 1, z0)
	var c: float = _lattice_value(x0, z0 + 1)
	var d: float = _lattice_value(x0 + 1, z0 + 1)
	var sx: float = _smooth(fx)
	var sz: float = _smooth(fz)
	return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz


## A new-territory lake, if this chunk hashes to one: about 1 chunk in
## 12, a disc of radius 3-6 at a hashed center, only where the noise
## height is low. Pure function of (seed, chunk). Empty dict = no lake.
func chunk_lake(cx: int, cz: int) -> Dictionary:
	if GodCivRng.hash01(seed, cx, cz, 301) >= 1.0 / 12.0:
		return {}
	var lx: int = int(GodCivRng.hash01(seed, cx, cz, 302) * float(CHUNK))
	var lz: int = int(GodCivRng.hash01(seed, cz, cx, 302) * float(CHUNK))
	var r: int = 3 + int(GodCivRng.hash01(seed, cx, cz, 303) * 4.0)
	return {"x": cx * CHUNK + lx, "z": cz * CHUNK + lz, "r": r}


## Land check, port of isLandAt: water where a lake disc overlaps low
## ground (h < 0.62). Old block uses the fixed lake at (36, 36).
func is_land(x: int, z: int) -> bool:
	var h: float = terrain_height(x, z)
	if x < OLD_SIZE and z < OLD_SIZE:
		return not (Vector2(x, z).distance_to(Vector2(OLD_LAKE.x, OLD_LAKE.y)) < OLD_LAKE_RADIUS and h < WATER_HEIGHT)
	var lake := chunk_lake(x / CHUNK, z / CHUNK)
	if lake.is_empty():
		return true
	return not (Vector2(x, z).distance_to(Vector2(int(lake["x"]), int(lake["z"]))) < float(lake["r"]) and h < WATER_HEIGHT)


func _old_noise_at(coarse: PackedFloat32Array, x: int, z: int) -> float:
	var gx: float = (float(x) / float(OLD_SIZE)) * 8.0
	var gz: float = (float(z) / float(OLD_SIZE)) * 8.0
	var x0: int = int(floor(gx))
	var z0: int = int(floor(gz))
	var fx: float = gx - float(x0)
	var fz: float = gz - float(z0)
	var sx: float = _smooth(fx)
	var sz: float = _smooth(fz)
	var a: float = coarse[x0 * 9 + z0]
	var b: float = coarse[mini(8, x0 + 1) * 9 + z0]
	var c: float = coarse[x0 * 9 + mini(8, z0 + 1)]
	var d: float = coarse[mini(8, x0 + 1) * 9 + mini(8, z0 + 1)]
	return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz


## The original 48x48 generation, verbatim: same RNG draw order, same
## clearing, same farm plots, same tree/stone rejection loops. Draws
## that only feed values Phase 0 does not store (crop growth, stone
## and ore amounts) are still drawn, in order, so the stream stays
## identical to the PWA.
func generate_old_block() -> void:
	var rng := GodCivRng.new(seed)
	var coarse := PackedFloat32Array()
	coarse.resize(81)
	for i in 81:
		coarse[i] = rng.next_float()
	for x in OLD_SIZE:
		for z in OLD_SIZE:
			var h: float = _old_noise_at(coarse, x, z)
			var idx := _index(x, z)
			heights[idx] = h
			var d_lake: float = Vector2(x, z).distance_to(Vector2(OLD_LAKE.x, OLD_LAKE.y))
			if d_lake < OLD_LAKE_RADIUS and h < WATER_HEIGHT:
				flags[idx] |= FLAG_WATER
	# Founding clearing: 13x13 around (24, 24).
	for x in range(OLD_CENTER - 6, OLD_CENTER + 7):
		for z in range(OLD_CENTER - 6, OLD_CENTER + 7):
			if x < 0 or z < 0 or x >= OLD_SIZE or z >= OLD_SIZE:
				continue
			var idx := _index(x, z)
			flags[idx] &= ~FLAG_WATER
			flags[idx] &= ~FLAG_TREE
			flags[idx] &= ~FLAG_STONE
			flags[idx] &= ~FLAG_ORE
	# Farm plots west of center: cropGrow draws stay in order.
	for x in range(OLD_CENTER - 6, OLD_CENTER - 3):
		for z in range(OLD_CENTER - 1, OLD_CENTER + 2):
			rng.next_float()
			flags[_index(x, z)] |= FLAG_FARM
	for x in range(OLD_CENTER - 6, OLD_CENTER - 3):
		for z in range(OLD_CENTER + 3, OLD_CENTER + 6):
			rng.next_float()
			flags[_index(x, z)] |= FLAG_FARM
	# Trees: 90 attempts, none within 8 of center, none on water/farm.
	for i in 90:
		var x: int = int(rng.next_float() * float(OLD_SIZE))
		var z: int = int(rng.next_float() * float(OLD_SIZE))
		var idx := _index(x, z)
		if _has_flag(idx, FLAG_WATER):
			continue
		if Vector2(x, z).distance_to(Vector2(OLD_CENTER, OLD_CENTER)) < 8.0:
			continue
		if _has_flag(idx, FLAG_FARM):
			continue
		flags[idx] |= FLAG_TREE
	# Stone: 30 attempts, none within 7 of center, none on water/tree/farm.
	for i in 30:
		var x: int = int(rng.next_float() * float(OLD_SIZE))
		var z: int = int(rng.next_float() * float(OLD_SIZE))
		var idx := _index(x, z)
		if _has_flag(idx, FLAG_WATER):
			continue
		if Vector2(x, z).distance_to(Vector2(OLD_CENTER, OLD_CENTER)) < 7.0:
			continue
		if _has_flag(idx, FLAG_TREE):
			continue
		if _has_flag(idx, FLAG_FARM):
			continue
		rng.next_float() # stone amount: 8 + floor(rng * 5)
		flags[idx] |= FLAG_STONE
		if heights[idx] > 0.55 and rng.next_float() < 0.6:
			rng.next_float() # ore amount: 4 + floor(rng * 3)
			flags[idx] |= FLAG_ORE


## One 16x16 chunk of new territory, port of genChunkCells (grid.js).
## Chunks (0..2, 0..2) belong to the old block and must not be passed here.
func generate_chunk(cx: int, cz: int) -> void:
	var lake := chunk_lake(cx, cz)
	for lx in CHUNK:
		for lz in CHUNK:
			var x: int = cx * CHUNK + lx
			var z: int = cz * CHUNK + lz
			var idx := _index(x, z)
			var h: float = terrain_height(x, z)
			heights[idx] = h
			var water: bool = false
			if not lake.is_empty():
				water = Vector2(x, z).distance_to(Vector2(int(lake["x"]), int(lake["z"]))) < float(lake["r"]) and h < WATER_HEIGHT
			if water:
				flags[idx] |= FLAG_WATER
				continue
			var d_center: float = Vector2(x, z).distance_to(Vector2(OLD_CENTER, OLD_CENTER))
			if d_center >= 8.0 and GodCivRng.hash01(seed, x, z, 201) < 0.039:
				flags[idx] |= FLAG_TREE
			elif d_center >= 7.0 and GodCivRng.hash01(seed, x, z, 202) < 0.013:
				flags[idx] |= FLAG_STONE
				if h > 0.55 and GodCivRng.hash01(seed, x, z, 203) < 0.6:
					flags[idx] |= FLAG_ORE
