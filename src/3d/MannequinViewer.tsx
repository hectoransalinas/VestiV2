import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";

type Sex = "m" | "f";
type Variant = "M" | "F" | "m" | "f" | "male" | "female";

const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

// ✅ Fixed camera "Nike/Adidas" style
const CAMERA_FOV = 38;
// Keep position stable; the lookAt will be driven by torso focus (computed once from model height)
const CAMERA_POS = new THREE.Vector3(0, 1.25, 2.85);

// Scale normalization (one-time per load)
const TARGET_HEIGHT: Record<Sex, number> = { m: 1.75, f: 1.68 };

// Locator names (Option A models)
const LOC = {
  head: "vesti_head",
  feet: "vesti_feet",
  shoulderL: "vesti_shoulderL",
  shoulderR: "vesti_shoulderR",
};

function resolveSex(variant?: Variant, sex?: Sex): Sex {
  if (sex === "m" || sex === "f") return sex;
  const v = (variant || "m").toString().toLowerCase();
  return v.startsWith("f") ? "f" : "m";
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (o.name === name) found = o;
  });
  return found;
}

function forcePremiumMaterial(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.frustumCulled = false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (!m) return;
      // Matte premium gray
      if (m.color) m.color = new THREE.Color("#8b8f97");
      if (typeof m.roughness === "number") m.roughness = 0.85;
      if (typeof m.metalness === "number") m.metalness = 0.05;
      m.needsUpdate = true;
    });

    // If material is something exotic, replace for stability
    const anyMat = mesh.material as any;
    const keep =
      anyMat &&
      (anyMat.isMeshStandardMaterial || anyMat.isMeshPhysicalMaterial || anyMat.isMeshLambertMaterial || anyMat.isMeshPhongMaterial);
    if (!keep) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#8b8f97"),
        roughness: 0.85,
        metalness: 0.05,
      });
    }
  });
}

/**
 * Mannequin model:
 * - Loads GLB
 * - Scales to target height (once)
 * - Places feet at y=0 (once)
 * - Centers X/Z (once)
 * - Computes a stable torso focus point: y = height * 0.55
 */
function MannequinModel({ sex, onFocusY }: { sex: Sex; onFocusY: (y: number) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODEL_PATHS[sex]) as unknown as { scene: THREE.Group };
  const root = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (!groupRef.current) return;

    forcePremiumMaterial(root);

    const head = findByName(root, LOC.head);
    const feet = findByName(root, LOC.feet);

    // --- 1) Measure initial height ---
    let h = 0;
    if (head && feet) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      head.getWorldPosition(a);
      feet.getWorldPosition(b);
      h = Math.max(0.0001, a.y - b.y);
    } else {
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      h = Math.max(0.0001, size.y);
    }

    // --- 2) Scale to target height (stable) ---
    const s = TARGET_HEIGHT[sex] / h;
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);

    // --- 3) Feet to floor (y=0) ---
    let feetWorldY = 0;
    if (feet) {
      const p = new THREE.Vector3();
      feet.getWorldPosition(p);
      feetWorldY = p.y;
    } else {
      const box = new THREE.Box3().setFromObject(root);
      feetWorldY = box.min.y;
    }
    root.position.y -= feetWorldY;
    root.updateMatrixWorld(true);

    // --- 4) Center X/Z using shoulders (best) else Box center ---
    const shL = findByName(root, LOC.shoulderL);
    const shR = findByName(root, LOC.shoulderR);
    if (shL && shR) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      shL.getWorldPosition(a);
      shR.getWorldPosition(b);
      const mid = a.add(b).multiplyScalar(0.5);
      root.position.x -= mid.x;
      root.position.z -= mid.z;
    } else {
      const box = new THREE.Box3().setFromObject(root);
      const c = new THREE.Vector3();
      box.getCenter(c);
      root.position.x -= c.x;
      root.position.z -= c.z;
    }
    root.updateMatrixWorld(true);

    // --- 5) Compute final height AFTER normalization, and set torso focus ---
    let finalHeight = 0;
    if (head && feet) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      head.getWorldPosition(a);
      feet.getWorldPosition(b);
      // feet should be ~0 now, but use diff to be safe
      finalHeight = Math.max(0.0001, a.y - b.y);
    } else {
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      finalHeight = Math.max(0.0001, size.y);
    }

    // ✅ Focus on torso: between chest and navel (Nike/Adidas feel)
    const torsoFocusY = finalHeight * 0.55;
    onFocusY(torsoFocusY);

    // Mount into group
    groupRef.current.clear();
    groupRef.current.add(root);
  }, [root, sex, onFocusY]);

  return <group ref={groupRef} />;
}

function FixedCamera({ focusY }: { focusY: number }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.copy(CAMERA_POS);
    camera.fov = CAMERA_FOV;
    camera.near = 0.1;
    camera.far = 50;
    camera.updateProjectionMatrix();

    // ✅ This is the only "centering": look at torso.
    camera.lookAt(0, focusY, 0);
    camera.updateMatrixWorld(true);
  }, [camera, focusY]);

  return null;
}

export function MannequinViewer({
  variant,
  sex,
  showControls = false,
}: {
  variant?: Variant;
  sex?: Sex;
  showControls?: boolean;
}) {
  const resolved = resolveSex(variant, sex);
  const [focusY, setFocusY] = useState<number>(1.0);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      camera={{ fov: CAMERA_FOV, position: [CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z] }}
      style={{ width: "100%", height: "100%" }}
    >
      <FixedCamera focusY={focusY} />

      {/* Lighting: stable, premium */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[2.5, 4.5, 3]} intensity={0.85} />
      <directionalLight position={[-2.5, 3.5, 2]} intensity={0.35} />

      <Suspense fallback={null}>
        <Environment preset="city" />
        <MannequinModel sex={resolved} onFocusY={setFocusY} />
      </Suspense>

      {/* Controls disabled intentionally for product stability */}
      {showControls ? null : null}
    </Canvas>
  );
}

export default MannequinViewer;

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);
