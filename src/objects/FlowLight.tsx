import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  position: [number, number, number];
  lit: boolean;
  color?: string;
}

// 心流之光：任务完成不评分、只点亮（PRD 核心设计原则的 3D 呈现）
export default function FlowLight({ position, lit, color = "#ffe9a8" }: Props) {
  const beam = useRef<THREE.Mesh>(null);
  const orb = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const target = lit ? 1 : 0;
    const cur = beam.current ? beam.current.scale.y : 0;
    const next = THREE.MathUtils.lerp(cur, target, dt * 2.2);
    if (beam.current) {
      beam.current.scale.y = Math.max(next, 0.001);
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = next * (0.35 + Math.sin(t * 3) * 0.06);
    }
    if (orb.current) {
      orb.current.scale.setScalar(Math.max(next, 0.001) * (1 + Math.sin(t * 2.5) * 0.12));
      orb.current.position.y = 0.3 + next * 0.25 + Math.sin(t * 1.6) * 0.06;
    }
    if (light.current) light.current.intensity = next * (5 + Math.sin(t * 3) * 1.2);
  });

  return (
    <group position={position}>
      {/* 未点亮时的石座 */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.38, 0.5, 0.28, 7]} />
        <meshStandardMaterial color="#6d6f7a" flatShading />
      </mesh>
      {/* 光柱 */}
      <mesh ref={beam} position={[0, 3, 0]} scale={[1, 0.001, 1]}>
        <cylinderGeometry args={[0.16, 0.3, 6, 8, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* 光球 */}
      <mesh ref={orb} scale={0.001}>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color={color} intensity={0} distance={9} decay={2} />
    </group>
  );
}
