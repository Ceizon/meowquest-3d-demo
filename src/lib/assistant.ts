// Cog —— 住在 Meow Mountain 的机器动物 AI 助手
//
// 职责：
//   1) 把「玩法知识 + 数据快照 + 回答规范」拼成 system prompt
//   2) 调用 aiClient.chat() 回答孩子的问题；失败/超时/无 key 一律降级到静态话术
//   3) 提供纯静态的主动陪伴文案与首次面板快捷提问
//
// 合规红线（务必严守）：
//   - 儿童可见文本（fallback / supportMessage / SUGGESTED_QUESTIONS）禁止任何临床、诊断、
//     分数、排名类词汇；prompt 里的禁词列表只是「给 AI 的指令」，属元信息。
//   - 纯函数式的降级选取（不用 Math.random），同输入必同输出，便于回归。
//   - askCompanion 永不抛错，绝不阻塞游戏流程。

import { chat } from "./aiClient";
import type { RiskSignals } from "./riskSignals";
import type { SessionResult } from "../store/gameStore";
import type { QuestStep } from "../store/quest";

// ---- 类型 ----

export interface AssistantContext {
  results: SessionResult[];
  flowLights: number;
  energy: { workingMemory: number; literacy: number };
  levels: { nbackLevel: number; seqLevel: number; glyphLevel: number; stonesSpeed: number };
  quest: QuestStep[];
  signals: RiskSignals;        // 由调用方传入（已在本地算好）
}

// ---- 常量区 ----

// 内部任务名 → 儿童可见游戏名
const TASK_NAMES: Record<string, string> = {
  starArray: "Star Array",
  glyphTrial: "Glyph Trial",
  breathing: "Calm Breathing",
  goNoGo: "Firefly Focus",
  stepStones: "Stepping Stones",
};

const TASK_ORDER = ["starArray", "glyphTrial", "breathing", "goNoGo", "stepStones"];

const BREATH_TASK = "breathing";
const RECENT_ROUNDS = 2;       // 每个任务取最近 N 局
const STEADY_ACC = 0.7;        // 正确率 ≥ 此值 → steady
const WARMING_ACC = 0.45;      // 正确率 ≥ 此值 → warming up；低于 → tricky today

// 降级时的叙事化尾注（参考 ParentReport 的 "mountain spirits are napping" 风格）
const DEGRADED_TAIL = "(My little gears are still warming up — but I'm right here with you.)";

// 面板首次打开时的快捷提问：怎么玩 / 可以练什么 / 卡住了怎么办
export const SUGGESTED_QUESTIONS: string[] = [
  "How do I play Star Array?",
  "What can I practice today?",
  "I got stuck — can you help me?",
];

// ---- 工具函数（纯）----

function safeNum(v: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function taskName(task: string): string {
  return TASK_NAMES[task] ?? task;
}

// 正确率 → 定性词（供 prompt 判断，儿童端不会看到这些词）
function qualitativeWord(acc: number): string {
  if (acc >= STEADY_ACC) return "steady";
  if (acc >= WARMING_ACC) return "warming up";
  return "tricky today";
}

// ---- 数据快照 ----

/** 生成给 prompt 用的数据摘要（英文）；数字仅供 AI 判断，prompt 中要求 AI 不复述 */
export function buildDataSnapshot(ctx: AssistantContext): string {
  const results = Array.isArray(ctx.results) ? ctx.results : [];
  const lines: string[] = [];

  // 1) 每任务最近 2 局（呼吸练习无难度波动，不参与定性）
  const recentLines: string[] = [];
  for (const task of TASK_ORDER) {
    const rounds = results.filter((r) => r && r.task === task).slice(-RECENT_ROUNDS);
    if (!rounds.length) continue;
    if (task === BREATH_TASK) {
      recentLines.push(`${taskName(task)}: ${rounds.length} calm visit(s)`);
      continue;
    }
    const accs = rounds.map((r) => safeNum(r.accuracy, 0));
    const rts = rounds.map((r) => safeNum(r.avgRT, 0)).filter((v) => v > 0);
    const rtNote = rts.length ? `, avgRT ${Math.round(avg(rts))}ms` : "";
    recentLines.push(
      `${taskName(task)}: ${qualitativeWord(avg(accs))} across last ${rounds.length} round(s)${rtNote}`
    );
  }
  if (recentLines.length) {
    lines.push("Recent rounds (numbers are for your eyes only, never repeat them):");
    for (const l of recentLines) lines.push(`  - ${l}`);
  } else {
    lines.push("Recent rounds: No rounds played yet.");
  }

  // 2) 当日篇章
  const quest = Array.isArray(ctx.quest) ? ctx.quest : [];
  const done = quest.filter((s) => s && s.done).length;
  lines.push(`Today's chapters: ${done} / ${quest.length} done`);

  // 3) 心流之光
  lines.push(`Flow Lights gathered: ${Math.max(0, Math.round(safeNum(ctx.flowLights, 0)))}`);

  // 4) 自适应档位
  const lv = ctx.levels ?? { nbackLevel: 1, seqLevel: 3, glyphLevel: 4, stonesSpeed: 1 };
  lines.push(
    "Current gentle difficulty: " +
      `star memory ${safeNum(lv.nbackLevel, 1)}-back, ` +
      `star dance length ${safeNum(lv.seqLevel, 3)}, ` +
      `glyph choices ${safeNum(lv.glyphLevel, 4)}, ` +
      `stone glow pace x${safeNum(lv.stonesSpeed, 1).toFixed(2)}`
  );

  // 5) 本地信号标签
  const labels = Array.isArray(ctx.signals?.labels) && ctx.signals.labels.length
    ? ctx.signals.labels.join("; ")
    : "none";
  lines.push(`Local signals: level=${ctx.signals?.level ?? "calm"}; labels: ${labels}`);

  return lines.join("\n");
}

// ---- system prompt ----

/** 组装 Cog 的 system prompt（英文；包含人格、玩法知识、数据快照、回答规范、输出格式） */
export function buildSystemPrompt(ctx: AssistantContext): string {
  const softMode =
    ctx.signals?.level === "support"
      ? "The local signals are at 'support' today — be extra gentle, and warmly offer to do three slow breaths together or to rest a moment before anything else.\n"
      : "";

  return (
    // 1) 人格设定
    "You are Cog, a small machine-animal companion who lives on Meow Mountain. You have a soft glowing gear, a tiny humming fan, and a curious, warm heart. You talk to a child whom you call \"little keeper\".\n" +
    "Voice: curious, kind, playful, and always brief — at most 3 short sentences or 60 words total. Use everyday comparisons (like \"a memory is a pocket you can put a star in\"). Use at most 1 emoji, and skip emoji entirely if one is not useful.\n" +
    "\n" +
    // 2) 游戏知识
    "The games on this mountain:\n" +
    "- Star Array (记忆星阵): First, a star lights up and you decide whether it is the same one as before. Then the stars dance in an order, and you tap the same order back. If it feels stuck: try holding only the first star and the last star in your pocket, then rebuild from there.\n" +
    "- Glyph Trial (符文试炼): A few ancient marks look similar. Find the one that matches the prompt you were given. If it feels stuck: look at the whole shape first, then the little strokes.\n" +
    "- Calm Breathing (萤光呼吸): Follow the glowing light — breathe in as it grows, hold while it shimmers, breathe out as it melts. There is no right or wrong here, ever.\n" +
    "- Firefly Focus (萤火专注): Tap the golden fireflies, and let the blue shadows drift past untouched. If it feels stuck: watch one slow round with your paws still, then move.\n" +
    "- Stepping Stones (溪光石阶): When a stone glows warm gold, tap it as soon as you can. If it feels stuck: rest your eyes on one stone and only move when it lights up.\n" +
    "\n" +
    // 3) 数据快照
    "A quiet snapshot of this little keeper's time here (numbers are only for your own understanding — never say any number, count, or comparison out loud):\n" +
    buildDataSnapshot(ctx) + "\n" +
    softMode +
    "\n" +
    // 4) 回答规范
    "How to answer:\n" +
    "1. Only talk about the games on this mountain, feelings, resting, or how to play. If the question is about something else, gently steer back with a warm, playful line.\n" +
    "2. Never give scores, numbers, counts, comparisons, or judgments. Never say who did better or worse.\n" +
    "3. Never use these words: test, score, fail, lesson, training, treatment, ADHD, dyslexia, disorder, diagnosis, deficit, symptom, therapy. Do not imply them either.\n" +
    "4. Never give medical or psychological advice, and never suggest medicine. If the child mentions a worry about their body or feelings, warmly encourage them to tell their mom, dad, or teacher.\n" +
    "5. If the child sounds sad, scared, or talks about hurting themselves: start by naming the feeling kindly, then clearly and warmly encourage them to find a grown-up nearby right away — mom, dad, or a teacher.\n" +
    "6. Be concrete: offer one small, doable idea they can try right now.\n" +
    "\n" +
    // 5) 输出格式
    "Output format: plain text only. At most 3 sentences. No markdown, no bullet lists, no headings, and do not wrap the reply in quotes."
  );
}

// ---- 降级话术 ----

type FallbackKind = "howTo" | "advice" | "stuck" | "feelings" | "other";

// 关键词 → 类别（英文，大小写不敏感）；顺序即优先级
const KEYWORD_RULES: { kind: FallbackKind; words: string[] }[] = [
  { kind: "feelings", words: ["sad", "tired", "angry", "scared", "worried", "cry"] },
  { kind: "stuck", words: ["stuck", "can't", "cant", "hard", "difficult"] },
  { kind: "advice", words: ["what should", "next", "practice", "recommend", "better"] },
  { kind: "howTo", words: ["how", "play", "rule", "help"] },
];

// 每类 3 条候选：1-2 句温柔英文 + 一条具体可执行的小建议
const FALLBACKS: Record<FallbackKind, string[]> = {
  howTo: [
    "Every game here starts with one small look — that's the whole secret, little keeper. Try touching the first glowing thing you see and let the mountain answer.",
    "The mountain likes curious paws, so just explore one lantern at a time. Pick a game and watch for one gentle moment before you tap.",
    "You can begin anywhere that glows — there is no wrong door up here. Start with the star lantern if you want the gentlest first step.",
  ],
  advice: [
    "Your best next step is whatever makes your shoulders drop a little. Try one slow breath, then choose the game that looks the most fun.",
    "Tiny bits of play add up like pebbles in a pocket. Try one short round of a game you already like before trying something new.",
    "When my gears feel fuzzy, I go slow and look closely. Try a round of Calm Breathing first, then return with fresh eyes.",
  ],
  stuck: [
    "Being stuck just means your brain is building a new path — nothing is broken. Try holding only the very first and very last thing, then fill in the middle.",
    "When paws hesitate, the mountain waits patiently. Look at the whole shape once, then pick the piece that feels right.",
    "Stuck spots are where the best little tricks are born. Try watching one whole round without touching anything, then move.",
  ],
  feelings: [
    "That sounds like a heavy feeling, and it makes sense to feel it. Would you like to take three slow breaths with me, and tell a grown-up you trust how you feel?",
    "Thank you for telling me — big feelings are okay to have. Please find your mom, dad, or teacher and let them sit with you for a moment.",
    "You don't have to carry that alone, little keeper. Let's breathe in and out slowly together, and then go tell mom, dad, or a teacher.",
  ],
  other: [
    "My gears are still turning on that one, but I'm glad you asked. Let's wander to a game and see what the mountain shows us.",
    "That's a curious question — I'll keep thinking about it. For now, want to pick a glowing lantern together?",
    "I may not know everything, but I do know where all the pretty games are. Try tapping a lantern and I'll roll along with you.",
  ],
};

// 关键词分类（纯函数）
function classifyQuestion(question: string): FallbackKind {
  const q = (question ?? "").toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => q.includes(w))) return rule.kind;
  }
  return "other";
}

/** 降级话术：按关键词分类，固定索引选取（同问题必同输出），末尾附叙事化说明 */
function pickFallback(question: string): string {
  const kind = classifyQuestion(question);
  const pool = FALLBACKS[kind];
  const idx = (question ?? "").trim().length % pool.length;
  return `${pool[idx]}\n${DEGRADED_TAIL}`;
}

// ---- 主入口 ----

/** 问 Cog 一个问题；失败/超时/无 key 一律降级，永不抛错 */
export async function askCompanion(
  question: string,
  ctx: AssistantContext
): Promise<{ text: string; degraded: boolean }> {
  try {
    const reply = await chat(
      [
        { role: "system", content: buildSystemPrompt(ctx) },
        { role: "user", content: question },
      ],
      { temperature: 0.7, maxTokens: 400 }
    );
    const text = typeof reply === "string" ? reply.trim() : "";
    if (text) return { text, degraded: false };
    return { text: pickFallback(question), degraded: true };
  } catch {
    return { text: pickFallback(question), degraded: true };
  }
}

// ---- 主动陪伴文案 ----

// 标签 → 一句「今天你已经做过的、值得看见的小事」（全部正向，不带任何负面暗示）
const LABEL_ACK: { key: string; line: string }[] = [
  { key: "finding a better rhythm", line: "You're finding a rhythm that fits you, and that's lovely." },
  { key: "trying through tricky rounds", line: "You kept trying through tricky moments, and that took real heart." },
  { key: "lately slower pace", line: "Moving a little slower is a perfectly good way to walk through today." },
  { key: "literacy warming up", line: "The old glyphs are slowly getting friendlier with you." },
  { key: "memory finding its groove", line: "Your star-memory is settling in at its own speed." },
  { key: "taking the gentle path", line: "You've been choosing the gentle path, and gentle is strong." },
  { key: "easing in today", line: "Easing in softly is exactly how today can start." },
  { key: "memory steady", line: "Your star-memory is glowing quietly and steadily." },
  { key: "literacy glowing", line: "The ancient glyphs are glowing warmly for you." },
  { key: "accuracy holding strong", line: "Your careful watching has been holding strong." },
  { key: "calm moments growing", line: "Your calm moments are growing, one breath at a time." },
  { key: "day flowing smoothly", line: "Today has been flowing along at a kind, easy pace." },
  { key: "gentle pace today", line: "A gentle pace today is a good pace." },
  { key: "first steps ahead", line: "Your very first steps on this mountain are still waiting, with no rush at all." },
];

const DEFAULT_ACK = "Today has its own shape, and every shape is welcome here.";

/** 主动干预文案（纯静态，不依赖网络或 AI；2-3 句英文，按档位与首个标签轻微区分） */
export function supportMessage(signals: RiskSignals): string {
  const label = signals?.labels?.[0] ?? "";
  const ack = LABEL_ACK.find((a) => a.key === label)?.line ?? DEFAULT_ACK;
  const level = signals?.level ?? "calm";

  let opener: string;
  let action: string;
  let closer: string;

  if (level === "support") {
    opener = `Today might feel a little heavy, little keeper — and that's okay, nothing needs to be different right now.`;
    action = "Let's make it softer together: breathe in slowly, hold, and breathe out three gentle times, or just rest a while.";
    closer = "I'll hum beside you the whole time, and the mountain will keep the light on for whenever you're ready.";
  } else if (level === "watch") {
    opener = "Today seems to be moving at its own gentle speed, little keeper.";
    action = "Want to try three slow breaths together, or curl up for a short rest before we wander on?";
    closer = "Whatever you pick is just right — I'm rolling along beside you.";
  } else {
    opener = "Today feels soft and bright, little keeper.";
    action = "If anything ever feels big, we can always pause and take three slow breaths together.";
    closer = "The whole mountain is happy to keep you company.";
  }

  return `${opener} ${ack} ${action} ${closer}`;
}
