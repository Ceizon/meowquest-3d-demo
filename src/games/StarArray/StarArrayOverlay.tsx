import { useEffect, useState, type CSSProperties } from "react";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import ReflectionCard from "../../ui/ReflectionCard";

// 星阵记忆的 2D UI 层（位于 Canvas 外）
export default function StarArrayOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useGameFlow((s) => s.starPhase);
  const startStar = useGameFlow((s) => s.startStar);
  const progress = useGameFlow((s) => s.starProgress);
  const nback = useGameFlow((s) => s.nbackLevel);
  const starStage = useGameFlow((s) => s.starStage);
  const starRound = useGameFlow((s) => s.starRound);

  // 篝火谈心卡：相位进入 result 时展示一次，关闭后本局不再出现
  const [showReflection, setShowReflection] = useState(false);
  useEffect(() => {
    setShowReflection(phase === "result");
  }, [phase]);

  // 顶部副标题：intro 为两阶段说明；阶段 A 为 N-back 问句；阶段 B 按呈现/召回切换提示
  const subtitle =
    phase === "intro"
      ? "First, watch each star and tell me if it shone there before. Then, the stars dance in an order — repeat their dance!"
      : phase === "playing" && starStage === "sequence"
        ? starRound.round === 0
          ? "The stars are ready for a deeper dance..."
          : starRound.showing
            ? "Watch the order of the stars..."
            : "Now repeat it — tap the stars in the same order!"
        : nback === 1
          ? "Is this star the same as the one right before?"
          : `Is this star the same as the one ${nback} steps before?`;

  // 进度行：阶段 A 用作答进度；阶段 B（round≥1）展示轮次/位次进度
  const progressLine =
    phase === "playing" && starStage === "sequence"
      ? starRound.round >= 1
        ? `Round ${starRound.round} / ${starRound.total} · Star ${starRound.pos} / ${starRound.len}`
        : null
      : phase === "playing" && progress.total > 0
        ? `${Math.min(progress.index, progress.total)} / ${progress.total} · ${nback}-back`
        : null;

  const back = () => {
    soundManager.click();
    useGameFlow.getState().resetStar();
    setScreen("mountain");
  };

  return (
    <>
      <div style={{ position: "fixed", top: 64, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 60 }}>
        <div style={{ color: "#dfe8ff", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.06em" }}>Star Array · Spirit Tail Memory</div>
          <div style={{ fontSize: 16, marginTop: 6, opacity: 0.85, padding: "0 16px" }}>
            {subtitle}
          </div>
          {progressLine && (
            <div style={{ fontSize: 14, marginTop: 8, color: "#9fb4e8", letterSpacing: "0.12em" }}>
              {progressLine}
            </div>
          )}
        </div>
      </div>

      {/* Same/New 作答按钮条：仅阶段 A 显示 */}
      {phase === "playing" && starStage === "recall" && (
        <div style={answerBar}>
          <button
            style={{ ...answerBtn, borderColor: "rgba(140,190,255,0.85)", color: "#cfe2ff" }}
            onClick={() => { soundManager.click(); useGameFlow.getState().answerStar(true); }}
          >
            Same
          </button>
          <button
            style={{ ...answerBtn, borderColor: "rgba(255,205,140,0.85)", color: "#ffe6c0" }}
            onClick={() => { soundManager.click(); useGameFlow.getState().answerStar(false); }}
          >
            New
          </button>
        </div>
      )}

      {/* 阶段过渡卡：阶段 A 结束、阶段 B 首轮开始前居中展示 */}
      {phase === "playing" && starStage === "sequence" && starRound.round === 0 && (
        <div style={centerBox}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>The stars are ready for a deeper dance!</div>
            <div style={{ fontSize: 15, opacity: 0.85 }}>Watch their order, then repeat it with your paws.</div>
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div style={centerBox}>
          <button onClick={() => { soundManager.click(); startStar(); }} style={btnStyle}>Begin the Trial</button>
          <div>
            <button onClick={back} style={ghostBtn}>← Back to the Mountain</button>
          </div>
        </div>
      )}

      {/* 结算相位：先出篝火谈心卡，关闭/跳过后再显示结算卡（避免双卡中心重叠） */}
      {phase === "result" && !showReflection && (
        <div style={centerBox}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>A Flow Light is lit!</div>
            {/* 对儿童永远不出现分数——仅写入后台能量向量 */}
            <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 14 }}>
              The night sky recorded your journey. Meow writes it into the Observation Notes~
            </div>
            <button onClick={back} style={btnStyle}>Return to Meow Mountain</button>
          </div>
        </div>
      )}

      {phase === "result" && showReflection && (
        <ReflectionCard game="starArray" onClose={() => setShowReflection(false)} />
      )}
    </>
  );
}

const answerBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 40, display: "flex",
  justifyContent: "center", gap: 18, zIndex: 70,
};

const answerBtn: CSSProperties = {
  padding: "14px 30px", borderRadius: 999, background: "rgba(10,14,34,0.8)",
  fontSize: 16, fontWeight: 700, cursor: "pointer", border: "2px solid",
  backdropFilter: "blur(6px)",
};

const centerBox: CSSProperties = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", zIndex: 70, pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  background: "rgba(12,16,38,0.92)", border: "1px solid rgba(255,215,130,0.5)",
  borderRadius: 18, padding: "20px 30px", color: "#ffe9c0", textAlign: "center",
  minWidth: 260, pointerEvents: "auto", margin: 12,
};

const btnStyle: CSSProperties = {
  padding: "12px 34px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#ffd98a,#ffab5e)", color: "#4a3010",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 6px 24px rgba(255,180,90,0.35)", pointerEvents: "auto", margin: 6,
};

const ghostBtn: CSSProperties = {
  background: "rgba(10,14,34,0.65)", border: "1px solid rgba(255,255,255,0.4)", color: "#cfd8ff",
  fontSize: 14, padding: "8px 20px", borderRadius: 999, cursor: "pointer", pointerEvents: "auto", margin: 6,
};
