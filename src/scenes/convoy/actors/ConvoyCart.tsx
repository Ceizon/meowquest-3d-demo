import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CART_START, sampleConvoyRoute } from "../convoyGeometry";
import { useConvoyStore } from "../../../store/convoy";
import { clamp01, dampAngle } from "./shared";

const WHEEL_RADIUS = 0.385;
const SPOKES = [0, Math.PI / 3, (Math.PI * 2) / 3] as const;

interface ConvoyCartProps {
  rigRef: RefObject<THREE.Group>;
  bodyRef: RefObject<THREE.Group>;
  reducedMotion: boolean;
}

export default function ConvoyCart({ rigRef, bodyRef, reducedMotion }: ConvoyCartProps) {
  const wheelRef = useRef<THREE.Group>(null);
  const previousPosition = useRef(new THREE.Vector3(...CART_START));
  const animationTime = useRef(0);
  const previousWeight = useRef(0);
  const initialRoute = useMemo(() => sampleConvoyRoute(0), []);

  useFrame((_, rawDt) => {
    const rig = rigRef.current;
    const body = bodyRef.current;
    if (!rig || !body) return;

    const dt = Math.min(rawDt, 0.05);
    const state = useConvoyStore.getState();
    const poseDt = state.paused ? 0 : dt;
    if (!state.paused) animationTime.current += dt;
    const t = animationTime.current;

    const followsRoute = state.phase === "outbound"
      || state.phase === "unloading"
      || state.phase === "returning"
      || state.phase === "complete"
      || state.phase === "timeUp";

    let heading = initialRoute.rotationY;
    if (followsRoute) {
      const route = sampleConvoyRoute(state.tripProgress);
      rig.position.set(route.position[0], route.position[1], route.position[2]);
      heading = route.rotationY + (state.phase === "returning" ? Math.PI : 0);
    } else {
      rig.position.set(CART_START[0], CART_START[1], CART_START[2]);
    }
    rig.rotation.y = dampAngle(rig.rotation.y, heading, state.paused ? 30 : 11, poseDt);

    if (wheelRef.current) {
      const travelled = previousPosition.current.distanceTo(rig.position);
      if (travelled < 1) wheelRef.current.rotation.x += travelled / WHEEL_RADIUS;
      previousPosition.current.copy(rig.position);
    }

    let weight = 0;
    if (state.phase === "preparing") {
      weight = state.selectedLoad * clamp01(state.phaseProgress);
    } else if (state.phase === "outbound") {
      weight = state.selectedLoad;
    } else if (state.phase === "unloading") {
      weight = state.selectedLoad * (1 - clamp01(state.phaseProgress));
    } else if (state.phase === "timeUp") {
      weight = previousWeight.current;
    }
    if (state.phase !== "timeUp") previousWeight.current = weight;

    const gusting = state.phase === "outbound" && state.wind.status === "gusting";
    const warning = state.phase === "outbound" && state.wind.status === "warning";
    const motionAmount = reducedMotion || state.paused || gusting ? 0 : warning ? 0.22 : 1;
    const vibration = Math.sin(t * (8.5 + weight * 0.8)) * weight * 0.0048 * motionAmount;
    const roll = Math.sin(t * 6.2 + 0.7) * weight * 0.0038 * motionAmount;
    const targetPitch = weight * 0.021 + vibration;
    body.rotation.x = THREE.MathUtils.damp(body.rotation.x, targetPitch, 12, poseDt);
    body.rotation.z = THREE.MathUtils.damp(body.rotation.z, gusting ? -0.018 : roll, 14, poseDt);

    let impact = 0;
    if (state.phase === "preparing" && !reducedMotion && !state.paused) {
      const stonePhase = (state.phaseProgress * state.selectedLoad) % 1;
      if (stonePhase > 0.7) impact = Math.sin(((stonePhase - 0.7) / 0.3) * Math.PI) * 0.026;
    }
    const roadBob = Math.abs(Math.sin(t * 7.5)) * weight * 0.0035 * motionAmount;
    body.position.y = THREE.MathUtils.damp(body.position.y, roadBob - impact, 18, poseDt);
  }, -10);

  return (
    <group ref={rigRef} position={CART_START} rotation={[0, initialRoute.rotationY, 0]}>
      <mesh position={[0, 0.4, 0.61]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 1.18, 10]} />
        <meshStandardMaterial color="#51453b" metalness={0.48} roughness={0.55} />
      </mesh>

      <group ref={wheelRef} position={[0, WHEEL_RADIUS, 0.61]}>
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[0.32, 0.065, 10, 28]} />
          <meshStandardMaterial color="#302c29" roughness={0.96} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.105, 0.105, 0.28, 12]} />
          <meshStandardMaterial color="#8f714d" roughness={0.7} metalness={0.08} />
        </mesh>
        {SPOKES.map((angle) => (
          <mesh key={angle} rotation={[angle, 0, 0]} castShadow>
            <boxGeometry args={[0.075, 0.61, 0.055]} />
            <meshStandardMaterial color="#806143" roughness={0.82} />
          </mesh>
        ))}
        <mesh position={[0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 0.035, 10]} />
          <meshStandardMaterial color="#c1a56d" metalness={0.55} roughness={0.42} />
        </mesh>
      </group>

      <group ref={bodyRef}>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.5, -0.24]} rotation={[-0.08, 0, 0]} castShadow>
            <boxGeometry args={[0.11, 0.13, 1.75]} />
            <meshStandardMaterial color="#6c4931" roughness={0.88} />
          </mesh>
        ))}
        <mesh position={[0, 0.64, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[1.08, 0.16, 1.08]} />
          <meshStandardMaterial color="#8c6240" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.9, 0.49]} rotation={[-0.1, 0, 0]} castShadow>
          <boxGeometry args={[1.26, 0.52, 0.1]} />
          <meshStandardMaterial color="#a3764b" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.87, -0.56]} rotation={[0.08, 0, 0]} castShadow>
          <boxGeometry args={[1.18, 0.44, 0.1]} />
          <meshStandardMaterial color="#8f633f" roughness={0.9} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.57, 0.9, -0.03]} rotation={[0, 0, side * -0.1]} castShadow>
              <boxGeometry args={[0.1, 0.52, 1.12]} />
              <meshStandardMaterial color="#9c7047" roughness={0.9} />
            </mesh>
            <mesh position={[side * 0.62, 1.17, -0.03]} castShadow>
              <boxGeometry args={[0.1, 0.075, 1.18]} />
              <meshStandardMaterial color="#65452f" roughness={0.82} />
            </mesh>
            <mesh position={[side * 0.46, 0.71, -1.12]} rotation={[Math.PI / 2 - 0.08, 0, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.066, 1.62, 9]} />
              <meshStandardMaterial color="#755034" roughness={0.86} />
            </mesh>
            <mesh position={[side * 0.46, 0.78, -1.82]} rotation={[Math.PI / 2 - 0.08, 0, 0]} castShadow>
              <cylinderGeometry args={[0.068, 0.068, 0.34, 10]} />
              <meshStandardMaterial color="#3f332b" roughness={0.96} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.16, 0.54]} castShadow>
          <boxGeometry args={[1.34, 0.075, 0.09]} />
          <meshStandardMaterial color="#65452f" roughness={0.82} />
        </mesh>
        {[-0.36, 0.36].map((x) => (
          <mesh key={x} position={[x, 0.3, -0.43]} rotation={[0.18, 0, x * 0.12]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.58, 8]} />
            <meshStandardMaterial color="#62432f" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
