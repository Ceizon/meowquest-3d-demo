import { useEffect, useRef, useState } from "react";
import PostFX from "../../effects/PostFX";
import Fireflies from "../../objects/Fireflies";
import CatCompanion from "../../objects/CatCompanion";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow, publishStarProgress, publishStarStage, registerStarScene } from "../../store/gameFlow";
import { useDialogue } from "../../store/dialogue";
import { COMPANION_DIALOGUES } from "../../data/companions";
import { soundManager } from "../../lib/sounds";
import { getDailyChallenge, seededRandom } from "../../lib/dailyChallenge";

// 星阵记忆：双阶段单会话——阶段 A 空间 N-back 判断（工作记忆），阶段 B 顺序还原（序列回忆）
// 阶段 A 规则：星位依次亮起，判断本次星位是否与 N 步前相同；序列生成逻辑移植自 web-prototype/components/NBackGame.tsx
// 阶段 B 规则：从 9 个星位取 seqLevel 个不重复星位依次点亮，玩家按原顺序点击还原，共 3 轮
// 两阶段共用一次 finishStar 结算（quest / 成就 / 持久化管线契约不变）

const SHOW_MS = 900;
const GAP_MS = 380;
const COMPARE_COUNT = 10;

// 连对喝彩：连对 ≥3 次触发 reward 音效 + 伙伴对话条高光台词（局中即时激励）
const MATCH_RATIO = 0.35;

// 阶段 B 参数：3 轮；单位置错误达 4 次或 8s 无点击 → 温和揭示；点错闪烁 / 揭示高亮时长
const SEQ_ROUNDS = 3;
const SEQ_WRONG_LIMIT = 4;
const SEQ_TAP_TIMEOUT = 8000;
const WRONG_FLASH_MS = 450;
const REVEAL_MS = 1300;

const SLOTS: [number, number][] = [
  [-2.2, 2.2], [0, 2.2], [2.2, 2.2],
  [-2.2, 0], [0, 0], [2.2, 0],
  [-2.2, -2.2], [0, -2.2], [2.2, -2.2],
];

interface Trial { slot: number; isMatch: boolean; }

function generateSequence(n: number, random = Math.random): Trial[] {
  const raw: number[] = [];
  // 前 n 颗为纯记忆试次（无 N 步前可比较），其后 COMPARE_COUNT 颗为作答试次
  for (let i = 0; i < COMPARE_COUNT + n; i++) raw.push(Math.floor(random() * 9));
  const minMatches = Math.max(1, Math.round(COMPARE_COUNT * MATCH_RATIO));
  for (let pass = 0; pass < 40; pass++) {
    let count = 0;
    for (let i = n; i < raw.length; i++) if (raw[i] === raw[i - n]) count++;
    if (count >= minMatches) break;
    for (let i = n; i < raw.length; i++) {
      if (raw[i] !== raw[i - n] && (i < n + 1 || raw[i] !== raw[i - 1])) {
        raw[i] = raw[i - n];
        break;
      }
    }
  }
  const seq: Trial[] = [{ slot: raw[0], isMatch: false }];
  for (let i = 1; i < raw.length; i++) {
    seq.push({ slot: raw[i], isMatch: i >= n ? raw[i] === raw[i - n] : false });
  }
  return seq;
}

// 阶段 B 序列：Fisher-Yates 部分洗牌，从 9 个星位中取 len 个不重复星位（保证同轮不重复）
function generateStarOrder(len: number, random = Math.random): number[] {
  const pool = SLOTS.map((_, i) => i);
  for (let i = 0; i < len; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, len);
}

// 阶段 B 每轮完成时的鼓励语（随机一句，温和不评价、不显示分数）
const ROUND_LINES = [
  "Perfect order! The stars cheer for you~",
  "You remembered the whole dance!",
  "The constellation bows to your memory!",
];

export default function StarArrayScene() {
  const [litSlot, setLitSlot] = useState(-1);
  const [rememberSlot, setRememberSlot] = useState(-1);
  // 阶段 B 召回期视觉反馈：已点对（持续金色）/ 点错（暗蓝闪烁）/ 温和揭示（脉冲高亮）
  const [recallDone, setRecallDone] = useState<number[]>([]);
  const [wrongFlash, setWrongFlash] = useState(-1);
  const [revealSlot, setRevealSlot] = useState(-1);
  const canAnswer = useRef(false);
  const answerResolve = useRef<((same: boolean) => void) | null>(null);
  // 阶段 B 点击等待：与 waitForAnswer 同模式，mesh onClick 与注册表 tap 共用同一处理
  const canTap = useRef(false);
  const tapResolve = useRef<((index: number | null) => void) | null>(null);
  const cancelled = useRef(false);
  const runId = useRef(0);

  const setCat = useGameStore((s) => s.setCat);
  const finishStar = useGameFlow((s) => s.finishStar);

  const stats = useRef({ correct: 0, rtSum: 0, rtCount: 0 });

  // 探针状态镜像：所有状态迁移处同步，current() 直接读它（人类操作级迁移，不逐帧 set）
  // phase: idle=未开局 / nback=阶段A / transition=阶段过渡 / showing=阶段B呈现 / recall=阶段B召回等待
  // expect: 仅召回等待期为当前期望星位，其余时候 -1；running: 一局进行中
  const machine = useRef({
    running: false,
    stage: "recall" as "recall" | "sequence",
    phase: "idle",
    round: 0,
    pos: 0,
    len: 0,
    showing: false,
    litSlot: -1,
    expect: -1,
  });

  // 定时器句柄统一管理：卸载时统一清理并立即触发（fire），让挂起的 async 流程
  // 走到 cancelled/runId 守卫处自行收尾，而不是把定时器留在队列里裸奔
  const pendingTimers = useRef<{ id: number; fire: () => void }[]>([]);
  const trackTimer = (id: number, fire: () => void) => {
    const entry = { id, fire };
    pendingTimers.current.push(entry);
    return entry;
  };
  const untrackTimer = (entry: { id: number }) => {
    pendingTimers.current = pendingTimers.current.filter((t) => t !== entry);
  };
  const flushTimers = () => {
    pendingTimers.current.forEach((t) => {
      window.clearTimeout(t.id);
      t.fire();
    });
    pendingTimers.current = [];
  };

  // 点亮星位：React state 与探针镜像同步（自动化/调试经 current() 读取 litSlot）
  const showLit = (slot: number) => {
    setLitSlot(slot);
    machine.current.litSlot = slot;
  };

  const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

  // 点错闪烁：暗蓝 mesh 亮-灭-亮-灭（约 WRONG_FLASH_MS）——禁用红色，无惩罚语义
  const flashWrong = (slot: number) => {
    setWrongFlash(slot);
    const at = (ms: number, v: number) => {
      const id = window.setTimeout(() => {
        untrackTimer(entry);
        setWrongFlash(v);
      }, ms);
      const entry = trackTimer(id, () => setWrongFlash(-1));
    };
    at(150, -1);
    at(300, slot);
    at(WRONG_FLASH_MS, -1);
  };

  // 温和揭示：期望星位脉冲高亮，提示"这颗在等你"——不计首对、不扣任何东西
  const revealStar = (slot: number) => {
    setRevealSlot(slot);
    const id = window.setTimeout(() => {
      untrackTimer(entry);
      setRevealSlot(-1);
    }, REVEAL_MS);
    const entry = trackTimer(id, () => setRevealSlot(-1));
  };

  // 由 2D 层驱动（跨 reconciler：场景把接口注册到 window，2D 层直接调用）
  // 注册表的函数引用必须恒定，具体实现通过 ref 追踪最新闭包
  const registered = useRef(false);
  const startImpl = useRef<() => void>(() => {});
  const answerImpl = useRef<(same: boolean) => void>(() => {});
  const tapImpl = useRef<(index: number) => void>(() => {});

  // 场景卸载（切屏）时：作废正在进行的序列、释放等待中的 Promise、注销注册表
  useEffect(() => {
    return () => {
      cancelled.current = true;
      runId.current += 1;
      canAnswer.current = false;
      flushTimers();
      answerResolve.current?.(false);
      answerResolve.current = null;
      canTap.current = false;
      tapResolve.current?.(null);
      tapResolve.current = null;
      registered.current = false;
      registerStarScene(null);
    };
  }, []);

  startImpl.current = () => {
    const challenge = getDailyChallenge("starArray");
    publishStarStage("recall"); // 重开一局时阶段复位（过渡卡/轮次进度不留影）
    runId.current += 1; // 让上一局（若仍在跑）立刻失效
    cancelled.current = false;
    canAnswer.current = false;
    answerResolve.current = null;
    canTap.current = false;
    tapResolve.current = null;
    setLitSlot(-1);
    setRememberSlot(-1);
    setRecallDone([]);
    setWrongFlash(-1);
    setRevealSlot(-1);
    stats.current = { correct: 0, rtSum: 0, rtCount: 0 };
    machine.current = { running: false, stage: "recall", phase: "idle", round: 0, pos: 0, len: 0, showing: false, litSlot: -1, expect: -1 };
    setCat("excited", `${challenge.theme}: watch where the star glows... then tell me if it matches.`);
    void runGame();
  };
  answerImpl.current = (same: boolean) => {
    if (canAnswer.current && answerResolve.current) answerResolve.current(same);
  };
  // 阶段 B 召回相位点击（呈现期 canTap 为 false，点击自然被忽略）
  tapImpl.current = (index: number) => {
    if (canTap.current && tapResolve.current) tapResolve.current(index);
  };
  if (!registered.current) {
    registered.current = true;
    registerStarScene({
      start: () => startImpl.current(),
      answer: (same: boolean) => answerImpl.current(same),
      tap: (index: number) => tapImpl.current(index),
      current: () => {
        const m = machine.current;
        return {
          running: m.running,
          stage: m.stage,
          phase: m.phase,
          round: m.round,
          roundTotal: SEQ_ROUNDS,
          pos: m.pos,
          len: m.len,
          showing: m.showing,
          litSlot: m.litSlot,
          expect: m.expect,
        };
      },
    });
  }

  const waitForAnswer = (ms: number) =>
    new Promise<boolean | null>((resolve) => {
      let done = false;
      const finish = (v: boolean | null) => {
        if (done) return;
        done = true;
        answerResolve.current = null;
        canAnswer.current = false;
        resolve(v);
      };
      answerResolve.current = (same) => finish(same);
      canAnswer.current = true;
      const id = window.setTimeout(() => {
        untrackTimer(entry);
        finish(null);
      }, ms);
      const entry = trackTimer(id, () => finish(null));
    });

  // 阶段 B 召回等待：与 waitForAnswer 同模式（超时 resolve(null)，卸载经 flushTimers 收尾）
  const waitForTap = (ms: number) =>
    new Promise<number | null>((resolve) => {
      let done = false;
      const finish = (v: number | null) => {
        if (done) return;
        done = true;
        tapResolve.current = null;
        canTap.current = false;
        resolve(v);
      };
      tapResolve.current = (index) => finish(index);
      canTap.current = true;
      const id = window.setTimeout(() => {
        untrackTimer(entry);
        finish(null);
      }, ms);
      const entry = trackTimer(id, () => finish(null));
    });

  async function runGame() {
    const n = useGameFlow.getState().nbackLevel;
    const challenge = getDailyChallenge("starArray");
    const showMs = Math.round(SHOW_MS * challenge.pace);
    const gapMs = Math.round(GAP_MS * challenge.pace);
    const sequenceRandom = seededRandom(challenge.seed);
    const mySeq = generateSequence(n, sequenceRandom);
    const myRun = ++runId.current;
    let streak = 0;
    const delay = (ms: number) =>
      new Promise<void>((r) => {
        const id = window.setTimeout(() => {
          untrackTimer(entry);
          r();
        }, ms);
        const entry = trackTimer(id, r);
      });
    const alive = () => !cancelled.current && runId.current === myRun;

    // ---- 阶段 A：N-back 判断（逻辑与参数原样保留，唯一变化是结束后不进结算） ----
    machine.current.running = true;
    machine.current.stage = "recall";
    machine.current.phase = "nback";
    await delay(400);
    for (let i = 0; i < mySeq.length; i++) {
      if (!alive()) return;
      const t = mySeq[i];
      showLit(t.slot);
      setRememberSlot(i >= n ? mySeq[i - n].slot : -1);
      publishStarProgress(Math.max(0, i - n + 1), COMPARE_COUNT);
      if (i < n) {
        setCat("curious", "Remember this star... here comes the next one.");
        await delay(showMs + 300);
      } else {
        const t0 = performance.now();
        const ans = await waitForAnswer(showMs + 700);
        if (!alive()) return;
        if (ans === null) {
          streak = 0;
          setCat("encouraging", "The stardust drifted away... stay with me~");
        } else if (ans === t.isMatch) {
          stats.current.correct++;
          stats.current.rtSum += performance.now() - t0;
          stats.current.rtCount++;
          streak += 1;
          if (streak >= 3) {
            soundManager.reward();
            // 伙伴对话条高光（播放中队列非空时自动忽略，不叠台词）
            useDialogue.getState().push(COMPANION_DIALOGUES.starStreak);
          } else {
            soundManager.success();
            setCat("happy", "Star spirits connected!");
          }
          showLit(-1);
          setRememberSlot(-1);
        } else {
          streak = 0;
          soundManager.miss();
          setCat("encouraging", "A wisp of mist... nothing lost! Let's keep flying.");
          showLit(-1);
          setRememberSlot(-1);
        }
        await delay(420);
      }
      if (!alive()) return;
      showLit(-1);
      setRememberSlot(-1);
      await delay(gapMs);
    }
    if (!alive()) return;
    showLit(-1);
    setRememberSlot(-1);

    // ---- 阶段过渡：overlay 显示过渡卡，伙伴引导台词，约 2.8s 后自动进入阶段 B ----
    publishStarStage("sequence", { round: 0, total: SEQ_ROUNDS, pos: 0, len: 0, showing: false });
    machine.current.stage = "sequence";
    machine.current.phase = "transition";
    machine.current.round = 0;
    machine.current.pos = 0;
    machine.current.len = 0;
    machine.current.showing = false;
    machine.current.expect = -1;
    setCat("curious", "Now the stars dance in an order — watch closely, then repeat their dance!");
    useDialogue.getState().push(COMPANION_DIALOGUES.starSeqIntro);
    await delay(2800);
    if (!alive()) return;

    // ---- 阶段 B：顺序还原（seqLevel 开局快照，整局固定） ----
    const len = useGameFlow.getState().seqLevel;
    let seqFirstTry = 0;
    for (let round = 1; round <= SEQ_ROUNDS; round++) {
      const order = generateStarOrder(len, seededRandom(challenge.seed + round * 6151));
      // 呈现：依次点亮再熄灭（showing 期间 canTap 未开启，点击被忽略）
      machine.current.phase = "showing";
      machine.current.round = round;
      machine.current.len = len;
      machine.current.pos = 0;
      machine.current.showing = true;
      machine.current.expect = -1;
      publishStarStage("sequence", { round, total: SEQ_ROUNDS, pos: 0, len, showing: true });
      setCat("curious", `Round ${round} — remember the order of the lights...`);
      for (let k = 0; k < order.length; k++) {
        if (!alive()) return;
        showLit(order[k]);
        await delay(showMs);
        if (!alive()) return;
        showLit(-1);
        await delay(gapMs);
      }
      if (!alive()) return;

      // 召回：按原顺序点击还原
      setRecallDone([]); // 每轮重置金色反馈，避免上一轮的星位给出答案提示
      let pointer = 0;
      let wrongOnPos = 0;
      machine.current.phase = "recall";
      machine.current.showing = false;
      machine.current.expect = order[0];
      publishStarStage("sequence", { round, total: SEQ_ROUNDS, pos: 0, len, showing: false });
      while (pointer < len) {
        if (!alive()) return;
        const t0 = performance.now();
        const hit = await waitForTap(SEQ_TAP_TIMEOUT);
        if (!alive()) return;
        const expectSlot = order[pointer];
        if (hit === expectSlot && wrongOnPos === 0) {
          // 该位置首次点对：计首对 + 反应时（与阶段 A 共用同一组 rt 统计），持续金色，指针前进
          seqFirstTry++;
          stats.current.rtSum += performance.now() - t0;
          stats.current.rtCount++;
          soundManager.success();
          setRecallDone((d) => [...d, expectSlot]);
          pointer++;
          wrongOnPos = 0;
        } else if (hit === expectSlot) {
          // 重试后点对：照样前进并金色鼓励，但不计首对/反应时
          soundManager.success();
          setRecallDone((d) => [...d, expectSlot]);
          pointer++;
          wrongOnPos = 0;
        } else if (hit !== null) {
          // 点错：柔和提示音 + 暗蓝闪烁，指针不变可重试
          wrongOnPos++;
          soundManager.softMiss();
          flashWrong(hit);
          if (wrongOnPos >= SEQ_WRONG_LIMIT) {
            // 同一位置错够 4 次：温和揭示并前进（该位不计首对）
            revealStar(expectSlot);
            setCat("encouraging", "No rush — look, this star was waiting for you.");
            pointer++;
            wrongOnPos = 0;
          }
        } else {
          // 8s 无任何点击：同样温和揭示并前进（该位不计首对）
          revealStar(expectSlot);
          setCat("encouraging", "No rush — look, this star was waiting for you.");
          pointer++;
          wrongOnPos = 0;
        }
        machine.current.pos = pointer;
        machine.current.expect = pointer < len ? order[pointer] : -1;
        publishStarStage("sequence", { round, total: SEQ_ROUNDS, pos: pointer, len, showing: false });
      }
      // 本轮完成：奖励音效 + 随机鼓励语，间隔约 0.8s 进下一轮
      soundManager.reward();
      setCat("happy", pick(ROUND_LINES));
      await delay(800);
      if (!alive()) return;
    }

    // ---- 结算：两阶段加权合并正确率，共用一次 finishStar（结算管线契约不变） ----
    const seqTotal = len * SEQ_ROUNDS;
    const combined = (stats.current.correct + seqFirstTry) / (COMPARE_COUNT + seqTotal);
    const seqAcc = seqTotal ? seqFirstTry / seqTotal : 1;
    const avgRT = stats.current.rtCount ? stats.current.rtSum / stats.current.rtCount : 0;
    soundManager.complete();
    machine.current.running = false;
    machine.current.phase = "idle";
    machine.current.showing = false;
    machine.current.expect = -1;
    showLit(-1);
    finishStar(combined, seqAcc, avgRT, COMPARE_COUNT + seqTotal);
  }

  return (
    <>
      <color attach="background" args={["#0a0d24"]} />
      <fog attach="fog" args={["#0a0d24", 14, 46]} />
      <ambientLight intensity={0.5} color="#93a7e8" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.6, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#151d42" roughness={0.9} />
      </mesh>
      <Fireflies count={50} area={14} color="#bcd6ff" />

      <group position={[0, 0.4, -1]}>
        {SLOTS.map(([x, y], i) => {
          const lit = litSlot === i;
          const hint = rememberSlot === i && !lit;
          const done = recallDone.includes(i) && !lit;
          const wrong = wrongFlash === i;
          const reveal = revealSlot === i;
          return (
            <group key={i} position={[x, y, 0]}>
              {/* 命中体：稍大的透明球，方便儿童点中；与注册表 tap 同一处理函数 */}
              <mesh
                onClick={(e) => { e.stopPropagation(); tapImpl.current(i); }}
                onPointerOver={() => { if (machine.current.phase === "recall") document.body.style.cursor = "pointer"; }}
                onPointerOut={() => { document.body.style.cursor = "auto"; }}
              >
                <sphereGeometry args={[0.62, 8, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh>
                <icosahedronGeometry args={[0.34, 1]} />
                <meshStandardMaterial color="#2a3564" emissive="#2a3564" emissiveIntensity={0.35} flatShading />
              </mesh>
              {lit && (
                <>
                  <mesh>
                    <icosahedronGeometry args={[0.52, 1]} />
                    <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
                  </mesh>
                  <pointLight color="#ffdf91" intensity={8} distance={6} decay={2} />
                </>
              )}
              {/* 阶段 B 召回期已点对：持续金色（比呈现期略柔和不抢戏） */}
              {done && (
                <mesh>
                  <icosahedronGeometry args={[0.46, 1]} />
                  <meshBasicMaterial color="#ffd98a" toneMapped={false} />
                </mesh>
              )}
              {/* 点错温和反馈：暗蓝半透明闪烁（禁用红色） */}
              {wrong && (
                <mesh>
                  <icosahedronGeometry args={[0.6, 1]} />
                  <meshBasicMaterial color="#6d7ec8" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
                </mesh>
              )}
              {/* 温和揭示：脉冲高亮环，提示"这颗在等你" */}
              {reveal && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.66, 0.045, 8, 32]} />
                  <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
                </mesh>
              )}
              {hint && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.62, 0.035, 8, 32]} />
                  <meshBasicMaterial color="#8ab6ff" toneMapped={false} />
                </mesh>
              )}
            </group>
          );
        })}
      </group>

      <CatCompanion anchor={[-4.4, -1.6, 2.5]} size={1.6} />

      <PostFX />
    </>
  );
}
