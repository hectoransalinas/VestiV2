import React, { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";

type Sex = "m" | "f";
type Variant = "M" | "F" | "m" | "f" | "male" | "female";

const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

// --- Fixed "Nike/Adidas" framing (NO auto-fit, NO resize-based recompute) ---
const CAMERA_FOV = 38;
// Tuned for a premium, readable full-body shot on a 16:9-ish panel
const CAMERA_POS = new THREE.Vector3(0, 1.35, 3.15);
// Look slightly above mid-body so the figure "sits" lower in frame and feet are visible
const CAMERA_LOOK_AT = new THREE.Vector3(0, 1.05, 0);

// Target mannequin height in meters (approx). We normalize model scale ONCE per load,
// but we do NOT change camera based on size.
const TARGET_HEIGHT: Record<Sex, number> = { m: 1.75, f: 1.68 };

// Locator names embedded in the GLB (Option A)
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

/**
 * Applies a premium matte material and disables cast/receive shadow flicker
 * (we keep it simple and stable).
 */
function forcePremiumMaterial(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Ensure stable frustum culling behavior for skinned meshes / thin parts
    mesh.frustumCulled = false;

    // Keep original material if it's already MeshStandardMaterial-like,
    // otherwise replace with a stable matte standard material.
    const matAny = mesh.material as any;
    const keep =
      matAny &&
      (matAny.isMeshStandardMaterial ||
        matAny.isMeshPhysicalMaterial ||
        matAny.isMeshLambertMaterial ||
        matAny.isMeshPhongMaterial);

    if (!keep) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#8b8f97"),
        roughness: 0.85,
        metalness: 0.05,
      });
    } else {
      // Normalize for a clean "Shopify premium" matte look
      try {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: any) => {
          if (!m) return;
          if (m.color) m.color = new THREE.Color("#8b8f97");
          if (typeof m.roughness === "number") m.roughness = 0.85;
          if (typeof m.metalness === "number") m.metalness = 0.05;
        });
      } catch {
        // no-op
      }
    }
  });
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (o.name === name) found = o;
  });
  return found;
}

function MannequinModel({ sex }: { sex: Sex }) {
  const groupRef = useRef<THREE.Group>(null);

  // IMPORTANT: use sex prop here (not any outer variable)
  const { scene } = useGLTF(MODEL_PATHS[sex]) as unknown as { scene: THREE.Group };

  // Clone to avoid mutating cached glTF scene across mounts
  const root = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (!groupRef.current) return;

    forcePremiumMaterial(root);

    // ---- Normalize transform deterministically (ONCE per load) ----
    // 1) Prefer locators for head/feet. If missing, fall back to Box3.
    const head = findByName(root, LOC.head);
    const feet = findByName(root, LOC.feet);

    let height = 0;
    let feetY = 0;

    if (head && feet) {
      const pHead = new THREE.Vector3();
      const pFeet = new THREE.Vector3();
      head.getWorldPosition(pHead);
      feet.getWorldPosition(pFeet);
      height = Math.max(0.0001, pHead.y - pFeet.y);
      feetY = pFeet.y;
    } else {
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      height = Math.max(0.0001, size.y);
      feetY = box.min.y;
    }

    // 2) Scale to target height (stable, NOT dependent on container)
    const s = TARGET_HEIGHT[sex] / height;
    root.scale.setScalar(s);

    // 3) After scaling, re-evaluate feetY and center X/Z for stable placement
    root.updateMatrixWorld(true);

    // feet to y=0
    let feetWorldY = 0;
    if (feet) {
      const pFeet2 = new THREE.Vector3();
      feet.getWorldPosition(pFeet2);
      feetWorldY = pFeet2.y;
    } else {
      const box2 = new THREE.Box3().setFromObject(root);
      feetWorldY = box2.min.y;
    }
    // Move the whole root so feet sit on y=0
    root.position.y -= feetWorldY;

    // Center X/Z around shoulders (best) else Box3 center
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
      const box3 = new THREE.Box3().setFromObject(root);
      const center = new THREE.Vector3();
      box3.getCenter(center);
      root.position.x -= center.x;
      root.position.z -= center.z;
    }

    // Apply into group (fresh)
    groupRef.current.clear();
    groupRef.current.add(root);
  }, [root, sex]);

  return <group ref={groupRef} />;
}

function FixedCamera() {
  const { camera } = useThree();

  useEffect(() => {
    // Set once. No resize-based updates.
    camera.position.copy(CAMERA_POS);
    camera.fov = CAMERA_FOV;
    camera.near = 0.1;
    camera.far = 50;
    camera.updateProjectionMatrix();
    camera.lookAt(CAMERA_LOOK_AT);
    camera.updateMatrixWorld(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      camera={{ fov: CAMERA_FOV, position: [CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z] }}
      style={{ width: "100%", height: "100%" }}
    >
      <FixedCamera />

      {/* Lighting: stable, premium, simple */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[2.5, 4.5, 3]} intensity={0.85} />
      <directionalLight position={[-2.5, 3.5, 2]} intensity={0.35} />

      <Suspense fallback={null}>
        <Environment preset="city" />
        <MannequinModel sex={resolved} />
      </Suspense>

      {/* Controls intentionally disabled for product stability */}
      {showControls ? null : null}
    </Canvas>
  );
}

export default MannequinViewer;

// Preload both models for snappy M/F toggles
useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);
