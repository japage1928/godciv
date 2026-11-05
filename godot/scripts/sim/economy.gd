class_name GodCivEconomy
extends RefCounted

# The economy, Phase 2: market, tools, class ladder, housing
# tiers, tech progress data. Ported from the PWA (src/sim/core.js
# constants, src/sim/brain.js runMarket / updateClasses /
# updateHousingTiers / standingOf / classOfStanding / tierOfClass).
#
# Everything here is static and takes the village node (`sim`)
# untyped, like GodCivVillager does — no cyclic class reference
# back to GodCivVillage. Tech LEVELS live here as data (they gate
# Phase 2 tools and production buildings); the visual era stages
# and their crossing beats are Phase 5, not this file.

const JOBS: Array[String] = [
	"farmer", "woodcutter", "miner", "fisher", "hunter", "builder",
	"hauler", "teacher", "carpenter", "potter", "smith", "factory", "guard",
]
const PRICES: Dictionary = {
	"food": 2, "fish": 2, "meat": 3, "wood": 1, "stone": 1, "ore": 4,
	"furniture": 6, "pottery": 4, "ironware": 8, "wares": 10,
}
const PRODUCT_GOODS: Array[String] = ["furniture", "pottery", "ironware", "wares"]
const CLASS_NAMES: Array[String] = ["commoner", "artisan", "merchant", "gentry"]
const CLASS_THRESHOLDS: Array[int] = [0, 4, 10, 18]
const DWELLING_TYPES: Array[String] = ["hut", "longhouse", "greathall", "farmhouse"]
const TOOL_NAMES: Array[String] = ["crude", "sturdy", "fine", "steel"]
# Index 0 is unused (no tool 0 to buy): costs to reach tool 1, 2, 3.
const TOOL_COSTS: Array = [
	null,
	{"coins": 6, "ore": 1},
	{"coins": 12, "ore": 2},
	{"coins": 20, "ore": 4},
]
const GUARD_CAP: int = 6

# Production recipes: the workplace a job works at, the stockpile
# inputs one work action consumes, and the output it carries away.
# PRODUCTION_WANT is the stockpile level production aims at: the
# score rewards a deficit and penalises a surplus, and doWork stops
# producing once the stockpile holds that much, so a carpenter can
# never eat every stick of wood while the village still needs a
# school.
const PRODUCTION_WANT: int = 12
const PRODUCTION_RECIPES: Dictionary = {
	"carpenter": {"workplace": "workshop", "inputs": {"wood": 2}, "output": "furniture", "out_amt": 1},
	"potter": {"workplace": "kiln", "inputs": {"stone": 2}, "output": "pottery", "out_amt": 1},
	"smith": {"workplace": "smithy", "inputs": {"ore": 1}, "output": "ironware", "out_amt": 1},
	"factory": {"workplace": "factory", "inputs": {"wood": 1, "stone": 1, "ore": 1}, "output": "wares", "out_amt": 2},
}

const TECH_TIERS: Array = [
	{"name": "Stone tools", "blurb": "Crude tools and open fires."},
	{"name": "Bronze craft", "blurb": "Better harvests, steadier workshop work."},
	{"name": "Iron craft", "blurb": "Fine tools, a healer's hut, richer harvests."},
	{"name": "Steel works", "blurb": "Steel tools, stouter walls, richer harvests."},
	{"name": "Steam and brick", "blurb": "Builders work twice as fast, mills grind more grain."},
	{"name": "Electric age", "blurb": "Lamps light the streets, work runs faster."},
	{"name": "Modern city", "blurb": "Glass towers, fast work, room for many more souls."},
]
const TECH_THRESHOLDS: Array[int] = [80, 120, 200, 300, 420, 560]
const ERA_POP_GATE: Array[int] = [0, 0, 0, 14, 20, 26, 32]


static func standing_of(v: Node) -> int:
	var goods: Dictionary = v.goods
	var products: int = 0
	for g in PRODUCT_GOODS:
		products += int(goods.get(g, 0))
	return products + int(v.coins) / 10 + int(v.education) / 2


static func class_of_standing(standing: int) -> int:
	var c: int = 0
	for i in CLASS_THRESHOLDS.size():
		if standing >= CLASS_THRESHOLDS[i]:
			c = i
	return c


static func tier_of_class(c: int) -> int:
	return 2 if c >= 3 else (1 if c >= 1 else 0)


## Standing, class, and housing tiers refresh at dawn, before
## morale is felt: the housing part of morale reads fresh tiers.
## Class ratchets up and never falls, so a spent fortune costs
## comfort, not standing. Housing tier follows the highest-class
## occupant and ratchets the same way.
static func update_classes(sim: Node) -> void:
	for v in sim.villagers:
		var next_class: int = class_of_standing(standing_of(v))
		if next_class > int(v.class_level):
			v.class_level = next_class
			sim.add_log(v.villager_name + "'s craft earns standing: now " + String(CLASS_NAMES[next_class]) + ".")


static func update_housing_tiers(sim: Node) -> void:
	for b in sim.buildings:
		if not (String(b["type"]) in DWELLING_TYPES):
			continue
		var k: String = "%d,%d" % [int(b["x"]), int(b["z"])]
		var best: int = 0
		for v in sim.villagers:
			if String(v.home) == k and int(v.class_level) > best:
				best = int(v.class_level)
		var new_tier: int = tier_of_class(best)
		if new_tier > int(b.get("tier", 0)):
			b["tier"] = new_tier


## The town-center market. Producers keep a share of what they
## haul in as personal goods and trade the surplus with villagers
## who need it. Runs every 30 sim-seconds: up to 3 rounds, at most
## 3 trades, one log line per round so trades don't crowd births,
## deaths, and building news out of the god log. Tool buying: one
## upgrade per market round at most. A sturdy tool needs a
## workshop; a fine tool needs a workshop and Bronze craft; a steel
## tool needs a workshop and Steel works. Coins go to the village
## fund, ore comes out of the stockpile.
static func run_market(sim: Node) -> void:
	var trades: int = 0
	var summaries: Array[String] = []
	var own: Array = sim.villagers
	for round in 3:
		if trades >= 3:
			break
		var done: bool = false
		for buyer in own:
			if int(buyer.age_days) < 3:
				continue
			for g in PRICES.keys():
				var price: int = int(PRICES[g])
				var hungry: bool = float(buyer.hunger) > 40.0
				var buyer_goods: Dictionary = buyer.goods
				var food_sum: int = int(buyer_goods.get("food", 0)) + int(buyer_goods.get("fish", 0)) + int(buyer_goods.get("meat", 0))
				var wants_food: bool = (g == "food" or g == "fish" or g == "meat") and hungry and food_sum == 0
				var wants_material: bool = (g == "wood" or g == "stone") and String(buyer.job) == "builder" and int(buyer_goods.get(g, 0)) == 0
				var wants_ore: bool = g == "ore" and buyer.traits.has("greedy") and int(buyer_goods.get(g, 0)) == 0
				var wants_product: bool = (g == "furniture" or g == "pottery" or g == "ironware" or g == "wares") and int(buyer_goods.get(g, 0)) < 2 and int(buyer.coins) >= price
				if (not wants_food and not wants_material and not wants_ore and not wants_product) or int(buyer.coins) < price:
					continue
				var seller = null
				for s in own:
					if s == buyer:
						continue
					if int(s.age_days) < 3:
						continue
					if int((s.goods as Dictionary).get(g, 0)) > 2:
						seller = s
						break
				if seller == null:
					continue
				seller.goods[g] = int((seller.goods as Dictionary).get(g, 0)) - 1
				buyer.goods[g] = int(buyer_goods.get(g, 0)) + 1
				buyer.coins = int(buyer.coins) - price
				seller.coins = int(seller.coins) + price
				sim.stats["trades"] = int(sim.stats.get("trades", 0)) + 1
				trades += 1
				summaries.append(seller.villager_name + " trades " + String(g) + " to " + buyer.villager_name)
				done = true
				break
			if done:
				break
		if not done:
			break
	var has_workshop: bool = sim.has_building("workshop")
	if has_workshop:
		var tech_level: int = int((sim.tech as Dictionary).get("level", 0))
		var buyer2 = null
		for v in own:
			if int(v.age_days) < 3:
				continue
			if sim.is_student(v):
				continue
			var next_tool: int = int(v.tool) + 1
			if next_tool > 3:
				continue
			var cost: Dictionary = TOOL_COSTS[next_tool]
			if int(v.coins) < int(cost.get("coins", 0)):
				continue
			if int(sim.stockpile.get("ore", 0)) < int(cost.get("ore", 0)):
				continue
			var gate_ok: bool = next_tool == 1 or (next_tool == 2 and tech_level >= 1) or (next_tool == 3 and tech_level >= 3)
			if not gate_ok:
				continue
			buyer2 = v
			break
		if buyer2 != null:
			var next2: int = int(buyer2.tool) + 1
			var cost2: Dictionary = TOOL_COSTS[next2]
			buyer2.coins = int(buyer2.coins) - int(cost2.get("coins", 0))
			sim.fund = int(sim.fund) + int(cost2.get("coins", 0))
			sim.stockpile["ore"] = int(sim.stockpile.get("ore", 0)) - int(cost2.get("ore", 0))
			buyer2.tool = next2
			summaries.append(buyer2.villager_name + " buys " + String(TOOL_NAMES[next2]) + " tools")
	if not summaries.is_empty():
		sim.add_log("At the market: " + "; ".join(summaries) + ".")
