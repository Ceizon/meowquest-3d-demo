import { create } from "zustand";
import { useQuest, type QuestStep } from "./quest";

// 灵猫情绪（对应 8 张表情差分图 public/cat/1-8.png）
export type CatEmotion =
  | "happy" | "excited" | "curious" | "encouraging" | "proud" | "calm" | "surprised" | "sleepy";

export const EMOTION_TO_IMAGE: Record<CatEmotion, string> = {
  happy: "cat/1.png",
  excited: "cat/2.png",
  curious: "cat/3.png",
  encouraging: "cat/4.png",
  proud: "cat/5.png",
  calm: "cat/6.png",
  surprised: "cat/7.png",
  sleepy: "cat/8.png",
};

export type Screen = "home" | "mountain" | "story1" | "convoy" | "starArray" | "glyphTrial" | "breathing" | "goNoGo" | "stepStones" | "parent" | "validation";

// 能量状态向量（观察笔记输入，永不向儿童展示分值）
export interface EnergyVector {
  workingMemory: number;   // 星阵记忆 N-Back
  literacy: number;        // 符形试炼（读写）
}

export interface SessionResult {
  task: string;
  accuracy: number;
  avgRT: number;
  trials: number;
  ts: number;
}

interface GameState {
  screen: Screen;
  catEmotion: CatEmotion;
  catLine: string;
  flowLights: number;          // 心流之光（永不出现分数）
  results: SessionResult[];
  aiNote: string;              // AI 家长观察笔记缓存（空串 = 尚未生成）
  setScreen: (s: Screen) => void;
  setCat: (emotion: CatEmotion, line?: string) => void;
  addFlowLight: (n?: number) => void;
  recordResult: (r: Omit<SessionResult, "ts">) => void;
  setAiNote: (note: string) => void;
  energyVectors: () => [{ workingMemory: number; literacy: number }, SessionResult[]];
}

// energyVectors 快照缓存：results 引用不变时必须返回同一快照引用，
// 否则 useSyncExternalStore 每次拿到新对象会陷入无限重渲染（整树卸载、白屏）
let evCachedResults: SessionResult[] | null = null;
let evCachedSnapshot: [EnergyVector, SessionResult[]] | null = null;

// 会话持久化：心流之光与观察记录存 localStorage，演示机刷新/重启浏览器后不丢
const SAVE_KEY = "mq-save";

function loadSave(): { flowLights: number; results: SessionResult[]; aiNote: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { flowLights?: number; results?: SessionResult[]; aiNote?: string };
      return {
        flowLights: p.flowLights ?? 0,
        results: Array.isArray(p.results) ? p.results : [],
        // 旧档无 aiNote 字段 → 回退空串（typeof 守卫兼容损坏数据）
        aiNote: typeof p.aiNote === "string" ? p.aiNote : "",
      };
    }
  } catch {
    /* 隐私模式/损坏数据时回退默认值 */
  }
  return { flowLights: 0, results: [], aiNote: "" };
}

function persist(flowLights: number, results: SessionResult[], aiNote: string) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ flowLights, results, aiNote }));
  } catch {
    /* 忽略持久化失败 */
  }
}

const saved = loadSave();

export const useGameStore = create<GameState>((set, get) => ({
  screen: "home",
  catEmotion: "happy",
  catLine: "Welcome to Meow Mountain! Let's find the Flow Lights together.",
  flowLights: saved.flowLights,
  results: saved.results,
  aiNote: saved.aiNote,
  setScreen: (s) => set({ screen: s }),
  setCat: (emotion, line) =>
    set((st) => ({ catEmotion: emotion, catLine: line ?? st.catLine })),
  addFlowLight: (n = 1) =>
    set((st) => {
      const flowLights = st.flowLights + n;
      persist(flowLights, st.results, st.aiNote);
      return { flowLights };
    }),
  recordResult: (r) =>
    set((st) => {
      const results = [...st.results, { ...r, ts: Date.now() }];
      persist(st.flowLights, results, st.aiNote);
      return { results };
    }),
  setAiNote: (note) =>
    set((st) => {
      persist(st.flowLights, st.results, note);
      return { aiNote: note };
    }),
  // 返回 [能量向量, 结果列表]；快照引用稳定（仅随 results 变化重建），可安全用作
  // useSyncExternalStore 的 getSnapshot
  energyVectors: () => {
    const { results } = get();
    if (results !== evCachedResults) {
      evCachedResults = results;
      const avg = (task: string) => {
        const rs = results.filter((r) => r.task === task);
        return rs.length ? rs.reduce((a, b) => a + b.accuracy, 0) / rs.length : 0.5;
      };
      evCachedSnapshot = [{ workingMemory: avg("starArray"), literacy: avg("glyphTrial") }, results];
    }
    return evCachedSnapshot!;
  },
}));

// 调试/演示快捷跳转
declare global {
  interface Window {
    mq?: {
      go: (s: Screen) => void;
      lights: () => number;
      results: () => SessionResult[];
      quest: () => QuestStep[];
    };
  }
}
window.mq = {
  go: (s: Screen) => useGameStore.getState().setScreen(s),
  lights: () => useGameStore.getState().flowLights,
  results: () => useGameStore.getState().results,
  quest: () => useQuest.getState().steps,
};
