import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Sex = "m" | "f";

const MODEL_PATHS: Record<Sex, string> = {
  m: "/models/mannequin_m.glb",
  f: "/models/mannequin_f.glb",
};

// Material premium mate
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

type Locators = {
  head: THREE.Object3D;
  feet: THREE.Object3D;
  shoulderL: THREE.Object3D;
  shoulderR: THREE.Object3D;
};

function findLocators(root: THREE.Object3D): Locators | null {
  const head = root.getObjectByName("vesti_head");
  const feet = root.getObjectByName("vesti_feet");
  const shoulderL = root.getObjectByName("vesti_shoulderL");
  const shoulderR = root.getObjectByName("vesti_shoulderR");
  if (!head || !feet || !shoulderL || !shoulderR) return null;
  return { head, feet, shoulderL, shoulderR };
}

/**
 * AutoFit por LOCATORS
 * - Pies al piso (set absoluto)
 * - Distancia por alto/ancho reales
 * - "Nike framing": sesgo de encuadre para que el cuerpo quede más abajo en pantalla (como tu guía amarilla)
 */
function AutoFitCamera({ subjectRef }: { subjectRef: React.RefObject<THREE.Object3D> }) {
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

    const loc = findLocators(subject);
    if (!loc) return;

    // Base Y estable (evita acumulaciones)
    if (!baseYMap.current.has(subject.uuid)) baseYMap.current.set(subject.uuid, subject.position.y);
    const baseY = baseYMap.current.get(subject.uuid) ?? 0;

    // Medimos en world
    const vHead = new THREE.Vector3();
    const vFeet = new THREE.Vector3();
    const vSL = new THREE.Vector3();
    const vSR = new THREE.Vector3();

    loc.head.getWorldPosition(vHead);
    loc.feet.getWorldPosition(vFeet);
    loc.shoulderL.getWorldPosition(vSL);
    loc.shoulderR.getWorldPosition(vSR);

    const height = Math.max(0.6, vHead.y - vFeet.y);
    const shoulderWidth = Math.max(0.25, vSL.distanceTo(vSR));

    // Pies al piso (feet.y => 0) set absoluto
    subject.position.y = baseY - vFeet.y;
    subject.updateMatrixWorld(true);

    // Recalcular luego del ajuste
    loc.head.getWorldPosition(vHead);
    loc.feet.getWorldPosition(vFeet);

    // --- Nike framing ---
    // En tus capturas, querés que el cuerpo quede "más abajo" en el panel superior.
    // Subimos el target (miramos un poco más arriba) para que el modelo caiga hacia abajo en pantalla.
    // 0.72 fue elegido para que cabeza quede cerca del límite superior y pies cerca del inferior del "frame" marcado.
    const targetY = vFeet.y + height * 0.72;

    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    // Margen leve
    const margin = 1.08;

    const distForHeight = (height / 2) / Math.tan(vFov / 2);
    const distForWidth = (shoulderWidth / 2) / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth) * margin;

    const key = `${size.width}x${size.height}|${height.toFixed(3)}|${shoulderWidth.toFixed(3)}|${targetY.toFixed(3)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    cam.position.set(0, targetY + height * 0.06, dist);
    cam.lookAt(0, targetY, 0);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, subjectRef]);

  return null;
}

function MannequinModel({ sex, rootRef }: { sex: Sex; rootRef: React.RefObject<THREE.Object3D> }) {
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

export function MannequinViewer({ variant, sex: sexProp = "m", showControls = false }: MannequinViewerProps) {
  const sex: Sex = (() => {
    if (variant === "F" || variant === "f" || (variant as any) === "female") return "f";
    if (variant === "M" || variant === "m" || (variant as any) === "male") return "m";
    return sexProp;
  })();

  const rootRef = useRef<THREE.Object3D>(null);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ fov: 38, position: [0, 1.2, 4] }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={0.75} />

        <group>
          <MannequinModel sex={sex} rootRef={rootRef} />
        </group>

        <AutoFitCamera subjectRef={rootRef} />

        {showControls ? <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} /> : null}
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.m);
useGLTF.preload(MODEL_PATHS.f);

export default MannequinViewer;
