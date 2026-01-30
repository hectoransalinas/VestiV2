import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * MannequinViewer (STABLE / Nike-style framing)
 * - Carga GLB interno (male/female)
 * - Fuerza material gris mate "premium"
 * - Normaliza escala a altura objetivo (M/F consistentes)
 * - Pies al piso (minY = 0) + centrado X/Z
 * - Auto-encuadre estable (pero con clamps para evitar "gigante" o "solo piernas")
 */

type Sex = "m" | "f";

export type MannequinVariant = "M" | "F" | Sex | "male" | "female";

export interface MannequinViewerProps {
  /** Prefer `variant` ("M"/"F") from the UI. `sex` kept for backwards compat. */
  variant?: MannequinVariant;
  sex?: Sex;
  showControls?: boolean;
  /** Optional: expose stable anchor projection API (does NOT change camera/framing). */
  onAnchorsReady?: (api: MannequinAnchorApi) => void;
}

export type MannequinAnchorPoint = { x: number; y: number };

export type MannequinAnchorApi = {
  /** Canvas pixel size */
  getSize: () => { width: number; height: number };
  /** World position of an object/bone by name (inside the cloned model). */
  getWorld: (name: string) => THREE.Vector3 | null;
  /** Project an object/bone by name into 2D canvas pixels (top-left origin). */
  getPoint: (name: string) => MannequinAnchorPoint | null;
};


const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

// Target height in "meters" (world units) for consistent framing
const TARGET_HEIGHT: Record<Sex, number> = {
  m: 1.75,
  f: 1.68,
};

// Drops the mannequin visually so feet sit on the UI "floor" line
const VISUAL_FLOOR_DROP = 0.62;


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
      // Stability: avoid weird clipping on skinned meshes
      mesh.frustumCulled = false;
    }
  });
}

function normalizeModel(root: THREE.Object3D, sex: Sex) {
  // 1) Scale to target height using Box3 (robust even if SkinnedMesh bounds are odd after animation)
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  const h = Math.max(0.0001, size.y);
  const s = TARGET_HEIGHT[sex] / h;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);

  // 2) Recompute after scale
  const box2 = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size2 = new THREE.Vector3();
  box2.getCenter(center);
  box2.getSize(size2);

  // 3) Feet to floor (minY -> 0)
  root.position.y += -box2.min.y;
  // Visual drop so the feet align with the UI floor (yellow line)
  root.position.y -= VISUAL_FLOOR_DROP;
  root.updateMatrixWorld(true);

  // 4) Center X/Z around model center (keeps it in the middle of panel)
  const box3 = new THREE.Box3().setFromObject(root);
  const c3 = new THREE.Vector3();
  box3.getCenter(c3);
  root.position.x += -c3.x;
  root.position.z += -c3.z;
  root.updateMatrixWorld(true);
}

function AutoFitCamera({ subjectRef, sex }: { subjectRef: React.RefObject<THREE.Object3D>; sex: Sex }) {
  const { camera, size } = useThree();
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!(camera as any).isPerspectiveCamera) return;
    camera.near = 0.05;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const subject = subjectRef.current;
    if (!subject) return;

    // Use Box3 AFTER normalization => stable and predictable
    const box = new THREE.Box3().setFromObject(subject);
    const sz = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(sz);
    box.getCenter(c);

    const height = Math.max(TARGET_HEIGHT[sex] * 0.98, sz.y);
    const centerY = c.y;

    const aspect = size.width / Math.max(1, size.height);
    const cam = camera as THREE.PerspectiveCamera;

    // Nike feel: a bit wider than before (avoid "gigante")
    cam.fov = 44;
    cam.updateProjectionMatrix();

    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    // Give more breathing room + clamp distance so it never goes too close
    const margin = sex === "m" ? 1.82 : 1.72;

    // Focus a bit ABOVE center => model goes DOWN in frame (torso focus)
    const yBias = height * 1.05; // base torso focus

    // Extra push DOWN in the canvas so feet land near the bottom guideline
    const frameDown = height * 1.20;

    // approximate horizontal radius from box
    const maxR = Math.max(sz.x, sz.z) / 2;

    const distForHeight = (height / 2) / Math.tan(vFov / 2);
    const distForWidth = (maxR * 1.25) / Math.tan(hFov / 2);

    // Strong zoom-out clamp to prevent legs-only/gigante oscillations
    const dist = Math.max(distForHeight, distForWidth) * margin;
    const clampedDist = Math.max(dist, 13.5);

    const target = new THREE.Vector3(0, centerY + yBias + frameDown, 0);
    const pos = new THREE.Vector3(0, centerY + yBias + frameDown + height * 0.26, clampedDist);

    const key = `${sex}|${size.width}x${size.height}|${height.toFixed(3)}|${maxR.toFixed(3)}|${centerY.toFixed(3)}|${yBias.toFixed(3)}|${clampedDist.toFixed(3)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    cam.position.copy(pos);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, subjectRef, sex]);

  return null;
}


function ExposeAnchors({
  subjectRef,
  onReady,
}: {
  subjectRef: React.RefObject<THREE.Object3D>;
  onReady?: (api: MannequinAnchorApi) => void;
}) {
  const { camera, size } = useThree();
  const sentRef = useRef<string>("");

  // keep a lightweight name->object cache for this model instance
  const cacheRef = useRef<Map<string, THREE.Object3D>>(new Map());

  const findObject = (name: string): THREE.Object3D | null => {
    const cached = cacheRef.current.get(name);
    if (cached) return cached;
    const root = subjectRef.current;
    if (!root) return null;
    let found: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (found) return;
      if (o.name === name) found = o;
    });
    if (found) cacheRef.current.set(name, found);
    return found;
  };

  const getWorld = (name: string): THREE.Vector3 | null => {
    const obj = findObject(name);
    if (!obj) return null;
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    return v;
  };

  const getPoint = (name: string): MannequinAnchorPoint | null => {
    const v = getWorld(name);
    if (!v) return null;
    const p = v.clone().project(camera as any);
    const x = (p.x * 0.5 + 0.5) * size.width;
    const y = (-p.y * 0.5 + 0.5) * size.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  };

  // In case something animates or subtle changes occur, keep cache valid
  useFrame(() => {
    // noop: hook keeps component in render loop so projections stay consistent
  });

  useEffect(() => {
    if (!onReady) return;
    if (!subjectRef.current) return;
    if (!size.width || !size.height) return;

    const key = `${size.width}x${size.height}`;
    if (sentRef.current === key) return;
    sentRef.current = key;

    onReady({
      getSize: () => ({ width: size.width, height: size.height }),
      getWorld,
      getPoint,
    });
  }, [onReady, size.width, size.height, subjectRef]);

  return null;
}

function MannequinModel({ sex, rootRef }: { sex: Sex; rootRef: React.RefObject<THREE.Object3D> }) {
  const { scene } = useGLTF(MODEL_PATHS[sex]);

  // Clone to avoid shared state between M/F or rerenders
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    forceMaterial(cloned);
    normalizeModel(cloned, sex);
  }, [cloned, sex]);

  return <primitive ref={rootRef as any} object={cloned} />;
}

export function MannequinViewer({ variant, sex: sexProp = "m", showControls = false, onAnchorsReady }: MannequinViewerProps) {
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
        camera={{ fov: 44, position: [0, 2.8, 14.0] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={0.75} />
        <directionalLight position={[-2, 4, 3]} intensity={0.25} />

        <group>
          <MannequinModel sex={sex} rootRef={rootRef} />
        </group>

        <AutoFitCamera subjectRef={rootRef} sex={sex} />

        <ExposeAnchors subjectRef={rootRef} onReady={onAnchorsReady} />

        {showControls ? (
          <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} target={[0, 1, 0]} />
        ) : null}
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);

export default MannequinViewer;
