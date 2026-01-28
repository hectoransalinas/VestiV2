import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * MannequinViewer
 * - Carga GLB interno (male/female)
 * - Fuerza material gris mate "premium"
 * - Normaliza posición: pies al piso (minY = 0)
 * - Auto-encuadra cámara para ver CUERPO COMPLETO sin depender del bounding box del mesh
 *   (usa rango Y de TODOS los huesos / bones)
 *
 * NOTA: Esta versión está diseñada para evitar el bug clásico de "solo piernas" o "cuerpo cortado"
 *       cuando los bounds del SkinnedMesh son incorrectos o cambian entre M/F.
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
    }
  });
}

function collectBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as any).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

function computeBoneBoundsY(root: THREE.Object3D) {
  const bones = collectBones(root);
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxR = 0;

  // Si por alguna razón no hay bones, devolvemos null para fallback
  if (!bones.length) return null;

  for (const b of bones) {
    b.getWorldPosition(v);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);

    // radio horizontal aproximado usando bones (mejor que nada, súper estable entre M/F)
    const r = Math.hypot(v.x, v.z);
    maxR = Math.max(maxR, r);
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return { minY, maxY, maxR, centerX, centerZ };
}

function computeBoneBounds(root: THREE.Object3D) {
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxR = 0;

  root.traverse((o) => {
    // Usamos bones y joints (Object3D con nombre), pero evitamos meshes (que pueden tener bounds rotos)
    const isBone = (o as any).isBone || (o.type === "Bone");
    if (!isBone) return;
    o.getWorldPosition(v);
    if (!isFinite(v.y)) return;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
    const r = Math.hypot(v.x, v.z);
    if (r > maxR) maxR = r;
  });

  // Fallback: si por algún motivo no hubo bones, caemos a Box3 del objeto
  if (!isFinite(minY) || !isFinite(maxY) || maxY - minY < 0.01) {
    const box = new THREE.Box3().setFromObject(root);
    minY = box.min.y;
    maxY = box.max.y;
    minX = box.min.x;
    maxX = box.max.x;
    minZ = box.min.z;
    maxZ = box.max.z;
    maxR = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return { minY, maxY, maxR, centerX, centerZ };
}

function AutoFitCamera({ subjectRef, sex }: { subjectRef: React.RefObject<THREE.Object3D>; sex: Sex }) {
  const { camera, size } = useThree();
  const baseYRef = useRef<number | null>(null);
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!(camera as any).isPerspectiveCamera) return;
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.05;
    cam.far = 200;
    cam.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const subject = subjectRef.current;
    if (!subject) return;
    if (!(camera as any).isPerspectiveCamera) return;
    const cam = camera as THREE.PerspectiveCamera;

    subject.updateMatrixWorld(true);

    // 1) Bounds por BONES: en skinned meshes evita el bug de Box3 = "solo pies"
    const b0 = computeBoneBounds(subject);
    const height0 = Math.max(0.5, b0.maxY - b0.minY);

    // 2) Pies al piso (set absoluto, sin acumular)
    if (baseYRef.current === null) baseYRef.current = subject.position.y;
    const baseY = baseYRef.current;
    const deltaY = 0 - b0.minY;
    subject.position.y = baseY + deltaY;
    subject.updateMatrixWorld(true);

    // 3) Recalcular bounds luego de ajustar piso
    const b1 = computeBoneBounds(subject);
    const height = Math.max(0.5, b1.maxY - b1.minY);

    // 4) Auto-encuadre cámara con ancho CLAMPED (para que manos/IK no alejen la cámara)
    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    // Clamp del radio horizontal en función del alto: evita "modelo mini"
    const maxR = THREE.MathUtils.clamp(b1.maxR, height * 0.10, height * 0.28);

    const halfH = height / 2;
    const halfW = maxR; // radio ≈ half width

    const margin = 1.08; // aire leve y estable

    const distForHeight = halfH / Math.tan(vFov / 2);
    const distForWidth = halfW / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth) * margin;

    // 5) Target en el centro del cuerpo (bias chico para que entre cabeza)
    const yBias = height * 0.04;
    const target = new THREE.Vector3(b1.centerX, b1.minY + halfH + yBias, b1.centerZ);

    // Cámara frontal, leve elevación
    const pos = new THREE.Vector3(target.x, target.y + height * 0.02, dist);

    const key = `${sex}|${size.width}x${size.height}|h${height.toFixed(3)}|r${maxR.toFixed(3)}|t${target.y.toFixed(3)}|d${dist.toFixed(3)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    cam.position.copy(pos);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, sex, subjectRef]);

  return null;
}


function MannequinModel({ sex, rootRef }: { sex: Sex; rootRef: React.RefObject<THREE.Object3D> }) {
  const { scene } = useGLTF(MODEL_PATHS[sex]);

  // Clonamos para evitar compartir estado entre renders (importantísimo)
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    forceMaterial(cloned);
  }, [cloned]);

  return <primitive ref={rootRef as any} object={cloned} />;
}

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
    // Aceptamos múltiples valores por robustez (evita crash si entra "male"/"female")
    if (variant === "F" || variant === "f" || (variant as any) === "female") return "f";
    if (variant === "M" || variant === "m" || (variant as any) === "male") return "m";
    return sexProp;
  })();

const rootRef = useRef<THREE.Object3D>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [observedSize, setObservedSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = Math.round(cr.width);
        const h = Math.round(cr.height);
        setObservedSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        key={`${sex}-${observedSize.w}x${observedSize.h}`}
        style={{ width: "100%", height: "100%" }}
        camera={{ fov: 28, position: [0, 1, 4] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={0.75} />
        <group>
          <MannequinModel sex={sex} rootRef={rootRef} />
        </group>

        <AutoFitCamera subjectRef={rootRef} sex={sex} />

        {showControls ? (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableRotate={false}
            target={[0, 1, 0]}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);

export default MannequinViewer;
