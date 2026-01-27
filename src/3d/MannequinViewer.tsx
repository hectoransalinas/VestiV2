import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * MannequinViewer (Minimal Premium)
 *
 * OBJETIVO CERRADO:
 * - Mannequin MUY chico dentro del modal
 * - Mucho aire arriba y abajo
 * - Base definitiva para overlays
 *
 * CONTROL ÚNICO:
 * - FIT_MARGIN (cuanto más grande, más chico el mannequin)
 */
const MannequinScene: React.FC<{ url: string }> = ({ url }) => {
  const root = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const gltf = useGLTF(url) as any;
  const { camera, invalidate } = useThree();

  const premiumMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#bfc5cc"),
        roughness: 0.95,
        metalness: 0.0,
      }),
    []
  );

  useEffect(() => {
    if (!root.current) return;

    root.current.clear();
    root.current.position.set(0, 0, 0);
    root.current.rotation.set(0, 0, 0);
    root.current.scale.set(1, 1, 1);

    const sceneClone: THREE.Object3D = gltf.scene.clone(true);

    sceneClone.traverse((obj: any) => {
      if (obj?.isMesh) {
        obj.material = premiumMaterial;
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    root.current.add(sceneClone);

    const normalizeAndFrame = () => {
      if (!root.current) return;

      // Normalización del modelo
      const rawBox = new THREE.Box3().setFromObject(root.current);
      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      rawBox.getSize(rawSize);
      rawBox.getCenter(rawCenter);

      root.current.position.sub(rawCenter);

      const TARGET_HEIGHT = 1.75;
      const scale = TARGET_HEIGHT / (rawSize.y || 1);
      root.current.scale.setScalar(scale);

      const boxAfterScale = new THREE.Box3().setFromObject(root.current);
      root.current.position.y -= boxAfterScale.min.y;

      // Cámara: fit SOLO por altura
      const box = new THREE.Box3().setFromObject(root.current);
      const sizeVec = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(sizeVec);
      box.getCenter(center);

      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = 35;

      const vFov = (persp.fov * Math.PI) / 180;
      const halfH = sizeVec.y / 2;

      /**
       * 🔧 AJUSTE DEFINITIVO (pedido explícito)
       * FIT_MARGIN = 9
       */
      const FIT_MARGIN = 9;

      let dist = (halfH / Math.tan(vFov / 2)) * FIT_MARGIN;
      dist = THREE.MathUtils.clamp(dist, 12, 40);

      const lookAt = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.04, center.z);
      const camPos = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.06, center.z + dist);

      persp.position.copy(camPos);
      persp.near = Math.max(0.1, dist / 500);
      persp.far = Math.max(200, dist * 30);
      persp.lookAt(lookAt);
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }

      invalidate();
    };

    const raf = requestAnimationFrame(() => normalizeAndFrame());
    return () => cancelAnimationFrame(raf);
  }, [gltf, premiumMaterial, camera, invalidate]);

  return (
    <>
      <group ref={root as any} />
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={false} enableRotate={false} />
    </>
  );
};

export const MannequinViewer: React.FC<Props> = ({ variant = "male" }) => {
  const url = variant === "female" ? "/models/mannequin_f.glb" : "/models/mannequin_m.glb";

  return (
    <Canvas camera={{ position: [0, 1.5, 3], fov: 35 }} style={{ width: "100%", height: "100%" }}>
      <color attach="background" args={["#f9fafb"]} />

      <hemisphereLight intensity={0.95} groundColor="#d1d5db" />
      <directionalLight position={[2, 4, 3]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      <MannequinScene url={url} />
    </Canvas>
  );
};

export default MannequinViewer;
