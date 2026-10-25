import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import PostFX from "../../effects/PostFX";
import Fireflies from "../../objects/Fireflies";
import CatCompanion from "../../objects/CatCompanion";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow, publishGlyphOptions, publishGlyphProgress, registerGlyphScene } from "../../store/gameFlow";
import { glyphTasks, wrongPickLines, type GlyphTask } from "../../data/glyphTasks";
import { soundManager } from "../../lib/sounds";
import { getDailyChallenge, seededRandom } from "../../lib/dailyChallenge";
import { speakBrowserLine, stopSpeech } from "../../lib/aiSpeech";

// 古书阁·符形试炼
// 题库移植自 web-prototype/data/literacyTasks.ts；环形悬浮字球 3D 化
// 设计红线：答错永远没有红叉/低分——妖气球只是"飘远捉迷藏"

const RADIUS_X = 2.85;
const RADIUS_Y = 1.75;
const ROUNDS = 8;

// 字形贴片：2D canvas 绘字 → CanvasTexture。
// 不用 drei/troika 的 <Text>：它在 Web Worker 里加载解析 woff2，加载期间整个 Suspense
// 边界挂起、场景无法提交，useFrame 订阅永远不会建立——这是"答对后卡在同一轮"的根因之一。
// canvas 绘字不 suspend，且复用页面 @font-face 已加载的 Noto Sans SC。
function GlyphChar({
  char,
  color = "#fff8df",
  size = 0.9,
  position = [0, 0, 0.055] as [number, number, number],
}: {
  char: string;
  color?: string;
  size?: number;
  position?: [number, number, number];
}) {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // 确保 webfont 就绪后再重绘一次，避免先用回退字体光栅化
    document.fonts.load('600 100px "Noto Sans SC"', char).then(() => {
      if (alive) setFontReady(true);
    }).catch(() => { /* 字体不可用时用系统回退，仍可渲染 */ });
    return () => { alive = false; };
  }, [char]);

  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.font = '700 360px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(255, 224, 148, 0.55)";
    ctx.shadowBlur = 18;
    ctx.fillText(char, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, color, fontReady]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position} renderOrder={2}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.05}
        depthWrite
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

interface Option { char: string; isTarget: boolean; vanish: number; }
interface RoundData { task: GlyphTask; options: Option[]; }

function buildRound(optionCount: number, roundNumber: number): RoundData {
  const challenge = getDailyChallenge("glyphTrial");
  const random = seededRandom(challenge.seed + roundNumber * 7919);
  const task = glyphTasks[(challenge.glyphOffset + roundNumber) % glyphTasks.length];
  const distractors = [...task.distractors].sort(() => random() - 0.5).slice(0, optionCount - 1);
  const chars = [task.target, ...distractors].sort(() => random() - 0.5);
  return { task, options: chars.map((c) => ({ char: c, isTarget: c === task.target, vanish: 0 })) };
}

function speak(text: string) {
  speakBrowserLine("momo", text, "zh-CN");
}

export default function GlyphTrialScene() {
  const [round, setRound] = useState<RoundData>(() => buildRound(useGameFlow.getState().glyphLevel, 0));
  const roundIdx = useRef(0);
  const stats = useRef({ correct: 0, wrong: 0, rtSum: 0, rtCount: 0 });
  const roundStart = useRef(0);
  const locked = useRef(false);
  const ring = useRef<THREE.Group>(null);
  const optionGroups = useRef<(THREE.Group | null)[]>([]);
  const badgeGroups = useRef<(THREE.Group | null)[]>([]);
  const optionMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const haloMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const frameMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const selectedIndex = useRef(-1);
  const floatPhases = useMemo(() => Array.from({ length: 5 }, (_, i) => i * 1.73), []);
  const burst = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([]);
  const cancelled = useRef(false);
  const roundRef = useRef(round); // 最新一题的镜像：pick() 由注册表调用，闭包里的 round 可能滞后
  const timer = useRef<number | null>(null);
  // 下一题倒计时：不能依赖 setTimeout —— R3F 在空闲时会主动跳过整帧渲染，
  // 而该渲染帧里的定时器回调也可能被一起跳过，导致回合卡住。改为在 useFrame 里用 dt 推进。
  const nextRoundIn = useRef<number | null>(null);
  const vanishRemaining = useRef<number[]>([]);
  roundRef.current = round;

  const setCat = useGameStore((s) => s.setCat);
  const finishGlyph = useGameFlow((s) => s.finishGlyph);
  const phaseRef = useRef<"intro" | "playing" | "result">("intro");
  // 注册表里存放的函数对象必须在多次渲染间保持不变（只在挂载时写入一次），
  // 否则每次渲染都会用新闭包覆盖注册表，2D 层可能拿到过期闭包的引用。
  const registered = useRef(false);
  const pickImpl = useRef<(i: number) => void>(() => {});
  const startImpl = useRef<() => void>(() => {});

  useEffect(() => {
    // 场景卸载（切屏）时：作废所有 pending 定时器，并注销注册表，避免串场
    return () => {
      cancelled.current = true;
      phaseRef.current = "intro";
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      registered.current = false;
      registerGlyphScene(null);
      stopSpeech();
    };
  }, []);

  // 把 2D 层的开始/答题转成本场景可调用的接口。
  // 不用 effect 订阅总线：R3F 在 Canvas 内是同步递归渲染，且与页面主 React 的模块实例可能隔离，
  // effect 的提交时机与订阅都不可靠。改为渲染期写入 + 每次渲染后推送到 window 注册表。
  startImpl.current = () => {
    const challenge = getDailyChallenge("glyphTrial");
    useGameFlow.setState({ glyphPhase: "playing" });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    nextRoundIn.current = null;
    phaseRef.current = "playing";
    cancelled.current = false;
    roundIdx.current = 0;
    selectedIndex.current = -1;
    stats.current = { correct: 0, wrong: 0, rtSum: 0, rtCount: 0 };
    const r = buildRound(useGameFlow.getState().glyphLevel, 0);
    vanishRemaining.current = Array(r.options.length).fill(0);
    roundRef.current = r;
    setRound(r);
    roundStart.current = performance.now();
    locked.current = false;
    publishGlyphProgress(0, ROUNDS);
    setCat("curious", `Today's library theme is ${challenge.theme}. Listen and find the true glyph!`);
    timer.current = window.setTimeout(() => speak(r.task.prompt.split(" · ")[1] ?? r.task.prompt), 400);
  };
  pickImpl.current = (i: number) => pick(i);
  // 只写入一次注册表（函数引用恒定，内部实现通过 ref 追踪最新闭包）
  if (!registered.current) {
    registered.current = true;
    registerGlyphScene({
      start: () => startImpl.current(),
      pick: (i: number) => pickImpl.current(i),
    });
  }

  // 选项镜像到 2D 层（底部字形按钮）；签名去重，避免消失动画每帧穿透
  const optionSig = round.options.map((o) => `${o.char}${o.vanish > 0 ? "-" : "+"}`).join("|");
  const mirroredSig = useRef("");
  if (mirroredSig.current !== optionSig) {
    mirroredSig.current = optionSig;
    publishGlyphOptions(round.options.map((o) => ({ char: o.char, vanish: o.vanish > 0 })));
  }

  const nextRound = () => {
    if (cancelled.current) return;
    roundIdx.current += 1;
    selectedIndex.current = -1;
    if (roundIdx.current >= ROUNDS) {
      phaseRef.current = "result";
      const s = stats.current;
      const accuracy = s.correct / ROUNDS;
      const avgRT = s.rtCount ? s.rtSum / s.rtCount : 0;
      finishGlyph(accuracy, avgRT, ROUNDS, roundRef.current.options.length);
      soundManager.complete();
      useGameFlow.setState({ glyphPhase: "result" });
    } else {
      const r = buildRound(useGameFlow.getState().glyphLevel, roundIdx.current);
      vanishRemaining.current = Array(r.options.length).fill(0);
      roundRef.current = r;
      setRound(r);
      roundStart.current = performance.now();
      locked.current = false;
      // 手动同步 2D 层；后面的签名去重仍会在渲染时校正一次
      publishGlyphOptions(r.options.map((o) => ({ char: o.char, vanish: o.vanish > 0 })));
      publishGlyphProgress(roundIdx.current, ROUNDS);
      speak(r.task.prompt.split(" · ")[1] ?? r.task.prompt);
    }
  };

  const invalidate = useThree((s) => s.invalidate);
  const viewport = useThree((s) => s.viewport);
  const radiusX = Math.min(RADIUS_X, Math.max(1.25, viewport.width / 2 - 1.45));
  const radiusY = Math.min(RADIUS_Y, Math.max(1.05, viewport.height * 0.2));

  useFrame((_, dt) => {
    const now = performance.now() * 0.001;
    if (ring.current) {
      ring.current.position.z = -1.25 + Math.sin(now * 0.35) * 0.08;
    }
    optionGroups.current.forEach((group, i) => {
      if (!group) return;
      const angle = (i / Math.max(1, roundRef.current.options.length)) * Math.PI * 2;
      const phase = floatPhases[i] ?? 0;
      const pulse = 0.5 + Math.sin(now * 2.4 + phase) * 0.5;
      const baseX = Math.sin(angle) * radiusX;
      const orbit = now * 0.22;
      group.position.x = baseX * Math.cos(orbit);
      group.position.y = Math.cos(angle) * radiusY + Math.sin(now * 1.25 + phase) * 0.11;
      group.position.z = -baseX * Math.sin(orbit) + Math.sin(now * 0.9 + phase) * 0.16;
      group.rotation.z = Math.sin(now * 0.8 + phase) * 0.025;
      if (badgeGroups.current[i]) {
        badgeGroups.current[i]!.rotation.y = Math.sin(now * 0.72 + phase) * 0.16;
        badgeGroups.current[i]!.rotation.x = Math.cos(now * 0.58 + phase) * 0.06;
      }
      const selected = i === selectedIndex.current;
      if (haloMaterials.current[i]) {
        haloMaterials.current[i]!.opacity = selected ? 0.3 + pulse * 0.18 : 0.09 + pulse * 0.035;
      }
      if (frameMaterials.current[i]) {
        frameMaterials.current[i]!.opacity = selected ? 0.95 : 0.52 + pulse * 0.12;
      }
      if (optionMaterials.current[i] && vanishRemaining.current[i] <= 0) {
        optionMaterials.current[i]!.opacity = selected ? 0.96 : 0.78;
      }
    });
    if (nextRoundIn.current !== null) {
      nextRoundIn.current -= dt;
      if (nextRoundIn.current <= 0) {
        nextRoundIn.current = null;
        nextRound();
      }
    }
    let finishedVanishing = false;
    for (let i = 0; i < vanishRemaining.current.length; i++) {
      const remaining = vanishRemaining.current[i];
      if (remaining <= 0) continue;
      const next = Math.max(0, remaining - dt);
      vanishRemaining.current[i] = next;
      const progress = next / 1.4;
      if (optionGroups.current[i]) optionGroups.current[i]!.scale.setScalar(0.6 + progress * 0.4);
      if (optionMaterials.current[i]) optionMaterials.current[i]!.opacity = 0.55 * progress;
      if (next === 0) finishedVanishing = true;
    }
    if (finishedVanishing) {
      const next: RoundData = {
        ...roundRef.current,
        options: roundRef.current.options.map((option, i) =>
          vanishRemaining.current[i] === 0 && option.vanish > 0
            ? { ...option, vanish: 0 }
            : option
        ),
      };
      roundRef.current = next;
      setRound(next);
      publishGlyphOptions(next.options.map((option) => ({ char: option.char, vanish: option.vanish > 0 })));
    }
    if (burst.current) {
      const dummy = new THREE.Object3D();
      particles.current = particles.current.filter((p) => (p.life -= dt) > 0);
      const n = Math.min(particles.current.length, 60);
      particles.current.length = n; // 池容量固定 60，超出的直接淘汰，避免 setMatrixAt 越界
      for (let i = 0; i < n; i++) {
        const p = particles.current[i];
        p.pos.addScaledVector(p.vel, dt);
        p.vel.y -= dt * 1.2;
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(Math.max(p.life, 0.001) * 0.16);
        dummy.updateMatrix();
        burst.current.setMatrixAt(i, dummy.matrix);
      }
      burst.current.count = n;
      burst.current.instanceMatrix.needsUpdate = true;
    }
  });

  const spawnBurst = (index: number) => {
    const origin = new THREE.Vector3();
    ring.current?.updateMatrixWorld(true);
    optionGroups.current[index]?.getWorldPosition(origin);
    origin.z += 0.12;
    for (let i = 0; i < 26; i++) {
      particles.current.push({
        pos: origin.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.4),
        life: 0.8 + Math.random() * 0.7,
      });
    }
  };

  const pick = (i: number) => {
    if (locked.current || cancelled.current || phaseRef.current !== "playing") return;
    const cur = roundRef.current;
    const o = cur.options[i];
    if (!o || o.vanish > 0) return;
    if (o.isTarget) {
      locked.current = true;
      selectedIndex.current = i;
      stats.current.correct++;
      stats.current.rtSum += performance.now() - roundStart.current;
      stats.current.rtCount++;
      spawnBurst(i);
      soundManager.success();
      setCat("proud", "Yes! The true glyph shines again~");
      speak("对！");
      nextRoundIn.current = 1.2; // 交给 useFrame 推进，见上方说明
      invalidate();
    } else {
      // 先把该选项标记为消失（同步写 ref，避免连点重复扣分），再走逃生话术
      stats.current.wrong++;
      vanishRemaining.current[i] = 1.4;
      const next: RoundData = {
        ...cur,
        options: cur.options.map((x, xi) => (xi === i ? { ...x, vanish: 1.4 } : x)),
      };
      roundRef.current = next;
      setRound(next);
      invalidate();
      // 立即把"已飘走"同步到 2D 层，不等下一次渲染（消失动画每帧都会再推一次）
      publishGlyphOptions(next.options.map((x) => ({ char: x.char, vanish: x.vanish > 0 })));
      soundManager.miss();
      setCat("encouraging", wrongPickLines[Math.floor(Math.random() * wrongPickLines.length)]);
    }
  };

  return (
    <>
      <color attach="background" args={["#140f0a"]} />
      <fog attach="fog" args={["#1a1208", 12, 40]} />
      <ambientLight intensity={0.5} color="#e8d5b0" />
      <pointLight position={[0, 5, 0]} intensity={12} distance={18} color="#ffca7a" decay={2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <circleGeometry args={[7.5, 40]} />
        <meshStandardMaterial color="#3a2c1c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.18, 0]}>
        <ringGeometry args={[5.9, 6.2, 48]} />
        <meshBasicMaterial color="#c9973f" toneMapped={false} transparent opacity={0.6} />
      </mesh>
      <group position={[0, 0, -6]}>
        <Fireflies count={12} area={8} color="#897650" />
      </group>

      <group ref={ring} position={[0, 1.55, -1.25]}>
        {round.options.map((o, i) => {
          const a = (i / round.options.length) * Math.PI * 2;
          const x = Math.sin(a) * radiusX;
          const y = Math.cos(a) * radiusY;
          return (
            <group
              key={`${round.task.target}-${o.char}-${i}`}
              ref={(group) => { optionGroups.current[i] = group; }}
              position={[x, y, 0]}
            >
              <mesh
                onClick={(e) => { e.stopPropagation(); pick(i); }}
                onPointerOver={() => (document.body.style.cursor = "pointer")}
                onPointerOut={() => (document.body.style.cursor = "auto")}
              >
                <sphereGeometry args={[0.7, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Billboard>
                <group ref={(badge) => { badgeGroups.current[i] = badge; }}>
                  <mesh position={[0, 0, -0.05]} renderOrder={0}>
                    <circleGeometry args={[0.72, 48]} />
                    <meshBasicMaterial
                      ref={(material) => { haloMaterials.current[i] = material; }}
                      color="#91b9ff"
                      transparent
                      opacity={0.1}
                      depthWrite={false}
                      blending={THREE.AdditiveBlending}
                      toneMapped={false}
                    />
                  </mesh>
                  <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
                    <cylinderGeometry args={[0.59, 0.59, 0.16, 48]} />
                    <meshStandardMaterial
                      color="#20345b"
                      metalness={0.58}
                      roughness={0.28}
                      transparent
                      opacity={o.vanish > 0 ? 0.55 : 0.94}
                    />
                  </mesh>
                  <mesh position={[0, 0, 0.085]} renderOrder={2}>
                    <circleGeometry args={[0.57, 48]} />
                    <meshBasicMaterial
                      ref={(material) => { optionMaterials.current[i] = material; }}
                      color="#182849"
                      transparent
                      opacity={o.vanish > 0 ? 0.55 : 0.88}
                      depthWrite
                    />
                  </mesh>
                  <mesh position={[0, 0, 0.1]} renderOrder={3}>
                    <ringGeometry args={[0.52, 0.565, 48]} />
                    <meshBasicMaterial
                      ref={(material) => { frameMaterials.current[i] = material; }}
                      color="#b8d3ff"
                      transparent
                      opacity={0.68}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                  <mesh position={[0, 0, 0.108]} renderOrder={3}>
                    <ringGeometry args={[0.45, 0.465, 48]} />
                    <meshBasicMaterial
                      color="#6289cf"
                      transparent
                      opacity={0.55}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                  <GlyphChar char={o.char} color="#657da9" position={[0.035, -0.035, 0.12]} />
                  <GlyphChar char={o.char} position={[0, 0, 0.135]} />
                </group>
              </Billboard>
            </group>
          );
        })}
      </group>

      <instancedMesh ref={burst} args={[undefined, undefined, 60]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial color="#ffe9a8" toneMapped={false} transparent opacity={0.95} />
      </instancedMesh>

      <CatCompanion anchor={[0, -0.2, 4.6]} size={1.7} />

      <PostFX />
    </>
  );
}
