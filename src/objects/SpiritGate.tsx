import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  position: [number, number, number];
  onClick: () => void;
}

export default function SpiritGate({ position, onClick }: Props) {
  const ring = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.elapsedTime;
    ring.current.rotation.z = Math.sin(t * 0.8) * 0.035;
    ring.current.rotation.y = t * 0.18;
    ring.current.position.y = Math.sin(t * 1.5) * 0.05;
  });

  return (
    <group position={position}>
      <group
        ref={ring}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <mesh position={[-1.05, 1.45, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.22, 3.1, 8]} />
          <meshStandardMaterial color="#5d3b2c" roughness={0.85} />
        </mesh>
        <mesh position={[1.05, 1.45, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.22, 3.1, 8]} />
          <meshStandardMaterial color="#5d3b2c" roughness={0.85} />
        </mesh>
        <mesh position={[0, 3.02, 0]} castShadow>
          <boxGeometry args={[2.5, 0.22, 0.32]} />
          <meshStandardMaterial color="#8b5935" roughness={0.75} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 1.55, 0.05]}>
          <torusGeometry args={[1.04, 0.12, 16, 64]} />
          <meshStandardMaterial
            color={hover ? "#ffd98a" : "#b87943"}
            emissive={hover ? "#ffd98a" : "#6f3f25"}
            emissiveIntensity={hover ? 2.8 : 0.9}
            metalness={0.25}
            roughness={0.55}
          />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <circleGeometry args={[0.92, 48]} />
          <meshBasicMaterial
            color="#8be7e1"
            transparent
            opacity={hover ? 0.38 : 0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 1.55, -0.03]}>
          <torusGeometry args={[0.72, 0.025, 8, 48]} />
          <meshBasicMaterial color="#fff0b7" transparent opacity={0.8} toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i * Math.PI * 2) / 6;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.23, 1.55 + Math.sin(a) * 1.23, 0]}>
              <octahedronGeometry args={[0.075]} />
              <meshBasicMaterial color="#ffe4a6" toneMapped={false} />
            </mesh>
          );
        })}
      </group>
      <Html position={[0, 3.55, 0]} center distanceFactor={11} zIndexRange={[30, 0]}>
        <style>{`
          .mq-spirit-gate-label:focus-visible {
            outline: 2px solid #fff0b7;
            outline-offset: 3px;
          }
        `}</style>
        <button
          type="button"
          className="mq-spirit-gate-label"
          aria-label="Enter the Spirit Realm"
          onClick={onClick}
          style={{
            margin: 0,
            padding: "8px 16px",
            borderRadius: 999,
            background: "rgba(16,31,54,0.86)",
            border: "1px solid rgba(154,239,231,0.65)",
            color: "#d9fffa",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            lineHeight: "inherit",
            whiteSpace: "nowrap",
            boxShadow: "0 0 24px rgba(92,226,220,0.3)",
            appearance: "none",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          {hover ? "Enter the Spirit Realm" : "Spirit Realm Gate"}
        </button>
      </Html>
    </group>
  );
}
