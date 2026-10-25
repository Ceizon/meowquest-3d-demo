import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ConvoyVec3 } from "./convoyGeometry";

interface InstanceTransform {
  position: ConvoyVec3;
  scale: ConvoyVec3;
  rotationY?: number;
  color?: string;
}

const MOUNTAINS: InstanceTransform[] = [
  { position: [-25, 0, -34], scale: [8, 18, 7], rotationY: 0.2, color: "#799a9e" },
  { position: [-15, 1, -39], scale: [7, 23, 7], rotationY: -0.4, color: "#86a5a7" },
  { position: [-7, -1, -31], scale: [6, 15, 6], rotationY: 0.5, color: "#6f9297" },
  { position: [1, 0, -41], scale: [9, 22, 8], rotationY: 0.1, color: "#8da9aa" },
  { position: [11, -1, -34], scale: [7, 17, 6], rotationY: -0.3, color: "#729498" },
  { position: [21, 0, -39], scale: [9, 21, 8], rotationY: 0.45, color: "#87a4a6" },
  { position: [30, -2, -31], scale: [7, 15, 7], rotationY: -0.2, color: "#6f9196" },
  { position: [-19, -2, -20], scale: [5, 11, 5], rotationY: 0.3, color: "#63888b" },
  { position: [18, -2, -22], scale: [5, 12, 5], rotationY: -0.5, color: "#668b8e" },
];

const LOW_CLOUDS: InstanceTransform[] = [
  { position: [-16, -2.8, 4], scale: [6.5, 0.75, 4.2] },
  { position: [-8, -2.5, 7], scale: [5.5, 0.65, 3.5] },
  { position: [0, -2.9, 5], scale: [7, 0.8, 4.5] },
  { position: [9, -2.6, 4], scale: [6.5, 0.7, 4] },
  { position: [17, -2.9, 1], scale: [7.5, 0.8, 4.5] },
  { position: [-13, -3.2, -6], scale: [7, 0.85, 4] },
  { position: [-4, -2.7, -5], scale: [5.8, 0.7, 3.8] },
  { position: [5, -3.1, -7], scale: [7, 0.8, 4.2] },
  { position: [14, -2.6, -8], scale: [6, 0.75, 4] },
  { position: [-20, -3.5, -14], scale: [8, 0.9, 5] },
  { position: [-9, -3.3, -16], scale: [7, 0.8, 4.5] },
  { position: [3, -3.5, -15], scale: [8.5, 0.9, 5] },
  { position: [16, -3.4, -17], scale: [8, 0.85, 4.5] },
];

const HIGH_CLOUDS: InstanceTransform[] = [
  { position: [-20, -0.9, -15], scale: [5.5, 0.42, 2.8] },
  { position: [-12, -0.65, -18], scale: [4.6, 0.38, 2.4] },
  { position: [-3, -1.1, -17], scale: [5.8, 0.45, 2.8] },
  { position: [7, -0.8, -20], scale: [5.4, 0.4, 2.7] },
  { position: [17, -1, -18], scale: [6.2, 0.46, 3] },
  { position: [-27, -0.7, -28], scale: [7, 0.5, 3.4] },
  { position: [-14, -1, -30], scale: [6.5, 0.45, 3.2] },
  { position: [0, -0.8, -29], scale: [7.5, 0.5, 3.5] },
  { position: [15, -0.7, -31], scale: [7, 0.48, 3.5] },
  { position: [28, -1.1, -27], scale: [6.5, 0.45, 3.2] },
];

function InstanceClouds({
  transforms,
  color,
  opacity,
}: {
  transforms: InstanceTransform[];
  color: string;
  opacity: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    transforms.forEach((transform, index) => {
      matrix.compose(
        new THREE.Vector3(...transform.position),
        quaternion,
        new THREE.Vector3(...transform.scale),
      );
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [transforms]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, transforms.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} fog />
    </instancedMesh>
  );
}

function CloudLayer({
  transforms,
  color,
  opacity,
  phase,
  reducedMotion,
}: {
  transforms: InstanceTransform[];
  color: string;
  opacity: number;
  phase: number;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    group.current.position.x = Math.sin(t * 0.055 + phase) * 0.75;
    group.current.position.z = Math.cos(t * 0.038 + phase) * 0.24;
  });
  return (
    <group ref={group}>
      <InstanceClouds transforms={transforms} color={color} opacity={opacity} />
    </group>
  );
}

function MountainRange() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    MOUNTAINS.forEach((mountain, index) => {
      matrix.compose(
        new THREE.Vector3(...mountain.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, mountain.rotationY ?? 0, 0)),
        new THREE.Vector3(...mountain.scale),
      );
      mesh.current!.setMatrixAt(index, matrix);
      mesh.current!.setColorAt(index, new THREE.Color(mountain.color ?? "#78999c"));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MOUNTAINS.length]}>
      <coneGeometry args={[1, 1, 7, 3]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}

function CityTower({ position, scale = 1 }: { position: ConvoyVec3; scale?: number }) {
  const stone = "#718887";
  const timber = "#657b79";
  const roof = "#526f71";
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, -2.8, 0]} scale={[3.8, 4.6, 3.2]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#6f8884" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.1, 0.5, 2.8]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[3.5, 1.65, 2.25]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      <mesh position={[0, 1.05, 1.14]}>
        <boxGeometry args={[1.05, 1.35, 0.035]} />
        <meshBasicMaterial color="#4f6b6c" />
      </mesh>
      <mesh position={[0, 1.6, 1.18]}>
        <torusGeometry args={[0.53, 0.11, 6, 20, Math.PI]} />
        <meshStandardMaterial color="#829795" roughness={1} />
      </mesh>
      {[-1.45, -0.52, 0.52, 1.45].map((x) => (
        <mesh key={x} position={[x, 2.55, 0.92]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 1.45, 7]} />
          <meshStandardMaterial color={timber} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[3.15, 1.25, 1.85]} />
        <meshStandardMaterial color="#78908d" roughness={1} />
      </mesh>
      {[-0.85, 0, 0.85].map((x) => (
        <mesh key={x} position={[x, 2.65, 0.94]}>
          <boxGeometry args={[0.4, 0.62, 0.035]} />
          <meshBasicMaterial color="#536f70" />
        </mesh>
      ))}
      <mesh position={[0, 2.18, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.55, 0.78]} castShadow>
        <coneGeometry args={[2.65, 0.85, 4]} />
        <meshStandardMaterial color={roof} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 3.42, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.62, 0.78]} castShadow>
        <coneGeometry args={[2.45, 0.95, 4]} />
        <meshStandardMaterial color={roof} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 3.92, 0]} castShadow>
        <boxGeometry args={[2.5, 0.12, 0.14]} />
        <meshStandardMaterial color="#829896" roughness={0.9} />
      </mesh>
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} position={[x, 4.02, 0]}>
          <sphereGeometry args={[0.12, 7, 5]} />
          <meshStandardMaterial color="#8a9e99" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export default function ConvoyAtmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <MountainRange />
      <CityTower position={[12.3, 0.25, -10.5]} scale={1.08} />
      <CityTower position={[2.8, -0.75, -23]} scale={1.32} />
      <CloudLayer
        transforms={LOW_CLOUDS}
        color="#edf4ed"
        opacity={0.5}
        phase={0}
        reducedMotion={reducedMotion}
      />
      <CloudLayer
        transforms={HIGH_CLOUDS}
        color="#e4efeb"
        opacity={0.3}
        phase={2.4}
        reducedMotion={reducedMotion}
      />
      <group position={[0, 1.2, -26]} scale={[24, 1.4, 5]}>
        <mesh>
          <sphereGeometry args={[1, 20, 10]} />
          <meshBasicMaterial color="#d8e6e1" transparent opacity={0.13} depthWrite={false} fog />
        </mesh>
      </group>
    </>
  );
}
