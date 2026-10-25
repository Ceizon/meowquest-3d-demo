import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import PostFX from "../effects/PostFX";
import { useConvoyStore } from "../store/convoy";
import type { ConvoyPhase } from "../store/convoy";
import { registerConvoyScene, type ConvoySceneApi } from "../store/gameFlow";
import { useDialogue } from "../store/dialogue";
import { CONVOY_DIALOGUES, type ConvoyDialogueCue } from "../data/companions";
import { soundManager } from "../lib/sounds";
import ConvoyActors from "./convoy/ConvoyActors";
import ConvoyEnvironment from "./convoy/ConvoyEnvironment";
import { BRIDGE_STONE_POSITIONS } from "./convoy/convoyGeometry";

const CAMERA_HOME = new THREE.Vector3(13.8, 10.4, 19.6);
const TARGET_HOME = new THREE.Vector3(-0.8, 1.1, -1.8);

const CONVOY_SCENE_API: ConvoySceneApi = {
  start: () => useConvoyStore.getState().start(),
  selectLoad: (load) => useConvoyStore.getState().selectLoad(load),
  push: () => useConvoyStore.getState().push(),
  current: () => {
    const state = useConvoyStore.getState();
    return {
      phase: state.phase,
      load: state.selectedLoad,
      selectedLoad: state.selectedLoad,
      stonesFilled: state.stonesFilled,
      target: state.targetStones,
      targetStones: state.targetStones,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      incense: state.incense,
      restCount: state.restCount,
      trips: state.tripCount,
      tripCount: state.tripCount,
      trials: state.tripCount,
      level: state.level,
      settlementCount: state.settlementCount,
      paused: state.paused,
      tripProgress: state.tripProgress,
      phaseProgress: state.phaseProgress,
      thinkingRemaining: state.thinkingRemaining,
      isComplete: state.isComplete,
      wind: { ...state.wind },
      result: state.result ? { ...state.result } : null,
    };
  },
};

// 同一页面会话内，每类伙伴提示至多出现一次；语音仍由 DialogueBar 走既有三级降级。
const playedConvoyCues = new Set<ConvoyDialogueCue>();
function playConvoyCue(cue: ConvoyDialogueCue): void {
  if (playedConvoyCues.has(cue)) return;
  playedConvoyCues.add(cue);
  useDialogue.getState().push(CONVOY_DIALOGUES[cue]);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function DirectorCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const target = useRef(TARGET_HOME.clone());
  const desiredPosition = useRef(CAMERA_HOME.clone());
  const desiredTarget = useRef(TARGET_HOME.clone());
  const previousPhase = useRef<ConvoyPhase>(useConvoyStore.getState().phase);
  const completeElapsed = useRef(0);

  useLayoutEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = size.width / size.height < 1.45 ? 47 : 43;
    perspective.near = 0.1;
    perspective.far = 180;
    perspective.updateProjectionMatrix();
  }, [camera, size.height, size.width]);

  useLayoutEffect(() => {
    camera.position.copy(CAMERA_HOME);
    target.current.copy(TARGET_HOME);
    camera.lookAt(TARGET_HOME);
  }, [camera, reducedMotion]);

  useFrame((_, delta) => {
    const state = useConvoyStore.getState();
    if (state.phase !== previousPhase.current) {
      previousPhase.current = state.phase;
      completeElapsed.current = 0;
    }
    if (state.phase === "complete") completeElapsed.current += delta;

    if (reducedMotion) {
      camera.position.copy(CAMERA_HOME);
      target.current.copy(TARGET_HOME);
      camera.lookAt(target.current);
      return;
    }

    desiredPosition.current.copy(CAMERA_HOME);
    desiredTarget.current.copy(TARGET_HOME);

    if (state.phase === "loading" || state.phase === "preparing" || state.phase === "resting") {
      desiredPosition.current.x -= 0.55;
      desiredPosition.current.y += 0.12;
      desiredPosition.current.z += 0.25;
      desiredTarget.current.x -= 1.05;
      desiredTarget.current.y += 0.08;
      desiredTarget.current.z += 0.35;
    } else if (state.phase === "outbound" || state.phase === "returning") {
      const follow = (state.tripProgress - 0.5) * 2;
      desiredPosition.current.x += follow * 0.42;
      desiredPosition.current.z -= follow * 0.2;
      desiredTarget.current.x += follow * 0.9;
      desiredTarget.current.z -= follow * 0.45;
    } else if (state.phase === "unloading") {
      desiredPosition.current.x += 0.35;
      desiredPosition.current.y -= 0.42;
      desiredPosition.current.z -= 1.35;
      desiredTarget.current.set(0.75, 1.28, -3.0);
    } else if (state.phase === "complete" && completeElapsed.current < 3.2) {
      desiredPosition.current.x += 1.3;
      desiredPosition.current.y -= 0.75;
      desiredPosition.current.z -= 2.4;
      desiredTarget.current.set(4.0, 1.15, -4.1);
    }

    const blend = 1 - Math.exp(-delta * (state.phase === "complete" ? 2.2 : 3.4));
    camera.position.lerp(desiredPosition.current, blend);
    target.current.lerp(desiredTarget.current, blend);
    camera.lookAt(target.current);
  });

  return null;
}

function ConvoyFeedback() {
  useEffect(() => {
    let loadedStones = 0;
    let unloadedStones = 0;
    let teaPlayed = false;
    let activeWheel: number | null = null;
    let windActive = false;

    const playLoadedThrough = (count: number) => {
      for (let index = loadedStones; index < count; index += 1) soundManager.convoyStoneLoad(index);
      loadedStones = Math.max(loadedStones, count);
    };
    const playUnloadedThrough = (count: number) => {
      for (let index = unloadedStones; index < count; index += 1) soundManager.convoyStoneUnload(index);
      unloadedStones = Math.max(unloadedStones, count);
    };

    const unsubscribe = useConvoyStore.subscribe((state, previous) => {
      if (state.phase === "preparing") {
        if (previous.phase !== "preparing") loadedStones = 0;
        const count = Math.min(
          state.selectedLoad,
          Math.floor(state.phaseProgress * state.selectedLoad + 1e-6),
        );
        playLoadedThrough(count);
      } else if (previous.phase === "preparing" && state.phase === "outbound") {
        playLoadedThrough(previous.selectedLoad);
      }

      if (state.phase === "unloading") {
        if (previous.phase !== "unloading") unloadedStones = 0;
        const count = Math.min(
          state.selectedLoad,
          Math.floor(state.phaseProgress * state.selectedLoad + 1e-6),
        );
        playUnloadedThrough(count);
      } else if (previous.phase === "unloading") {
        playUnloadedThrough(previous.selectedLoad);
      }

      if (previous.phase === "intro" && state.phase === "loading") {
        soundManager.unlock();
        playConvoyCue("start");
      }
      if (previous.phase !== "preparing" && state.phase === "preparing" && state.selectedLoad >= 3) {
        playConvoyCue("heavy");
      }
      if (previous.phase !== "unloading" && state.phase === "unloading") playConvoyCue("unload");
      if (previous.phase !== "resting" && state.phase === "resting") {
        teaPlayed = false;
        playConvoyCue("rest");
      }
      if (state.phase === "resting" && !state.paused && !teaPlayed && state.phaseProgress >= 0.45) {
        teaPlayed = true;
        soundManager.convoyTeaCup();
      }
      if (state.wind.status === "warning" && previous.wind.status !== "warning") {
        soundManager.convoyWindChime();
        playConvoyCue("wind");
      }
      if (previous.phase !== "complete" && state.phase === "complete") soundManager.convoyBridgeBell();

      const nextWheel = !state.paused && (state.phase === "outbound" || state.phase === "returning")
        ? state.phase === "returning" ? 0 : state.selectedLoad
        : null;
      if (nextWheel !== activeWheel) {
        if (nextWheel === null) soundManager.stopConvoyWheel();
        else soundManager.startConvoyWheel(nextWheel);
        activeWheel = nextWheel;
      }

      const nextWind = !state.paused && state.phase === "outbound" && state.wind.status !== "calm";
      if (nextWind !== windActive) {
        if (nextWind) soundManager.startConvoyWind();
        else soundManager.stopConvoyWind();
        windActive = nextWind;
      }
    });

    return () => {
      unsubscribe();
      soundManager.stopConvoySounds();
    };
  }, []);

  return null;
}

function PermanentBridgeStones({ count }: { count: number }) {
  return (
    <group>
      {BRIDGE_STONE_POSITIONS.slice(0, Math.min(count, BRIDGE_STONE_POSITIONS.length)).map((position, index) => (
        <group key={position.join(":")} position={position}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.88, 0.32, 0.94]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? "#bdc2b3" : "#b2baad"}
              roughness={0.92}
            />
          </mesh>
          <mesh position={[0, 0.166, 0.02]} rotation={[-Math.PI / 2, 0, index % 2 === 0 ? 0 : Math.PI]}>
            <torusGeometry args={[0.17, 0.018, 5, 20, Math.PI * 1.55]} />
            <meshStandardMaterial color="#81968c" roughness={0.86} />
          </mesh>
          <mesh position={[0.19, 0.168, -0.13]} rotation={[0, index % 2 === 0 ? 0.35 : -0.35, 0]}>
            <boxGeometry args={[0.21, 0.018, 0.035]} />
            <meshStandardMaterial color="#81968c" roughness={0.86} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function ConvoyScene() {
  const reducedMotion = useReducedMotion();
  const stonesFilled = useConvoyStore((state) => state.stonesFilled);
  const prepared = useRef(false);

  useEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    useConvoyStore.getState().prepareSession();
  }, []);

  useEffect(() => {
    registerConvoyScene(CONVOY_SCENE_API);
    return () => registerConvoyScene(null);
  }, []);

  return (
    <>
      <color attach="background" args={["#b7d3d8"]} />
      <fog attach="fog" args={["#c6d9d5", 25, 88]} />
      <ambientLight intensity={0.58} color="#c9e2ee" />
      <hemisphereLight args={["#d7edf1", "#62786e", 0.88]} />
      <directionalLight
        position={[-14, 9, 10]}
        intensity={2.05}
        color="#ffd49f"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-19}
        shadow-camera-right={19}
        shadow-camera-top={17}
        shadow-camera-bottom={-15}
        shadow-camera-near={1}
        shadow-camera-far={58}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-radius={4}
      />
      <directionalLight position={[10, 7, -9]} intensity={0.3} color="#aacddd" />

      <ConvoyEnvironment reducedMotion={reducedMotion} />
      <PermanentBridgeStones count={stonesFilled} />
      <ConvoyActors />
      <DirectorCamera reducedMotion={reducedMotion} />
      <ConvoyFeedback />
      <PostFX />
    </>
  );
}
