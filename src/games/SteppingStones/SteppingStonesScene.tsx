import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import PostFX from "../../effects/PostFX";
import Fireflies from "../../objects/Fireflies";
import CatCompanion from "../../objects/CatCompanion";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow, publishStonesProgress, registerStonesScene } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import { getDailyChallenge, seededRandom } from "../../lib/dailyChallenge";

// 溪光石阶 · 加工速度 + 持续注意训练
// 圆形石阵 7 块石阶（程序化 cylinder，无贴图），随机一块发暖金光，尽快点击；
// 点中下一块亮，共 20 试次；5s 未点记 miss（温和处理，无惩罚文案）
// 试次循环全部在 useFrame 里用 dt 推进（同 GoNoGoScene，不用 setTimeout）
// 红线：3D 场景内禁用 troika/drei Text（会挂起 Suspense），石阵上不放任何文字

const TOTAL_TRIALS = 20;
const STONE_COUNT = 7;
const MISS_S = 5;            // 点亮后 5s 未点 = miss（温和）
const PRE_S = 0.6;           // 开局首亮前的呼吸留白
const GAP_S = 0.9;           // 试次间隔基准（实际 = GAP_S / stonesSpeed，速度越快间隔越短）
const GOLD = "#ffd98a";
const CENTER = { x: 0, z: -1 };
const RADIUS = 2.3;

// miss 的温和话术轮换（去污名化：永不出现红叉、扣分、失败字样）
const MISS_LINES = [
  "That sparkle drifted downstream... watch for the next stone~",
  "The stream kept that glow. Another stone is waking up!",
];
// 点中后的轻柔肯定
const HIT_LINES = [
  "Light paws! The stream sparkles for you~",
  "Quick as a skipping pebble!",
  "The stones sing under your steps~",
];

type Phase = "idle" | "pre" | "lit" | "gap";

interface Burst {
  active: boolean;
  age: number;
  dur: number;
  pos: THREE.Vector3;
  color: THREE.Color;
}

export default function SteppingStonesScene() {
  // 会话时间线（不进 React state，逐帧推进）
  const st = useRef({
    running: false,
    phase: "idle" as Phase,
    t: 0,
    index: 0,
    litIndex: -1,
    speed: 1,               // 开局时从 gameFlow.stonesSpeed 快照
    litStart: 0,            // 当前石阶点亮的 performance.now()，用于反应时
    correct: 0,
    rtSum: 0,
    rtCount: 0,
    random: Math.random as () => number,
    gapScale: 1,
  });

  // 石阵：圆形布局（椭圆纵深压扁一点，贴合相机视角），每块位置固定
  const stonePos = useMemo(
    () =>
      Array.from({ length: STONE_COUNT }, (_, i) => {
        const a = (i / STONE_COUNT) * Math.PI * 2 - Math.PI / 2;
        return new THREE.Vector3(
          CENTER.x + Math.cos(a) * RADIUS,
          0.18,
          CENTER.z + Math.sin(a) * RADIUS * 0.8
        );
      }),
    []
  );

  // 每块石阶的材质/光晕/点光引用，逐帧按 litIndex 驱动（避免 7 份 React state）
  const stoneMats = useRef<(THREE.MeshStandardMaterial | null)[]>(Array(STONE_COUNT).fill(null));
  const glowMats = useRef<(THREE.MeshBasicMaterial | null)[]>(Array(STONE_COUNT).fill(null));
  const stoneLights = useRef<(THREE.PointLight | null)[]>(Array(STONE_COUNT).fill(null));
  const waterMat = useRef<THREE.MeshBasicMaterial>(null);

  // 反馈特效：2 个预分配爆裂槽（金光爆裂，复用 GoNoGoScene 的 burst 模式）
  const BURST_PARTS = 8;
  const bursts = useRef<Burst[]>([
    { active: false, age: 0, dur: 0.55, pos: new THREE.Vector3(), color: new THREE.Color(GOLD) },
    { active: false, age: 0, dur: 0.55, pos: new THREE.Vector3(), color: new THREE.Color(GOLD) },
  ]);
  const burstRings = useRef<(THREE.Mesh | null)[]>([null, null]);
  // 粒子飞散方向（确定性球面分布，避免每帧随机分配）
  const partDirs = useMemo(
    () =>
      Array.from({ length: BURST_PARTS }, (_, i) => {
        const a = (i / BURST_PARTS) * Math.PI * 2;
        const b = (i % 3) * 0.7 - 0.7;
        return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b));
      }),
    []
  );
  const burstPartMeshes = useRef<(THREE.Mesh | null)[][]>(
    [Array(BURST_PARTS).fill(null), Array(BURST_PARTS).fill(null)]
  );

  const setCat = useGameStore((s) => s.setCat);

  // 注册表的函数引用必须恒定，具体实现通过 ref 追踪最新闭包（同 GoNoGoScene 模式）
  const registered = useRef(false);
  const startImpl = useRef<() => void>(() => {});
  const tapImpl = useRef<(index: number) => void>(() => {});

  // 场景卸载（切屏）时：停止会话并注销注册表，避免串场
  useEffect(() => {
    return () => {
      st.current.running = false;
      st.current.phase = "idle";
      registered.current = false;
      registerStonesScene(null);
    };
  }, []);

  const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

  const triggerBurst = (pos: THREE.Vector3, color: string) => {
    const b = bursts.current.find((x) => !x.active) ?? bursts.current[0];
    b.active = true;
    b.age = 0;
    b.pos.copy(pos);
    b.pos.y += 0.25; // 在石阶顶面绽放
    b.color.set(color);
  };

  const lightTrial = () => {
    const s = st.current;
    s.phase = "lit";
    s.t = 0;
    // 随机一块发光；避免与上一块相同，节奏更清晰
    let next = Math.floor(s.random() * STONE_COUNT);
    if (next === s.litIndex) next = (next + 1) % STONE_COUNT;
    s.litIndex = next;
    s.litStart = performance.now();
    publishStonesProgress(s.index + 1, TOTAL_TRIALS);
  };

  const finishGame = () => {
    const s = st.current;
    s.running = false;
    s.phase = "idle";
    s.litIndex = -1;
    soundManager.complete();
    const accuracy = s.correct / TOTAL_TRIALS;
    const avgRT = s.rtCount ? s.rtSum / s.rtCount : 0;
    useGameFlow.getState().finishStones(accuracy, avgRT, TOTAL_TRIALS);
  };

  // 点击判定（石阶 mesh onClick 与自动化 tap(index) 共用）：
  // 只响应发光石阶；点未发光石阶静默忽略（最温和，不惩罚）
  tapImpl.current = (index: number) => {
    const s = st.current;
    if (!s.running || s.phase !== "lit" || index !== s.litIndex) return;
    s.correct++;
    s.rtSum += performance.now() - s.litStart;
    s.rtCount++;
    soundManager.success();
    triggerBurst(stonePos[index], GOLD);
    setCat("happy", pick(HIT_LINES));
    s.phase = "gap";
    s.t = 0;
    s.litIndex = -1;
  };

  startImpl.current = () => {
    const s = st.current;
    s.running = true;
    s.phase = "pre";
    s.t = 0;
    s.index = 0;
    s.litIndex = -1;
    s.correct = 0;
    s.rtSum = 0;
    s.rtCount = 0;
    s.speed = useGameFlow.getState().stonesSpeed;
    const challenge = getDailyChallenge("stepStones");
    s.random = seededRandom(challenge.seed);
    s.gapScale = challenge.stoneGap;
    bursts.current.forEach((b) => { b.active = false; b.age = 0; });
    publishStonesProgress(0, TOTAL_TRIALS);
    setCat("curious", `${challenge.theme}: stream stones wake one by one — tap the golden glow!`);
  };
  if (!registered.current) {
    registered.current = true;
    registerStonesScene({
      start: () => startImpl.current(),
      tap: (index: number) => tapImpl.current(index),
      current: () => {
        const s = st.current;
        return {
          running: s.running,
          index: s.index,
          total: TOTAL_TRIALS,
          litIndex: s.phase === "lit" ? s.litIndex : -1,
        };
      },
    });
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1); // 掉帧时钳制步长，避免窗口期被跳过
    const s = st.current;
    const now = clock.elapsedTime;

    // ---- 时间线推进 ----
    if (s.running) {
      s.t += dt;
      if (s.phase === "pre" && s.t >= PRE_S) {
        lightTrial();
      } else if (s.phase === "lit" && s.t >= MISS_S) {
        // miss：温和处理——轻提示音 + 鼓励语，无惩罚文案，直接进下一试次
        soundManager.softMiss();
        setCat("encouraging", pick(MISS_LINES));
        s.phase = "gap";
        s.t = 0;
        s.litIndex = -1;
      } else if (s.phase === "gap" && s.t >= (GAP_S * s.gapScale) / s.speed) {
        s.index++;
        if (s.index >= TOTAL_TRIALS) finishGame();
        else lightTrial();
      }
    }

    // ---- 石阵发光状态：仅 litIndex 的暖金脉冲，其余保持溪石本色 ----
    for (let i = 0; i < STONE_COUNT; i++) {
      const lit = s.running && s.phase === "lit" && s.litIndex === i;
      const pulse = 0.7 + Math.sin(now * 5.2 + i) * 0.3;
      const m = stoneMats.current[i];
      if (m) {
        if (lit) {
          m.emissive.set(GOLD);
          m.emissiveIntensity = 1.6 * pulse;
        } else if (m.emissiveIntensity !== 0) {
          m.emissiveIntensity = 0;
        }
      }
      const g = glowMats.current[i];
      if (g) g.opacity = lit ? 0.3 * pulse : 0;
      const l = stoneLights.current[i];
      if (l) l.intensity = lit ? 2.2 * pulse : 0;
    }

    // ---- 溪面微光缓慢起伏 ----
    if (waterMat.current) waterMat.current.opacity = 0.3 + Math.sin(now * 0.9) * 0.05;

    // ---- 金光爆裂特效推进 ----
    for (let i = 0; i < bursts.current.length; i++) {
      const b = bursts.current[i];
      const parts = burstPartMeshes.current[i];
      const ring = burstRings.current[i];
      if (!b.active) continue;
      b.age += dt;
      const k = b.age / b.dur;
      if (k >= 1) {
        b.active = false;
        parts.forEach((p) => { if (p) (p.material as THREE.MeshBasicMaterial).opacity = 0; });
        if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      parts.forEach((p, j) => {
        if (!p) return;
        const dir = partDirs[j];
        const dist = 0.2 + k * 1.7;
        p.position.set(b.pos.x + dir.x * dist, b.pos.y + dir.y * dist, b.pos.z + dir.z * dist);
        p.scale.setScalar(1 - k * 0.4);
        const m = p.material as THREE.MeshBasicMaterial;
        m.color.copy(b.color);
        m.opacity = (1 - k) * 0.9;
      });
      if (ring) {
        ring.position.copy(b.pos);
        ring.scale.setScalar(0.3 + k * 2.0);
        const m = ring.material as THREE.MeshBasicMaterial;
        m.color.copy(b.color);
        m.opacity = (1 - k) * 0.55;
      }
    }
  });

  return (
    <>
      <color attach="background" args={["#071019"]} />
      <fog attach="fog" args={["#0a1a24", 12, 50]} />
      <ambientLight intensity={0.34} color="#7f9ccc" />
      <hemisphereLight args={["#2a4060", "#0c1410", 0.5]} />

      <Stars radius={120} depth={30} count={1800} factor={3.2} saturation={0.15} fade speed={0.4} />
      {/* 溪畔上弦月 */}
      <mesh position={[16, 20, -46]}>
        <sphereGeometry args={[2.6, 20, 20]} />
        <meshBasicMaterial color="#ecebd8" toneMapped={false} />
      </mesh>

      {/* 夜色溪岸：纯色地面 + 雾，远处矮丘剪影 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[40, 36]} />
        <meshStandardMaterial color="#0c1620" roughness={0.9} />
      </mesh>
      {[[-14, -18, 3.2], [12, -22, 4.2], [-2, -28, 5.2]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.1, z]} scale={[1.6, 0.5, 1]}>
          <sphereGeometry args={[r, 14, 10]} />
          <meshStandardMaterial color="#10202e" roughness={1} flatShading />
        </mesh>
      ))}

      {/* 溪面：石阵下方的浅溪，additive 青光微亮（无贴图，纯材质） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, CENTER.z]} scale={[1.5, 1, 0.85]}>
        <circleGeometry args={[4.6, 28]} />
        <meshBasicMaterial
          ref={waterMat}
          color="#1b5e66" transparent opacity={0.3} depthWrite={false}
          blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>

      {/* 芦苇丛：溪岸点缀（三角形预算极低） */}
      {[
        [-3.4, -2.6], [-4.2, -1.2], [3.8, -2.8], [4.6, -1.4], [-2.8, 0.6], [3.1, 0.8],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i * 1.3, (i % 2 ? 1 : -1) * 0.06]}>
          {[0, 1, 2].map((j) => (
            <group key={j} position={[j * 0.22 - 0.2, 0, (j % 2) * 0.18]} rotation={[0, 0, (j - 1) * 0.09]}>
              <mesh position={[0, 0.65, 0]}>
                <cylinderGeometry args={[0.02, 0.035, 1.3, 5]} />
                <meshStandardMaterial color="#24382c" roughness={1} flatShading />
              </mesh>
              <mesh position={[0, 1.34, 0]}>
                <coneGeometry args={[0.07, 0.34, 6]} />
                <meshStandardMaterial color="#3a4a34" roughness={1} flatShading />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* 圆形石阵：7 块石阶，程序化 cylinder；点击判定在 mesh onClick（石体够大，方便儿童点中） */}
      {stonePos.map((p, i) => (
        <group key={i} position={p}>
          <mesh
            onClick={(e) => { e.stopPropagation(); tapImpl.current(i); }}
            onPointerOver={() => { document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = "auto"; }}
          >
            <cylinderGeometry args={[0.5, 0.62, 0.36, 9]} />
            <meshStandardMaterial
              ref={(m) => { stoneMats.current[i] = m; }}
              color="#2b3550" roughness={0.95} flatShading
            />
          </mesh>
          {/* 点亮时的 additive 光晕 */}
          <mesh>
            <sphereGeometry args={[0.78, 12, 10]} />
            <meshBasicMaterial
              ref={(m) => { glowMats.current[i] = m; }}
              color={GOLD} transparent opacity={0} depthWrite={false}
              blending={THREE.AdditiveBlending} toneMapped={false}
            />
          </mesh>
          <pointLight ref={(m) => { stoneLights.current[i] = m; }} color={GOLD} intensity={0} distance={4.5} decay={2} />
        </group>
      ))}

      {/* 反馈特效：2 槽 × 8 粒子 + 扩散环（金光爆裂） */}
      {[0, 1].map((i) => (
        <group key={i}>
          {Array.from({ length: BURST_PARTS }, (_, j) => (
            <mesh
              key={j}
              ref={(m) => { burstPartMeshes.current[i][j] = m; }}
            >
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshBasicMaterial
                color={GOLD} transparent opacity={0} depthWrite={false}
                blending={THREE.AdditiveBlending} toneMapped={false}
              />
            </mesh>
          ))}
          <mesh ref={(m) => { burstRings.current[i] = m; }}>
            <torusGeometry args={[0.5, 0.03, 8, 32]} />
            <meshBasicMaterial
              color={GOLD} transparent opacity={0} depthWrite={false}
              blending={THREE.AdditiveBlending} toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* 溪畔环境萤光：溪青低亮度，比主场景更静 */}
      <Fireflies count={26} area={12} color="#8fd8c8" />

      <CatCompanion anchor={[3, 0.3, 2.4]} size={1.5} />

      <PostFX />
    </>
  );
}
