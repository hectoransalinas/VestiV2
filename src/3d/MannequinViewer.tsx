import React, { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

const MannequinModel: React.FC<{ url: string }> = ({ url }) => {
  const group = useRef<THREE.Group>(null!);
  const gltf = useGLTF(url) as any;

  useEffect(() => {
    if (!group.current) return;

    // Compute bounds
    const box = new THREE.Box3().setFromObject(group.current);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Center model
    group.current.position.sub(center);

    // Scale to target height (meters)
    const TARGET_HEIGHT = 1.75;
    const scale = TARGET_HEIGHT / (size.y || 1);
    group.current.scale.setScalar(scale);

    // Place feet on ground (y = 0)
    const box2 = new THREE.Box3().setFromObject(group.current);
    const minY = box2.min.y;
    group.current.position.y -= minY;

    // Slight forward offset so it sits nicely in camera
    group.current.position.z = 0;
  }, [gltf]);

  return <primitive ref={group} object={gltf.scene} />;
};

export const MannequinViewer: React.FC<Props> = ({ variant = "male" }) => {
  const url = variant === "female" ? "/models/mannequin_f.glb" : "/models/mannequin_m.glb";

  return (
    <Canvas
      camera={{ position: [0, 1.5, 2.6], fov: 35 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f9fafb"]} />

      <hemisphereLight intensity={0.9} groundColor="#d1d5db" />
      <directionalLight position={[2, 4, 3]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <MannequinModel url={url} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
      />
    </Canvas>
  );
};

export default MannequinViewer;
