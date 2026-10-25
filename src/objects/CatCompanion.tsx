import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore, EMOTION_TO_IMAGE } from "../store/gameStore";
import type { CatEmotion } from "../store/gameStore";
import { soundManager } from "../lib/sounds";
import { clickLines, idleLines } from "../data/catLines";
import ProceduralMomo, { type MomoModelVariant } from "./ProceduralMomo";
import { terrainHeight } from "./Terrain";

// 预载全部情绪贴图：避免情绪切换时 useTexture suspend 导致整个 Suspense 边界挂起
// （挂起期间 React 会销毁边界内的 layout effect，useFrame 订阅被移除，帧逻辑停摆）
Object.values(EMOTION_TO_IMAGE).forEach((url) => useTexture.preload(url));

interface Props {
  anchor?: [number, number, number];
  followCamera?: boolean;
  size?: number;
  valleyControlled?: boolean;
}

// 点击反馈的可选情绪池
const CLICK_EMOTIONS: CatEmotion[] = ["happy", "curious", "surprised", "excited"];
// 弹性缩放时长（秒）
const PULSE_DURATION = 0.3;
const EXPRESSION_DURATION = 0.7;
const MOVEMENT_HOLD_DELAY = 500;
const MOVEMENT_FRAME_DURATION = 50;
const TAP_MOVEMENT_FRAME_DURATION = 250;

const pickRandom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// —— 灵猫成长系统：按心流之光总数三阶段视觉进化 ——
// 阶段 0（0-4 灯）：现状无光环；阶段 1（5-9）：暖金光环；阶段 2（10+）：青金双色光环 + 3 颗绕头星星
type GrowthStage = 0 | 1 | 2;
const stageOf = (lights: number): GrowthStage => (lights >= 10 ? 2 : lights >= 5 ? 1 : 0);

// 阶段跨越时的英文成长文案
const GROWTH_LINES: Record<1 | 2, string> = {
  1: "Your Flow Lights make me shine brighter!",
  2: "So many Flow Lights — I'm sparkling with star power now!",
};

// 成长光环（阶段 1/2）：暖金 torus 悬于头顶，缓慢自转 + 微浮动；
// 阶段 2 叠加青金色第二环（两色 torus 渐变观感），3 颗金色小星星绕头缓慢公转
// 全部声明式几何/材质，卸载自动 dispose；挂在猫 group 内，自然跟随呼吸浮动与点击 pulse 缩放
function GrowthAura({ stage, headY }: { stage: 1 | 2; headY: number }) {
  const halo = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (halo.current) {
      halo.current.rotation.x = Math.PI / 2.35 + Math.sin(t * 0.8) * 0.06;
      halo.current.rotation.z = t * 0.5;
      halo.current.position.y = headY + Math.sin(t * 1.4) * 0.05;
    }
    if (orbit.current) {
      // 公转：整体绕 Y 旋转 orbit 组；星星附带自转与上下微浮
      orbit.current.rotation.y = t * 0.6;
      const stars = orbit.current.children;
      for (let i = 0; i < stars.length; i++) {
        stars[i].position.y = Math.sin(t * 2 + (i * Math.PI * 2) / 3) * 0.08;
        stars[i].rotation.y = t * 1.6 + i;
      }
    }
  });

  return (
    <>
      {/* 光环：torus 默认在 XY 平面，绕 X 放平成头顶光环（略倾斜更有灵气） */}
      <group ref={halo} position={[0, headY, 0]}>
        <mesh>
          <torusGeometry args={[0.35, 0.03, 12, 48]} />
          <meshStandardMaterial
            color="#ffd98a"
            emissive="#ffd98a"
            emissiveIntensity={stage === 2 ? 2.4 : 1.3}
            toneMapped={false}
          />
        </mesh>
        {stage === 2 && (
          <mesh rotation={[0.4, 0.7, 0]}>
            <torusGeometry args={[0.38, 0.02, 12, 48]} />
            <meshStandardMaterial color="#7df3cf" emissive="#7df3cf" emissiveIntensity={2} toneMapped={false} />
          </mesh>
        )}
      </group>
      {stage === 2 && (
        <group ref={orbit} position={[0, headY + 0.05, 0]}>
          {[0, 1, 2].map((i) => {
            const a = (i * Math.PI * 2) / 3;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8]}>
                <octahedronGeometry args={[0.09]} />
                <meshStandardMaterial color="#ffe28a" emissive="#ffd98a" emissiveIntensity={2.2} toneMapped={false} />
              </mesh>
            );
          })}
        </group>
      )}
    </>
  );
}

// 灵猫陪伴者（3D 部分）：billboard 表情贴图 + 呼吸浮动动画，情绪由 gameStore 驱动切换 8 张差分
// 点击灵猫：播放短音 + 随机台词 + 短促弹性缩放（pulse 用时间戳驱动，不加状态库）
export default function CatCompanion({ anchor = [2.2, 1.8, 2], followCamera = false, size = 1.5, valleyControlled = false }: Props) {
  const group = useRef<THREE.Group>(null);
  const emotion = useGameStore((s) => s.catEmotion);
  // 心流之光为标量，selector 直接返回 s.flowLights 不会引发重渲染风暴
  const flowLights = useGameStore((s) => s.flowLights);
  const stage = stageOf(flowLights);
  // 上一阶段：mount 时初始化为当前阶段，页面加载（含 localStorage 恢复的高灯数）不触发成长奖励
  const prevStage = useRef(stage);
  const img = EMOTION_TO_IMAGE[emotion];
  const texture = useTexture(img);
  // 点击时刻的 clock 时间戳；-1 表示无进行中的 pulse
  const pulseStart = useRef(-1);
  const valleyPosition = useRef(new THREE.Vector3(anchor[0], terrainHeight(anchor[0], anchor[2]), anchor[2]));
  const valleyTarget = useRef(new THREE.Vector3(anchor[0], terrainHeight(anchor[0], anchor[2]), anchor[2]));
  const keys = useRef(new Set<string>());
  // 初始面朝镜头（+Z）；向上移动到 -Z 时再平滑转身。
  const valleyHeading = useRef(0);
  const valleyMoving = useRef(false);
  const [movingModel, setMovingModel] = useState<"moving" | "moving2" | null>(null);
  const [clickExpression, setClickExpression] = useState<Exclude<MomoModelVariant, "default" | "moving"> | null>(null);
  const nextExpression = useRef<"expression2" | "expression3">("expression2");
  const expressionTimer = useRef<number | null>(null);
  const movementHoldTimer = useRef<number | null>(null);
  const movementCycleTimer = useRef<number | null>(null);
  const movementTapTimer = useRef<number | null>(null);
  const movementLongPress = useRef(false);

  const clearMovementTimers = () => {
    if (movementHoldTimer.current !== null) window.clearTimeout(movementHoldTimer.current);
    if (movementCycleTimer.current !== null) window.clearInterval(movementCycleTimer.current);
    if (movementTapTimer.current !== null) window.clearTimeout(movementTapTimer.current);
    movementHoldTimer.current = null;
    movementCycleTimer.current = null;
    movementTapTimer.current = null;
  };

  const finishMovement = () => {
    clearMovementTimers();
    movementLongPress.current = false;
    setMovingModel(null);
  };

  useEffect(() => {
    if (!valleyControlled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        if (keys.current.has(key)) return;
        const wasIdle = keys.current.size === 0;
        keys.current.add(key);
        valleyMoving.current = true;
        if (wasIdle) {
          clearMovementTimers();
          movementLongPress.current = false;
          setMovingModel("moving");
          movementHoldTimer.current = window.setTimeout(() => {
            movementHoldTimer.current = null;
            if (keys.current.size === 0) return;
            movementLongPress.current = true;
            setMovingModel("moving");
            movementCycleTimer.current = window.setInterval(() => {
              setMovingModel((current) => (current === "moving" ? "moving2" : "moving"));
            }, MOVEMENT_FRAME_DURATION);
          }, MOVEMENT_HOLD_DELAY);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
      if (keys.current.size > 0) return;
      valleyMoving.current = false;
      if (movementLongPress.current) {
        finishMovement();
        return;
      }
      if (movementHoldTimer.current !== null) window.clearTimeout(movementHoldTimer.current);
      movementHoldTimer.current = null;
      if (movementTapTimer.current !== null) window.clearTimeout(movementTapTimer.current);
      setMovingModel("moving2");
      movementTapTimer.current = window.setTimeout(() => {
        movementTapTimer.current = null;
        setMovingModel(null);
      }, TAP_MOVEMENT_FRAME_DURATION);
    };
    const onBlur = () => {
      keys.current.clear();
      valleyMoving.current = false;
      finishMovement();
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      keys.current.clear();
      clearMovementTimers();
      if (expressionTimer.current !== null) window.clearTimeout(expressionTimer.current);
    };
  }, [valleyControlled]);

  // 阶段跨越（仅运行时 0→1 / 1→2 升级触发）：奖励音 + 骄傲情绪英文成长文案
  useEffect(() => {
    const prev = prevStage.current;
    prevStage.current = stage;
    if (stage > prev && (stage === 1 || stage === 2)) {
      soundManager.reward();
      useGameStore.getState().setCat("proud", GROWTH_LINES[stage]);
    }
  }, [stage]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    soundManager.meow();
    const setCat = useGameStore.getState().setCat;
    setCat(pickRandom(CLICK_EMOTIONS), pickRandom(clickLines));
    if (valleyControlled) {
      const expression = nextExpression.current;
      nextExpression.current = expression === "expression2" ? "expression3" : "expression2";
      setClickExpression(expression);
      if (expressionTimer.current !== null) window.clearTimeout(expressionTimer.current);
      expressionTimer.current = window.setTimeout(() => {
        expressionTimer.current = null;
        setClickExpression(null);
      }, EXPRESSION_DURATION * 1000);
    }
    // 记录点击时刻（与 useFrame 内读取同一时钟源：performance.now 秒级）
    pulseStart.current = performance.now() / 1000;
  };

  useFrame(({ clock, camera }, dt) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    if (valleyControlled) {
      const x = (keys.current.has("arrowright") || keys.current.has("d") ? 1 : 0)
        - (keys.current.has("arrowleft") || keys.current.has("a") ? 1 : 0);
      const z = (keys.current.has("arrowdown") || keys.current.has("s") ? 1 : 0)
        - (keys.current.has("arrowup") || keys.current.has("w") ? 1 : 0);
      const moving = x !== 0 || z !== 0;
      valleyMoving.current = moving;
      if (moving) {
        const length = Math.hypot(x, z);
        const speed = 3.2;
        valleyTarget.current.x = THREE.MathUtils.clamp(valleyTarget.current.x + (x / length) * speed * dt, -8.5, 8.5);
        valleyTarget.current.z = THREE.MathUtils.clamp(valleyTarget.current.z + (z / length) * speed * dt, -10.5, 8.5);
        valleyTarget.current.y = terrainHeight(valleyTarget.current.x, valleyTarget.current.z);
        valleyHeading.current = Math.atan2(x, z);
      }
      valleyPosition.current.lerp(valleyTarget.current, Math.min(1, 8 * dt));
      group.current.position.copy(valleyPosition.current);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, valleyHeading.current, 0.16);
    } else if (followCamera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const target = camera.position
        .clone()
        .add(dir.multiplyScalar(4))
        .add(new THREE.Vector3(1.1, -0.35 + Math.sin(t * 1.2) * 0.12, 0));
      target.y = Math.max(target.y, 1.2);
      group.current.position.lerp(target, 0.04);
    } else {
      group.current.position.set(anchor[0], anchor[1] + Math.sin(t * 1.1) * 0.15, anchor[2]);
    }
    // 弹性缩放：与既有跟随/浮动逻辑正交，只改 scale 不碰 position
    if (pulseStart.current >= 0) {
      const p = (performance.now() / 1000 - pulseStart.current) / PULSE_DURATION;
      if (p >= 1) {
        pulseStart.current = -1;
        group.current.scale.setScalar(1);
      } else {
        // 快起缓落的单峰曲线：sin(π·p) 先鼓后收
        group.current.scale.setScalar(1 + Math.sin(Math.PI * p) * 0.22);
      }
    }
  });

  return (
    <group ref={group}>
      {valleyControlled ? (
        <ProceduralMomo
          position={[0, 0, 0]}
          onClick={handleClick}
          moving={valleyMoving.current}
          movingRef={valleyMoving}
          heading={0}
          scale={size}
          variant={movingModel ?? clickExpression ?? "default"}
        />
      ) : (
        <>
          {/* 柔光底座（additive，避免遮挡猫身） */}
          <mesh>
            <sphereGeometry args={[size * 0.55, 16, 16]} />
            <meshBasicMaterial color="#ffd9a0" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <Billboard>
            <mesh
              renderOrder={10}
              onClick={handleClick}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            >
              <planeGeometry args={[size, size]} />
              <meshBasicMaterial map={texture} transparent alphaTest={0.05} depthWrite={false} toneMapped={false} />
            </mesh>
          </Billboard>
          {/* 成长光环：阶段 1 起悬于头顶上方约 0.5 处，挂在猫 group 内跟随 pulse 缩放，与贴图/弹跳动画正交 */}
          {stage !== 0 && <GrowthAura stage={stage} headY={size * 0.5 + 0.5} />}
        </>
      )}
    </group>
  );
}

// 灵猫对话坞（2D DOM 部分）：左下角头像 + 去污名化文案气泡
export function CatDock() {
  const emotion = useGameStore((s) => s.catEmotion);
  const catLine = useGameStore((s) => s.catLine);
  const screen = useGameStore((s) => s.screen);
  const img = EMOTION_TO_IMAGE[emotion];

  // 神猫山闲逛时的碎碎念：每 22~35 秒随机间隔冒一句，离开 mountain 即停止；
  // 仅在 mountain 屏生效，不会覆盖小游戏进行中的引导台词
  useEffect(() => {
    if (screen !== "mountain") return;
    let timer = 0;
    const scheduleNext = () => {
      const delay = 22000 + Math.random() * 13000;
      timer = window.setTimeout(() => {
        const emotion: CatEmotion = Math.random() < 0.5 ? "calm" : "happy";
        useGameStore.getState().setCat(emotion, pickRandom(idleLines));
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => window.clearTimeout(timer);
  }, [screen]);

  return (
    <div style={{
      position: "fixed", left: 24, bottom: 24, zIndex: 90, maxWidth: 380,
      display: "flex", alignItems: "flex-end", gap: 12, pointerEvents: "none",
    }}>
      <img
        src={img}
        alt="Meow, tap to hear a meow"
        role="button"
        tabIndex={0}
        onClick={() => {
          soundManager.meow();
          useGameStore.getState().setCat(pickRandom(CLICK_EMOTIONS), pickRandom(clickLines));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            soundManager.meow();
            useGameStore.getState().setCat(pickRandom(CLICK_EMOTIONS), pickRandom(clickLines));
          }
        }}
        style={{
          width: 76, height: 76, pointerEvents: "auto", cursor: "pointer",
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
        }}
      />
      <div style={{
        padding: "12px 18px",
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        background: "rgba(255,252,245,0.95)",
        color: "#4a3b2a",
        fontSize: 15,
        lineHeight: 1.55,
        fontWeight: 500,
        boxShadow: "0 6px 22px rgba(0,0,0,0.4)",
      }}>
        {catLine}
      </div>
    </div>
  );
}
