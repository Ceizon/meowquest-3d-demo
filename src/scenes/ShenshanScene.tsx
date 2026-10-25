import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import Terrain, { terrainHeight } from "../objects/Terrain";
import Mountains from "../objects/Mountain";
import Trees from "../objects/Tree";
import Lantern from "../objects/Lantern";
import CatCompanion from "../objects/CatCompanion";
import FlowLight from "../objects/FlowLight";
import Fireflies from "../objects/Fireflies";
import PostFX from "../effects/PostFX";
import { useGameStore } from "../store/gameStore";
import SpiritGate from "../objects/SpiritGate";

// 神猫山·启程林 主场景
export default function ShenshanScene() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const setScreen = useGameStore((s) => s.setScreen);
  const setCat = useGameStore((s) => s.setCat);
  const flowLights = useGameStore((s) => s.flowLights);

  // 灯笼点击 → 相机平滑巡游到该入口
  const glide = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const enterTimer = useRef<number | null>(null);
  const daylight = useRef(0);
  const background = useRef<THREE.Color>(null);
  const sceneFog = useRef<THREE.Fog>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const nightLayer = useRef<THREE.Group>(null);

  const dayBackground = new THREE.Color("#9fc8e8");
  const nightBackground = new THREE.Color("#0b1026");
  const dayFog = new THREE.Color("#9dbbd0");
  const nightFog = new THREE.Color("#141b3a");
  const daySky = new THREE.Color("#dcecff");
  const nightSky = new THREE.Color("#31406e");
  const dayGround = new THREE.Color("#50734a");
  const nightGround = new THREE.Color("#1d2a1a");

  useEffect(() => {
    return () => {
      // 卸载时清掉待执行的切屏定时器，避免离开主场景后又被拉回小游戏
      if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    };
  }, []);

  const startGlide = (target: [number, number, number]) => {
    glide.current = {
      from: camera.position.clone(),
      to: new THREE.Vector3(target[0] * 0.6, 4, target[2] * 0.6 + 7),
      t: 0,
    };
  };

  // 巡游后进入小游戏；重复点击时只保留最后一次
  const enterGame = (screen: "starArray" | "glyphTrial" | "breathing" | "goNoGo" | "stepStones") => {
    if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => {
      enterTimer.current = null;
      setScreen(screen);
    }, 700);
  };

  useFrame((_, dt) => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const isDaytime = minutes >= 390 && minutes < 1050;
    const targetDaylight = isDaytime ? 1 : 0;
    daylight.current = THREE.MathUtils.damp(daylight.current, targetDaylight, 4, dt);
    const light = daylight.current;

    if (background.current) background.current.copy(nightBackground).lerp(dayBackground, light);
    if (sceneFog.current) {
      sceneFog.current.color.copy(nightFog).lerp(dayFog, light);
      sceneFog.current.near = THREE.MathUtils.lerp(18, 28, light);
      sceneFog.current.far = THREE.MathUtils.lerp(85, 115, light);
    }
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.lerp(0.35, 0.75, light);
      ambient.current.color.copy(nightSky).lerp(daySky, light);
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(0.5, 1.15, light);
      sun.current.color.copy(nightSky).lerp(new THREE.Color("#fff4dc"), light);
    }
    if (hemisphere.current) {
      hemisphere.current.intensity = THREE.MathUtils.lerp(0.5, 0.85, light);
      hemisphere.current.color.copy(nightSky).lerp(daySky, light);
      hemisphere.current.groundColor.copy(nightGround).lerp(dayGround, light);
    }
    if (nightLayer.current) nightLayer.current.visible = light < 0.5;

    if (glide.current && controls.current) {
      glide.current.t = Math.min(1, glide.current.t + dt * 0.9);
      const e = 1 - Math.pow(1 - glide.current.t, 3);
      camera.position.lerpVectors(glide.current.from, glide.current.to, e);
      if (glide.current.t >= 1) glide.current = null;
    }
  });

  return (
    <>
    <color ref={background} attach="background" args={["#0b1026"]} />
    <fog ref={sceneFog} attach="fog" args={["#141b3a", 18, 85]} />
    <ambientLight ref={ambient} intensity={0.35} color="#8aa0d8" />
    <directionalLight ref={sun} position={[12, 18, 6]} intensity={0.5} color="#bcd0ff" castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30} />
    <hemisphereLight ref={hemisphere} args={["#31406e", "#1d2a1a", 0.5]} />

    <group ref={nightLayer}>
      <Stars radius={160} depth={40} count={2500} factor={4} saturation={0.2} fade speed={0.6} />
      {/* 月亮 */}
      <mesh position={[-38, 34, -70]}>
        <sphereGeometry args={[5, 24, 24]} />
        <meshBasicMaterial color="#f4f0dc" toneMapped={false} />
      </mesh>
      <Fireflies />
    </group>

      <Terrain />
      <Mountains />
      <Trees />

      {/* 星光小径 */}
      <Sparkles count={70} scale={[3.4, 0.4, 26]} position={[0, 0.4, 2]} size={2.4} speed={0.25} color="#ffe9b0" opacity={0.7} />

      {/* 玩法入口灯笼 */}
      <Lantern
        position={[-3.6, terrainHeight(-3.6, 3) + 1.5, 3]}
        label="Star Array · Working Memory"
        color="#8ab6ff"
        onClick={() => {
          startGlide([-3.6, 0, 3]);
          setCat("excited", "Let's wake the star spirits! Remember where the star shimmered before.");
          enterGame("starArray");
        }}
      />
      <SpiritGate
        position={[0, terrainHeight(0, -11) + 0.05, -11]}
        onClick={() => {
          setCat("excited", "The Spirit Gate is opening! Follow me into the Cloud Pass.");
          setScreen("story1");
        }}
      />
      <Lantern
        position={[3.6, terrainHeight(3.6, -1) + 1.5, -1]}
        label="Ancient Library · Glyph Trial"
        color="#ffb347"
        onClick={() => {
          startGlide([3.6, 0, -1]);
          setCat("curious", "The mist blurred my storybook glyphs... help me find the true one!");
          enterGame("glyphTrial");
        }}
      />
      <Lantern
        position={[0, terrainHeight(0, 5) + 1.5, 5]}
        label="Whispering Lake · Calm Breathing"
        color="#7fe0d0"
        onClick={() => {
          startGlide([0, 0, 5]);
          setCat("calm", "The lake whispers softly... let's take three slow breaths together.");
          enterGame("breathing");
        }}
      />
      <Lantern
        position={[3.6, terrainHeight(3.6, 3) + 1.5, 3]}
        label="Firefly Vale · Focus Play"
        color="#c9a0ff"
        onClick={() => {
          startGlide([3.6, 0, 3]);
          setCat("curious", "The vale is glowing! Golden fireflies love gentle taps — the blue ones just drift by.");
          enterGame("goNoGo");
        }}
      />
      <Lantern
        position={[-4.2, terrainHeight(-4.2, -3) + 0.9, -3]}
        label="Stepping Stones · Speed & Focus"
        color="#7fd8c8"
        onClick={() => {
          startGlide([-4.2, 0, -3]);
          setCat("curious", "The brook stones are waking up! Tap the golden glow, quick as a skipping pebble.");
          enterGame("stepStones");
        }}
      />

      {/* 心流之光：每完成一次任务点亮一盏 */}
      <FlowLight position={[-1.6, terrainHeight(-1.6, -6) + 0.1, -6]} lit={flowLights >= 1} />
      <FlowLight position={[1.8, terrainHeight(1.8, -8) + 0.1, -8]} lit={flowLights >= 2} color="#c8f0ff" />
      <FlowLight position={[0, terrainHeight(0, -10.5) + 0.1, -10.5]} lit={flowLights >= 3} color="#ffd0e8" />

      <CatCompanion valleyControlled anchor={[0, 0, 4]} size={0.9} />

      <OrbitControls
        ref={controls}
        target={[0, 1.6, -2]}
        enablePan={false}
        minDistance={5}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.15}
        enableDamping
        dampingFactor={0.08}
      />
      <PostFX />
    </>
  );
}
