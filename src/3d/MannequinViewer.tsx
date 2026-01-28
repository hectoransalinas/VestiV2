import React, { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * MannequinViewer (stable / RPM-style)
 * Objetivo: encuadre estable (sin "saltos") y maniquí bien centrado.
 *
 * Estrategia:
 * - NO auto-fit de cámara por resize (eso viene generando loops/saltos).
 * - Normalizamos el modelo a una altura objetivo (targetHeight) y lo centramos en X/Z.
 * - Piso real: minY -> 0 (pies al piso) usando huesos (robusto en SkinnedMesh).
 * - Cámara fija estilo AvatarViewer (Ready Player Me), UX estable y predecible.
 *
 * Reglas respetadas:
 * - No toca motor.
 * - Viewer solo 3D.
 */

type Sex = "m" | "f";

const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

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
      // Evita que cullee partes finas (puede afectar bounds percibidos)
      mesh.frustumCulled = false;
    }
  });
}

function percentileSorted(arr: number[], p: number) {
  // arr debe venir ordenado ascendente
  if (arr.length === 0) return 0;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)));
  return arr[idx];
}

function computeTrimmedBoundsFromBones(root: THREE.Object3D) {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  const v = new THREE.Vector3();
  root.traverse((o) => {
    if ((o as any).isBone) {
      (o as THREE.Object3D).getWorldPosition(v);
      if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
        xs.push(v.x);
        ys.push(v.y);
        zs.push(v.z);
      }
    }
  });

  if (ys.length < 8) return null; // muy pocos bones => fallback

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);

  // recortamos outliers (IK/targets/manos exageradas)
  const lo = 0.06;
  const hi = 0.94;

  const minX = percentileSorted(xs, lo);
  const maxX = percentileSorted(xs, hi);
  const minY = percentileSorted(ys, lo);
  const maxY = percentileSorted(ys, hi);
  const minZ = percentileSorted(zs, lo);
  const maxZ = percentileSorted(zs, hi);

  const height = Math.max(0.5, maxY - minY);
  const width = Math.max(0.2, maxX - minX);
  const depth = Math.max(0.2, maxZ - minZ);

  return { minX, maxX, minY, maxY, minZ, maxZ, height, width, depth };
}

function computeBoundsFromMeshes(root: THREE.Object3D) {
  // Fallback: Box3 pero SOLO considerando meshes (evita helpers gigantes)
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();
  let has = false;

  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as any;
    if (mesh && mesh.isMesh) {
      // Preferimos boundingBox de geometría si existe
      const geo = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geo) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        if (geo.boundingBox) {
          tempBox.copy(geo.boundingBox);
          tempBox.applyMatrix4(mesh.matrixWorld);
          box.union(tempBox);
          has = true;
          return;
        }
      }
      // Último recurso
      tempBox.setFromObject(mesh);
      box.union(tempBox);
      has = true;
    }
  });

  if (!has) return null;

  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
    height: Math.max(0.5, size.y),
    width: Math.max(0.2, size.x),
    depth: Math.max(0.2, size.z),
  };
}

function normalizeMannequin(root: THREE.Object3D, sex: Sex) {
  // 1) bounds robustos
  const b = computeTrimmedBoundsFromBones(root) ?? computeBoundsFromMeshes(root);
  if (!b) return;

  // 2) escala a altura objetivo (misma para M/F => consistencia)
  const targetHeight = 1.7; // "altura humana" de referencia (no identitaria)
  const scale = targetHeight / b.height;

  // 3) centro X/Z + pies al piso (minY -> 0), en espacio mundo
  const centerX = (b.minX + b.maxX) / 2;
  const centerZ = (b.minZ + b.maxZ) / 2;
  const feetY = b.minY;

  // Reseteo para evitar acumulación
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);

  // Aplicamos escala y centrado (convertimos world bounds -> local mediante escala)
  root.scale.setScalar(scale);
  root.position.x = -centerX * scale;
  root.position.z = -centerZ * scale;
  root.position.y = -feetY * scale;

  // 4) Micro ajuste vertical (igual que el AvatarViewer) para quedar más "al centro" del frame
  // (sin offsets mágicos globales: es un bias de encuadre, no de producto)
  const bias = sex === "m" ? 0.10 : 0.10; // bajar un poco el cuerpo (sube la cámara relativa)
  root.position.y -= bias;

  root.updateMatrixWorld(true);
}

function MannequinModel({ sex, rootRef }: { sex: Sex; rootRef: React.RefObject<THREE.Group> }) {
  const { scene } = useGLTF(MODEL_PATHS[sex]);

  const cloned = useMemo(() => scene.clone(true) as THREE.Group, [scene]);

  useEffect(() => {
    forceMaterial(cloned);
    // Importante: normalizar después de forzar material y con matrices listas
    cloned.updateMatrixWorld(true);
    normalizeMannequin(cloned, sex);
  }, [cloned, sex]);

  return <primitive ref={rootRef as any} object={cloned} />;
}

export type MannequinVariant = "M" | "F" | Sex | "male" | "female";

export interface MannequinViewerProps {
  variant?: MannequinVariant;
  sex?: Sex;
  showControls?: boolean;
}

export function MannequinViewer({ variant, sex: sexProp = "m", showControls = false }: MannequinViewerProps) {
  const sex: Sex = (() => {
    if (variant === "F" || variant === "f" || (variant as any) === "female") return "f";
    if (variant === "M" || variant === "m" || (variant as any) === "male") return "m";
    return sexProp;
  })();

  const rootRef = useRef<THREE.Group>(null);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        // Cámara fija (estable) tipo RPM/AvatarViewer
        camera={{ position: [0, 1.35, 3.15], fov: 38, near: 0.05, far: 200 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={0.75} />

        <group>
          <MannequinModel sex={sex} rootRef={rootRef} />
        </group>

        {showControls ? (
          <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
        ) : null}
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);

export default MannequinViewer;
