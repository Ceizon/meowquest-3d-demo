import { create } from "zustand";
import { useGameStore } from "./gameStore";
import { getDailyChallenge, localDateKey } from "../lib/dailyChallenge";

// 每日冒险篇章（OpenMAIC 场景编排的游戏化转译）：
// 每天按日期种子「生成」一条 3 章冒险，温柔引导探索顺序；灯笼自由探索不受影响。
// 纯本地逻辑（日期种子伪随机），离线恒定；完成三章触发一次山巅庆典。

// 五个小游戏的篇章标题（游戏化英文，去标签化：无 score/fail/lesson 类词）
const CHAPTER_TITLES: Record<string, string> = {
  starArray: "Chapter of the Starry Sky",
  glyphTrial: "Chapter of the Ancient Glyphs",
  breathing: "Chapter of the Quiet Lake",
  goNoGo: "Chapter of the Firefly Vale",
  stepStones: "Chapter of the Glowing Stream",
};
const ALL_GAMES = Object.keys(CHAPTER_TITLES);

export interface QuestStep {
  game: string;
  title: string;
  challengeId: string;
  theme: string;
  done: boolean;
}

interface QuestState {
  date: string; // YYYYMMDD（本地时区）
  steps: QuestStep[];
  celebrated: boolean; // 当日庆典是否已发放（+2 心流之光只给一次）
  markDone: (task: string) => void;
}

function todayKey(): string {
  return localDateKey();
}

// 日期种子伪随机：YYYYMMDD 数字 → 线性同余（LCG）洗牌五游戏取 3，同一天结果恒定
function pickDailyGames(dateNum: number): string[] {
  let s = dateNum >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pool = [...ALL_GAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function freshSteps(date: string): QuestStep[] {
  const challengeDate = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8))
  );
  return pickDailyGames(Number(date)).map((game) => {
    const challenge = getDailyChallenge(game as Parameters<typeof getDailyChallenge>[0], challengeDate);
    return {
      game,
      title: CHAPTER_TITLES[game],
      challengeId: challenge.id,
      theme: challenge.theme,
      done: false,
    };
  });
}

// 持久化：仿 achievements 的手写 load/persist 模式（不用 zustand/persist 中间件）
const SAVE_KEY = "mq-quest";

function loadQuest(): { date: string; steps: QuestStep[]; celebrated: boolean } {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { date?: string; steps?: QuestStep[]; celebrated?: boolean };
      // load 时日期不是今天则重新生成
      if (p.date === today && Array.isArray(p.steps)) {
        const steps = p.steps.filter(
          (st) =>
            st &&
            typeof st.game === "string" &&
            st.game in CHAPTER_TITLES &&
            typeof st.done === "boolean"
        ).map((st) => {
          const challenge = getDailyChallenge(st.game as Parameters<typeof getDailyChallenge>[0]);
          return { game: st.game, title: CHAPTER_TITLES[st.game], challengeId: challenge.id, theme: challenge.theme, done: st.done };
        });
        if (steps.length === 3) {
          return { date: today, steps, celebrated: !!p.celebrated };
        }
      }
    }
  } catch {
    /* 隐私模式/损坏数据时回退默认值 */
  }
  return { date: today, steps: freshSteps(today), celebrated: false };
}

function persist(state: { date: string; steps: QuestStep[]; celebrated: boolean }) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* 忽略持久化失败 */
  }
}

export const useQuest = create<QuestState>((set, get) => ({
  ...loadQuest(),

  // 对应 step 置 done；全 done 且未 celebrated → celebrated=true + 2 心流之光
  markDone: (task) => {
    const { steps, celebrated } = get();
    const idx = steps.findIndex((st) => st.game === task);
    if (idx < 0 || steps[idx].done) return;
    const nextSteps = steps.map((st, i) => (i === idx ? { ...st, done: true } : st));
    const allDone = nextSteps.every((st) => st.done);
    const nextCelebrated = celebrated || allDone;
    const next = { steps: nextSteps, celebrated: nextCelebrated };
    persist({ date: get().date, ...next });
    set(next);
    if (allDone && !celebrated) {
      useGameStore.getState().addFlowLight(2);
    }
  },
}));
