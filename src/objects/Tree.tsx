import { useMemo } from "react";
import { terrainHeight } from "./Terrain";

// 低多边形松树（位置固定伪随机，保证 build 前后一致）
function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function Trees() {
  const trees = useMemo(() => {
    const list: { pos: [number, number, number]; s: number; tint: string }[] = [];
    const tints = ["#3f7d4e", "#4c8a55", "#35704a", "#5a9a60"];
    for (let i = 0; i < 42; i++) {
      const a = rand(i) * Math.PI * 2;
      const r = 6 + rand(i + 100) * 18;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) < 2.2 && z < 16) continue; // 让出中央小径
      const s = 0.7 + rand(i + 200) * 0.9;
      list.push({ pos: [x, terrainHeight(x, z), z], s, tint: tints[i % tints.length] });
    }
    return list;
  }, []);

  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={t.pos} scale={t.s}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.2, 1.2, 5]} />
            <meshStandardMaterial color="#6b4a32" flatShading />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <coneGeometry args={[1.05, 1.7, 6]} />
            <meshStandardMaterial color={t.tint} flatShading />
          </mesh>
          <mesh position={[0, 2.7, 0]} castShadow>
            <coneGeometry args={[0.7, 1.3, 6]} />
            <meshStandardMaterial color={t.tint} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
