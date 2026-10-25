import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// instanced 萤火虫粒子：低成本氛围感
const fract = (value: number) => value - Math.floor(value);

export default function Fireflies({ count = 90, area = 26, color = "#ffd98a" }: { count?: number; area?: number; color?: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: fract(Math.sin(i * 12.9898) * 43758.5453) * area - area / 2,
        z: fract(Math.cos(i * 78.233) * 43758.5453) * area - area / 2,
        y: 0.6 + Math.abs(Math.sin(i * 3.7)) * 3.2,
        speed: 0.3 + Math.abs(Math.sin(i * 5.1)) * 0.7,
        phase: Math.abs(Math.sin(i * 9.3)) * Math.PI * 2,
      })),
    [count, area]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      dummy.position.set(
        s.x + Math.sin(t * s.speed + s.phase) * 1.4,
        s.y + Math.sin(t * s.speed * 0.7 + s.phase * 2) * 0.5,
        s.z + Math.cos(t * s.speed * 0.9 + s.phase) * 1.4
      );
      const tw = 0.6 + Math.sin(t * 2.2 + s.phase * 3) * 0.4;
      dummy.scale.setScalar(0.05 + tw * 0.05);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} />
    </instancedMesh>
  );
}
