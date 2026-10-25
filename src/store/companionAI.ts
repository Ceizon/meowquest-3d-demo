import { create } from "zustand";
import { useGameStore } from "./gameStore";
import { useQuest } from "./quest";
import {
  askCompanion,
  supportMessage,
  type AssistantContext,
} from "../lib/assistant";
import { evaluateRiskSignals } from "../lib/riskSignals";
import { speakLine } from "../lib/aiSpeech";

// Cog 陪伴面板（AI 助手对话）的会话状态
//
// 设计意图：
//   1) 面板开关、聊天气泡列表、请求中标记各自独立，UI（CompanionPanel）只订阅需要的那几片。
//   2) 请求期间由 UI 渲染「思考中」骨架，store 不插入占位助手消息——
//      这样历史里不会出现空气泡，重试/失败都不会留下脏数据。
//   3) 结算后可「主动干预」一次：本地风险档位到 support 时自动展开面板并推送一句温和文案，
//      每会话只做一次（sessionIntervened 持久化，刷新页面也不会反复打扰）。
//
// 为什么不复用 dialogue 队列（src/store/dialogue.ts）：
//   dialogue 是「台词条」的串行队列——队列非空时会丢弃新 push，专为场景开场/结算台词的
//   顺序播放设计；而聊天需要保留完整问答历史、允许连续追加、并且要显示「谁说的/是否降级」。
//   两者生命周期与渲染形态都不同，混用会互相抢占（游戏台词会吞掉聊天回复，反之亦然），
//   因此这里用独立的 messages 数组 + 独立的持久化键。
//
// 循环依赖规避：
//   Task 6 会让 gameFlow 调用本 store，若本 store 再 import gameFlow 就形成循环导入，
//   初始化顺序不同极易拿到 undefined。因此本文件 **不 import gameFlow**，
//   自适应档位 levels 由调用方作为可选参数传入；未传入时用 DEFAULT_LEVELS 兜底。
//
// 合规：
//   - 持久化只存聊天文本与「是否已干预」，绝不落任何风险档位/评估结果。
//   - 儿童可见文案全部来自 lib/assistant（静态降级与支持文案均为去标签化英文）。

export type CompanionMsgRole = "user" | "assistant";
export type CompanionMsgKind = "chat" | "support";

export interface CompanionMsg {
  id: string;              // 自增序号字符串，避免 Date.now 冲突
  role: CompanionMsgRole;
  text: string;
  kind: CompanionMsgKind;
  degraded?: boolean;      // 仅 assistant：是否走了静态降级
}

interface CompanionAIState {
  open: boolean;
  messages: CompanionMsg[];
  pending: boolean;            // 请求中（含主动干预生成）
  sessionIntervened: boolean;  // 本会话是否已主动干预过（持久化）
  // actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  ask: (question: string, levels?: AssistantContext["levels"]) => Promise<void>;
  interveneIfNeeded: (levels?: AssistantContext["levels"]) => void;   // 结算后调用：算风险 → 必要时主动展开并推送
  reset: () => void;
}

// ---- 常量 ----

const SAVE_KEY = "mq-ai-companion";
const MAX_MESSAGES = 30;        // 内存中保留最近 30 条
const PERSIST_MESSAGES = 20;    // 持久化只保留最近 20 条（控制体积与隐私面）
const SPEAKER = "cog" as const;

// 未传入 levels 时的兜底档位（与 gameFlow 初始值一致）
const DEFAULT_LEVELS: AssistantContext["levels"] = {
  nbackLevel: 1,
  seqLevel: 3,
  glyphLevel: 3,
  stonesSpeed: 1,
};

// 兜底消息：任何异常都不把错误抛给儿童
const OOPS_TEXT =
  "My little gears skipped a beat there, but I'm still right here with you. Want to try asking me again?";

// ---- id 生成 ----

let seq = 0;
const nextId = () => `m${++seq}`;

// ---- 持久化（手写三件套，仿 gameStore）----

function loadAI(): { messages: CompanionMsg[]; sessionIntervened: boolean } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { messages?: CompanionMsg[]; sessionIntervened?: boolean };
      const list = Array.isArray(p.messages) ? p.messages : [];
      // 逐条字段守卫：role/kind 必须在白名单内，text 必须是非空字符串
      const messages: CompanionMsg[] = list
        .filter(
          (m) =>
            !!m &&
            typeof m.text === "string" &&
            m.text.length > 0 &&
            (m.role === "user" || m.role === "assistant") &&
            (m.kind === "chat" || m.kind === "support")
        )
        .slice(-PERSIST_MESSAGES)
        .map((m) => ({
          id: nextId(),
          role: m.role,
          text: m.text,
          kind: m.kind,
          ...(m.role === "assistant" && typeof m.degraded === "boolean" ? { degraded: m.degraded } : {}),
        }));
      return {
        messages,
        sessionIntervened: p.sessionIntervened === true,
      };
    }
  } catch {
    /* 隐私模式/损坏数据时回退默认值 */
  }
  return { messages: [], sessionIntervened: false };
}

function persist(messages: CompanionMsg[], sessionIntervened: boolean) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ messages: messages.slice(-PERSIST_MESSAGES), sessionIntervened })
    );
  } catch {
    /* 忽略持久化失败 */
  }
}

const saved = loadAI();

// ---- 内部工具 ----

// 裁剪到最近 MAX_MESSAGES 条（超出从头裁）
function trim(messages: CompanionMsg[]): CompanionMsg[] {
  return messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
}

// 构建 AssistantContext：本地战绩 + 能量向量 + 篇章进度 + 档位 → 风险信号
function buildCtx(levels?: AssistantContext["levels"]): AssistantContext {
  const gs = useGameStore.getState();
  const [energy] = gs.energyVectors();
  const steps = useQuest.getState().steps;
  const lv = levels ?? DEFAULT_LEVELS;
  const signals = evaluateRiskSignals({
    results: gs.results,
    flowLights: gs.flowLights,
    energy,
    levels: lv,
    questDone: steps.filter((s) => s.done).length,
    questTotal: steps.length,
  });
  return {
    results: gs.results,
    flowLights: gs.flowLights,
    energy,
    levels: lv,
    quest: steps,
    signals,
  };
}

export const useCompanionAI = create<CompanionAIState>((set, get) => ({
  open: false,                     // 不持久化：刷新后默认关闭
  messages: saved.messages,
  pending: false,                  // 不持久化：刷新后必为 false
  sessionIntervened: saved.sessionIntervened,

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  togglePanel: () => set((st) => ({ open: !st.open })),

  // 问 Cog：立即回显用户消息 → pending=true → 等 AI（或静态降级）→ 追加助手消息并配音
  ask: async (question, levels) => {
    const q = (question ?? "").trim();
    if (!q) return;
    if (get().pending) return;     // 防重复提交

    const userMsg: CompanionMsg = { id: nextId(), role: "user", text: q, kind: "chat" };
    const afterUser = trim([...get().messages, userMsg]);
    persist(afterUser, get().sessionIntervened);
    set({ messages: afterUser, pending: true });

    try {
      const ctx = buildCtx(levels);
      const { text, degraded } = await askCompanion(q, ctx);
      const reply: CompanionMsg = { id: nextId(), role: "assistant", text, kind: "chat", degraded };
      const next = trim([...get().messages, reply]);
      persist(next, get().sessionIntervened);
      set({ messages: next, pending: false });
      // 配音 fire-and-forget：永不阻塞/不影响状态
      speakLine(SPEAKER, text);
    } catch {
      // 任何异常都降级为一条温和兜底消息；pending 必须复位
      const fallback: CompanionMsg = {
        id: nextId(),
        role: "assistant",
        text: OOPS_TEXT,
        kind: "chat",
        degraded: true,
      };
      const next = trim([...get().messages, fallback]);
      persist(next, get().sessionIntervened);
      set({ messages: next, pending: false });
      speakLine(SPEAKER, OOPS_TEXT);
    }
  },

  // 结算后调用：本地风险档位到 support 时主动展开面板并推送一次温和文案。
  // 延迟（1.5s）由调用方负责，这里同步执行，便于测试与卸载控制。
  interveneIfNeeded: (levels) => {
    if (get().sessionIntervened) return;   // 每会话只一次
    try {
      const ctx = buildCtx(levels);
      if (ctx.signals.level !== "support") return;
      const text = supportMessage(ctx.signals);
      const msg: CompanionMsg = { id: nextId(), role: "assistant", text, kind: "support" };
      const next = trim([...get().messages, msg]);
      persist(next, true);
      set({ open: true, sessionIntervened: true, messages: next });
      speakLine(SPEAKER, text);
    } catch {
      /* 主动干预失败静默忽略，绝不阻塞游戏流程 */
    }
  },

  // 清空聊天（保留「是否已干预」标记，避免同一会话反复打扰）
  reset: () => {
    persist([], get().sessionIntervened);
    set({ messages: [], pending: false, open: false });
  },
}));

// 调试/回归钩子：与 window.mq 同属受保护的演示接口，只暴露 store 实例本身（只读探测 + 主动干预验证）
declare global {
  interface Window {
    __companionAI?: typeof useCompanionAI;
  }
}
if (typeof window !== "undefined") window.__companionAI = useCompanionAI;
