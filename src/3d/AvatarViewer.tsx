// src/3d/AvatarViewer.tsx
import React, { Suspense, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type AvatarViewerProps = {
  avatarUrl?: string;
};

const AvatarInner: React.FC<{ avatarUrl: string }> = ({ avatarUrl }) => {
  const group = useRef<THREE.Group>(null!);
  const gltf = useGLTF(avatarUrl) as any;

  useEffect(() => {
    if (!group.current) return;
    const box = new THREE.Box3().setFromObject(group.current);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Centrar en origen
    group.current.position.sub(center);

    // Escalar a altura objetivo
    const targetHeight = 1.7;
    const currentHeight = size.y || 1;
    const scale = targetHeight / currentHeight;
    group.current.scale.setScalar(scale);

    // Ajustar vertical para que el personaje quede más al centro del frame
    // (antes -0.9, ahora mucho más arriba)
    group.current.position.y -= 0.25;
  }, [gltf]);

  return <primitive ref={group} object={gltf.scene} />;
};

const Ground: React.FC = () => {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -1.1, 0]} receiveShadow>
      <circleGeometry args={[3, 48]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
  );
};

const Lights: React.FC = () => {
  return (
    <>
      <hemisphereLight intensity={0.7} groundColor={"#d1d5db"} />
      <directionalLight
        intensity={0.9}
        position={[2, 4, 3]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight intensity={0.4} position={[-3, 2, -2]} />
    </>
  );
};

export const AvatarViewer: React.FC<AvatarViewerProps> = ({ avatarUrl }) => {
  const hasAvatar = !!avatarUrl;

  return (
    <Canvas
      camera={{ position: [0, 1.6, 2.6], fov: 38 }}
      shadows
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f9fafb"]} />
      <Lights />
      <Ground />
      <Suspense
        fallback={
          <Html center style={{ fontSize: 12, color: "#6b7280" }}>
            Cargando avatar 3D...
          </Html>
        }
      >
        {hasAvatar ? (
          <AvatarInner avatarUrl={avatarUrl!} />
        ) : (
          <Html center style={{ fontSize: 12, color: "#6b7280" }}>
            Creá tu avatar o pegá la URL .glb
          </Html>
        )}
      </Suspense>
      <OrbitControls
        enablePan={false}
        minDistance={1.8}
        maxDistance={3.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
};

// Precarga opcional de un modelo demo
useGLTF.preload(
  "https://models.readyplayer.me/64f12a1c2a0fce77e9d492fe.glb"
);
