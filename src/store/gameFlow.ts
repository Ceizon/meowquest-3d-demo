import { create } from "zustand";
import { useGameStore } from "./gameStore";
import { useAchievements } from "./achievements";
import { useQuest } from "./quest";
import { useDialogue } from "./dialogue";
import { COMPANION_DIALOGUES, resultLines } from "../data/companions";
import { nextNbackLevel, nextGlyphOptionCount, nextStonesSpeed, nextSeqLength } from "../lib/adaptive";
import { useCompanionAI } from "./companionAI";
import type { ConvoyLoad, ConvoyLevel } from "../lib/convoyRules";
import type { ConvoyAttemptResult, ConvoyPhase, ConvoyWindSnapshot } from "./convoy";

// 结算后延迟约 1.5s 交给 AI 助手做一次温和的风险评估与（必要时）主动支持。
// 延迟是为了不打断谈心卡/结算卡的入场动画；失败静默，绝不阻塞结算。
// 用布尔防抖避免连续结算堆叠多次调度；回调执行后复位。
let supportScheduled = false;
export function scheduleCompanionCheck() {
  try {
    if (supportScheduled) return;
    supportScheduled = true;
    window.setTimeout(() => {
      supportScheduled = false;
      try {
        const { nbackLevel, seqLevel, glyphLevel, stonesSpeed } = useGameFlow.getState();
        useCompanionAI.getState().interveneIfNeeded({ nbackLevel, seqLevel, glyphLevel, stonesSpeed });
      } catch {
        /* 主动干预失败静默忽略，绝不阻塞结算 */
      }
    }, 1500);
  } catch {
    supportScheduled = false;
  }
}

// 小游戏会话状态（3D 场景层与 2D UI 层之间的桥梁）
export type GamePhase = "intro" | "playing" | "result";
export interface GlyphOption { char: string; vanish: boolean; }

// R3F 的 Canvas 使用独立 reconciler，其内部组件的 effect 提交时机与页面主 React 不一致，
// 因此 2D → 3D 的调用不走 store / 事件总线，而是由场景在渲染期把自己注册到 window 注册表，
// 2D 层直接调用注册表里的函数。
export interface GlyphSceneApi {
  start: () => void;
  pick: (index: number) => void;
}
export interface StarSceneApi {
  start: () => void;
  answer: (same: boolean) => void;
  tap: (index: number) => void;
  // 只读探针（自动化/调试用，与 stones/goNoGo 定位一致）；expect = 当前期望星位，非召回相位为 -1
  current: () => {
    running: boolean; stage: "recall" | "sequence"; phase: string;
    round: number; roundTotal: number; pos: number; len: number;
    showing: boolean; litSlot: number; expect: number;
  };
}
export interface BreathSceneApi {
  start: () => void;
}
export interface GoNoGoSceneApi {
  start: () => void;
  // 自动化/调试只读探针：当前试次是否为 NO-GO、是否处于可点击窗口
  current: () => { isNoGo: boolean; active: boolean };
  // 自动化/调试用：与 mesh onClick 走同一处理函数
  tap: () => void;
}
export interface StonesSceneApi {
  start: () => void;
  // 自动化/调试用：与石阶 mesh onClick 走同一处理函数
  tap: (index: number) => void;
  // 自动化/调试只读探针：会话状态与当前发光石阶（未点亮时 litIndex=-1）
  current: () => { running: boolean; index: number; total: number; litIndex: number };
}
export interface ConvoySceneSnapshot {
  readonly phase: ConvoyPhase;
  readonly load: ConvoyLoad;
  readonly selectedLoad: ConvoyLoad;
  readonly stonesFilled: number;
  readonly target: number;
  readonly targetStones: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly incense: number;
  readonly restCount: number;
  readonly trips: number;
  readonly tripCount: number;
  readonly trials: number;
  readonly level: ConvoyLevel;
  readonly settlementCount: number;
  readonly paused: boolean;
  readonly tripProgress: number;
  readonly phaseProgress: number;
  readonly thinkingRemaining: number;
  readonly isComplete: boolean;
  readonly wind: ConvoyWindSnapshot;
  readonly result: ConvoyAttemptResult | null;
}
export interface ConvoySceneApi {
  start: () => void;
  selectLoad: (load: ConvoyLoad) => void;
  push: () => void;
  current: () => ConvoySceneSnapshot;
}

interface SceneRegistry {
  glyph?: GlyphSceneApi | null;
  star?: StarSceneApi | null;
  breath?: BreathSceneApi | null;
  goNoGo?: GoNoGoSceneApi | null;
  stones?: StonesSceneApi | null;
  convoy?: ConvoySceneApi | null;
}
const registry: SceneRegistry = ((window as unknown as { __mqScenes?: SceneRegistry }).__mqScenes ??= {});

export function registerGlyphScene(api: GlyphSceneApi | null) {
  registry.glyph = api;
}
export function registerStarScene(api: StarSceneApi | null) {
  registry.star = api;
}
export function registerBreathScene(api: BreathSceneApi | null) {
  registry.breath = api;
}
export function registerGoNoGoScene(api: GoNoGoSceneApi | null) {
  registry.goNoGo = api;
}
export function registerStonesScene(api: StonesSceneApi | null) {
  registry.stones = api;
}
export function registerConvoyScene(api: ConvoySceneApi | null) {
  registry.convoy = api;
}

// 呼吸练习的实时相位信息（3D 场景发布，2D overlay 只读展示）
export type BreathPhase = "inhale" | "hold" | "exhale";
export interface BreathInfo {
  phase: BreathPhase;
  round: number;
  total: number;
  secondsLeft: number;
}

interface FlowState {
  starPhase: GamePhase;
  glyphPhase: GamePhase;
  breathPhase: GamePhase;
  goNoGoPhase: GamePhase;
  goNoGoProgress: { index: number; total: number };
  stonesPhase: GamePhase;
  stonesProgress: { index: number; total: number };
  breathInfo: BreathInfo;
  // 自适应难度级别（跨局保持，finish 时按表现调节）
  nbackLevel: number;    // 星阵记忆 N-back 的 N（1↔2）
  starStage: "recall" | "sequence";   // 星阵阶段：基础 N-back 判断 / 进阶顺序还原
  starRound: { round: number; total: number; pos: number; len: number; showing: boolean }; // 阶段 B 轮次进度
  seqLevel: number;                   // 进阶序列长度（自适应 3–6）
  glyphLevel: number;    // 符形试炼选项数（3→5，受题库干扰字数量约束）
  stonesSpeed: number;   // 溪光石阶发光节奏倍率（0.6–1.6，影响试次间隔）
  answerStar: (same: boolean) => void;
  starProgress: { index: number; total: number };
  glyphOptions: GlyphOption[];
  glyphProgress: { index: number; total: number };
  pickGlyph: (index: number) => void;
  startStar: () => void;
  finishStar: (accuracy: number, seqAccuracy: number, avgRT: number, trials: number) => void;
  startGlyph: () => void;
  finishGlyph: (accuracy: number, avgRT: number, trials: number, optionCount: number) => void;
  startBreath: () => void;
  finishBreath: (rounds: number) => void;
  startGoNoGo: () => void;
  finishGoNoGo: (accuracy: number, avgRT: number, trials: number) => void;
  startStones: () => void;
  finishStones: (accuracy: number, avgRT: number, trials: number) => void;
  reset: () => void;
  resetStar: () => void;
  resetGlyph: () => void;
  resetBreath: () => void;
  resetGoNoGo: () => void;
  resetStones: () => void;
}

export const useGameFlow = create<FlowState>((set, get) => ({
  starPhase: "intro",
  glyphPhase: "intro",
  breathPhase: "intro",
  goNoGoPhase: "intro",
  goNoGoProgress: { index: 0, total: 0 },
  stonesPhase: "intro",
  stonesProgress: { index: 0, total: 0 },
  breathInfo: { phase: "inhale", round: 0, total: 0, secondsLeft: 0 },
  nbackLevel: 1,
  starStage: "recall",
  starRound: { round: 0, total: 3, pos: 0, len: 0, showing: false },
  seqLevel: 3,
  glyphLevel: 4,
  stonesSpeed: 1,
  starProgress: { index: 0, total: 0 },
  glyphOptions: [],
  glyphProgress: { index: 0, total: 0 },

  // 2D UI → 3D 场景
  answerStar: (same) => registry.star?.answer(same),
  pickGlyph: (index) => registry.glyph?.pick(index),

  startStar: () => {
    set({ starPhase: "playing" });
    registry.star?.start();
    useDialogue.getState().push(COMPANION_DIALOGUES.intro.starArray);
  },
  finishStar: (accuracy, seqAccuracy, avgRT, trials) => {
    const g = useGameStore.getState();
    g.recordResult({ task: "starArray", accuracy, avgRT, trials });
    g.addFlowLight(1 + Math.floor(accuracy * 2));
    // 成就判定：set 是同步的，重新 getState() 取最新战绩/心流之光
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useQuest.getState().markDone("starArray");
    useDialogue.getState().push(resultLines("starArray", accuracy));
    g.setCat(
      accuracy >= 0.8 ? "proud" : accuracy >= 0.5 ? "happy" : "encouraging",
      accuracy >= 0.8
        ? "Your memory shines like the North Star!"
        : accuracy >= 0.5
        ? "Your spirit tail grows stronger every day~"
        : "Every star you saw is progress. Let's fly again!"
    );
    set({ starPhase: "result", nbackLevel: nextNbackLevel(get().nbackLevel, accuracy), seqLevel: nextSeqLength(get().seqLevel, seqAccuracy) });
    scheduleCompanionCheck();
  },
  startGlyph: () => {
    set({ glyphPhase: "playing" });
    registry.glyph?.start();
    useDialogue.getState().push(COMPANION_DIALOGUES.intro.glyphTrial);
  },
  finishGlyph: (accuracy, avgRT, trials, optionCount) => {
    const g = useGameStore.getState();
    g.recordResult({ task: "glyphTrial", accuracy, avgRT, trials });
    g.addFlowLight(1 + Math.floor(accuracy * 2));
    // 成就判定：set 是同步的，重新 getState() 取最新战绩/心流之光
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useQuest.getState().markDone("glyphTrial");
    useDialogue.getState().push(resultLines("glyphTrial", accuracy));
    g.setCat(accuracy >= 0.8 ? "excited" : "happy",
      accuracy >= 0.8 ? "Every glyph remembers your name!" : "The Ancient Library glows brighter because of you~");
    set({ glyphPhase: "result", glyphLevel: nextGlyphOptionCount(optionCount, accuracy, avgRT) });
    scheduleCompanionCheck();
  },
  // 全局复位：相位与各游戏进度/信息一并清，避免 overlay 短暂显示过期进度
  reset: () =>
    set({
      starPhase: "intro",
      glyphPhase: "intro",
      breathPhase: "intro",
      goNoGoPhase: "intro",
      stonesPhase: "intro",
      starProgress: { index: 0, total: 0 },
      glyphOptions: [],
      glyphProgress: { index: 0, total: 0 },
      goNoGoProgress: { index: 0, total: 0 },
      stonesProgress: { index: 0, total: 0 },
      breathInfo: { phase: "inhale", round: 0, total: 0, secondsLeft: 0 },
      starStage: "recall",
      starRound: { round: 0, total: 3, pos: 0, len: 0, showing: false },
    }),
  resetStar: () => set({ starPhase: "intro", starProgress: { index: 0, total: 0 }, starStage: "recall", starRound: { round: 0, total: 3, pos: 0, len: 0, showing: false } }),
  resetGlyph: () =>
    set({ glyphPhase: "intro", glyphOptions: [], glyphProgress: { index: 0, total: 0 } }),
  // 呼吸练习：无成败打分——完成即满值 accuracy=1（正念不设门槛），trials 记轮数
  startBreath: () => {
    set({ breathPhase: "playing" });
    registry.breath?.start();
    useDialogue.getState().push(COMPANION_DIALOGUES.intro.breathing);
  },
  finishBreath: (rounds) => {
    const g = useGameStore.getState();
    g.recordResult({ task: "breathing", accuracy: 1, avgRT: 0, trials: rounds });
    g.addFlowLight(1);
    // 成就判定：set 是同步的，重新 getState() 取最新战绩/心流之光
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useQuest.getState().markDone("breathing");
    // 呼吸无成败：固定走 high 档（resultLines 内部对 breathing 恒定 high）
    useDialogue.getState().push(resultLines("breathing", 1));
    g.setCat("calm", "Your breath made the whole lake calm. You can find this peace anytime~");
    set({ breathPhase: "result" });
    scheduleCompanionCheck();
  },
  resetBreath: () =>
    set({ breathPhase: "intro", breathInfo: { phase: "inhale", round: 0, total: 0, secondsLeft: 0 } }),
  // 萤火虫谷 Go/No-Go 抑制控制训练：commission/omission 都计入 accuracy，但对儿童永不显示分数
  startGoNoGo: () => {
    set({ goNoGoPhase: "playing" });
    registry.goNoGo?.start();
    useDialogue.getState().push(COMPANION_DIALOGUES.intro.goNoGo);
  },
  finishGoNoGo: (accuracy, avgRT, trials) => {
    const g = useGameStore.getState();
    g.recordResult({ task: "goNoGo", accuracy, avgRT, trials });
    g.addFlowLight(1 + Math.floor(accuracy * 2));
    // 成就判定：set 是同步的，重新 getState() 取最新战绩/心流之光
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useQuest.getState().markDone("goNoGo");
    useDialogue.getState().push(resultLines("goNoGo", accuracy));
    g.setCat(
      accuracy >= 0.8 ? "proud" : accuracy >= 0.5 ? "happy" : "encouraging",
      accuracy >= 0.8
        ? "You danced with the fireflies like a true night guardian!"
        : accuracy >= 0.5
        ? "The fireflies trust your gentle paws more and more~"
        : "Every firefly you watched is practice. The vale will glow for you again!"
    );
    set({ goNoGoPhase: "result" });
    scheduleCompanionCheck();
  },
  resetGoNoGo: () => set({ goNoGoPhase: "intro", goNoGoProgress: { index: 0, total: 0 } }),
  // 溪光石阶：加工速度 + 持续注意——miss 温和计入 accuracy，对儿童永不显示分数
  startStones: () => {
    set({ stonesPhase: "playing" });
    registry.stones?.start();
    useDialogue.getState().push(COMPANION_DIALOGUES.intro.stepStones);
  },
  finishStones: (accuracy, avgRT, trials) => {
    const g = useGameStore.getState();
    g.recordResult({ task: "stepStones", accuracy, avgRT, trials });
    g.addFlowLight(1 + Math.floor(accuracy * 2));
    // 成就判定：set 是同步的，重新 getState() 取最新战绩/心流之光
    const after = useGameStore.getState();
    useAchievements.getState().checkAll(after.results, after.flowLights);
    useQuest.getState().markDone("stepStones");
    useDialogue.getState().push(resultLines("stepStones", accuracy));
    g.setCat(
      accuracy >= 0.8 ? "proud" : accuracy >= 0.5 ? "happy" : "encouraging",
      accuracy >= 0.8
        ? "Swift paws! You crossed the stream like a beam of light!"
        : accuracy >= 0.5
        ? "The stones love your quick, gentle steps~"
        : "Every sparkle you chased made you faster. The stream will glow again!"
    );
    set({ stonesPhase: "result", stonesSpeed: nextStonesSpeed(get().stonesSpeed, accuracy, avgRT) });
    scheduleCompanionCheck();
  },
  resetStones: () => set({ stonesPhase: "intro", stonesProgress: { index: 0, total: 0 } }),
}));

// 3D 场景 → 2D UI 的写入
export function publishGlyphOptions(opts: GlyphOption[]) {
  useGameFlow.setState({ glyphOptions: opts });
}
export function publishStarProgress(index: number, total: number) {
  useGameFlow.setState({ starProgress: { index, total } });
}
export function publishGlyphProgress(index: number, total: number) {
  useGameFlow.setState({ glyphProgress: { index, total } });
}
export function publishBreathInfo(phase: BreathPhase, round: number, total: number, secondsLeft: number) {
  useGameFlow.setState({ breathInfo: { phase, round, total, secondsLeft } });
}
export function publishGoNoGoProgress(index: number, total: number) {
  useGameFlow.setState({ goNoGoProgress: { index, total } });
}
export function publishStonesProgress(index: number, total: number) {
  useGameFlow.setState({ stonesProgress: { index, total } });
}

// 星阵阶段发布：stage 切换时可带轮次进度对象（recall 阶段不带）
export function publishStarStage(
  stage: "recall" | "sequence",
  round?: { round: number; total: number; pos: number; len: number; showing: boolean }
) {
  useGameFlow.setState(round ? { starStage: stage, starRound: round } : { starStage: stage });
}
