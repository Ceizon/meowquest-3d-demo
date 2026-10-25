import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import ProceduralMomo from "../../../objects/ProceduralMomo";
import type { MomoModelVariant } from "../../../objects/ProceduralMomo";
import { useConvoyStore } from "../../../store/convoy";
import { CART_START, TEA_SHED_POSITION, sampleConvoyRoute } from "../convoyGeometry";
import type { ConvoyVec3 } from "../convoyGeometry";
import { dampAngle, smooth01 } from "./shared";

const BEHIND_CART: ConvoyVec3 = [0, 0, -2.14];
const TEA_MOMO_OFFSET: ConvoyVec3 = [0.65, 0, 1.55];
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function stopMomoClick(event: ThreeEvent<MouseEvent>): void {
  event.stopPropagation();
}

interface MomoPerformerProps {
  cartRigRef: RefObject<THREE.Group>;
  reducedMotion: boolean;
}

export default function MomoPerformer({ cartRigRef, reducedMotion }: MomoPerformerProps) {
  const rootRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const armsRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const fanRef = useRef<THREE.Group>(null);
  const effortRef = useRef<THREE.Group>(null);
  const movingRef = useRef(false);
  const animationTime = useRef(0);
  const homePosition = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const behindOffset = useRef(new THREE.Vector3(...BEHIND_CART));
  const teaPosition = useMemo(
    () => new THREE.Vector3(...TEA_SHED_POSITION).add(new THREE.Vector3(...TEA_MOMO_OFFSET)),
    [],
  );
  const initialRoute = useMemo(() => sampleConvoyRoute(0), []);
  const initialPosition = useMemo(() => (
    new THREE.Vector3(...BEHIND_CART)
      .applyAxisAngle(Y_AXIS, initialRoute.rotationY)
      .add(new THREE.Vector3(...CART_START))
      .toArray()
  ), [initialRoute]);

  const phase = useConvoyStore((state) => state.phase);
  const selectedLoad = useConvoyStore((state) => state.selectedLoad);
  const pushing = phase === "outbound" || phase === "returning";
  const heavy = phase === "outbound" && selectedLoad >= 3;
  const expecting = phase === "unloading";
  const celebrating = phase === "complete";

  let variant: MomoModelVariant = "default";
  if (celebrating) variant = "expression3";
  else if (phase === "resting" || expecting) variant = "expression2";
  else if (pushing) variant = heavy ? "moving2" : "moving";

  useFrame((_, rawDt) => {
    const root = rootRef.current;
    const pose = poseRef.current;
    const cart = cartRigRef.current;
    if (!root || !pose || !cart) return;

    const dt = Math.min(rawDt, 0.05);
    const state = useConvoyStore.getState();
    if (!state.paused) animationTime.current += dt;
    const t = animationTime.current;
    const currentPhase = state.phase;
    const currentBracing = currentPhase === "outbound" && state.wind.status !== "calm";
    const currentHeavy = currentPhase === "outbound" && state.selectedLoad >= 3;

    behindOffset.current.set(BEHIND_CART[0], BEHIND_CART[1], BEHIND_CART[2]).applyQuaternion(cart.quaternion);
    homePosition.current.copy(cart.position).add(behindOffset.current);
    desiredPosition.current.copy(homePosition.current);
    let heading = cart.rotation.y;
    let restWalking = false;
    let fanActive = false;

    if (currentPhase === "resting") {
      const progress = state.phaseProgress;
      if (progress < 0.24) {
        const travel = smooth01(progress / 0.24);
        desiredPosition.current.lerpVectors(homePosition.current, teaPosition, travel);
        heading = Math.atan2(teaPosition.x - homePosition.current.x, teaPosition.z - homePosition.current.z);
        restWalking = true;
      } else if (progress < 0.76) {
        desiredPosition.current.copy(teaPosition);
        heading = Math.atan2(TEA_SHED_POSITION[0] - teaPosition.x, TEA_SHED_POSITION[2] - teaPosition.z);
        fanActive = true;
      } else {
        const travel = smooth01((progress - 0.76) / 0.24);
        desiredPosition.current.lerpVectors(teaPosition, homePosition.current, travel);
        heading = Math.atan2(homePosition.current.x - teaPosition.x, homePosition.current.z - teaPosition.z);
        restWalking = true;
      }
    }

    root.position.copy(desiredPosition.current);
    if (!state.paused) root.rotation.y = dampAngle(root.rotation.y, heading, 12, dt);

    const isPushing = currentPhase === "outbound" || currentPhase === "returning";
    movingRef.current = !state.paused && ((isPushing && !currentBracing) || restWalking);

    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    let height = reducedMotion || state.paused ? 0 : Math.sin(t * 1.8) * 0.015;
    let scaleX = 1;
    let scaleY = 1;
    let armPitch = 0.2;
    let armsVisible = false;

    if (currentBracing) {
      pitch = currentHeavy ? 0.34 : 0.25;
      roll = -0.075;
      height = 0;
      scaleX = 1.09;
      scaleY = 0.94;
      armPitch = 0.12;
      armsVisible = true;
    } else if (isPushing) {
      pitch = currentHeavy ? 0.36 : currentPhase === "returning" ? 0.13 : 0.2;
      roll = reducedMotion ? 0 : Math.sin(t * (currentHeavy ? 7 : 9)) * (currentHeavy ? 0.045 : 0.024);
      height = reducedMotion ? 0 : Math.abs(Math.sin(t * (currentHeavy ? 7.5 : 9.5))) * 0.032;
      scaleX = currentHeavy ? 1.045 : 1;
      scaleY = currentHeavy ? 0.96 : 1;
      armPitch = currentHeavy ? 0.28 : 0.18;
      armsVisible = true;
    } else if (currentPhase === "unloading") {
      pitch = -0.09;
      height = reducedMotion ? 0 : Math.max(0, Math.sin(t * 4.6)) * 0.065;
      armPitch = -1.08;
      armsVisible = true;
    } else if (currentPhase === "complete") {
      height = reducedMotion ? 0 : Math.abs(Math.sin(t * 5.2)) * 0.24;
      roll = reducedMotion ? 0 : Math.sin(t * 3.1) * 0.075;
      yaw = reducedMotion ? 0 : Math.sin(t * 2.2) * 0.24;
      armPitch = -1.58;
      armsVisible = true;
    } else if (currentPhase === "resting") {
      pitch = fanActive ? 0.045 : restWalking ? 0.12 : 0;
      if (restWalking && !reducedMotion) height = Math.abs(Math.sin(t * 8.5)) * 0.025;
    } else if (currentPhase === "preparing") {
      pitch = 0.07;
      yaw = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.055;
    }

    const poseDt = state.paused ? 0 : dt;
    pose.rotation.x = THREE.MathUtils.damp(pose.rotation.x, pitch, 12, poseDt);
    pose.rotation.y = THREE.MathUtils.damp(pose.rotation.y, yaw, 10, poseDt);
    pose.rotation.z = THREE.MathUtils.damp(pose.rotation.z, roll, 12, poseDt);
    pose.position.y = THREE.MathUtils.damp(pose.position.y, height, 18, poseDt);
    pose.scale.x = THREE.MathUtils.damp(pose.scale.x, scaleX, 12, poseDt);
    pose.scale.y = THREE.MathUtils.damp(pose.scale.y, scaleY, 12, poseDt);
    pose.scale.z = THREE.MathUtils.damp(pose.scale.z, 1, 12, poseDt);

    if (armsRef.current) armsRef.current.visible = armsVisible;
    if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, armPitch, 14, poseDt);
    if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, armPitch, 14, poseDt);

    if (fanRef.current) {
      fanRef.current.visible = currentPhase === "resting";
      const fanWave = fanActive && !reducedMotion && !state.paused ? Math.sin(t * 8.2) * 0.55 : 0;
      fanRef.current.rotation.z = -0.35 + fanWave;
      fanRef.current.rotation.y = fanActive && !reducedMotion ? Math.sin(t * 4.1) * 0.18 : 0;
    }
    if (effortRef.current) {
      effortRef.current.visible = currentHeavy && (isPushing || currentBracing);
      effortRef.current.position.y = 1.12 + (reducedMotion ? 0 : (t * 0.16) % 0.12);
      effortRef.current.rotation.y = reducedMotion ? 0 : Math.sin(t * 3.5) * 0.16;
    }
  }, -4);

  return (
    <group ref={rootRef} position={initialPosition} rotation={[0, initialRoute.rotationY, 0]}>
      <group ref={poseRef}>
        <ProceduralMomo
          position={[0, 0, 0]}
          onClick={stopMomoClick}
          moving={false}
          movingRef={movingRef}
          heading={0}
          scale={0.52}
          variant={variant}
        />

        <group ref={armsRef} visible={false}>
          {[-1, 1].map((side) => (
            <group
              key={side}
              ref={side < 0 ? leftArmRef : rightArmRef}
              position={[side * 0.26, 0.69, 0.13]}
            >
              <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.075, 0.48, 9]} />
                <meshStandardMaterial color="#ecd0a7" roughness={0.9} />
              </mesh>
              <mesh position={[0, 0, 0.5]} castShadow>
                <sphereGeometry args={[0.09, 10, 8]} />
                <meshStandardMaterial color="#f4ddbd" roughness={0.92} />
              </mesh>
            </group>
          ))}
        </group>

        <group ref={fanRef} position={[0.42, 0.58, 0.24]} visible={false}>
          <mesh position={[0, 0.18, 0]} rotation={[0, 0, -0.35]}>
            <circleGeometry args={[0.28, 18, 0, Math.PI * 0.9]} />
            <meshStandardMaterial color="#e9c68f" roughness={0.88} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.38, 7]} />
            <meshStandardMaterial color="#77513a" roughness={0.9} />
          </mesh>
          {[-0.12, 0, 0.12].map((x) => (
            <mesh key={x} position={[x, 0.18, 0.008]} rotation={[0, 0, -x * 2.4]}>
              <boxGeometry args={[0.012, 0.38, 0.012]} />
              <meshStandardMaterial color="#a3734e" roughness={0.9} />
            </mesh>
          ))}
        </group>

        <group ref={effortRef} visible={false}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.42, side * 0.08, 0.08]} rotation={[0, 0, side * -0.35]}>
              <octahedronGeometry args={[0.065, 0]} />
              <meshStandardMaterial color="#a9e5df" emissive="#4b8f91" emissiveIntensity={0.35} roughness={0.4} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
