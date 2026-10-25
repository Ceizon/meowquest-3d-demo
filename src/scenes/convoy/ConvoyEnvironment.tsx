import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useConvoyStore } from "../../store/convoy";
import ConvoyAtmosphere from "./ConvoyAtmosphere";
import {
  CART_END,
  TEA_SHED_POSITION,
  sampleConvoyRoute,
  type ConvoyVec3,
} from "./convoyGeometry";

const WOOD_DARK = "#604c3d";
const WOOD = "#856548";
const WOOD_LIGHT = "#a5835c";
const ROPE = "#b39a70";
const STONE = "#9aa5a0";
const STONE_LIGHT = "#b7beb3";
const TEAL = "#347f78";
const CORAL = "#cf8072";

interface InstanceTransform {
  position: ConvoyVec3;
  scale: ConvoyVec3;
  rotation?: ConvoyVec3;
  color?: string;
}

function InstanceBoxes({
  transforms,
  roughness = 0.92,
  castShadow = true,
  receiveShadow = true,
}: {
  transforms: InstanceTransform[];
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    transforms.forEach((transform, index) => {
      const rotation = transform.rotation ?? [0, 0, 0];
      matrix.compose(
        new THREE.Vector3(...transform.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...transform.scale),
      );
      mesh.current!.setMatrixAt(index, matrix);
      mesh.current!.setColorAt(index, new THREE.Color(transform.color ?? "#ffffff"));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [transforms]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, transforms.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} />
    </instancedMesh>
  );
}

function InstanceStones({ transforms }: { transforms: InstanceTransform[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    transforms.forEach((transform, index) => {
      const rotation = transform.rotation ?? [0, 0, 0];
      matrix.compose(
        new THREE.Vector3(...transform.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...transform.scale),
      );
      mesh.current!.setMatrixAt(index, matrix);
      mesh.current!.setColorAt(index, new THREE.Color(transform.color ?? STONE));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [transforms]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}

function Beam({
  start,
  end,
  radius = 0.07,
  color = WOOD_DARK,
}: {
  start: ConvoyVec3;
  end: ConvoyVec3;
  radius?: number;
  color?: string;
}) {
  const { midpoint, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    return {
      midpoint: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [start, end]);
  return (
    <mesh position={midpoint} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius * 1.06, length, 7]} />
      <meshStandardMaterial color={color} roughness={0.94} />
    </mesh>
  );
}

function Flag({
  position,
  color,
  phase = 0,
  reducedMotion,
  scale = 1,
}: {
  position: ConvoyVec3;
  color: string;
  phase?: number;
  reducedMotion: boolean;
  scale?: number;
}) {
  const geometry = useMemo(() => {
    const cloth = new THREE.PlaneGeometry(1.05, 1.45, 10, 6);
    cloth.translate(0.525, -0.725, 0);
    return cloth;
  }, []);
  const original = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const wind = useConvoyStore.getState().wind.status;
    const amount = reducedMotion ? 0 : wind === "gusting" ? 0.22 : wind === "warning" ? 0.135 : 0.072;
    const speed = wind === "gusting" ? 5.2 : wind === "warning" ? 3.8 : 2.15;
    const time = reducedMotion ? 0 : clock.elapsedTime * speed;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      const x = original[offset];
      const y = original[offset + 1];
      const influence = THREE.MathUtils.clamp(x / 1.05, 0, 1);
      positions.array[offset] = x;
      positions.array[offset + 1] = y + Math.sin(time * 0.7 + x * 2.5 + phase) * amount * 0.08 * influence;
      positions.array[offset + 2] = (
        Math.sin(time + x * 4.4 + y * 1.5 + phase)
        + Math.sin(time * 0.63 + x * 7.2 + phase) * 0.32
      ) * amount * influence;
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.085, 3.6, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 3.56, 0]} castShadow>
        <boxGeometry args={[1.22, 0.065, 0.075]} />
        <meshStandardMaterial color={WOOD_LIGHT} roughness={0.9} />
      </mesh>
      <mesh geometry={geometry} position={[0.04, 3.52, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.52, 2.86, 0.035]} scale={[0.82, 0.82, 0.82]}>
        <torusGeometry args={[0.18, 0.022, 6, 24, Math.PI * 1.55]} />
        <meshStandardMaterial color="#e7cf96" roughness={0.72} />
      </mesh>
      {[0.89, 1.04].map((x) => (
        <group key={x} position={[x, 1.99, 0]}>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.22, 5]} />
            <meshStandardMaterial color="#dcc28a" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.25, 0]}>
            <coneGeometry args={[0.065, 0.18, 6]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.72, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshStandardMaterial color="#c9a96b" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Crane({
  position,
  rotationY = 0,
  phase,
  reducedMotion,
}: {
  position: ConvoyVec3;
  rotationY?: number;
  phase: number;
  reducedMotion: boolean;
}) {
  const hanging = useRef<THREE.Group>(null);
  const pulley = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const time = reducedMotion ? 0 : clock.elapsedTime;
    if (hanging.current) {
      hanging.current.rotation.z = Math.sin(time * 0.72 + phase) * (reducedMotion ? 0 : 0.035);
      hanging.current.rotation.x = Math.sin(time * 0.51 + phase * 1.7) * (reducedMotion ? 0 : 0.018);
    }
    if (pulley.current) pulley.current.rotation.z = reducedMotion ? 0 : time * 0.16 + phase;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-0.15, 0.1, 0]} castShadow>
        <boxGeometry args={[1.65, 0.2, 1.5]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.95} />
      </mesh>
      <Beam start={[-0.7, 0.1, -0.55]} end={[0, 3.25, 0]} radius={0.11} />
      <Beam start={[-0.7, 0.1, 0.55]} end={[0, 3.25, 0]} radius={0.11} />
      <Beam start={[0.65, 0.1, -0.5]} end={[0, 3.25, 0]} radius={0.1} />
      <Beam start={[0, 0.1, 0]} end={[0, 3.65, 0]} radius={0.13} />
      <Beam start={[-0.65, 2.85, 0]} end={[3.05, 4.15, 0]} radius={0.14} color={WOOD} />
      <Beam start={[0, 1.4, 0]} end={[2.15, 3.78, 0]} radius={0.075} color={WOOD_LIGHT} />
      <Beam start={[-1.15, 0.12, 0]} end={[0, 3.35, 0]} radius={0.024} color={ROPE} />
      <Beam start={[0, 3.45, 0.04]} end={[2.87, 4.03, 0.04]} radius={0.022} color={ROPE} />
      <mesh ref={pulley} position={[2.87, 4.01, 0]} castShadow>
        <torusGeometry args={[0.22, 0.047, 7, 20]} />
        <meshStandardMaterial color="#99805a" metalness={0.25} roughness={0.65} />
      </mesh>
      <group ref={hanging} position={[2.87, 3.86, 0]}>
        <mesh position={[0, -0.94, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 1.88, 6]} />
          <meshStandardMaterial color={ROPE} roughness={1} />
        </mesh>
        <mesh position={[0, -1.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.025, 6, 16, Math.PI * 1.6]} />
          <meshStandardMaterial color="#75634d" metalness={0.2} roughness={0.7} />
        </mesh>
        <mesh position={[0, -2.14, 0]} scale={[0.48, 0.38, 0.43]} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#a8b0a5" roughness={1} flatShading />
        </mesh>
      </group>
    </group>
  );
}

function Lanterns({ positions }: { positions: ConvoyVec3[] }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const tassels = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!body.current || !caps.current || !tassels.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    positions.forEach((position, index) => {
      matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(0.17, 0.35, 0.17));
      body.current!.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(position[0], position[1] + 0.23, position[2]),
        quaternion,
        new THREE.Vector3(0.23, 0.12, 0.23),
      );
      caps.current!.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(position[0], position[1] - 0.27, position[2]),
        quaternion,
        new THREE.Vector3(0.025, 0.2, 0.025),
      );
      tassels.current!.setMatrixAt(index, matrix);
    });
    [body.current, caps.current, tassels.current].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [positions]);
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, positions.length]}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial color="#f2cf91" emissive="#efb766" emissiveIntensity={0.7} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, positions.length]} castShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={tassels} args={[undefined, undefined, positions.length]}>
        <cylinderGeometry args={[1, 1, 1, 5]} />
        <meshStandardMaterial color={CORAL} roughness={0.9} />
      </instancedMesh>
    </>
  );
}

const QUARRY_ROCKS: InstanceTransform[] = [
  { position: [-10.4, -1.6, 2.6], scale: [3.1, 2.8, 3.5], rotation: [0.1, 0.2, -0.1], color: "#71847e" },
  { position: [-6.9, -1.8, 3.1], scale: [3.4, 3, 3.8], rotation: [-0.1, -0.25, 0.08], color: "#687d78" },
  { position: [-3.8, -1.25, 2.4], scale: [2.1, 2.2, 3], rotation: [0.15, 0.4, 0.12], color: "#7b8b82" },
  { position: [-10.1, 1.05, -1.15], scale: [2.35, 3.25, 1.5], rotation: [0.1, 0.15, -0.14], color: "#7f9188" },
  { position: [-6.9, 1.15, -1.35], scale: [2.5, 3.55, 1.55], rotation: [-0.12, -0.2, 0.1], color: "#738780" },
  { position: [-3.95, 0.7, -1.05], scale: [1.65, 2.5, 1.35], rotation: [0.1, 0.35, 0.08], color: "#89988d" },
  { position: [-11.25, -2.7, -1.4], scale: [3.2, 2.1, 2.7], rotation: [0, 0.4, 0], color: "#627a77" },
  { position: [-5.2, -3.1, -1.8], scale: [3.4, 2.3, 2.8], rotation: [0.2, 0.1, 0], color: "#657e79" },
];

function QuarryPlatform() {
  const planks = useMemo(() => {
    const result: InstanceTransform[] = [];
    for (let row = 0; row < 21; row += 1) {
      const z = 0.08 + row * 0.3;
      const offset = row % 2 === 0 ? 0.05 : -0.05;
      [-9.22, -4.78].forEach((x, half) => {
        result.push({
          position: [x + offset, 0.715, z],
          scale: [4.28, 0.13, 0.265],
          color: (row + half) % 3 === 0 ? "#9c7954" : (row + half) % 3 === 1 ? "#8d6c4d" : "#a17f59",
        });
      });
    }
    return result;
  }, []);
  const scattered = useMemo<InstanceTransform[]>(() => Array.from({ length: 22 }, (_, index) => {
    const back = index < 12;
    const x = back ? -10.7 + index * 0.63 : index % 2 === 0 ? -11.05 : -2.95;
    const z = back ? 0.38 + (index % 3) * 0.15 : 1.1 + (index - 12) * 0.48;
    const size = 0.08 + (index % 4) * 0.025;
    return {
      position: [x, 0.8 + size * 0.45, z],
      scale: [size * 1.4, size * 0.75, size],
      rotation: [index * 0.17, index * 0.43, index * 0.09],
      color: index % 3 === 0 ? "#b6b9aa" : "#98a49b",
    };
  }), []);
  return (
    <group>
      <InstanceStones transforms={QUARRY_ROCKS} />
      <mesh position={[-7, 0.45, 3.05]} castShadow receiveShadow>
        <boxGeometry args={[8.9, 0.36, 6.45]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.96} />
      </mesh>
      <InstanceBoxes transforms={planks} />
      {[-10.75, -7, -3.25].flatMap((x) => [0.5, 5.65].map((z) => (
        <group key={`${x}-${z}`}>
          <mesh position={[x, -0.67, z]} castShadow>
            <cylinderGeometry args={[0.13, 0.17, 2.65, 7]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.96} />
          </mesh>
          <Beam start={[x, -1.72, z]} end={[Math.min(x + 1.35, -2.85), 0.47, z]} radius={0.075} />
        </group>
      )))}
      <InstanceBoxes
        transforms={[
          { position: [-9.5, 1.05, 0.05], scale: [2.6, 0.16, 0.22], rotation: [0, 0, -0.08], color: "#91a097" },
          { position: [-6.5, 1.85, -0.02], scale: [2.9, 0.14, 0.2], rotation: [0, 0, 0.06], color: "#87988f" },
          { position: [-8.2, 2.65, -0.28], scale: [3.4, 0.15, 0.2], rotation: [0, 0, -0.04], color: "#94a199" },
          { position: [-4.25, 0.85, 0.02], scale: [1.3, 0.13, 0.2], rotation: [0, 0, 0.09], color: "#98a49a" },
        ]}
      />
      <InstanceStones transforms={scattered} />
    </group>
  );
}

function RopeRail({ side }: { side: -1 | 1 }) {
  const curve = useMemo(() => {
    const points = Array.from({ length: 31 }, (_, index) => {
      const progress = 0.025 + (index / 30) * 0.95;
      const sample = sampleConvoyRoute(progress);
      const next = sampleConvoyRoute(Math.min(1, progress + 0.005));
      const dx = next.position[0] - sample.position[0];
      const dz = next.position[2] - sample.position[2];
      const length = Math.hypot(dx, dz) || 1;
      const sag = Math.sin((index % 3) / 3 * Math.PI) * 0.055;
      return new THREE.Vector3(
        sample.position[0] + side * (dz / length) * 1.06,
        sample.position[1] + 0.43 - sag,
        sample.position[2] - side * (dx / length) * 1.06,
      );
    });
    return new THREE.CatmullRomCurve3(points, false, "centripetal");
  }, [side]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 80, 0.024, 5, false]} />
      <meshStandardMaterial color={ROPE} roughness={1} />
    </mesh>
  );
}

function TransportRamp() {
  const { planks, posts, rails, lanterns } = useMemo(() => {
    const boardTransforms: InstanceTransform[] = [];
    const postTransforms: InstanceTransform[] = [];
    const railTransforms: InstanceTransform[] = [];
    const lanternPositions: ConvoyVec3[] = [];
    const railSamples: { point: THREE.Vector3; heading: number }[][] = [[], []];

    for (let index = 0; index < 46; index += 1) {
      const sample = sampleConvoyRoute(0.012 + (index / 45) * 0.976);
      boardTransforms.push({
        position: [sample.position[0], sample.position[1] - 0.085, sample.position[2]],
        scale: [1.94, 0.13, 0.255],
        rotation: [0, sample.rotationY, 0],
        color: index % 4 === 0 ? "#a07c55" : index % 4 === 1 ? "#8c6a4b" : "#967453",
      });
    }

    [-1, 1].forEach((side, sideIndex) => {
      for (let index = 0; index < 13; index += 1) {
        const progress = 0.035 + (index / 12) * 0.91;
        const sample = sampleConvoyRoute(progress);
        const tangent = new THREE.Vector3(Math.sin(sample.rotationY), 0, Math.cos(sample.rotationY));
        const lateral = new THREE.Vector3(tangent.z, 0, -tangent.x);
        const base = new THREE.Vector3(...sample.position).addScaledVector(lateral, side * 1.06);
        postTransforms.push({
          position: [base.x, base.y + 0.41, base.z],
          scale: [0.105, 0.94, 0.105],
          rotation: [0, sample.rotationY, 0],
          color: index % 2 === 0 ? "#6c523d" : "#775b41",
        });
        railSamples[sideIndex].push({ point: base, heading: sample.rotationY });
        if (index % 3 === 1 && side === (index % 2 === 0 ? 1 : -1)) {
          lanternPositions.push([base.x, base.y + 1.13, base.z]);
        }
      }
    });

    railSamples.forEach((samples) => {
      for (let index = 0; index < samples.length - 1; index += 1) {
        const a = samples[index].point.clone().add(new THREE.Vector3(0, 0.83, 0));
        const b = samples[index + 1].point.clone().add(new THREE.Vector3(0, 0.83, 0));
        const direction = b.clone().sub(a);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          direction.clone().normalize(),
        );
        const euler = new THREE.Euler().setFromQuaternion(quaternion);
        const midpoint = a.clone().add(b).multiplyScalar(0.5);
        railTransforms.push({
          position: [midpoint.x, midpoint.y, midpoint.z],
          scale: [0.075, 0.075, direction.length()],
          rotation: [euler.x, euler.y, euler.z],
          color: "#74583f",
        });
      }
    });
    return { planks: boardTransforms, posts: postTransforms, rails: railTransforms, lanterns: lanternPositions };
  }, []);

  return (
    <group>
      <InstanceBoxes transforms={planks} />
      <InstanceBoxes transforms={posts} />
      <InstanceBoxes transforms={rails} />
      <RopeRail side={-1} />
      <RopeRail side={1} />
      <Lanterns positions={lanterns} />
    </group>
  );
}

function StoneBridge() {
  const { deck, pillars, arches, parapets } = useMemo(() => {
    const deckStones: InstanceTransform[] = [];
    const pillarBlocks: InstanceTransform[] = [];
    const archStones: InstanceTransform[] = [];
    const railBlocks: InstanceTransform[] = [];
    [0.96, 1.9, 2.84].forEach((x) => {
      [-4.91, -3.89].forEach((z) => deckStones.push({
        position: [x, 1.31, z], scale: [0.88, 0.3, 0.95], color: "#a7aea3",
      }));
    });
    [9.32, 10.26, 11.2].forEach((x) => {
      [-4.91, -3.89].forEach((z) => deckStones.push({
        position: [x, 1.34, z], scale: [0.88, 0.32, 0.95], color: "#9fa9a1",
      }));
    });
    [1.02, 11.08].forEach((x) => {
      for (let level = 0; level < 7; level += 1) {
        pillarBlocks.push({
          position: [x + (level % 2 === 0 ? -0.04 : 0.04), -3.6 + level * 0.7, -4.4],
          scale: [1.05, 0.64, 2.15],
          color: level % 2 === 0 ? "#87958e" : "#929e95",
        });
      }
    });
    for (let index = 0; index < 24; index += 1) {
      const theta = 0.035 * Math.PI + (index / 23) * 0.93 * Math.PI;
      if (theta > 0.32 * Math.PI && theta < 0.68 * Math.PI) continue;
      const x = 6.05 + Math.cos(theta) * 5;
      const y = -1.55 + Math.sin(theta) * 2.8;
      const tangentAngle = Math.atan2(2.8 * Math.cos(theta), -5 * Math.sin(theta));
      [-5.3, -3.5].forEach((z) => archStones.push({
        position: [x, y, z],
        scale: [0.62, 0.37, 0.4],
        rotation: [0, 0, tangentAngle],
        color: index % 2 === 0 ? "#a5ada1" : "#939f96",
      }));
    }
    [0.8, 1.8, 2.8, 9.3, 10.3, 11.3].forEach((x) => {
      [-5.48, -3.32].forEach((z) => railBlocks.push({
        position: [x, 1.77, z], scale: [0.28, 0.58, 0.28], color: "#a8afa2",
      }));
    });
    [1.8, 10.3].forEach((x) => {
      [-5.48, -3.32].forEach((z) => railBlocks.push({
        position: [x, 2.02, z], scale: [2.25, 0.18, 0.22], color: "#b2b7aa",
      }));
    });
    return { deck: deckStones, pillars: pillarBlocks, arches: archStones, parapets: railBlocks };
  }, []);
  return (
    <group>
      <InstanceBoxes transforms={pillars} />
      <InstanceBoxes transforms={arches} />
      <InstanceBoxes transforms={deck} />
      <InstanceBoxes transforms={parapets} />
      <InstanceStones
        transforms={[
          { position: [10.4, -1.7, -4.5], scale: [3.4, 2.9, 3.2], rotation: [0.1, 0.2, 0], color: "#718680" },
          { position: [12.2, -2.5, -5.2], scale: [3.1, 2.4, 3.4], rotation: [0, -0.3, 0.1], color: "#687f7b" },
        ]}
      />
      <group position={[9.9, 1.52, -2.75]}>
        <InstanceBoxes
          transforms={[
            { position: [0, 0.18, 0], scale: [0.8, 0.36, 0.65], color: "#8b6a49" },
            { position: [0.48, 0.13, 0.22], scale: [0.55, 0.26, 0.5], rotation: [0, 0.18, 0], color: "#9a7751" },
            { position: [-0.62, 0.1, -0.1], scale: [0.65, 0.2, 0.48], color: "#a6aea1" },
          ]}
        />
        <mesh position={[0.05, 0.44, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.23, 0.035, 6, 24]} />
          <meshStandardMaterial color={ROPE} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

function TeaSteam({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const active = useConvoyStore.getState().phase === "resting";
    const time = reducedMotion ? 0 : clock.elapsedTime;
    group.current.children.forEach((child, index) => {
      const progress = reducedMotion ? index / 4 : (time * 0.17 + index * 0.24) % 1;
      child.position.set(
        Math.sin(time * 0.75 + index * 1.9) * 0.09 * progress,
        progress * 0.95,
        Math.cos(time * 0.6 + index) * 0.045 * progress,
      );
      const size = (0.07 + progress * 0.12) * (active ? 1.2 : 0.8);
      child.scale.set(size * 1.25, size, size);
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = (reducedMotion ? 0.06 : active ? 0.23 : 0.13) * (1 - progress * 0.72);
    });
  });
  return (
    <group ref={group} position={[0.25, 1.17, 0.12]}>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index}>
          <sphereGeometry args={[1, 10, 7]} />
          <meshBasicMaterial color="#edf3e8" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Incense({ reducedMotion }: { reducedMotion: boolean }) {
  const stick = useRef<THREE.Mesh>(null);
  const ember = useRef<THREE.Mesh>(null);
  const smoke = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const incense = useConvoyStore.getState().incense;
    const length = Math.max(0.001, incense * 1.08);
    if (stick.current) {
      stick.current.visible = incense > 0.003;
      stick.current.scale.y = length;
      stick.current.position.y = length * 0.5;
    }
    if (ember.current) {
      ember.current.visible = incense > 0.003;
      ember.current.position.y = length + 0.015;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 5.5) * 0.12;
      ember.current.scale.setScalar(pulse);
    }
    if (smoke.current) {
      smoke.current.visible = incense > 0.01;
      smoke.current.position.y = length;
      const time = reducedMotion ? 0 : clock.elapsedTime;
      smoke.current.children.forEach((child, index) => {
        const progress = reducedMotion ? 0.25 + index * 0.23 : (time * 0.12 + index * 0.31) % 1;
        child.position.set(
          Math.sin(time * 0.65 + index * 2.1) * 0.11 * progress,
          0.08 + progress * 0.85,
          Math.cos(time * 0.43 + index) * 0.05 * progress,
        );
        const size = 0.045 + progress * 0.095;
        child.scale.set(size, size * 1.35, size);
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = (reducedMotion ? 0.05 : 0.15) * (1 - progress * 0.75);
      });
    }
  });
  return (
    <group position={[1.62, 0.91, 1.03]} rotation={[0, 0, -0.08]}>
      <mesh position={[0, -0.12, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.18, 0.18, 12]} />
        <meshStandardMaterial color="#75867d" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.035, 7, 20]} />
        <meshStandardMaterial color="#a6afa0" roughness={0.85} />
      </mesh>
      <mesh ref={stick}>
        <cylinderGeometry args={[0.018, 0.018, 1, 6]} />
        <meshStandardMaterial color="#8b5d45" roughness={0.9} />
      </mesh>
      <mesh ref={ember}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshStandardMaterial color="#ffd08a" emissive="#f28b51" emissiveIntensity={2.2} />
      </mesh>
      <group ref={smoke}>
        {[0, 1, 2].map((index) => (
          <mesh key={index}>
            <sphereGeometry args={[1, 9, 6]} />
            <meshBasicMaterial color="#dce7df" transparent opacity={0.15} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function TeaBowl({ position }: { position: ConvoyVec3 }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.13, 0.085, 0.13, 14, 1, true]} />
        <meshStandardMaterial color="#b8c9ba" roughness={0.62} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.108, 0.108, 0.012, 14]} />
        <meshStandardMaterial color="#7f9a7b" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.012, 6, 20]} />
        <meshStandardMaterial color="#d4dbc9" roughness={0.6} />
      </mesh>
    </group>
  );
}

function TeaShed({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group position={TEA_SHED_POSITION}>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[3.5, 0.16, 2.8]} />
        <meshStandardMaterial color="#776149" roughness={0.95} />
      </mesh>
      {[-1.38, 1.38].flatMap((x) => [-1.02, 1.02].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 1.36, z]} castShadow>
          <cylinderGeometry args={[0.075, 0.1, 2.65, 7]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.94} />
        </mesh>
      )))}
      <mesh position={[0, 2.57, 0]} castShadow>
        <boxGeometry args={[3.25, 0.15, 2.35]} />
        <meshStandardMaterial color={WOOD} roughness={0.92} />
      </mesh>
      <mesh position={[0, 2.95, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.65, 0.76]} castShadow>
        <coneGeometry args={[2.45, 1.05, 4]} />
        <meshStandardMaterial color="#607d76" roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, 3.35, 0]} castShadow>
        <boxGeometry args={[1.85, 0.1, 0.12]} />
        <meshStandardMaterial color="#8a9a85" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.83, 0.12]} castShadow>
        <boxGeometry args={[1.7, 0.13, 0.92]} />
        <meshStandardMaterial color="#987650" roughness={0.88} />
      </mesh>
      {[-0.65, 0.65].flatMap((x) => [-0.28, 0.5].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.43, z]} castShadow>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.94} />
        </mesh>
      )))}
      <mesh position={[0, 0.42, 1.0]} castShadow>
        <boxGeometry args={[2.15, 0.13, 0.42]} />
        <meshStandardMaterial color="#87694b" roughness={0.92} />
      </mesh>
      <TeaBowl position={[-0.48, 0.97, 0.14]} />
      <TeaBowl position={[0.65, 0.97, 0.26]} />
      <group position={[0.16, 1.08, 0.02]}>
        <mesh scale={[1.15, 0.85, 1]} castShadow>
          <sphereGeometry args={[0.2, 12, 8]} />
          <meshStandardMaterial color="#aebdac" roughness={0.65} />
        </mesh>
        <mesh position={[0.22, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.085, 0.28, 9]} />
          <meshStandardMaterial color="#aebdac" roughness={0.65} />
        </mesh>
        <mesh position={[-0.19, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.12, 0.025, 6, 18, Math.PI * 1.5]} />
          <meshStandardMaterial color="#93a794" roughness={0.65} />
        </mesh>
      </group>
      <TeaSteam reducedMotion={reducedMotion} />
      <Incense reducedMotion={reducedMotion} />
      <mesh position={[-1.15, 1.95, 1.06]}>
        <cylinderGeometry args={[0.015, 0.015, 0.65, 5]} />
        <meshStandardMaterial color={ROPE} roughness={1} />
      </mesh>
      <mesh position={[-1.15, 1.55, 1.06]}>
        <coneGeometry args={[0.13, 0.22, 8, 1, true]} />
        <meshStandardMaterial color="#b99a68" metalness={0.3} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function ConvoyEnvironment({ reducedMotion }: { reducedMotion: boolean }) {
  const bridgeLanterns = useMemo<ConvoyVec3[]>(() => [
    [CART_END[0] - 0.8, 3.05, -5.5],
    [9.55, 3.08, -3.28],
    [TEA_SHED_POSITION[0] - 1.15, TEA_SHED_POSITION[1] + 1.65, TEA_SHED_POSITION[2] + 1.05],
  ], []);
  return (
    <>
      <ConvoyAtmosphere reducedMotion={reducedMotion} />
      <QuarryPlatform />
      <Flag position={[-11.1, 0.79, 5.65]} color={TEAL} phase={0.4} reducedMotion={reducedMotion} />
      <Flag position={[-2.85, 0.82, 1.05]} color={TEAL} phase={2.1} reducedMotion={reducedMotion} scale={0.9} />
      <TransportRamp />
      <StoneBridge />
      <Flag position={[1.15, 1.48, -5.75]} color={CORAL} phase={1.2} reducedMotion={reducedMotion} />
      <Flag position={[10.55, 1.5, -5.6]} color={CORAL} phase={2.8} reducedMotion={reducedMotion} scale={0.9} />
      <Crane position={[-6.8, 0.79, 0.2]} phase={0.3} reducedMotion={reducedMotion} />
      <Crane position={[0.65, 1.48, -6.15]} rotationY={0.06} phase={2.2} reducedMotion={reducedMotion} />
      <TeaShed reducedMotion={reducedMotion} />
      <Lanterns positions={bridgeLanterns} />
    </>
  );
}
