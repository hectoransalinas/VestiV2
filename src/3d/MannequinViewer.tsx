import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type MannequinVariant = "male" | "female";

export type MannequinViewerProps = {
  variant?: MannequinVariant;
};

/**
 * Modelos internos (no externos): se sirven desde /public/models
 * - public/models/mannequin_m.glb
 * - public/models/mannequin_f.glb
 */
const MODEL_URLS: Record<MannequinVariant, string> = {
  male: "/models/mannequin_m.glb",
  female: "/models/mannequin_f.glb",
};

function normalizeToGrey(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Sombra suave (podés desactivarla si preferís)
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const mat = mesh.material as any;
    const grey = new THREE.Color("#d1d5db");

    // Reemplazamos cualquier material por uno simple, mate y premium
    const next = new THREE.MeshStandardMaterial({
      color: grey,
      roughness: 0.9,
      metalness: 0.05,
    });

    // Si el mesh tenía skinning (rig), mantenemos la flag
    (next as any).skinning = Boolean((mat as any)?.skinning);

    mesh.material = next;
  });
}

const MannequinModel: React.FC<{ variant: MannequinVariant }> = ({ variant }) => {
  const url = MODEL_URLS[variant];
  const gltf = useGLTF(url) as any;

  const groupRef = useRef<THREE.Group>(null);

  // Clonamos la escena para no mutar cache global de useGLTF
  const scene = useMemo<THREE.Object3D>(() => {
    const cloned = gltf.scene.clone(true);
    normalizeToGrey(cloned);
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Centrado y escala estable (sin depender del viewport)
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Reposiciona para que el centro quede en el origen
    scene.position.sub(center);

    // Apoya el modelo en el "piso" (Y = 0)
    const box2 = new THREE.Box3().setFromObject(scene);
    const minY = box2.min.y;
    scene.position.y -= minY;

    // Escalamos a altura objetivo ~1.75m (ajustable)
    const height = Math.max(0.0001, size.y);
    const targetHeight = 1.75;
    const scale = targetHeight / height;
    scene.scale.setScalar(scale);

    // Ubicación final dentro del canvas
    group.position.set(0, -0.02, 0);
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
};

export const MannequinViewer: React.FC<MannequinViewerProps> = ({ variant = "male" }) => {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 2.55], fov: 38 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#f9fafb"]} />

      <ambientLight intensity={0.7} />
      <directionalLight intensity={0.9} position={[2.5, 4, 3]} />
      <directionalLight intensity={0.35} position={[-3, 2, -2]} />

      <MannequinModel variant={variant} />

      {/* Cámara fija (sin pan/zoom). Si querés permitir rotación leve, enableRotate={true} */}
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
    </Canvas>
  );
};

export default MannequinViewer;

// Precarga (opcional) para evitar flash en el primer render
useGLTF.preload("/models/mannequin_m.glb");
useGLTF.preload("/models/mannequin_f.glb");
