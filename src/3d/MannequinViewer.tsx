import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * MannequinViewer — Stable Fit + Centered Composition (NO crop)
 *
 * Lo que te pasó en la captura (quedó “gigante”):
 * - Bajamos el FIT_OFFSET (distancia) demasiado -> cámara MUY cerca => sólo piernas/pies.
 * - Además, al mirar exactamente al centro del bounding box, el encuadre pierde “headroom”
 *   y se siente alto/extraño según la proporción del modelo.
 *
 * Fix:
 * 1) Fit estable: distancia se calcula para que ENTRE el cuerpo completo (sin crop).
 * 2) Control de “tamaño” en pantalla: un solo knob (FIT_OFFSET) con valores seguros.
 * 3) Composición centrada REAL: target entre piso y cabeza, con un leve sesgo configurable,
 *    sin depender de center.y (que cambia distinto entre M/F).
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

    // Reset transforms (critical for clean bounds when toggling M/F)
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

    const fitAndFrame = () => {
      if (!root.current) return;

      // 1) Bounds pre-transform
      const rawBox = new THREE.Box3().setFromObject(root.current);
      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      rawBox.getSize(rawSize);
      rawBox.getCenter(rawCenter);

      // 2) Center at origin
      root.current.position.sub(rawCenter);

      // 3) Normalize height (stable between M/F)
      const TARGET_HEIGHT = 1.75;
      const scale = TARGET_HEIGHT / (rawSize.y || 1);
      root.current.scale.setScalar(scale);

      // 4) Feet on ground
      const boxAfterScale = new THREE.Box3().setFromObject(root.current);
      root.current.position.y -= boxAfterScale.min.y;

      // 5) Final bounds
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

      // Aspect clamped (muy importante con el contenedor nuevo y modal ancho)
      const rawAspect = size.width / Math.max(1, size.height);
      const aspect = THREE.MathUtils.clamp(rawAspect, 1.2, 1.85);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

      const halfH = Math.max(0.0001, sizeVec.y / 2);
      const halfW = Math.max(0.0001, sizeVec.x / 2);

      const distV = halfH / Math.tan(vFov / 2);
      const distH = halfW / Math.tan(hFov / 2);

      // ✅ Tamaño en pantalla: un solo knob seguro.
      // Más grande => más lejos => maniquí más chico.
      // Más chico => más cerca => maniquí más grande.
      //
      // Tu pedido era “bajar a 5.5”, pero en la práctica nos dejó demasiado cerca (gigante).
      // Acá lo dejamos AGRESIVO pero seguro: 1.22 (más grande que 1.32, pero sin crop).
      const FIT_OFFSET = 1.22;

      let dist = Math.max(distV, distH) * FIT_OFFSET;
      dist = THREE.MathUtils.clamp(dist, 10, 40);

      // ✅ Composición centrada en el contenedor (sin quedar alto)
      // Centramos el cuerpo completo: 50% del alto desde el piso.
      // Y ajustamos M vs F con un micro sesgo (solo vertical) para que queden parecidos.
      const isMale = url.includes("mannequin_m");
      const centerCoef = 0.50;

      // micro-ajuste (NO gigante): M suele quedar “alto” por proporciones -> bajamos un poco su target
      const micro = isMale ? -0.04 : 0.0;

      const lookAtY = minY + height * (centerCoef + micro);
      const camY = lookAtY;

      const lookAt = new THREE.Vector3(center.x, lookAtY, center.z);
      const camPos = new THREE.Vector3(center.x, camY, center.z + dist);

      persp.position.copy(camPos);
      persp.near = Math.max(0.05, dist / 200);
      persp.far = Math.max(220, dist * 30);
      persp.lookAt(lookAt);
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }

      invalidate();
    };

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => fitAndFrame());
      (fitAndFrame as any)._raf2 = raf2;
    });

    return () => {
      cancelAnimationFrame(raf1);
      const raf2 = (fitAndFrame as any)?._raf2;
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
