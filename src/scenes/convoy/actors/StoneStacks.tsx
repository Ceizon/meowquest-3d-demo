import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CONVOY_LOADS } from "../../../lib/convoyRules";
import type { ConvoyLoad } from "../../../lib/convoyRules";
import { useConvoyStore } from "../../../store/convoy";
import { STONE_STACK_POSITIONS } from "../convoyGeometry";
import type { ConvoyVec3 } from "../convoyGeometry";
import {
  DEFAULT_STONE_MATERIAL,
  STONE_GEOMETRY,
  STONE_MARK_GEOMETRY,
  STONE_MARK_MATERIAL,
} from "./shared";

interface StackStone {
  position: ConvoyVec3;
  rotation: ConvoyVec3;
  scale: ConvoyVec3;
}

const STACK_STONES: Record<ConvoyLoad, readonly StackStone[]> = {
  1: [
    { position: [0, 0.34, 0], rotation: [0.08, 0.25, -0.06], scale: [1.3, 0.95, 1.15] },
  ],
  2: [
    { position: [-0.27, 0.31, 0], rotation: [0.06, -0.2, 0.08], scale: [1.12, 0.85, 1] },
    { position: [0.27, 0.34, 0.03], rotation: [-0.08, 0.4, -0.05], scale: [1.12, 0.9, 1] },
  ],
  3: [
    { position: [-0.28, 0.29, 0], rotation: [0.08, -0.25, 0.06], scale: [1.08, 0.78, 1] },
    { position: [0.28, 0.29, 0], rotation: [-0.04, 0.3, -0.08], scale: [1.08, 0.78, 1] },
    { position: [0, 0.67, 0.02], rotation: [0.12, 0.65, 0.04], scale: [1.12, 0.84, 1] },
  ],
  4: [
    { position: [-0.28, 0.28, -0.04], rotation: [0.08, -0.3, 0.08], scale: [1.08, 0.75, 1] },
    { position: [0.28, 0.28, 0.04], rotation: [-0.08, 0.25, -0.06], scale: [1.08, 0.75, 1] },
    { position: [-0.24, 0.65, 0.03], rotation: [0.04, 0.55, -0.08], scale: [1.02, 0.78, 0.95] },
    { position: [0.24, 0.69, -0.03], rotation: [-0.1, -0.45, 0.08], scale: [1.02, 0.82, 0.95] },
  ],
};

const SELECTED_RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: "#ffd77e",
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  toneMapped: false,
});
const HOVER_RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: "#b9f1dc",
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  toneMapped: false,
});

interface StoneStackProps {
  load: ConvoyLoad;
  reducedMotion: boolean;
}

function StoneStack({ load, reducedMotion }: StoneStackProps) {
  const [hovered, setHovered] = useState(false);
  const visualRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringTime = useRef(0);
  const selected = useConvoyStore((state) => state.selectedLoad === load);
  const disabled = useConvoyStore((state) => load > state.targetStones - state.stonesFilled);
  const interactive = useConvoyStore((state) => state.phase === "loading" && !state.paused);
  const material = useMemo(() => DEFAULT_STONE_MATERIAL.clone(), []);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.color.set(disabled ? "#7e8581" : hovered && interactive ? "#d9cba9" : selected ? "#c8b58e" : "#b9b4a7");
    material.emissive.set(disabled ? "#000000" : hovered && interactive ? "#8a7450" : selected ? "#54452d" : "#000000");
    material.emissiveIntensity = disabled ? 0 : hovered && interactive ? 0.42 : selected ? 0.18 : 0;
  }, [disabled, hovered, interactive, material, selected]);

  useEffect(() => {
    if (!interactive && hovered) setHovered(false);
    if (!interactive) document.body.style.cursor = "";
  }, [hovered, interactive]);

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  useFrame((_, dt) => {
    const paused = useConvoyStore.getState().paused;
    if (!paused) ringTime.current += dt;
    if (visualRef.current) {
      const target = hovered && interactive ? 1.045 : 1;
      const scale = reducedMotion ? target : THREE.MathUtils.damp(visualRef.current.scale.x, target, 12, paused ? 0 : dt);
      visualRef.current.scale.setScalar(scale);
    }
    if (ringRef.current) {
      const pulse = selected && !reducedMotion ? Math.sin(ringTime.current * 3.2) * 0.035 : 0;
      ringRef.current.scale.setScalar(1 + pulse);
      ringRef.current.rotation.z = reducedMotion ? 0 : ringTime.current * 0.12;
    }
  });

  const canHover = interactive && !disabled;

  return (
    <group
      position={STONE_STACK_POSITIONS[load]}
      onClick={(event) => {
        event.stopPropagation();
        const state = useConvoyStore.getState();
        if (state.phase !== "loading" || state.paused || load > state.targetStones - state.stonesFilled) return;
        state.selectLoad(load);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerOver={(event) => {
        event.stopPropagation();
        if (!interactive) return;
        setHovered(true);
        document.body.style.cursor = disabled ? "not-allowed" : "pointer";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, 0.045, 0]} receiveShadow>
        <cylinderGeometry args={[0.67, 0.73, 0.09, 16]} />
        <meshStandardMaterial color={disabled ? "#676c68" : "#756a58"} roughness={0.98} />
      </mesh>

      <group ref={visualRef}>
        {STACK_STONES[load].map((stone, index) => (
          <group key={index} position={stone.position} rotation={stone.rotation} scale={stone.scale}>
            <mesh geometry={STONE_GEOMETRY} material={material} castShadow receiveShadow />
            <mesh
              geometry={STONE_MARK_GEOMETRY}
              material={STONE_MARK_MATERIAL}
              position={[0, 0.015, 0.235]}
              rotation={[0, 0, index * 0.65 - 0.45]}
            />
          </group>
        ))}
      </group>

      <mesh
        ref={ringRef}
        position={[0, 0.105, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={selected ? SELECTED_RING_MATERIAL : HOVER_RING_MATERIAL}
        visible={selected || (hovered && canHover)}
      >
        <torusGeometry args={[0.72, selected ? 0.035 : 0.022, 8, 40]} />
      </mesh>

      <mesh position={[0, 0.72 + load * 0.04, 0]}>
        <boxGeometry args={[1.45, 1.35 + load * 0.12, 1.35]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function StoneStacks({ reducedMotion }: { reducedMotion: boolean }) {
  return CONVOY_LOADS.map((load) => (
    <StoneStack key={load} load={load} reducedMotion={reducedMotion} />
  ));
}
