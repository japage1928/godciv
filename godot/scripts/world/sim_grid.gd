class_name GodCivSimGrid
extends RefCounted

# Mutable sim state for the 320x320 grid, Phase 2.
#
# The terrain itself (GodCivTerrain) is immutable and deterministic
# from the seed, so this class only stores MUTATIONS on top of it:
# chopped/regrown trees, mined/weathered stone and ore, crop stages
# on the founding farm plots, buildings, and roads. Anything not
# listed here reads straight from the terrain, so a fresh grid is
# always identical to the PWA's founding world.
#
# Blocked means a villager cannot step onto the cell: water, a tree,
# a live stone/ore node, or a blocking building. Farm plots are NOT
# blocked (farmers walk onto them); the town center and altar are
# not blocked either, matching the PWA (founding buildings never set
# the blocked flag there; doWork sets it for huts, granaries, and
# the rest as they are raised).

const BLOCKING_BUILDINGS: Array[String] = [
	"hut", "granary", "well", "workshop", "kiln", "smithy", "factory",
	"school", "healer", "longhouse", "greathall", "farmhouse", "wall", "tower",
]
# Farm beds never grow the fields past this many cells (PWA cap).
const FARM_CELL_CAP: int = 144

var seed: int = 42
var terrain: GodCivTerrain
var center: Vector2i = Vector2i(24, 24)

# Deltas only. Keys are "x,z".
var tree_deltas: Dictionary = {}
var stone_deltas: Dictionary = {} # "x,z" -> [stone, ore]
var crops: Dictionary = {} # "x,z" -> [crop_stage, crop_grow]
var buildings: Dictionary = {} # "x,z" -> type String
var roads: Dictionary = {} # "x,z" -> true

var farm_cells: Array[Vector2i] = []
var stone_spots: Array[Vector2i] = []
var ore_spots: Array[Vector2i] = []
var has_shore: bool = false # cached at setup: a fishable shore near the village


func _key(x: int, z: int) -> String:
	return "%d,%d" % [x, z]


func setup(p_terrain: GodCivTerrain, p_seed: int) -> void:
	terrain = p_terrain
	seed = p_seed
	# Founding farm plots: the 18 FLAG_FARM cells of the old block.
	for x in GodCivTerrain.OLD_SIZE:
		for z in GodCivTerrain.OLD_SIZE:
			if terrain.is_farm(x, z):
				farm_cells.append(Vector2i(x, z))
				crops[_key(x, z)] = [0, 0.0]
	# Stone spots near the village, for the weathering timer.
	var r: int = 48
	for x in range(maxi(0, center.x - r), mini(GodCivTerrain.WORLD_SIZE, center.x + r + 1)):
		for z in range(maxi(0, center.y - r), mini(GodCivTerrain.WORLD_SIZE, center.y + r + 1)):
			if terrain.has_stone(x, z):
				stone_spots.append(Vector2i(x, z))
			if terrain.has_ore(x, z):
				ore_spots.append(Vector2i(x, z))
	# A fishable shore near the village decides whether fishers
	# ever get delegated (brain.js delegateRoles).
	has_shore = nearest_shore(float(center.x), float(center.y), 96).x >= 0


func in_bounds(x: int, z: int) -> bool:
	return x >= 0 and z >= 0 and x < GodCivTerrain.WORLD_SIZE and z < GodCivTerrain.WORLD_SIZE


func is_water(x: int, z: int) -> bool:
	return terrain.is_water(x, z)


func has_tree(x: int, z: int) -> bool:
	var k := _key(x, z)
	if tree_deltas.has(k):
		return bool(tree_deltas[k])
	return terrain.has_tree(x, z)


func set_tree(x: int, z: int, value: bool) -> void:
	tree_deltas[_key(x, z)] = value


func _default_stone(x: int, z: int) -> Array:
	# New-territory rule from the PWA (grid.js genChunkCells):
	# stone 8 + floor(hash * 5); ore 4 + floor(hash * 3) on high
	# ground. The old block's stream-drawn amounts differ slightly
	# from the PWA's, which is unobservable in play; the hash rule
	# keeps every load identical.
	if not terrain.has_stone(x, z):
		return [0, 0]
	var stone: int = 8 + int(GodCivRng.hash01(seed, z, x, 202) * 5.0)
	var ore: int = 0
	if terrain.has_ore(x, z):
		ore = 4 + int(GodCivRng.hash01(seed, z, x, 203) * 3.0)
	return [stone, ore]


func stone_at(x: int, z: int) -> int:
	var k := _key(x, z)
	if stone_deltas.has(k):
		return int((stone_deltas[k] as Array)[0])
	return int(_default_stone(x, z)[0])


func ore_at(x: int, z: int) -> int:
	var k := _key(x, z)
	if stone_deltas.has(k):
		return int((stone_deltas[k] as Array)[1])
	return int(_default_stone(x, z)[1])


func set_stone(x: int, z: int, stone: int, ore: int) -> void:
	stone_deltas[_key(x, z)] = [stone, ore]


func is_farm(x: int, z: int) -> bool:
	# Founding FLAG_FARM cells from the terrain, plus any bed the
	# village cleared since (those live in the crops map).
	return terrain.is_farm(x, z) or crops.has(_key(x, z))


func add_farm_cell(x: int, z: int) -> void:
	var cell := Vector2i(x, z)
	if cell in farm_cells:
		return
	farm_cells.append(cell)
	crops[_key(x, z)] = [0, 0.0]


func is_shore(x: int, z: int) -> bool:
	# Land beside water, walkable: a fisher's workplace.
	if not in_bounds(x, z) or is_water(x, z):
		return false
	if not walkable(x, z):
		return false
	if x > 0 and is_water(x - 1, z):
		return true
	if x < GodCivTerrain.WORLD_SIZE - 1 and is_water(x + 1, z):
		return true
	if z > 0 and is_water(x, z - 1):
		return true
	if z < GodCivTerrain.WORLD_SIZE - 1 and is_water(x, z + 1):
		return true
	return false


func nearest_shore(from_x: float, from_z: float, radius: int = 96) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_d: float = INF
	var x0: int = maxi(0, int(from_x) - radius)
	var x1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_x) + radius)
	var z0: int = maxi(0, int(from_z) - radius)
	var z1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_z) + radius)
	for x in range(x0, x1 + 1):
		for z in range(z0, z1 + 1):
			if not is_shore(x, z):
				continue
			var d: float = Vector2(float(x) - from_x, float(z) - from_z).length()
			if d < best_d:
				best_d = d
				best = Vector2i(x, z)
	return best


## The farm district: the western block. Streets never enter it,
## and farm beds never leave it (planning.js isFieldZone).
func is_field_zone(x: int, z: int) -> bool:
	return x <= center.x - 4 and Vector2(x - center.x, z - center.y).length() <= 14.0


## Farm districts: the old west block plus satellite wedges N/E/S
## at radius 16-30, +/-35 degrees of the cardinal axis. Returns
## "west" | "north" | "east" | "south" | "". West beyond radius 14
## is not a district: the old fields end there, and the wedges
## spread farms around the other three sides instead.
func farm_district_of(x: int, z: int) -> String:
	if is_field_zone(x, z):
		return "west"
	var dx: int = x - center.x
	var dz: int = z - center.y
	var d: float = Vector2(dx, dz).length()
	if d < 16.0 or d > 30.0:
		return ""
	var s: float = sin(deg_to_rad(35.0))
	if dz < 0 and absf(float(dx)) / d <= s:
		return "north"
	if dx > 0 and absf(float(dz)) / d <= s:
		return "east"
	if dz > 0 and absf(float(dx)) / d <= s:
		return "south"
	return ""


func in_farm_district(x: int, z: int) -> bool:
	return farm_district_of(x, z) != ""


func crop_at(x: int, z: int) -> int:
	var k := _key(x, z)
	if crops.has(k):
		return int((crops[k] as Array)[0])
	return -1


func crop_grow_at(x: int, z: int) -> float:
	var k := _key(x, z)
	if crops.has(k):
		return float((crops[k] as Array)[1])
	return 0.0


func set_crop(x: int, z: int, stage: int, grow: float) -> void:
	crops[_key(x, z)] = [stage, grow]


func building_at(x: int, z: int) -> String:
	return String(buildings.get(_key(x, z), ""))


func set_building(x: int, z: int, building_type: String) -> void:
	buildings[_key(x, z)] = building_type


func is_road(x: int, z: int) -> bool:
	return bool(roads.get(_key(x, z), false))


func set_road(x: int, z: int) -> void:
	roads[_key(x, z)] = true


func blocked(x: int, z: int) -> bool:
	if not in_bounds(x, z):
		return true
	if terrain.is_water(x, z):
		return true
	if has_tree(x, z):
		return true
	if stone_at(x, z) > 0 or ore_at(x, z) > 0:
		return true
	var b := building_at(x, z)
	if b != "" and b in BLOCKING_BUILDINGS:
		return true
	return false


func walkable(x: int, z: int) -> bool:
	return not blocked(x, z)


## Breadth-first path on the walkable grid, port of grid.js
## findPath. The target cell itself may be blocked (a building);
## the caller stands on a free neighbour instead (see
## GodCivVillager.set_target). Returns the cell list from the
## first step to the target, or an empty array when already there,
## or null when no path exists within the step cap.
func find_path(sx: int, sz: int, tx: int, tz: int, max_steps: int = 8000) -> Variant:
	if not in_bounds(tx, tz):
		return null
	if sx == tx and sz == tz:
		return []
	var prev := {}
	var queue: Array[Vector2i] = [Vector2i(sx, sz)]
	var qi: int = 0
	prev[_key(sx, sz)] = ""
	var steps: int = 0
	while qi < queue.size() and steps < max_steps:
		var cur: Vector2i = queue[qi]
		qi += 1
		steps += 1
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = cur.x + d.x
			var nz: int = cur.y + d.y
			if not in_bounds(nx, nz):
				continue
			var is_target: bool = nx == tx and nz == tz
			if blocked(nx, nz) and not is_target:
				continue
			var k := _key(nx, nz)
			if prev.has(k):
				continue
			prev[k] = _key(cur.x, cur.y)
			if is_target:
				var path: Array[Vector2i] = []
				var back: String = k
				while back != "" and back != _key(sx, sz):
					var parts := back.split(",")
					path.push_front(Vector2i(int(parts[0]), int(parts[1])))
					back = String(prev[back])
				return path
			queue.append(Vector2i(nx, nz))
	return null


## Nearest farm plot. ripe_only picks crop stage 3 first; the
## caller falls back to any plot when no ripe one exists. Reads
## the farm list directly — there are only 18 plots.
func nearest_farm(from_x: float, from_z: float, ripe_only: bool, radius: int = 64) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_d: float = INF
	for cell in farm_cells:
		var crop: int = crop_at(cell.x, cell.y)
		if ripe_only and crop != 3:
			continue
		if not ripe_only and crop < 0:
			continue
		var d: float = Vector2(float(cell.x) - from_x, float(cell.y) - from_z).length()
		if d > float(radius):
			continue
		if d < best_d:
			best_d = d
			best = cell
	return best


func nearest_tree(from_x: float, from_z: float, radius: int = 64) -> Vector2i:
	# Window scan on the terrain flags (cheap array reads), then
	# the small delta set for regrown trees the terrain never had.
	var best := Vector2i(-1, -1)
	var best_d: float = INF
	var x0: int = maxi(0, int(from_x) - radius)
	var x1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_x) + radius)
	var z0: int = maxi(0, int(from_z) - radius)
	var z1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_z) + radius)
	for x in range(x0, x1 + 1):
		for z in range(z0, z1 + 1):
			if not terrain.has_tree(x, z):
				continue
			if not bool(tree_deltas.get(_key(x, z), true)):
				continue # chopped; the terrain still shows a tree
			var d: float = Vector2(x - from_x, z - from_z).length()
			if d < best_d:
				best_d = d
				best = Vector2i(x, z)
	for k in tree_deltas.keys():
		if not bool(tree_deltas[k]):
			continue
		var parts := String(k).split(",")
		var tx: int = int(parts[0])
		var tz: int = int(parts[1])
		if terrain.has_tree(tx, tz):
			continue
		var d2: float = Vector2(float(tx) - from_x, float(tz) - from_z).length()
		if d2 <= float(radius) and d2 < best_d:
			best_d = d2
			best = Vector2i(tx, tz)
	return best


## Nearest stone/ore node a miner can work, carry-aware like the
## PWA: a villager already carrying stone goes to stone, one
## carrying ore goes to ore, an empty carry takes either.
func nearest_mineral(from_x: float, from_z: float, carry_type: String, radius: int = 64) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_d: float = INF
	var x0: int = maxi(0, int(from_x) - radius)
	var x1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_x) + radius)
	var z0: int = maxi(0, int(from_z) - radius)
	var z1: int = mini(GodCivTerrain.WORLD_SIZE - 1, int(from_z) + radius)
	for x in range(x0, x1 + 1):
		for z in range(z0, z1 + 1):
			if not terrain.has_stone(x, z):
				continue
			var stone: int = stone_at(x, z)
			var ore: int = ore_at(x, z)
			var ok: bool = false
			if carry_type == "stone":
				ok = stone > 0
			elif carry_type == "ore":
				ok = ore > 0
			else:
				ok = stone > 0 or ore > 0
			if not ok:
				continue
			var d: float = Vector2(x - from_x, z - from_z).length()
			if d < best_d:
				best_d = d
				best = Vector2i(x, z)
	return best
