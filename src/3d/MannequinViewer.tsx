import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * Carga el mannequin (M/F) desde /public/models y lo deja en estilo "Minimal Premium":
 * - material gris mate uniforme
 * - centrado en el origen
 * - pies apoyados en y=0
 * - cámara auto-encuadrada para que se vea completo sin scroll
 */
const MannequinScene: React.FC<{ url: string }> = ({ url }) => {
  const root = useRef<THREE.Group>(null);
  const gltf = useGLTF(url) as any;
  const { camera, invalidate } = useThree();

  const premiumMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#bfc5cc"),
      roughness: 0.95,
      metalness: 0.0,
    });
  }, []);

  useEffect(() => {
    if (!root.current) return;

    // Clonar escena (evita mutaciones de caché de useGLTF)
    root.current.clear();
    const sceneClone: THREE.Object3D = gltf.scene.clone(true);

    // Forzar material gris mate en todo el modelo (sin texturas)
    sceneClone.traverse((obj: any) => {
      if (obj && obj.isMesh) {
        obj.material = premiumMaterial;
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.geometry) obj.geometry.computeVertexNormals?.();
      }
    });

    root.current.add(sceneClone);

    // Bounds del modelo
    const box = new THREE.Box3().setFromObject(root.current);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Centrar
    root.current.position.sub(center);

    // Escalar a altura objetivo
    const TARGET_HEIGHT = 1.75; // metros aprox
    const scale = TARGET_HEIGHT / (size.y || 1);
    root.current.scale.setScalar(scale);

    // Recalcular bounds post-scale y apoyar en piso (y=0)
    const box2 = new THREE.Box3().setFromObject(root.current);
    const minY = box2.min.y;
    root.current.position.y -= minY;

    // Auto-encuadre de cámara (para ver el cuerpo entero)
    const box3 = new THREE.Box3().setFromObject(root.current);
    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);

    const radius = Math.max(0.0001, sphere.radius);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 35;
    const fovRad = (fov * Math.PI) / 180;

    // Distancia necesaria para encuadrar (factor >1 da margen)
    const fitOffset = 1.45;
    const dist = (radius / Math.tan(fovRad / 2)) * fitOffset;

    // Posicionar cámara en frente, un poco arriba para composición agradable
    camera.position.set(0, sphere.center.y + radius * 0.25, dist);
    camera.lookAt(sphere.center.x, sphere.center.y + radius * 0.15, sphere.center.z);
    camera.near = Math.max(0.01, dist / 100);
    camera.far = Math.max(50, dist * 10);
    camera.updateProjectionMatrix();

    invalidate();
  }, [gltf, premiumMaterial, camera, invalidate]);

  return <group ref={root as any} />;
};

export const MannequinViewer: React.FC<Props> = ({ variant = "male" }) => {
  const url = variant === "female" ? "/models/mannequin_f.glb" : "/models/mannequin_m.glb";

  return (
    <Canvas
      camera={{ position: [0, 1.5, 2.6], fov: 35 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f9fafb"]} />

      <hemisphereLight intensity={0.95} groundColor="#d1d5db" />
      <directionalLight position={[2, 4, 3]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      <MannequinScene url={url} />

      {/* Controles bloqueados (solo para setear target internamente si luego lo habilitamos) */}
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
    </Canvas>
  );
};

export default MannequinViewer;
