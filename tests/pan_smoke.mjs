// Pan math test. Run: node tests/pan_smoke.mjs
// Proves the v1 failure mode is gone: in v1 every drag was rotated 90deg,
// so right felt like down and dragging back did not retrace the view.
import assert from "node:assert";
import { computePanDelta } from "../src/render.js";

const yaw = Math.PI / 4, scale = 0.05;
const right = computePanDelta(yaw, scale, 100, 0);
const left = computePanDelta(yaw, scale, -100, 0);
const down = computePanDelta(yaw, scale, 0, 100);
const up = computePanDelta(yaw, scale, 0, -100);
const diagDR = computePanDelta(yaw, scale, 100, 100);
const diagUL = computePanDelta(yaw, scale, -100, -100);

for (const [name, d] of [["right", right], ["left", left], ["down", down], ["up", up]]) {
  assert.ok(Math.hypot(...d) > 1, name + " drag must move the view, got " + d);
}
// Opposite drags cancel exactly.
for (const [a, b, name] of [[right, left, "left/right"], [down, up, "up/down"], [diagDR, diagUL, "diagonals"]]) {
  assert.ok(Math.abs(a[0] + b[0]) < 1e-9 && Math.abs(a[1] + b[1]) < 1e-9, name + " must cancel, got " + a + " + " + b);
}
// All four directions are distinct.
const dirs = new Set([right, left, down, up, diagDR].map((d) => d.map((v) => v.toFixed(4)).join(",")));
assert.equal(dirs.size, 5, "four drag directions + diagonal must all differ");
// At yaw 45deg the screen diagonal runs along one world axis: a
// down-right drag moves purely in -x, the opposite diagonal purely in +x.
// (The v1 bug rotated every drag 90deg, so right felt like down.)
assert.ok(diagDR[0] < -1 && Math.abs(diagDR[1]) < 1e-9, "diagonal down-right must run along -x, got " + diagDR);
assert.ok(Math.abs(right[0] * down[0] + right[1] * down[1]) < 1e-9, "right and down drags must be perpendicular");
// Round trip: right, down, left, up returns to the start.
let x = 24, z = 24;
for (const d of [right, down, left, up]) { x += d[0]; z += d[1]; }
assert.ok(Math.abs(x - 24) < 1e-9 && Math.abs(z - 24) < 1e-9, "round trip must return to start, got " + x + "," + z);
console.log("pan smoke test passed: right", right, "down", down, "diag", diagDR);
