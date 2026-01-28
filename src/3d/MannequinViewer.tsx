import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Variant = "male" | "female";

type Props = {
  variant?: Variant;
};

/**
 * MannequinViewer — Anchor por HUESOS (Plan A definitivo)
 *
 * Por qué esto sí resuelve:
 * - Con bounding-box/center.y M y F nunca van a quedar “centrados igual” porque sus proporciones difieren.
 * - Estos GLB son rigged: tienen bones. Usamos bones para definir 2 anchors:
 *   - topAnchor: cabeza (Head/Neck)
 *   - bottomAnchor: pies (Foot/Ankle/Toe)
 * - Centramos el encuadre usando el midpoint entre head y feet, y calculamos la distancia para que entren.
 *
 * Resultado:
 * ✅ M y F centrados en el contenedor
 * ✅ Tamaño estable y sin crop (sin “solo piernas”)
 * ✅ Base real para overlays por zonas
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

  const nameMatchers = useMemo(
    () => ({
      head: [
        /(^|\b)(head)(\b|$)/i,
        /(mixamorig:)?head/i,
        /(^|\b)(neck)(\b|$)/i,
        /(mixamorig:)?neck/i,
      ],
      feet: [
        /(foot|ankle|toe)/i,
        /(mixamorig:)?leftfoot/i,
        /(mixamorig:)?rightfoot/i,
        /foot_l/i,
        /foot_r/i,
        /ankle_l/i,
        /ankle_r/i,
        /toe_l/i,
        /toe_r/i,
      ],
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

    const pickBone = (regexes: RegExp[]): THREE.Bone | null => {
      let best: THREE.Bone | null = null;

      root.current?.traverse((obj: any) => {
        if (!obj?.isBone) return;
        const n = String(obj.name || "");
        if (regexes.some((r) => r.test(n))) {
          // Preferimos el bone más alto (para head) o más bajo (para feet) según regexes.
          if (!best) {
            best = obj as THREE.Bone;
          } else {
            const a = new THREE.Vector3();
            const b = new THREE.Vector3();
            (best as any).getWorldPosition(a);
            (obj as any).getWorldPosition(b);
            // Heurística: si estamos buscando head, nos quedamos con el más alto
            if (regexes === nameMatchers.head) {
              if (b.y > a.y) best = obj as THREE.Bone;
            } else {
              // feet: quedarnos con el más bajo
              if (b.y < a.y) best = obj as THREE.Bone;
            }
          }
        }
      });

      return best;
    };

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

      // 4) Feet on ground via bounds (robust even if feet bones are weird)
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

      // 6) Bone anchors (fallback to bounds if not found)
      const headBone = pickBone(nameMatchers.head);
      const feetBone = pickBone(nameMatchers.feet);

      const headPos = new THREE.Vector3(center.x, maxY, center.z);
      const feetPos = new THREE.Vector3(center.x, minY, center.z);

      if (headBone) headBone.getWorldPosition(headPos);
      if (feetBone) feetBone.getWorldPosition(feetPos);

      // Si feetBone no es el más bajo real, clamp a minY para no perder pies
      feetPos.y = Math.min(feetPos.y, minY);

      const span = Math.max(0.0001, headPos.y - feetPos.y);
      const midY = feetPos.y + span * 0.5;

      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = 35;

      const vFov = (persp.fov * Math.PI) / 180;

      // Aspect clamped (importante con modal ancho)
      const rawAspect = size.width / Math.max(1, size.height);
      const aspect = THREE.MathUtils.clamp(rawAspect, 1.2, 1.85);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

      // Distancia requerida para que entre el cuerpo (por anchors), y también por ancho
      const halfSpan = span / 2;
      const distV = halfSpan / Math.tan(vFov / 2);

      const halfW = Math.max(0.0001, sizeVec.x / 2);
      const distH = halfW / Math.tan(hFov / 2);

      // 🔥 Tamaño: un knob seguro
      // Más grande = menor offset (más cerca). No bajar demasiado para evitar “solo piernas”.
      const FIT_OFFSET = 1.26;

      let dist = Math.max(distV, distH) * FIT_OFFSET;
      dist = THREE.MathUtils.clamp(dist, 10, 42);

      // ✅ Centramos en el contenedor: lookAt al midpoint real (bones)
      const lookAt = new THREE.Vector3(center.x, midY, center.z);
      const camPos = new THREE.Vector3(center.x, midY, center.z + dist);

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
  }, [gltf, premiumMaterial, camera, size.width, size.height, invalidate, url, nameMatchers]);

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
