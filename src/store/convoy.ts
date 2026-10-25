import { create } from "zustand";
import { useGameStore } from "./gameStore";
import { useAchievements } from "./achievements";
import { useDialogue } from "./dialogue";
import { scheduleCompanionCheck } from "./gameFlow";
import { CONVOY_DIALOGUES } from "../data/companions";
import {
  CONVOY_LEVEL_RULES,
  CONVOY_LOAD_RULES,
  DEFAULT_CONVOY_LEVEL,
  MAX_CONVOY_STONES,
  THINKING_PROTECTION_SECONDS,
  averagePlanningWeight,
  clamp01,
  getConvoyAccuracy,
  getOutboundSeconds,
  getPreparingSeconds,
  getRestSeconds,
  getReturningSeconds,
  getUnloadingSeconds,
  getWindPlan,
  isConvoyLevel,
  isConvoyLoad,
  nextConvoyLevel,
  type ConvoyLevel,
  type ConvoyLoad,
  type ConvoyWindPlan,
} from "../lib/convoyRules";

export type ConvoyPhase =
  | "intro"
  | "loading"
  | "preparing"
  | "outbound"
  | "unloading"
  | "returning"
  | "resting"
  | "complete"
  | "timeUp";

export type ConvoyWindStatus = "calm" | "warning" | "gusting";

export interface ConvoyWindSnapshot {
  status: ConvoyWindStatus;
  remaining: number;
  progress: number;
}

export interface ConvoyAttemptResult {
  outcome: "complete" | "timeUp";
  accuracy: number;
  avgRT: number;
  trials: number;
  planScore: number;
}

export interface ConvoyState {
  phase: ConvoyPhase;
  selectedLoad: ConvoyLoad;
  stonesFilled: number;
  targetStones: number;
  energy: number;
  maxEnergy: number;
  incense: number;
  tripProgress: number;
  phaseProgress: number;
  thinkingRemaining: number;
  paused: boolean;
  restCount: number;
  tripCount: number;
  level: ConvoyLevel;
  isComplete: boolean;
  tripPlanWeights: number[];
  averageDecisionMs: number;
  settlementCount: number;
  result: ConvoyAttemptResult | null;
  wind: ConvoyWindSnapshot;
  lastMessage: string;
  prepareSession: (seed?: number) => void;
  start: () => void;
  selectLoad: (load: ConvoyLoad) => void;
  push: () => void;
  tick: (dtSeconds: number, frameTime?: number) => void;
  setPageHidden: (hidden: boolean) => void;
  resume: () => void;
  reset: () => void;
}

interface SavedConvoy {
  version: number;
  stonesFilled: number;
  complete: boolean;
  level: ConvoyLevel;
  targetStones: number;
}

interface SimState {
  phase: ConvoyPhase;
  selectedLoad: ConvoyLoad;
  stonesFilled: number;
  targetStones: number;
  level: ConvoyLevel;
  attemptLevel: ConvoyLevel;
  isComplete: boolean;
  energy: number;
  maxEnergy: number;
  incenseSeconds: number;
  incenseDuration: number;
  tripProgress: number;
  phaseRemaining: number;
  phaseDuration: number;
  thinkingRemaining: number;
  paused: boolean;
  pageHidden: boolean;
  restCount: number;
  tripCount: number;
  tripPlanWeights: number[];
  decisionTimesMs: number[];
  decisionMs: number;
  pendingDecisionMs: number;
  pendingTripCost: number;
  tripStartEnergy: number;
  moveElapsed: number;
  moveDuration: number;
  windStatus: ConvoyWindStatus;
  windRemaining: number;
  windDuration: number;
  windPlan: ConvoyWindPlan | null;
  windTriggered: boolean;
  lastTripHadWind: boolean;
  attemptSeed: number;
  attemptSettled: boolean;
  settlementCount: number;
  result: ConvoyAttemptResult | null;
  lastMessage: string;
}

export const CONVOY_SAVE_KEY = "mq-convoy";
export const CONVOY_SAVE_VERSION = 1;

const EPSILON = 1e-9;
const SNAPSHOT_INTERVAL = 0.1;

function defaultSave(): SavedConvoy {
  return {
    version: CONVOY_SAVE_VERSION,
    stonesFilled: 0,
    complete: false,
    level: DEFAULT_CONVOY_LEVEL,
    targetStones: CONVOY_LEVEL_RULES[DEFAULT_CONVOY_LEVEL].targetStones,
  };
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function loadSave(): SavedConvoy {
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(CONVOY_SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return fallback;

    const level = isConvoyLevel(parsed.level)
      ? parsed.level
      : isConvoyLevel(parsed.bestLevel)
        ? parsed.bestLevel
        : DEFAULT_CONVOY_LEVEL;
    const stonesFilled = validInteger(parsed.stonesFilled, 0, MAX_CONVOY_STONES)
      ? parsed.stonesFilled
      : 0;
    const savedTarget = validInteger(parsed.targetStones, 1, MAX_CONVOY_STONES)
      ? parsed.targetStones
      : 0;
    const canBeComplete = stonesFilled === 8 || stonesFilled === MAX_CONVOY_STONES;
    const complete = stonesFilled === MAX_CONVOY_STONES
      || (canBeComplete && (parsed.complete === true || savedTarget === stonesFilled));

    if (complete) {
      return {
        version: CONVOY_SAVE_VERSION,
        stonesFilled,
        complete: true,
        level,
        targetStones: stonesFilled,
      };
    }

    const legacyTarget = parsed.version === undefined ? MAX_CONVOY_STONES : 0;
    const fallbackTarget = legacyTarget || Math.max(
      CONVOY_LEVEL_RULES[level].targetStones,
      Math.min(MAX_CONVOY_STONES, stonesFilled + 1),
    );
    const targetStones = savedTarget > stonesFilled ? savedTarget : fallbackTarget;

    return {
      version: CONVOY_SAVE_VERSION,
      stonesFilled,
      complete: false,
      level,
      targetStones,
    };
  } catch {
    return fallback;
  }
}

function persistSave(): void {
  try {
    const save: SavedConvoy = {
      version: CONVOY_SAVE_VERSION,
      stonesFilled: sim.stonesFilled,
      complete: sim.isComplete,
      level: sim.level,
      targetStones: sim.targetStones,
    };
    localStorage.setItem(CONVOY_SAVE_KEY, JSON.stringify(save));
  } catch {
    // The session remains playable when storage is unavailable.
  }
}

function initialSeed(): number {
  return Date.now() >>> 0;
}

function normalizeSeed(seed: number | undefined): number {
  return seed !== undefined && Number.isFinite(seed) ? seed >>> 0 : initialSeed();
}

function clampSelectedLoad(load: ConvoyLoad, remaining: number): ConvoyLoad {
  if (remaining >= load) return load;
  return Math.max(1, Math.min(4, remaining)) as ConvoyLoad;
}

function createSim(save: SavedConvoy, seed: number): SimState {
  const rules = CONVOY_LEVEL_RULES[save.level];
  const remaining = Math.max(1, save.targetStones - save.stonesFilled);
  return {
    phase: save.complete ? "complete" : "intro",
    selectedLoad: clampSelectedLoad(2, remaining),
    stonesFilled: save.stonesFilled,
    targetStones: save.targetStones,
    level: save.level,
    attemptLevel: save.level,
    isComplete: save.complete,
    energy: rules.maxEnergy,
    maxEnergy: rules.maxEnergy,
    incenseSeconds: rules.incenseSeconds,
    incenseDuration: rules.incenseSeconds,
    tripProgress: save.complete ? 1 : 0,
    phaseRemaining: 0,
    phaseDuration: 0,
    thinkingRemaining: THINKING_PROTECTION_SECONDS,
    paused: false,
    pageHidden: typeof document !== "undefined" ? document.hidden : false,
    restCount: 0,
    tripCount: 0,
    tripPlanWeights: [],
    decisionTimesMs: [],
    decisionMs: 0,
    pendingDecisionMs: 0,
    pendingTripCost: 0,
    tripStartEnergy: rules.maxEnergy,
    moveElapsed: 0,
    moveDuration: 0,
    windStatus: "calm",
    windRemaining: 0,
    windDuration: 0,
    windPlan: null,
    windTriggered: false,
    lastTripHadWind: false,
    attemptSeed: seed,
    attemptSettled: save.complete,
    settlementCount: 0,
    result: null,
    lastMessage: save.complete
      ? "The cloud bridge is whole. Momo will remember this day."
      : "Choose a stone stack, then help Momo mend the cloud bridge.",
  };
}

let sim = createSim(loadSave(), initialSeed());
persistSave();
let snapshotElapsed = 0;

function averageDecisionMs(): number {
  if (sim.decisionTimesMs.length === 0) return 0;
  return sim.decisionTimesMs.reduce((sum, value) => sum + value, 0) / sim.decisionTimesMs.length;
}

function displayedEnergy(): number {
  if (sim.phase !== "outbound") return sim.energy;
  return Math.max(0, sim.tripStartEnergy - sim.pendingTripCost * sim.tripProgress);
}

function phaseProgress(): number {
  if (sim.phase === "outbound") return sim.tripProgress;
  if (sim.phase === "complete") return 1;
  if (sim.phaseDuration > 0 && ["preparing", "unloading", "returning", "resting"].includes(sim.phase)) {
    return clamp01(1 - sim.phaseRemaining / sim.phaseDuration);
  }
  return 0;
}

function snapshot(): Omit<ConvoyState, "prepareSession" | "start" | "selectLoad" | "push" | "tick" | "setPageHidden" | "resume" | "reset"> {
  return {
    phase: sim.phase,
    selectedLoad: sim.selectedLoad,
    stonesFilled: sim.stonesFilled,
    targetStones: sim.targetStones,
    energy: displayedEnergy(),
    maxEnergy: sim.maxEnergy,
    incense: clamp01(sim.incenseSeconds / sim.incenseDuration),
    tripProgress: clamp01(sim.tripProgress),
    phaseProgress: phaseProgress(),
    thinkingRemaining: Math.max(0, sim.thinkingRemaining),
    paused: sim.paused,
    restCount: sim.restCount,
    tripCount: sim.tripCount,
    level: sim.level,
    isComplete: sim.isComplete,
    tripPlanWeights: sim.tripPlanWeights,
    averageDecisionMs: averageDecisionMs(),
    settlementCount: sim.settlementCount,
    result: sim.result,
    wind: {
      status: sim.windStatus,
      remaining: Math.max(0, sim.windRemaining),
      progress: sim.windStatus === "calm" || sim.windDuration <= 0
        ? 0
        : clamp01(1 - sim.windRemaining / sim.windDuration),
    },
    lastMessage: sim.lastMessage,
  };
}

type ConvoySnapshot = ReturnType<typeof snapshot>;
let setSnapshot: (value: ConvoySnapshot) => void = () => undefined;

function publish(): void {
  setSnapshot(snapshot());
}

function clearWind(): void {
  sim.windStatus = "calm";
  sim.windRemaining = 0;
  sim.windDuration = 0;
  sim.windPlan = null;
}

function enterLoading(nextTrip: boolean): void {
  sim.phase = "loading";
  sim.tripProgress = 0;
  sim.phaseRemaining = 0;
  sim.phaseDuration = 0;
  sim.thinkingRemaining = THINKING_PROTECTION_SECONDS;
  sim.selectedLoad = clampSelectedLoad(sim.selectedLoad, sim.targetStones - sim.stonesFilled);
  if (nextTrip) sim.decisionMs = 0;
  sim.pendingTripCost = 0;
  clearWind();
  sim.lastMessage = "Choose a stack. A steady cart and a little planning will do.";
}

function enterResting(): void {
  sim.restCount += 1;
  sim.phase = "resting";
  sim.phaseDuration = getRestSeconds(sim.attemptLevel, sim.restCount);
  sim.phaseRemaining = sim.phaseDuration;
  sim.tripProgress = 0;
  sim.thinkingRemaining = 0;
  clearWind();
  sim.lastMessage = "A warm cup of tea will help Momo feel ready again.";
}

function startOutbound(): void {
  sim.phase = "outbound";
  sim.tripProgress = 0;
  sim.moveElapsed = 0;
  sim.moveDuration = getOutboundSeconds(sim.attemptLevel, sim.selectedLoad);
  sim.tripStartEnergy = sim.energy;
  sim.windTriggered = false;
  sim.windStatus = "calm";
  sim.windRemaining = 0;
  sim.windDuration = 0;
  sim.windPlan = getWindPlan(
    sim.attemptLevel,
    sim.selectedLoad,
    sim.attemptSeed,
    sim.tripCount + 1,
    sim.lastTripHadWind,
  );
  sim.lastMessage = "The cloud bridge is waiting. Take it steady.";
}

function settleAttempt(outcome: "complete" | "timeUp"): void {
  if (sim.attemptSettled || sim.phase === "complete" || sim.phase === "timeUp") return;

  sim.attemptSettled = true;
  sim.phase = outcome;
  sim.isComplete = outcome === "complete";
  sim.paused = false;
  sim.thinkingRemaining = 0;
  sim.phaseRemaining = 0;
  sim.phaseDuration = 0;
  clearWind();

  const incenseRatio = clamp01(sim.incenseSeconds / sim.incenseDuration);
  const completionRatio = clamp01(sim.stonesFilled / sim.targetStones);
  const planScore = averagePlanningWeight(sim.tripPlanWeights);
  const result: ConvoyAttemptResult = {
    outcome,
    accuracy: getConvoyAccuracy(outcome === "complete", completionRatio, incenseRatio, planScore),
    avgRT: averageDecisionMs(),
    trials: sim.tripCount,
    planScore,
  };
  sim.result = result;
  sim.settlementCount += 1;
  sim.level = nextConvoyLevel(sim.attemptLevel, outcome === "complete", incenseRatio);
  sim.lastMessage = outcome === "complete"
    ? "A soft bell rings. The cloud bridge is whole again."
    : "The incense has rested. The bridge will keep every stone for next time.";
  persistSave();

  const game = useGameStore.getState();
  game.recordResult({
    task: "convoyBridge",
    accuracy: result.accuracy,
    avgRT: result.avgRT,
    trials: result.trials,
  });

  if (outcome === "complete") {
    game.addFlowLight(1 + Math.floor(result.accuracy * 2));
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useDialogue.getState().push(CONVOY_DIALOGUES.complete);
    game.setCat("proud", "The cloud bridge is whole again. You and Momo mended it together!");
    scheduleCompanionCheck();
  }
}

function finishUnloading(): void {
  const delivered = Math.min(sim.selectedLoad, sim.targetStones - sim.stonesFilled);
  sim.stonesFilled += delivered;
  sim.tripCount += 1;
  sim.tripPlanWeights = [...sim.tripPlanWeights, CONVOY_LOAD_RULES[sim.selectedLoad].planningWeight];
  sim.decisionTimesMs.push(sim.pendingDecisionMs);
  sim.tripProgress = 1;
  sim.phaseRemaining = 0;

  if (sim.stonesFilled >= sim.targetStones) {
    settleAttempt("complete");
    return;
  }

  if (sim.incenseSeconds <= EPSILON) {
    sim.incenseSeconds = 0;
    settleAttempt("timeUp");
    return;
  }

  persistSave();
  sim.phase = "returning";
  sim.phaseDuration = getReturningSeconds(sim.attemptLevel);
  sim.phaseRemaining = sim.phaseDuration;
  sim.lastMessage = "The stones are settled. Momo is bringing the cart home.";
}

function arriveAtBridge(): void {
  sim.energy = Math.max(0, sim.energy - sim.pendingTripCost);
  sim.pendingTripCost = 0;
  sim.lastTripHadWind = sim.windTriggered;
  sim.phase = "unloading";
  sim.tripProgress = 1;
  sim.phaseDuration = getUnloadingSeconds(sim.selectedLoad);
  sim.phaseRemaining = sim.phaseDuration;
  clearWind();
  sim.lastMessage = "One stone at a time, the bridge is growing whole.";
}

function processPhaseEvent(): void {
  if (sim.phase === "outbound") {
    if (sim.moveElapsed >= sim.moveDuration - EPSILON) {
      sim.moveElapsed = sim.moveDuration;
      sim.tripProgress = 1;
      arriveAtBridge();
      return;
    }
    if (sim.windStatus === "warning" && sim.windRemaining <= EPSILON) {
      const stopSeconds = sim.windPlan?.stopSeconds ?? 0;
      sim.windStatus = "gusting";
      sim.windDuration = stopSeconds;
      sim.windRemaining = stopSeconds;
      return;
    }
    if (sim.windStatus === "gusting" && sim.windRemaining <= EPSILON) {
      sim.windStatus = "calm";
      sim.windRemaining = 0;
      sim.windDuration = 0;
      sim.windPlan = null;
      return;
    }
    if (sim.windStatus === "calm" && sim.windPlan && sim.moveElapsed >= sim.windPlan.triggerAt - EPSILON) {
      sim.windStatus = "warning";
      sim.windDuration = sim.windPlan.warningSeconds;
      sim.windRemaining = sim.windPlan.warningSeconds;
      sim.windTriggered = true;
    }
    return;
  }

  if (sim.phaseRemaining > EPSILON) return;

  if (sim.phase === "preparing") {
    if (sim.incenseSeconds <= EPSILON) {
      sim.incenseSeconds = 0;
      sim.tripProgress = 0;
      settleAttempt("timeUp");
    } else {
      startOutbound();
    }
  } else if (sim.phase === "unloading") {
    finishUnloading();
  } else if (sim.phase === "returning") {
    sim.tripProgress = 0;
    if (sim.incenseSeconds <= EPSILON) {
      sim.incenseSeconds = 0;
      settleAttempt("timeUp");
    } else {
      enterLoading(true);
    }
  } else if (sim.phase === "resting") {
    sim.energy = sim.maxEnergy;
    if (sim.incenseSeconds <= EPSILON) {
      sim.incenseSeconds = 0;
      settleAttempt("timeUp");
    } else {
      enterLoading(false);
    }
  }
}

function secondsToEvent(): number {
  if (sim.phase !== "outbound") return Math.max(0, sim.phaseRemaining);

  const movementRemaining = Math.max(0, sim.moveDuration - sim.moveElapsed);
  if (sim.windStatus === "gusting") return Math.max(0, sim.windRemaining);
  if (sim.windStatus === "warning") return Math.max(0, Math.min(sim.windRemaining, movementRemaining));
  if (sim.windPlan) {
    return Math.max(0, Math.min(movementRemaining, sim.windPlan.triggerAt - sim.moveElapsed));
  }
  return movementRemaining;
}

function advanceActivePhase(seconds: number): void {
  if (sim.phase === "outbound") {
    if (sim.windStatus !== "gusting") {
      sim.moveElapsed = Math.min(sim.moveDuration, sim.moveElapsed + seconds);
      sim.tripProgress = clamp01(sim.moveElapsed / sim.moveDuration);
    }
    if (sim.windStatus === "warning" || sim.windStatus === "gusting") {
      sim.windRemaining = Math.max(0, sim.windRemaining - seconds);
    }
    return;
  }

  sim.phaseRemaining = Math.max(0, sim.phaseRemaining - seconds);
  if (sim.phase === "returning" && sim.phaseDuration > 0) {
    sim.tripProgress = clamp01(sim.phaseRemaining / sim.phaseDuration);
  }
}

function burnIncense(seconds: number): void {
  sim.incenseSeconds = Math.max(0, sim.incenseSeconds - seconds);
}

function simulate(dtSeconds: number): void {
  let remaining = dtSeconds;
  let guard = 0;

  while (remaining > EPSILON && sim.phase !== "intro" && sim.phase !== "complete" && sim.phase !== "timeUp" && !sim.paused) {
    if (++guard > 64) break;

    if (sim.phase === "loading") {
      if (sim.thinkingRemaining > EPSILON) {
        const step = Math.min(remaining, sim.thinkingRemaining);
        sim.thinkingRemaining = Math.max(0, sim.thinkingRemaining - step);
        remaining -= step;
        continue;
      }
      if (sim.incenseSeconds <= EPSILON) {
        sim.incenseSeconds = 0;
        settleAttempt("timeUp");
        break;
      }
      const step = Math.min(remaining, sim.incenseSeconds);
      sim.decisionMs += step * 1000;
      burnIncense(step);
      remaining -= step;
      if (sim.incenseSeconds <= EPSILON) {
        sim.incenseSeconds = 0;
        settleAttempt("timeUp");
      }
      continue;
    }

    const untilEvent = secondsToEvent();
    if (untilEvent <= EPSILON) {
      processPhaseEvent();
      continue;
    }
    const untilIncenseEnd = sim.incenseSeconds > EPSILON ? sim.incenseSeconds : Number.POSITIVE_INFINITY;
    const step = Math.min(remaining, untilEvent, untilIncenseEnd);
    if (step <= EPSILON) break;
    burnIncense(step);
    advanceActivePhase(step);
    remaining -= step;
    processPhaseEvent();
  }
}

function prepareSession(seed?: number): void {
  if (sim.phase === "complete") return;
  if (sim.phase === "intro") {
    if (seed !== undefined && Number.isFinite(seed)) sim.attemptSeed = seed >>> 0;
    return;
  }
  const settlementCount = sim.settlementCount;
  const levelRules = CONVOY_LEVEL_RULES[sim.level];
  const save: SavedConvoy = {
    version: CONVOY_SAVE_VERSION,
    stonesFilled: sim.stonesFilled,
    complete: false,
    level: sim.level,
    targetStones: sim.stonesFilled > 0 ? sim.targetStones : levelRules.targetStones,
  };
  sim = createSim(save, normalizeSeed(seed));
  sim.settlementCount = settlementCount;
  snapshotElapsed = 0;
  publish();
}

function start(): void {
  if (sim.phase !== "intro" || sim.paused || sim.pageHidden || sim.isComplete) return;
  if (sim.stonesFilled >= sim.targetStones || sim.incenseSeconds <= 0) return;
  sim.phase = "loading";
  sim.thinkingRemaining = THINKING_PROTECTION_SECONDS;
  sim.decisionMs = 0;
  sim.lastMessage = "Take a moment, then choose a stack for Momo's cart.";
  snapshotElapsed = 0;
  publish();
}

function selectLoad(load: ConvoyLoad): void {
  if (sim.phase !== "loading" || sim.paused || sim.pageHidden || !isConvoyLoad(load)) return;
  if (load > sim.targetStones - sim.stonesFilled || load === sim.selectedLoad) return;
  sim.selectedLoad = load;
  sim.lastMessage = load === 1
    ? "A light stack is ready."
    : load === 4
      ? "A tall stack is ready. Momo will need plenty of energy."
      : "A careful stack is ready.";
  publish();
}

function push(): void {
  if (sim.phase !== "loading" || sim.paused || sim.pageHidden) return;
  const remainingStones = sim.targetStones - sim.stonesFilled;
  if (!isConvoyLoad(sim.selectedLoad) || sim.selectedLoad > remainingStones) return;

  const cost = CONVOY_LOAD_RULES[sim.selectedLoad].energyCost;
  if (sim.energy + EPSILON < cost) {
    enterResting();
  } else {
    sim.pendingDecisionMs = sim.decisionMs;
    sim.pendingTripCost = cost;
    sim.tripStartEnergy = sim.energy;
    sim.phase = "preparing";
    sim.phaseDuration = getPreparingSeconds(sim.selectedLoad);
    sim.phaseRemaining = sim.phaseDuration;
    sim.thinkingRemaining = 0;
    sim.tripProgress = 0;
    sim.lastMessage = "The stones are settling into the cart.";
  }
  snapshotElapsed = 0;
  publish();
}

let lastTickFrame: number | undefined;

function tick(dtSeconds: number, frameTime?: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || sim.paused || sim.phase === "intro" || sim.phase === "complete" || sim.phase === "timeUp") return;
  if (frameTime !== undefined) {
    if (frameTime === lastTickFrame) return;
    lastTickFrame = frameTime;
  }

  const before = {
    phase: sim.phase,
    stonesFilled: sim.stonesFilled,
    tripCount: sim.tripCount,
    restCount: sim.restCount,
    settlementCount: sim.settlementCount,
    windStatus: sim.windStatus,
  };
  simulate(dtSeconds);
  snapshotElapsed += dtSeconds;
  const changed = before.phase !== sim.phase
    || before.stonesFilled !== sim.stonesFilled
    || before.tripCount !== sim.tripCount
    || before.restCount !== sim.restCount
    || before.settlementCount !== sim.settlementCount
    || before.windStatus !== sim.windStatus;

  if (changed || snapshotElapsed + EPSILON >= SNAPSHOT_INTERVAL) {
    publish();
    snapshotElapsed = 0;
  }
}

function setPageHidden(hidden: boolean): void {
  sim.pageHidden = hidden;
  if (!hidden || sim.phase === "intro" || sim.phase === "complete" || sim.phase === "timeUp") return;
  if (!sim.paused) {
    sim.paused = true;
    publish();
  }
}

function resume(): void {
  if (!sim.paused || sim.pageHidden || sim.phase === "intro" || sim.phase === "complete" || sim.phase === "timeUp") return;
  sim.paused = false;
  snapshotElapsed = 0;
  publish();
}

function reset(): void {
  sim = createSim(defaultSave(), initialSeed());
  snapshotElapsed = 0;
  persistSave();
  publish();
}

export const useConvoyStore = create<ConvoyState>((set) => {
  setSnapshot = (value) => set(value);
  return {
    ...snapshot(),
    prepareSession,
    start,
    selectLoad,
    push,
    tick,
    setPageHidden,
    resume,
    reset,
  };
});

const onVisibilityChange = (): void => {
  useConvoyStore.getState().setPageHidden(document.hidden);
};

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", onVisibilityChange);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  });
}
