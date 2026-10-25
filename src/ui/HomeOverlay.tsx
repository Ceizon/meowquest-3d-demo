import { useState } from "react";
import { useGameStore } from "../store/gameStore";
import { soundManager } from "../lib/sounds";

// 开场页：问题—理念—邀请（对应评分标准"问题意识"的开篇 30 秒）
export default function HomeOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const setCat = useGameStore((s) => s.setCat);
  const [muted, setMuted] = useState(soundManager.isMuted);

  const enter = () => {
    soundManager.unlock();
    soundManager.reward();
    setCat("happy", "Welcome to Meow Mountain! Drag to look around, click a glowing lantern to begin our adventure.");
    setScreen("mountain");
  };

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, rgba(11,16,38,0.25) 0%, rgba(6,8,22,0.88) 100%)",
    }}>
      <div style={{ textAlign: "center", maxWidth: 620, padding: 24 }}>
        <div style={{ color: "#9fb4e8", fontSize: 15, letterSpacing: "0.35em", fontWeight: 600 }}>
          MEOWQUEST · A SPIRIT CAT ADVENTURE
        </div>
        <h1 style={{
          margin: "14px 0 6px", fontSize: 52, fontWeight: 800, lineHeight: 1.15,
          background: "linear-gradient(120deg,#ffe9b0,#ff9d6c 55%,#9fb4ff)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Chronicle of the Divine Cat
        </h1>
        <p style={{ color: "#c9d4f2", fontSize: 18, margin: "4px 0 18px", fontWeight: 500 }}>
          A 3D companion world for children who learn and focus in their own way
        </p>
        <p style={{ color: "#8fa0c8", fontSize: 15, lineHeight: 1.7, margin: "0 0 30px" }}>
          Every child has their own rhythm of attention, and their own way of reading the world.
          Here, nothing is labeled and no one is scored. There is only a spirit cat,
          a misty mountain, and Flow Lights you light together.
        </p>
        <button onClick={enter} style={{
          padding: "16px 52px", borderRadius: 999, border: "none", fontSize: 19, fontWeight: 700,
          background: "linear-gradient(135deg,#ffd98a,#ff9d6c)", color: "#42280c", cursor: "pointer",
          boxShadow: "0 10px 40px rgba(255,160,90,0.4)", letterSpacing: "0.04em",
        }}>
          Begin the Adventure
        </button>
        <button
          onClick={() => {
            soundManager.unlock();
            setMuted(soundManager.toggleMute());
          }}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          style={{
            display: "block", margin: "18px auto 0", padding: "8px 18px",
            borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(10,14,34,0.55)", color: "#dfe6ff", cursor: "pointer",
          }}
        >
          {muted ? "🔇 Sound off · Turn on" : "🔊 Sound on"}
        </button>
        <button
          onClick={() => setScreen("validation")}
          style={{
            display: "block", margin: "12px auto 0", padding: "7px 16px",
            borderRadius: 999, border: "1px solid rgba(159,180,232,0.35)",
            background: "rgba(159,180,232,0.08)", color: "#cfd8ff", cursor: "pointer",
            fontSize: 12.5,
          }}
        >
          Research & validation status
        </button>
      </div>
    </div>
  );
}
