import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type MomoModelVariant = "default" | "expression2" | "expression3" | "moving" | "moving2";

interface Props {
  position: [number, number, number];
  onClick: (event: ThreeEvent<MouseEvent>) => void;
  moving: boolean;
  movingRef?: RefObject<boolean>;
  heading: number;
  scale?: number;
  variant?: MomoModelVariant;
}

const MODEL_URLS: Record<MomoModelVariant, string> = {
  default: "/momo/momo3D.glb",
  expression2: "/momo/momo2.glb",
  expression3: "/momo/momo3.glb",
  moving: "/momo/momo4.glb",
  moving2: "/momo/momo5.glb",
};

function normalizeModel(model: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(model);
  const modelSize = bounds.getSize(new THREE.Vector3());
  const modelCenter = bounds.getCenter(new THREE.Vector3());
  const normalization = 2.2 / Math.max(modelSize.y, 0.001);

  model.scale.setScalar(normalization);
  model.position.set(
    -modelCenter.x * normalization,
    -bounds.min.y * normalization,
    -modelCenter.z * normalization,
  );
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

export default function ProceduralMomo({
  position,
  onClick,
  moving,
  movingRef,
  heading,
  scale = 1,
  variant = "default",
}: Props) {
  const root = useRef<THREE.Group>(null);
  const modelGroup = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3(...position));
  const motionPhase = useRef(0);
  const previousVariant = useRef(variant);
  const variantPulse = useRef(0);
  const modelUrl = MODEL_URLS[variant];
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    normalizeModel(clone);
    return clone;
  }, [scene]);

  useEffect(() => {
    target.current.set(position[0], position[1], position[2]);
  }, [position]);

  useEffect(() => {
    if (previousVariant.current !== variant) {
      previousVariant.current = variant;
      variantPulse.current = 1;
    }
  }, [variant]);

  useFrame(({ clock }, dt) => {
    if (!root.current) return;
    root.current.position.lerp(target.current, Math.min(1, dt * 12));
    root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, heading, Math.min(1, dt * 10));

    const t = clock.elapsedTime;
    const isMoving = movingRef?.current ?? moving;
    const phaseSpeed = isMoving ? 9.5 : 1.7;
    motionPhase.current += dt * phaseSpeed;
    const phase = motionPhase.current;
    const breath = Math.sin(phase);
    const transition = THREE.MathUtils.damp(variantPulse.current, 0, 8, dt);
    variantPulse.current = transition;

    if (modelGroup.current) {
      if (isMoving) {
        const step = Math.sin(phase);
        const lift = Math.abs(step);
        modelGroup.current.position.y = 0.018 + lift * 0.052;
        modelGroup.current.rotation.x = Math.cos(phase) * 0.018;
        modelGroup.current.rotation.z = step * 0.042;
        modelGroup.current.rotation.y = Math.sin(phase * 0.5) * 0.022;
        modelGroup.current.scale.set(
          1 - lift * 0.018,
          1 + lift * 0.025,
          1 - lift * 0.018,
        );
      } else {
        modelGroup.current.position.y = 0.018 + breath * 0.018;
        modelGroup.current.rotation.x = Math.sin(t * 0.8) * 0.008;
        modelGroup.current.rotation.z = Math.sin(t * 0.65) * 0.018;
        modelGroup.current.rotation.y = Math.sin(t * 0.42) * 0.035;
        modelGroup.current.scale.set(
          1 - breath * 0.012,
          1 + breath * 0.018,
          1 - breath * 0.012,
        );
      }

      // Give each GLB pose a soft settle instead of an abrupt visual pop.
      const settle = 1 + transition * Math.sin(transition * Math.PI) * 0.045;
      modelGroup.current.scale.multiplyScalar(settle);
    }
  });

  return (
    <group ref={root} scale={scale} onClick={onClick}>
      <group ref={modelGroup}>
        <primitive object={model} />
      </group>
    </group>
  );
}

Object.values(MODEL_URLS).forEach((url) => useGLTF.preload(url));
