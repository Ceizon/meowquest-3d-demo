import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents: [
      'export { useConvoyStore } from "./src/store/convoy";',
      'export { useGameStore } from "./src/store/gameStore";',
      'export * as rules from "./src/lib/convoyRules";',
    ].join("\n"),
    resolveDir: root,
    sourcefile: "verify-convoy-entry.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "silent",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;

class MemoryStorage {
  constructor(initial) {
    this.values = new Map();
    if (initial !== undefined) this.values.set("mq-convoy", JSON.stringify(initial));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

let moduleNumber = 0;
async function loadEnvironment(initialSave) {
  const storage = new MemoryStorage(initialSave);
  const listeners = new Set();
  const documentMock = {
    hidden: false,
    addEventListener(type, listener) {
      if (type === "visibilitychange") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "visibilitychange") listeners.delete(listener);
    },
  };
  globalThis.localStorage = storage;
  globalThis.document = documentMock;
  globalThis.window = {};
  const module = await import(`${moduleUrl}#${++moduleNumber}`);
  const records = [];
  module.useGameStore.setState({ recordResult: (result) => records.push(result) });
  return {
    ...module,
    storage,
    records,
    setDocumentHidden(hidden) {
      documentMock.hidden = hidden;
      listeners.forEach((listener) => listener());
    },
    activate() {
      globalThis.localStorage = storage;
      globalThis.document = documentMock;
    },
  };
}

const state = (env) => env.useConvoyStore.getState();
const saved = (env) => JSON.parse(env.storage.getItem("mq-convoy"));
const close = (actual, expected, epsilon = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
};

function tickFor(env, seconds, step = 0.05) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(step, remaining);
    state(env).tick(dt);
    remaining -= dt;
  }
}

function tickUntil(env, predicate, maxSeconds = 150) {
  const steps = Math.ceil(maxSeconds / 0.05);
  for (let i = 0; i < steps; i += 1) {
    if (predicate(state(env))) return;
    state(env).tick(0.05);
  }
  assert.ok(predicate(state(env)), `Condition not reached; phase=${state(env).phase}`);
}

function freshSession(env, seed = 7) {
  state(env).reset();
  state(env).prepareSession(seed);
  state(env).start();
}

function runTrip(env, load, expectRest = false) {
  assert.equal(state(env).phase, "loading");
  state(env).selectLoad(load);
  state(env).push();
  if (expectRest) {
    assert.equal(state(env).phase, "resting");
    tickFor(env, 5.9);
    assert.equal(state(env).phase, "resting");
    tickFor(env, 0.1);
    assert.equal(state(env).phase, "loading");
    assert.equal(state(env).energy, 10);
    state(env).push();
  }
  assert.equal(state(env).phase, "preparing");
  tickUntil(env, (s) => s.phase === "returning" || s.phase === "complete" || s.phase === "timeUp");
  if (state(env).phase === "returning") tickUntil(env, (s) => s.phase === "loading" || s.phase === "timeUp");
}

function drive(env, chooseLoad) {
  for (let i = 0; i < 5000; i += 1) {
    const current = state(env);
    if (current.phase === "complete" || current.phase === "timeUp") return;
    if (current.phase === "intro") current.start();
    else if (current.phase === "loading") {
      current.selectLoad(chooseLoad(current));
      current.push();
    } else current.tick(0.05);
  }
  assert.fail("Convoy did not reach a terminal phase");
}

function windSeed(level, load, wanted) {
  for (let seed = 0; seed < 500; seed += 1) {
    if (Boolean(envRules.getWindPlan(level, load, seed, 1, false)) === wanted) return seed;
  }
  throw new Error("No deterministic wind seed found");
}

const tests = [];
const test = (name, run) => tests.push({ name, run });
const env = await loadEnvironment({ stonesFilled: 4, bestLevel: 3 });
const envRules = env.rules;
const noWind = windSeed(2, 3, false);
const withWind = windSeed(2, 3, true);

test("versioned save migrates bestLevel and malformed fields fall back", async () => {
  assert.equal(state(env).level, 3);
  assert.equal(state(env).stonesFilled, 4);
  assert.equal(state(env).phase, "intro");
  assert.equal(saved(env).version, 1);
  assert.equal(saved(env).level, 3);
  assert.equal(saved(env).bestLevel, undefined);
  const malformed = await loadEnvironment({ version: 1, stonesFilled: "bad", complete: "bad", level: 99, targetStones: -2 });
  assert.equal(state(malformed).level, 2);
  assert.equal(state(malformed).stonesFilled, 0);
  assert.equal(state(malformed).targetStones, 12);
  assert.equal(state(malformed).phase, "intro");
  env.activate();
});

test("pure rules cover all loads, rest scaling, levels and accuracy", () => {
  const { rules } = env;
  assert.deepEqual(rules.CONVOY_LOADS, [1, 2, 3, 4]);
  assert.equal(rules.CONVOY_LEVEL_RULES[1].targetStones, 8);
  assert.equal(rules.CONVOY_LEVEL_RULES[2].incenseSeconds, 100);
  assert.equal(rules.CONVOY_LEVEL_RULES[3].incenseSeconds, 90);
  const expected = [
    [1, 1, 0.5, 0.45],
    [2, 0.88, 1.5, 0.85],
    [3, 0.72, 3, 1],
    [4, 0.55, 5, 0.65],
  ];
  for (const [load, speed, cost, weight] of expected) {
    assert.equal(rules.CONVOY_LOAD_RULES[load].speedMultiplier, speed);
    assert.equal(rules.CONVOY_LOAD_RULES[load].energyCost, cost);
    assert.equal(rules.CONVOY_LOAD_RULES[load].planningWeight, weight);
    close(rules.getOutboundSeconds(2, load), 6 / speed);
    assert.equal(rules.getPreparingSeconds(load), load * 0.5);
    assert.equal(rules.getUnloadingSeconds(load), load * 0.6);
  }
  assert.equal(rules.getRestSeconds(1, 4), 6);
  assert.equal(rules.getRestSeconds(2, 1), 6);
  assert.equal(rules.getRestSeconds(3, 3), 10);
  assert.equal(rules.nextConvoyLevel(2, true, 0.25), 3);
  assert.equal(rules.nextConvoyLevel(2, true, 0.2), 2);
  assert.equal(rules.nextConvoyLevel(1, false, 0), 1);
  close(rules.getConvoyAccuracy(true, 1, 0.5, 1), 0.95);
  close(rules.getConvoyAccuracy(false, 0.5, 0, 1), 0.45);
});

test("intro and thinking protection do not burn incense; hidden pages need explicit resume", () => {
  state(env).reset();
  state(env).prepareSession(noWind);
  state(env).tick(20);
  assert.equal(state(env).phase, "intro");
  assert.equal(state(env).incense, 1);
  state(env).start();
  tickFor(env, 1.5);
  assert.equal(state(env).incense, 1);
  tickFor(env, 0.5);
  close(state(env).incense, 0.995);
  const before = state(env).incense;
  env.setDocumentHidden(true);
  assert.equal(state(env).paused, true);
  tickFor(env, 5);
  assert.equal(state(env).incense, before);
  env.setDocumentHidden(false);
  assert.equal(state(env).paused, true);
  tickFor(env, 5);
  assert.equal(state(env).incense, before);
  state(env).resume();
  tickFor(env, 1);
  close(state(env).incense, before - 0.01);
});

test("store transport matches all four loads and deducts energy once", () => {
  for (const load of [1, 2, 3, 4]) {
    freshSession(env, noWind);
    state(env).selectLoad(load);
    state(env).push();
    assert.equal(state(env).phase, "preparing");
    tickFor(env, envRules.getPreparingSeconds(load));
    assert.equal(state(env).phase, "outbound");
    const duration = envRules.getOutboundSeconds(2, load);
    tickFor(env, duration / 2);
    assert.ok(Math.abs(state(env).tripProgress - 0.5) < 0.02);
    close(state(env).energy, 10 - envRules.CONVOY_LOAD_RULES[load].energyCost * state(env).tripProgress, 1e-6);
    const selected = state(env).selectedLoad;
    state(env).selectLoad(load === 4 ? 1 : 4);
    state(env).push();
    state(env).start();
    assert.equal(state(env).selectedLoad, selected);
    assert.equal(state(env).phase, "outbound");
    tickFor(env, duration / 2);
    assert.equal(state(env).phase, "unloading");
    close(state(env).energy, 10 - envRules.CONVOY_LOAD_RULES[load].energyCost);
    tickFor(env, envRules.getUnloadingSeconds(load));
    assert.equal(state(env).phase, "returning");
    assert.equal(state(env).stonesFilled, load);
    assert.equal(state(env).tripCount, 1);
    close(state(env).energy, 10 - envRules.CONVOY_LOAD_RULES[load].energyCost);
  }
});

test("three-stone strategy completes once and memorial entry cannot settle again", () => {
  freshSession(env, 19);
  drive(env, () => 3);
  assert.equal(state(env).phase, "complete");
  assert.equal(state(env).stonesFilled, 12);
  assert.equal(state(env).tripCount, 4);
  assert.equal(state(env).restCount, 1);
  assert.deepEqual(state(env).tripPlanWeights, [1, 1, 1, 1]);
  assert.equal(state(env).settlementCount, 1);
  assert.equal(env.records.length, 1);
  close(state(env).result.accuracy, Math.min(1, 0.9 + 0.1 * state(env).incense));
  assert.equal(saved(env).complete, true);
  assert.equal(saved(env).version, 1);
  state(env).tick(100);
  state(env).push();
  state(env).prepareSession();
  assert.equal(state(env).phase, "complete");
  assert.equal(state(env).settlementCount, 1);
  assert.equal(env.records.length, 1);
});

test("one-stone strategy reaches timeUp and a new attempt keeps the bridge", () => {
  env.records.length = 0;
  freshSession(env, 23);
  drive(env, () => 1);
  assert.equal(state(env).phase, "timeUp");
  assert.ok(state(env).stonesFilled > 0 && state(env).stonesFilled < 12);
  assert.equal(state(env).settlementCount, 1);
  assert.equal(env.records.length, 1);
  assert.equal(env.records[0].trials, state(env).tripCount);
  close(state(env).result.accuracy, state(env).stonesFilled / 12 * 0.845);
  assert.equal(saved(env).complete, false);
  assert.equal(saved(env).stonesFilled, state(env).stonesFilled);
  assert.equal(saved(env).level, 1);
  const filled = state(env).stonesFilled;
  state(env).tick(100);
  assert.equal(env.records.length, 1);
  state(env).prepareSession(29);
  assert.equal(state(env).phase, "intro");
  assert.equal(state(env).stonesFilled, filled);
  assert.equal(state(env).targetStones, 12);
  assert.equal(state(env).incense, 1);
  assert.equal(state(env).energy, 10);
  assert.equal(state(env).level, 1);
  state(env).tick(20);
  assert.equal(env.records.length, 1);
});

test("automatic rest restores energy and excess final loads are rejected", () => {
  env.records.length = 0;
  freshSession(env, noWind);
  runTrip(env, 4);
  runTrip(env, 2);
  close(state(env).energy, 3.5);
  runTrip(env, 4, true);
  assert.equal(state(env).restCount, 1);
  assert.equal(state(env).stonesFilled, 10);
  assert.equal(state(env).selectedLoad, 2);
  state(env).selectLoad(4);
  state(env).selectLoad(3);
  assert.equal(state(env).selectedLoad, 2);
  runTrip(env, 2);
  assert.equal(state(env).phase, "complete");
  assert.equal(state(env).stonesFilled, 12);
  assert.equal(state(env).tripCount, 4);
  assert.equal(env.records.length, 1);
  const save = saved(env);
  assert.deepEqual(Object.keys(save).sort(), ["complete", "level", "stonesFilled", "targetStones", "version"]);
});

test("outbound incense grace finishes unloading and records decision milliseconds once", () => {
  env.records.length = 0;
  freshSession(env, noWind);
  state(env).selectLoad(3);
  tickFor(env, 1.5);
  tickFor(env, 95);
  close(state(env).incense, 0.05);
  state(env).push();
  tickFor(env, 1.5);
  assert.equal(state(env).phase, "outbound");
  close(state(env).incense, 0.035);
  tickFor(env, 4);
  assert.equal(state(env).phase, "outbound");
  assert.equal(state(env).incense, 0);
  tickFor(env, envRules.getOutboundSeconds(2, 3) - 4);
  assert.equal(state(env).phase, "unloading");
  tickFor(env, envRules.getUnloadingSeconds(3));
  assert.equal(state(env).phase, "timeUp");
  assert.equal(state(env).stonesFilled, 3);
  assert.equal(state(env).tripCount, 1);
  assert.equal(state(env).averageDecisionMs, 95000);
  assert.equal(env.records.length, 1);
  assert.equal(env.records[0].avgRT, 95000);
  close(state(env).result.accuracy, 0.225);
  state(env).tick(100);
  assert.equal(env.records.length, 1);
});

test("deterministic wind warns, stops only outbound motion, and keeps incense burning", () => {
  freshSession(env, withWind);
  state(env).selectLoad(3);
  const plan = envRules.getWindPlan(2, 3, withWind, 1, false);
  assert.ok(plan);
  assert.deepEqual(plan, envRules.getWindPlan(2, 3, withWind, 1, false));
  assert.equal(envRules.getWindPlan(1, 3, withWind, 1, false), null);
  assert.equal(envRules.getWindPlan(2, 3, withWind, 2, true), null);
  state(env).push();
  tickFor(env, 1.5);
  tickFor(env, plan.triggerAt);
  assert.equal(state(env).wind.status, "warning");
  close(state(env).wind.remaining, 0.8);
  tickFor(env, 0.4);
  assert.equal(state(env).wind.status, "warning");
  tickFor(env, 0.4);
  assert.equal(state(env).wind.status, "gusting");
  assert.equal(state(env).wind.remaining, 3);
  const frozen = state(env).tripProgress;
  const incense = state(env).incense;
  tickFor(env, 1);
  assert.equal(state(env).tripProgress, frozen);
  close(state(env).incense, incense - 0.01);
  tickFor(env, 2);
  assert.equal(state(env).wind.status, "calm");
  assert.equal(state(env).tripProgress, frozen);
  tickFor(env, 0.5);
  assert.ok(state(env).tripProgress > frozen);
});

test("re-entering an active session abandons in-flight cargo without settling", () => {
  env.records.length = 0;
  freshSession(env, noWind);
  state(env).selectLoad(4);
  state(env).push();
  tickFor(env, 2);
  tickFor(env, 1);
  assert.equal(state(env).phase, "outbound");
  state(env).prepareSession(31);
  assert.equal(state(env).phase, "intro");
  assert.equal(state(env).stonesFilled, 0);
  assert.equal(state(env).energy, 10);
  assert.equal(state(env).incense, 1);
  assert.equal(state(env).tripCount, 0);
  assert.equal(state(env).settlementCount, 0);
  assert.equal(env.records.length, 0);
  assert.equal(saved(env).stonesFilled, 0);
});

test("frame-tagged ticks apply delta only once per frame", () => {
  freshSession(env, noWind);
  state(env).push();
  state(env).tick(0.1, 1);
  state(env).tick(0.1, 1);
  state(env).tick(0.1, 1);
  close(state(env).incense, 0.999);
  close(state(env).phaseProgress, 0.1);
  state(env).tick(0.1, 2);
  close(state(env).incense, 0.998);
  close(state(env).phaseProgress, 0.2);
  state(env).reset();
});

test("invalid actions and tick inputs are inert; snapshots stay at or below 10Hz", () => {
  freshSession(env, noWind);
  const selected = state(env).selectedLoad;
  state(env).selectLoad(5);
  state(env).selectLoad(0);
  assert.equal(state(env).selectedLoad, selected);
  const before = state(env);
  const snapshotBefore = JSON.stringify({ phase: before.phase, incense: before.incense, selectedLoad: before.selectedLoad });
  before.tick(-1);
  before.tick(Number.NaN);
  before.resume();
  assert.equal(JSON.stringify({ phase: before.phase, incense: before.incense, selectedLoad: before.selectedLoad }), snapshotBefore);
  let updates = 0;
  const unsubscribe = env.useConvoyStore.subscribe(() => { updates += 1; });
  for (let i = 0; i < 60; i += 1) state(env).tick(1 / 60);
  unsubscribe();
  assert.ok(updates > 0);
  assert.ok(updates <= 10, `Expected <=10 snapshots, received ${updates}`);
  state(env).reset();
  const resetSave = saved(env);
  assert.deepEqual(resetSave, { version: 1, stonesFilled: 0, complete: false, level: 2, targetStones: 12 });
  assert.equal(state(env).phase, "intro");
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`[ok] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[fail] ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`\n${failures} convoy verification(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} convoy verifications passed.`);
}
