class_name GodCivVillage
extends Node2D

# The village: founding, timers, delegation, demands, dawn, god
# powers, and save/load. Ported from the PWA (src/sim/world.js
# newWorld, src/sim/step.js timers + dawn, src/sim/brain.js
# delegateRoles/recomputeMorale/dawnDemographics/runMarket,
# src/sim/planning.js computeDemands/expandVillage/clearFarmBed,
# src/sim/actions.js bless/whisper), Phase 2:
#
# - All 13 jobs, market, tools, school/education, class ladder,
#   housing tiers, households, tech progress.
# - Wall/tower demands, guard posts, markers, street paving, and
#   farm-bed expansion are Phase 3; find_lot_spot here is the
#   simplified infill scorer (distance + cluster + dwelling
#   spacing + out of the farm district), and clear_farm_bed clears
#   one 3x3 bed beside a new farmhouse instead of the PWA's
#   district-scored bed search.
# - Weather is always clear in Phase 2 (weather rolls are Phase 3).
# - No LLM anywhere: delegation and demands are the PWA's rules.

signal log_changed(lines: Array)
signal stats_changed

const CENTER: Vector2i = Vector2i(24, 24)
const BUILD_COSTS: Dictionary = {
	"hut": {"wood": 12, "stone": 6},
	"granary": {"wood": 20, "stone": 10},
	"well": {"wood": 8, "stone": 6},
	"workshop": {"wood": 15, "stone": 10, "ore": 4},
	"shrine": {"wood": 10, "stone": 6},
	"marker": {"wood": 2, "stone": 0},
	"longhouse": {"wood": 20, "stone": 10},
	"greathall": {"wood": 30, "stone": 15},
	"farmhouse": {"wood": 15, "stone": 6},
	"school": {"wood": 18, "stone": 12},
	"healer": {"wood": 16, "stone": 8},
	"wall": {"wood": 6, "stone": 4},
	"tower": {"wood": 10, "stone": 14, "ore": 2},
	"kiln": {"wood": 14, "stone": 12},
	"smithy": {"wood": 18, "stone": 12, "ore": 4},
	"factory": {"wood": 40, "stone": 30, "ore": 10},
}
# Builder work actions to finish each type (brain.js doWork);
# anything unlisted takes 6.
const BUILD_PROGRESS: Dictionary = {
	"granary": 8, "marker": 3, "well": 6, "workshop": 8, "shrine": 5,
	"longhouse": 8, "greathall": 10, "farmhouse": 7, "school": 8,
	"healer": 6, "wall": 4, "tower": 8, "kiln": 7, "smithy": 8,
	"factory": 12,
}
const SEASON_KEEP: Dictionary = {"spring": 60, "summer": 45, "autumn": 60, "winter": 80}
const SEASON_GROWTH: Dictionary = {"spring": 1.2, "summer": 1.3, "autumn": 0.9, "winter": 0.25}
const HOME_CAPACITY: Dictionary = {"longhouse": 8, "greathall": 14, "farmhouse": 2}
const DWELLING_TYPES: Array[String] = ["hut", "longhouse", "greathall", "farmhouse"]
const LOG_MAX: int = 60
const SPAWN_SPOTS: Array[Vector2i] = [
	Vector2i(25, 25), Vector2i(23, 25), Vector2i(25, 23),
	Vector2i(23, 23), Vector2i(24, 26), Vector2i(26, 26),
]

var seed: int = 42
var world: GodCivWorld
var clock: GodCivClock
var grid: GodCivSimGrid
var rng: GodCivRng
var villagers: Array[GodCivVillager] = []

var stockpile: Dictionary = {"food": 24, "wood": 24, "stone": 12, "ore": 0, "fish": 0, "meat": 0, "furniture": 0, "pottery": 0, "ironware": 0, "wares": 0}
var faith: float = 55.0
var morale: float = 60.0
var population_cap: int = 12
var fund: int = 20
var tech: Dictionary = {"level": 0, "progress": 0}
var deer: Array = []
var next_household_id: int = 1
var household_of_home: Dictionary = {}
var buildings: Array = []
var build_queue: Array = []
var log_entries: Array = []
var elapsed: float = 0.0
var season: String = "spring"
var expand_at: float = 10.0
var delegate_at: float = 5.0
var tree_at: float = 60.0
var stone_at: float = 30.0
var market_at: float = 30.0
var cooldowns: Dictionary = {}
var stats: Dictionary = {"births": 0, "deaths": 0, "blessings": 0, "leaves": 0}
var next_villager_id: int = 1
var rate_history: Array = []
var spoiled: int = 0
var low_morale_dawns: int = 0
var last_leave_at: float = -1.0e9
var center: Vector2i = CENTER


func setup(p_world: GodCivWorld, p_clock: GodCivClock, p_seed: int, save_data: Dictionary) -> void:
	world = p_world
	clock = p_clock
	seed = p_seed
	grid = GodCivSimGrid.new()
	grid.setup(world.terrain, seed)
	# Fresh stream per seed, like the PWA's load-time reseed
	# (seed ^ 0x9e3779b9); the terrain stream is separate and
	# untouched, so village luck is stable across loads.
	rng = GodCivRng.new(seed ^ 0x9E3779B9)
	clock.day_changed.connect(_on_dawn)
	if (save_data.get("village", {}) as Dictionary).is_empty():
		_found()
	else:
		_from_save(save_data["village"])


func _found() -> void:
	stockpile = {"food": 24, "wood": 24, "stone": 12, "ore": 0, "fish": 0, "meat": 0, "furniture": 0, "pottery": 0, "ironware": 0, "wares": 0}
	faith = 55.0
	morale = 60.0
	population_cap = 12
	fund = 20
	tech = {"level": 0, "progress": 0}
	deer = []
	next_household_id = 1
	buildings = [
		{"type": "towncenter", "x": CENTER.x, "z": CENTER.y, "built_day": 1},
		{"type": "altar", "x": CENTER.x + 2, "z": CENTER.y, "built_day": 1},
		{"type": "hut", "x": CENTER.x - 2, "z": CENTER.y - 3, "built_day": 1},
	]
	for b in buildings:
		grid.set_building(int(b["x"]), int(b["z"]), String(b["type"]))
		world.set_building_cell(int(b["x"]), int(b["z"]), String(b["type"]))
	_pave_plaza()
	for i in 6:
		_spawn_villager(SPAWN_SPOTS[i].x, SPAWN_SPOTS[i].y, i == 0)
	assign_homes()
	delegate_roles()
	add_log("The village wakes. Six villagers look to the sky, waiting for a sign.")


func _spawn_villager(px: int, pz: int, p_leader: bool, age_days: int = -1, coins: int = -1) -> GodCivVillager:
	var v := GodCivVillager.new()
	add_child(v)
	v.setup(next_villager_id, float(px), float(pz), p_leader, self, rng)
	if age_days >= 0:
		v.age_days = age_days
		if age_days == 0:
			v.education = 0 # newborns start unschooled
	if coins >= 0:
		v.coins = coins
	next_villager_id += 1
	villagers.append(v)
	return v


func _process(delta: float) -> void:
	if clock == null or clock.paused:
		return
	var dt: float = delta * clock.speed
	elapsed += dt
	if elapsed >= expand_at:
		expand_at = elapsed + 20.0
		expand_village()
	if elapsed >= delegate_at:
		delegate_at = elapsed + 15.0
		delegate_roles()
	if elapsed >= tree_at:
		tree_at = elapsed + 30.0
		_regrow_trees()
	if elapsed >= stone_at:
		stone_at = elapsed + 30.0
		_weather_stone()
	if elapsed >= market_at:
		market_at = elapsed + 30.0
		GodCivEconomy.run_market(self)
	_grow_crops(dt)
	for d in deer:
		d.step(dt)
	for v in villagers.duplicate():
		v.step(dt)
	stats_changed.emit()


func add_log(text: String) -> void:
	log_entries.push_front({"day": clock.day, "time": clock.time_string(), "text": text})
	if log_entries.size() > LOG_MAX:
		log_entries.resize(LOG_MAX)
	log_changed.emit(last_log_lines())


func last_log_lines() -> Array:
	var lines: Array = []
	for i in mini(6, log_entries.size()):
		var e: Dictionary = log_entries[i]
		lines.append("Day %d %s — %s" % [int(e["day"]), String(e["time"]), String(e["text"])])
	return lines


func stats_dict() -> Dictionary:
	return {
		"pop": villagers.size(), "pop_cap": population_cap,
		"food": int(stockpile.get("food", 0)), "wood": int(stockpile.get("wood", 0)),
		"stone": int(stockpile.get("stone", 0)), "ore": int(stockpile.get("ore", 0)),
		"fish": int(stockpile.get("fish", 0)), "meat": int(stockpile.get("meat", 0)),
		"furniture": int(stockpile.get("furniture", 0)), "pottery": int(stockpile.get("pottery", 0)),
		"ironware": int(stockpile.get("ironware", 0)), "wares": int(stockpile.get("wares", 0)),
		"fund": fund, "tech_level": int(tech.get("level", 0)), "tech_progress": int(tech.get("progress", 0)),
		"faith": faith, "morale": morale,
	}


# --- homes ---

func home_capacity(building_type: String) -> int:
	return int(HOME_CAPACITY.get(building_type, 4))


func assign_homes() -> void:
	var homes: Array = []
	for b in buildings:
		if String(b["type"]) in ["towncenter", "hut", "longhouse", "greathall", "farmhouse"]:
			homes.append(b)
	var occ := {}
	for v in villagers:
		if v.home != "":
			var h: Dictionary = {}
			for b in homes:
				if "%d,%d" % [int(b["x"]), int(b["z"])] == v.home:
					h = b
					break
			if not h.is_empty() and int(occ.get(v.home, 0)) < home_capacity(String(h["type"])):
				occ[v.home] = int(occ.get(v.home, 0)) + 1
			else:
				v.home = ""
	for v in villagers:
		if v.home == "":
			for b in homes:
				var k := "%d,%d" % [int(b["x"]), int(b["z"])]
				if int(occ.get(k, 0)) < home_capacity(String(b["type"])):
					v.home = k
					occ[k] = int(occ.get(k, 0)) + 1
					break
	# Households: everyone sharing a home is one household. Each
	# occupied home keeps a stable id so the card can name the
	# household even as members come and go.
	var occupied := {}
	for v in villagers:
		if v.home != "":
			occupied[v.home] = true
			if not household_of_home.has(v.home):
				household_of_home[v.home] = next_household_id
				next_household_id += 1
	for k in household_of_home.keys():
		if not occupied.has(k):
			household_of_home.erase(k)


func homeless_count() -> int:
	var n: int = 0
	for v in villagers:
		if v.home == "":
			n += 1
	return n


func remove_villager(v: GodCivVillager, cause: String) -> void:
	villagers.erase(v)
	v.queue_free()
	stats["deaths"] = int(stats.get("deaths", 0)) + 1
	add_log(v.villager_name + " dies of " + cause + ".")
	assign_homes()


func send_away(v: GodCivVillager) -> void:
	villagers.erase(v)
	v.queue_free()
	stats["leaves"] = int(stats.get("leaves", 0)) + 1
	add_log(v.villager_name + " walks away, seeking a kinder village.")
	assign_homes()


# --- delegation (brain.js delegateRoles, all 13 jobs) ---

func delegate_roles() -> void:
	# Students go to school, not to work; toddlers stay home.
	var adults: Array[GodCivVillager] = []
	for v in villagers:
		if v.age_days >= 3 and not is_student(v):
			adults.append(v)
	if adults.is_empty():
		return
	var edible: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	var pop: int = adults.size()
	var hut_count: int = 0
	for b in buildings:
		if String(b["type"]) == "hut":
			hut_count += 1
	var demands: Array = compute_demands()
	var farm_cells: int = grid.farm_cells.size()
	var has_school: bool = has_building("school")
	var towers: int = 0
	var walls: int = 0
	for b in buildings:
		if String(b["type"]) == "tower":
			towers += 1
		elif String(b["type"]) == "wall":
			walls += 1
	var desired := {
		# Farmers scale with the fields, not just mouths: the labor
		# force has to keep up as farm beds are added.
		"farmer": clampi(maxi(int(ceil(float(pop) / 3.0)), int(ceil(float(farm_cells) / 9.0))), 1, 5),
		# Fishers are a standing food source, not an emergency
		# measure: one once the village can spare them, two as it
		# grows, whenever a fishable shore exists.
		"fisher": (2 if pop >= 14 else (1 if pop >= 6 else 0)) if grid.has_shore else 0,
		"hunter": 1 if (edible < 25 or (int(stockpile.get("meat", 0)) == 0 and pop >= 10)) else 0,
		"woodcutter": 2 if (int(stockpile.get("wood", 0)) < 25 or build_queue.size() > 0) else 1,
		"miner": 2 if (int(stockpile.get("stone", 0)) < 20 or int(stockpile.get("ore", 0)) < 4 or build_queue.size() > 0) else 1,
		# Anticipate building: a builder is delegated while a
		# demand is open, or from day 2 while the village still
		# has only its founding hut.
		"builder": mini(2, pop) if build_queue.size() > 0 else (1 if (demands.size() > 0 or (clock.day >= 2 and hut_count < 2)) else 0),
		"hauler": 1 if pop >= 8 else 0,
		"teacher": 1 if (has_school and pop >= 6) else 0,
		# Production jobs exist only where their workplace stands.
		"carpenter": (2 if pop >= 20 else 1) if has_building("workshop") else 0,
		"potter": 1 if has_building("kiln") else 0,
		"smith": 1 if has_building("smithy") else 0,
		"factory": 2 if has_building("factory") else 0,
		# Guards: one per tower, plus one per gate once a real wall
		# ring exists (6+ wall segments), capped at GUARD_CAP and
		# at one third of the adults. No posts, no guards.
		"guard": mini(GodCivEconomy.GUARD_CAP, mini(towers + (2 if walls >= 6 else 0), int(pop / 3))),
	}
	var order: Array[String] = ["farmer", "fisher", "hunter", "woodcutter", "miner", "builder", "hauler", "teacher", "carpenter", "potter", "smith", "factory", "guard"]
	var total: int = 0
	for j in order:
		total += int(desired[j])
	var builder_wanted: bool = build_queue.size() > 0 or demands.size() > 0 or (clock.day >= 2 and hut_count < 2)
	var guard_floor: int = mini(towers, int(desired["guard"]))
	# Trimming must not zero a job the village needs while another
	# job still holds a surplus, and must not stall building or
	# leave standing towers unmanned.
	while total > pop:
		var trimmed: bool = false
		# First trim surpluses, from the end of the order: a job
		# holding 2+ slots (or guards above the manned-tower
		# floor) gives one up before any job is zeroed.
		for i in range(order.size() - 1, -1, -1):
			var j: String = order[i]
			var floor_v: int = maxi(1, guard_floor) if j == "guard" else 1
			if int(desired[j]) > floor_v:
				desired[j] = int(desired[j]) - 1
				total -= 1
				trimmed = true
				break
		if trimmed:
			continue
		# Every wanted job is down to one slot (or the guard
		# floor) and the village is still over strength: cut from
		# the end, sparing the builder while building is wanted
		# and the guards manning standing towers.
		for i in range(order.size() - 1, -1, -1):
			var j2: String = order[i]
			if int(desired[j2]) > 0 and not (j2 == "builder" and builder_wanted and int(desired["builder"]) <= 1) and not (j2 == "guard" and int(desired["guard"]) <= guard_floor):
				desired[j2] = int(desired[j2]) - 1
				total -= 1
				trimmed = true
				break
		if trimmed:
			continue
		# Last resort: only protected slots remain. Trim one
		# rather than spin forever.
		var last_resort_done: bool = false
		for i in range(order.size() - 1, -1, -1):
			if int(desired[order[i]]) > 0:
				desired[order[i]] = int(desired[order[i]]) - 1
				total -= 1
				last_resort_done = true
				break
		if not last_resort_done:
			break
	while total < pop:
		desired["farmer"] = int(desired["farmer"]) + 1
		total += 1
	var unassigned: Array[GodCivVillager] = adults.duplicate()
	var assignment := {}
	# Guards are picked first, so the brave-first rule means
	# something: filling the other jobs first would poach the
	# brave villagers for the fields before the towers are manned.
	var assign_order: Array[String] = ["guard"]
	for j in order:
		if j != "guard":
			assign_order.append(j)
	for job_name in assign_order:
		for i in int(desired[job_name]):
			if unassigned.is_empty():
				break
			var best_idx: int = 0
			for k in range(1, unassigned.size()):
				var a: GodCivVillager = unassigned[k]
				var b: GodCivVillager = unassigned[best_idx]
				var better: bool = false
				if job_name == "guard":
					# Brave first, then tool tier, then skill: a
					# guard's courage and spear matter more than
					# practice.
					if a.traits.has("brave") != b.traits.has("brave"):
						better = a.traits.has("brave")
					elif a.tool != b.tool:
						better = a.tool > b.tool
					else:
						better = int(a.skills.get(job_name, 0)) > int(b.skills.get(job_name, 0))
				else:
					better = int(a.skills.get(job_name, 0)) > int(b.skills.get(job_name, 0))
				if better:
					best_idx = k
			assignment[unassigned[best_idx].id] = job_name
			unassigned.remove_at(best_idx)
	for v in unassigned:
		assignment[v.id] = "hauler"
	var changes: Array[String] = []
	for v in adults:
		var next_job: String = String(assignment.get(v.id, "hauler"))
		if v.assigned_job != "" and v.assigned_job != next_job:
			changes.append(v.villager_name + " to " + next_job)
		v.assigned_job = next_job
	for v in villagers:
		if v.age_days < 3 or is_student(v):
			v.assigned_job = ""
	if not changes.is_empty():
		var l: GodCivVillager = _leader()
		var who: String = l.villager_name + " delegates: " if l != null else "Delegation: "
		add_log(who + ", ".join(changes.slice(0, 3)) + (" and " + str(changes.size() - 3) + " more." if changes.size() > 3 else "."))


func _leader() -> GodCivVillager:
	for v in villagers:
		if v.leader:
			return v
	return villagers[0] if not villagers.is_empty() else null


# --- demands + expansion (planning.js computeDemands, full Phase 2 scope) ---
# Wall and tower demands are Phase 3; everything else here is the
# PWA's computeDemands, scores and gates included. The school's
# score 8 is deliberate: a one-time civic unlock that gates
# education and tech, it outranks repeatable farmhouses and
# production buildings, but a real housing crisis (hut score 9+)
# still outranks it.

func compute_demands() -> Array:
	var edible: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	var pop: int = villagers.size()
	var built := func(t: String) -> bool:
		for b in buildings:
			if String(b["type"]) == t:
				return true
		return false
	var queued := func(t: String) -> bool:
		for q in build_queue:
			if String(q["type"]) == t:
				return true
		return false
	var homeless: int = homeless_count()
	var hut_total: int = 0
	for b in buildings:
		if String(b["type"]) == "hut" or String(b["type"]) == "longhouse":
			hut_total += 1
	for q in build_queue:
		if String(q["type"]) == "hut" or String(q["type"]) == "longhouse":
			hut_total += 1
	var demands: Array = []
	var crowded: bool = pop >= population_cap - 2
	var dwellings: Array = []
	for b in buildings:
		if String(b["type"]) in ["hut", "longhouse", "greathall"]:
			dwellings.append(b)
	var hut_score: int = homeless * 3 + (4 if crowded else 0) + (3 if (clock.day >= 2 and hut_total < 2) else 0)
	if hut_score > 0:
		if find_lot_spot("hut").x >= 0:
			demands.append({
				"type": "hut", "score": hut_score,
				"reason": (str(homeless) + " homeless villager" + ("s" if homeless > 1 else "") + " need" + ("" if homeless > 1 else "s") + " a home.") if homeless > 0 else "The village is outgrowing its huts.",
			})
		else:
			demands.append({"type": "longhouse", "score": hut_score, "reason": "No room for new huts: an old hut must grow."})
	# Housing evolution: as demand rises and the village spreads,
	# growing an existing dwelling beats sprawling further. Two
	# triggers: near-crowding, OR prosperity — several dwellings,
	# an old hut, and surplus wood and stone.
	var huts: Array = []
	var longhouses: Array = []
	for b in buildings:
		if String(b["type"]) == "hut":
			huts.append(b)
		elif String(b["type"]) == "longhouse":
			longhouses.append(b)
	var oldest_hut_age: int = 0
	if not huts.is_empty():
		var oldest_built: int = 1 << 30
		for b in huts:
			oldest_built = mini(oldest_built, int(b.get("built_day", 1)))
		oldest_hut_age = clock.day - oldest_built
	var prosperous: bool = int(stockpile.get("wood", 0)) >= 40 and int(stockpile.get("stone", 0)) >= 20 and oldest_hut_age >= 8
	var near_crowded: bool = pop >= population_cap - 4
	if (near_crowded or prosperous) and dwellings.size() >= 4 and not huts.is_empty() and not queued.call("longhouse"):
		demands.append({"type": "longhouse", "score": 5.0 + float(dwellings.size()) * 0.5 + (2.0 if prosperous else 0.0), "reason": "The village is spreading: grow a hut into a longhouse instead."})
	if (near_crowded or prosperous) and not longhouses.is_empty() and not queued.call("greathall"):
		demands.append({"type": "greathall", "score": 6.0 + float(dwellings.size()) * 0.5 + (2.0 if prosperous else 0.0), "reason": "A longhouse must grow into a great hall for the growing village."})
	# Farmsteads: a farmhouse anchors a farm district. Demand rises
	# with mouths to feed and with fields that have no farmhouse
	# nearby (within 5 cells).
	var farmhouses: Array = []
	for b in buildings:
		if String(b["type"]) == "farmhouse":
			farmhouses.append(b)
	var farm_need: int = pop * 4
	var unanchored: int = 0
	for cell in grid.farm_cells:
		var anchored: bool = false
		for f in farmhouses:
			if Vector2(float(cell.x) - float(f["x"]), float(cell.y) - float(f["z"])).length() <= 5.0:
				anchored = true
				break
		if not anchored:
			unanchored += 1
	if not queued.call("farmhouse") and (edible < farm_need or unanchored >= 12) and pop >= 8:
		demands.append({"type": "farmhouse", "score": 4 + mini(3, int(unanchored / 6)), "reason": "The fields need a farmhouse to work from."})
	if not built.call("granary") and not queued.call("granary"):
		var sc: int = 3 if edible >= 25 else (2 if spoiled > 0 else 0)
		if sc > 0:
			demands.append({"type": "granary", "score": sc, "reason": "Surplus food needs storing."})
	if not built.call("well") and not queued.call("well") and pop >= 10:
		demands.append({"type": "well", "score": 3, "reason": "The village needs water close at hand."})
	if not built.call("workshop") and not queued.call("workshop") and int(stockpile.get("ore", 0)) >= 4:
		demands.append({"type": "workshop", "score": 3, "reason": "Ore is piling up: tools are needed."})
	# Production buildings: one of each, gated on tech and
	# population like the healer's hut.
	var tech_level: int = int(tech.get("level", 0))
	if tech_level >= 1 and not built.call("kiln") and not queued.call("kiln") and pop >= 10:
		demands.append({"type": "kiln", "score": 3, "reason": "Bronze craft brings the kiln: the village needs pottery."})
	if tech_level >= 2 and not built.call("smithy") and not queued.call("smithy") and pop >= 12:
		demands.append({"type": "smithy", "score": 3, "reason": "Iron craft brings the smithy: the village needs ironware."})
	if tech_level >= 5 and not built.call("factory") and not queued.call("factory") and pop >= 26:
		demands.append({"type": "factory", "score": 4, "reason": "The electric age brings the factory: the village needs wares."})
	if not built.call("shrine") and not queued.call("shrine") and (faith < 45.0 or pop >= 14):
		demands.append({"type": "shrine", "score": 3, "reason": "Faith is low: the people need a shrine." if faith < 45.0 else "The village has grown: it needs a gathering shrine."})
	if not built.call("school") and not queued.call("school") and pop >= 8:
		demands.append({"type": "school", "score": 8, "reason": "The children need a school."})
	if tech_level >= 2 and not built.call("healer") and not queued.call("healer") and pop >= 10:
		demands.append({"type": "healer", "score": 4, "reason": "Iron craft brings medicine: the village needs a healer's hut."})
	demands.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["score"]) > float(b["score"]))
	return demands


func can_afford(building_type: String) -> bool:
	var c: Dictionary = BUILD_COSTS.get(building_type, {})
	return int(stockpile.get("wood", 0)) >= int(c.get("wood", 0)) and int(stockpile.get("stone", 0)) >= int(c.get("stone", 0)) and int(stockpile.get("ore", 0)) >= int(c.get("ore", 0))


func build_progress_for(building_type: String) -> int:
	return int(BUILD_PROGRESS.get(building_type, 6))


func expand_village() -> void:
	var demands: Array = compute_demands()
	if build_queue.size() < 2 and not demands.is_empty():
		var top: Dictionary = demands[0]
		if can_afford(String(top["type"])):
			var spot := Vector2i(-1, -1)
			if String(top["type"]) == "longhouse":
				# An upgrade grows the OLDEST hut in place.
				var oldest_hut = null
				for b in buildings:
					if String(b["type"]) == "hut" and (oldest_hut == null or int(b.get("built_day", 1)) < int(oldest_hut.get("built_day", 1))):
						oldest_hut = b
				if oldest_hut != null:
					spot = Vector2i(int(oldest_hut["x"]), int(oldest_hut["z"]))
			elif String(top["type"]) == "greathall":
				var oldest_lh = null
				for b in buildings:
					if String(b["type"]) == "longhouse" and (oldest_lh == null or int(b.get("built_day", 1)) < int(oldest_lh.get("built_day", 1))):
						oldest_lh = b
				if oldest_lh != null:
					spot = Vector2i(int(oldest_lh["x"]), int(oldest_lh["z"]))
			else:
				spot = find_lot_spot(String(top["type"]))
			if spot.x >= 0 and not build_queue.any(func(q: Dictionary) -> bool: return int(q["x"]) == spot.x and int(q["z"]) == spot.y):
				build_queue.append({"type": String(top["type"]), "x": spot.x, "z": spot.y, "progress": 0})
				add_log("The builders start a " + String(top["type"]) + ": " + String(top["reason"]))


## Simplified lot scorer for Phase 1 (see header): infill-first,
## cluster bonus, dwelling spacing, out of the farm district. The
## PWA's street-frontage rule and the full lot system are deferred.
func find_lot_spot(building_type: String) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_score: float = -INF
	var r: int = 32
	for x in range(maxi(0, CENTER.x - r), mini(319, CENTER.x + r) + 1):
		for z in range(maxi(0, CENTER.y - r), mini(319, CENTER.y + r) + 1):
			if not _lot_free(x, z, building_type):
				continue
			var sc: float = _lot_score(x, z, building_type)
			if sc > best_score:
				best_score = sc
				best = Vector2i(x, z)
	return best


func _lot_free(x: int, z: int, building_type: String) -> bool:
	# blocked() already covers water, trees, stone/ore nodes, and
	# blocking buildings; the rest is farm plots, roads, and the
	# queue. The dwelling-spacing check reads the village's short
	# building list instead of scanning a 5x5 neighbourhood, so a
	# full lot scan stays cheap in GDScript.
	if grid.blocked(x, z) or grid.is_farm(x, z) or grid.is_road(x, z):
		return false
	for q in build_queue:
		if int(q["x"]) == x and int(q["z"]) == z:
			return false
	# Farm district: the western block, x <= cx-4 within 14 of center.
	if x <= CENTER.x - 4 and Vector2(x - CENTER.x, z - CENTER.y).length() <= 14.0:
		return false
	if building_type in DWELLING_TYPES:
		for b in buildings:
			var bt: String = String(b["type"])
			if bt in DWELLING_TYPES and maxi(absi(int(b["x"]) - x), absi(int(b["z"]) - z)) <= 2:
				return false
		for q in build_queue:
			if String(q["type"]) in DWELLING_TYPES and maxi(absi(int(q["x"]) - x), absi(int(q["z"]) - z)) <= 2:
				return false
	return true


func _lot_score(x: int, z: int, building_type: String) -> float:
	var dist: float = Vector2(x - CENTER.x, z - CENTER.y).length()
	var score: float = -dist * 10.0
	# Cluster, at arm's length: buildings three to four cells away
	# are good neighbours (PWA lotScore, read off the building list).
	for b in buildings:
		var d: int = maxi(absi(int(b["x"]) - x), absi(int(b["z"]) - z))
		if d >= 3 and d <= 4:
			score += 1.0
	if building_type == "hut":
		if dist < 4.0:
			score -= 6.0
	elif building_type == "granary":
		score -= absf(dist - 4.0) * 1.0
		var farms_near: int = 0
		for cell in grid.farm_cells:
			if maxi(absi(cell.x - x), absi(cell.y - z)) <= 4:
				farms_near += 1
		score += float(farms_near) * 0.4
	return score


func _pave_plaza() -> void:
	# Founding square: a road ring two cells out from the town
	# center, plus a straight farm road west to the fields.
	var lay := func(px: int, pz: int) -> void:
		if not grid.in_bounds(px, pz):
			return
		if grid.is_water(px, pz) or grid.building_at(px, pz) != "" or grid.is_farm(px, pz) or grid.is_road(px, pz):
			return
		if grid.has_tree(px, pz):
			grid.set_tree(px, pz, false)
			world.clear_feature_cell(px, pz)
		if grid.stone_at(px, pz) > 0:
			grid.set_stone(px, pz, 0, 0)
			world.clear_feature_cell(px, pz)
		grid.set_road(px, pz)
		world.set_road_cell(px, pz)
	for dx in range(-2, 3):
		for dz in range(-2, 3):
			if maxi(absi(dx), absi(dz)) == 2:
				lay.call(CENTER.x + dx, CENTER.y + dz)
	for px in range(CENTER.x - 3, CENTER.x - 7, -1):
		lay.call(px, CENTER.y)


## Called by a builder villager when a queued build finishes.
## Upgrades grow in place: a longhouse replaces the oldest hut at
## its own cell, a great hall the oldest longhouse.
func complete_build(q: Dictionary, builder: GodCivVillager) -> void:
	build_queue.erase(q)
	var building_type: String = String(q.get("type", "hut"))
	var cost: Dictionary = BUILD_COSTS.get(building_type, {})
	var wood: int = int(cost.get("wood", 0))
	var stone: int = int(cost.get("stone", 0))
	var ore: int = int(cost.get("ore", 0))
	if int(stockpile.get("wood", 0)) < wood or int(stockpile.get("stone", 0)) < stone or int(stockpile.get("ore", 0)) < ore:
		add_log("The " + building_type + " frame stands unfinished: not enough in the stockpile.")
		return
	stockpile["wood"] = int(stockpile.get("wood", 0)) - wood
	stockpile["stone"] = int(stockpile.get("stone", 0)) - stone
	stockpile["ore"] = int(stockpile.get("ore", 0)) - ore
	var bx: int = int(q["x"])
	var bz: int = int(q["z"])
	if building_type == "longhouse" or building_type == "greathall":
		var from_type: String = "hut" if building_type == "longhouse" else "longhouse"
		var target = null
		for b in buildings:
			if int(b["x"]) == bx and int(b["z"]) == bz and String(b["type"]) == from_type:
				target = b
				break
		if target == null:
			for b in buildings:
				if int(b["x"]) == bx and int(b["z"]) == bz:
					target = b
					break
		if target != null:
			target["type"] = building_type
		grid.set_building(bx, bz, building_type)
		world.set_building_cell(bx, bz, building_type)
		population_cap += 4 if building_type == "longhouse" else 6
		add_log("A hut grows into a longhouse. The village can hold " + str(population_cap) + " souls." if building_type == "longhouse" else "A longhouse grows into a great hall. The village can hold " + str(population_cap) + " souls.")
	else:
		buildings.append({"type": building_type, "x": bx, "z": bz, "built_day": clock.day, "tier": 0})
		grid.set_building(bx, bz, building_type)
		world.set_building_cell(bx, bz, building_type)
		if building_type == "hut":
			population_cap += 4
			add_log("A new hut rises on the housing ring. The village can hold " + str(population_cap) + " souls.")
		elif building_type == "granary":
			add_log("A granary stands. Stored food will keep far longer now.")
		elif building_type == "well":
			add_log("A well is dug. Water is close at hand now.")
		elif building_type == "workshop":
			add_log("A workshop opens. Miners and woodcutters work with proper tools.")
		elif building_type == "kiln":
			add_log("A kiln is fired up. Potters shape stone into pottery.")
		elif building_type == "smithy":
			add_log("A smithy opens. The smith hammers ore into ironware.")
		elif building_type == "factory":
			add_log("A factory opens its doors. Workers turn wood, stone, and ore into wares.")
		elif building_type == "shrine":
			faith = clampf(faith + 5.0, 0.0, 100.0)
			add_log("A shrine is raised. The people take heart.")
		elif building_type == "farmhouse":
			population_cap += 2
			var added: int = clear_farm_bed(bx, bz)
			var district: String = grid.farm_district_of(bx, bz)
			add_log("A farmhouse rises in the " + (district + " fields" if district != "" else "fields") + ", with " + str(added) + " new field plots around it. It houses 2 farmhands.")
		elif building_type == "school":
			add_log("A school opens its doors. The children will learn their letters.")
		elif building_type == "healer":
			add_log("A healer's hut opens. The sick will mend faster near it.")
	assign_homes()
	# Builders are paid from the village fund for finished work.
	if fund >= 2:
		fund -= 2
		builder.coins += 2


## Clear one 3x3 farm bed beside a new farmhouse, in the farm
## district, and return how many new plots it added. The PWA
## scores beds across its districts; here the bed is the best free
## 3x3 within two cells of the farmhouse, so the fields visibly
## grow around the farmhouse that anchors them.
func clear_farm_bed(fx: int, fz: int) -> int:
	if grid.farm_cells.size() >= GodCivSimGrid.FARM_CELL_CAP:
		return 0
	var best := Vector2i(-1, -1)
	var best_free: int = -1
	for cx in range(fx - 2, fx + 3):
		for cz in range(fz - 2, fz + 3):
			var free: int = 0
			var ok: bool = true
			for dx in range(-1, 2):
				for dz in range(-1, 2):
					var x: int = cx + dx
					var z: int = cz + dz
					if not grid.is_field_zone(x, z):
						ok = false
						break
					if grid.is_water(x, z) or grid.building_at(x, z) != "" or grid.is_road(x, z) or grid.is_farm(x, z):
						ok = false
						break
					if grid.blocked(x, z):
						ok = false
						break
					free += 1
				if not ok:
					break
			if ok and free > best_free:
				best_free = free
				best = Vector2i(cx, cz)
	if best.x < 0:
		return 0
	var added: int = 0
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var x: int = best.x + dx
			var z: int = best.y + dz
			if not grid.is_farm(x, z):
				grid.add_farm_cell(x, z)
				world.set_crop_cell(x, z, 0)
				added += 1
	return added


# --- crops, trees, stone ---

func _grow_crops(dt: float) -> void:
	var growth: float = float(SEASON_GROWTH.get(season, 1.0))
	var farmhouses: Array = []
	for b in buildings:
		if String(b["type"]) == "farmhouse":
			farmhouses.append(b)
	for cell in grid.farm_cells:
		var crop: int = grid.crop_at(cell.x, cell.y)
		if crop < 0 or crop >= 3:
			continue
		# A bed near a farmhouse grows faster.
		var near_farmhouse: bool = false
		for f in farmhouses:
			if Vector2(float(cell.x) - float(f["x"]), float(cell.y) - float(f["z"])).length() <= 5.0:
				near_farmhouse = true
				break
		var grow: float = grid.crop_grow_at(cell.x, cell.y) + dt * growth * (1.5 if near_farmhouse else 1.0)
		if grow > 28.0:
			grow = 0.0
			crop += 1
			world.set_crop_cell(cell.x, cell.y, crop)
		grid.set_crop(cell.x, cell.y, crop, grow)


func _regrow_trees() -> void:
	var attempts: int = 0 if season == "winter" else (6 if season == "spring" else 3)
	for i in attempts:
		var x: int = int(rng.next_float() * float(GodCivTerrain.OLD_SIZE))
		var z: int = int(rng.next_float() * float(GodCivTerrain.OLD_SIZE))
		if grid.is_water(x, z) or grid.blocked(x, z) or grid.has_tree(x, z):
			continue
		if grid.is_farm(x, z) or grid.building_at(x, z) != "":
			continue
		if grid.stone_at(x, z) > 0:
			continue
		if Vector2(x - CENTER.x, z - CENTER.y).length() <= 8.0:
			continue
		grid.set_tree(x, z, true)
		world.set_feature_cell(x, z, GodCivWorld.TILE_TREE)


func _weather_stone() -> void:
	if grid.stone_spots.is_empty():
		return
	var spot: Vector2i = grid.stone_spots[int(rng.next_float() * float(grid.stone_spots.size()))]
	var stone: int = grid.stone_at(spot.x, spot.y)
	var ore: int = grid.ore_at(spot.x, spot.y)
	if stone < 10:
		stone += 2
		grid.set_stone(spot.x, spot.y, stone, ore)
		world.set_feature_cell(spot.x, spot.y, GodCivWorld.TILE_ORE if ore > 0 else GodCivWorld.TILE_STONE)
	if not grid.ore_spots.is_empty() and rng.next_float() < 0.3:
		var ospot: Vector2i = grid.ore_spots[int(rng.next_float() * float(grid.ore_spots.size()))]
		var oore: int = grid.ore_at(ospot.x, ospot.y)
		if oore < 6:
			grid.set_stone(ospot.x, ospot.y, grid.stone_at(ospot.x, ospot.y), oore + 1)
			world.set_feature_cell(ospot.x, ospot.y, GodCivWorld.TILE_ORE)


# --- dawn (step.js, Phase 1 subset) ---

func _on_dawn(new_day: int) -> void:
	var prev_day: int = new_day - 1
	if GodCivClock.year_of(new_day) != GodCivClock.year_of(prev_day):
		add_log("Year " + str(GodCivClock.year_of(new_day)) + " begins.")
	var new_season: String = GodCivClock.season_of(new_day)
	if new_season != season:
		season = new_season
		match season:
			"winter":
				add_log("Winter arrives. The cold bites; food keeps longer, but hunger grows.")
			"summer":
				add_log("Summer arrives. The heat is heavy; water and food needs rise.")
			_:
				add_log(GodCivClock.season_name_of(new_day) + " arrives.")
	var has_granary: bool = false
	for b in buildings:
		if String(b["type"]) == "granary":
			has_granary = true
			break
	var keep_cap: int = int(SEASON_KEEP.get(season, 60)) * (2 if has_granary else 1)
	var birth_need: int = 10 if has_granary else 14
	var edible: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	spoiled = 0
	if edible > keep_cap:
		var over: int = edible - keep_cap
		spoiled = over
		for k in ["food", "fish", "meat"]:
			var take: int = mini(int(stockpile.get(k, 0)), over)
			stockpile[k] = int(stockpile.get(k, 0)) - take
			over -= take
			if over <= 0:
				break
		if not has_granary and edible - keep_cap >= 5:
			add_log("Surplus food spoils in the open air. A granary would keep it.")
	_dawn_demographics(birth_need)
	# A shrine's dawn blessing: faith rises where the people pray.
	if has_building("shrine"):
		faith = clampf(faith + 3.0, 0.0, 100.0)
	# Deer return at dawn: the herd tops up to 4, winter 2.
	var deer_cap: int = 2 if season == "winter" else 4
	while deer.size() < deer_cap:
		_spawn_deer()
	assign_homes()
	GodCivEconomy.update_classes(self)
	GodCivEconomy.update_housing_tiers(self)
	recompute_morale()
	if morale < 20.0:
		low_morale_dawns += 1
		if low_morale_dawns >= 3 and villagers.size() > 4 and elapsed - last_leave_at > 5.0 * 180.0:
			var worst: GodCivVillager = null
			var worst_score: float = -INF
			for v in villagers:
				var sc: float = v.hunger + (100.0 - v.energy)
				if sc > worst_score:
					worst_score = sc
					worst = v
			if worst != null:
				send_away(worst)
				last_leave_at = elapsed
				low_morale_dawns = 0
	else:
		low_morale_dawns = 0
	var edible_now: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	var mouths: int = villagers.size()
	if edible_now <= 0:
		add_log("The stores stand empty. Hunger stalks the village.")
	elif edible_now < mouths:
		add_log("Food runs low: " + str(edible_now) + " meals for " + str(mouths) + " mouths.")


func _dawn_demographics(birth_need: int) -> void:
	var births: int = 0
	var deaths: int = 0
	for v in villagers.duplicate():
		v.age_days += 1
		var p: float
		if v.age_days < 3:
			p = 0.003
		elif v.age_days >= 45:
			p = 0.02 + float(v.age_days - 45) * 0.004
		else:
			p = 0.002
		if rng.next_float() < p:
			var cause: String = "old age" if v.age_days >= 45 else "a sudden illness"
			remove_villager(v, cause)
			deaths += 1
	var edible: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	var fertile: Array[GodCivVillager] = []
	for v in villagers:
		if v.age_days >= 3 and v.age_days < 45:
			fertile.append(v)
	var pairs: int = int(fertile.size() / 2)
	var food_factor: float = 1.4 if edible >= birth_need else (0.7 if edible >= birth_need / 2.0 else 0.25)
	var housing_factor: float = 0.0 if villagers.size() >= population_cap else (1.2 if villagers.size() < population_cap * 0.7 else 0.9)
	var faith_factor: float = 0.7 + faith / 200.0
	var morale_factor: float = 0.7 + (morale / 100.0) * 0.6
	var p_birth: float = minf(0.9, 0.10 * food_factor * housing_factor * faith_factor * morale_factor)
	var max_births: int = 1 + int(villagers.size() / 12)
	for i in pairs:
		if births >= max_births:
			break
		if villagers.size() >= population_cap:
			break
		if rng.next_float() < p_birth:
			var baby: GodCivVillager = _spawn_villager(CENTER.x + 1, CENTER.y + 1, false, 0, 0)
			# Parents are recorded at birth, going forward: two
			# fertile adults of opposite sex, when both exist.
			# Founders keep no record — nobody wrote theirs down.
			var mothers: Array = []
			var fathers: Array = []
			for f in fertile:
				if f.sex == "F":
					mothers.append(f)
				else:
					fathers.append(f)
			if not mothers.is_empty() and not fathers.is_empty():
				baby.parents = [
					mothers[int(rng.next_float() * float(mothers.size()))].id,
					fathers[int(rng.next_float() * float(fathers.size()))].id,
				]
			births += 1
			stats["births"] = int(stats.get("births", 0)) + 1
			add_log("A baby is born. " + baby.villager_name + " joins the village.")
	for v in villagers:
		if v.age_days >= 3:
			v.coins = mini(20, v.coins + 1)
	# The teacher is paid from the village fund for the day's lessons.
	var has_school: bool = has_building("school")
	var teacher = null
	for v in villagers:
		if v.assigned_job == "teacher":
			teacher = v
			break
	if has_school and teacher != null and fund >= 1:
		fund -= 1
		teacher.coins += 1
	# Schooling: students gain education at dawn, faster with a
	# teacher. Education caps at 10 and stays for life.
	if has_school:
		for v in villagers:
			if is_student(v):
				v.education = mini(10, v.education + (2 if teacher != null else 1))
	# Tech: educated adults push the village forward. Founders
	# arrive with some schooling, so the first tier can come from
	# them; later tiers need school graduates. Progress caps each
	# dawn so one crowded dawn cannot skip a tier.
	if int(tech.get("level", 0)) < GodCivEconomy.TECH_TIERS.size() - 1:
		var gain: int = 0
		for v in villagers:
			if v.age_days <= 8:
				continue
			if v.education >= 5:
				gain += 4
			elif v.education >= 3:
				gain += 2
		tech["progress"] = int(tech.get("progress", 0)) + mini(12, gain)
		# Later tiers cost more and need a bigger village: progress
		# holds at the threshold until the population gate is met.
		var need: int = int(GodCivEconomy.TECH_THRESHOLDS[int(tech.get("level", 0))])
		var pop_gate: int = int(GodCivEconomy.ERA_POP_GATE[int(tech.get("level", 0)) + 1])
		if int(tech.get("progress", 0)) >= need and villagers.size() >= pop_gate:
			tech["level"] = int(tech.get("level", 0)) + 1
			tech["progress"] = 0
			if int(tech.get("level", 0)) == GodCivEconomy.TECH_TIERS.size() - 1:
				population_cap += 10
				add_log("The modern city rises. Room for " + str(population_cap) + " souls now.")
			var tier: Dictionary = GodCivEconomy.TECH_TIERS[int(tech.get("level", 0))]
			add_log("The village learns " + String(tier["name"]) + ". " + String(tier["blurb"]))
	rate_history.append({"day": clock.day, "births": births, "deaths": deaths})
	if rate_history.size() > 10:
		rate_history.remove_at(0)


func recompute_morale() -> void:
	var edible: int = int(stockpile.get("food", 0)) + int(stockpile.get("fish", 0)) + int(stockpile.get("meat", 0))
	var pop: int = maxi(1, villagers.size())
	var per_mouth: float = float(edible) / float(pop)
	var homeless: int = homeless_count()
	var kinds: int = 0
	for k in ["food", "fish", "meat"]:
		if int(stockpile.get(k, 0)) > 0:
			kinds += 1
	var recent_deaths: int = 0
	for r in rate_history:
		recent_deaths += int(r.get("deaths", 0))
	var total: float = 50.0
	if per_mouth >= 8.0:
		total += 15.0
	elif per_mouth >= 4.0:
		total += 5.0
	elif per_mouth < 2.0:
		total -= 15.0
	else:
		total -= 25.0
	if homeless > 0:
		total -= minf(18.0, float(homeless) * 6.0)
	else:
		total += 10.0
	if kinds >= 3:
		total += 8.0
	elif kinds == 2:
		total += 5.0
	if recent_deaths > 0:
		total -= minf(12.0, float(recent_deaths) * 4.0)
	total += 3.0 # clear skies (weather is always clear in Phase 1)
	if faith >= 70.0:
		total += 5.0
	if faith < 30.0:
		total -= 8.0
	# Comfortable homes: a quarter or more of dwellings upgraded.
	var dwellings: Array = []
	for b in buildings:
		if String(b["type"]) in DWELLING_TYPES:
			dwellings.append(b)
	var upgraded: int = 0
	for b in dwellings:
		if int(b.get("tier", 0)) >= 1:
			upgraded += 1
	if not dwellings.is_empty() and float(upgraded) / float(dwellings.size()) >= 0.25:
		total += 4.0
	var target: float = clampf(total, 5.0, 95.0)
	morale = clampf(morale + clampf(target - morale, -4.0, 4.0), 0.0, 100.0)


# --- god powers (actions.js bless + whisper) ---

func bless_cooldown_remaining() -> float:
	return maxf(0.0, float(cooldowns.get("bless", 0.0)) - elapsed)


func try_bless() -> bool:
	if bless_cooldown_remaining() > 0.0:
		return false
	stockpile["food"] = int(stockpile.get("food", 0)) + 10
	faith = clampf(faith + 5.0, 0.0, 100.0)
	morale = clampf(morale + 2.0, 0.0, 100.0)
	stats["blessings"] = int(stats.get("blessings", 0)) + 1
	cooldowns["bless"] = elapsed + 20.0
	add_log("A blessing falls. +10 food, the people take heart.")
	stats_changed.emit()
	return true


func try_whisper(text: String) -> void:
	var clean: String = text.strip_edges()
	if clean == "":
		return
	add_log('Whisper: "' + clean.left(200) + '"')


# --- Phase 2 helpers: buildings, school, workplaces, deer, households ---

func has_building(building_type: String) -> bool:
	for b in buildings:
		if String(b["type"]) == building_type:
			return true
	return false


func building_type_at(x: int, z: int) -> String:
	for b in buildings:
		if int(b["x"]) == x and int(b["z"]) == z:
			return String(b["type"])
	return grid.building_at(x, z)


func is_student(v: GodCivVillager) -> bool:
	return has_building("school") and v.age_days >= 3 and v.age_days <= 8


func school_cell() -> Vector2i:
	for b in buildings:
		if String(b["type"]) == "school":
			return Vector2i(int(b["x"]), int(b["z"]))
	return Vector2i(-1, -1)


func workplace_cell(workplace_type: String) -> Vector2i:
	for b in buildings:
		if String(b["type"]) == workplace_type:
			return Vector2i(int(b["x"]), int(b["z"]))
	return Vector2i(-1, -1)


func guard_post_cell(_v: GodCivVillager) -> Vector2i:
	# No towers or walls exist yet, so no posts exist either.
	# Phase 3 builds the posts; a delegated guard waits idle
	# until then.
	return Vector2i(-1, -1)


func nearest_deer(x: float, z: float, max_dist: float) -> GodCivDeer:
	var best: GodCivDeer = null
	var best_d: float = max_dist
	for d in deer:
		var dd: float = Vector2(d.x - x, d.z - z).length()
		if dd < best_d:
			best_d = dd
			best = d
	return best


func kill_deer(d: GodCivDeer) -> void:
	deer.erase(d)
	d.queue_free()


func _spawn_deer() -> void:
	var dx: float = float(CENTER.x) + (rng.next_float() - 0.5) * 40.0
	var dz: float = float(CENTER.y) + (rng.next_float() - 0.5) * 40.0
	_spawn_deer_at(clampf(dx, 2.0, 317.0), clampf(dz, 2.0, 317.0))


func _spawn_deer_at(dx: float, dz: float) -> void:
	var d := GodCivDeer.new()
	add_child(d)
	d.setup(dx, dz, self)
	deer.append(d)


func household_members(v: GodCivVillager) -> Array:
	var out: Array = []
	if v.home == "":
		return out
	for other in villagers:
		if other.home == v.home:
			out.append(other)
	return out


func villager_by_id(vid: int) -> GodCivVillager:
	for v in villagers:
		if v.id == vid:
			return v
	return null


# --- save / load (format version 2, see save_manager.gd) ---

func to_save() -> Dictionary:
	var v_list: Array = []
	for v in villagers:
		v_list.append(v.to_save())
	var crop_list: Array = []
	for cell in grid.farm_cells:
		crop_list.append([cell.x, cell.y, grid.crop_at(cell.x, cell.y), grid.crop_grow_at(cell.x, cell.y)])
	var stone_list: Array = []
	for k in grid.stone_deltas.keys():
		var parts := String(k).split(",")
		var vals: Array = grid.stone_deltas[k]
		stone_list.append([int(parts[0]), int(parts[1]), int(vals[0]), int(vals[1])])
	var tree_list: Array = []
	for k in grid.tree_deltas.keys():
		var parts2 := String(k).split(",")
		tree_list.append([int(parts2[0]), int(parts2[1]), 1 if bool(grid.tree_deltas[k]) else 0])
	var road_list: Array = []
	for k in grid.roads.keys():
		var parts3 := String(k).split(",")
		road_list.append([int(parts3[0]), int(parts3[1])])
	var building_list: Array = []
	for b in buildings:
		building_list.append([String(b["type"]), int(b["x"]), int(b["z"]), int(b.get("built_day", 1)), int(b.get("tier", 0))])
	var queue_list: Array = []
	for q in build_queue:
		queue_list.append([String(q["type"]), int(q["x"]), int(q["z"]), int(q.get("progress", 0))])
	var deer_list: Array = []
	for d in deer:
		deer_list.append([d.x, d.z])
	var log_list: Array = []
	for e in log_entries.slice(0, 20):
		log_list.append([int(e["day"]), String(e["time"]), String(e["text"])])
	return {"village": {
		"elapsed": elapsed, "faith": faith, "morale": morale,
		"population_cap": population_cap, "fund": fund,
		"stockpile": stockpile, "buildings": building_list,
		"build_queue": queue_list, "villagers": v_list,
		"log": log_list, "crops": crop_list, "stones": stone_list,
		"trees": tree_list, "roads": road_list, "deer": deer_list,
		"tech": tech, "market_at": market_at,
		"next_household_id": next_household_id,
		"household_of_home": household_of_home,
		"expand_at": expand_at, "delegate_at": delegate_at,
		"tree_at": tree_at, "stone_at": stone_at,
		"cooldowns": cooldowns, "stats": stats,
		"next_villager_id": next_villager_id,
		"rate_history": rate_history, "spoiled": spoiled,
		"low_morale_dawns": low_morale_dawns,
		"last_leave_at": last_leave_at, "season": season,
	}}


func _from_save(data: Dictionary) -> void:
	elapsed = float(data.get("elapsed", 0.0))
	faith = float(data.get("faith", 55.0))
	morale = float(data.get("morale", 60.0))
	population_cap = int(data.get("population_cap", 12))
	fund = int(data.get("fund", 20))
	stockpile = {"food": 24, "wood": 24, "stone": 12, "ore": 0, "fish": 0, "meat": 0, "furniture": 0, "pottery": 0, "ironware": 0, "wares": 0}
	for k in (data.get("stockpile", {}) as Dictionary).keys():
		stockpile[k] = int((data.get("stockpile", {}) as Dictionary)[k])
	tech = {"level": 0, "progress": 0}
	for k in (data.get("tech", {}) as Dictionary).keys():
		tech[k] = int((data.get("tech", {}) as Dictionary)[k])
	market_at = float(data.get("market_at", 30.0))
	next_household_id = int(data.get("next_household_id", 1))
	household_of_home = {}
	for k in (data.get("household_of_home", {}) as Dictionary).keys():
		household_of_home[String(k)] = int((data.get("household_of_home", {}) as Dictionary)[k])
	expand_at = float(data.get("expand_at", 10.0))
	delegate_at = float(data.get("delegate_at", 5.0))
	tree_at = float(data.get("tree_at", 60.0))
	stone_at = float(data.get("stone_at", 30.0))
	cooldowns = (data.get("cooldowns", {}) as Dictionary).duplicate()
	stats = {"births": 0, "deaths": 0, "blessings": 0, "leaves": 0}
	for k in (data.get("stats", {}) as Dictionary).keys():
		stats[k] = int((data.get("stats", {}) as Dictionary)[k])
	next_villager_id = int(data.get("next_villager_id", 1))
	rate_history = (data.get("rate_history", []) as Array).duplicate()
	spoiled = int(data.get("spoiled", 0))
	low_morale_dawns = int(data.get("low_morale_dawns", 0))
	last_leave_at = float(data.get("last_leave_at", -1.0e9))
	season = String(data.get("season", "spring"))
	buildings = []
	for entry in data.get("buildings", []):
		var arr: Array = entry
		var b := {"type": String(arr[0]), "x": int(arr[1]), "z": int(arr[2]), "built_day": int(arr[3]), "tier": int(arr[4]) if arr.size() > 4 else 0}
		buildings.append(b)
		grid.set_building(int(arr[1]), int(arr[2]), String(arr[0]))
		world.set_building_cell(int(arr[1]), int(arr[2]), String(arr[0]))
	build_queue = []
	for entry in data.get("build_queue", []):
		var arr2: Array = entry
		build_queue.append({"type": String(arr2[0]), "x": int(arr2[1]), "z": int(arr2[2]), "progress": int(arr2[3])})
	for entry in data.get("crops", []):
		var arr3: Array = entry
		grid.set_crop(int(arr3[0]), int(arr3[1]), int(arr3[2]), float(arr3[3]))
		world.set_crop_cell(int(arr3[0]), int(arr3[1]), int(arr3[2]))
	for entry in data.get("stones", []):
		var arr4: Array = entry
		grid.set_stone(int(arr4[0]), int(arr4[1]), int(arr4[2]), int(arr4[3]))
		if int(arr4[2]) > 0 or int(arr4[3]) > 0:
			world.set_feature_cell(int(arr4[0]), int(arr4[1]), GodCivWorld.TILE_ORE if int(arr4[3]) > 0 else GodCivWorld.TILE_STONE)
		else:
			world.clear_feature_cell(int(arr4[0]), int(arr4[1]))
	for entry in data.get("trees", []):
		var arr5: Array = entry
		grid.set_tree(int(arr5[0]), int(arr5[1]), int(arr5[2]) == 1)
		if int(arr5[2]) == 1:
			world.set_feature_cell(int(arr5[0]), int(arr5[1]), GodCivWorld.TILE_TREE)
		else:
			world.clear_feature_cell(int(arr5[0]), int(arr5[1]))
	for entry in data.get("roads", []):
		var arr6: Array = entry
		grid.set_road(int(arr6[0]), int(arr6[1]))
		world.set_road_cell(int(arr6[0]), int(arr6[1]))
	for entry in data.get("deer", []):
		var arr8: Array = entry
		_spawn_deer_at(float(arr8[0]), float(arr8[1]))
	log_entries = []
	for entry in data.get("log", []):
		var arr7: Array = entry
		log_entries.append({"day": int(arr7[0]), "time": String(arr7[1]), "text": String(arr7[2])})
	log_changed.emit(last_log_lines())
	for entry in data.get("villagers", []):
		var vdata: Dictionary = entry
		var v: GodCivVillager = _spawn_villager(int(float(vdata.get("x", 25.0))), int(float(vdata.get("z", 25.0))), false)
		v.from_save(vdata)
	# _spawn_villager consumed fresh ids; restore the saved counter
	# (it also governs the next newborn's id).
	next_villager_id = int(data.get("next_villager_id", next_villager_id))
	assign_homes()
