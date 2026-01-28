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

  return { minY, maxY, maxR };
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

    // Aseguramos matrices al día
    subject.updateMatrixWorld(true);

    // 1) Bounds reales del OBJETO (mesh), no bones: más predecible para maniquíes
    const box = new THREE.Box3().setFromObject(subject);
    const sizeV = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(sizeV);
    box.getCenter(center);

    if (!isFinite(sizeV.y) || sizeV.y < 0.001) return;

    // 2) Pies al piso, estable (sin acumulación):
    // Guardamos el "baseY" la primera vez y luego seteamos absoluto.
    if (baseYRef.current === null) baseYRef.current = subject.position.y;
    const baseY = baseYRef.current;

    const desiredFeetY = 0; // piso
    const delta = desiredFeetY - box.min.y; // cuánto hay que subir/bajar para que minY sea 0
    subject.position.y = baseY + delta;
    subject.updateMatrixWorld(true);

    // 3) Recalcular bounds luego del ajuste de piso
    const box2 = new THREE.Box3().setFromObject(subject);
    const size2 = new THREE.Vector3();
    const center2 = new THREE.Vector3();
    box2.getSize(size2);
    box2.getCenter(center2);

    // Protecciones
    const height = Math.max(0.5, size2.y);
    const halfH = height / 2;

    // 4) Auto-encuadre por alto y ancho (sin magia global)
    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const halfW = Math.max(size2.x, size2.z) / 2;

    // Margen leve (premium, sin aire excesivo)
    const margin = sex === "m" ? 1.06 : 1.06;

    const distForHeight = halfH / Math.tan(vFov / 2);
    const distForWidth = halfW / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth) * margin;

    // 5) Target: centro real del maniquí (ligero bias para que cabeza no se corte)
    const yBias = height * 0.03;
    const target = new THREE.Vector3(center2.x, center2.y + yBias, center2.z);

    // Cámara frontal, mínima elevación
    const pos = new THREE.Vector3(target.x, target.y + height * 0.01, dist);

    const key = `${sex}|${size.width}x${size.height}|${height.toFixed(3)}|${halfW.toFixed(3)}|${target.y.toFixed(3)}|${dist.toFixed(3)}`;
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
        camera={{ fov: 34, position: [0, 1, 4] }}
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
