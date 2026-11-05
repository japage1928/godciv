class_name GodCivDeer
extends Node2D

# A deer: wanders, flees hunters, gets hunted. Ported from the PWA
# (core.js makeDeer, step.js deer loop). Deer are not saved; the
# dawn top-up restores the herd (cap 4, winter 2). The village owns
# the tick: it calls step() once per frame with sim-seconds.

const DEER_COLOR: Color = Color(0.55, 0.42, 0.28)

var x: float = 32.0
var z: float = 32.0
var tx: float = -1.0
var tz: float = -1.0
var retarget_at: float = 0.0
var fleeing: bool = false

var sim: Node = null


func setup(p_x: float, p_z: float, p_sim: Node) -> void:
	x = p_x
	z = p_z
	sim = p_sim
	position = Vector2(x * 16.0 + 8.0, z * 16.0 + 8.0)


func step(dt: float) -> void:
	var threat = null
	for v in sim.villagers:
		if String(v.job) == "hunter" and Vector2(float(v.x) - x, float(v.z) - z).length() < 6.0:
			threat = v
			break
	fleeing = threat != null
	if sim.elapsed > retarget_at:
		retarget_at = sim.elapsed + 2.0 + sim.rng.next_float() * 4.0
		if threat != null:
			tx = clampf(x + (x - float(threat.x)) * 2.0, 1.0, 318.0)
			tz = clampf(z + (z - float(threat.z)) * 2.0, 1.0, 318.0)
		else:
			tx = clampf(x + (sim.rng.next_float() - 0.5) * 8.0, 1.0, 318.0)
			tz = clampf(z + (sim.rng.next_float() - 0.5) * 8.0, 1.0, 318.0)
	if tx >= 0.0:
		var dx: float = tx - x
		var dz: float = tz - z
		var dist: float = Vector2(dx, dz).length()
		if dist > 0.3:
			var sp: float = (1.9 if fleeing else 0.8) * dt
			var step_len: float = minf(sp, dist)
			x += (dx / dist) * step_len
			z += (dz / dist) * step_len
	position = Vector2(x * 16.0 + 8.0, z * 16.0 + 8.0)
	queue_redraw()


func _draw() -> void:
	# Shadow, body, head. Small and brown so a hunter's target
	# reads at a glance against the green ground.
	draw_circle(Vector2(0, 3), 4.0, Color(0, 0, 0, 0.2))
	draw_circle(Vector2(0, 0), 4.5, DEER_COLOR)
	draw_circle(Vector2(3, -4), 2.0, DEER_COLOR)
