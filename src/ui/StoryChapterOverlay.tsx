import { useConvoyStore } from "../store/convoy";
import { useGameStore } from "../store/gameStore";

export default function StoryChapterOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const stonesFilled = useConvoyStore((s) => s.stonesFilled);
  const isComplete = useConvoyStore((s) => s.isComplete);
  const phase = useConvoyStore((s) => s.phase);
  const hasProgress = stonesFilled > 0 || phase !== "intro";

  return (
    <div className="mq-story-chapter">
      <style>{storyStyles}</style>
      <section className="mq-story-chapter-card" aria-labelledby="mq-story-chapter-title">
        <div className="mq-story-chapter-eyebrow">MAINLINE · CHAPTER I</div>
        <h1 id="mq-story-chapter-title">The Cloud Bridge</h1>
        {isComplete ? (
          <>
            <p>The cloud bridge is whole again. Momo will remember the day you mended it together.</p>
            <div className="mq-story-chapter-keepsake">A bridge held by friendship</div>
          </>
        ) : (
          <>
            <p>A mountain wind broke the old cloud bridge. Help Momo carry stones and mend the way across.</p>
            {hasProgress && <p className="mq-story-chapter-status">Every placed stone is waiting for you.</p>}
          </>
        )}
        <button type="button" onClick={() => setScreen("convoy")}>
          {isComplete ? "Visit the cloud bridge" : hasProgress ? "Continue mending" : "Begin the cloud bridge"}
        </button>
      </section>
    </div>
  );
}

const storyStyles = `
  .mq-story-chapter { position: absolute; inset: 0; pointer-events: none; color: #563a2a; font-family: inherit; }
  .mq-story-chapter *, .mq-story-chapter *::before, .mq-story-chapter *::after { box-sizing: border-box; }
  .mq-story-chapter h1, .mq-story-chapter p { margin: 0; }
  .mq-story-chapter-card {
    position: absolute;
    left: 24px;
    top: 76px;
    width: min(380px, calc(100% - 48px));
    padding: 18px 20px 19px;
    border: 1px solid rgba(139, 91, 53, .48);
    border-radius: 8px 20px 20px 8px;
    background: linear-gradient(135deg, rgba(255, 248, 226, .96), rgba(234, 217, 177, .93));
    box-shadow: 0 8px 28px rgba(38, 55, 71, .22), inset 0 0 0 1px rgba(255, 255, 255, .4);
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }
  .mq-story-chapter-card::before {
    content: "";
    position: absolute;
    left: -4px;
    top: 14px;
    bottom: 14px;
    width: 6px;
    border: 1px solid rgba(116, 76, 45, .45);
    border-radius: 99px;
    background: #c59a62;
  }
  .mq-story-chapter-eyebrow { color: #8b6041; font-size: 10px; font-weight: 800; letter-spacing: .17em; line-height: 1.4; }
  .mq-story-chapter h1 { margin-top: 5px; font-size: 25px; line-height: 1.2; }
  .mq-story-chapter-card > p { margin-top: 10px; font-size: 14px; line-height: 1.55; }
  .mq-story-chapter-card > .mq-story-chapter-status { margin-top: 8px; color: #725d43; font-size: 12px; }
  .mq-story-chapter-keepsake {
    margin-top: 13px;
    padding: 9px 11px;
    border: 1px solid rgba(155, 111, 62, .35);
    border-radius: 10px;
    background: rgba(239, 207, 141, .34);
    color: #725034;
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }
  .mq-story-chapter button {
    min-width: 44px;
    min-height: 46px;
    margin-top: 15px;
    padding: 10px 18px;
    border: 1px solid #a97843;
    border-radius: 999px;
    background: #efcf8d;
    color: #4d3526;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.25;
    cursor: pointer;
    transition: background-color .16s ease, transform .16s ease;
  }
  .mq-story-chapter button:focus-visible {
    outline: 3px solid #315e5b;
    outline-offset: 3px;
    box-shadow: 0 0 0 5px rgba(255, 248, 222, .96);
  }
  @media (hover: hover) {
    .mq-story-chapter button:hover { background: #f5dba4; transform: translateY(-1px); }
  }
  @media (max-width: 900px), (max-height: 680px) {
    .mq-story-chapter-card { left: 14px; top: 64px; width: min(350px, calc(100% - 28px)); padding: 15px 17px 16px; }
    .mq-story-chapter h1 { font-size: 23px; }
    .mq-story-chapter-card > p { margin-top: 8px; font-size: 13px; }
    .mq-story-chapter button { margin-top: 12px; }
  }
  @media (max-width: 520px) {
    .mq-story-chapter-card { left: 10px; width: calc(100% - 20px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mq-story-chapter *, .mq-story-chapter *::before, .mq-story-chapter *::after { transition: none !important; }
    .mq-story-chapter button:hover { transform: none; }
  }
`;
