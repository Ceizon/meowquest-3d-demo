import type { CSSProperties } from "react";
import { useGameStore } from "../store/gameStore";

const evidenceRows = [
  {
    label: "Theory grounding",
    status: "Designed with reference to attention, working-memory, inhibition-control and breathing practices.",
    tone: "#ffd98a",
  },
  {
    label: "Prototype validation",
    status: "Core flows, scene transitions, daily challenges, audio fallback and local data controls have been checked in the demo.",
    tone: "#9fb4e8",
  },
  {
    label: "Real-user evidence",
    status: "Not yet collected. This prototype does not claim proven long-term effectiveness.",
    tone: "#ffb08f",
  },
];

export default function ValidationPanel() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div style={page}>
      <div style={card}>
        <div style={header}>
          <div>
            <div style={eyebrow}>RESEARCH TRANSPARENCY</div>
            <h2 style={title}>What has been validated?</h2>
          </div>
          <button onClick={() => setScreen("home")} style={closeButton}>Close</button>
        </div>

        <p style={intro}>
          MeowQuest is currently a working product demo. We show what has been built and tested,
          while keeping a clear boundary around what still needs real-world study.
        </p>

        <div style={rows}>
          {evidenceRows.map((row) => (
            <div key={row.label} style={rowStyle}>
              <span style={{ ...dot, background: row.tone, boxShadow: `0 0 12px ${row.tone}` }} />
              <div>
                <div style={rowLabel}>{row.label}</div>
                <div style={rowText}>{row.status}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={nextCard}>
          <div style={nextEyebrow}>NEXT VALIDATION STEP</div>
          <div style={nextTitle}>Small, consent-based usability study</div>
          <div style={nextText}>
            Invite a small group of families, with guardian consent for children, and measure
            whether the experience is understandable, comfortable and worth returning to.
            Collect only the minimum de-identified data needed for iteration.
          </div>
          <div style={chipRow}>
            <span style={chip}>Completion and drop-off</span>
            <span style={chip}>Ease-of-use feedback</span>
            <span style={chip}>Repeat-use interest</span>
            <span style={chip}>Parent interview notes</span>
          </div>
        </div>

        <div style={footer}>
          <strong>Honest claim:</strong> theory-informed design and a tested prototype;
          real-world effectiveness remains an open research question.
        </div>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, background: "rgba(8,10,24,0.9)", backdropFilter: "blur(10px)", zIndex: 120,
};
const card: CSSProperties = {
  width: 620, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto",
  padding: "30px 34px", borderRadius: 24, color: "#fff",
  background: "linear-gradient(160deg,#202946,#141a30)",
  border: "1px solid rgba(255,220,150,0.25)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
};
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 };
const eyebrow: CSSProperties = { color: "#9fb4e8", fontSize: 11, letterSpacing: "0.16em", fontWeight: 700 };
const title: CSSProperties = { margin: "8px 0 0", color: "#ffe9c0", fontSize: 27 };
const closeButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#cfd8ff",
  borderRadius: 999, padding: "6px 16px", cursor: "pointer", fontSize: 13,
};
const intro: CSSProperties = { color: "#b9c4e4", fontSize: 14, lineHeight: 1.7, margin: "18px 0 20px" };
const rows: CSSProperties = { display: "grid", gap: 10 };
const rowStyle: CSSProperties = {
  display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 14px", borderRadius: 14,
  background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)",
};
const dot: CSSProperties = { width: 9, height: 9, borderRadius: 999, marginTop: 5, flexShrink: 0 };
const rowLabel: CSSProperties = { color: "#f3e7c9", fontWeight: 700, fontSize: 14 };
const rowText: CSSProperties = { color: "#aeb9d9", fontSize: 13, lineHeight: 1.55, marginTop: 3 };
const nextCard: CSSProperties = {
  marginTop: 18, padding: "17px 18px", borderRadius: 16,
  background: "rgba(127,174,95,0.1)", border: "1px solid rgba(127,174,95,0.28)",
};
const nextEyebrow: CSSProperties = { color: "#b9d8a0", fontSize: 11, letterSpacing: "0.12em", fontWeight: 700 };
const nextTitle: CSSProperties = { color: "#e8f2cf", fontSize: 16, fontWeight: 700, marginTop: 7 };
const nextText: CSSProperties = { color: "#c2d1b0", fontSize: 13, lineHeight: 1.65, marginTop: 6 };
const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 };
const chip: CSSProperties = {
  padding: "5px 9px", borderRadius: 999, color: "#d6e5c2", fontSize: 11.5,
  background: "rgba(127,174,95,0.16)", border: "1px solid rgba(185,216,160,0.22)",
};
const footer: CSSProperties = {
  marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)",
  color: "#9aa8cc", fontSize: 12.5, lineHeight: 1.65,
};
