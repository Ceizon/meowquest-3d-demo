import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useDialogue } from "../store/dialogue";
import { COMPANIONS } from "../lib/voiceCast";
import { speakLine } from "../lib/aiSpeech";

// 底部居中对话条（2D 层）：渲染 queue[0]，每次当前句变化调 speakLine（三级降级语音），
// 3.4s 自动 advance，点击整条也可 advance；队列空则不渲染。
const AUTO_ADVANCE_MS = 3400;

// 项目无动画库：入场淡入与推进箭头的关键帧注入一次即可（纯离线）
const DIALOGUE_CSS = `
@keyframes mqDlgIn {
  from { transform: translateX(-50%) translateY(14px); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0); opacity: 1; }
}
@keyframes mqDlgNudge {
  0%, 100% { transform: translateX(0); opacity: 0.5; }
  50%      { transform: translateX(3px); opacity: 1; }
}
`;

export default function DialogueBar() {
  const queue = useDialogue((s) => s.queue);
  const current = queue.length > 0 ? queue[0] : null;

  // 当前句变化：播一句角色语音 + 重启 3.4s 自动推进定时器
  useEffect(() => {
    if (!current) return;
    speakLine(current.speaker, current.line);
    const t = window.setTimeout(() => useDialogue.getState().advance(), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  if (!current) return null;
  const def = COMPANIONS[current.speaker];

  return (
    <>
      <style>{DIALOGUE_CSS}</style>
      {/* key 随队列位置变化：每句重新触发入场动画 */}
      <div
        key={`${queue.length}:${current.line}`}
        onClick={() => useDialogue.getState().advance()}
        style={{ ...bar, animation: "mqDlgIn 0.28s ease-out" }}
      >
        <div style={{ ...avatar, background: `linear-gradient(135deg, ${def.color}, ${def.color2})` }}>
          {def.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: def.color, marginBottom: 3 }}>
            {def.name}
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.5, color: "#f4f0e6" }}>{current.line}</div>
        </div>
        <div style={{ fontSize: 26, color: "#ffd98a", animation: "mqDlgNudge 1.2s ease-in-out infinite", flexShrink: 0 }}>
          ›
        </div>
      </div>
    </>
  );
}

// 半透明深色圆角卡：底部居中，避开各小游戏底部操作区（最低按钮顶到 ~110px）
const bar: CSSProperties = {
  position: "fixed",
  bottom: 122,
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(560px, calc(100vw - 32px))",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "12px 18px",
  borderRadius: 18,
  background: "rgba(8,10,26,0.82)",
  border: "1px solid rgba(255,217,138,0.35)",
  boxShadow: "0 10px 34px rgba(0,0,0,0.5)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  zIndex: 95,
};

// 头像：角色主题色渐变圆 + emoji，零图片资产
const avatar: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  flexShrink: 0,
  boxShadow: "0 0 14px rgba(255,217,138,0.35)",
};
