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

  return { minY, maxY, maxR };
}

function AutoFitCamera({ subjectRef, sex }: { subjectRef: React.RefObject<THREE.Object3D>; sex: Sex }) {
  const { camera, size } = useThree();
  const lastKey = useRef<string>("");

  useEffect(() => {
    // Aseguramos perspectiva
    if (!(camera as any).isPerspectiveCamera) return;
    camera.near = 0.05;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const subject = subjectRef.current;
    if (!subject) return;

    // Normalizamos pies al piso ANTES de encuadrar
    const bounds = computeBoneBoundsY(subject);
    if (bounds) {
      // llevamos minY a 0 ajustando el root
      // OJO: estamos modificando subject.position.y
      subject.position.y += -bounds.minY;
      subject.updateMatrixWorld(true);
    }
  }, [subjectRef]);

  useEffect(() => {
    const subject = subjectRef.current;
    if (!subject) return;
    const cam = camera as THREE.PerspectiveCamera;

    const bounds = computeBoneBoundsY(subject);

    // Fallback si algo raro: usamos Box3 clásico
    let minY: number, maxY: number, maxR: number;
    if (bounds) {
      minY = bounds.minY;
      maxY = bounds.maxY;
      maxR = Math.max(bounds.maxR, 0.25);
    } else {
      const box = new THREE.Box3().setFromObject(subject);
      const sizeV = new THREE.Vector3();
      box.getSize(sizeV);
      const c = new THREE.Vector3();
      box.getCenter(c);
      minY = c.y - sizeV.y / 2;
      maxY = c.y + sizeV.y / 2;
      maxR = Math.max(sizeV.x, sizeV.z) / 2;
    }

    // Como ya ajustamos pies al piso, recomputamos en el espacio actual
    // (minY debería ser ~0)
    subject.updateMatrixWorld(true);
    const bounds2 = computeBoneBoundsY(subject);
    if (bounds2) {
      minY = bounds2.minY;
      maxY = bounds2.maxY;
      maxR = Math.max(bounds2.maxR, maxR);
    }

    const height = Math.max(0.5, maxY - minY);
    const centerY = minY + height / 2;

    // Queremos ver todo el cuerpo: limitante por alto y por ancho (aspect)
    const aspect = size.width / Math.max(1, size.height);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

        const margin = sex === "m" ? 1.28 : 1.18; // M: un poco más de aire para no cortar cabeza
    const yBias = height * 0.08; // empuja el encuadre hacia arriba => el modelo baja en pantalla
    const distForHeight = (height / 2) / Math.tan(vFov / 2);
    const distForWidth = (maxR * 1.35) / Math.tan(hFov / 2); // ancho aproximado
    const dist = Math.max(distForHeight, distForWidth) * margin;

    // Cámara frontal levemente elevada
    const target = new THREE.Vector3(0, centerY + yBias, 0);
    const pos = new THREE.Vector3(0, centerY + yBias + height * 0.04, dist);

    // Evitamos recalcular si no cambió (M/F + resize)
    const key = `${sex}|${size.width}x${size.height}|${height.toFixed(3)}|${maxR.toFixed(3)}|${centerY.toFixed(3)}|${yBias.toFixed(3)}|${margin.toFixed(3)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    cam.position.copy(pos);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, subjectRef]);

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

export type MannequinVariant = "M" | "F" | Sex;

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
    const sex: Sex = variant === "F" ? "f" : variant === "M" ? "m" : (variant ?? sexProp);

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
