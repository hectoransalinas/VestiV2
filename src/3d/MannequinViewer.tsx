// src/3d/MannequinViewer.tsx
import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

type MannequinVariant = "male" | "female";

type MannequinViewerProps = {
  variant?: MannequinVariant;
};

const Mannequin: React.FC<{ variant: MannequinVariant }> = ({ variant }) => {
  const torsoHeight = variant === "female" ? 0.55 : 0.6;
  const shoulderWidth = variant === "female" ? 0.38 : 0.42;
  const hipWidth = variant === "female" ? 0.4 : 0.38;

  return (
    <group position={[0, -0.9, 0]}>
      <mesh position={[0, torsoHeight + 0.45, 0]}>
        <sphereGeometry args={[0.14, 32, 32]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>

      <mesh position={[0, torsoHeight, 0]}>
        <capsuleGeometry args={[0.18, 0.45, 12, 24]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      <mesh position={[0, torsoHeight + 0.15, 0]} scale={[shoulderWidth, 0.08, 0.22]}>
        <boxGeometry />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      <mesh position={[0, torsoHeight - 0.25, 0]} scale={[hipWidth, 0.08, 0.22]}>
        <boxGeometry />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      <mesh position={[-0.08, torsoHeight - 0.75, 0]}>
        <capsuleGeometry args={[0.08, 0.6, 8, 16]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0.08, torsoHeight - 0.75, 0]}>
        <capsuleGeometry args={[0.08, 0.6, 8, 16]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      <mesh position={[-0.08, torsoHeight - 1.15, 0.08]}>
        <boxGeometry args={[0.12, 0.05, 0.28]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      <mesh position={[0.08, torsoHeight - 1.15, 0.08]}>
        <boxGeometry args={[0.12, 0.05, 0.28]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
    </group>
  );
};

export const MannequinViewer: React.FC<MannequinViewerProps> = ({ variant = "male" }) => {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 2.6], fov: 38 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f9fafb"]} />
      <hemisphereLight intensity={0.7} groundColor={"#d1d5db"} />
      <directionalLight intensity={0.9} position={[2, 4, 3]} />
      <directionalLight intensity={0.4} position={[-3, 2, -2]} />

      <Mannequin variant={variant} />

      <OrbitControls
        enablePan={false}
        minDistance={2.2}
        maxDistance={3.0}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
};

export default MannequinViewer;
