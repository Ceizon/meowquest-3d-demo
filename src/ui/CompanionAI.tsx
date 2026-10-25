import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGameStore } from "../store/gameStore";
import { useGameFlow } from "../store/gameFlow";
import { useCompanionAI } from "../store/companionAI";
import { SUGGESTED_QUESTIONS } from "../lib/assistant";
import { COMPANIONS } from "../lib/voiceCast";
import { soundManager } from "../lib/sounds";

// 机器动物 AI 小助手 Cog（2D 层）：右下角挂件 + 可展开对话面板。
// 语音由 store 负责（speakLine），此处只做展示与提交，避免重复朗读。
// 红线：不出现分数 / 百分比 / 次数；降级用叙事化措辞（my gears are warming up）。

// 情绪安全行：常驻面板底部，命中情绪关键词时加强提示
const SAFETY_LINE = "If you ever feel very sad, it's okay to tell a grown-up you trust.";
const SAFETY_KEYS = ["sad", "tired", "angry", "scared", "worried", "cry", "hurt", "alone"];
const SAFETY_HINT = "That sounds like a big feeling. Please tell a grown-up you trust — they can sit with you.";

// 项目无动画库：呼吸 / 滑入 / 圆点闪烁 / 金点脉冲 全部注入一次样式（纯离线）
const COG_CSS = `
@keyframes mqCogBreath {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}
@keyframes mqCogGlow {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 0.85; }
}
@keyframes mqCogIn {
  from { transform: translateY(26px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
@keyframes mqCogDot {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40%           { opacity: 1;    transform: translateY(-2px); }
}
@keyframes mqCogShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes mqCogGoldPulse {
  0%, 100% { transform: scale(1);    opacity: 0.9; }
  50%      { transform: scale(1.18); opacity: 1; }
}
.mqCogWiggle:hover { transform: translateY(-2px); }
.mqCogWiggle { transition: transform 0.18s ease; }
.mqCogBtn:hover:not(:disabled) { filter: brightness(1.12); }
.mqCogBtn:disabled { opacity: 0.55; cursor: default; }
.mqCogChip:hover:not(:disabled) { background: rgba(143,216,255,0.16); border-color: rgba(143,216,255,0.55); }
`;

// 情绪关键词命中（小写包含匹配）
function hasFeeling(text: string): boolean {
  const t = (text ?? "").toLowerCase();
  return SAFETY_KEYS.some((w) => t.includes(w));
}

export default function CompanionAI() {
  const screen = useGameStore((s) => s.screen);
  const open = useCompanionAI((s) => s.open);
  const messages = useCompanionAI((s) => s.messages);
  const pending = useCompanionAI((s) => s.pending);
  const togglePanel = useCompanionAI((s) => s.togglePanel);
  const closePanel = useCompanionAI((s) => s.closePanel);
  const ask = useCompanionAI((s) => s.ask);

  // 真实自适应档位（传给 store，便于给出贴合当前难度的建议）
  const nbackLevel = useGameFlow((s) => s.nbackLevel);
  const seqLevel = useGameFlow((s) => s.seqLevel);
  const glyphLevel = useGameFlow((s) => s.glyphLevel);
  const stonesSpeed = useGameFlow((s) => s.stonesSpeed);

  const [draft, setDraft] = useState("");
  // 已读游标：记录「已对用户展示过的消息 id」（挂载时视为全已读）
  const [, setSeenIds] = useState<string[]>(() => messages.map((m) => m.id));
  const listRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef<string[]>(messages.map((m) => m.id));
  const cog = COMPANIONS.cog;

  // 金色未读点：仅统计 support 类助手消息（主动干预推送），且未被看过
  const hasUnread = messages.some(
    (m) => m.role === "assistant" && m.kind === "support" && !seenRef.current.includes(m.id)
  );

  // 面板打开 → 当前全部消息视作已读（写 ref 供渲染期同步判断，state 仅触发重渲染）
  useEffect(() => {
    if (!open) return;
    seenRef.current = messages.map((m) => m.id);
    setSeenIds(seenRef.current);
  }, [open, messages]);

  // 消息变化 / 思考中态变化 → 消息区滚到底
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, open]);

  // 安全行是否加强：最近一条用户或助手文本命中情绪关键词
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const softTouch =
    hasFeeling(lastUser?.text ?? "") || hasFeeling(lastAssistant?.text ?? "");

  // 家长端不渲染（挂件与面板都隐藏）
  if (screen === "parent") return null;

  const submit = (raw: string) => {
    const q = raw.trim();
    if (!q || pending) return;
    setDraft("");
    soundManager.click();
    void ask(q, { nbackLevel, seqLevel, glyphLevel, stonesSpeed });
  };

  const onToggle = () => {
    soundManager.click();
    togglePanel();
  };

  return (
    <>
      <style>{COG_CSS}</style>

      {open ? (
        <div style={panel}>
          {/* 头部：小头像 + 名字 + 副标题 + 关闭 */}
          <div style={header}>
            <div style={{ ...avatar(32, 15), background: `linear-gradient(135deg, ${cog.color}, ${cog.color2})` }}>
              {cog.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: cog.color, lineHeight: 1.2 }}>{cog.name}</div>
              <div style={{ fontSize: 11, color: "#8fa0c8", marginTop: 1 }}>your little machine friend</div>
            </div>
            <button
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                soundManager.click();
                closePanel();
              }}
              style={closeBtn}
            >
              ×
            </button>
          </div>

          {/* 消息区 */}
          <div ref={listRef} style={list}>
            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={bubble(m.role, m.kind === "support")}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                  {m.role === "assistant" && m.degraded && (
                    <div style={degradedNote}>· my gears are warming up</div>
                  )}
                </div>
              </div>
            ))}

            {/* 思考中：骨架气泡 + 错峰闪烁圆点 */}
            {pending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={thinkingBubble}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: cog.color,
                          animation: `mqCogDot 1.2s ease-in-out ${i * 0.16}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, fontStyle: "italic", color: "#9fb4e8" }}>my gears are turning...</div>
                </div>
              </div>
            )}
          </div>

          {/* 快捷提问：只在首轮为空时出现 */}
          {messages.length === 0 && (
            <div style={chipsRow}>
              {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
                <button
                  key={q}
                  className="mqCogChip"
                  onClick={(e) => {
                    e.stopPropagation();
                    submit(q);
                  }}
                  disabled={pending}
                  style={chip}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 输入区 */}
          <div style={inputRow} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              maxLength={200}
              value={draft}
              disabled={pending}
              placeholder="Ask me anything about the mountain..."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit(draft);
                }
              }}
              style={{ ...input, opacity: pending ? 0.6 : 1 }}
            />
            <button
              className="mqCogBtn"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                submit(draft);
              }}
              style={sendBtn}
            >
              {pending ? "..." : "Ask"}
            </button>
          </div>

          {/* 安全支持行：常驻底部，命中情绪时暖金加强 */}
          <div style={softTouch ? safetyStrong : safety}>
            {softTouch ? SAFETY_HINT : SAFETY_LINE}
          </div>
        </div>
      ) : (
        <button
          className="mqCogWiggle"
          title={`Talk to ${cog.name}`}
          onClick={onToggle}
          style={orb}
        >
          <span style={{ ...orbHalo, background: `radial-gradient(circle, ${cog.color}, rgba(0,0,0,0) 68%)` }} />
          <span
            style={{
              ...orbFace,
              background: `radial-gradient(circle at 34% 28%, #ffffff 0%, ${cog.color} 38%, ${cog.color2} 100%)`,
            }}
          >
            {cog.emoji}
          </span>
          {hasUnread && <span style={unreadDot} />}
        </button>
      )}
    </>
  );
}

// ---- 样式 ----

// 挂件：右下角 64×64，zIndex 92（低于 DialogueBar 95 / 成就 200，高于场景）
const orb: CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  width: 64,
  height: 64,
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  zIndex: 92,
};

// 外圈柔和光晕：缓慢呼吸
const orbHalo: CSSProperties = {
  position: "absolute",
  inset: -10,
  borderRadius: "50%",
  filter: "blur(6px)",
  animation: "mqCogGlow 3.2s ease-in-out infinite",
  pointerEvents: "none",
};

// 机器小动物头：渐变圆 + emoji + 呼吸缩放
const orbFace: CSSProperties = {
  position: "relative",
  width: 64,
  height: 64,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 30,
  border: "1px solid rgba(143,216,255,0.55)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  animation: "mqCogBreath 3.2s ease-in-out infinite",
};

// 未读提示：金色小圆点 + 轻脉冲（项目禁用红色做提示）
const unreadDot: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  width: 11,
  height: 11,
  borderRadius: "50%",
  background: "radial-gradient(circle at 35% 30%, #fff6d8, #ffd98a 60%, #ffb347)",
  boxShadow: "0 0 10px rgba(255,217,138,0.9)",
  animation: "mqCogGoldPulse 1.8s ease-in-out infinite",
};

// 面板：右下角，滑入 + 淡入
const panel: CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  width: "min(360px, calc(100vw - 32px))",
  height: "min(480px, calc(100vh - 200px))",
  display: "flex",
  flexDirection: "column",
  borderRadius: 18,
  background: "rgba(12,16,38,0.94)",
  border: "1px solid rgba(143,216,255,0.45)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.55), 0 0 28px rgba(143,216,255,0.18)",
  backdropFilter: "blur(10px)",
  overflow: "hidden",
  animation: "mqCogIn 0.26s ease-out",
  zIndex: 92,
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderBottom: "1px solid rgba(143,216,255,0.18)",
  flexShrink: 0,
};

// 头像：角色主题色渐变圆 + emoji（零图片资产）
function avatar(size: number, fontSize: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize,
    flexShrink: 0,
    boxShadow: "0 0 12px rgba(143,216,255,0.35)",
  };
}

const closeBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "transparent",
  color: "#cfd8ff",
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};

const list: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 0,
};

// 消息气泡：用户右对齐淡蓝，助手左对齐灰白；support 消息左侧金色竖条 + 暖底
function bubble(role: "user" | "assistant", support: boolean): CSSProperties {
  const base: CSSProperties = {
    maxWidth: "85%",
    borderRadius: 14,
    padding: support ? "9px 12px 9px 11px" : "9px 12px",
    fontSize: 14,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
  if (role === "user") {
    return { ...base, background: "rgba(143,216,255,0.18)", color: "#e8f4ff" };
  }
  if (support) {
    return {
      ...base,
      background: "rgba(255,217,138,0.10)",
      color: "#dfe8ff",
      borderLeft: "3px solid rgba(255,217,138,0.85)",
    };
  }
  return { ...base, background: "rgba(255,255,255,0.07)", color: "#dfe8ff" };
}

// 降级说明：叙事化措辞，不制造「失败」感
const degradedNote: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  fontStyle: "italic",
  color: "#9fb4e8",
};

// 思考中骨架气泡：微光扫过（参考 ParentReport 的 shimmer 写法）
const thinkingBubble: CSSProperties = {
  maxWidth: "85%",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(143,216,255,0.22)",
  background:
    "linear-gradient(90deg, rgba(143,216,255,0.05) 25%, rgba(143,216,255,0.16) 50%, rgba(143,216,255,0.05) 75%)",
  backgroundSize: "200% 100%",
  animation: "mqCogShimmer 1.6s linear infinite",
};

const chipsRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "0 12px 8px",
  flexShrink: 0,
};

const chip: CSSProperties = {
  border: "1px solid rgba(143,216,255,0.3)",
  background: "rgba(143,216,255,0.07)",
  color: "#cfe6ff",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 11.5,
  cursor: "pointer",
  lineHeight: 1.4,
  transition: "background 0.18s ease, border-color 0.18s ease",
};

const inputRow: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "0 12px 8px",
  flexShrink: 0,
};

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid rgba(143,216,255,0.3)",
  background: "rgba(255,255,255,0.06)",
  color: "#e8f4ff",
  fontSize: 13,
  outline: "none",
};

// 发送按钮：金色渐变胶囊（与项目 btnStyle 一致）
const sendBtn: CSSProperties = {
  flexShrink: 0,
  padding: "9px 18px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg,#ffd98a,#ffab5e)",
  color: "#4a3010",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 4px 16px rgba(255,180,90,0.3)",
};

// 安全支持行：常驻底部淡色小字
const safety: CSSProperties = {
  padding: "0 14px 10px",
  fontSize: 11,
  lineHeight: 1.5,
  color: "#7f8db4",
  flexShrink: 0,
};

// 命中情绪关键词：暖金加强
const safetyStrong: CSSProperties = {
  ...safety,
  color: "#ffe0a6",
  background: "rgba(255,217,138,0.10)",
  borderTop: "1px solid rgba(255,217,138,0.28)",
  paddingTop: 8,
};
