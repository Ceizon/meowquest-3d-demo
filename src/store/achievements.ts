import { create } from "zustand";
import type { SessionResult } from "./gameStore";

// 成就系统（轻量版）：面向 6-12 岁儿童的纯鼓励机制——只庆祝"做到了什么"，
// 永不展示分数/排名/失败。图标用符号字符，不引 emoji/图片资源。
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

// 判定顺序即展示顺序：first-light 永远最先弹出
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-light", title: "First Light", description: "You finished your very first game on Meow Mountain!", icon: "★" },
  { id: "glyph-friend", title: "Glyph Friend", description: "The ancient glyphs trust you now — 85% or better in one Glyph Trial!", icon: "✿" },
  { id: "star-keeper", title: "Star Keeper", description: "You kept the stars in order — 80% or better in one Star Array!", icon: "☾" },
  { id: "perfect-glow", title: "Perfect Glow", description: "A perfect round! Every single answer shone true.", icon: "✦" },
  { id: "calm-lake", title: "Calm Lake", description: "You finished a breathing practice — calm as a mountain lake.", icon: "❖" },
  { id: "firefly-friend", title: "Firefly Friend", description: "You finished a firefly game — the little lights dance for you!", icon: "⚯" },
  { id: "swift-stream", title: "Swift Stream", description: "You finished a stepping-stones game — the brook remembers your light, quick steps!", icon: "✵" },
  { id: "triple-glow", title: "Mountain Glow", description: "Six Flow Lights gathered — the whole mountain glows!", icon: "✺" },
];

// 各成就的解锁判定：输入全量战绩与心流之光，输出是否达成
const CHECKS: Record<string, (results: SessionResult[], flowLights: number) => boolean> = {
  "first-light": (r) => r.length >= 1,
  "glyph-friend": (r) => r.some((x) => x.task === "glyphTrial" && x.accuracy >= 0.85),
  "star-keeper": (r) => r.some((x) => x.task === "starArray" && x.accuracy >= 0.8),
  // breathing 无成败、accuracy 恒 1，不计入"满分"成就，只触发 calm-lake
  "perfect-glow": (r) => r.some((x) => x.task !== "breathing" && x.accuracy >= 1),
  "calm-lake": (r) => r.some((x) => x.task === "breathing"),
  "firefly-friend": (r) => r.some((x) => x.task === "goNoGo"),
  "swift-stream": (r) => r.some((x) => x.task === "stepStones"),
  "triple-glow": (_, f) => f >= 6,
};

// 持久化：仿 gameStore 的手写 loadSave/persist 模式（不用 zustand/persist 中间件）
const SAVE_KEY = "mq-achievements";

function loadUnlocked(): string[] {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { unlocked?: string[] };
      if (Array.isArray(p.unlocked)) return p.unlocked.filter((id) => id in CHECKS);
    }
  } catch {
    /* 隐私模式/损坏数据时回退默认值 */
  }
  return [];
}

function persist(unlocked: string[]) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked }));
  } catch {
    /* 忽略持久化失败 */
  }
}

interface AchievementState {
  unlocked: string[]; // 已解锁（持久化）
  queue: string[];    // 待展示队列（不持久化，页面刷新即清空）
  checkAll: (results: SessionResult[], flowLights: number) => void;
  dismiss: () => void;
}

export const useAchievements = create<AchievementState>((set, get) => ({
  unlocked: loadUnlocked(),
  queue: [],

  // 每局结算后调用：逐条判定，新解锁的追加进 unlocked（持久化）与展示队列
  checkAll: (results, flowLights) => {
    const fresh = ACHIEVEMENTS.filter(
      (a) => !get().unlocked.includes(a.id) && CHECKS[a.id](results, flowLights)
    ).map((a) => a.id);
    if (!fresh.length) return;
    const unlocked = [...get().unlocked, ...fresh];
    persist(unlocked);
    set({ unlocked, queue: [...get().queue, ...fresh] });
  },

  // 展示完毕出队一个
  dismiss: () => set({ queue: get().queue.slice(1) }),
}));
