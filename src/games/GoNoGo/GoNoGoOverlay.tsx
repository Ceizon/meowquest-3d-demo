import { useEffect, useState, type CSSProperties } from "react";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import ReflectionCard from "../../ui/ReflectionCard";

// 萤火虫谷 Go/No-Go 的 2D UI 层（位于 Canvas 外）
// 抑制控制训练：对儿童永不出现分数/对错计数——正确抑制与命中同样值得庆祝
export default function GoNoGoOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useGameFlow((s) => s.goNoGoPhase);
  const startGoNoGo = useGameFlow((s) => s.startGoNoGo);
  const progress = useGameFlow((s) => s.goNoGoProgress);

  // 篝火谈心卡：相位进入 result 时展示一次，关闭后本局不再出现
  const [showReflection, setShowReflection] = useState(false);
  useEffect(() => {
    setShowReflection(phase === "result");
  }, [phase]);

  const back = () => {
    soundManager.click();
    useGameFlow.getState().resetGoNoGo();
    setScreen("mountain");
  };

  return (
    <>
      {phase === "playing" && (
        <>
          <div style={{ position: "fixed", top: 64, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 60 }}>
            <div style={{ color: "#e4dcff", textShadow: "0 2px 14px rgba(0,0,0,0.7)", padding: "0 16px" }}>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.06em" }}>Firefly Vale · Focus Play</div>
              <div style={{ fontSize: 15, marginTop: 6, opacity: 0.85 }}>
                Tap the golden ones. Let the blue shadows drift by.
              </div>
              {progress.total > 0 && (
                <div style={{ fontSize: 14, marginTop: 8, color: "#b3a4e8", letterSpacing: "0.12em" }}>
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
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>Firefly Vale</div>
            <div style={{ fontSize: 15, color: "#c4b0f0", marginBottom: 14, letterSpacing: "0.12em" }}>
              Go / No-Go · Focus Play
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.88, marginBottom: 18, textAlign: "left" }}>
              The night vale is full of little lights.
              <br /><br />
              <b style={{ color: "#ffd98a" }}>Tap the GOLDEN fireflies</b> — they love gentle taps.
              <br />
              <b style={{ color: "#7fa8ff" }}>Let the blue shadows drift by</b> — watching quietly is its own kind of magic.
              <br /><br />
              There is no losing here. Every firefly you meet makes the vale glow brighter.
            </div>
            <button onClick={() => { soundManager.click(); startGoNoGo(); }} style={btnStyle}>Enter the Vale</button>
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
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>The vale glows a little brighter now.</div>
            {/* 对儿童永远不出现分数——仅写入后台观察记录 */}
            <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 14 }}>
              Quick taps and quiet watching — both were beautiful. Meow wrote it into the Observation Notes~
            </div>
            <button onClick={back} style={btnStyle}>Return to the Mountain</button>
          </div>
        </div>
      )}

      {phase === "result" && showReflection && (
        <ReflectionCard game="goNoGo" onClose={() => setShowReflection(false)} />
      )}
    </>
  );
}

const centerBox: CSSProperties = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", zIndex: 70, pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  background: "rgba(14,12,34,0.94)", border: "1px solid rgba(201,160,255,0.45)",
  borderRadius: 18, padding: "22px 30px", color: "#e6defa", textAlign: "center",
  minWidth: 280, maxWidth: 460, pointerEvents: "auto", margin: 12,
  boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
};

const btnStyle: CSSProperties = {
  padding: "12px 34px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#d9b8ff,#9a7ee8)", color: "#221240",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 6px 24px rgba(180,140,255,0.3)", pointerEvents: "auto", margin: 6,
};

const ghostBtn: CSSProperties = {
  background: "rgba(14,12,34,0.65)", border: "1px solid rgba(255,255,255,0.4)", color: "#d4ccf0",
  fontSize: 14, padding: "8px 20px", borderRadius: 999, cursor: "pointer", pointerEvents: "auto", margin: 6,
};
