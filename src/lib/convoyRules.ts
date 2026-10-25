export const CONVOY_LOADS = [1, 2, 3, 4] as const;
export type ConvoyLoad = (typeof CONVOY_LOADS)[number];
export type ConvoyLevel = 1 | 2 | 3;

export interface ConvoyLoadRules {
  speedMultiplier: number;
  energyCost: number;
  planningWeight: number;
}

export interface ConvoyWindRules {
  chance: number;
  earliestSeconds: number;
}

export interface ConvoyLevelRules {
  targetStones: number;
  incenseSeconds: number;
  lightTripSeconds: number;
  maxEnergy: number;
  wind: ConvoyWindRules | null;
}

export interface ConvoyWindPlan {
  triggerAt: number;
  warningSeconds: number;
  stopSeconds: number;
}

export const DEFAULT_CONVOY_LEVEL: ConvoyLevel = 2;
export const MAX_CONVOY_STONES = 12;
export const THINKING_PROTECTION_SECONDS = 1.5;
export const PREPARING_SECONDS_PER_STONE = 0.5;
export const UNLOADING_SECONDS_PER_STONE = 0.6;
export const WIND_WARNING_SECONDS = 0.8;
export const WIND_STOP_SECONDS = 1.5;
export const HEAVY_WIND_EXTRA_SECONDS = 1.5;

export const CONVOY_LEVEL_RULES: Record<ConvoyLevel, ConvoyLevelRules> = {
  1: {
    targetStones: 8,
    incenseSeconds: 100,
    lightTripSeconds: 6,
    maxEnergy: 10,
    wind: null,
  },
  2: {
    targetStones: 12,
    incenseSeconds: 100,
    lightTripSeconds: 6,
    maxEnergy: 10,
    wind: { chance: 0.3, earliestSeconds: 1.2 },
  },
  3: {
    targetStones: 12,
    incenseSeconds: 90,
    lightTripSeconds: 6,
    maxEnergy: 10,
    wind: { chance: 0.55, earliestSeconds: 1 },
  },
};

export const CONVOY_LOAD_RULES: Record<ConvoyLoad, ConvoyLoadRules> = {
  1: { speedMultiplier: 1, energyCost: 0.5, planningWeight: 0.45 },
  2: { speedMultiplier: 0.88, energyCost: 1.5, planningWeight: 0.85 },
  3: { speedMultiplier: 0.72, energyCost: 3, planningWeight: 1 },
  4: { speedMultiplier: 0.55, energyCost: 5, planningWeight: 0.65 },
};

export function isConvoyLoad(value: unknown): value is ConvoyLoad {
  return typeof value === "number" && CONVOY_LOADS.includes(value as ConvoyLoad);
}

export function isConvoyLevel(value: unknown): value is ConvoyLevel {
  return value === 1 || value === 2 || value === 3;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getOutboundSeconds(level: ConvoyLevel, load: ConvoyLoad): number {
  return CONVOY_LEVEL_RULES[level].lightTripSeconds / CONVOY_LOAD_RULES[load].speedMultiplier;
}

export function getReturningSeconds(level: ConvoyLevel): number {
  return CONVOY_LEVEL_RULES[level].lightTripSeconds;
}

export function getPreparingSeconds(load: ConvoyLoad): number {
  return load * PREPARING_SECONDS_PER_STONE;
}

export function getUnloadingSeconds(load: ConvoyLoad): number {
  return load * UNLOADING_SECONDS_PER_STONE;
}

export function getRestSeconds(level: ConvoyLevel, restNumber: number): number {
  if (level === 1) return 6;
  return 4 + 2 * Math.max(1, Math.floor(restNumber));
}

export function nextConvoyLevel(
  level: ConvoyLevel,
  completed: boolean,
  incenseRatio = 0,
): ConvoyLevel {
  const next = completed
    ? incenseRatio >= 0.25
      ? level + 1
      : level
    : level - 1;
  return Math.max(1, Math.min(3, next)) as ConvoyLevel;
}

export function averagePlanningWeight(weights: readonly number[]): number {
  if (weights.length === 0) return 0;
  return weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
}

export function getConvoyAccuracy(
  completed: boolean,
  completionRatio: number,
  incenseRatio: number,
  planScore: number,
): number {
  const planningBonus = 0.1 * planScore;
  return completed
    ? clamp01(0.8 + 0.1 * clamp01(incenseRatio) + planningBonus)
    : clamp01(completionRatio) * (0.8 + planningBonus);
}

function deterministicUnit(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

export function getWindPlan(
  level: ConvoyLevel,
  load: ConvoyLoad,
  attemptSeed: number,
  tripNumber: number,
  previousTripHadWind: boolean,
): ConvoyWindPlan | null {
  const rules = CONVOY_LEVEL_RULES[level].wind;
  if (!rules || previousTripHadWind || !isConvoyLoad(load)) return null;

  const trip = Math.max(1, Math.floor(tripNumber));
  const seed = Number.isFinite(attemptSeed) ? attemptSeed >>> 0 : 0;
  const rollSeed = (seed ^ Math.imul(trip, 0x9e3779b1)) >>> 0;
  if (deterministicUnit(rollSeed) >= rules.chance) return null;

  const duration = getOutboundSeconds(level, load);
  const latest = Math.max(rules.earliestSeconds, duration - WIND_WARNING_SECONDS - 0.4);
  const earliest = Math.min(rules.earliestSeconds, latest);
  const triggerAt = earliest + deterministicUnit(rollSeed ^ 0xa5a5a5a5) * (latest - earliest);

  return {
    triggerAt,
    warningSeconds: WIND_WARNING_SECONDS,
    stopSeconds: WIND_STOP_SECONDS + (load >= 3 ? HEAVY_WIND_EXTRA_SECONDS : 0),
  };
}
