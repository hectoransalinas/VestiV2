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
 * - Loads /public/models/mannequin_{m|f}.glb
 * - Forces matte gray material
 * - Centers model at origin, feet on y=0
 * - Auto-frames camera to ALWAYS show full body (no scroll / no crop)
 *
 * Fix importante:
 * - Resetea transform del root (position/scale/rotation) ANTES de medir bounds.
 *   Sin esto, al alternar M/F o al primer render, el scale previo contamina Box3 y rompe el encuadre.
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

    // 🔧 CRÍTICO: resetear transform para que Box3 mida "limpio"
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

    const fitAndFrame = () => {
      if (!root.current) return;

      // 1) Bounds (pre-transform)
      const box = new THREE.Box3().setFromObject(root.current);
      const sizeVec = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(sizeVec);
      box.getCenter(center);

      // 2) Center on origin
      root.current.position.sub(center);

      // 3) Normalize height to a target (stable between M/F)
      const TARGET_HEIGHT = 1.75; // meters-ish
      const scale = TARGET_HEIGHT / (sizeVec.y || 1);
      root.current.scale.setScalar(scale);

      // 4) Put feet on ground (y=0)
      const box2 = new THREE.Box3().setFromObject(root.current);
      root.current.position.y -= box2.min.y;

      // 5) Auto-frame camera using BOX fit (más estable que sphere)
      const box3 = new THREE.Box3().setFromObject(root.current);
      const size2 = new THREE.Vector3();
      const center2 = new THREE.Vector3();
      box3.getSize(size2);
      box3.getCenter(center2);

      const persp = camera as THREE.PerspectiveCamera;
      const vFov = (persp.fov * Math.PI) / 180;
      const aspect = Math.max(0.0001, size.width / Math.max(1, size.height));
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

      // Half-sizes
      const halfH = size2.y / 2;
      const halfW = size2.x / 2;

      // Distances required to fit vertical & horizontal
      const distV = halfH / Math.tan(vFov / 2);
      const distH = halfW / Math.tan(hFov / 2);

      // Margin so it never touches edges (and compensates for overlays)
      const FIT_OFFSET = 1.32;
      const dist = Math.max(distV, distH) * FIT_OFFSET;

      // Compose: camera slightly above center, looking at upper torso
      const lookAt = new THREE.Vector3(center2.x, center2.y + size2.y * 0.12, center2.z);
      const camPos = new THREE.Vector3(center2.x, center2.y + size2.y * 0.18, center2.z + dist);

      persp.position.copy(camPos);
      persp.near = Math.max(0.01, dist / 100);
      persp.far = Math.max(50, dist * 10);
      persp.lookAt(lookAt);
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }

      invalidate();
    };

    // 🔧 Importante: esperar 1 frame para tener size estable y el clone montado
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => fitAndFrame());
      // Cleanup second RAF if unmounted early
      (fitAndFrame as any)._raf2 = raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
      const raf2 = (fitAndFrame as any)?._raf2;
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
