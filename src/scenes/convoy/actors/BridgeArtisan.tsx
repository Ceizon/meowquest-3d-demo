import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CART_END, sampleConvoyRoute } from "../convoyGeometry";
import type { ConvoyVec3 } from "../convoyGeometry";
import { useConvoyStore } from "../../../store/convoy";

const ARTISAN_OFFSET: ConvoyVec3 = [-0.65, -0.08, -0.68];
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 16, 12);
const FEATHER_MATERIAL = new THREE.MeshStandardMaterial({ color: "#607b78", roughness: 0.94, flatShading: true });
const LIGHT_FEATHER_MATERIAL = new THREE.MeshStandardMaterial({ color: "#d9d2b5", roughness: 0.95 });
const WING_MATERIAL = new THREE.MeshStandardMaterial({ color: "#496662", roughness: 0.96, flatShading: true });
const EYE_MATERIAL = new THREE.MeshStandardMaterial({ color: "#fff4cf", roughness: 0.65 });
const PUPIL_MATERIAL = new THREE.MeshStandardMaterial({ color: "#172d2d", roughness: 0.5 });
const GOLD_MATERIAL = new THREE.MeshStandardMaterial({ color: "#d9a85c", roughness: 0.68, metalness: 0.08 });
const PAPER_MATERIAL = new THREE.MeshStandardMaterial({ color: "#b8d9d2", roughness: 0.9, side: THREE.DoubleSide });
const INK_MATERIAL = new THREE.MeshBasicMaterial({ color: "#487c78" });

export default function BridgeArtisan({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const blueprintRef = useRef<THREE.Group>(null);
  const paperRef = useRef<THREE.Group>(null);
  const leftRollRef = useRef<THREE.Mesh>(null);
  const rightRollRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const animationTime = useRef(0);
  const blueprintOpen = useRef(1);
  const route = useMemo(() => sampleConvoyRoute(1), []);
  const position = useMemo<ConvoyVec3>(() => [
    CART_END[0] + ARTISAN_OFFSET[0],
    CART_END[1] + ARTISAN_OFFSET[1],
    CART_END[2] + ARTISAN_OFFSET[2],
  ], []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = useConvoyStore.getState();
    const poseDt = state.paused ? 0 : dt;
    if (!state.paused) animationTime.current += dt;
    const t = animationTime.current;
    const phase = state.phase;
    const studying = phase === "intro" || phase === "loading" || phase === "preparing" || phase === "resting";
    const waving = phase === "outbound" && state.wind.status === "calm";
    const nodding = phase === "unloading";
    const celebrating = phase === "complete";

    let headPitch = 0.02;
    let headRoll = 0;
    if (studying) {
      headPitch = 0.22 + (reducedMotion ? 0 : Math.sin(t * 1.2) * 0.025);
      headRoll = 0.09;
    } else if (nodding) {
      const stonePhase = (state.phaseProgress * state.selectedLoad) % 1;
      headPitch = 0.04 + Math.sin(stonePhase * Math.PI) * 0.24;
    } else if (celebrating) {
      headPitch = -0.1;
      headRoll = reducedMotion ? 0 : Math.sin(t * 2.8) * 0.06;
    } else if (phase === "timeUp") {
      headPitch = 0.26;
      headRoll = -0.06;
    } else if (state.wind.status !== "calm") {
      headPitch = 0.16;
      headRoll = -0.08;
    }
    if (headRef.current) {
      headRef.current.rotation.x = THREE.MathUtils.damp(headRef.current.rotation.x, headPitch, 12, poseDt);
      headRef.current.rotation.z = THREE.MathUtils.damp(headRef.current.rotation.z, headRoll, 10, poseDt);
      headRef.current.rotation.y = reducedMotion ? 0 : Math.sin(t * 0.7) * 0.025;
    }

    let leftWing = 0.18;
    let rightWing = -0.18;
    if (waving) {
      leftWing = -1.9 + (reducedMotion ? 0 : Math.sin(t * 6.2) * 0.38);
      rightWing = -0.42;
    } else if (nodding) {
      leftWing = -0.45;
      rightWing = 0.38;
    } else if (celebrating) {
      leftWing = -2.15;
      rightWing = 2.15;
    } else if (state.wind.status !== "calm") {
      leftWing = 0.52;
      rightWing = -0.52;
    }
    if (leftWingRef.current) leftWingRef.current.rotation.z = THREE.MathUtils.damp(leftWingRef.current.rotation.z, leftWing, 12, poseDt);
    if (rightWingRef.current) rightWingRef.current.rotation.z = THREE.MathUtils.damp(rightWingRef.current.rotation.z, rightWing, 12, poseDt);

    if (bodyRef.current) {
      const bounce = celebrating && !reducedMotion ? Math.abs(Math.sin(t * 4.6)) * 0.08 : 0;
      bodyRef.current.position.y = THREE.MathUtils.damp(bodyRef.current.position.y, bounce, 16, poseDt);
      bodyRef.current.rotation.z = celebrating && !reducedMotion ? Math.sin(t * 2.3) * 0.035 : 0;
    }

    const openTarget = celebrating ? 0 : phase === "timeUp" ? 0.55 : 1;
    blueprintOpen.current = THREE.MathUtils.damp(blueprintOpen.current, openTarget, celebrating ? 7 : 10, poseDt);
    const open = Math.max(0.035, blueprintOpen.current);
    if (paperRef.current) paperRef.current.scale.x = open;
    if (leftRollRef.current) leftRollRef.current.position.x = -0.41 * open;
    if (rightRollRef.current) rightRollRef.current.position.x = 0.41 * open;
    if (blueprintRef.current) {
      blueprintRef.current.position.y = THREE.MathUtils.damp(blueprintRef.current.position.y, celebrating ? 0.63 : 0.82, 9, poseDt);
      blueprintRef.current.rotation.z = THREE.MathUtils.damp(blueprintRef.current.rotation.z, celebrating ? -0.42 : -0.06, 9, poseDt);
    }

    const blink = t % 4.1 > 3.96 ? 0.12 : 1;
    if (leftEyeRef.current) leftEyeRef.current.scale.y = blink;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = blink;
  }, -3);

  return (
    <group ref={rootRef} position={position} rotation={[0, route.rotationY + Math.PI, 0]} scale={0.9}>
      <group ref={bodyRef}>
        <mesh geometry={UNIT_SPHERE} material={FEATHER_MATERIAL} position={[0, 0.68, 0]} scale={[0.94, 1.16, 0.82]} castShadow />
        <mesh geometry={UNIT_SPHERE} material={LIGHT_FEATHER_MATERIAL} position={[0, 0.65, 0.34]} scale={[0.64, 0.82, 0.25]} />
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.22, 0.1, 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.075, 0.3, 8]} />
            <meshStandardMaterial color="#b78348" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 0.96, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.055, 8, 22]} />
          <meshStandardMaterial color="#c87855" roughness={0.88} />
        </mesh>

        <group ref={leftWingRef} position={[-0.42, 0.9, 0]} rotation={[0, 0, 0.18]}>
          <mesh geometry={UNIT_SPHERE} material={WING_MATERIAL} position={[-0.03, -0.28, 0]} scale={[0.34, 0.78, 0.46]} castShadow />
        </group>
        <group ref={rightWingRef} position={[0.42, 0.9, 0]} rotation={[0, 0, -0.18]}>
          <mesh geometry={UNIT_SPHERE} material={WING_MATERIAL} position={[0.03, -0.28, 0]} scale={[0.34, 0.78, 0.46]} castShadow />
        </group>

        <group ref={headRef}>
          <mesh geometry={UNIT_SPHERE} material={FEATHER_MATERIAL} position={[0, 1.29, 0.03]} scale={[1.02, 0.86, 0.88]} castShadow />
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.3, 1.68, 0]} rotation={[0, 0, side * -0.22]} castShadow>
              <coneGeometry args={[0.15, 0.38, 6]} />
              <meshStandardMaterial color="#536f6c" roughness={0.95} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? leftEyeRef : rightEyeRef} position={[side * 0.21, 1.34, 0.39]}>
              <mesh geometry={UNIT_SPHERE} material={EYE_MATERIAL} scale={[0.35, 0.4, 0.18]} />
              <mesh geometry={UNIT_SPHERE} material={PUPIL_MATERIAL} position={[0, 0, 0.09]} scale={[0.14, 0.2, 0.09]} />
              <mesh geometry={UNIT_SPHERE} material={EYE_MATERIAL} position={[-0.025, 0.035, 0.14]} scale={[0.035, 0.045, 0.025]} />
            </group>
          ))}
          <mesh position={[0, 1.11, 0.48]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.105, 0.26, 6]} />
            <meshStandardMaterial color="#daa154" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.72, -0.02]} scale={[1, 0.55, 1]}>
            <cylinderGeometry args={[0.35, 0.4, 0.18, 12]} />
            <meshStandardMaterial color="#b47b50" roughness={0.9} />
          </mesh>
        </group>

        <group ref={blueprintRef} position={[0, 0.82, 0.54]} rotation={[-0.18, 0, -0.06]}>
          <group ref={paperRef}>
            <mesh material={PAPER_MATERIAL}>
              <planeGeometry args={[0.78, 0.5]} />
            </mesh>
            {[-0.12, 0.02, 0.15].map((y, index) => (
              <mesh key={y} position={[index === 1 ? -0.08 : 0.04, y, 0.008]} material={INK_MATERIAL}>
                <boxGeometry args={[index === 1 ? 0.42 : 0.54, 0.018, 0.008]} />
              </mesh>
            ))}
            <mesh position={[0.18, -0.03, 0.009]} material={INK_MATERIAL}>
              <torusGeometry args={[0.085, 0.012, 5, 14, Math.PI * 1.6]} />
            </mesh>
          </group>
          <mesh ref={leftRollRef} position={[-0.41, 0, 0.015]} material={GOLD_MATERIAL}>
            <cylinderGeometry args={[0.035, 0.035, 0.58, 9]} />
          </mesh>
          <mesh ref={rightRollRef} position={[0.41, 0, 0.015]} material={GOLD_MATERIAL}>
            <cylinderGeometry args={[0.035, 0.035, 0.58, 9]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
