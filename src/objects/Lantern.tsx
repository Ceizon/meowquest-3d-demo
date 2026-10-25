import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  position: [number, number, number];
  label: string;
  color?: string;
  onClick: () => void;
}

// 发光灯笼：悬停放大 + 点击触发（主场景的玩法入口）
export default function Lantern({ position, label, color = "#ffb347", onClick }: Props) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.position.y = position[1] + Math.sin(t * 1.4 + position[0]) * 0.12;
    group.current.rotation.y = t * 0.3;
    const s = THREE.MathUtils.lerp(group.current.scale.x, hover ? 1.25 : 1, 0.12);
    group.current.scale.setScalar(s);
    if (glow.current) {
      const m = glow.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 + Math.sin(t * 2.2 + position[2]) * 0.08 + (hover ? 0.15 : 0);
    }
  });

  return (
    <group position={position}>
      <group
        ref={group}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        {/* 灯身 */}
        <mesh castShadow>
          <sphereGeometry args={[0.42, 12, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover ? 2.2 : 1.3} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 0.16, 8]} />
          <meshStandardMaterial color="#8a5a2b" flatShading />
        </mesh>
        <mesh position={[0, -0.52, 0]}>
          <coneGeometry args={[0.08, 0.25, 6]} />
          <meshStandardMaterial color="#d9a441" />
        </mesh>
        {/* 光晕 */}
        <mesh ref={glow}>
          <sphereGeometry args={[0.85, 12, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
        <pointLight color={color} intensity={hover ? 6 : 3} distance={7} decay={2} />
      </group>
      {hover && <LanternLabel label={label} />}
    </group>
  );
}

function LanternLabel({ label }: { label: string }) {
  return (
    <Html position={[0, 1.4, 0]} center distanceFactor={12} zIndexRange={[40, 0]}>
      <div
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(12,16,38,0.85)",
          border: "1px solid rgba(255,200,120,0.6)",
          color: "#ffe2b0",
          fontSize: 15,
          fontWeight: 600,
          whiteSpace: "nowrap",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </Html>
  );
}
