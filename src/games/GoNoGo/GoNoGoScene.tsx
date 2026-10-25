import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import PostFX from "../../effects/PostFX";
import Fireflies from "../../objects/Fireflies";
import CatCompanion from "../../objects/CatCompanion";
import { useGameStore } from "../../store/gameStore";
import { useGameFlow, publishGoNoGoProgress, registerGoNoGoScene } from "../../store/gameFlow";
import { soundManager } from "../../lib/sounds";
import { getDailyChallenge, seededRandom } from "../../lib/dailyChallenge";

// 萤火虫谷 · Go/No-Go 抑制控制训练（ADHD 维度）
// 金色萤火虫 = GO（点它）；幽蓝影子虫 = NO-GO（不点，等它自己飘走）
// 玩法节奏移植自 web-prototype/components/GoNoGoGame.tsx 的 Go/No-Go 范式；
// 试次循环全部在 useFrame 里用 dt 推进（不用 setTimeout，原因见 BreathingScene 注释）
// 去污名化：误点/漏点都是温和反馈，永不出现红叉、扣分、失败字样

const TOTAL_TRIALS = 16;
const NOGO_COUNT = 4;        // GO:NO-GO = 12:4 = 3:1
const WINDOW_S = 1.2;        // 出现后的作答窗口（前半程）
const LEAVE_S = 0.6;         // 飘走动画时长（兼作试次间隔）
const PRE_S = 0.5;           // 开局首只出现前的呼吸留白
// 节奏梯度：后半程作答窗口缩短至 75%，制造渐入佳境的挑战曲线
const windowS = (trialIndex: number, scale = 1) => (trialIndex < TOTAL_TRIALS / 2 ? WINDOW_S : WINDOW_S * 0.75) * scale;
const GO_COLOR = "#ffd98a";
const NOGO_COLOR = "#7fa8ff";
// 萤火虫出现范围：视野中央小区域，避免跑出屏幕（相机 [0,2,8]，看向谷心）
const SPAWN = { x: 2.3, yMin: 1.3, yMax: 3.1, zMin: -3.2, zMax: -1.6 };

// 误点 NO-GO（commission）的去污名化话术轮换（风格参照 glyphTasks.wrongPickLines）
const COMMISSION_LINES = [
  "That blue one is a shadow friend — we let it drift by~",
  "Soft paws! The shadow bugs like quiet watching, not tapping.",
  "The mist whispers... blue ones just want to float away.",
];
// GO 超时未点（omission）的温和话术
const OMISSION_LINES = [
  "The golden light drifted off... another one is coming~",
  "That firefly went to visit the reeds. Watch for the next glow!",
];
// 正确抑制（看着蓝色飘走）的轻柔肯定
const INHIBITION_LINES = [
  "You let the shadow drift by — beautiful stillness~",
  "Quiet paws, calm heart. The vale noticed.",
];

type Phase = "idle" | "pre" | "show" | "leave";

interface Burst {
  active: boolean;
  dissolve: boolean; // true=星尘消散（慢、上飘）；false=金光爆裂（快、外扩）
  age: number;
  dur: number;
  pos: THREE.Vector3;
  color: THREE.Color;
}

// 生成 16 试次序列：恰 4 只 NO-GO，且不允许连续两只 NO-GO
function genTrials(random = Math.random): boolean[] {
  for (let attempt = 0; attempt < 300; attempt++) {
    const arr: boolean[] = [
      ...Array<boolean>(TOTAL_TRIALS - NOGO_COUNT).fill(false),
      ...Array<boolean>(NOGO_COUNT).fill(true),
    ];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    let ok = true;
    for (let i = 1; i < arr.length; i++) if (arr[i] && arr[i - 1]) { ok = false; break; }
    if (ok) return arr;
  }
  // 兜底：均匀间隔分布
  const arr = Array<boolean>(TOTAL_TRIALS).fill(false);
  for (const i of [3, 7, 10, 14]) arr[i] = true;
  return arr;
}

export default function GoNoGoScene() {
  // 会话时间线（不进 React state，逐帧推进）
  const st = useRef({
    running: false,
    phase: "idle" as Phase,
    t: 0,
    index: 0,
    trials: [] as boolean[],
    responded: false,
    showStart: 0,           // 当前试次出现的 performance.now()，用于反应时
    base: new THREE.Vector3(0, 2, -2.4), // 当前萤火虫基准位置
    seed: 0,                // 摆动/闪烁相位种子
    correct: 0,
    rtSum: 0,
    rtCount: 0,
    random: Math.random as () => number,
    windowScale: 1,
  });

  const flyGroup = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);

  // 反馈特效：2 个预分配爆裂槽（金光爆裂 / 星尘消散共用结构）
  const BURST_PARTS = 8;
  const bursts = useRef<Burst[]>([
    { active: false, dissolve: false, age: 0, dur: 0.6, pos: new THREE.Vector3(), color: new THREE.Color(GO_COLOR) },
    { active: false, dissolve: false, age: 0, dur: 0.6, pos: new THREE.Vector3(), color: new THREE.Color(GO_COLOR) },
  ]);
  const burstRings = useRef<(THREE.Mesh | null)[]>([null, null]);       // 每槽扩散环
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

  // 注册表的函数引用必须恒定，具体实现通过 ref 追踪最新闭包（同 breath 模式）
  const registered = useRef(false);
  const startImpl = useRef<() => void>(() => {});
  const tapImpl = useRef<() => void>(() => {});

  // 场景卸载（切屏）时：停止会话并注销注册表，避免串场
  useEffect(() => {
    return () => {
      st.current.running = false;
      st.current.phase = "idle";
      registered.current = false;
      registerGoNoGoScene(null);
    };
  }, []);

  const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

  const triggerBurst = (pos: THREE.Vector3, color: string, dissolve: boolean) => {
    const b = bursts.current.find((x) => !x.active) ?? bursts.current[0];
    b.active = true;
    b.dissolve = dissolve;
    b.age = 0;
    b.dur = dissolve ? 1.0 : 0.55;
    b.pos.copy(pos);
    b.color.set(color);
  };

  const spawnTrial = () => {
    const s = st.current;
    s.phase = "show";
    s.t = 0;
    s.responded = false;
    s.showStart = performance.now();
    s.seed = s.random() * Math.PI * 2;
    s.base.set(
      (s.random() * 2 - 1) * SPAWN.x,
      SPAWN.yMin + s.random() * (SPAWN.yMax - SPAWN.yMin),
      SPAWN.zMin + s.random() * (SPAWN.zMax - SPAWN.zMin)
    );
    publishGoNoGoProgress(s.index + 1, TOTAL_TRIALS);
    // 立即套用本试次配色，避免上一只的颜色残影
    const isNoGo = s.trials[s.index];
    const col = isNoGo ? NOGO_COLOR : GO_COLOR;
    if (core.current) {
      const m = core.current.material as THREE.MeshStandardMaterial;
      m.color.set(col).multiplyScalar(0.5);
      m.emissive.set(col);
      m.opacity = isNoGo ? 0.72 : 1;
    }
    if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).color.set(col);
    if (light.current) light.current.color.set(col);
  };

  const endTrial = () => {
    const s = st.current;
    s.phase = "leave";
    s.t = 0;
  };

  const finishGame = () => {
    const s = st.current;
    s.running = false;
    s.phase = "idle";
    soundManager.complete();
    const accuracy = s.correct / TOTAL_TRIALS;
    const avgRT = s.rtCount ? s.rtSum / s.rtCount : 0;
    useGameFlow.getState().finishGoNoGo(accuracy, avgRT, TOTAL_TRIALS);
  };

  // 点击判定（mesh onClick 与自动化 tap() 共用）：GO 命中得分；NO-GO 误点温和反馈不扣分
  tapImpl.current = () => {
    const s = st.current;
    if (!s.running || s.phase !== "show" || s.responded) return;
    s.responded = true;
    if (!s.trials[s.index]) {
      // GO 命中：金光小爆裂 + 成功音 + 记反应时
      s.correct++;
      s.rtSum += performance.now() - s.showStart;
      s.rtCount++;
      soundManager.success();
      triggerBurst(s.base, GO_COLOR, false);
      setCat("happy", "Caught the golden glow!");
    } else {
      // 误点影子虫（commission error）：轻柔提示音 + 去污名化话术，不扣分显示
      soundManager.softMiss();
      triggerBurst(s.base, NOGO_COLOR, true);
      setCat("encouraging", pick(COMMISSION_LINES));
    }
    endTrial();
  };

  startImpl.current = () => {
    const s = st.current;
    s.running = true;
    s.phase = "pre";
    s.t = 0;
    s.index = 0;
    s.responded = false;
    s.correct = 0;
    s.rtSum = 0;
    s.rtCount = 0;
    const challenge = getDailyChallenge("goNoGo");
    s.random = seededRandom(challenge.seed);
    s.windowScale = challenge.pace;
    s.trials = genTrials(s.random);
    bursts.current.forEach((b) => { b.active = false; b.age = 0; });
    publishGoNoGoProgress(0, TOTAL_TRIALS);
    setCat("curious", `${challenge.theme}: golden fireflies love gentle taps. Blue shadow bugs just drift by...`);
  };
  if (!registered.current) {
    registered.current = true;
    registerGoNoGoScene({
      start: () => startImpl.current(),
      tap: () => tapImpl.current(),
      current: () => {
        const s = st.current;
        return {
          isNoGo: s.trials.length > 0 ? !!s.trials[s.index] : false,
          active: s.running && s.phase === "show" && !s.responded,
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
        spawnTrial();
      } else if (s.phase === "show" && s.t >= windowS(s.index, s.windowScale)) {
        // 窗口结束：GO 未点 = omission（温和），NO-GO 未点 = 正确抑制（+1 分）
        s.responded = true;
        if (s.trials[s.index]) {
          s.correct++;
          triggerBurst(s.base, "#bcd4ff", true); // 影子散成星尘，不给音效（极轻处理）
          setCat("calm", pick(INHIBITION_LINES));
        } else {
          soundManager.softMiss();
          setCat("encouraging", pick(OMISSION_LINES));
        }
        endTrial();
      } else if (s.phase === "leave" && s.t >= LEAVE_S) {
        s.index++;
        if (s.index >= TOTAL_TRIALS) finishGame();
        else spawnTrial();
      }
    }

    // ---- 萤火虫姿态：摆动 + 闪烁 + 飘走 ----
    const visible = s.running && (s.phase === "show" || s.phase === "leave");
    if (flyGroup.current) flyGroup.current.visible = visible;
    if (visible && flyGroup.current) {
      const leaving = s.phase === "leave";
      const leaveK = leaving ? Math.min(1, s.t / LEAVE_S) : 0;
      flyGroup.current.position.set(
        s.base.x + Math.sin(now * 1.7 + s.seed) * 0.14,
        s.base.y + Math.sin(now * 2.3 + s.seed * 2) * 0.11 + leaveK * 1.7, // 飘走上浮
        s.base.z
      );
      const flicker = 0.75 + Math.sin(now * 6.5 + s.seed * 3) * 0.25;
      const fade = leaving ? 1 - leaveK : Math.min(1, s.t * 6); // 出现淡入 / 飘走淡出
      if (core.current) {
        const m = core.current.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 2.2 * flicker * fade;
        m.opacity = (s.trials[s.index] ? 0.72 : 1) * fade;
      }
      if (glow.current) {
        const m = glow.current.material as THREE.MeshBasicMaterial;
        m.opacity = 0.26 * flicker * fade;
        glow.current.scale.setScalar(1 + Math.sin(now * 3.1 + s.seed) * 0.08);
      }
      if (light.current) light.current.intensity = 2.4 * flicker * fade;
    }

    // ---- 爆裂/星尘特效推进 ----
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
        const dist = b.dissolve ? 0.25 + k * 0.8 : 0.2 + k * 1.7;
        p.position.set(
          b.pos.x + dir.x * dist,
          b.pos.y + dir.y * dist + (b.dissolve ? k * 0.9 : 0),
          b.pos.z + dir.z * dist
        );
        p.scale.setScalar(b.dissolve ? 1 - k * 0.6 : 1 - k * 0.4);
        const m = p.material as THREE.MeshBasicMaterial;
        m.color.copy(b.color);
        m.opacity = (1 - k) * 0.9;
      });
      if (ring) {
        ring.position.copy(b.pos);
        ring.scale.setScalar(0.3 + k * (b.dissolve ? 1.1 : 2.0));
        const m = ring.material as THREE.MeshBasicMaterial;
        m.color.copy(b.color);
        m.opacity = (1 - k) * 0.55;
      }
    }
  });

  return (
    <>
      <color attach="background" args={["#070a1c"]} />
      <fog attach="fog" args={["#0a0f26", 12, 50]} />
      <ambientLight intensity={0.32} color="#7f92cc" />
      <hemisphereLight args={["#2a3560", "#0c1410", 0.5]} />

      <Stars radius={120} depth={30} count={1800} factor={3.2} saturation={0.15} fade speed={0.4} />
      {/* 谷地上弦月 */}
      <mesh position={[16, 20, -46]}>
        <sphereGeometry args={[2.6, 20, 20]} />
        <meshBasicMaterial color="#ecebd8" toneMapped={false} />
      </mesh>

      {/* 夜色谷地：纯色地面 + 雾，配合远处矮丘剪影 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[40, 36]} />
        <meshStandardMaterial color="#0d1626" roughness={0.9} />
      </mesh>
      {[[-14, -18, 3.2], [12, -22, 4.2], [-2, -28, 5.2]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.1, z]} scale={[1.6, 0.5, 1]}>
          <sphereGeometry args={[r, 14, 10]} />
          <meshStandardMaterial color="#101c30" roughness={1} flatShading />
        </mesh>
      ))}

      {/* 芦苇丛：细秆 + 穗尖，谷地点缀（三角形预算极低） */}
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

      {/* 溪石点缀 */}
      {[[-1.8, -3.6, 0.5], [2.2, -3.9, 0.42], [0.6, -4.4, 0.6]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, r * 0.4, z]} rotation={[i * 0.8, i * 1.7, 0]}>
          <dodecahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color="#1c2438" roughness={0.95} flatShading />
        </mesh>
      ))}

      {/* 试次萤火虫：内核 + additive 光晕 + 隐形点击热区（点击判定在 mesh onClick） */}
      <group ref={flyGroup} visible={false}>
        <mesh ref={core}>
          <sphereGeometry args={[0.17, 16, 16]} />
          <meshStandardMaterial
            color={GO_COLOR} emissive={GO_COLOR} emissiveIntensity={2}
            transparent toneMapped={false}
          />
        </mesh>
        <mesh ref={glow}>
          <sphereGeometry args={[0.52, 16, 16]} />
          <meshBasicMaterial
            color={GO_COLOR} transparent opacity={0.25} depthWrite={false}
            blending={THREE.AdditiveBlending} toneMapped={false}
          />
        </mesh>
        {/* 点击热区：比视觉体大，方便 6-12 岁儿童点中 */}
        <mesh
          onClick={(e) => { e.stopPropagation(); tapImpl.current(); }}
          onPointerOver={() => { document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = "auto"; }}
        >
          <sphereGeometry args={[0.6, 10, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <pointLight ref={light} color={GO_COLOR} intensity={2.4} distance={5} decay={2} />
      </group>

      {/* 反馈特效：2 槽 × 8 粒子 + 扩散环（金光爆裂 / 星尘消散共用） */}
      {[0, 1].map((i) => (
        <group key={i}>
          {Array.from({ length: BURST_PARTS }, (_, j) => (
            <mesh
              key={j}
              ref={(m) => { burstPartMeshes.current[i][j] = m; }}
            >
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshBasicMaterial
                color={GO_COLOR} transparent opacity={0} depthWrite={false}
                blending={THREE.AdditiveBlending} toneMapped={false}
              />
            </mesh>
          ))}
          <mesh ref={(m) => { burstRings.current[i] = m; }}>
            <torusGeometry args={[0.5, 0.03, 8, 32]} />
            <meshBasicMaterial
              color={GO_COLOR} transparent opacity={0} depthWrite={false}
              blending={THREE.AdditiveBlending} toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* 谷地环境萤光：幽蓝低亮度，比主场景更静 */}
      <Fireflies count={30} area={13} color="#8fb0e8" />

      <CatCompanion anchor={[2.7, 0.3, 2.6]} size={1.5} />

      <PostFX />
    </>
  );
}
