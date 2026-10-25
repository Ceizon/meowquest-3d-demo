import { useState } from "react";
import type { CSSProperties } from "react";
import { COMPANION_DIALOGUES, type GameTask } from "../data/companions";
import { COMPANIONS } from "../lib/voiceCast";
import { speakLine } from "../lib/aiSpeech";
import { soundManager } from "../lib/sounds";

// 篝火谈心卡（结算页 2D overlay）：一个问题 + 3 个表情选项；
// 选择后显示伙伴回应句并朗读，未选择时可跳过。

interface Props {
  game: GameTask;
  onClose: () => void;
}

export default function ReflectionCard({ game, onClose }: Props) {
  const refl = COMPANION_DIALOGUES.reflection[game];
  const [picked, setPicked] = useState<number | null>(null);
  const reply = picked === null ? null : refl.options[picked].reply;
  const replyDef = reply ? COMPANIONS[reply.speaker] : null;

  const choose = (i: number) => {
    soundManager.click();
    setPicked(i);
    const r = refl.options[i].reply;
    speakLine(r.speaker, r.line);
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.18em", color: "#ffb36b", marginBottom: 10 }}>
          🔥 CAMPFIRE HEART-TO-HEART
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 18 }}>
          {refl.question}
        </div>

        {picked === null ? (
          <>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {refl.options.map((o, i) => (
                <button key={o.label} onClick={() => choose(i)} style={optionBtn}>
                  <span style={{ fontSize: 30, lineHeight: 1 }}>{o.emoji}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.35, opacity: 0.9 }}>{o.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { soundManager.click(); onClose(); }} style={ghostBtn}>
              Not now
            </button>
          </>
        ) : (
          <>
            <div style={replyBox}>
              <div style={{ ...miniAvatar, background: `linear-gradient(135deg, ${replyDef!.color}, ${replyDef!.color2})` }}>
                {replyDef!.emoji}
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", color: replyDef!.color, marginBottom: 3 }}>
                  {replyDef!.name}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: "#f4f0e6" }}>{reply!.line}</div>
              </div>
            </div>
            <button onClick={() => { soundManager.click(); onClose(); }} style={btnStyle}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 80,
  pointerEvents: "none",
};

const card: CSSProperties = {
  background: "rgba(16,12,6,0.94)",
  border: "1px solid rgba(255,179,107,0.5)",
  borderRadius: 20,
  padding: "22px 26px",
  color: "#ffe9c0",
  textAlign: "center",
  width: "min(480px, calc(100vw - 32px))",
  pointerEvents: "auto",
  margin: 12,
  boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 0 30px rgba(255,150,60,0.06)",
};

const optionBtn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  width: 128,
  padding: "14px 10px",
  borderRadius: 16,
  border: "1.5px solid rgba(255,217,138,0.4)",
  background: "rgba(38,26,12,0.7)",
  color: "#ffe9c0",
  cursor: "pointer",
};

const replyBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(38,26,12,0.7)",
  border: "1px solid rgba(255,217,138,0.35)",
  marginBottom: 16,
};

const miniAvatar: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
  flexShrink: 0,
};

const btnStyle: CSSProperties = {
  padding: "10px 30px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg,#ffd98a,#ffab5e)",
  color: "#4a3010",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 6px 24px rgba(255,180,90,0.35)",
  margin: 4,
};

const ghostBtn: CSSProperties = {
  marginTop: 14,
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.35)",
  color: "#e8dcc0",
  fontSize: 13,
  padding: "7px 20px",
  borderRadius: 999,
  cursor: "pointer",
};
