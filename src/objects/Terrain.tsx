import * as THREE from "three";
import { useMemo } from "react";

// 低多边形起伏地形：噪声位移 + 顶点色渐变（山谷深绿 → 山脚暖金）
function pseudoNoise(x: number, z: number) {
  return (
    Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.9 +
    Math.sin(x * 0.12 + 2.1) * Math.cos(z * 0.16 + 1.3) * 1.6 +
    Math.sin(x * 0.9 + z * 0.7) * 0.22
  );
}

export function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const pathFlatten = Math.exp(-Math.abs(x) * 0.35) * 0.75; // 中央小径压平
  return pseudoNoise(x, z) * (1 - pathFlatten) - Math.max(0, r - 22) * 0.12;
}

export default function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(70, 70, 64, 64);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors: number[] = [];
    const deep = new THREE.Color("#2e5d3a");
    const light = new THREE.Color("#7fae5f");
    const gold = new THREE.Color("#c9a86a");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      const c = deep.clone().lerp(light, THREE.MathUtils.clamp((y + 1.6) / 3.4, 0, 1));
      c.lerp(gold, THREE.MathUtils.clamp(1 - Math.hypot(x, z) / 34, 0, 1) * 0.25);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}
