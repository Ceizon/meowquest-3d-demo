import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONVOY_LOADS,
  CONVOY_LOAD_RULES,
  clamp01,
  type ConvoyLoad,
} from "../lib/convoyRules";
import { useConvoyStore } from "../store/convoy";
import { useGameStore } from "../store/gameStore";

const LOAD_LABELS: Record<ConvoyLoad, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
};

const STONE_POSITIONS: Record<ConvoyLoad, readonly { left: number; top: number }[]> = {
  1: [{ left: 12, top: 15 }],
  2: [{ left: 4, top: 15 }, { left: 20, top: 15 }],
  3: [{ left: 4, top: 16 }, { left: 20, top: 16 }, { left: 12, top: 5 }],
  4: [{ left: 4, top: 16 }, { left: 20, top: 16 }, { left: 4, top: 5 }, { left: 20, top: 5 }],
};

export default function ConvoyOverlay() {
  const setScreen = useGameStore((s) => s.setScreen);
  const phase = useConvoyStore((s) => s.phase);
  const selectedLoad = useConvoyStore((s) => s.selectedLoad);
  const stonesFilled = useConvoyStore((s) => s.stonesFilled);
  const targetStones = useConvoyStore((s) => s.targetStones);
  const energy = useConvoyStore((s) => s.energy);
  const maxEnergy = useConvoyStore((s) => s.maxEnergy);
  const incense = useConvoyStore((s) => s.incense);
  const phaseProgress = useConvoyStore((s) => s.phaseProgress);
  const paused = useConvoyStore((s) => s.paused);
  const windStatus = useConvoyStore((s) => s.wind.status);
  const lastMessage = useConvoyStore((s) => s.lastMessage);
  const prepareSession = useConvoyStore((s) => s.prepareSession);
  const start = useConvoyStore((s) => s.start);
  const selectLoad = useConvoyStore((s) => s.selectLoad);
  const push = useConvoyStore((s) => s.push);
  const resume = useConvoyStore((s) => s.resume);

  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const confirmContinueRef = useRef<HTMLButtonElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingLeave = useRef(false);

  const inAttempt = phase !== "intro" && phase !== "complete" && phase !== "timeUp";
  const remainingStones = Math.max(0, targetStones - stonesFilled);
  const energyRatio = maxEnergy > 0 ? clamp01(energy / maxEnergy) : 0;
  const incenseRatio = clamp01(incense);
  const tripCost = CONVOY_LOAD_RULES[selectedLoad].energyCost;
  const needsRest = phase === "loading" && energy + 1e-9 < tripCost;
  const costRatio = phase === "loading"
    ? Math.min(energyRatio, clamp01(tripCost / maxEnergy))
    : 0;
  const energyAfterTrip = Math.max(0, energyRatio - costRatio);
  const incenseStatus = incenseRatio <= 0
    ? "Resting"
    : incenseRatio <= 0.25
      ? "Getting low"
      : "Glowing";
  const energyStatus = needsRest
    ? "Momo can rest before this trip"
    : phase === "loading"
      ? "The marked part shows this cart's effort"
      : energyRatio <= 0.25
        ? "Momo is getting tired"
        : "Momo has energy";
  const hint = windStatus === "warning"
    ? "A little wind is coming. Momo is ready."
    : windStatus === "gusting"
      ? "Momo is holding the cart until the wind passes."
      : needsRest
        ? "Momo can rest before taking this stack."
        : lastMessage;

  const leaveToChapter = useCallback(() => {
    setScreen("story1");
  }, [setScreen]);

  const requestReturn = useCallback(() => {
    if (inAttempt) {
      setConfirmingLeave(true);
    } else {
      leaveToChapter();
    }
  }, [inAttempt, leaveToChapter]);

  const continueAfterConfirm = useCallback(() => {
    setConfirmingLeave(false);
    if (paused) resume();
  }, [paused, resume]);

  useEffect(() => {
    if (!inAttempt) setConfirmingLeave(false);
  }, [inAttempt]);

  useEffect(() => {
    if (confirmingLeave) {
      confirmContinueRef.current?.focus();
    } else if (paused && inAttempt) {
      resumeButtonRef.current?.focus();
    } else if (wasConfirmingLeave.current) {
      returnButtonRef.current?.focus();
    }
    wasConfirmingLeave.current = confirmingLeave;
  }, [confirmingLeave, inAttempt, paused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmingLeave) {
          setConfirmingLeave(false);
        } else {
          requestReturn();
        }
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.isContentEditable
        || target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.tagName === "SELECT"
      ) return;

      const isNativeControl = Boolean(target?.closest("button, a"));
      const isActivation = event.key === "Enter" || event.key === " " || event.code === "Space";

      if (confirmingLeave) {
        if (isActivation && !isNativeControl) {
          event.preventDefault();
          continueAfterConfirm();
        }
        return;
      }

      if (paused && inAttempt) {
        if (isActivation && !isNativeControl) {
          event.preventDefault();
          resume();
        }
        return;
      }

      if (phase === "intro") {
        if (isActivation && !isNativeControl) {
          event.preventDefault();
          start();
        }
        return;
      }

      if (phase !== "loading") return;

      if (/^[1-4]$/.test(event.key)) {
        const load = Number(event.key) as ConvoyLoad;
        if (load <= remainingStones) {
          event.preventDefault();
          selectLoad(load);
        }
        return;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        for (let step = 1; step <= CONVOY_LOADS.length; step += 1) {
          const next = (((selectedLoad - 1 + direction * step) % 4 + 4) % 4 + 1) as ConvoyLoad;
          if (next <= remainingStones) {
            selectLoad(next);
            break;
          }
        }
        return;
      }

      if (isActivation && !isNativeControl) {
        event.preventDefault();
        push();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    confirmingLeave,
    continueAfterConfirm,
    inAttempt,
    paused,
    phase,
    push,
    remainingStones,
    requestReturn,
    resume,
    selectedLoad,
    selectLoad,
    start,
  ]);

  return (
    <div className={`mq-convoy mq-convoy-phase-${phase}`}>
      <style>{convoyStyles}</style>

      {phase === "intro" ? (
        <section className="mq-convoy-intro" aria-labelledby="mq-convoy-intro-title">
          <div className="mq-convoy-eyebrow">CHAPTER I · THE CLOUD BRIDGE</div>
          <h1 id="mq-convoy-intro-title">A bridge to mend</h1>
          <p>A gap waits in the clouds. Help Momo bring the stones home.</p>
          <div className="mq-convoy-intro-steps" aria-label="Choose a stack, feel the cart's weight, then mend the bridge">
            <span>Choose a stack</span>
            <span aria-hidden="true">→</span>
            <span>Feel the cart's weight</span>
            <span aria-hidden="true">→</span>
            <span>Mend the bridge</span>
          </div>
          <div className="mq-convoy-intro-actions">
            <button type="button" className="mq-convoy-button mq-convoy-primary" onClick={start}>Start</button>
            <button type="button" className="mq-convoy-button mq-convoy-secondary" onClick={leaveToChapter}>Return</button>
          </div>
        </section>
      ) : (
        <>
          <header className="mq-convoy-hud">
            <div className="mq-convoy-heading">
              <div>
                <div className="mq-convoy-eyebrow">CHAPTER I</div>
                <h1>Cloud Bridge</h1>
              </div>
              <button
                ref={returnButtonRef}
                type="button"
                className="mq-convoy-return"
                onClick={requestReturn}
                aria-label={inAttempt ? "Return to the chapter; asks for confirmation" : "Return to the chapter"}
              >
                Return
              </button>
            </div>
            <p className="mq-convoy-hint" aria-live="polite">{hint}</p>
            <div className="mq-convoy-status">
              <div className="mq-convoy-energy">
                <span className="mq-convoy-status-label">Momo's energy</span>
                <div
                  className="mq-convoy-energy-track"
                  role="meter"
                  aria-label="Momo's energy"
                  aria-valuemin={0}
                  aria-valuemax={maxEnergy}
                  aria-valuenow={Math.round(energy * 10) / 10}
                  aria-valuetext={energyStatus}
                >
                  <span className="mq-convoy-energy-fill" style={{ transform: `scaleX(${energyRatio})` }} />
                  {costRatio > 0 && (
                    <span
                      className="mq-convoy-energy-cost"
                      style={{ left: `${energyAfterTrip * 100}%`, width: `${costRatio * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div
                className="mq-convoy-incense"
                role="meter"
                aria-label="Incense"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={Math.round(incenseRatio * 100) / 100}
                aria-valuetext={incenseStatus}
              >
                <div className="mq-convoy-incense-label">
                  <span>Incense</span>
                  <span>{incenseStatus}</span>
                </div>
                <div className="mq-convoy-incense-track" aria-hidden="true">
                  <span className="mq-convoy-incense-stick" style={{ transform: `scaleX(${incenseRatio})` }} />
                  <span
                    className="mq-convoy-incense-ember"
                    style={{ left: `${incenseRatio * 100}%`, opacity: incenseRatio > 0 ? 1 : 0 }}
                  />
                </div>
              </div>
            </div>
            <span className="mq-convoy-sr-only" aria-live="polite">
              {stonesFilled} of {targetStones} bridge stones are in place.
            </span>
          </header>

          {phase === "loading" && !paused && !confirmingLeave && (
            <section className="mq-convoy-loading" aria-label="Choose a stone stack">
              <span className="mq-convoy-sr-only">
                Use keys 1 to 4 or the arrow keys to choose a stack. Press Enter or Space to push.
              </span>
              <div className="mq-convoy-loads" role="group" aria-label="Stone stacks">
                {CONVOY_LOADS.map((load) => {
                  const disabled = load > remainingStones;
                  const selected = selectedLoad === load;
                  return (
                    <button
                      key={load}
                      type="button"
                      className={`mq-convoy-load${selected ? " is-selected" : ""}`}
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`Choose ${LOAD_LABELS[load].toLowerCase()} ${load === 1 ? "stone" : "stones"}`}
                      title={disabled ? "This stack is too tall for the remaining gap" : `${LOAD_LABELS[load]} stone stack`}
                      onClick={() => selectLoad(load)}
                    >
                      <span className="mq-convoy-stones" aria-hidden="true">
                        {STONE_POSITIONS[load].map((position, index) => (
                          <span
                            key={index}
                            className="mq-convoy-stone"
                            style={{ left: position.left, top: position.top }}
                          />
                        ))}
                      </span>
                      <span className="mq-convoy-load-label">{LOAD_LABELS[load]}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="mq-convoy-button mq-convoy-primary mq-convoy-push"
                disabled={remainingStones === 0 || selectedLoad > remainingStones}
                onClick={push}
              >
                Push the cart
              </button>
            </section>
          )}

          {phase === "resting" && !paused && !confirmingLeave && (
            <section className="mq-convoy-card mq-convoy-rest" aria-labelledby="mq-convoy-rest-title">
              <div className="mq-convoy-eyebrow">A QUIET MOMENT</div>
              <h2 id="mq-convoy-rest-title">Tea by the clouds</h2>
              <p>Momo will be ready to push again soon.</p>
              <div className="mq-convoy-rest-track" aria-hidden="true">
                <span style={{ transform: `scaleX(${clamp01(phaseProgress)})` }} />
              </div>
            </section>
          )}

          {phase === "timeUp" && !confirmingLeave && (
            <section className="mq-convoy-card mq-convoy-result" aria-labelledby="mq-convoy-timeup-title">
              <div className="mq-convoy-eyebrow">A GENTLE PAUSE</div>
              <h2 id="mq-convoy-timeup-title">The incense is resting</h2>
              <p>The bridge will keep every placed stone. A fresh incense will bring a new chance.</p>
              <div className="mq-convoy-card-actions">
                <button type="button" className="mq-convoy-button mq-convoy-primary" onClick={() => prepareSession()}>
                  Light a fresh incense
                </button>
                <button type="button" className="mq-convoy-button mq-convoy-secondary" onClick={leaveToChapter}>
                  Return
                </button>
              </div>
            </section>
          )}

          {phase === "complete" && !confirmingLeave && (
            <section className="mq-convoy-card mq-convoy-result" aria-labelledby="mq-convoy-complete-title">
              <div className="mq-convoy-eyebrow">A DAY TO REMEMBER</div>
              <h2 id="mq-convoy-complete-title">The bridge is whole!</h2>
              <p>Every stone is in place. You and Momo did it together.</p>
              <div className="mq-convoy-keepsake">Built together with Momo</div>
              <button type="button" className="mq-convoy-button mq-convoy-primary" onClick={leaveToChapter}>
                Return
              </button>
            </section>
          )}

          {paused && inAttempt && !confirmingLeave && (
            <section className="mq-convoy-card mq-convoy-decision" role="dialog" aria-labelledby="mq-convoy-paused-title">
              <div className="mq-convoy-eyebrow">A QUIET PAUSE</div>
              <h2 id="mq-convoy-paused-title">The clouds can wait</h2>
              <p>The incense and Momo are waiting for you.</p>
              <button
                ref={resumeButtonRef}
                type="button"
                className="mq-convoy-button mq-convoy-primary"
                onClick={resume}
              >
                Continue
              </button>
            </section>
          )}

          {confirmingLeave && inAttempt && (
            <section
              className="mq-convoy-card mq-convoy-decision"
              role="alertdialog"
              aria-labelledby="mq-convoy-leave-title"
              aria-describedby="mq-convoy-leave-copy"
            >
              <div className="mq-convoy-eyebrow">RETURN TO THE CHAPTER</div>
              <h2 id="mq-convoy-leave-title">Leave this trip?</h2>
              <p id="mq-convoy-leave-copy">The bridge will keep its placed stones. This cart can start fresh next time.</p>
              <div className="mq-convoy-card-actions">
                <button
                  ref={confirmContinueRef}
                  type="button"
                  className="mq-convoy-button mq-convoy-primary"
                  onClick={continueAfterConfirm}
                >
                  Continue
                </button>
                <button type="button" className="mq-convoy-button mq-convoy-secondary" onClick={leaveToChapter}>
                  Leave
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const convoyStyles = `
  .mq-convoy {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: #50382b;
    font-family: inherit;
  }
  .mq-convoy *, .mq-convoy *::before, .mq-convoy *::after { box-sizing: border-box; }
  .mq-convoy button { font: inherit; }
  .mq-convoy h1, .mq-convoy h2, .mq-convoy p { margin: 0; }
  .mq-convoy button:focus-visible {
    outline: 3px solid #315e5b;
    outline-offset: 3px;
    box-shadow: 0 0 0 5px rgba(255, 248, 222, .96);
  }
  .mq-convoy button:disabled { cursor: not-allowed; }
  .mq-convoy-eyebrow {
    color: #8b6041;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .17em;
    line-height: 1.4;
  }
  .mq-convoy-intro, .mq-convoy-hud, .mq-convoy-card, .mq-convoy-loading {
    background: linear-gradient(135deg, rgba(255, 250, 232, .97), rgba(237, 222, 190, .94));
    border: 1px solid rgba(139, 96, 60, .5);
    box-shadow: 0 8px 26px rgba(45, 54, 57, .2), inset 0 0 0 1px rgba(255, 255, 255, .45);
    backdrop-filter: blur(8px);
  }
  .mq-convoy-intro {
    position: absolute;
    left: clamp(16px, 5vw, 64px);
    top: 50%;
    width: min(510px, calc(100% - 32px));
    padding: 26px 30px 24px;
    border-radius: 8px 22px 22px 8px;
    transform: translateY(-50%);
    pointer-events: auto;
  }
  .mq-convoy-intro::before, .mq-convoy-intro::after {
    content: "";
    position: absolute;
    top: 13px;
    bottom: 13px;
    width: 6px;
    border: 1px solid rgba(116, 76, 45, .5);
    border-radius: 99px;
    background: #c59a62;
  }
  .mq-convoy-intro::before { left: -4px; }
  .mq-convoy-intro::after { right: -4px; }
  .mq-convoy-intro h1 { margin-top: 6px; font-size: 30px; line-height: 1.15; }
  .mq-convoy-intro > p { margin-top: 10px; font-size: 15px; line-height: 1.55; }
  .mq-convoy-intro-steps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    margin-top: 17px;
    padding: 12px 0;
    border-top: 1px solid rgba(139, 96, 60, .25);
    border-bottom: 1px solid rgba(139, 96, 60, .25);
    color: #5c4634;
    font-size: 13px;
    font-weight: 750;
    line-height: 1.45;
  }
  .mq-convoy-intro-steps span[aria-hidden="true"] { color: #8d6c4a; }
  .mq-convoy-intro-actions, .mq-convoy-card-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .mq-convoy-button {
    min-width: 44px;
    min-height: 46px;
    padding: 10px 19px;
    border-radius: 999px;
    font-weight: 800;
    line-height: 1.2;
    cursor: pointer;
    transition: background-color .16s ease, box-shadow .16s ease, transform .16s ease;
  }
  .mq-convoy-primary { border: 1px solid #a97843; background: #efcf8d; color: #4d3526; }
  .mq-convoy-secondary { border: 1px solid #b4956c; background: rgba(255, 250, 232, .7); color: #573d2c; }
  .mq-convoy-hud {
    position: absolute;
    top: 72px;
    left: 24px;
    width: min(370px, calc(100% - 48px));
    padding: 13px 15px 14px;
    border-radius: 8px 18px 18px 8px;
    pointer-events: auto;
  }
  .mq-convoy-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .mq-convoy-heading h1 { margin-top: 2px; font-size: 22px; line-height: 1.15; }
  .mq-convoy-return {
    flex: 0 0 auto;
    min-width: 68px;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid rgba(139, 96, 60, .45);
    border-radius: 999px;
    background: rgba(255, 250, 232, .55);
    color: #5a4130;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .mq-convoy-hint { min-height: 2.8em; margin-top: 7px !important; font-size: 13px; line-height: 1.4; }
  .mq-convoy-status { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 15px; align-items: end; margin-top: 9px; }
  .mq-convoy-status-label, .mq-convoy-incense-label { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; font-weight: 750; line-height: 1.3; }
  .mq-convoy-incense-label span:last-child { color: #765d45; font-weight: 650; }
  .mq-convoy-energy-track {
    position: relative;
    height: 9px;
    margin-top: 5px;
    overflow: hidden;
    border: 1px solid rgba(92, 75, 54, .18);
    border-radius: 99px;
    background: rgba(139, 123, 94, .2);
  }
  .mq-convoy-energy-fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #5f8e7e, #91ad88);
    transform-origin: left center;
    transition: transform .12s linear;
  }
  .mq-convoy-energy-cost {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px dashed rgba(77, 53, 38, .65);
    background: repeating-linear-gradient(135deg, rgba(239, 207, 141, .15) 0 3px, rgba(83, 62, 43, .48) 3px 5px);
    transition: left .16s ease, width .16s ease;
  }
  .mq-convoy-incense-track { position: relative; height: 9px; margin-top: 5px; }
  .mq-convoy-incense-track::before { content: ""; position: absolute; left: 0; right: 0; top: 4px; height: 2px; border-radius: 99px; background: rgba(108, 86, 59, .18); }
  .mq-convoy-incense-stick {
    position: absolute;
    left: 0;
    right: 0;
    top: 3px;
    height: 4px;
    border-radius: 99px;
    background: #a77a50;
    transform-origin: left center;
    transition: transform .12s linear;
  }
  .mq-convoy-incense-ember {
    position: absolute;
    top: 1px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f4c76e;
    box-shadow: 0 0 7px rgba(225, 155, 65, .85);
    transform: translateX(-50%);
    transition: left .12s linear, opacity .16s ease;
  }
  .mq-convoy-loading {
    position: absolute;
    z-index: 91;
    left: 50%;
    bottom: 14px;
    display: flex;
    align-items: stretch;
    gap: 10px;
    width: max-content;
    max-width: calc(100% - 24px);
    padding: 10px;
    border-radius: 18px;
    transform: translateX(-50%);
    pointer-events: auto;
  }
  .mq-convoy-loads { display: grid; grid-template-columns: repeat(4, 58px); gap: 6px; }
  .mq-convoy-load {
    position: relative;
    min-width: 44px;
    min-height: 62px;
    padding: 5px 4px 4px;
    border: 1px solid #bea079;
    border-radius: 11px;
    background: rgba(255, 250, 232, .72);
    color: #594131;
    cursor: pointer;
    transition: background-color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;
  }
  .mq-convoy-load.is-selected {
    border-color: #96673e;
    background: #f2d89b;
    box-shadow: inset 0 0 0 2px #fff2cb, 0 0 0 2px #a67243;
  }
  .mq-convoy-load:disabled { opacity: .4; filter: saturate(.35); }
  .mq-convoy-stones { position: relative; display: block; width: 38px; height: 29px; margin: 0 auto; }
  .mq-convoy-stone {
    position: absolute;
    width: 15px;
    height: 10px;
    border: 1px solid #817664;
    border-radius: 4px 5px 3px 4px;
    background: linear-gradient(145deg, #ddd2bb, #a99d88);
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, .45);
    transform: rotate(-3deg);
  }
  .mq-convoy-stone:nth-child(even) { border-radius: 5px 3px 5px 4px; transform: rotate(4deg); }
  .mq-convoy-load-label { display: block; margin-top: 1px; font-size: 10px; font-weight: 800; line-height: 1.2; }
  .mq-convoy-push { align-self: stretch; min-width: 142px; border-radius: 12px; }
  .mq-convoy-card {
    position: absolute;
    z-index: 96;
    left: 50%;
    bottom: 226px;
    width: min(390px, calc(100% - 28px));
    padding: 17px 19px;
    border-radius: 18px;
    transform: translateX(-50%);
    pointer-events: auto;
  }
  .mq-convoy-card h2 { margin-top: 4px; font-size: 22px; line-height: 1.2; }
  .mq-convoy-card > p { margin-top: 8px; font-size: 13px; line-height: 1.5; }
  .mq-convoy-card > .mq-convoy-button { margin-top: 16px; }
  .mq-convoy-rest { width: min(330px, calc(100% - 28px)); text-align: center; }
  .mq-convoy-rest-track { height: 5px; margin-top: 13px; overflow: hidden; border-radius: 99px; background: rgba(112, 93, 67, .18); }
  .mq-convoy-rest-track span { display: block; width: 100%; height: 100%; border-radius: inherit; background: #7c9e87; transform-origin: left center; transition: transform .12s linear; }
  .mq-convoy-keepsake {
    margin-top: 13px;
    padding: 9px 12px;
    border: 1px solid rgba(155, 111, 62, .35);
    border-radius: 10px;
    background: rgba(239, 207, 141, .34);
    color: #725034;
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }
  .mq-convoy-sr-only {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }
  @media (hover: hover) {
    .mq-convoy-button:not(:disabled):hover, .mq-convoy-return:hover { transform: translateY(-1px); }
    .mq-convoy-primary:not(:disabled):hover { background: #f5dba4; }
    .mq-convoy-secondary:not(:disabled):hover, .mq-convoy-return:hover { background: #fff7e2; }
    .mq-convoy-load:not(:disabled):hover { transform: translateY(-2px); background: #f8e7bc; }
  }
  @media (max-width: 900px), (max-height: 680px) {
    .mq-convoy-hud { top: 64px; left: 14px; width: min(350px, calc(100% - 28px)); padding: 10px 12px 11px; }
    .mq-convoy-heading h1 { font-size: 20px; }
    .mq-convoy-hint { margin-top: 5px !important; font-size: 12px; }
    .mq-convoy-status { margin-top: 6px; gap: 11px; }
    .mq-convoy-loading { bottom: 10px; gap: 8px; padding: 8px; }
    .mq-convoy-loads { grid-template-columns: repeat(4, 54px); gap: 5px; }
    .mq-convoy-load { min-height: 58px; padding-top: 3px; }
    .mq-convoy-push { min-width: 132px; }
    .mq-convoy-card {
      left: auto;
      right: 14px;
      bottom: 226px;
      width: min(300px, calc(100% - 28px));
      padding: 14px 16px;
      transform: none;
    }
    .mq-convoy-intro { left: 24px; padding: 21px 25px 20px; }
    .mq-convoy-intro h1 { font-size: 27px; }
    .mq-convoy-intro-steps { margin-top: 13px; padding: 10px 0; }
    .mq-convoy-intro-actions { margin-top: 14px; }
  }
  @media (min-width: 521px) and (max-width: 900px) {
    .mq-convoy-loading {
      top: 216px;
      right: 14px;
      bottom: auto;
      left: auto;
      transform: none;
    }
  }
  @media (max-width: 520px) {
    .mq-convoy-intro { left: 12px; width: calc(100% - 24px); padding: 20px; }
    .mq-convoy-intro h1 { font-size: 25px; }
    .mq-convoy-hud { left: 10px; width: calc(100% - 20px); }
    .mq-convoy-loading { width: calc(100% - 20px); flex-direction: column; }
    .mq-convoy-loads { grid-template-columns: repeat(4, minmax(44px, 1fr)); }
    .mq-convoy-push { min-height: 44px; }
    .mq-convoy-card-actions > button { flex: 1 1 auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mq-convoy *, .mq-convoy *::before, .mq-convoy *::after { transition: none !important; }
    .mq-convoy-button:hover, .mq-convoy-return:hover, .mq-convoy-load:hover { transform: none !important; }
  }
`;
