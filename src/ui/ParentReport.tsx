import { useSyncExternalStore, useState, useMemo, useEffect } from "react";
import type { CSSProperties } from "react";
import { useGameStore } from "../store/gameStore";
import { useGameFlow } from "../store/gameFlow";
import { useQuest } from "../store/quest";
import { evaluateRiskSignals } from "../lib/riskSignals";
import type { RiskLevel } from "../lib/riskSignals";
import { chat } from "../lib/aiClient";
import { getLocalDayResults } from "../lib/sessionData";
import { useAIConsent } from "../store/aiConsent";
import { clearLocalData, exportLocalData } from "../lib/dataPortability";

// AI 家长笔记：山灵（ecnu-plus）基于本次会话数据写三段式暖心观察笔记。
// 红线：去标签化（禁疾病/障碍/诊断词，由 system prompt 约束）；失败/超时/无 key 一律降级，
// 静态笔记始终可见作对照。
const SYSTEM_PROMPT =
  "You are a warm, respectful child-development observer writing a short note for a parent about their child's play session on Meow Mountain.\n" +
  "Strict rules:\n" +
  "1. Never use medical, deficit-based, or diagnostic language. Forbidden words include: ADHD, dyslexia, disorder, diagnosis, deficit, impairment, disability, delay, symptom, syndrome, condition, patient, treatment. Describe only observed behaviors, strengths, and gentle suggestions.\n" +
  "2. Write in English, at most 120 words in total.\n" +
  "3. Output exactly three paragraphs, each on its own line, starting exactly with: **Seen today:** then **Shining strengths:** then **Gentle next steps:**\n" +
  "4. Be warm and specific, grounded only in the provided session data. Never invent activities or results, and never mention scores, ranks, or percentiles.";

// 微光加载动画 + 按钮 hover（项目无动画库，注入一次样式即可，纯离线）
const NOTE_CSS = `
@keyframes mqNoteShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes mqNotePulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
.mqSpiritBtn:hover:not(:disabled) { filter: brightness(1.18); }
.mqSpiritBtn:disabled { opacity: 0.6; cursor: default; }
`;

// 极简 markdown 渲染：先转义防注入，再 **加粗** → <strong>、换行 → <br>（不引依赖）
function renderNote(md: string): string {
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bold = esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return bold.replace(/\n/g, "<br>");
}

// 家长端"观察笔记"：呈现特点与潜力，永不呈现缺陷/分值排名（Tech for Good 的设计证据）
export default function ParentReport() {
  const setScreen = useGameStore((s) => s.setScreen);
  const energyVectors = useGameStore((s) => s.energyVectors);
  const flowLights = useGameStore((s) => s.flowLights);
  const aiNote = useGameStore((s) => s.aiNote);
  const setAiNote = useGameStore((s) => s.setAiNote);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [localDay, setLocalDay] = useState(() => new Date().toDateString());
  // 派生数据必须整体作为一个快照读取；在 selector 里新建对象会触发无限重渲染
  const [, allResults] = useSyncExternalStore(useGameStore.subscribe, energyVectors);
  const results = useMemo(() => getLocalDayResults(allResults), [allResults, localDay]);
  const vector = useMemo(() => {
    const average = (task: string) => {
      const taskResults = results.filter((result) => result.task === task);
      return taskResults.length
        ? taskResults.reduce((sum, result) => sum + result.accuracy, 0) / taskResults.length
        : 0.5;
    };
    return { workingMemory: average("starArray"), literacy: average("glyphTrial") };
  }, [results]);
  const aiSharingEnabled = useAIConsent((s) => s.accepted);
  const requestConsent = useAIConsent((s) => s.requestConsent);
  const resolveConsent = useAIConsent((s) => s.resolveConsent);
  useEffect(() => {
    const timer = window.setInterval(() => setLocalDay(new Date().toDateString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // 今日陪伴状态：纯本地聚合（战绩 + 心流之光 + 能量向量 + 自适应档位 + 篇章完成度）
  const steps = useQuest((s) => s.steps);
  const signals = useMemo(() => {
    // 档位只参与计算、不进入渲染依赖，故在 useMemo 内部读取
    const gf = useGameFlow.getState();
    return evaluateRiskSignals({
      results,
      flowLights,
      energy: vector,
      levels: {
        nbackLevel: gf.nbackLevel,
        seqLevel: gf.seqLevel,
        glyphLevel: gf.glyphLevel,
        stonesSpeed: gf.stonesSpeed,
      },
      questDone: steps.filter((s) => s.done).length,
      questTotal: steps.length,
    });
  }, [results, results.length, flowLights, vector, steps]);

  // 历史记录里的 task 内部名 → 家长端展示名
  const TASK_NAMES: Record<string, string> = {
    starArray: "Star Array",
    glyphTrial: "Glyph Trial",
    breathing: "Calm Breathing",
    goNoGo: "Firefly Focus",
    stepStones: "Stepping Stones · Speed & Focus",
  };
  const taskName = (t: string) => TASK_NAMES[t] ?? t;

  // 请山灵写笔记：chat 内部 10s 超时，失败/超时/无 key 均返回 null → 降级提示，静态笔记保持可见
  const askSpirits = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    if (!(await requestConsent())) {
      setLoading(false);
      return;
    }
    const userPrompt =
      "Here is today's play data. Write an observation based only on these sessions:\n" +
      JSON.stringify({
        gameNameMap: TASK_NAMES,
        results: results.map((r) => ({
          task: r.task,
          accuracy: r.accuracy,
          avgRT: Math.round(r.avgRT),
          trials: r.trials,
        })),
      });
    const text = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 400 }
    );
    setLoading(false);
    if (text) setAiNote(text);
    else setFailed(true);
  };

  const clearData = () => {
    if (
      window.confirm(
        "Clear MeowQuest data saved in this browser? This removes play history, notes, achievements, and AI conversation history."
      )
    ) {
      clearLocalData();
    }
  };

  const row = (label: string, v: number, note: string, observed: boolean) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#e8e2d2", marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "#a99f86", fontSize: 12 }}>{note}</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{
          width: `${observed ? Math.round(v * 100) : 0}%`, height: "100%", borderRadius: 999,
          background: "linear-gradient(90deg,#7fae5f,#ffd98a)", transition: "width 0.8s ease",
        }} />
      </div>
    </div>
  );

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(8,10,24,0.82)", backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: 520, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
        background: "linear-gradient(160deg,#1d2440,#141a30)", borderRadius: 24,
        border: "1px solid rgba(255,220,150,0.25)", padding: "32px 36px", color: "#fff",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 24, color: "#ffe9c0" }}>Meow's Observation Notes</h2>
          <button onClick={() => setScreen("mountain")} style={{
            border: "1px solid rgba(255,255,255,0.3)", background: "transparent",
            color: "#cfd8ff", borderRadius: 999, padding: "6px 16px", cursor: "pointer", fontSize: 13,
          }}>Close</button>
        </div>
        <p style={{ color: "#9aa8cc", fontSize: 13.5, marginTop: 4, lineHeight: 1.6 }}>
          Every glow is a discovery. What the mountain saw today:
        </p>
        <div style={{
          marginBottom: 16, padding: "10px 12px", borderRadius: 12,
          background: "rgba(127,174,95,0.1)", border: "1px solid rgba(127,174,95,0.22)",
          color: "#b9d8a0", fontSize: 12.5, lineHeight: 1.55,
        }}>
          Today&apos;s notes use only play data saved on this device. AI notes are optional and are never needed for the mountain to work.
        </div>

        <button
          onClick={() => {
            if (aiSharingEnabled) resolveConsent(false);
            else void requestConsent();
          }}
          style={{ ...sharingButton, marginBottom: 16 }}
        >
          {aiSharingEnabled ? "AI data sharing is on · Turn off" : "Parent: review AI data sharing"}
        </button>

        {row("Working memory · Star Array", vector.workingMemory,
          results.some((r) => r.task === "starArray") ? "observed today" : "awaiting first visit",
          results.some((r) => r.task === "starArray"))}
        {row("Literacy perception · Glyph Trial", vector.literacy,
          results.some((r) => r.task === "glyphTrial") ? "observed today" : "awaiting first visit",
          results.some((r) => r.task === "glyphTrial"))}

        {/* 今日陪伴状态小卡：只描述今天的节奏，用暖色圆点 + 措辞，不做任何评估式提示 */}
        <div style={checkInCard}>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a99f86", marginBottom: 8 }}>
            Today's gentle check-in
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: CHECKIN_DOT[signals.level], flexShrink: 0 }} />
            <span style={{ fontSize: 14.5, color: "#e8e2d2", fontWeight: 600 }}>{signals.parentLine}</span>
            <span style={{ fontSize: 11.5, color: "#9aa8cc", whiteSpace: "nowrap" }}>{CHECKIN_WORD[signals.level]}</span>
          </div>
          <div style={{ fontSize: 13, color: "#bdb49d", lineHeight: 1.6 }}>· {signals.parentTips[0]}</div>
          <div style={{ fontSize: 13, color: "#bdb49d", lineHeight: 1.6 }}>· {signals.parentTips[1]}</div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#67749c", lineHeight: 1.6 }}>
            A gentle local hint about today's rhythm — not a judgement, just a hand to hold.
          </div>
        </div>

        <style>{NOTE_CSS}</style>
        {/* AI 观察笔记：按钮在静态笔记上方；缓存命中直接渲染，失败降级不遮挡静态版 */}
        <div style={{ marginTop: 4, marginBottom: 16 }}>
          <button className="mqSpiritBtn" onClick={askSpirits} disabled={loading} style={spiritBtn}>
            {aiNote ? "Write again" : "Ask the Mountain Spirits to write a note"}
          </button>

          {loading && (
            <div style={shimmerBox}>
              <span style={{ animation: "mqNotePulse 1.6s ease-in-out infinite" }}>
                The spirits are thinking...
              </span>
            </div>
          )}

          {!loading && aiNote && (
            <div style={aiNoteBox}>
              <div style={{ fontSize: 11, color: "#a99f86", marginBottom: 6 }}>AI note · saved on this device</div>
              <div dangerouslySetInnerHTML={{ __html: renderNote(aiNote) }} />
            </div>
          )}

          {!loading && failed && (
            <div style={napNote}>
              The mountain spirits are napping — here is today's map instead.
            </div>
          )}
        </div>

        <div style={{
          marginTop: 8, padding: "14px 18px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.7,
          background: "rgba(255,217,138,0.08)", border: "1px solid rgba(255,217,138,0.22)", color: "#e9dfc4",
        }}>
          Your child's play history stays in this browser. AI features are optional: when enabled,
          the data described in the consent notice is sent to the ECNU AI service. No scores or
          rankings are shown to the child.
        </div>

        <div style={dataActions}>
          <button onClick={exportLocalData} style={dataButton}>
            Export local data
          </button>
          <button onClick={clearData} style={dangerButton}>
            Clear local data
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: "#67749c", lineHeight: 1.6 }}>
          {results.length === 0
            ? "No games have been completed today yet."
            : results.map((r) => `${taskName(r.task)} · ${r.trials} trials · avg RT ${Math.round(r.avgRT)}ms`).join("  |  ")}
        </div>
      </div>
    </div>
  );
}

// 今日陪伴状态小卡：深色半透明底 + 淡金边框，只做氛围提示（无评估色）
const checkInCard: CSSProperties = {
  marginTop: 12,
  marginBottom: 16,
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(255,217,138,0.06)",
  border: "1px solid rgba(255,217,138,0.18)",
  color: "#e9dfc4",
};

// 三档圆点：暖金 / 淡蓝 / 柔紫（刻意避开红黄绿）
const CHECKIN_DOT: Record<RiskLevel, string> = {
  calm: "#ffd98a",
  watch: "#9fb4e8",
  support: "#b8a8e8",
};

// 三档措辞：只描述节奏与陪伴方式，不出现等级名
const CHECKIN_WORD: Record<RiskLevel, string> = {
  calm: "steady",
  watch: "a softer pace",
  support: "extra company",
};

// 山灵按钮：暖金描边胶囊，与页面金色笔记卡同系
const spiritBtn: CSSProperties = {
  border: "1px solid rgba(255,217,138,0.45)",
  background: "linear-gradient(160deg, rgba(255,217,138,0.2), rgba(255,217,138,0.06))",
  color: "#ffe9c0",
  borderRadius: 999,
  padding: "9px 22px",
  cursor: "pointer",
  fontSize: 13.5,
  fontWeight: 600,
};

const sharingButton: CSSProperties = {
  padding: "7px 13px",
  borderRadius: 999,
  border: "1px solid rgba(255,217,138,0.35)",
  background: "rgba(255,217,138,0.07)",
  color: "#cfd8ff",
  fontSize: 12,
  cursor: "pointer",
};

const dataActions: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const dataButton: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(159,180,232,0.35)",
  background: "rgba(159,180,232,0.08)",
  color: "#cfd8ff",
  fontSize: 12,
  cursor: "pointer",
};

const dangerButton: CSSProperties = {
  ...dataButton,
  borderColor: "rgba(255,170,150,0.42)",
  background: "rgba(255,170,150,0.08)",
  color: "#ffd0c5",
};

// 加载态：暖金微光扫过 + 呼吸文字
const shimmerBox: CSSProperties = {
  marginTop: 12,
  padding: "18px",
  borderRadius: 14,
  border: "1px solid rgba(255,217,138,0.22)",
  background:
    "linear-gradient(90deg, rgba(255,217,138,0.05) 25%, rgba(255,217,138,0.18) 50%, rgba(255,217,138,0.05) 75%)",
  backgroundSize: "200% 100%",
  animation: "mqNoteShimmer 1.6s linear infinite",
  color: "#e9dfc4",
  fontSize: 13.5,
  textAlign: "center",
};

// AI 笔记卡：与静态笔记卡同款底色，便于家长对照阅读
const aiNoteBox: CSSProperties = {
  marginTop: 12,
  padding: "14px 18px",
  borderRadius: 14,
  fontSize: 13.5,
  lineHeight: 1.7,
  background: "rgba(255,217,138,0.08)",
  border: "1px solid rgba(255,217,138,0.22)",
  color: "#e9dfc4",
};

// 降级提示：山灵打盹，静态地图仍在（柔和斜体，不制造焦虑）
const napNote: CSSProperties = {
  marginTop: 12,
  fontSize: 13,
  lineHeight: 1.6,
  color: "#9aa8cc",
  fontStyle: "italic",
};
