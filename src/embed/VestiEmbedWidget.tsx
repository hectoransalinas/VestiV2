import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import type { CSSProperties } from "react";
import {
  Garment,
  GarmentCategory,
  Measurements,
  computeFit,
  makeRecommendation,
  FitResult,
} from "../motor/fitEngine";
import { MannequinViewer } from "../3d/MannequinViewer";

type VestiEmbedProps = {
  categoria: GarmentCategory;
  prenda: Garment;
  perfilInicial?: Measurements;
  onRecomendacion?: (data: {
    fit: FitResult;
    recommendation: ReturnType<typeof makeRecommendation>;
    user: Measurements;
    garment: Garment;
  }) => void;
};

const defaultPerfil: Measurements = {
  hombros: 44,
  pecho: 96,
  cintura: 82,
  largoTorso: 52,
  largoPierna: 102,
  pieLargo: 26,
  cadera: 0,
};

// -------------------- Helpers de color y layout --------------------

function zoneColor(status: string): string {
  switch (status) {
    case "Perfecto":
      return "rgba(22, 163, 74, 0.45)"; // verde
    case "Justo":
    case "Ajustado":
      return "rgba(220, 38, 38, 0.45)"; // rojo
    case "Holgado":
    case "Grande":
    default:
      return "rgba(234, 179, 8, 0.45)"; // amarillo
  }
}

function chipBorderColor(status: string): string {
  switch (status) {
    case "Perfecto":
      return "#16a34a"; // verde
    case "Justo":
    case "Ajustado":
      return "#dc2626"; // rojo
    case "Holgado":
    case "Grande":
    default:
      return "#eab308"; // amarillo
  }
}

// Mapeo de zona -> posición vertical (porcentaje sobre alto del visor)
const widthTopPercent: Record<string, string> = {
  hombros: "18%",
  pecho: "29%",
  cintura: "43%",
  cadera: "51%",
};

const lengthBarLayout: Record<string, { top: string; bottom: string }> = {
  largoTorso: { top: "18%", bottom: "50%" },
  largoPierna: { top: "38%", bottom: "12%" },
};

type ViewMode = "top" | "bottom" | "shoes";

type OverlayProps = {
  fit: FitResult;
  viewMode: ViewMode;
  footLength: number;
};

// Mapear largo de pie en cm -> talle EU aproximado (36–45)
function mapFootToEuSize(lenCm: number): number | null {
  if (!Number.isFinite(lenCm) || lenCm <= 0) return null;
  if (lenCm < 23.0) return 36;
  if (lenCm < 23.7) return 37;
  if (lenCm < 24.4) return 38;
  if (lenCm < 25.1) return 39;
  if (lenCm < 25.8) return 40;
  if (lenCm < 26.5) return 41;
  if (lenCm < 27.2) return 42;
  if (lenCm < 27.9) return 43;
  if (lenCm < 28.6) return 44;
  return 45;
}

// Convertir talle (ARG/EUR/USA) a largo de pie aproximado (cm).
// Nota: es una aproximación para UX; el motor de calce sigue operando por cm.
function shoeSizeToFootLengthCm(args: {
  system: "ARG" | "EUR" | "USA";
  value: number;
  gender: "M" | "F";
}): number {
  const v = args.value;
  if (!Number.isFinite(v) || v <= 0) return 0;

  // Base: aproximación lineal usando la escala EU (similar a lo que ya usamos en mapFootToEuSize)
  const euToCm = (eu: number) => 22.3 + 0.7 * (eu - 35); // EU 36 ≈ 23.0cm

  if (args.system === "EUR") return euToCm(v);

  // En muchas tiendas AR se muestra equivalente a EU. Si tu tienda usa otra tabla,
  // esto se puede ajustar por configuración.
  if (args.system === "ARG") return euToCm(v);

  // USA: aproximación por género (US M ≈ EU-33, US F ≈ EU-31)
  const eu = args.gender === "M" ? v + 33 : v + 31;
  return euToCm(eu);
}

// Fallback: heurística de calce de calzado en función del largo de pie.
function shoeFitFromFootLength(lenCm: number): {
  label: string;
  statusKey: "Perfecto" | "Ajustado" | "Holgado";
} {
  if (!Number.isFinite(lenCm) || lenCm <= 0) {
    return { label: "Sin datos", statusKey: "Holgado" };
  }

  const euSize = mapFootToEuSize(lenCm);

  let statusKey: "Perfecto" | "Ajustado" | "Holgado";
  if (lenCm < 23) statusKey = "Ajustado";
  else if (lenCm > 27.5) statusKey = "Holgado";
  else statusKey = "Perfecto";

  const statusText =
    statusKey === "Perfecto" ? "Perfecto" : statusKey === "Ajustado" ? "Ajustado" : "Grande";

  if (!euSize) return { label: statusText, statusKey };

  return { label: `${euSize} (${statusText})`, statusKey };
}

// Si el motor expone la zona "pieLargo" (lengths), la usamos como fuente de verdad.
// Mapeo motor -> UI: Corto->Ajustado, Perfecto->Perfecto, Largo->Grande
function shoeOverlayFromFit(
  fit: any,
  footLength: number
): { label: string; statusKey: "Perfecto" | "Ajustado" | "Holgado" } {
  const lengths: any = (fit as any)?.lengths;

  if (Array.isArray(lengths)) {
    const z = lengths.find((lz) => lz?.zone === "pieLargo");
    const s = z?.status as string | undefined;

    if (s) {
      if (s === "Perfecto") return { label: "Perfecto", statusKey: "Perfecto" };
      if (s === "Corto" || s === "Ajustado" || s === "Justo") {
        return { label: "Ajustado", statusKey: "Ajustado" };
      }
      if (s === "Largo" || s === "Grande" || s === "Holgado") {
        return { label: "Grande", statusKey: "Holgado" };
      }
      return { label: String(s), statusKey: "Holgado" };
    }
  }

  return shoeFitFromFootLength(footLength);
}

function normalizeFitForUi(fit: any): any {
  if (!fit) return fit;

  const lengths: any = (fit as any).lengths;
  if (Array.isArray(lengths)) {
    const nextLengths = lengths.map((lz: any) => {
      if (!lz || lz.zone !== "pieLargo") return lz;
      const s = String(lz.status ?? "");
      if (s === "Corto") return { ...lz, status: "Ajustado" };
      if (s === "Largo") return { ...lz, status: "Grande" };
      return lz;
    });
    return { ...fit, lengths: nextLengths };
  }

  return fit;
}


function computeHipZoneForUi(user: any, prenda: any): { zone: string; status: string } | null {
  const userHip = Number(user?.cadera ?? 0);
  const garmentHip = Number(prenda?.measures?.cadera ?? prenda?.measures?.hip ?? 0);
  if (!Number.isFinite(userHip) || userHip <= 0) return null;
  if (!Number.isFinite(garmentHip) || garmentHip <= 0) return null;

  const stretchPct = Number(prenda?.stretchPct ?? 0);
  const easePreset = String(prenda?.easePreset ?? "regular").toLowerCase();

  // Ajuste simple por "ease" (informativo, NO debe cambiar talle)
  const easeCm =
    easePreset === "slim" ? -2 :
    easePreset === "oversize" ? 2 :
    0;

  const stretchCm = garmentHip * (Number.isFinite(stretchPct) ? stretchPct : 0) / 100;
  const effectiveGarmentHip = garmentHip + stretchCm + easeCm;

  const delta = effectiveGarmentHip - userHip; // positivo = holgura disponible

  // Umbrales suaves (informativos)
  if (delta < -1) return { zone: "cadera", status: "Ajustado" };
  if (delta > 6) return { zone: "cadera", status: "Holgado" };
  return { zone: "cadera", status: "Perfecto" };
}

const FitOverlay: React.FC<OverlayProps> = ({ fit, viewMode, footLength, anchorApi }) => {
  if (!fit && viewMode !== "shoes") return null;

  const isTopView = viewMode === "top";
  const isBottomView = viewMode === "bottom";
  const isShoesView = viewMode === "shoes";

  const widthZones = (fit?.widths ?? []).filter((z) => {
    if (isShoesView) return false;
    if (isBottomView) return z.zone === "cintura" || z.zone === "cadera";
    return z.zone === "hombros" || z.zone === "pecho" || z.zone === "cintura";
  });

  const rawLengths = fit?.lengths ?? [];
  let lengthZones: typeof rawLengths = [];

  if (isShoesView) {
    lengthZones = [];
  } else if (isBottomView) {
    const leg = rawLengths.find((lz) => lz.zone === "largoPierna");
    if (leg) lengthZones = [leg];
    else if (rawLengths.length) lengthZones = [{ ...rawLengths[0], zone: "largoPierna" } as any];
  } else if (isTopView) {
    const torso = rawLengths.find((lz) => lz.zone === "largoTorso");
    if (torso) lengthZones = [torso];
  }

  const hasShoeOverlay = isShoesView;

  if (!widthZones.length && !lengthZones.length && !hasShoeOverlay) return null;

  const shoeFit = shoeOverlayFromFit(fit, footLength);
  const shoeColor = zoneColor(shoeFit.statusKey);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {widthZones.map((z) => {
        const top = (isBottomView && z.zone === "cintura") ? "40%" : (isBottomView && z.zone === "cadera") ? "52%" : (widthTopPercent[z.zone] ?? "45%");
        const color = zoneColor(z.status);
        return (
          <div
            key={z.zone}
            style={{
              position: "absolute",
              left: "10%",
              right: "10%",
              top,
              height: "5.5%",
              borderRadius: 999,
              background: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 8px",
              boxShadow: "0 3px 9px rgba(15,23,42,0.22)",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#0f172a" }}>
              {String(z.zone).toUpperCase()}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: "#0f172a" }}>{z.status}</span>
          </div>
        );
      })}

      {lengthZones.map((lz) => {
        const layout = lengthBarLayout[lz.zone];
        if (!layout) return null;
        const color = zoneColor(lz.status);
        const shortLabel = lz.zone === "largoTorso" ? "Torso" : "Pierna";

        const chipTop =
          lz.zone === "largoTorso" ? "10%" : lz.zone === "largoPierna" ? "82%" : `calc(${layout.top} - 3%)`;

        return (
          <Fragment key={lz.zone}>
            <div
              style={{
                position: "absolute",
                top: layout.top,
                bottom: layout.bottom,
                right: "5%",
                width: "3%",
                borderRadius: 999,
                background: "rgba(15,23,42,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "50%",
                  height: "85%",
                  borderRadius: 999,
                  background: color,
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                right: "11%",
                top: chipTop,
                padding: "3px 6px",
                borderRadius: 999,
                background: "#f9fafb",
                fontSize: 10,
                color: "#0f172a",
                boxShadow: "0 3px 8px rgba(15,23,42,0.22)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontWeight: 600 }}>{shortLabel}:</span>
              <span>{lz.status}</span>
            </div>
          </Fragment>
        );
      })}

      {hasShoeOverlay && (
        <>
          <div
            style={{
              position: "absolute",
              left: "26%",
              right: "26%",
              bottom: "6%",
              height: "13%",
              borderRadius: 999,
              background: shoeColor,
              boxShadow: "0 12px 28px rgba(15,23,42,0.35)",
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "26%",
              transform: "translateX(-50%)",
              padding: "4px 10px",
              borderRadius: 999,
              background: "#f9fafb",
              fontSize: 11,
              color: "#0f172a",
              boxShadow: "0 3px 8px rgba(15,23,42,0.22)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 600 }}>Calce calzado:</span>
            <span>{shoeFit.label}</span>
          </div>
        </>
      )}
    </div>
  );
};

function viewModeFromCategory(cat: any): ViewMode {
  if (cat === "pantalon" || cat === "pants") return "bottom";
  if (cat === "calzado" || cat === "zapatilla" || cat === "shoes") return "shoes";
  return "top";
}

// -------------------- Componente principal --------------------

export const VestiEmbedWidget: React.FC<VestiEmbedProps> = ({
  categoria,
  prenda,
  perfilInicial,
  onRecomendacion,
}) => {
  const [user, setUser] = useState<Measurements>(perfilInicial ?? defaultPerfil);
  useEffect(() => { console.log("%c[VESTI] VESTI_BUILD_HIP_V2", "color:#22c55e;font-weight:bold"); }, []);

  const isSizeGuideMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("mode") === "sizeguide";
    } catch {
      return false;
    }
  }, []);

  // En modo sizeguide las medidas pueden venir de afuera
  const lastPerfilKeyRef = useRef<string>("");
  useEffect(() => {
    if (!isSizeGuideMode) return;
    if (!perfilInicial) return;

    const key = JSON.stringify(perfilInicial);
    if (key === lastPerfilKeyRef.current) return;
    lastPerfilKeyRef.current = key;

    setUser((prev) => ({ ...prev, ...perfilInicial }));
  }, [isSizeGuideMode, perfilInicial]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => viewModeFromCategory(categoria));
  useEffect(() => {
    setViewMode(viewModeFromCategory(categoria));
  }, [categoria]);

  const [footLength, setFootLength] = useState<number>(26);
  const [shoeSizeSystem, setShoeSizeSystem] = useState<"ARG" | "EUR" | "USA">("ARG");
  const [shoeSizeValue, setShoeSizeValue] = useState<number>(41);

  // Mantener pieLargo del usuario sincronizado con la UI de shoes
  useEffect(() => {
    setUser((prev) => ({ ...prev, pieLargo: footLength } as any));
  }, [footLength]);

  const [mannequinGender, setMannequinGender] = useState<"M" | "F">("M");

const fit = useMemo(() => computeFit(user, prenda), [user, prenda]);
const fitUiBase = useMemo(() => normalizeFitForUi(fit), [fit]);

// Inyectar CADERA como zona informativa SOLO para UI (chips/overlay). No afecta recomendación.
const fitUiForUi = useMemo(() => {
  const baseFit: any = fitUiBase;
  if (!baseFit) return baseFit;
  if (viewMode !== "bottom") return baseFit;

  const hipZone = computeHipZoneForUi(user, prenda);
  if (!hipZone) return baseFit;

  const widths = Array.isArray(baseFit.widths) ? [...baseFit.widths] : [];
  const idx = widths.findIndex((z: any) => z?.zone === "cadera");
  if (idx >= 0) widths[idx] = { ...widths[idx], status: hipZone.status };
  else widths.push({ zone: "cadera", status: hipZone.status });

  return { ...baseFit, widths };
}, [fitUiBase, user, prenda, viewMode]);


  const rec = useMemo(
    () =>
      makeRecommendation({
        category: categoria,
        garment: prenda,
        fit: fitUiBase,
      }),
    [categoria, prenda, fitUiBase]
  );

  // Auto-ajuste de alto cuando se usa dentro de un iframe embebido
  useEffect(() => {
    if (window.self === window.top) return;

    const sendHeight = () => {
      try {
        const doc = document;
        const height = doc.documentElement.scrollHeight || doc.body.scrollHeight || 0;
        window.parent.postMessage({ type: "vesti:resize", height }, "*");
      } catch {
        // ignore
      }
    };

    sendHeight();

    const ResizeObs: any = (window as any).ResizeObserver;
    if (ResizeObs) {
      const observer = new ResizeObs(() => sendHeight());
      observer.observe(document.body);
      window.addEventListener("load", sendHeight);
      return () => {
        observer.disconnect();
        window.removeEventListener("load", sendHeight);
      };
    } else {
      window.addEventListener("resize", sendHeight);
      window.addEventListener("load", sendHeight);
      return () => {
        window.removeEventListener("resize", sendHeight);
        window.removeEventListener("load", sendHeight);
      };
    }
  }, []);

  // Notificar hacia afuera cuando cambia algo relevante
  const lastPayloadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onRecomendacion) return;

    const payload = {
      fit: fitUiForUi,
      recommendation: rec,
      user,
      garment: prenda,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastPayloadRef.current) return;
    lastPayloadRef.current = serialized;
    onRecomendacion(payload);
  }, [fitUiForUi, rec, user, prenda, onRecomendacion]);

  const handleChange =
    (field: keyof Measurements) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(String(e.target.value).replace(",", "."));
      setUser((prev) => ({ ...prev, [field]: isNaN(val) ? 0 : val }));
    };

  const handleFootChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(String(e.target.value).replace(",", "."));
    setFootLength(isNaN(val) ? 0 : val);
  };
const handleShoeSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  const system = e.target.value as "ARG" | "EUR" | "USA";
  setShoeSizeSystem(system);
  const cm = shoeSizeToFootLengthCm({ system, value: shoeSizeValue, gender: mannequinGender });
  setFootLength(cm);
};

const handleShoeSizeValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = Number(String(e.target.value).replace(",", "."));
  const value = isNaN(val) ? 0 : val;
  setShoeSizeValue(value);
  const cm = shoeSizeToFootLengthCm({ system: shoeSizeSystem, value, gender: mannequinGender });
  setFootLength(cm);
};


  // UI recomendación (modo app/demo)
  const isOk = rec.tag === "OK";
  const isSizeUp = rec.tag === "SIZE_UP";
  const isSizeDown = rec.tag === "SIZE_DOWN";
  const isCheckLength = rec.tag === "CHECK_LENGTH";

  const relevantLengths =
    viewMode === "bottom"
      ? (fitUiForUi?.lengths ?? []).filter((lz: any) => lz.zone === "largoPierna")
      : viewMode === "top"
      ? (fitUiForUi?.lengths ?? []).filter((lz: any) => lz.zone === "largoTorso")
      : [];

  const hasLengthAlert = relevantLengths.some((lz: any) => (lz?.status ?? "") !== "Perfecto");
  const shouldWarn = isCheckLength || (isOk && hasLengthAlert);
  const isError = isSizeUp || isSizeDown;

  const recBg =
    isOk && !shouldWarn ? "#ecfdf3" : isError ? "#fef2f2" : shouldWarn ? "#fffbeb" : "#eff6ff";
  const recBorder =
    isOk && !shouldWarn
      ? "1px solid #bbf7d0"
      : isError
      ? "1px solid #fecACA"
      : shouldWarn
      ? "1px solid #fef3c7"
      : "1px solid #bfdbfe";

  const recTitle =
    isOk && !shouldWarn
      ? `Calce recomendado · Talle ${prenda.sizeLabel}`
      : isError
      ? `Revisá el calce · Talle evaluado ${prenda.sizeLabel}`
      : shouldWarn
      ? `Ojo con el largo · Talle ${prenda.sizeLabel}`
      : `Calce estimado · Talle ${prenda.sizeLabel}`;

  const recBody =
    isOk && !shouldWarn
      ? "Este talle se ve bien en general para tus medidas. Revisá las zonas clave para confirmar el calce que preferís."
      : isSizeUp
      ? "Vemos alguna zona al límite o ajustada. Podés comparar este talle con uno más para quedarte tranquilo antes de comprar."
      : isSizeDown
      ? "Vemos algo de holgura en alguna zona. Si preferís un calce más al cuerpo, podés comparar este talle con uno menos."
      : shouldWarn
      ? "El talle se ve bien, pero el largo podría no ser ideal. Revisá la alerta de largo antes de decidir tu compra."
      : "Revisá las zonas clave del calce antes de decidir tu talle final.";

  // Badges por zona (modo app/demo)
  const allWidths = (fitUiForUi as any)?.widths ?? [];
  const allLengths = (fitUiForUi as any)?.lengths ?? [];

  let widthBadges = allWidths;
  let lengthBadges = allLengths;

  if (viewMode === "top") {
    widthBadges = allWidths.filter((z: any) => ["hombros", "pecho", "cintura"].includes(z.zone));
    lengthBadges = allLengths.filter((lz: any) => lz.zone === "largoTorso");
  } else if (viewMode === "bottom") {
    widthBadges = allWidths.filter((z: any) => ["cintura", "cadera"].includes(z.zone));
    const leg = allLengths.find((lz: any) => lz.zone === "largoPierna");
    lengthBadges = leg ? [leg] : [];
  } else if (viewMode === "shoes") {
    widthBadges = [];
    lengthBadges = [];
  }

  const shoeChip = viewMode === "shoes" ? shoeOverlayFromFit(fitUiForUi, footLength) : null;
  const shoeChipBorder =
    shoeChip?.statusKey === "Perfecto"
      ? chipBorderColor("Perfecto")
      : shoeChip?.statusKey === "Ajustado"
      ? chipBorderColor("Ajustado")
      : chipBorderColor("Grande");

  return (
    <div
      style={{
        width: "100%",
          display: "block",
        maxWidth: isSizeGuideMode ? "100%" : 420,
        margin: isSizeGuideMode ? 0 : "0 auto",
        borderRadius: isSizeGuideMode ? 0 : 16,
        padding: isSizeGuideMode ? 0 : 16,
        border: isSizeGuideMode ? "none" : "1px solid #e5e7eb",
        background: isSizeGuideMode ? "transparent" : "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Selector de tipo de prenda (solo modo app/demo; en sizeguide viene desde Shopify) */}
      {!isSizeGuideMode && (
        <div style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11 }}>
          {([
            ["top", "Superiores"],
            ["bottom", "Jeans / Pantalón"],
            ["shoes", "Zapatillas"],
          ] as [ViewMode, string][]).map(([mode, label]) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: active ? "#e0f2fe" : "#f9fafb",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Panel principal 3D */}
      <div
        style={{
          width: "100%",
          display: "block",
          ...(isSizeGuideMode ? { height: 560, minHeight: 560 } : { aspectRatio: "9 / 16" }),
          borderRadius: isSizeGuideMode ? 12 : 16,
          overflow: "hidden",
          background: "#f9fafb",
          marginBottom: isSizeGuideMode ? 0 : 8,
          position: "relative",
        }}
      >
        {/* Toggle M/F mannequin */}
        <div
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            zIndex: 5,
            display: "flex",
            gap: 6,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setMannequinGender("M")}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: mannequinGender === "M" ? "#e0f2fe" : "#ffffff",
              fontSize: 11,
              fontWeight: mannequinGender === "M" ? 700 : 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(15,23,42,0.10)",
            }}
          >
            M
          </button>
          <button
            type="button"
            onClick={() => setMannequinGender("F")}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: mannequinGender === "F" ? "#e0f2fe" : "#ffffff",
              fontSize: 11,
              fontWeight: mannequinGender === "F" ? 700 : 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(15,23,42,0.10)",
            }}
          >
            F
          </button>
        </div>

        <MannequinViewer variant={mannequinGender} />
        <FitOverlay fit={fitUiForUi} viewMode={viewMode} footLength={footLength} />
      </div>

      {/* Recomendación (solo modo app/demo) */}
      {!isSizeGuideMode && (
        <div style={{ marginTop: 4, padding: 12, borderRadius: 12, background: recBg, border: recBorder }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{recTitle}</div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>{recBody}</div>
        </div>
      )}

      {/* Vista rápida por zonas (solo modo app/demo) */}
      {!isSizeGuideMode && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          {widthBadges.map((z: any) => (
            <span
              key={z.zone}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 999,
                backgroundColor: "#f9fafb",
                border: `1px solid ${chipBorderColor(z.status)}`,
              }}
            >
              {z.zone}: {z.status}
            </span>
          ))}

          {lengthBadges.map((lz: any) => (
            <span
              key={lz.zone}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 999,
                backgroundColor: "#f9fafb",
                border: `1px solid ${chipBorderColor(lz.status)}`,
              }}
            >
              {(lz.zone === "largoTorso" ? "largo torso" : lz.zone === "largoPierna" ? "largo pierna" : lz.zone)}:{" "}
              {lz.status}
            </span>
          ))}

          {viewMode === "shoes" && shoeChip && (
            <span
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 999,
                backgroundColor: "#f9fafb",
                border: `1px solid ${shoeChipBorder}`,
              }}
            >
              pieLargo: {shoeChip.label}
            </span>
          )}
        </div>
      )}

      {/* Inputs (solo modo app/demo) */}
      {!isSizeGuideMode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(viewMode === "top" || viewMode === "bottom") && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>Hombros (cm)</span>
                <input
                  type="number"
                  value={Number.isFinite(user.hombros) ? user.hombros : ""}
                  onChange={handleChange("hombros")}
                  style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>Pecho (cm)</span>
                <input
                  type="number"
                  value={Number.isFinite(user.pecho) ? user.pecho : ""}
                  onChange={handleChange("pecho")}
                  style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>Cintura (cm)</span>
                <input
                  type="number"
                  value={Number.isFinite(user.cintura) ? user.cintura : ""}
                  onChange={handleChange("cintura")}
                  style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                />
              </label>
              {viewMode === "top" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Largo torso (cm)</span>
                  <input
                    type="number"
                    value={Number.isFinite(user.largoTorso) ? user.largoTorso : ""}
                    onChange={handleChange("largoTorso")}
                    style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                  />
                </label>
              )}
              {viewMode === "bottom" && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>Cadera (cm)</span>
                    <input
                      type="number"
                      value={Number.isFinite(user.cadera) ? user.cadera : ""}
                      onChange={handleChange("cadera")}
                      style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>Largo pierna (cm)</span>
                    <input
                      type="number"
                      value={Number.isFinite(user.largoPierna) ? user.largoPierna : ""}
                      onChange={handleChange("largoPierna")}
                      style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {viewMode === "shoes" && (
  <>
    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "#6b7280" }}>Sistema de talle</span>
      <select
        value={shoeSizeSystem}
        onChange={handleShoeSystemChange}
        style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12, background: "white" }}
      >
        <option value="ARG">ARG</option>
        <option value="EUR">EUR</option>
        <option value="USA">USA</option>
      </select>
    </label>

    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "#6b7280" }}>Talle habitual</span>
      <input
        type="number"
        value={Number.isFinite(shoeSizeValue) ? shoeSizeValue : ""}
        onChange={handleShoeSizeValueChange}
        style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
      />
    </label>

    <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
      Aproximación: largo de pie estimado <b>{Number.isFinite(footLength) ? footLength.toFixed(1) : "—"} cm</b>
    </div>
  </>
)}
        </div>
      )}
    </div>
  );
};

// Exponer el componente en window para escenarios embed (Shopify/iframe)
if (typeof window !== "undefined") {
  (window as any).VestiEmbedWidget = VestiEmbedWidget;
}

export default VestiEmbedWidget;
