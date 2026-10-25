import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import PostFX from "../../effects/PostFX";
import Fireflies from "../../objects/Fireflies";
import CatCompanion from "../../objects/CatCompanion";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow, publishBreathInfo, registerBreathScene, type BreathPhase } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import { getDailyChallenge } from "../../lib/dailyChallenge";

// 低语湖畔 · 呼吸正念（情绪调节场景，ADHD 儿童友好：无成败、无对错、无倒计时压力）
// 3 轮 4-4-6 节奏：吸气 4s → 屏息 4s → 呼气 6s
// 相位推进全部在 useFrame 里用 dt 累积计时，不用 setInterval/setTimeout ——
// R3F 空闲时会跳过整帧渲染，定时器回调可能与渲染帧脱节（见 GlyphTrialScene 的教训）

const TOTAL_ROUNDS = 3;
const PHASE_DUR: Record<BreathPhase, number> = { inhale: 4, hold: 4, exhale: 6 };
// 光球缩放范围（呼气末 → 吸气末）
const SCALE_MIN = 0.85;
const SCALE_MAX = 1.5;
// 相位配色：吸气暖金 → 屏息亮青 → 呼气淡紫
const PHASE_COLOR: Record<BreathPhase, string> = {
  inhale: "#ffd98a",
  hold: "#8fe8dc",
  exhale: "#c4b5fd",
};
const IDLE_COLOR = "#6f86c8";
// 呼气涟漪：在呼气相位的第 0/2/4 秒各放出一圈扩散环
const RIPPLE_SPAWNS = [0, 2, 4];
const RIPPLE_LIFE = 2.6;

// smoothstep 缓动：让光球涨缩的起止都柔和
const ease = (x: number) => x * x * (3 - 2 * x);

interface Ripple {
  active: boolean;
  age: number;
}

export default function BreathingScene() {
  // 会话时间线（不进 React state，逐帧推进）
  const st = useRef({ running: false, phase: "inhale" as BreathPhase, t: 0, round: 1, totalRounds: TOTAL_ROUNDS });
  const lastPubSec = useRef(-1);
  const spawnedRipples = useRef(0);
  const ripples = useRef<Ripple[]>([
    { active: false, age: 0 },
    { active: false, age: 0 },
    { active: false, age: 0 },
  ]);

  const orb = useRef<THREE.Mesh>(null);
  const glow1 = useRef<THREE.Mesh>(null);
  const glow2 = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const ringMeshes = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  // 当前显示色（逐帧向目标色阻尼靠拢，避免相位切换时颜色跳变）
  const curColor = useRef(new THREE.Color(IDLE_COLOR));

  const setCat = useGameStore((s) => s.setCat);

  // 注册表的函数引用必须恒定，具体实现通过 ref 追踪最新闭包（同 glyph/star 模式）
  const registered = useRef(false);
  const startImpl = useRef<() => void>(() => {});

  // 场景卸载（切屏）时：停止会话并注销注册表，避免串场
  useEffect(() => {
    return () => {
      st.current.running = false;
      registered.current = false;
      registerBreathScene(null);
    };
  }, []);

  // 进入新相位：重置计时、播报 2D 层、播放相位音效
  const enterPhase = (phase: BreathPhase, round: number) => {
    st.current.phase = phase;
    st.current.t = 0;
    st.current.round = round;
    lastPubSec.current = -1;
    spawnedRipples.current = 0;
    publishBreathInfo(phase, round, st.current.totalRounds, PHASE_DUR[phase]);
    if (phase === "inhale") soundManager.breatheIn();
    if (phase === "exhale") soundManager.breatheOut();
  };

  startImpl.current = () => {
    ripples.current.forEach((r) => { r.active = false; r.age = 0; });
    st.current.running = true;
    st.current.totalRounds = getDailyChallenge("breathing").breathingRounds;
    enterPhase("inhale", 1);
    setCat("calm", `${getDailyChallenge("breathing").theme}: follow the light with your breath... in slow, hold soft, out like mist.`);
  };
  if (!registered.current) {
    registered.current = true;
    registerBreathScene({ start: () => startImpl.current() });
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1); // 掉帧时钳制步长，避免相位直接跳过
    const s = st.current;

    // ---- 时间线推进 ----
    if (s.running) {
      s.t += dt;
      const dur = PHASE_DUR[s.phase];
      // 秒数变化时才发布，避免每帧穿透 zustand
      const secLeft = Math.max(0, Math.ceil(dur - s.t));
      if (secLeft !== lastPubSec.current) {
        lastPubSec.current = secLeft;
        publishBreathInfo(s.phase, s.round, TOTAL_ROUNDS, secLeft);
      }
      // 呼气相位：按时刻表激活涟漪
      if (s.phase === "exhale" && spawnedRipples.current < RIPPLE_SPAWNS.length) {
        if (s.t >= RIPPLE_SPAWNS[spawnedRipples.current]) {
          const r = ripples.current[spawnedRipples.current];
          r.active = true;
          r.age = 0;
          spawnedRipples.current += 1;
        }
      }
      if (s.t >= dur) {
        if (s.phase === "inhale") enterPhase("hold", s.round);
        else if (s.phase === "hold") enterPhase("exhale", s.round);
        else if (s.round < s.totalRounds) enterPhase("inhale", s.round + 1);
        else {
          // 3 轮完成：结算（完成即满值，正念无成败）
          s.running = false;
          soundManager.complete();
          useGameFlow.getState().finishBreath(s.totalRounds);
        }
      }
    }

    // ---- 光球缩放 ----
    let scale: number;
    if (!s.running) {
      // 待机：中位轻缓浮动
      scale = 1.05 + Math.sin(performance.now() * 0.001) * 0.05;
    } else if (s.phase === "inhale") {
      scale = THREE.MathUtils.lerp(SCALE_MIN, SCALE_MAX, ease(Math.min(1, s.t / PHASE_DUR.inhale)));
    } else if (s.phase === "hold") {
      scale = SCALE_MAX + Math.sin(s.t * 2.4) * 0.03; // 屏息：高位轻微脉动
    } else {
      scale = THREE.MathUtils.lerp(SCALE_MAX, SCALE_MIN, ease(Math.min(1, s.t / PHASE_DUR.exhale)));
    }
    if (orb.current) orb.current.scale.setScalar(scale);
    if (glow1.current) glow1.current.scale.setScalar(scale * 1.45);
    if (glow2.current) glow2.current.scale.setScalar(scale * 2.1);
    if (light.current) light.current.intensity = 2 + (scale - SCALE_MIN) * 5;

    // ---- 光球颜色（阻尼过渡）----
    const target = s.running ? PHASE_COLOR[s.phase] : IDLE_COLOR;
    curColor.current.lerp(new THREE.Color(target), 1 - Math.pow(0.001, dt));
    if (orb.current) {
      const m = orb.current.material as THREE.MeshStandardMaterial;
      m.color.copy(curColor.current).multiplyScalar(0.55);
      m.emissive.copy(curColor.current);
    }
    if (glow1.current) (glow1.current.material as THREE.MeshBasicMaterial).color.copy(curColor.current);
    if (glow2.current) (glow2.current.material as THREE.MeshBasicMaterial).color.copy(curColor.current);
    if (light.current) light.current.color.copy(curColor.current);

    // ---- 涟漪推进：半径随龄扩张、透明度渐隐 ----
    for (let i = 0; i < ripples.current.length; i++) {
      const r = ripples.current[i];
      const mesh = ringMeshes.current[i];
      if (!mesh) continue;
      if (!r.active) {
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      r.age += dt;
      if (r.age >= RIPPLE_LIFE) {
        r.active = false;
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      const k = r.age / RIPPLE_LIFE;
      mesh.scale.setScalar(0.6 + k * 4.2);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
  });

  return (
    <>
      <color attach="background" args={["#05081a"]} />
      <fog attach="fog" args={["#060a18", 10, 55]} />
      <ambientLight intensity={0.3} color="#6f7fc0" />
      <hemisphereLight args={["#26315e", "#0a1220", 0.45]} />

      <Stars radius={120} depth={30} count={1800} factor={3.5} saturation={0.15} fade speed={0.4} />
      {/* 湖面残月 */}
      <mesh position={[-20, 22, -50]}>
        <sphereGeometry args={[3, 20, 20]} />
        <meshBasicMaterial color="#e8ecdc" toneMapped={false} />
      </mesh>

      {/* 夜晚湖面：低粗糙度反射环境光，深色 + 雾营造静谧 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[42, 40]} />
        <meshStandardMaterial color="#0a1626" roughness={0.16} metalness={0.55} />
      </mesh>
      {/* 湖心微光倒影带（呼吸光球正下方的柔和反光盘） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]}>
        <circleGeometry args={[2.6, 28]} />
        <meshBasicMaterial color="#223a5e" transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* 呼气涟漪：3 圈预分配，扩张 + 渐隐（湖面上方，与光球同轴） */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => { ringMeshes.current[i] = m; }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.04 + i * 0.004, -2]}
        >
          <ringGeometry args={[0.94, 1, 48]} />
          <meshBasicMaterial color="#9fd8e8" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}

      {/* 呼吸光球：内核 + 双层加色光晕（颜色/缩放由 useFrame 驱动） */}
      <group position={[0, 2.1, -2]}>
        <mesh ref={orb}>
          <sphereGeometry args={[1, 28, 28]} />
          <meshStandardMaterial color="#3a4a7a" emissive={IDLE_COLOR} emissiveIntensity={1.5} transparent opacity={0.96} />
        </mesh>
        <mesh ref={glow1}>
          <sphereGeometry args={[1, 20, 20]} />
          <meshBasicMaterial color={IDLE_COLOR} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={glow2}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={IDLE_COLOR} transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <pointLight ref={light} color={IDLE_COLOR} intensity={3} distance={16} decay={2} />
      </group>

      {/* 湖面萤光：低亮度青色系，比主场景更安静 */}
      <Fireflies count={32} area={13} color="#9fd0d8" />

      <CatCompanion anchor={[2.6, 0.4, 2.8]} size={1.5} />

      <PostFX />
    </>
  );
}
