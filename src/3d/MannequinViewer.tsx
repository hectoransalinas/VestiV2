import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * MannequinViewer (estable, estilo "RPM-like")
 * - Carga GLB interno (male/female)
 * - Fuerza material gris mate "premium"
 * - Centrado robusto tipo AvatarViewer:
 *    1) Box3 del objeto (mesh) -> escala a altura objetivo
 *    2) Centrar en origen (X/Z)
 *    3) Pies al piso (minY = 0)
 * - Cámara fija + lookAt fijo (sin autosaltos por bounds raros / bones)
 */

type Sex = "m" | "f";

const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

// Material "premium" gris mate
const MAT = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#8b8f97"),
  roughness: 0.85,
  metalness: 0.06,
});

function forceMaterial(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh && (mesh as any).isMesh) {
      (mesh as any).material = MAT;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // Evita cortes raros en algunos skinned meshes
      (mesh as any).frustumCulled = false;
    }
  });
}

function safeBox3(obj: THREE.Object3D): { box: THREE.Box3; size: THREE.Vector3; center: THREE.Vector3 } | null {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (!Number.isFinite(size.y) || size.y < 0.001) return null;
  return { box, size, center };
}

function normalizeMannequin(root: THREE.Object3D, targetHeight = 1.7) {
  // 1) Escala por altura
  const b1 = safeBox3(root);
  if (!b1) return;

  const currentHeight = b1.size.y || 1;
  const scale = targetHeight / currentHeight;
  root.scale.setScalar(scale);

  // 2) Centrar en origen (luego de escala)
  const b2 = safeBox3(root);
  if (!b2) return;
  root.position.sub(b2.center);

  // 3) Pies al piso (minY = 0)
  const b3 = safeBox3(root);
  if (!b3) return;
  root.position.y -= b3.box.min.y;

  // 4) Micro ajuste (baja apenas, como en AvatarViewer)
  root.position.y -= 0.05;
}

const MannequinInner: React.FC<{ sex: Sex }> = ({ sex }) => {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(MODEL_PATHS[sex]) as any;

  // Clonar para no compartir estado entre renders M/F
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (!group.current) return;

    // Limpiar children previos
    while (group.current.children.length) group.current.remove(group.current.children[0]);

    // Reset transforms por seguridad
    group.current.position.set(0, 0, 0);
    group.current.rotation.set(0, 0, 0);
    group.current.scale.set(1, 1, 1);

    forceMaterial(cloned);
    group.current.add(cloned);

    normalizeMannequin(group.current, 1.7);
  }, [cloned, sex]);

  return <group ref={group} />;
};

const FixedLookAt: React.FC<{ target: [number, number, number] }> = ({ target }) => {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, target]);

  return null;
};

export type MannequinVariant = "M" | "F" | Sex | "male" | "female";

export interface MannequinViewerProps {
  /** Prefer `variant` ("M"/"F") from the UI. `sex` kept for backwards compat. */
  variant?: MannequinVariant;
  sex?: Sex;
  showControls?: boolean;
}

export function MannequinViewer({
  variant,
  sex: sexProp = "m",
  showControls = false,
}: MannequinViewerProps) {
  const sex: Sex = (() => {
    if (variant === "F" || variant === "f" || (variant as any) === "female") return "f";
    if (variant === "M" || variant === "m" || (variant as any) === "male") return "m";
    return sexProp;
  })();

  // Cámara fija (RPM-like) basada en altura objetivo
  const targetHeight = 1.7;
  const camPos: [number, number, number] = [0, targetHeight * 0.95, targetHeight * 1.35]; // ~[0,1.6,2.3]
  const lookAt: [number, number, number] = [0, targetHeight * 0.55, 0]; // ~[0,0.94,0]

  return (
    <Canvas
      camera={{ position: camPos, fov: 38, near: 0.05, far: 50 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#f9fafb"]} />

      {/* Luz suave premium */}
      <hemisphereLight intensity={0.75} groundColor={"#d1d5db"} />
      <directionalLight intensity={0.9} position={[2.5, 4.5, 3.2]} />
      <directionalLight intensity={0.35} position={[-3, 2, -2]} />

      <Suspense
        fallback={
          <Html center style={{ fontSize: 12, color: "#6b7280" }}>
            Cargando maniquí 3D...
          </Html>
        }
      >
        <MannequinInner sex={sex} />
      </Suspense>

      <FixedLookAt target={lookAt} />

      {showControls ? (
        <OrbitControls
          enablePan={false}
          minDistance={1.6}
          maxDistance={3.5}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
          target={lookAt}
        />
      ) : null}
    </Canvas>
  );
}

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);

export default MannequinViewer;
