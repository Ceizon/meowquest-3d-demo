import type { CSSProperties } from "react";
import { useAIConsent } from "../store/aiConsent";

export default function AIConsentDialog() {
  const promptOpen = useAIConsent((s) => s.promptOpen);
  const resolveConsent = useAIConsent((s) => s.resolveConsent);
  if (!promptOpen) return null;

  return (
    <div style={backdrop} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        style={card}
      >
        <h2 id="ai-consent-title" style={{ margin: "0 0 12px", fontSize: 21 }}>
          Parent/guardian choice: AI features share data externally
        </h2>
        <p style={copy}>
          If you allow it, Cog chat and AI Observation Notes send your typed message
          and a summary of play to the ECNU AI service at chat.ecnu.edu.cn. This may
          include game types, accuracy, response times, trial counts, Flow Lights,
          daily chapter progress, and current game difficulty. Cog chat summaries can
          use up to two recent rounds per game, which may include earlier days, plus
          locally computed play labels. AI voice may also send dialogue text and
          voice settings to that service.
        </p>
        <p style={copy}>
          Your name is not included by this app. Play data is otherwise kept in this
          browser. Choosing “Not now” keeps chat and AI notes on their local fallback;
          a parent or guardian can change this choice later in Parent Notes. The
          service’s own retention practices are outside this app’s control. This
          demo’s API key is configured in the browser, so it must not be used as a
          secret in a public deployment; production should use a secured server proxy.
        </p>
        <div style={actions}>
          <button style={secondaryButton} onClick={() => resolveConsent(false)}>
            Not now
          </button>
          <button style={primaryButton} onClick={() => resolveConsent(true)}>
            Allow AI features
          </button>
        </div>
      </section>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 300,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(4,6,18,0.82)",
  backdropFilter: "blur(8px)",
};

const card: CSSProperties = {
  width: "min(560px, 100%)",
  padding: "24px 26px",
  borderRadius: 20,
  color: "#f1eddf",
  background: "linear-gradient(160deg,#1d2440,#141a30)",
  border: "1px solid rgba(255,220,150,0.35)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
};

const copy: CSSProperties = {
  color: "#c5cce0",
  fontSize: 14,
  lineHeight: 1.65,
};

const actions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 20,
};

const secondaryButton: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.3)",
  background: "transparent",
  color: "#dfe6ff",
  cursor: "pointer",
};

const primaryButton: CSSProperties = {
  ...secondaryButton,
  border: "none",
  background: "linear-gradient(135deg,#ffd98a,#ffab5e)",
  color: "#4a3010",
  fontWeight: 700,
};
