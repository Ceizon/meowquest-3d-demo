import { useEffect, useState, type CSSProperties } from "react";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import ReflectionCard from "../../ui/ReflectionCard";

// 低语湖畔·呼吸正念的 2D UI 层（位于 Canvas 外）
// 情绪调节场景：没有任何成败反馈——没有分数、没有"答错"、没有催促
const PHASE_LABEL = { inhale: "Breathe in...", hold: "Hold...", exhale: "Breathe out..." } as const;

export default function BreathingOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useGameFlow((s) => s.breathPhase);
  const startBreath = useGameFlow((s) => s.startBreath);
  const info = useGameFlow((s) => s.breathInfo);

  // 篝火谈心卡：相位进入 result 时展示一次，关闭后本局不再出现
  const [showReflection, setShowReflection] = useState(false);
  useEffect(() => {
    setShowReflection(phase === "result");
  }, [phase]);

  const back = () => {
    soundManager.click();
    useGameFlow.getState().resetBreath();
    setScreen("mountain");
  };

  return (
    <>
      {phase === "playing" && (
        <>
          {/* 顶部相位提示：大字号、秒数、轮次（节奏提示而非倒计时压力） */}
          <div style={{ position: "fixed", top: 64, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 60 }}>
            <div style={{ color: "#cfe8e4", textShadow: "0 2px 14px rgba(0,0,0,0.7)", padding: "0 16px" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.08em" }}>{PHASE_LABEL[info.phase]}</div>
              <div style={{ fontSize: 34, fontWeight: 300, marginTop: 4, color: "#eafffa", fontVariantNumeric: "tabular-nums" }}>
                {info.secondsLeft}
              </div>
              <div style={{ fontSize: 14, marginTop: 8, color: "#8fb8c4", letterSpacing: "0.16em" }}>
                Breath {info.round} / {info.total}
              </div>
            </div>
          </div>
          <div style={{ position: "fixed", bottom: 36, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 70 }}>
            <button onClick={back} style={ghostBtn}>← Back to the Mountain</button>
          </div>
        </>
      )}

      {phase === "intro" && (
        <div style={centerBox}>
          <div style={cardStyle}>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>Whispering Lake</div>
            <div style={{ fontSize: 15, color: "#9fd8d0", marginBottom: 14, letterSpacing: "0.12em" }}>
              Calm Breathing · Emotional Reset
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.88, marginBottom: 18, textAlign: "left" }}>
              When feelings feel big or buzzy, the lake knows a secret: slow breaths make them softer.
              <br /><br />
              Follow the glowing light — breathe in as it grows, hold as it shimmers, breathe out as it melts away.
              There is no winning or losing here. Just you, the lake, and three gentle breaths.
            </div>
            <button onClick={() => { soundManager.click(); startBreath(); }} style={btnStyle}>Sit by the Lake</button>
            <div>
              <button onClick={back} style={ghostBtn}>← Back to the Mountain</button>
            </div>
          </div>
        </div>
      )}

      {/* 结算相位：先出篝火谈心卡，关闭/跳过后再显示结算卡（避免双卡中心重叠） */}
      {phase === "result" && !showReflection && (
        <div style={centerBox}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>The lake is still and calm — and so are you.</div>
            <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 14 }}>
              Three gentle breaths, all yours. Whenever the world feels loud, you can come back to this quiet.
            </div>
            <button onClick={back} style={btnStyle}>Return to the Mountain</button>
          </div>
        </div>
      )}

      {phase === "result" && showReflection && (
        <ReflectionCard game="breathing" onClose={() => setShowReflection(false)} />
      )}
    </>
  );
}

const centerBox: CSSProperties = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", zIndex: 70, pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  background: "rgba(8,18,26,0.94)", border: "1px solid rgba(140,220,208,0.45)",
  borderRadius: 18, padding: "22px 30px", color: "#d8f0ec", textAlign: "center",
  minWidth: 280, maxWidth: 460, pointerEvents: "auto", margin: 12,
  boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
};

const btnStyle: CSSProperties = {
  padding: "12px 34px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#8fe0d0,#5fb4d8)", color: "#0a2830",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 6px 24px rgba(120,220,205,0.3)", pointerEvents: "auto", margin: 6,
};

const ghostBtn: CSSProperties = {
  background: "rgba(8,18,26,0.65)", border: "1px solid rgba(255,255,255,0.4)", color: "#cfe0e8",
  fontSize: 14, padding: "8px 20px", borderRadius: 999, cursor: "pointer", pointerEvents: "auto", margin: 6,
};
