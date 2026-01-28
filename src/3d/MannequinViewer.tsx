import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

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
    if ((mesh as any)?.isMesh) {
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

function computeBoneBounds(root: THREE.Object3D) {
  const bones = collectBones(root);
  if (!bones.length) return null;

  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;

  for (const b of bones) {
    b.getWorldPosition(v);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
    maxR = Math.max(maxR, Math.hypot(v.x, v.z));
  }
  return { minY, maxY, maxR };
}

/**
 * AutoFitCamera (estable)
 * - Pone pies al piso (set absoluto, no acumulativo)
 * - Encadre por altura (bones) + ancho clamped
 * - Bajada fuerte de encuadre (screenDown) para que NO quede arriba
 */
function AutoFitCamera({
  subjectRef,
  sex,
}: {
  subjectRef: React.RefObject<THREE.Object3D>;
  sex: Sex;
}) {
  const { camera, size } = useThree();
  const baseYMap = useRef<Map<string, number>>(new Map());
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

    // Guardamos el Y base por UUID (para set absoluto)
    if (!baseYMap.current.has(subject.uuid)) {
      baseYMap.current.set(subject.uuid, subject.position.y);
    }

    const cam = camera as THREE.PerspectiveCamera;

    // --- 1) Pies al piso (set absoluto) ---
    const b0 = computeBoneBounds(subject);
    if (b0) {
      const baseY = baseYMap.current.get(subject.uuid) ?? 0;
      subject.position.y = baseY - b0.minY; // minY => 0
      subject.updateMatrixWorld(true);
    }

    // --- 2) Bounds para encuadre ---
    let minY: number, maxY: number, maxR: number;

    const b1 = computeBoneBounds(subject);
    if (b1) {
      minY = b1.minY;
      maxY = b1.maxY;
      maxR = b1.maxR;
    } else {
      const box = new THREE.Box3().setFromObject(subject);
      const sz = new THREE.Vector3();
      const c = new THREE.Vector3();
      box.getSize(sz);
      box.getCenter(c);
      minY = c.y - sz.y / 2;
      maxY = c.y + sz.y / 2;
      maxR = Math.max(sz.x, sz.z) / 2;
    }

    const height = Math.max(0.6, maxY - minY);
    const centerY = minY + height / 2;

    // Clamp del radio horizontal para evitar "manos/IK inflan ancho" => modelo mini
    const maxRClamped = THREE.MathUtils.clamp(maxR, 0.22, height * 0.26);

    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const margin = sex === "m" ? 1.10 : 1.08;
    const distForHeight = (height / 2) / Math.tan(vFov / 2);
    const distForWidth = (maxRClamped * 1.10) / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth) * margin;

    // --- 3) Bajada fuerte (lo que pedís) ---
    // Si el modelo queda arriba, esto lo "baja" en pantalla moviendo target y cámara hacia abajo.
    const screenDown = height * 0.32;

    const target = new THREE.Vector3(0, centerY - screenDown, 0);
    const pos = new THREE.Vector3(0, centerY - screenDown + height * 0.06, dist);

    const key = `${sex}|${size.width}x${size.height}|${height.toFixed(3)}|${maxRClamped.toFixed(
      3
    )}|${centerY.toFixed(3)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    cam.position.copy(pos);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, sex, subjectRef]);

  return null;
}

function MannequinModel({
  sex,
  rootRef,
}: {
  sex: Sex;
  rootRef: React.RefObject<THREE.Object3D>;
}) {
  const { scene } = useGLTF(MODEL_PATHS[sex]);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    forceMaterial(cloned);
  }, [cloned]);

  return <primitive ref={rootRef as any} object={cloned} />;
}

export type MannequinVariant = "M" | "F" | Sex | "male" | "female";

export interface MannequinViewerProps {
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
        camera={{ fov: 34, position: [0, 1.2, 4] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={0.75} />

        <group>
          <MannequinModel sex={sex} rootRef={rootRef} />
        </group>

        <AutoFitCamera subjectRef={rootRef} sex={sex} />

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
