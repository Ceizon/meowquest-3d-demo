export type DailyGame = "starArray" | "glyphTrial" | "breathing" | "goNoGo" | "stepStones";

export interface DailyChallenge {
  id: string;
  date: string;
  game: DailyGame;
  theme: string;
  seed: number;
  pace: number;
  glyphOffset: number;
  noGoShift: number;
  breathingRounds: number;
  stoneGap: number;
}

const THEMES = ["Moonlit Pages", "Dewdrop Waltz", "Lantern Wind", "Silver Echo", "Dawn Mist"];

export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function getDailyChallenge(game: DailyGame, date = new Date()): DailyChallenge {
  const dateKey = localDateKey(date);
  const seed = hashSeed(`${dateKey}:${game}`);
  const random = seededRandom(seed);
  return {
    id: `${dateKey}-${game}-${seed.toString(16)}`,
    date: dateKey,
    game,
    theme: THEMES[Math.floor(random() * THEMES.length)],
    seed,
    pace: 0.92 + random() * 0.16,
    glyphOffset: Math.floor(random() * 20),
    noGoShift: Math.floor(random() * 3),
    breathingRounds: 3 + (random() > 0.72 ? 1 : 0),
    stoneGap: 0.82 + random() * 0.18,
  };
}
