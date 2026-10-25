import { useEffect, useState, type CSSProperties } from "react";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import ReflectionCard from "../../ui/ReflectionCard";

// 符形试炼的 2D UI 层（位于 Canvas 外）
export default function GlyphTrialOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useGameFlow((s) => s.glyphPhase);
  const startGlyph = useGameFlow((s) => s.startGlyph);
  const options = useGameFlow((s) => s.glyphOptions);
  const pickGlyph = useGameFlow((s) => s.pickGlyph);
  const progress = useGameFlow((s) => s.glyphProgress);

  // 篝火谈心卡：相位进入 result 时展示一次，关闭后本局不再出现
  const [showReflection, setShowReflection] = useState(false);
  useEffect(() => {
    setShowReflection(phase === "result");
  }, [phase]);

  const back = () => {
    soundManager.click();
    useGameFlow.getState().resetGlyph();
    setScreen("mountain");
  };

  return (
    <>
      <div style={{ position: "fixed", top: 64, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 60 }}>
        <div style={{ color: "#ffe9c0", textShadow: "0 2px 12px rgba(0,0,0,0.7)", padding: "0 16px" }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.06em" }}>Ancient Library · Glyph Trial</div>
          <div style={{ fontSize: 15, marginTop: 6, opacity: 0.85 }}>
            Listen to Meow, then touch the glyph with the right strokes.
          </div>
          {phase === "playing" && progress.total > 0 && (
            <div style={{ fontSize: 14, marginTop: 8, color: "#e8c690", letterSpacing: "0.12em" }}>
              {Math.min(progress.index + 1, progress.total)} / {progress.total}
            </div>
          )}
        </div>
      </div>

      {phase === "playing" && (
        <div style={glyphBar}>
          {options.map((o, i) => (
            <button
              key={`${o.char}-${i}`}
              disabled={o.vanish}
              onClick={() => { soundManager.click(); pickGlyph(i); }}
              style={{
                ...glyphBtn,
                opacity: o.vanish ? 0.25 : 1,
                transform: o.vanish ? "scale(0.9)" : "none",
              }}
            >
              {o.char}
            </button>
          ))}
        </div>
      )}

      {phase === "intro" && (
        <div style={centerBox}>
          <button onClick={() => { soundManager.click(); startGlyph(); }} style={btnStyle}>Enter the Library</button>
          <div>
            <button onClick={back} style={ghostBtn}>← Back to the Mountain</button>
          </div>
        </div>
      )}

      {/* 结算相位：先出篝火谈心卡，关闭/跳过后再显示结算卡（避免双卡中心重叠） */}
      {phase === "result" && !showReflection && (
        <div style={centerBox}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>The Library glows with Flow Light!</div>
            <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 14 }}>
              Meow noted how you found each true glyph — into the Observation Notes.
            </div>
            <button onClick={back} style={btnStyle}>Return to Meow Mountain</button>
          </div>
        </div>
      )}

      {phase === "result" && showReflection && (
        <ReflectionCard game="glyphTrial" onClose={() => setShowReflection(false)} />
      )}
    </>
  );
}

const glyphBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 36, display: "flex",
  justifyContent: "center", gap: 14, zIndex: 70, padding: "0 16px",
};

const glyphBtn: CSSProperties = {
  width: 74, height: 74, borderRadius: 22,
  background: "rgba(38,26,12,0.86)", border: "1.5px solid rgba(255,205,130,0.6)",
  color: "#fff3dc", fontSize: 38, fontWeight: 600, cursor: "pointer",
  fontFamily: '"Noto Sans SC", system-ui, sans-serif',
  boxShadow: "0 8px 22px rgba(0,0,0,0.45), inset 0 0 18px rgba(255,190,110,0.12)",
  transition: "opacity .3s ease, transform .3s ease",
};

const centerBox: CSSProperties = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", zIndex: 70, pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  background: "rgba(26,18,8,0.94)", border: "1px solid rgba(255,215,130,0.55)",
  borderRadius: 18, padding: "20px 30px", color: "#ffe9c0", textAlign: "center",
  minWidth: 270, pointerEvents: "auto", margin: 12,
};

const btnStyle: CSSProperties = {
  padding: "12px 34px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#ffd98a,#ffab5e)", color: "#4a3010",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 6px 24px rgba(255,180,90,0.35)", pointerEvents: "auto", margin: 6,
};

const ghostBtn: CSSProperties = {
  background: "rgba(30,20,8,0.65)", border: "1px solid rgba(255,255,255,0.4)", color: "#e8dcc0",
  fontSize: 14, padding: "8px 20px", borderRadius: 999, cursor: "pointer", pointerEvents: "auto", margin: 6,
};
