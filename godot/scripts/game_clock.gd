class_name GodCivClock
extends Node

# Day/time, ported from the PWA (src/sim/core.js):
# DAY_LENGTH 180 sim-seconds per day; phase boundaries night 0.00-0.22
# and 0.84-1.00, dawn 0.22-0.32, day 0.32-0.72, dusk 0.72-0.84;
# seasons 10 days each, 4 seasons per year. `speed` is sim-seconds per
# real second (PWA 1x = 1.0); the Phase 0 default 3.0 makes a day last
# 60 real seconds so the cycle is visible without waiting.

signal day_changed(new_day: int)
signal phase_changed(new_phase: String)

const DAY_LENGTH_SECONDS: float = 180.0
const SEASON_DAYS: int = 10
const YEAR_DAYS: int = 40
const SEASONS: Array[String] = ["spring", "summer", "autumn", "winter"]
const SEASON_NAMES: Dictionary = {
	"spring": "Spring",
	"summer": "Summer",
	"autumn": "Autumn",
	"winter": "Winter",
}

var day: int = 1
var time: float = 0.32
var speed: float = 3.0
var paused: bool = false


func _process(delta: float) -> void:
	if paused:
		return
	advance(delta * speed)


func advance(sim_seconds: float) -> void:
	var prev_phase := phase()
	time += sim_seconds / DAY_LENGTH_SECONDS
	while time >= 1.0:
		time -= 1.0
		day += 1
		day_changed.emit(day)
	var new_phase := phase()
	if new_phase != prev_phase:
		phase_changed.emit(new_phase)


static func phase_of(t: float) -> String:
	if t < 0.22 or t >= 0.84:
		return "night"
	if t < 0.32:
		return "dawn"
	if t < 0.72:
		return "day"
	return "dusk"


func phase() -> String:
	return phase_of(time)


static func season_of(p_day: int) -> String:
	return SEASONS[int((p_day - 1) / SEASON_DAYS) % 4]


func season() -> String:
	return season_of(day)


static func season_name_of(p_day: int) -> String:
	return String(SEASON_NAMES[season_of(p_day)])


static func year_of(p_day: int) -> int:
	return int((p_day - 1) / YEAR_DAYS) + 1


func year() -> int:
	return year_of(day)


func time_string() -> String:
	var total_minutes: int = int(time * 1440.0)
	var hh: int = (total_minutes / 60) % 24
	var mm: int = total_minutes % 60
	return "%02d:%02d" % [hh, mm]


func to_save() -> Dictionary:
	return {"day": day, "time": time, "speed": speed}


func from_save(data: Dictionary) -> void:
	day = int(data.get("day", 1))
	time = clampf(float(data.get("time", 0.32)), 0.0, 1.0)
	speed = float(data.get("speed", 3.0))
