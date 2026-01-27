import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * MannequinViewer (Minimal Premium) — Framing definitivo M/F
 *
 * Problema observado:
 * - Con FIT por altura únicamente, Female queda perfecto pero Male (más ancho) puede quedar “fuera de cuadro”
 *   en los laterales / arriba por tener un bounding box más grande en X.
 *
 * Solución:
 * - Mantener el enfoque “producto” (encuadre estable) pero considerar también el ANCHO:
 *   - Calculamos distancia requerida para altura (distV)
 *   - Calculamos distancia requerida para ancho (distW) usando un aspect CLAMPEADO (para evitar jitter por scrollbars)
 *   - Tomamos la mayor (max) y aplicamos FIT_MARGIN
 *
 * CONTROL ÚNICO DE TAMAÑO:
 * - FIT_MARGIN (más grande = mannequin más chico)
 */
const MannequinScene: React.FC<{ url: string }> = ({ url }) => {
  const root = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const gltf = useGLTF(url) as any;
  const { camera, size, invalidate } = useThree();

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

      // 1) Normalizar modelo
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
      root.current.position.y -= boxAfterScale.min.y; // feet on y=0

      // 2) Bounds finales (post-normalización)
      const box = new THREE.Box3().setFromObject(root.current);
      const sizeVec = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(sizeVec);
      box.getCenter(center);

      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = 35;

      const vFov = (persp.fov * Math.PI) / 180;

      // Distancia requerida por altura
      const halfH = Math.max(0.0001, sizeVec.y / 2);
      const distV = halfH / Math.tan(vFov / 2);

      // Distancia requerida por ancho (con aspect CLAMPEADO para estabilidad)
      const rawAspect = size.width / Math.max(1, size.height);
      const aspect = THREE.MathUtils.clamp(rawAspect, 1.15, 1.85);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

      const halfW = Math.max(0.0001, sizeVec.x / 2);
      const distW = halfW / Math.tan(hFov / 2);

      // 🔧 Tamaño final (más grande = más chico)
      const FIT_MARGIN = 9;

      let dist = Math.max(distV, distW) * FIT_MARGIN;

      // Clamp para evitar rarezas en el 1er frame / tamaños raros del modal
      dist = THREE.MathUtils.clamp(dist, 12, 45);

      // LookAt/cámara: leve foco torso, estable
      const lookAt = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.04, center.z);
      const camPos = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.06, center.z + dist);

      persp.position.copy(camPos);
      persp.near = Math.max(0.1, dist / 500);
      persp.far = Math.max(220, dist * 30);
      persp.lookAt(lookAt);
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }

      invalidate();
    };

    // 2 RAF para asegurar size estable en modal/iframe
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => normalizeAndFrame());
      (normalizeAndFrame as any)._raf2 = raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
      const raf2 = (normalizeAndFrame as any)?._raf2;
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [gltf, premiumMaterial, camera, size.width, size.height, invalidate]);

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
