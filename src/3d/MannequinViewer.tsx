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
 * ✅ Objetivo real (producto):
 * - Mannequin completo SIEMPRE (cabeza + pies) en una sola vista.
 * - Encadre estable al abrir y al alternar M/F.
 *
 * Nota importante:
 * - En modales/iframes, los cálculos que intentan “fit” horizontal por aspect suelen romper el encuadre.
 * - Este viewer usa SOLO el fit vertical (altura) + margen fijo (producto-like).
 */
const MannequinScene: React.FC<{ url: string }> = ({ url }) => {
  const root = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const gltf = useGLTF(url) as any;
  const { camera, size, invalidate } = useThree();

  const premiumMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#bfc5cc"),
      roughness: 0.95,
      metalness: 0.0,
    });
  }, []);

  useEffect(() => {
    if (!root.current) return;

    // Rebuild scene under root (avoid mutating cached gltf.scene)
    root.current.clear();

    // 🔧 CRÍTICO: resetear transform para medir bounds "limpio"
    root.current.position.set(0, 0, 0);
    root.current.rotation.set(0, 0, 0);
    root.current.scale.set(1, 1, 1);

    const sceneClone: THREE.Object3D = gltf.scene.clone(true);

    // Force matte material everywhere
    sceneClone.traverse((obj: any) => {
      if (obj?.isMesh) {
        obj.material = premiumMaterial;
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.geometry?.computeVertexNormals?.();
      }
    });

    root.current.add(sceneClone);

    const normalizeAndFrame = () => {
      if (!root.current) return;

      // ---------------------------
      // 1) NORMALIZE MODEL
      // ---------------------------
      const rawBox = new THREE.Box3().setFromObject(root.current);
      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      rawBox.getSize(rawSize);
      rawBox.getCenter(rawCenter);

      // Center on origin (world)
      root.current.position.sub(rawCenter);

      // Normalize height to a stable target (between M/F)
      const TARGET_HEIGHT = 1.75; // visual target
      const scale = TARGET_HEIGHT / (rawSize.y || 1);
      root.current.scale.setScalar(scale);

      // Put feet on ground (y=0)
      const boxAfterScale = new THREE.Box3().setFromObject(root.current);
      root.current.position.y -= boxAfterScale.min.y;

      // ---------------------------
      // 2) STABLE CAMERA FRAME (VERTICAL ONLY)
      // ---------------------------
      const box = new THREE.Box3().setFromObject(root.current);
      const sizeVec = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(sizeVec);
      box.getCenter(center);

      const persp = camera as THREE.PerspectiveCamera;

      // Keep a consistent FOV
      if (!Number.isFinite(persp.fov) || persp.fov <= 0) persp.fov = 35;

      const vFov = (persp.fov * Math.PI) / 180;

      // Fit by height only (stable in modals/iframes)
      const halfH = Math.max(0.0001, sizeVec.y / 2);

      // Margin: si lo querés un poco más grande/pequeño, tocás SOLO esto
      const FIT_MARGIN = 1.25;

      // Distance needed to fit vertical height
      let dist = (halfH / Math.tan(vFov / 2)) * FIT_MARGIN;

      // Clamp to avoid "super zoom" if bounds are weird for 1 frame
      dist = THREE.MathUtils.clamp(dist, 2.0, 8.0);

      // Look slightly above center (upper torso focus) while keeping full body visible
      const lookAt = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.06, center.z);
      const camPos = new THREE.Vector3(center.x, center.y + sizeVec.y * 0.10, center.z + dist);

      persp.position.copy(camPos);
      persp.near = Math.max(0.01, dist / 200);
      persp.far = Math.max(50, dist * 15);
      persp.lookAt(lookAt);
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }

      invalidate();
    };

    // Esperar frames para que el canvas tenga size estable y el clone esté montado
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
    <Canvas camera={{ position: [0, 1.5, 3.0], fov: 35 }} style={{ width: "100%", height: "100%" }}>
      <color attach="background" args={["#f9fafb"]} />

      <hemisphereLight intensity={0.95} groundColor="#d1d5db" />
      <directionalLight position={[2, 4, 3]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      <MannequinScene url={url} />
    </Canvas>
  );
};

export default MannequinViewer;
