import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuest } from "../store/quest";

// 每日冒险篇章卡（2D 层）：mountain 屏左侧羊皮纸卡片，列出当日 3 章与完成状态。
// 篇章只是温柔引导，灯笼自由探索不受影响。
// 三章全完成 → 山巅庆典：2.5s 全屏金光粒子（纯 CSS 2D 动画）+ 贺词，每次会话只展示一次。
const CELEBRATION_MS = 2500;

// 会话级标记（模块变量）：庆典本次会话展示过后，重新挂载面板也不再重播
let celebrationShownThisSession = false;

// 金光粒子/贺词的关键帧（项目无动画库，注入一次样式即可，纯离线）
const QUEST_CSS = `
@keyframes mqQuestRise {
  0%   { transform: translateY(10vh) translateX(0) scale(0.5); opacity: 0; }
  16%  { opacity: 1; }
  100% { transform: translateY(-82vh) translateX(var(--mqDrift, 0px)) scale(1.05); opacity: 0; }
}
@keyframes mqQuestVeil {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  72%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes mqQuestBless {
  0%   { transform: scale(0.72); opacity: 0; }
  26%  { transform: scale(1.06); opacity: 1; }
  46%  { transform: scale(1); }
  78%  { opacity: 1; }
  100% { opacity: 0; }
}
`;

export default function QuestPanel() {
  const steps = useQuest((s) => s.steps);
  const celebrated = useQuest((s) => s.celebrated);
  const [collapsed, setCollapsed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // 庆典触发：celebrated 且本次会话未展示过（回到 mountain 屏时面板挂载后播放）
  useEffect(() => {
    if (!celebrated || celebrationShownThisSession) return;
    celebrationShownThisSession = true;
    setCelebrating(true);
    const t = window.setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [celebrated]);

  // 金光粒子：触发时随机布点一次（仅装饰，无需种子恒定）
  const particles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 5 + Math.random() * 9,
        delay: Math.random() * 0.9,
        dur: 1.4 + Math.random() * 1.0,
        drift: (Math.random() - 0.5) * 130,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [celebrating]
  );

  return (
    <>
      <style>{QUEST_CSS}</style>
      {collapsed ? (
        <button style={collapsedTab} onClick={() => setCollapsed(false)}>
          ✦ Today's Adventure
        </button>
      ) : (
        <div style={panel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.16em", color: "#6d4a17" }}>
              TODAY'S ADVENTURE
            </span>
            <button style={foldBtn} title="Fold" onClick={() => setCollapsed(true)}>
              −
            </button>
          </div>
          {steps.map((st) => (
            <div key={st.game} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", opacity: st.done ? 1 : 0.62 }}>
              <span style={dot(st.done)} />
              <span
                style={{
                  flex: 1,
                  fontSize: 13.5,
                  fontWeight: st.done ? 700 : 500,
                  color: st.done ? "#8a5410" : "#5d4a26",
                  textShadow: st.done ? "0 0 8px rgba(255,200,110,0.55)" : "none",
                }}
              >
                {st.title}
              </span>
              <span style={{ fontSize: 10.5, color: "#8a6b39", whiteSpace: "nowrap" }}>{st.theme}</span>
              {st.done && <span style={{ color: "#c9861b", fontWeight: 800, fontSize: 14 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
      {celebrating && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, pointerEvents: "none", overflow: "hidden" }}>
          {/* 金色帷幕：柔和径向光晕淡入淡出 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 50% 42%, rgba(255,214,120,0.4), rgba(255,190,90,0.16) 46%, rgba(0,0,0,0) 74%)",
              animation: `mqQuestVeil ${CELEBRATION_MS}ms ease-out forwards`,
            }}
          />
          {particles.map((p) => (
            <span
              key={p.id}
              style={
                {
                  position: "absolute",
                  left: `${p.left}%`,
                  bottom: "-4vh",
                  width: p.size,
                  height: p.size,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #fff6d8, #ffd98a 55%, rgba(255,179,71,0.9))",
                  boxShadow: "0 0 12px rgba(255,214,130,0.9)",
                  opacity: 0,
                  "--mqDrift": `${p.drift}px`,
                  animation: `mqQuestRise ${p.dur}s ease-out ${p.delay}s forwards`,
                } as CSSProperties
              }
            />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: "#ffe9b0",
                textShadow: "0 0 18px rgba(255,200,100,0.9), 0 2px 10px rgba(0,0,0,0.5)",
                animation: `mqQuestBless ${CELEBRATION_MS}ms ease-out forwards`,
              }}
            >
              The whole mountain glows for you!
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// 羊皮纸篇章卡：半透明暖米色 + 深褐描边 + 内晕，与灯笼暖光同系
const panel: CSSProperties = {
  position: "absolute",
  top: 58,
  left: 22,
  width: 250,
  padding: "12px 16px 10px",
  borderRadius: 14,
  background: "linear-gradient(160deg, rgba(247,232,196,0.88), rgba(226,200,148,0.8))",
  border: "1.5px solid rgba(122,84,34,0.5)",
  boxShadow: "0 8px 26px rgba(0,0,0,0.4), inset 0 0 22px rgba(122,84,34,0.16)",
  backdropFilter: "blur(5px)",
  zIndex: 30,
};

const collapsedTab: CSSProperties = {
  position: "absolute",
  top: 58,
  left: 22,
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid rgba(122,84,34,0.5)",
  background: "linear-gradient(160deg, rgba(247,232,196,0.85), rgba(226,200,148,0.78))",
  color: "#6d4a17",
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
  backdropFilter: "blur(5px)",
  zIndex: 30,
};

const foldBtn: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  border: "1px solid rgba(122,84,34,0.4)",
  background: "rgba(255,246,222,0.6)",
  color: "#6d4a17",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
};

// 灯笼色圆点（#ffb347 系）：完成=金色点亮发光，未完成=暗色
function dot(done: boolean): CSSProperties {
  return {
    width: 13,
    height: 13,
    borderRadius: "50%",
    flexShrink: 0,
    background: done
      ? "radial-gradient(circle at 35% 30%, #fff3c9, #ffb347 60%, #d97a1b)"
      : "radial-gradient(circle at 35% 30%, #b39b74, #8a744e)",
    boxShadow: done ? "0 0 10px rgba(255,179,71,0.9)" : "none",
  };
}
