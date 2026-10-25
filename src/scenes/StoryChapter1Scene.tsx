import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import CatCompanion from "../objects/CatCompanion";
import { terrainHeight } from "../objects/Terrain";

function Banner({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.09, 3.8, 8]} />
        <meshStandardMaterial color="#65412c" roughness={0.8} />
      </mesh>
      <mesh position={[0.25, 3.05, 0]} rotation={[0, 0, -0.02]} castShadow>
        <boxGeometry args={[0.95, 1.45, 0.045]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0.25, 3.05, 0.035]}>
        <ringGeometry args={[0.16, 0.25, 8]} />
        <meshBasicMaterial color="#ffe0a0" toneMapped={false} />
      </mesh>
      <mesh position={[0.25, 2.28, 0]}>
        <coneGeometry args={[0.22, 0.32, 4]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0.25, 3.05, 0.06]}>
        <torusGeometry args={[0.13, 0.02, 8, 24]} />
        <meshBasicMaterial color="#ffe0a0" toneMapped={false} />
      </mesh>
      <mesh position={[0.25, 3.05, 0.08]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.23, 0.06, 0.025]} />
        <meshBasicMaterial color="#ffe0a0" toneMapped={false} />
      </mesh>
      <mesh position={[0.25, 3.05, 0.08]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.23, 0.06, 0.025]} />
        <meshBasicMaterial color="#ffe0a0" toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.88, 0]}>
        <boxGeometry args={[0.9, 0.09, 0.12]} />
        <meshStandardMaterial color="#8b5935" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.88, 0]}>
        <sphereGeometry args={[0.15, 8, 6]} />
        <meshStandardMaterial color="#8b5935" roughness={0.8} />
      </mesh>
    </group>
  );
}

function CargoPlatform({ side }: { side: -1 | 1 }) {
  const x = side * 5.2;
  return (
    <group position={[x, 0, -1.1]}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[3.6, 0.32, 2.8]} />
        <meshStandardMaterial color="#8c5d38" roughness={0.9} />
      </mesh>
      {[-1.45, 1.45].map((z) => (
        <mesh key={z} position={[0, 1.25, z]} castShadow>
          <boxGeometry args={[3.6, 2.2, 0.22]} />
          <meshStandardMaterial color="#67422e" roughness={0.9} />
        </mesh>
      ))}
      {[-1.35, 1.35].map((z) => (
        <mesh key={z} position={[0, 0.7, z * 0.72]} rotation={[0, 0, side * 0.65]} castShadow>
          <boxGeometry args={[3.4, 0.18, 1.5]} />
          <meshStandardMaterial color="#a87345" roughness={0.9} />
        </mesh>
      ))}
      {[-1.5, 1.5].map((z) => (
        <mesh key={z} position={[side * 1.6, 1.1, z]} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 2.4, 8]} />
          <meshStandardMaterial color="#593a29" roughness={0.9} />
        </mesh>
      ))}
      {[-0.9, 0.9].map((z) => (
        <mesh key={z} position={[side * 0.75, 2.72, z]} castShadow>
          <boxGeometry args={[0.75, 0.65, 0.75]} />
          <meshStandardMaterial color="#d9c4a0" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[side * 0.1, 2.85, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 24]} />
        <meshStandardMaterial color="#c99a58" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[side * 0.1, 1.2, 0]} rotation={[0, 0, side * 0.2]}>
        <boxGeometry args={[0.2, 2.4, 0.2]} />
        <meshStandardMaterial color="#755034" roughness={0.9} />
      </mesh>
    </group>
  );
}

function MountainStack({ position, scale }: { position: [number, number, number]; scale: [number, number, number] }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <coneGeometry args={[1, 1, 6]} />
      <meshStandardMaterial color="#91b8bd" roughness={1} flatShading />
    </mesh>
  );
}

export default function StoryChapter1Scene() {
  const controls = useRef<OrbitControlsImpl>(null);

  useFrame(({ clock }) => {
    if (controls.current) controls.current.target.y = 1.35 + Math.sin(clock.elapsedTime * 0.25) * 0.03;
  });

  return (
    <>
      <color attach="background" args={["#a7d5f1"]} />
      <fog attach="fog" args={["#b8d9e3", 28, 105]} />
      <ambientLight intensity={1.05} color="#fff1d2" />
      <directionalLight
        position={[-10, 18, 8]}
        intensity={1.45}
        color="#ffe4bd"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight args={["#c9edff", "#687b62", 0.7]} />

      <mesh position={[0, -0.35, -10]} receiveShadow>
        <boxGeometry args={[34, 0.35, 30]} />
        <meshStandardMaterial color="#d9bf91" roughness={1} />
      </mesh>
      <mesh position={[0, -0.12, 3]} receiveShadow>
        <boxGeometry args={[18, 0.2, 18]} />
        <meshStandardMaterial color="#cda978" roughness={0.95} />
      </mesh>

      <group position={[0, 0, -9]}>
        <mesh position={[0, 3.3, 0]} castShadow>
          <boxGeometry args={[7.6, 0.65, 1.1]} />
          <meshStandardMaterial color="#e1cba3" roughness={0.9} />
        </mesh>
        <mesh position={[-3.2, 1.75, 0]} castShadow>
          <boxGeometry args={[0.95, 4.1, 1.1]} />
          <meshStandardMaterial color="#d7bd91" roughness={0.9} />
        </mesh>
        <mesh position={[3.2, 1.75, 0]} castShadow>
          <boxGeometry args={[0.95, 4.1, 1.1]} />
          <meshStandardMaterial color="#d7bd91" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.3, 0.1]}>
          <torusGeometry args={[2.15, 0.32, 10, 48, Math.PI]} />
          <meshStandardMaterial color="#bea276" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.5, 0.1]}>
          <boxGeometry args={[4.1, 1.6, 0.9]} />
          <meshStandardMaterial color="#a08a6a" roughness={0.95} />
        </mesh>
        <Banner position={[-2.45, 0, 0.65]} color="#285d9f" />
        <Banner position={[2.45, 0, 0.65]} color="#c84d42" />
      </group>

      <CargoPlatform side={-1} />
      <CargoPlatform side={1} />
      <Banner position={[-7.1, 0, -1.1]} color="#285d9f" />
      <Banner position={[7.1, 0, -1.1]} color="#c84d42" />

      <group position={[0, 2.8, -1.6]}>
        <mesh position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 4.6, 8]} />
          <meshStandardMaterial color="#6b452f" roughness={0.85} />
        </mesh>
        <mesh position={[0, -2.2, 0]}>
          <boxGeometry args={[1.2, 0.14, 1.2]} />
          <meshStandardMaterial color="#8b5b36" roughness={0.9} />
        </mesh>
        <mesh position={[0, -2.65, 0]}>
          <boxGeometry args={[0.78, 0.78, 0.78]} />
          <meshStandardMaterial color="#d8c3a1" roughness={0.98} />
        </mesh>
        <mesh position={[0, -2.65, 0.42]}>
          <boxGeometry args={[0.9, 0.05, 0.04]} />
          <meshBasicMaterial color="#9b6b42" />
        </mesh>
      </group>

      <MountainStack position={[-8, 2.4, -15]} scale={[5, 5.5, 3]} />
      <MountainStack position={[-3.5, 3.6, -19]} scale={[4, 7, 3]} />
      <MountainStack position={[4.5, 3.2, -18]} scale={[5, 6, 3]} />
      <MountainStack position={[9, 2.2, -14]} scale={[4, 4.8, 3]} />
      <mesh position={[0, 4.6, -14]}>
        <sphereGeometry args={[7, 24, 12]} />
        <meshBasicMaterial color="#eaf6f1" transparent opacity={0.68} depthWrite={false} />
      </mesh>
      <mesh position={[-8, 6.3, -18]}>
        <sphereGeometry args={[4.8, 20, 12]} />
        <meshBasicMaterial color="#f5fbff" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh position={[8, 6.8, -18]}>
        <sphereGeometry args={[5.8, 20, 12]} />
        <meshBasicMaterial color="#f5fbff" transparent opacity={0.8} depthWrite={false} />
      </mesh>

      <Sparkles count={95} scale={[17, 4, 22]} position={[0, 3.3, -5]} size={2.2} speed={0.18} color="#fff0c2" opacity={0.8} />
      <Sparkles count={36} scale={[12, 1.2, 12]} position={[0, 0.5, 1]} size={1.6} speed={0.35} color="#ffd798" opacity={0.6} />

      <CatCompanion valleyControlled anchor={[0, 0, 5]} size={0.9} />
      <OrbitControls
        ref={controls}
        target={[0, 1.35, -2]}
        enablePan={false}
        minDistance={5}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.1}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}
