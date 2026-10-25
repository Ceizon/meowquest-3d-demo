import { useEffect, useState } from "react";
import { ACHIEVEMENTS, useAchievements } from "../store/achievements";
import { useGameStore } from "../store/gameStore";
import { soundManager } from "../lib/sounds";

// 成就解锁提示：2D overlay，挂在 App 最外层，所有屏可见。
// 顶部居中滑入卡片，3.5s 自动滑出并出队，队列有下一个接着播。
// 项目无动画库：用 inline style + 挂载状态驱动 CSS transition。
// pointerEvents: none —— 永不遮挡游戏操作。
const SHOW_MS = 3500;
const SLIDE_MS = 320;

// 云桥 HUD 与成就卡都占据顶部中间/左侧，合龙时改为右侧提示，避免互相遮挡
const RIGHT_SIDE_SCREENS = new Set(["convoy"]);

export default function AchievementToast() {
  const currentId = useAchievements((s) => s.queue[0]);
  const dismiss = useAchievements((s) => s.dismiss);
  const rightSide = useGameStore((s) => RIGHT_SIDE_SCREENS.has(s.screen));
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!currentId) return;
    soundManager.reward(); // 每张新卡片出现时播一次奖励音
    // 下一帧再置为可见，确保从"屏外"状态触发滑入过渡
    const raf = requestAnimationFrame(() => setShown(true));
    const hideTimer = window.setTimeout(() => setShown(false), SHOW_MS);
    const outTimer = window.setTimeout(() => {
      dismiss();
      setShown(false);
    }, SHOW_MS + SLIDE_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hideTimer);
      window.clearTimeout(outTimer);
    };
  }, [currentId, dismiss]);

  if (!currentId) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === currentId);
  if (!def) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: rightSide ? "flex-end" : "center",
        paddingRight: rightSide ? 24 : 0,
        zIndex: 200,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: rightSide ? 320 : undefined,
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 26px",
          borderRadius: 18,
          background: "rgba(24,18,8,0.94)",
          border: "1.5px solid rgba(255,215,130,0.65)",
          boxShadow: "0 10px 34px rgba(0,0,0,0.55), 0 0 24px rgba(255,200,110,0.18)",
          color: "#ffe9c0",
          transform: shown ? "translateY(0)" : "translateY(-140%)",
          opacity: shown ? 1 : 0,
          transition: `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out`,
        }}
      >
        <span
          style={{
            fontSize: 34,
            color: "#ffd98a",
            filter: "drop-shadow(0 0 8px rgba(255,217,138,0.7))",
            lineHeight: 1,
          }}
        >
          {def.icon}
        </span>
        <span>
          <span style={{ display: "block", fontSize: 12, letterSpacing: "0.18em", color: "#e8c690", fontWeight: 700 }}>
            ACHIEVEMENT UNLOCKED
          </span>
          <span style={{ display: "block", fontSize: 19, fontWeight: 700, marginTop: 2 }}>{def.title}</span>
          <span style={{ display: "block", fontSize: 13, opacity: 0.85, marginTop: 3, maxWidth: 340 }}>{def.description}</span>
        </span>
      </div>
    </div>
  );
}
