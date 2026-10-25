import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CART_END, TEA_SHED_POSITION } from "../convoyGeometry";
import type { ConvoyPhase } from "../../../store/convoy";
import { useConvoyStore } from "../../../store/convoy";
import { clamp01, smooth01 } from "./shared";

const TRAIL_COUNT = 4;
const CORE_GEOMETRY = new THREE.SphereGeometry(0.5, 12, 10);
const TRAIL_GEOMETRY = new THREE.SphereGeometry(0.5, 8, 6);
const TRAIL_MATERIALS = Array.from({ length: TRAIL_COUNT }, (_, index) => new THREE.MeshBasicMaterial({
  color: index % 2 === 0 ? "#ffb45d" : "#ffd891",
  transparent: true,
  opacity: 0.34 * (1 - index / TRAIL_COUNT),
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
}));

function noRaycast(): void {
  // Companion lights never participate in stone-stack picking.
}

export default function FlameCompanion({ reducedMotion }: { reducedMotion: boolean }) {
  const coreRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const cupRef = useRef<THREE.Group>(null);
  const trailRefs = useRef<Array<THREE.Mesh | null>>([]);
  const animationTime = useRef(0);
  const previousPhase = useRef<ConvoyPhase>(useConvoyStore.getState().phase);
  const target = useRef(new THREE.Vector3());
  const teaSource = useMemo(() => new THREE.Vector3(...TEA_SHED_POSITION).add(new THREE.Vector3(0.15, 1.35, 0.1)), []);
  const teaRecipient = useMemo(() => new THREE.Vector3(...TEA_SHED_POSITION).add(new THREE.Vector3(0.65, 1.22, 1.42)), []);
  const idlePosition = useMemo(() => new THREE.Vector3(...CART_END).add(new THREE.Vector3(1.15, 1.85, 0.35)), []);
  const history = useRef(Array.from({ length: TRAIL_COUNT + 1 }, () => new THREE.Vector3(...CART_END).add(new THREE.Vector3(0, 1.8, 0))));

  useFrame((_, rawDt) => {
    const core = coreRef.current;
    if (!core) return;
    const dt = Math.min(rawDt, 0.05);
    const state = useConvoyStore.getState();
    if (!state.paused) animationTime.current += dt;
    const t = animationTime.current;
    const phase = state.phase;

    if (previousPhase.current !== phase) {
      previousPhase.current = phase;
      history.current.forEach((position) => position.copy(core.position));
    }

    if (phase === "resting") {
      const progress = state.phaseProgress;
      if (progress < 0.2) {
        target.current.copy(teaSource);
      } else if (progress < 0.48) {
        target.current.lerpVectors(teaSource, teaRecipient, smooth01((progress - 0.2) / 0.28));
        target.current.y += Math.sin(clamp01((progress - 0.2) / 0.28) * Math.PI) * (reducedMotion ? 0.06 : 0.32);
      } else if (progress < 0.82) {
        target.current.copy(teaRecipient);
        if (!reducedMotion) target.current.y += Math.sin(t * 3.4) * 0.07;
      } else {
        target.current.lerpVectors(teaRecipient, teaSource, smooth01((progress - 0.82) / 0.18));
      }
      if (cupRef.current) cupRef.current.visible = progress < 0.82;
    } else {
      if (cupRef.current) cupRef.current.visible = false;
      if (phase === "unloading") {
        target.current.set(
          CART_END[0] - 0.95 + (reducedMotion ? 0 : Math.cos(t * 3.1) * 0.42),
          CART_END[1] + 1.5 + (reducedMotion ? 0 : Math.abs(Math.sin(t * 4.8)) * 0.3),
          CART_END[2] + 0.42 + (reducedMotion ? 0 : Math.sin(t * 3.1) * 0.28),
        );
      } else if (phase === "complete") {
        const angle = reducedMotion ? 0.4 : t * 1.9;
        target.current.set(
          CART_END[0] + Math.cos(angle) * (reducedMotion ? 1.1 : 1.5),
          CART_END[1] + 1.55 + (reducedMotion ? 0 : Math.sin(t * 2.7) * 0.2),
          CART_END[2] + Math.sin(angle) * (reducedMotion ? 1.1 : 1.5),
        );
      } else {
        target.current.copy(idlePosition);
        if (!reducedMotion) {
          target.current.x += Math.sin(t * 1.3) * 0.18;
          target.current.y += Math.sin(t * 2.1) * 0.09;
        }
      }
    }

    const smoothing = phase === "complete" ? 7 : 4.5;
    if (!state.paused) core.position.lerp(target.current, 1 - Math.exp(-smoothing * dt));
    const celebrationScale = phase === "complete" && !reducedMotion ? 1 + Math.sin(t * 5.5) * 0.12 : 1;
    core.scale.setScalar(celebrationScale);
    if (glowRef.current) {
      const flicker = reducedMotion || state.paused ? 1 : 1 + Math.sin(t * 11.3) * 0.08;
      glowRef.current.scale.set(0.19 * flicker, 0.27 / flicker, 0.19 * flicker);
    }
    if (lightRef.current) lightRef.current.intensity = phase === "timeUp" ? 0.45 : phase === "complete" ? 1.65 : 1.05;

    if (!state.paused) {
      for (let index = history.current.length - 1; index > 0; index -= 1) {
        history.current[index].copy(history.current[index - 1]);
      }
      history.current[0].copy(core.position);
    }
    for (let index = 0; index < trailRefs.current.length; index += 1) {
      const mesh = trailRefs.current[index];
      if (!mesh) continue;
      mesh.visible = !reducedMotion && (phase === "unloading" || phase === "resting" || phase === "complete");
      mesh.position.copy(history.current[index + 1]);
    }
  }, -2);

  return (
    <>
      <group ref={coreRef} position={idlePosition}>
        <mesh ref={glowRef} geometry={CORE_GEOMETRY} raycast={noRaycast}>
          <meshStandardMaterial
            color="#ffd27c"
            emissive="#ff9f43"
            emissiveIntensity={2.4}
            roughness={0.35}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={CORE_GEOMETRY} scale={[0.1, 0.14, 0.1]} position={[0, -0.025, 0]} raycast={noRaycast}>
          <meshBasicMaterial color="#fff3bd" toneMapped={false} />
        </mesh>
        <pointLight ref={lightRef} color="#ffb76a" intensity={1.05} distance={3.2} decay={2} />
        <group ref={cupRef} position={[0, -0.31, 0]} visible={false}>
          <mesh raycast={noRaycast}>
            <cylinderGeometry args={[0.105, 0.075, 0.13, 12, 1, true]} />
            <meshStandardMaterial color="#d8e1d2" roughness={0.72} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.105, 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
            <torusGeometry args={[0.055, 0.014, 6, 12]} />
            <meshStandardMaterial color="#d8e1d2" roughness={0.72} />
          </mesh>
          <mesh position={[0, -0.07, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.13, 0.13, 0.018, 14]} />
            <meshStandardMaterial color="#9e724e" roughness={0.88} />
          </mesh>
        </group>
      </group>
      {TRAIL_MATERIALS.map((material, index) => (
        <mesh
          key={index}
          ref={(node) => {
            trailRefs.current[index] = node;
          }}
          geometry={TRAIL_GEOMETRY}
          material={material}
          scale={0.105 - index * 0.017}
          visible={false}
          raycast={noRaycast}
        />
      ))}
    </>
  );
}
