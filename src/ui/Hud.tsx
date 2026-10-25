import type { CSSProperties } from "react";
import { useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGameStore } from "../store/gameStore";
import { useConvoyStore } from "../store/convoy";
import { useGameFlow } from "../store/gameFlow";
import { soundManager } from "../lib/sounds";

// 帧循环驱动器：放在 Canvas 内，作为全局唯一的"持续请求渲染"来源。
// 主场景有 OrbitControls / 漂浮动画，本来每帧都会 invalidate；
// 但小游戏是事件驱动的——若某次渲染后所有组件都不再请求下一帧，
// 帧循环会停摆，useFrame 里的计时推进（如符形试炼的下一题倒计时）就再也不会执行。
export function FramePump() {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(({ clock }, delta) => {
    if (useGameStore.getState().screen === "convoy") {
      useConvoyStore.getState().tick(delta, clock.elapsedTime);
    }
    invalidate();
  });
  return null;
}

// 全局 HUD：心流之星计数（永不出现分数/排名）+ 返回按钮
export default function Hud() {
  const screen = useGameStore((s) => s.screen);
  const flowLights = useGameStore((s) => s.flowLights);
  const setScreen = useGameStore((s) => s.setScreen);
  const [muted, setMuted] = useState(soundManager.isMuted);

  // 离开小游戏时复位其会话状态，下次进入从引导页重新开始
  const backToMountain = () => {
    if (screen === "starArray") useGameFlow.getState().resetStar();
    if (screen === "glyphTrial") useGameFlow.getState().resetGlyph();
    // 漏 reset 会让相位停留 playing：场景已卸载、再进入时 overlay 卡在 playing UI 卡死
    if (screen === "breathing") useGameFlow.getState().resetBreath();
    if (screen === "goNoGo") useGameFlow.getState().resetGoNoGo();
    if (screen === "stepStones") useGameFlow.getState().resetStones();
    setScreen("mountain");
  };

  return (
    <>
      <div style={{ position: "absolute", top: 18, left: 22, display: "flex", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        <span style={{ color: "#ffe9b0", fontSize: 15, fontWeight: 600, letterSpacing: "0.1em", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          FLOW LIGHTS
        </span>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} style={{ fontSize: 18, filter: i < flowLights ? "drop-shadow(0 0 6px #ffd98a)" : "grayscale(1) opacity(0.35)" }}>
            ✦
          </span>
        ))}
      </div>

      {screen !== "home" && (
        <div style={{ position: "absolute", top: 14, right: 20, display: "flex", gap: 10 }}>
          {screen !== "mountain" && (
            <button style={topBtn} onClick={backToMountain}>← Mountain</button>
          )}
          <button
            style={topBtn}
            title={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted(soundManager.toggleMute())}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button style={topBtn} onClick={() => setScreen("parent")}>Parent Notes</button>
        </div>
      )}
      {screen === "mountain" && (
        <div style={{
          position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)",
          padding: "7px 14px", borderRadius: 999, color: "#dfe6ff",
          background: "rgba(10,14,34,0.55)", border: "1px solid rgba(159,180,232,0.24)",
          fontSize: 12, pointerEvents: "none", backdropFilter: "blur(6px)",
        }}>
          Arrow keys / WASD · Move Momo
        </div>
      )}
      {screen === "story1" && (
        <div style={{
          position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)",
          padding: "7px 14px", borderRadius: 999, color: "#fff0cf",
          background: "rgba(54,35,28,0.62)", border: "1px solid rgba(255,218,159,0.35)",
          fontSize: 12, pointerEvents: "none", backdropFilter: "blur(6px)",
        }}>
          Arrow keys / WASD · Explore the Cloud Pass
        </div>
      )}
    </>
  );
}

const topBtn: CSSProperties = {
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(10,14,34,0.65)",
  color: "#dfe6ff",
  fontSize: 14,
  cursor: "pointer",
  backdropFilter: "blur(6px)",
};
