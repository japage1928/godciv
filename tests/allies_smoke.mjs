// Alliance smoke test for Phase G: formation needs both leaders
// (god proposal, player leader weighs, neighbor answers at dawn),
// capacity grows, allies send guards to raids, and alliances break
// on cold relations, on a leader's decision, and after a cooldown.
// The god can never force an alliance, and the god can never
// declare war (Phase H validates leader war intents against the
// dawn gates; the god's own action stays refused).
// Run: npm test  (or: node tests/allies_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, applyGod, delegateRoles, spawnRaid, setRelation,
  getRelation, formAlliance, breakAlliance, allied, caravanCapacity,
  villageRecord, discoverVillage, validateDiplomacyIntent, ownVillagers,
  serialize, deserialize,
} from "../src/sim.js";

const STEPS_PER_DAY = 180 * 4;
function runDays(state, grid, days) {
  for (let i = 0; i < days * STEPS_PER_DAY; i++) step(state, grid, 0.25);
}
function meet(state, rec, relation) {
  discoverVillage(state, rec, "a test meeting");
  setRelation(state, 0, rec.id, relation);
}

// --- formation: proposal, weighing, dawn acceptance, capacity ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  // 65, not exactly 60: the first dawn's no-contact drift ticks
  // relations down 1, and the bar is 60 — the fixture needs
  // margin above the boundary, as with the era population gate.
  meet(state, rec, 65);
  assert.equal(caravanCapacity(state, 0, rec.id), 40, "capacity before alliance: 20 + band 20");
  const res = applyGod(state, grid, "suggest_alliance", null, null, { to: rec.id });
  assert.equal(res.ok, true, "suggest_alliance must fire, got " + JSON.stringify(res));
  assert.deepEqual(state.directive.suggestAlliance, { to: rec.id }, "the suggestion must wait on the directive");
  delegateRoles(state, grid);
  assert.ok(rec.allyOffer && rec.allyOffer.from === 0, "the leader must propose after weighing");
  assert.ok(state.log.some((e) => /proposes an alliance/.test(e.text)), "the proposal must be logged");
  assert.equal(allied(state, 0, rec.id), false, "no alliance before the neighbor answers");
  runDays(state, grid, 1);
  assert.equal(allied(state, 0, rec.id), true, "the neighbor must accept at dawn");
  assert.equal(caravanCapacity(state, 0, rec.id), 50, "allies add +10 caravan capacity");
  assert.ok(state.log.some((e) => /are allies/.test(e.text)), "the alliance must be logged");
  runDays(state, grid, 10);
  assert.ok(getRelation(state, 0, rec.id) >= 62, "allied relations must warm each season, rel=" + getRelation(state, 0, rec.id));
  console.log("formation: proposed, accepted at dawn, capacity 50, relations warm");
}

// --- the god cannot force it: a cold suggestion is refused ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 30);
  const res = applyGod(state, grid, "suggest_alliance", null, null, { to: rec.id });
  assert.equal(res.ok, true, "the suggestion itself is well-formed");
  delegateRoles(state, grid);
  assert.equal(rec.allyOffer, null, "a cold proposal must never be made");
  assert.equal(allied(state, 0, rec.id), false, "no alliance on cold relations");
  assert.ok(state.log.some((e) => /declines the alliance/.test(e.text)), "the refusal must be logged with its reason");
  console.log("refusal: the leader declines on cold relations, no offer, no alliance");
}

// --- an offer lapses when the neighbor is too small to answer ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  applyGod(state, grid, "suggest_alliance", null, null, { to: rec.id });
  delegateRoles(state, grid);
  assert.ok(rec.allyOffer, "the offer must exist");
  rec.pop = 3;
  runDays(state, grid, 4);
  assert.equal(rec.allyOffer, null, "the offer must lapse after its window");
  assert.equal(allied(state, 0, rec.id), false, "a lapsed offer forms nothing");
  assert.ok(state.log.some((e) => /lets the alliance offer lapse/.test(e.text)), "the lapse must be logged");
  console.log("lapse: too-small neighbor, offer expires after 3 dawns");
}

// --- intent validation: propose / accept / end, war gates (Phase H) ---
{
  const { state } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 30);
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "propose_alliance", to: rec.id }).ok, false, "a cold propose intent must be refused");
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "accept_alliance", from: 0, to: rec.id }).ok, false, "accept with no offer must be refused");
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "end_alliance", to: rec.id }).ok, false, "ending a non-alliance must be refused");
  setRelation(state, 0, rec.id, 60);
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "propose_alliance", to: rec.id }).ok, true, "a warm propose intent must validate");
  rec.allyOffer = { from: 0, day: state.day };
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "accept_alliance", from: 0, to: rec.id }).ok, true, "accept with a live offer must validate");
  formAlliance(state, 0, rec.id);
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "end_alliance", to: rec.id }).ok, true, "ending an alliance must validate");
  assert.equal(validateDiplomacyIntent(state, { kind: "relation_move", move: "annex", to: rec.id }).ok, false, "an unknown move must be refused");
  // Phase H: a war intent on an ally validates as betrayal (a
  // leader intent, never a god action); on a non-ally at warm
  // relations the -70 gate refuses it. The god's own action stays
  // refused through every path.
  const betrayal = validateDiplomacyIntent(state, { kind: "declare_war", to: rec.id });
  assert.equal(betrayal.ok, true, "a betrayal declaration validates for a leader intent");
  assert.equal(betrayal.betrayal, true, "it must be flagged as betrayal");
  breakAlliance(state, 0, rec.id, "test break");
  setRelation(state, 0, rec.id, 0);
  assert.equal(validateDiplomacyIntent(state, { kind: "declare_war", to: rec.id }).ok, false, "the -70 gate refuses a war intent at warm relations");
  assert.equal(applyGod(state, null, "declare_war").ok, false, "the god still cannot declare war");
  console.log("intents: propose/accept/end validate, betrayal flags, -70 gate holds, god cannot declare war");
}

// --- reinforcements: two guards march, fight by guard rules,
// walk home when the raid ends ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  formAlliance(state, 0, rec.id);
  const spawned = spawnRaid(state, grid, 4);
  assert.equal(spawned.length, 4, "the raid must spawn");
  const guards = state.villagers.filter((v) => v.reinforcement);
  assert.equal(guards.length, 2, "an ally must send exactly 2 guards, sent " + guards.length);
  assert.ok(guards.every((v) => v.village === rec.id && v.job === "guard"), "reinforcements must be the ally's guards");
  assert.ok(state.log.some((e) => /sends 2 guards/.test(e.text)), "the march must be logged");
  // Combat by guard rules: a reinforcement beside a raider wounds it.
  const g = guards[0], r = spawned[0];
  g.x = r.x + 0.5; g.z = r.z + 0.5; g.target = null; g.path = null; g.rethinkAt = state.elapsed + 1000;
  const hpBefore = r.hp;
  for (let i = 0; i < 24; i++) step(state, grid, 0.25);
  assert.ok(r.hp < hpBefore || !state.raiders.includes(r), "a reinforcement must strike like a guard");
  // Unfreeze the teleported guard's rethink clock so it can march home.
  g.rethinkAt = state.elapsed;
  // The raid ends, the survivors walk home, the flags clear.
  runDays(state, grid, 3);
  assert.equal(state.villagers.filter((v) => v.reinforcement).length, 0, "no reinforcement flags may remain after the march home");
  assert.ok(ownVillagers(state).length >= 4, "the player's village must survive its own raid");
  console.log("reinforcements: 2 marched, fought, walked home");
}

// --- a fallen reinforcement cools relations, by the combat rule ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  formAlliance(state, 0, rec.id);
  const spawned = spawnRaid(state, grid, 2);
  const guards = state.villagers.filter((v) => v.reinforcement);
  assert.equal(guards.length, 2, "guards must march");
  const g = guards[0], r = spawned[0];
  g.health = 1; g.x = r.x + 0.5; g.z = r.z + 0.5; g.target = null; g.path = null; g.rethinkAt = state.elapsed + 1000;
  for (let i = 0; i < 8; i++) step(state, grid, 0.25);
  assert.ok(!state.villagers.includes(g), "the wounded reinforcement must fall to the raider");
  assert.equal(getRelation(state, 0, rec.id), 58, "a fallen allied guard must cool relations by 2");
  assert.ok(state.log.some((e) => /mourns a guard/.test(e.text)), "the mourning must be logged");
  console.log("mourning: fallen guard cools relations 60 -> 58");
}

// --- breaks: cold relations, a leader's decision, cooldown ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  formAlliance(state, 0, rec.id);
  setRelation(state, 0, rec.id, 19);
  assert.equal(allied(state, 0, rec.id), false, "relations under 20 must break the alliance at once");
  assert.ok(state.log.some((e) => /breaks: relations fell under 20/.test(e.text)), "the break must be logged");
  assert.equal(rec.allyCooldownDay, state.day + 10, "a break must cool for 10 days");
  // Warm relations again: the cooldown still refuses a new proposal.
  setRelation(state, 0, rec.id, 60);
  state.elapsed += 11;
  applyGod(state, grid, "suggest_alliance", null, null, { to: rec.id });
  delegateRoles(state, grid);
  assert.equal(rec.allyOffer, null, "a proposal inside the cooldown must be refused");
  assert.ok(state.log.some((e) => /must cool first/.test(e.text)), "the cooldown refusal must be logged");
  console.log("break: cold relations break it, cooldown holds");
}
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  formAlliance(state, 0, rec.id);
  setRelation(state, 0, rec.id, 25);
  runDays(state, grid, 1);
  assert.equal(allied(state, 0, rec.id), false, "a leader must end a soured alliance at dawn");
  assert.equal(rec.allyCooldownDay, state.day + 30, "a leader-ended break cools for 30 days");
  assert.ok(state.log.some((e) => /ends it: relations have soured/.test(e.text)), "the ending must be logged");
  console.log("break: the leader ends a soured alliance, 30-day cooldown");
}

// --- alliances survive save and load ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  meet(state, rec, 60);
  formAlliance(state, 0, rec.id);
  const loaded = deserialize(serialize(state, grid));
  assert.equal(allied(loaded.state, 0, rec.id), true, "an alliance must survive a round-trip");
  assert.equal(caravanCapacity(loaded.state, 0, rec.id), 50, "the capacity bonus must survive a round-trip");
  console.log("persistence: alliance + capacity survive save/load");
}

console.log("allies_smoke: all checks passed");
