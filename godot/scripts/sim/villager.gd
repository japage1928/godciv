class_name GodCivVillager
extends Node2D

# One villager: data, utility brain, movement, and drawing.
# Ported from the PWA (src/sim/core.js makeVillager, src/sim/brain.js
# think/scoreJob/doWork, src/sim/step.js villager loop), Phase 3:
# all 13 jobs, production recipes, tools, school/students, deer
# hunting, and the evolution gates (teacher and production jobs
# check their discovery before scoring); guard posts are Phase 4.
# Drawn as a person: tunic, hair or a job hat, stepping legs, a
# tool in hand while working, a class sash, a gold circlet for the
# leader, children visibly smaller. Hauling is a STATE (carry full,
# walk home), not a job, exactly like the PWA.
#
# `sim` is the village node, held untyped (Node) so this script has
# no cyclic class reference back to GodCivVillage; it reads the
# stockpile, faith, morale, build queue, clock, grid, world, and
# rng through it. The village owns the tick: it calls step() once
# per frame with sim-seconds and removes villagers step() reports
# dead. No LLM anywhere: decisions are utility scores.

const TRAITS: Array[String] = ["devout", "skeptic", "brave", "cautious", "industrious", "lazy", "kind", "greedy"]
const NAMES: Array[String] = ["Ash", "Bram", "Cora", "Dun", "Elowen", "Fenn", "Greta", "Hob", "Ilsa", "Jory", "Kessa", "Lorn", "Mira", "Nils", "Odessa", "Perrin", "Quill", "Rosa", "Soren", "Tilda", "Ulric", "Vera", "Wren", "Yannick"]
const SEASON_HUNGER: Dictionary = {"spring": 0.0, "summer": 0.04, "autumn": 0.0, "winter": 0.08}
const WALK_SPEED: float = 2.2 # cells per sim-second, PWA step.js
const TUNIC_COLORS: Array[Color] = [
	Color(0.55, 0.42, 0.30), Color(0.35, 0.45, 0.55), Color(0.50, 0.35, 0.35),
	Color(0.40, 0.50, 0.35), Color(0.55, 0.50, 0.35), Color(0.45, 0.38, 0.50),
]
const SKIN_COLOR: Color = Color(0.85, 0.68, 0.52)
const HAIR_COLORS: Array[Color] = [
	Color(0.25, 0.16, 0.10), Color(0.12, 0.10, 0.08), Color(0.75, 0.62, 0.35),
	Color(0.45, 0.25, 0.12), Color(0.55, 0.55, 0.55),
]

var id: int = 0
var villager_name: String = "Ash"
var x: float = 24.0
var z: float = 24.0
var path: Array[Vector2i] = []
var target: Vector2i = Vector2i(-1, -1)
var job: String = "farmer"
var assigned_job: String = ""
var traits: Array[String] = []
var skills: Dictionary = {}
var leader: bool = false
var age_days: int = 25
var sex: String = "M"
var coins: int = 5
var goods: Dictionary = {}
var home: String = ""
var tool: int = 0
var tool_tick: int = 0
var hunger: float = 20.0
var energy: float = 80.0
var health: float = 100.0
var carry: Dictionary = {}
var carry_cap: int = 5
var state: String = "idle"
var work_timer: float = 0.0
var sick: bool = false
var rethink_at: float = 0.0
var stuck_at: float = 0.0
var last_x: float = 24.0
var last_z: float = 24.0
var rest_until: float = 0.0
var delegated: bool = false
var wander_n: int = 0
var education: int = 2
var class_level: int = 0
var parents: Array = []
var post = null # Guard post (Vector2i), Phase 4: no posts exist yet.

var sim: Node = null
var grid: GodCivSimGrid = null
var world: GodCivWorld = null

var _moving: bool = false
var _arrived: bool = false
var _walk_phase: float = 0.0
var _work_swing: float = 0.0


func setup(p_id: int, p_x: float, p_z: float, p_leader: bool, p_sim: Node, p_rng: GodCivRng) -> void:
	id = p_id
	x = p_x
	z = p_z
	last_x = p_x
	last_z = p_z
	leader = p_leader
	sim = p_sim
	grid = p_sim.grid
	world = p_sim.world
	villager_name = NAMES[(id - 1) % NAMES.size()] + (" " + str(int(ceil(float(id) / float(NAMES.size())))) if id > NAMES.size() else "")
	while traits.size() < 2:
		var t: String = TRAITS[int(p_rng.next_float() * float(TRAITS.size()))]
		if not traits.has(t):
			traits.append(t)
	for j in GodCivEconomy.JOBS:
		skills[j] = int(p_rng.next_float() * 3.0)
	job = GodCivEconomy.JOBS[int(p_rng.next_float() * float(GodCivEconomy.JOBS.size()))]
	age_days = 18 + int(p_rng.next_float() * 22.0)
	# Adults arrive with some schooling; newborns start unschooled
	# (see _spawn_villager, which overrides age and education).
	education = 2 + int(p_rng.next_float() * 4.0)
	sex = "F" if p_rng.next_float() < 0.5 else "M"
	coins = 5
	for g in GodCivEconomy.PRICES.keys():
		goods[g] = 0
	hunger = 15.0 + p_rng.next_float() * 20.0
	energy = 75.0 + p_rng.next_float() * 20.0
	health = 100.0
	position = Vector2(x * 16.0 + 8.0, z * 16.0 + 8.0)


func target_valid() -> bool:
	return target.x >= 0 and target.y >= 0


func clear_target() -> void:
	target = Vector2i(-1, -1)
	path = []


## Port of grid.js setTarget: a blocked target cell is worked
## from a free neighbour, but the villager's target stays the
## original cell so arrival is measured against it.
func set_target(tx: int, tz: int) -> void:
	if not grid.in_bounds(tx, tz):
		clear_target()
		return
	var px: int = tx
	var pz: int = tz
	if grid.blocked(tx, tz):
		var found: bool = false
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = tx + d.x
			var nz: int = tz + d.y
			if grid.in_bounds(nx, nz) and not grid.blocked(nx, nz):
				px = nx
				pz = nz
				found = true
				break
		if not found:
			clear_target()
			return
	target = Vector2i(tx, tz)
	var p: Variant = grid.find_path(int(round(x)), int(round(z)), px, pz)
	if p == null:
		path = []
	else:
		path = []
		for c in (p as Array):
			path.append(c as Vector2i)


func _spread_target(ax: int, az: int, min_r: float, max_r: float, salt: int) -> void:
	# Anti-clustering spread (brain.js spreadTarget): a stable
	# per-villager ring cell from hash01, four quarter-turn
	# fallbacks, then the anchor cell itself.
	var angle: float = GodCivRng.hash01(sim.seed, id, 11, salt) * TAU
	var r: float = min_r + GodCivRng.hash01(sim.seed, id, 12, salt) * (max_r - min_r)
	for k in 4:
		var a: float = angle + float(k) * PI / 2.0
		var cx: int = int(round(float(ax) + cos(a) * r))
		var cz: int = int(round(float(az) + sin(a) * r))
		if not grid.in_bounds(cx, cz):
			continue
		if grid.blocked(cx, cz):
			continue
		set_target(cx, cz)
		return
	set_target(ax, az)


func _assign_wander() -> void:
	var home_cell: Vector2i = Vector2i(sim.center.x, sim.center.y)
	if home != "":
		var parts := home.split(",")
		home_cell = Vector2i(int(parts[0]), int(parts[1]))
	var child: bool = age_days < 3
	wander_n += 1
	var min_r: float = 1.0 if child else 3.0
	var max_r: float = 2.0 if child else 9.0
	var angle: float = GodCivRng.hash01(sim.seed, id, wander_n, 911) * TAU
	var r: float = min_r + GodCivRng.hash01(sim.seed, id, wander_n + 500, 911) * (max_r - min_r)
	state = "wander"
	for k in 4:
		var a: float = angle + float(k) * PI / 2.0
		var cx: int = int(round(float(home_cell.x) + cos(a) * r))
		var cz: int = int(round(float(home_cell.y) + sin(a) * r))
		if not grid.in_bounds(cx, cz):
			continue
		if grid.blocked(cx, cz):
			continue
		set_target(cx, cz)
		return
	set_target(home_cell.x, home_cell.y)


func _refuses_assignment() -> bool:
	var p: float = 0.08
	if traits.has("skeptic"):
		p += 0.18
	if traits.has("devout"):
		p -= 0.03
	if traits.has("greedy"):
		p += 0.06
	if sim.faith < 40:
		p += 0.12
	if sim.morale < 35:
		p += 0.12
	if sim.morale > 75:
		p -= 0.04
	return sim.rng.next_float() < clampf(p, 0.0, 0.5)


func score_job(p_job: String) -> float:
	var s: Dictionary = sim.stockpile
	var deficit := func(have: float, want: float) -> float: return maxf(0.0, want - have)
	var skill: int = int(skills.get(p_job, 1))
	var score: float = 4.0 + float(skill) * 2.0
	if traits.has("industrious"):
		score += 1.5
	if traits.has("lazy"):
		score -= 2.0
	if p_job == "farmer":
		score += deficit.call(float(s.get("food", 0)) + float(s.get("fish", 0)) + float(s.get("meat", 0)), 40.0) * 0.35
	elif p_job == "woodcutter":
		score += deficit.call(float(s.get("wood", 0)), 30.0) * 0.4 + (2.0 if (sim.build_queue as Array).size() > 0 else 0.0)
	elif p_job == "fisher":
		score += deficit.call(float(s.get("food", 0)) + float(s.get("fish", 0)) + float(s.get("meat", 0)), 40.0) * 0.25 + deficit.call(float(s.get("fish", 0)), 10.0) * 0.3 + (3.0 if float(s.get("fish", 0)) < 5.0 else 0.0) - (12.0 if float(s.get("fish", 0)) >= 30.0 else (6.0 if float(s.get("fish", 0)) >= 15.0 else 0.0))
	elif p_job == "hunter":
		score += deficit.call(float(s.get("food", 0)) + float(s.get("fish", 0)) + float(s.get("meat", 0)), 40.0) * 0.22
	elif p_job == "miner":
		score += deficit.call(float(s.get("stone", 0)), 24.0) * 0.25 + deficit.call(float(s.get("ore", 0)), 6.0) * 0.3
	elif p_job == "builder":
		score += 8.0 if (sim.build_queue as Array).size() > 0 else -4.0
	elif p_job == "hauler":
		score += 7.0 if not carry.is_empty() else 1.5
	elif p_job == "teacher":
		# No school, no teaching: the score stays far below real
		# work. A school implies Bronze craft (demands gate it),
		# but the tech check stays explicit.
		var teacher_ok: bool = sim.has_building("school") and int((sim.tech as Dictionary).get("level", 0)) >= 1
		score += 5.0 if teacher_ok else -30.0
	elif p_job in GodCivEconomy.PRODUCTION_RECIPES:
		var recipe: Dictionary = GodCivEconomy.PRODUCTION_RECIPES[p_job]
		var output: String = String(recipe["output"])
		# No workplace, no work (-30, like the teacher without a
		# school); a workplace before its discovery is impossible
		# (demands gate it), but the tech check stays explicit so
		# a loaded save can never drift a potter into a pre-Bronze
		# village. With a workplace, the score follows the balance
		# of the product in the stockpile against PRODUCTION_WANT.
		var job_gate: int = GodCivEconomy.tech_gate_for_job(p_job)
		var tech_ok: bool = int((sim.tech as Dictionary).get("level", 0)) >= job_gate
		score += (float(GodCivEconomy.PRODUCTION_WANT) - float(s.get(output, 0))) * 0.3 if (tech_ok and sim.has_building(String(recipe["workplace"]))) else -30.0
	elif p_job == "guard":
		# Guards are a delegation-only job: nobody drifts into it
		# unless there are posts to hold. A delegated guard stays.
		score += 2.0 if (sim.has_building("tower") or sim.has_building("wall")) else -8.0
		if traits.has("brave"):
			score += 2.0
	if assigned_job == p_job:
		score += 12.0
	if p_job == "fisher" and assigned_job == "fisher":
		score += 6.0 # a standing post: the delegated fisher stays at the shore
	if p_job == "guard" and assigned_job == "guard":
		score += 6.0 # standing post
	if job == p_job:
		score += 1.0
	return score


func _best_job() -> String:
	var best: String = job
	var best_score: float = -INF
	for j in GodCivEconomy.JOBS:
		var sc: float = score_job(j)
		if sc > best_score:
			best_score = sc
			best = j
	return best


func think() -> void:
	var cx: int = sim.center.x
	var cz: int = sim.center.y
	if health <= 0.0:
		return
	if hunger >= 75.0:
		state = "eat"
		var edible: int = int(sim.stockpile.get("food", 0)) + int(sim.stockpile.get("fish", 0)) + int(sim.stockpile.get("meat", 0))
		if edible > 0:
			_spread_target(cx, cz, 1.0, 2.0, 901)
		else:
			var plot: Vector2i = grid.nearest_farm(x, z, true)
			if plot.x >= 0:
				set_target(plot.x, plot.y)
			else:
				state = "idle"
		return
	if energy <= 18.0 or sick:
		state = "rest"
		var home_cell := _home_cell(Vector2i(cx - 2, cz - 3))
		set_target(home_cell.x, home_cell.y)
		return
	if not carry.is_empty() and int(carry.get("amt", 0)) >= carry_cap:
		state = "haul"
		_spread_target(cx, cz, 1.0, 2.0, 902)
		return
	if sim.clock.phase() == "night":
		state = "rest"
		var home_cell2 := _home_cell(Vector2i(cx - 2, cz - 3))
		set_target(home_cell2.x, home_cell2.y)
		return
	if age_days < 3:
		job = "child"
		state = "idle"
		assigned_job = ""
		var home_cell3 := _home_cell(Vector2i(cx, cz))
		if Vector2(x - (float(home_cell3.x) + 0.5), z - (float(home_cell3.y) + 0.5)).length() > 3.0:
			set_target(home_cell3.x, home_cell3.y)
		elif sim.elapsed >= rest_until:
			_assign_wander()
		return
	if sim.is_student(self):
		# School days: a student walks to the school and learns
		# there. No job, no delegation, no refusal — children do
		# what the school bell says.
		job = "student"
		state = "work"
		var school_cell: Vector2i = sim.school_cell()
		if school_cell.x >= 0:
			set_target(school_cell.x, school_cell.y)
		else:
			state = "idle"
		if state == "idle" and sim.elapsed >= rest_until:
			_assign_wander()
		return
	var next_job: String = _best_job()
	delegated = next_job == assigned_job
	if assigned_job != "" and next_job == assigned_job and _refuses_assignment():
		var second: String = ""
		var second_score: float = -INF
		for j in GodCivEconomy.JOBS:
			if j == assigned_job:
				continue
			var sc: float = score_job(j)
			if sc > second_score:
				second_score = sc
				second = j
		if second != "":
			next_job = second
			delegated = false
			if sim.rng.next_float() < 0.08:
				sim.add_log(villager_name + " ignores the leader's delegation and works as a " + next_job + " instead.")
	job = next_job
	state = "work"
	if next_job == "farmer":
		var ripe: Vector2i = grid.nearest_farm(x, z, true)
		var plot: Vector2i = ripe
		if plot.x < 0:
			plot = grid.nearest_farm(x, z, false)
		if plot.x >= 0:
			set_target(plot.x, plot.y)
		else:
			state = "idle"
	elif next_job == "woodcutter":
		var tree: Vector2i = grid.nearest_tree(x, z)
		if tree.x >= 0:
			set_target(tree.x, tree.y)
		else:
			state = "idle"
	elif next_job == "miner":
		var carry_type: String = String(carry.get("type", ""))
		var node: Vector2i = grid.nearest_mineral(x, z, carry_type)
		if node.x >= 0:
			set_target(node.x, node.y)
		elif not carry.is_empty():
			state = "haul"
			_spread_target(cx, cz, 1.0, 2.0, 902)
		else:
			state = "idle"
	elif next_job == "builder":
		var queue: Array = sim.build_queue
		if queue.size() > 0:
			var q: Dictionary = queue[0]
			set_target(int(q["x"]), int(q["z"]))
		else:
			state = "idle"
	elif next_job == "fisher":
		var shore: Vector2i = grid.nearest_shore(x, z)
		if shore.x >= 0:
			set_target(shore.x, shore.y)
		else:
			state = "idle"
	elif next_job == "hunter":
		# Chase the nearest deer within 24 cells; the hunter's
		# step() re-targets as the deer runs, so it never chases a
		# stale cell.
		var d = sim.nearest_deer(x, z, 24.0)
		if d != null:
			set_target(int(d.x), int(d.z))
		else:
			state = "idle"
	elif next_job == "hauler":
		# Haulers shuttle: the nearest ripe farm plot, else the
		# nearest stone node. At a ripe plot a hauler stands and
		# waits — harvesting there is the farmer's work, and the
		# hauler's value is the haul state when its own carry
		# fills. At a stone node it works like a miner.
		var ripe: Vector2i = grid.nearest_farm(x, z, true)
		var node: Vector2i = grid.nearest_mineral(x, z, "")
		var dest: Vector2i = ripe if ripe.x >= 0 else node
		if dest.x >= 0:
			set_target(dest.x, dest.y)
		else:
			state = "idle"
	elif next_job == "teacher":
		var school_cell2: Vector2i = sim.school_cell()
		if school_cell2.x >= 0:
			set_target(school_cell2.x, school_cell2.y)
		else:
			state = "idle"
	elif next_job in GodCivEconomy.PRODUCTION_RECIPES:
		var recipe2: Dictionary = GodCivEconomy.PRODUCTION_RECIPES[next_job]
		var site: Vector2i = sim.workplace_cell(String(recipe2["workplace"]))
		if site.x >= 0:
			set_target(site.x, site.y)
		else:
			state = "idle"
	elif next_job == "guard":
		# No towers or walls exist yet, so no posts exist either;
		# a delegated guard waits at the town center (Phase 3
		# builds the posts).
		var post_cell: Vector2i = sim.guard_post_cell(self)
		if post_cell.x >= 0:
			set_target(post_cell.x, post_cell.y)
		else:
			state = "idle"
	if state == "idle" and sim.elapsed >= rest_until:
		_assign_wander()


func _home_cell(fallback: Vector2i) -> Vector2i:
	if home == "":
		return fallback
	var parts := home.split(",")
	return Vector2i(int(parts[0]), int(parts[1]))


func _work_need(base: float) -> float:
	var morale_eff: float = 0.85 + (float(sim.morale) / 100.0) * 0.3
	var need: float = base / (morale_eff * (1.0 + 0.25 * float(tool)))
	if int((sim.tech as Dictionary).get("level", 0)) >= 5:
		need *= 0.9 # Electric age: work runs faster.
	return need


func _tool_bonus() -> int:
	# Fine tools add one, steel tools add one more, on every
	# harvest action that yields a carried good.
	return (1 if tool >= 2 else 0) + (1 if tool >= 3 else 0)


func _workshop_tick(good_type: String) -> void:
	# With a workshop, every second work action (Bronze craft)
	# or third (before it) yields one extra unit of the same
	# good — proper tools pay for themselves.
	if not sim.has_building("workshop"):
		return
	tool_tick += 1
	var every: int = 2 if int((sim.tech as Dictionary).get("level", 0)) >= 1 else 3
	if tool_tick % every == 0:
		_add_carry(good_type, 1)


func _add_carry(good_type: String, amt: int = 1) -> void:
	if carry.is_empty():
		carry = {"type": good_type, "amt": 0}
	if String(carry.get("type", "")) != good_type:
		return
	carry["amt"] = mini(carry_cap, int(carry.get("amt", 0)) + amt)


func do_work(dt: float) -> void:
	if not target_valid():
		return
	var tx: int = target.x
	var tz: int = target.y
	work_timer += dt
	var base_need: float = 2.5 if job == "builder" else (9.0 if job == "fisher" else (2.0 if job == "teacher" else 1.6))
	if work_timer < _work_need(base_need):
		return
	work_timer = 0.0
	if job == "farmer" and grid.is_farm(tx, tz):
		var crop: int = grid.crop_at(tx, tz)
		if crop == 3:
			grid.set_crop(tx, tz, 0, 0.0)
			world.set_crop_cell(tx, tz, 0)
			# Bronze craft and Iron craft each add a sheaf; fine
			# and steel tools add one more apiece.
			var tech_level: int = int((sim.tech as Dictionary).get("level", 0))
			_add_carry("food", 2 + (1 if tech_level >= 1 else 0) + (1 if tech_level >= 2 else 0) + _tool_bonus())
		elif crop >= 0:
			var next_crop: int = mini(3, crop + 1)
			grid.set_crop(tx, tz, next_crop, 0.0)
			world.set_crop_cell(tx, tz, next_crop)
	elif job == "woodcutter" and grid.has_tree(tx, tz):
		grid.set_tree(tx, tz, false)
		world.clear_feature_cell(tx, tz)
		_add_carry("wood", 2 + _tool_bonus())
		_workshop_tick("wood")
	elif job == "miner" and (grid.stone_at(tx, tz) > 0 or grid.ore_at(tx, tz) > 0):
		var stone: int = grid.stone_at(tx, tz)
		var ore: int = grid.ore_at(tx, tz)
		var carry_type: String = String(carry.get("type", ""))
		var carry_ok := func(t: String) -> bool: return carry.is_empty() or carry_type == t
		if ore > 0 and carry_ok.call("ore") and sim.rng.next_float() < 0.35:
			ore -= 1
			_add_carry("ore", 1)
		elif stone > 0 and carry_ok.call("stone"):
			stone -= 1
			_add_carry("stone", 1 + _tool_bonus())
		grid.set_stone(tx, tz, stone, ore)
		if stone <= 0 and ore <= 0:
			world.clear_feature_cell(tx, tz)
		else:
			world.set_feature_cell(tx, tz, GodCivWorld.TILE_ORE if ore > 0 else GodCivWorld.TILE_STONE)
		_workshop_tick("stone")
	elif job == "hauler" and (grid.stone_at(tx, tz) > 0 or grid.ore_at(tx, tz) > 0):
		# A hauler shuttles like a miner at a stone node — same
		# carry-aware rule, no workshop tick.
		var stone2: int = grid.stone_at(tx, tz)
		var ore2: int = grid.ore_at(tx, tz)
		var carry_type2: String = String(carry.get("type", ""))
		var carry_ok2 := func(t: String) -> bool: return carry.is_empty() or carry_type2 == t
		if ore2 > 0 and carry_ok2.call("ore") and sim.rng.next_float() < 0.35:
			ore2 -= 1
			_add_carry("ore", 1)
		elif stone2 > 0 and carry_ok2.call("stone"):
			stone2 -= 1
			_add_carry("stone", 1 + _tool_bonus())
		grid.set_stone(tx, tz, stone2, ore2)
		if stone2 <= 0 and ore2 <= 0:
			world.clear_feature_cell(tx, tz)
			# Fallback at a node just spent: carry wood home.
			_add_carry("wood", 1)
		else:
			world.set_feature_cell(tx, tz, GodCivWorld.TILE_ORE if ore2 > 0 else GodCivWorld.TILE_STONE)
	elif job == "builder":
		var queue: Array = sim.build_queue
		if queue.size() > 0:
			var q: Dictionary = queue[0]
			# Steam and brick doubles building speed.
			q["progress"] = int(q.get("progress", 0)) + (2 if int((sim.tech as Dictionary).get("level", 0)) >= 4 else 1)
			var need_progress: int = sim.build_progress_for(String(q.get("type", "")))
			if int(q["progress"]) >= need_progress:
				sim.complete_build(q, self)
	elif job == "fisher" and sim.grid.is_shore(tx, tz):
		_add_carry("fish", 1 + _tool_bonus())
	elif job == "hunter":
		var d = sim.nearest_deer(x, z, 2.2)
		if d != null:
			sim.kill_deer(d)
			_add_carry("meat", 3 + _tool_bonus())
			sim.add_log(villager_name + " brings down a deer.")
	elif job == "teacher" or job == "student" or job == "guard" or job == "hauler":
		# No per-action work: teaching and learning happen at
		# dawn (schooling roll), a guard watches from the post,
		# and a hauler's work is the haul state itself.
		pass
	elif job in GodCivEconomy.PRODUCTION_RECIPES:
		var recipe: Dictionary = GodCivEconomy.PRODUCTION_RECIPES[job]
		var inputs: Dictionary = recipe["inputs"]
		var output: String = String(recipe["output"])
		# Inputs leave the stockpile only at the workplace, only
		# when the whole recipe fits the villager's carry, and
		# only while the stockpile holds less than
		# PRODUCTION_WANT of the output — never from thin air,
		# and never at the cost of the wood the village needs
		# to build with.
		var at_workplace: bool = sim.grid.building_at(tx, tz) == String(recipe["workplace"])
		var out_amt: int = int(recipe["out_amt"])
		var carry_room: bool = carry.is_empty() or (String(carry.get("type", "")) == output and int(carry.get("amt", 0)) + out_amt <= carry_cap)
		var has_inputs: bool = true
		for inp in inputs.keys():
			if int(sim.stockpile.get(inp, 0)) < int(inputs[inp]):
				has_inputs = false
		var want_met: bool = int(sim.stockpile.get(output, 0)) >= GodCivEconomy.PRODUCTION_WANT
		if at_workplace and carry_room and has_inputs and not want_met:
			for inp2 in inputs.keys():
				sim.stockpile[inp2] = int(sim.stockpile.get(inp2, 0)) - int(inputs[inp2])
			_add_carry(output, out_amt)


## One sim tick. Returns false when the villager died this tick
## (the village removes them); true otherwise.
func step(dt: float) -> bool:
	var phase: String = sim.clock.phase()
	var hunger_rate: float = 0.23 if age_days < 3 else (0.34 if sim.has_building("well") else 0.38)
	hunger_rate += float(SEASON_HUNGER.get(sim.season, 0.0))
	if phase == "night" and state == "rest":
		hunger_rate *= 0.4
	hunger = clampf(hunger + dt * hunger_rate, 0.0, 100.0)
	if state == "rest":
		energy = clampf(energy + dt * (10.0 if phase == "night" else 6.0), 0.0, 100.0)
	else:
		energy = clampf(energy - dt * 0.4, 0.0, 100.0)
	if hunger >= 100.0:
		health = clampf(health - dt * 1.2, 0.0, 100.0)
	if health <= 0.0:
		sim.remove_villager(self, "hunger and hardship")
		return false
	if sim.elapsed >= rethink_at:
		rethink_at = sim.elapsed + 4.0 + sim.rng.next_float() * 3.0
		think()
	# A hunter re-chases the deer's live position every tick: the
	# deer runs, so a path computed at think() time goes stale in
	# seconds. Direct-walk (path cleared) — the deer is faster on
	# the open ground, but it stops at each flee destination and
	# at the map edge, and the hunter closes in.
	if job == "hunter" and state == "work":
		var hd = sim.nearest_deer(x, z, 24.0)
		if hd != null:
			path.clear()
			target = Vector2i(int(hd.x), int(hd.z))
	# Movement along the path, or direct toward the target.
	_moving = false
	if path.size() > 0:
		var next_cell: Vector2i = path[0]
		var dx: float = float(next_cell.x) + 0.5 - x
		var dz: float = float(next_cell.y) + 0.5 - z
		var dist: float = Vector2(dx, dz).length()
		if dist < 0.25:
			path.remove_at(0)
		else:
			var on_road: bool = grid.is_road(clampi(int(round(x)), 0, 319), clampi(int(round(z)), 0, 319))
			var sp: float = WALK_SPEED * (1.35 if on_road else 1.0) * dt
			var step_len: float = minf(sp, dist)
			x += (dx / dist) * step_len
			z += (dz / dist) * step_len
			_moving = true
			_walk_phase += step_len * 2.2
	elif target_valid():
		var dx2: float = float(target.x) + 0.5 - x
		var dz2: float = float(target.y) + 0.5 - z
		var dist2: float = Vector2(dx2, dz2).length()
		var stop_at: float = 1.0 if grid.blocked(target.x, target.y) else 0.4
		if dist2 > stop_at:
			var sp2: float = WALK_SPEED * dt
			var step_len2: float = minf(sp2, dist2 - stop_at + 0.05)
			x += (dx2 / dist2) * step_len2
			z += (dz2 / dist2) * step_len2
			_moving = true
			_walk_phase += step_len2 * 2.2
	# Arrived?
	_arrived = false
	if target_valid() and path.is_empty():
		var adx: float = float(target.x) + 0.5 - x
		var adz: float = float(target.y) + 0.5 - z
		if Vector2(adx, adz).length() < 1.1:
			_arrived = true
			if state == "eat":
				_arrive_eat()
			elif state == "haul":
				_arrive_haul()
			elif state == "wander":
				state = "idle"
				clear_target()
				rest_until = sim.elapsed + 4.0 + GodCivRng.hash01(sim.seed, id, wander_n, 912) * 5.0
			elif state == "idle":
				clear_target()
			elif state == "work":
				do_work(dt * 3.0)
				_work_swing += dt * 3.0
			elif state == "rest":
				energy = clampf(energy + dt * 4.0, 0.0, 100.0)
				if energy > 80.0 and phase != "night":
					state = "idle"
					clear_target()
	# Stuck detection: not moving toward a target for 6 sim-seconds
	# means rethink sooner (step.js).
	if not _moving and target_valid() and Vector2(x - last_x, z - last_z).length() < 0.01:
		stuck_at += dt
	else:
		stuck_at = 0.0
	last_x = x
	last_z = z
	if stuck_at > 6.0:
		rethink_at = sim.elapsed
		stuck_at = 0.0
	position = Vector2(x * 16.0 + 8.0, z * 16.0 + 8.0)
	queue_redraw()
	return true


func _arrive_eat() -> void:
	var pile: Dictionary = sim.stockpile
	var kinds: Array[String] = ["food", "fish", "meat"]
	var most_abundant := func(store: Dictionary) -> String:
		var best_kind: String = ""
		var best_amt: int = 0
		for k in kinds:
			var amt: int = int(store.get(k, 0))
			if amt > best_amt:
				best_amt = amt
				best_kind = k
		return best_kind
	var eat_kind: String = most_abundant.call(goods)
	if eat_kind == "":
		eat_kind = most_abundant.call(pile)
	var ate: bool = false
	if eat_kind != "":
		if int(goods.get(eat_kind, 0)) > 0:
			goods[eat_kind] = int(goods[eat_kind]) - 1
		else:
			pile[eat_kind] = int(pile[eat_kind]) - 1
			if coins >= int(GodCivEconomy.PRICES[eat_kind]):
				coins -= int(GodCivEconomy.PRICES[eat_kind])
				sim.fund += int(GodCivEconomy.PRICES[eat_kind])
		ate = true
	elif target_valid() and grid.is_farm(target.x, target.y) and grid.crop_at(target.x, target.y) == 3:
		grid.set_crop(target.x, target.y, 0, 0.0)
		world.set_crop_cell(target.x, target.y, 0)
		ate = true
	if ate:
		hunger = clampf(hunger - 45.0, 0.0, 100.0)
	state = "idle"
	clear_target()
	rethink_at = sim.elapsed + 1.0


func _arrive_haul() -> void:
	if not carry.is_empty():
		var amt: int = int(carry.get("amt", 0))
		var good_type: String = String(carry.get("type", ""))
		var keep: int = 1 if amt >= 2 else 0
		sim.stockpile[good_type] = int(sim.stockpile.get(good_type, 0)) + (amt - keep)
		if keep > 0:
			goods[good_type] = mini(6, int(goods.get(good_type, 0)) + keep)
		carry = {}
	state = "idle"
	clear_target()
	rethink_at = sim.elapsed + 0.5


func _draw() -> void:
	# A person, not a pawn: tunic, skin, hair or a job hat, legs
	# that step while walking, a tool in hand while working, and a
	# bundle on the back while carrying. Children are smaller.
	# Every look is deterministic from the id, so a villager keeps
	# their face for life. Class shows as a sash; the leader wears
	# a gold circlet.
	var child: bool = age_days < 3
	var scale: float = 0.7 if child else 1.0
	var bob: float = 0.0
	if _moving:
		bob = -absf(sin(_walk_phase * 3.0)) * 2.0
	var step: float = sin(_walk_phase * 3.0) * 1.5 if _moving else 0.0
	# Shadow stays on the ground, unscaled.
	draw_circle(Vector2(0, 4), 5.0, Color(0, 0, 0, 0.25))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(scale, scale))
	# Legs: two feet that step apart while walking.
	draw_circle(Vector2(-2.0, 4.0 + step), 1.6, Color(0.25, 0.18, 0.12))
	draw_circle(Vector2(2.0, 4.0 - step), 1.6, Color(0.25, 0.18, 0.12))
	var tunic: Color = TUNIC_COLORS[id % TUNIC_COLORS.size()]
	# Body: a tunic with a belt, arms at the sides swinging as the
	# villager walks.
	draw_circle(Vector2(0, bob), 6.0, tunic)
	draw_line(Vector2(-5.5, 2.0 + bob), Vector2(5.5, 2.0 + bob), Color(0.25, 0.18, 0.10), 1.0)
	var arm_swing: float = step * 0.8
	draw_line(Vector2(-5.0, -1.0 + bob), Vector2(-6.5, 3.0 + bob + arm_swing), SKIN_COLOR, 1.5)
	draw_line(Vector2(5.0, -1.0 + bob), Vector2(6.5, 3.0 + bob - arm_swing), SKIN_COLOR, 1.5)
	# Head.
	draw_circle(Vector2(0, -6.0 + bob), 3.5, SKIN_COLOR)
	_draw_headwear(bob)
	# Class sash across the tunic: blue artisan, gold merchant,
	# purple gentry.
	if class_level >= 1:
		var sash: Color = Color(0.30, 0.45, 0.75) if class_level == 1 else (Color(0.85, 0.70, 0.25) if class_level == 2 else Color(0.60, 0.35, 0.65))
		draw_line(Vector2(-4.5, -3.5 + bob), Vector2(4.5, 3.5 + bob), sash, 1.5)
	if leader:
		draw_arc(Vector2(0, -7.5 + bob), 3.8, PI * 1.15, PI * 1.85, 8, Color(0.95, 0.8, 0.2), 1.5)
	if state == "work" and _arrived:
		_draw_tool(bob)
	if not carry.is_empty():
		draw_rect(Rect2(-3.0, -2.0 + bob, 6.0, 5.0), Color(0.55, 0.40, 0.20))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_headwear(bob: float) -> void:
	# Hair and hats, deterministic per villager. Job hats win over
	# hair: a farmer's straw hat, a builder's cap, a hunter's hood.
	var hair: Color = HAIR_COLORS[id % HAIR_COLORS.size()]
	if age_days >= 45:
		hair = Color(0.75, 0.75, 0.75)
	if job == "farmer":
		# Straw hat: a wide flat brim and a domed top, sitting on
		# the head without hiding the face.
		draw_rect(Rect2(-5.0, -9.5 + bob, 10.0, 1.5), Color(0.85, 0.72, 0.40))
		draw_circle(Vector2(0, -10.0 + bob), 2.5, Color(0.80, 0.66, 0.35))
		return
	if job == "builder":
		# Flat cap: a low dome over the top of the head, brim to
		# the side.
		draw_circle(Vector2(0, -9.5 + bob), 3.0, Color(0.35, 0.38, 0.45))
		draw_line(Vector2(0, -8.5 + bob), Vector2(4.5, -7.0 + bob), Color(0.35, 0.38, 0.45), 1.5)
		return
	if job == "hunter":
		# Hood: a dark ring around the face.
		draw_arc(Vector2(0, -6.0 + bob), 4.2, 0.0, TAU, 12, Color(0.30, 0.40, 0.25), 2.0)
		return
	if sex == "F":
		# Hair with a bun.
		draw_circle(Vector2(-3.0, -7.0 + bob), 2.0, hair)
		draw_circle(Vector2(3.0, -7.0 + bob), 2.0, hair)
		draw_circle(Vector2(0, -10.0 + bob), 1.8, hair)
	else:
		# Short hair on top, plus a beard on older men.
		draw_arc(Vector2(0, -6.0 + bob), 3.6, PI, TAU, 8, hair, 2.0)
		if age_days >= 30 and GodCivRng.hash01(id, 3, 7, 11) < 0.5:
			draw_rect(Rect2(-1.5, -3.5 + bob, 3.0, 2.0), hair)


func _draw_tool(bob: float) -> void:
	# The tool of the trade, in the right hand, swinging while the
	# villager works. A hauler's bundle is drawn separately.
	var swing: float = sin(_work_swing * 2.0) * 0.6
	var hand := Vector2(5.0, bob)
	var tip := hand + Vector2(cos(swing) * 7.0, sin(swing) * 7.0 - 3.0)
	match job:
		"woodcutter":
			# Axe: handle + head.
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 2.0)
			draw_rect(Rect2(tip.x - 1.0, tip.y - 2.5, 3.0, 3.0), Color(0.60, 0.60, 0.62))
		"miner":
			# Pick: handle + two-point head.
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 2.0)
			draw_line(tip + Vector2(-2.0, -1.0), tip + Vector2(2.0, -1.0), Color(0.60, 0.60, 0.62), 1.5)
		"farmer":
			# Sickle: handle + curved blade.
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 2.0)
			draw_arc(tip, 2.5, PI * 0.5, PI * 1.5, 6, Color(0.75, 0.75, 0.78), 1.5)
		"fisher":
			# Rod: a long line up to the water.
			draw_line(hand, hand + Vector2(8.0, -9.0), Color(0.42, 0.28, 0.14), 1.0)
		"builder", "smith":
			# Hammer.
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 2.0)
			draw_rect(Rect2(tip.x - 2.0, tip.y - 1.5, 4.0, 3.0), Color(0.50, 0.50, 0.52))
		"hunter", "guard":
			# Spear: a long shaft with a tip.
			draw_line(hand + Vector2(-3.0, 4.0), hand + Vector2(6.0, -8.0), Color(0.42, 0.28, 0.14), 1.5)
			draw_colored_polygon(PackedVector2Array([hand + Vector2(6.0, -8.0), hand + Vector2(4.5, -6.0), hand + Vector2(7.5, -6.0)]), Color(0.75, 0.75, 0.78))
		"carpenter":
			# Saw: a small grey blade.
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 1.5)
			draw_rect(Rect2(tip.x - 1.0, tip.y - 1.0, 5.0, 2.0), Color(0.65, 0.65, 0.68))
		"potter":
			# A clay pot in both hands.
			draw_circle(Vector2(5.0, 1.0 + bob), 2.0, Color(0.65, 0.40, 0.25))
		"teacher":
			# A book.
			draw_rect(Rect2(4.0, -1.0 + bob, 3.5, 4.5), Color(0.90, 0.88, 0.80))
		"factory":
			# A wrench.
			draw_line(hand, tip, Color(0.55, 0.55, 0.58), 2.0)
		_:
			draw_line(hand, tip, Color(0.42, 0.28, 0.14), 2.0)


func to_save() -> Dictionary:
	return {
		"id": id, "name": villager_name, "x": x, "z": z,
		"job": job, "assigned_job": assigned_job, "traits": traits,
		"skills": skills, "leader": leader, "age_days": age_days,
		"sex": sex, "coins": coins, "goods": goods, "home": home,
		"tool": tool, "hunger": hunger, "energy": energy,
		"health": health, "carry": carry, "state": state,
		"work_timer": work_timer, "rethink_at": rethink_at,
		"rest_until": rest_until, "wander_n": wander_n,
		"education": education, "class_level": class_level,
		"parents": parents, "tool_tick": tool_tick,
	}


func from_save(data: Dictionary) -> void:
	id = int(data.get("id", id))
	villager_name = String(data.get("name", villager_name))
	x = float(data.get("x", x))
	z = float(data.get("z", z))
	last_x = x
	last_z = z
	job = String(data.get("job", job))
	assigned_job = String(data.get("assigned_job", ""))
	traits = []
	for t in data.get("traits", []):
		traits.append(String(t))
	skills = {}
	for j in GodCivEconomy.JOBS:
		skills[j] = int((data.get("skills", {}) as Dictionary).get(j, 1))
	leader = bool(data.get("leader", false))
	age_days = int(data.get("age_days", age_days))
	sex = String(data.get("sex", sex))
	coins = int(data.get("coins", coins))
	goods = {}
	for g in GodCivEconomy.PRICES.keys():
		goods[g] = int((data.get("goods", {}) as Dictionary).get(g, 0))
	home = String(data.get("home", ""))
	tool = int(data.get("tool", 0))
	education = int(data.get("education", 2))
	class_level = int(data.get("class_level", 0))
	parents = []
	for p in data.get("parents", []):
		parents.append(int(p))
	tool_tick = int(data.get("tool_tick", 0))
	hunger = float(data.get("hunger", hunger))
	energy = float(data.get("energy", energy))
	health = float(data.get("health", health))
	carry = (data.get("carry", {}) as Dictionary).duplicate()
	state = String(data.get("state", "idle"))
	work_timer = float(data.get("work_timer", 0.0))
	rethink_at = float(data.get("rethink_at", 0.0))
	rest_until = float(data.get("rest_until", 0.0))
	wander_n = int(data.get("wander_n", 0))
	target = Vector2i(-1, -1)
	path = []
	position = Vector2(x * 16.0 + 8.0, z * 16.0 + 8.0)
