import { useMemo } from "react";
import * as THREE from "three";

// 远景层叠山剪影：水墨层次，越远越淡（配合 fog 渐隐）
export default function Mountains() {
  const layers = useMemo(() => {
    const defs = [
      { dist: 34, height: 14, color: "#3a4a6b", count: 7, seed: 1 },
      { dist: 48, height: 20, color: "#4a5a7d", count: 8, seed: 2 },
      { dist: 64, height: 28, color: "#5d6c8e", count: 9, seed: 3 },
    ];
    return defs.map((d) => {
      const meshes: { pos: [number, number, number]; scale: [number, number, number]; rot: number }[] = [];
      for (let i = 0; i < d.count; i++) {
        const ang = (i / d.count) * Math.PI * 2 + d.seed * 0.7;
        // 只铺在背向初始镜头的半球及其两侧
        const h = d.height * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.3 + d.seed)));
        meshes.push({
          pos: [Math.sin(ang) * d.dist, h / 2 - 2, Math.cos(ang) * d.dist],
          scale: [h * 1.15, h, h * 1.15],
          rot: ang,
        });
      }
      return { ...d, meshes };
    });
  }, []);

  return (
    <group>
      {layers.map((layer, li) => (
        <group key={li}>
          {layer.meshes.map((m, i) => (
            <mesh key={i} position={m.pos} rotation={[0, m.rot, 0]}>
              <coneGeometry args={[1, 2, 4]} />
              <meshBasicMaterial color={layer.color} fog />
            </mesh>
          ))}
        </group>
      ))}
      {/* 神猫山主峰 */}
      <mesh position={[0, 12, -58]}>
        <coneGeometry args={[16, 34, 5]} />
        <meshBasicMaterial color="#33415f" />
      </mesh>
      <mesh position={[0, 25.5, -58]}>
        <coneGeometry args={[5.5, 8, 5]} />
        <meshBasicMaterial color="#e8ecf5" />
      </mesh>
    </group>
  );
}
