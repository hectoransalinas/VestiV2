import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * MannequinViewer — Framing M/F consistente (CALIBRADO POR VARIANTE)
 *
 * Problema real (según tus capturas):
 * - Si bajamos M, F baja todavía más.
 * - Esto pasa porque ambos modelos NO tienen la misma proporción/volumen en el bounding box (cabeza/hombros),
 *   y una sola regla de composición vertical afecta distinto a cada uno.
 *
 * Solución práctica (y estable):
 * ✅ Mantenemos:
 *   - normalización de altura (TARGET_HEIGHT)
 *   - pies en y=0
 *   - distancia por FIT (altura/ancho) + FIT_MARGIN (tamaño ideal)
 *
 * ✅ Cambiamos SOLO la composición vertical con un "calibrado por variante":
 *   - Female: composición que te queda “perfecta” (no la tocamos con ajustes para Male)
 *   - Male: composición con MÁS headroom (modelo un poco más abajo)
 *
 * Esto cierra el Paso 1 y nos deja una base estable para anclar overlays.
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

    const isMale = url.includes("mannequin_m");

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

      // 1) Normalizar modelo (altura consistente + pies en y=0)
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

      // 2) Bounds finales
      const box = new THREE.Box3().setFromObject(root.current);
      const sizeVec = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(sizeVec);
      box.getCenter(center);

      const minY = box.min.y;
      const maxY = box.max.y;
      const height = Math.max(0.0001, maxY - minY);

      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = 35;

      const vFov = (persp.fov * Math.PI) / 180;

      // Distancia requerida por altura
      const halfH = Math.max(0.0001, sizeVec.y / 2);
      const distV = halfH / Math.tan(vFov / 2);

      // Distancia requerida por ancho (aspect CLAMPEADO para estabilidad en modal/scroll)
      const rawAspect = size.width / Math.max(1, size.height);
      const aspect = THREE.MathUtils.clamp(rawAspect, 1.15, 1.85);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

      const halfW = Math.max(0.0001, sizeVec.x / 2);
      const distW = halfW / Math.tan(hFov / 2);

      // Tamaño final (más grande = mannequin más chico)
      const FIT_MARGIN = 6.5; // AGRESIVO: más grande en pantalla

      let dist = Math.max(distV, distW) * FIT_MARGIN;
      dist = THREE.MathUtils.clamp(dist, 12, 45);

      /**
       * ✅ CALIBRADO POR VARIANTE (LA CLAVE)
       * - Female: mantener más centrado (como tu captura “perfecta”)
       * - Male: más abajo + más headroom (evitar cabeza tocando)
       *
       * Nota: estos coeficientes NO cambian el tamaño (eso lo controla FIT_MARGIN),
       * solo la composición vertical.
       */
      const femaleLookAtCoef = 0.60;
      const femaleCamCoef = 0.42;

      const maleLookAtCoef = 0.70;
      const maleCamCoef = 0.24; // AGRESIVO: baja M en pantalla + más headroom

      const lookAtY = minY + height * (isMale ? maleLookAtCoef : femaleLookAtCoef);
      const camY = minY + height * (isMale ? maleCamCoef : femaleCamCoef);

      const lookAt = new THREE.Vector3(center.x, lookAtY, center.z);
      const camPos = new THREE.Vector3(center.x, camY, center.z + dist);

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

    // 2 RAF para asegurar size estable en modal/iframe (scrollbars)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => normalizeAndFrame());
      (normalizeAndFrame as any)._raf2 = raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
      const raf2 = (normalizeAndFrame as any)?._raf2;
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [gltf, premiumMaterial, camera, size.width, size.height, invalidate, url]);

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
