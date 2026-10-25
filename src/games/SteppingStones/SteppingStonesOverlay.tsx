import { useEffect, useState, type CSSProperties } from "react";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import ReflectionCard from "../../ui/ReflectionCard";

// 溪光石阶的 2D UI 层（位于 Canvas 外）
// 加工速度 + 持续注意训练：对儿童永不出现分数/对错计数——每一次追逐闪光都值得庆祝
export default function SteppingStonesOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useGameFlow((s) => s.stonesPhase);
  const startStones = useGameFlow((s) => s.startStones);
  const progress = useGameFlow((s) => s.stonesProgress);

  // 篝火谈心卡：相位进入 result 时展示一次，关闭后本局不再出现
  const [showReflection, setShowReflection] = useState(false);
  useEffect(() => {
    setShowReflection(phase === "result");
  }, [phase]);

  const back = () => {
    soundManager.click();
    useGameFlow.getState().resetStones();
    setScreen("mountain");
  };

  return (
    <>
      {phase === "playing" && (
        <>
          <div style={{ position: "fixed", top: 64, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 60 }}>
            <div style={{ color: "#d8f4ec", textShadow: "0 2px 14px rgba(0,0,0,0.7)", padding: "0 16px" }}>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.06em" }}>Stepping Stones · Speed & Focus</div>
              <div style={{ fontSize: 15, marginTop: 6, opacity: 0.85 }}>
                Tap the stone that glows gold — quick as a skipping pebble.
              </div>
              {progress.total > 0 && (
                <div style={{ fontSize: 14, marginTop: 8, color: "#8fd8c8", letterSpacing: "0.12em" }}>
                  {Math.min(progress.index, progress.total)} / {progress.total}
                </div>
              )}
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
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>Stepping Stones</div>
            <div style={{ fontSize: 15, color: "#8fd8c8", marginBottom: 14, letterSpacing: "0.12em" }}>
              Brooklight Steps · Speed & Focus
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.88, marginBottom: 18, textAlign: "left" }}>
              The night stream is full of sleepy stones.
              <br /><br />
              <b style={{ color: "#ffd98a" }}>When a stone glows GOLD, tap it as quick as you can</b> — then the next one wakes up.
              <br />
              If a sparkle drifts away, no worries — <b style={{ color: "#8fd8c8" }}>the stream always sends another.</b>
              <br /><br />
              There is no losing here. Every step makes the brook glow brighter.
            </div>
            <button onClick={() => { soundManager.click(); startStones(); }} style={btnStyle}>Step onto the Stones</button>
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
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>The brook keeps every sparkle you gave it.</div>
            {/* 对儿童永远不出现分数——仅写入后台观察记录 */}
            <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 14 }}>
              Quick paws and watchful eyes — the stream remembers. Meow wrote it into the Observation Notes~
            </div>
            <button onClick={back} style={btnStyle}>Return to the Mountain</button>
          </div>
        </div>
      )}

      {phase === "result" && showReflection && (
        <ReflectionCard game="stepStones" onClose={() => setShowReflection(false)} />
      )}
    </>
  );
}

const centerBox: CSSProperties = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", zIndex: 70, pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  background: "rgba(10,22,30,0.94)", border: "1px solid rgba(127,216,200,0.45)",
  borderRadius: 18, padding: "22px 30px", color: "#dcf2ea", textAlign: "center",
  minWidth: 280, maxWidth: 460, pointerEvents: "auto", margin: 12,
  boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
};

const btnStyle: CSSProperties = {
  padding: "12px 34px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#a8ecdc,#5fb8a6)", color: "#0e2e28",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 6px 24px rgba(127,216,200,0.3)", pointerEvents: "auto", margin: 6,
};

const ghostBtn: CSSProperties = {
  background: "rgba(10,22,30,0.65)", border: "1px solid rgba(255,255,255,0.4)", color: "#c8e8de",
  fontSize: 14, padding: "8px 20px", borderRadius: 999, cursor: "pointer", pointerEvents: "auto", margin: 6,
};
