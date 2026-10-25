// 潜在风险信号评估 —— 纯函数、纯本地、零副作用
//
// 设计意图：
//   把「历史战绩 + 能量向量 + 自适应档位 + 当日篇章完成度」聚合成一个温和的三档状态，
//   只做两件事：
//     1) 给 AI 助手一个「今天要不要主动示好/陪伴」的小信号（labels，进 prompt 用）
//     2) 给家长端一句去标签化的状态描述 + 两条「可以这样陪」（parentLine / parentTips）
//
// 合规红线（务必严守）：
//   - 本模块不是筛查工具，不做任何判断性结论，只描述「今天的节奏」。
//   - 输出的所有用户可见字符串（parentLine / parentTips / labels）禁止出现任何临床/诊断词汇，
//     禁止方向性结论（例如「注意力不足」），禁止分数、排名、百分比。
//   - 纯函数：同输入必同输出；不读 Date.now()、不用随机数、不读写 localStorage、不发网络请求。
//   - 不 import 任何 zustand store 实例，仅 `import type` 引入数据类型（编译期擦除，无运行期耦合）。

import type { EnergyVector, SessionResult } from "../store/gameStore";

// ---- 类型定义 ----

/** 三档温和状态：平稳 / 多留意 / 需要多一点陪伴 */
export type RiskLevel = "calm" | "watch" | "support";

export interface RiskInput {
  results: SessionResult[];        // 全部历史战绩（按时间升序）
  flowLights: number;
  energy: { workingMemory: number; literacy: number };
  levels: { nbackLevel: number; seqLevel: number; glyphLevel: number; stonesSpeed: number };
  questDone: number;               // 当日已完成篇章数
  questTotal: number;              // 当日总篇章数
}

export interface RiskSignals {
  level: RiskLevel;
  labels: string[];                // 给 AI prompt 用的简短英文标签，如 "memory steady", "literacy warming up"
  parentLine: string;              // 家长端一句话（英文，去标签化）
  parentTips: [string, string];    // 家长端两条「可以这样陪」
  suggestedAction: "breathe" | "rest" | "play" | "none";
}

// ---- 阈值常量区（集中于此，便于调参）----

const RECENT_WINDOW = 5;              // 看最近 N 局
const EARLY_WINDOW = 5;               // 与「更早一段」对比时取最近窗口之前的 N 局
const LOW_ACC = 0.45;                 // 单局「偏低」的正确率线
const LOW_ACC_STREAK = 3;             // 最近连续 N 局都低于 LOW_ACC 才算「连续偏低」
const RECENT_ACC_LOW = 0.55;          // 最近 RECENT_WINDOW 局正确率均值低于此值 → 记一分
const SLOW_RT_MS = 4000;              // 单局平均反应时超过此值视为「偏慢」
const SLOW_RT_RATIO = 0.5;            // 最近非呼吸局里「偏慢」占比达到此值 → 记一分
const LITERACY_LOW = 0.45;            // 符形（读写）能量向量偏低线
const MEMORY_LOW = 0.45;              // 记忆能量向量偏低线
const LOW_LEVELS = { nback: 1, seq: 3, glyph: 3 } as const;  // 三档自适应全部落在最低档
const LOW_LEVELS_MIN_SESSIONS = 6;    // 至少这么多有效游戏局才把「一直在低档」当信号（开局必然低档）
const ELEVATED_VECTOR = 0.6;          // 能量向量达到此值 → 输出「稳住了」类正向标签
const QUEST_IDLE_MIN_SESSIONS = 3;    // 「一章未做」需在这么多局历史之后才计入
const MIN_HISTORY_FOR_SUPPORT = 4;    // 历史局数少于此时最高只到 watch，避免误判与打扰
const GAME_SESSION_MIN_TRIALS = 1;    // 视为有效游戏局的试次数下限（过滤异常空局）
const BREATH_TASK = "breathing";      // 呼吸练习：accuracy 恒为 1、avgRT 恒为 0，统计时排除 RT

// 分值 → 档位边界
const SCORE_CALM_MAX = 1;             // 得分 0-1 → calm
const SCORE_WATCH_MAX = 3;            // 得分 2-3 → watch；≥4 → support

// 保护性回调：最近窗口比更早窗口提升超过此值 → 档位下调一档（看到进步就撤回干预）
const IMPROVE_DELTA = 0.15;

const LABELS_MAX = 3;                 // 标签最多 3 条（至少 1 条）
const NICE_ACC = 0.7;                 // 输出「accuracy holding strong」标签的正确率门槛

// ---- 固定文案（三档，全英文、去标签化、可执行）----

const COPY: Record<RiskLevel, { line: string; tips: [string, string] }> = {
  calm: {
    line: "Today felt steady and bright.",
    tips: [
      "Keep the usual rhythm — the same gentle routine works well.",
      "Praise one specific thing you noticed, like a careful pause or a clever try.",
    ],
  },
  watch: {
    line: "Today moved a little slower — a gentle check-in could help.",
    tips: [
      "Allow a little extra waiting time and let them lead at their own pace.",
      "Sit beside them for one short round of a favorite game, just for fun.",
    ],
  },
  support: {
    line: "Today may need extra company and a softer pace.",
    tips: [
      "Start with a rest and a few slow breaths together before anything else.",
      "Keep play time short and cozy — two small rounds, then a warm break.",
    ],
  },
};

// 无任何战绩时的首访文案
const FIRST_VISIT: { line: string; tips: [string, string] } = {
  line: "The first adventure is still waiting — no rush at all.",
  tips: [
    "Explore one chapter together and let them pick whichever looks fun.",
    "Stay nearby and enjoy the scenery; there is nothing to finish today.",
  ],
};

const EMPTY_LABEL = "first steps ahead";

// ---- 工具函数（纯）----

// 安全数字：非有限值回落到 fallback
function safeNum(v: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// 有效游戏局：排除呼吸练习与异常空局
function isGameSession(r: SessionResult): boolean {
  return (
    !!r &&
    r.task !== BREATH_TASK &&
    safeNum(r.accuracy, -1) >= 0 &&
    safeNum(r.trials, 0) >= GAME_SESSION_MIN_TRIALS
  );
}

// ---- 主函数 ----

export function evaluateRiskSignals(input: RiskInput): RiskSignals {
  const results = Array.isArray(input.results) ? input.results : [];

  // 1) 空战绩 → 直接给 calm 与鼓励文案
  if (results.length === 0) {
    return {
      level: "calm",
      labels: [EMPTY_LABEL],
      parentLine: FIRST_VISIT.line,
      parentTips: [...FIRST_VISIT.tips] as [string, string],
      suggestedAction: "none",
    };
  }

  const energy: EnergyVector = {
    workingMemory: safeNum(input.energy?.workingMemory, 0.5),
    literacy: safeNum(input.energy?.literacy, 0.5),
  };
  const levels = {
    nbackLevel: safeNum(input.levels?.nbackLevel, LOW_LEVELS.nback),
    seqLevel: safeNum(input.levels?.seqLevel, LOW_LEVELS.seq),
    glyphLevel: safeNum(input.levels?.glyphLevel, LOW_LEVELS.glyph),
  };
  const questDone = Math.max(0, safeNum(input.questDone, 0));
  const questTotal = Math.max(0, safeNum(input.questTotal, 0));

  const games = results.filter(isGameSession);
  const recent = games.slice(-RECENT_WINDOW);
  const recentAccs = recent.map((r) => safeNum(r.accuracy, 0));
  const recentAcc = avg(recentAccs);

  // 最近连续低于 LOW_ACC 的局数（从尾部往前数）
  let lowStreak = 0;
  for (let i = recentAccs.length - 1; i >= 0; i--) {
    if (recentAccs[i] < LOW_ACC) lowStreak++;
    else break;
  }

  // 最近窗口之前的一段：用于判断「是否在回升」
  const earlierCut = Math.max(0, games.length - RECENT_WINDOW);
  const earlier = games.slice(Math.max(0, earlierCut - EARLY_WINDOW), earlierCut);
  const earlierAcc = earlier.length ? avg(earlier.map((r) => safeNum(r.accuracy, 0))) : null;

  // 反应时：呼吸局 avgRT 无意义，已被 isGameSession 排除；再过滤非法值
  const recentRTs = recent.map((r) => safeNum(r.avgRT, 0)).filter((v) => v > 0);
  const recentRT = avg(recentRTs);
  const slowRatio = recentRTs.length ? recentRTs.filter((v) => v > SLOW_RT_MS).length / recentRTs.length : 0;

  const lastTask = games.length ? games[games.length - 1].task : null;
  const hasBreathed = results.some((r) => r.task === BREATH_TASK);
  const questEmpty = questTotal === 0; // 篇章数据不可用时不作为信号

  // 2) 维度打分（每个维度最多一分）
  let score = 0;
  const accLow = recentAccs.length > 0 && recentAcc < RECENT_ACC_LOW;
  const accStreak = lowStreak >= LOW_ACC_STREAK;
  const paceSlow = recentRTs.length > 0 && recentRT > SLOW_RT_MS && slowRatio >= SLOW_RT_RATIO;
  const literacyLow = energy.literacy < LITERACY_LOW;
  const memoryLow = energy.workingMemory < MEMORY_LOW;
  const stuckLowLevel =
    levels.nbackLevel <= LOW_LEVELS.nback &&
    levels.seqLevel <= LOW_LEVELS.seq &&
    levels.glyphLevel <= LOW_LEVELS.glyph &&
    games.length >= LOW_LEVELS_MIN_SESSIONS;
  const questNone = !questEmpty && questDone === 0 && results.length >= QUEST_IDLE_MIN_SESSIONS;

  if (accLow) score++;
  if (accStreak) score++;
  if (paceSlow) score++;
  if (literacyLow) score++;
  if (memoryLow) score++;
  if (stuckLowLevel) score++;
  if (questNone) score++;
  // 主动做过呼吸练习 = 已在自我调节，温和地减一分，避免把「刚学会休息」读成状态下滑
  if (hasBreathed && score > 0) score--;

  // 3) 分值 → 档位
  let level: RiskLevel =
    score <= SCORE_CALM_MAX ? "calm" : score <= SCORE_WATCH_MAX ? "watch" : "support";

  // 保护性：最近窗口明显回升 → 下调一档（看到进步就撤回干预）
  const improving = earlierAcc !== null && recentAcc > earlierAcc + IMPROVE_DELTA;
  if (improving && level !== "calm") {
    level = level === "support" ? "watch" : "calm";
  }

  // 历史太短：不允许给 support
  if (level === "support" && results.length < MIN_HISTORY_FOR_SUPPORT) {
    level = "watch";
  }

  // 4) 标签：由触发维度生成，中性/正向措辞；至少 1 条、最多 LABELS_MAX 条
  const labels: string[] = [];
  if (improving) labels.push("finding a better rhythm");
  if (accLow || accStreak) labels.push("trying through tricky rounds");
  if (paceSlow) labels.push("lately slower pace");
  if (literacyLow) labels.push("literacy warming up");
  if (memoryLow) labels.push("memory finding its groove");
  if (stuckLowLevel) labels.push("taking the gentle path");
  if (questNone) labels.push("easing in today");
  // 平稳时的正向标签
  if (labels.length === 0) {
    if (energy.workingMemory >= ELEVATED_VECTOR) labels.push("memory steady");
    if (energy.literacy >= ELEVATED_VECTOR) labels.push("literacy glowing");
    if (recentAccs.length > 0 && recentAcc >= NICE_ACC) labels.push("accuracy holding strong");
    if (lastTask === BREATH_TASK) labels.push("calm moments growing");
  }
  if (labels.length === 0) labels.push(level === "calm" ? "day flowing smoothly" : "gentle pace today");

  // 5) 文案与建议动作
  const copy = COPY[level];
  const suggestedAction: RiskSignals["suggestedAction"] =
    level === "calm" ? "none" : level === "watch" ? "rest" : "breathe";

  return {
    level,
    labels: [...new Set(labels)].slice(0, LABELS_MAX),
    parentLine: copy.line,
    parentTips: [...copy.tips] as [string, string],
    suggestedAction,
  };
}
