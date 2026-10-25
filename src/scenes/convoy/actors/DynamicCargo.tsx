import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BRIDGE_STONE_POSITIONS } from "../convoyGeometry";
import { useConvoyStore } from "../../../store/convoy";
import type { ConvoyPhase } from "../../../store/convoy";
import { CARGO_SLOTS, clamp01, smooth01 } from "./shared";

const CARGO_INDICES = [0, 1, 2, 3] as const;
const CARGO_STONE_GEOMETRY = new THREE.BoxGeometry(0.88, 0.32, 0.94);
const CARGO_MARK_GEOMETRY = new THREE.TorusGeometry(0.17, 0.018, 5, 20, Math.PI * 1.55);
const CARGO_MARK_DETAIL_GEOMETRY = new THREE.BoxGeometry(0.21, 0.018, 0.035);
const CARGO_STONE_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: "#bdc2b3", roughness: 0.92 }),
  new THREE.MeshStandardMaterial({ color: "#b2baad", roughness: 0.92 }),
] as const;
const CARGO_MARK_MATERIAL = new THREE.MeshStandardMaterial({ color: "#81968c", roughness: 0.86 });
const CART_STONE_SCALE = new THREE.Vector3(0.58, 0.8, 0.58);

interface CargoStoneProps {
  index: number;
  bodyRef: RefObject<THREE.Group>;
  reducedMotion: boolean;
}

function CargoStone({ index, bodyRef, reducedMotion }: CargoStoneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const cartPosition = useRef(new THREE.Vector3());
  const targetPosition = useRef(new THREE.Vector3());
  const previousPhase = useRef<ConvoyPhase>(useConvoyStore.getState().phase);
  const stonesFilled = useConvoyStore((state) => state.stonesFilled);
  const material = CARGO_STONE_MATERIALS[(stonesFilled + index) % 2];

  useFrame(() => {
    const group = groupRef.current;
    const visual = visualRef.current;
    const body = bodyRef.current;
    if (!group || !visual || !body) return;

    const state = useConvoyStore.getState();
    if (state.phase === "timeUp") {
      if (previousPhase.current !== "timeUp" && previousPhase.current !== "preparing") {
        group.visible = false;
      }
      previousPhase.current = state.phase;
      return;
    }
    previousPhase.current = state.phase;

    if (index >= state.selectedLoad) {
      group.visible = false;
      return;
    }

    if (state.phase === "preparing") {
      const progress = clamp01(state.phaseProgress * state.selectedLoad - index);
      group.visible = progress > 0;
      if (!group.visible) return;
      visual.scale.copy(CART_STONE_SCALE);

      body.updateWorldMatrix(true, false);
      cartPosition.current.fromArray(CARGO_SLOTS[index]).applyMatrix4(body.matrixWorld);
      group.position.copy(cartPosition.current);
      let squash = 0;
      if (progress < 0.7) {
        const fall = progress / 0.7;
        group.position.y += (1 - fall * fall) * (reducedMotion ? 0.55 : 1.35);
      } else {
        const landing = (progress - 0.7) / 0.3;
        if (!reducedMotion) {
          group.position.y += Math.sin(landing * Math.PI) * 0.075 * (1 - landing);
          squash = landing < 0.45 ? (1 - landing / 0.45) * 0.2 : 0;
        }
      }
      group.scale.set(1 + squash * 0.45, 1 - squash, 1 + squash * 0.45);
      group.rotation.set(
        0.08 * index + (1 - progress) * 0.35,
        0.38 * index + (1 - progress) * 0.7,
        0.05 * index,
      );
      return;
    }

    if (state.phase === "outbound") {
      group.visible = true;
      visual.scale.copy(CART_STONE_SCALE);
      body.updateWorldMatrix(true, false);
      group.position.fromArray(CARGO_SLOTS[index]).applyMatrix4(body.matrixWorld);
      group.scale.setScalar(1);
      group.rotation.set(0.08 * index, 0.38 * index, 0.05 * index);
      return;
    }

    if (state.phase === "unloading") {
      const bridgePosition = BRIDGE_STONE_POSITIONS[state.stonesFilled + index];
      if (!bridgePosition) {
        group.visible = false;
        return;
      }

      const progress = clamp01(state.phaseProgress * state.selectedLoad - index);
      const growth = smooth01(progress);
      group.visible = true;
      visual.scale.set(
        THREE.MathUtils.lerp(CART_STONE_SCALE.x, 1, growth),
        THREE.MathUtils.lerp(CART_STONE_SCALE.y, 1, growth),
        THREE.MathUtils.lerp(CART_STONE_SCALE.z, 1, growth),
      );
      body.updateWorldMatrix(true, false);
      cartPosition.current.fromArray(CARGO_SLOTS[index]).applyMatrix4(body.matrixWorld);
      targetPosition.current.fromArray(bridgePosition);
      if (progress <= 0) {
        group.position.copy(cartPosition.current);
      } else if (progress < 1) {
        group.position.lerpVectors(cartPosition.current, targetPosition.current, smooth01(progress));
        group.position.y += Math.sin(progress * Math.PI) * (reducedMotion ? 0.12 : 0.58);
      } else {
        group.position.copy(targetPosition.current);
      }
      group.scale.setScalar(1);
      const turn = Math.sin(progress * Math.PI) * (reducedMotion ? 0.04 : 0.28);
      group.rotation.set(
        0.08 * index * (1 - progress) + turn * 0.3,
        0.38 * index * (1 - progress) + turn,
        0.05 * index * (1 - progress) + turn * 0.2,
      );
      return;
    }

    group.visible = false;
  }, -5);

  const globalIndex = stonesFilled + index;
  return (
    <group ref={groupRef} visible={false}>
      <group ref={visualRef} scale={CART_STONE_SCALE}>
        <mesh geometry={CARGO_STONE_GEOMETRY} material={material} castShadow receiveShadow />
        <mesh
          geometry={CARGO_MARK_GEOMETRY}
          material={CARGO_MARK_MATERIAL}
          position={[0, 0.166, 0.02]}
          rotation={[-Math.PI / 2, 0, globalIndex % 2 === 0 ? 0 : Math.PI]}
        />
        <mesh
          geometry={CARGO_MARK_DETAIL_GEOMETRY}
          material={CARGO_MARK_MATERIAL}
          position={[0.19, 0.168, -0.13]}
          rotation={[0, globalIndex % 2 === 0 ? 0.35 : -0.35, 0]}
        />
      </group>
    </group>
  );
}

interface DynamicCargoProps {
  bodyRef: RefObject<THREE.Group>;
  reducedMotion: boolean;
}

export default function DynamicCargo({ bodyRef, reducedMotion }: DynamicCargoProps) {
  return CARGO_INDICES.map((index) => (
    <CargoStone key={index} index={index} bodyRef={bodyRef} reducedMotion={reducedMotion} />
  ));
}
