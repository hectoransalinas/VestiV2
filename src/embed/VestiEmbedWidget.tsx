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
import { MannequinViewer, type MannequinAnchorApi } from "../3d/MannequinViewer";

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
  hombros: "33%",
  pecho: "44%",
  cintura: "58%",
};

const lengthBarLayout: Record<string, { top: string; bottom: string }> = {
  largoTorso: { top: "32%", bottom: "42%" },
  largoPierna: { top: "58%", bottom: "10%" },
};

type ViewMode = "top" | "bottom" | "shoes";

type OverlayProps = {
  fit: FitResult;
  viewMode: ViewMode;
  footLength: number;
  anchorApi?: MannequinAnchorApi | null;
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


  const sizePx = anchorApi?.getSize?.() ?? null;
  const hPx = sizePx?.height ?? 0;

  const avgY = (a?: { y: number } | null, b?: { y: number } | null): number | null => {
    if (!a || !b) return null;
    const y = (a.y + b.y) / 2;
    return Number.isFinite(y) ? y : null;
  };

  const anchorYForZone = (zone: string): number | null => {
    if (!anchorApi) return null;

    // Prefer explicit VESTI locators when available
    if (zone === "hombros") {
      const L = anchorApi.getPoint("vesti_shoulderL");
      const R = anchorApi.getPoint("vesti_shoulderR");
      return avgY(L, R);
    }
    if (zone === "pecho") {
      return anchorApi.getPoint("Bone.010")?.y ?? null;
    }
    if (zone === "cintura") {
      return anchorApi.getPoint("Bone.002")?.y ?? null;
    }
    if (zone === "cadera") {
      return anchorApi.getPoint("Bone.001")?.y ?? null;
    }
    if (zone === "feet") {
      return anchorApi.getPoint("vesti_feet")?.y ?? null;
    }

    return null;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {widthZones.map((z) => {
        const y = anchorYForZone(z.zone);
        const top = y != null && hPx > 0 ? `${Math.max(0, y - hPx * 0.055 * 0.5)}px` : widthTopPercent[z.zone] ?? "45%";
        const barH = y != null && hPx > 0 ? `${Math.max(10, hPx * 0.055)}px` : "5.5%";
        const color = zoneColor(z.status);
        return (
          <div
            key={z.zone}
            style={{
              position: "absolute",
              left: "10%",
              right: "10%",
              top,
              height: barH,
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
        const layout = lengthBarLayout[lz.zone] ?? null;

        // If we have real anchors, compute top/bottom in px from bones/locators
        let topPx: number | null = null;
        let bottomPx: number | null = null;

        if (anchorApi && hPx > 0) {
          if (lz.zone === "largoTorso") {
            const yTop = anchorYForZone("pecho") ?? anchorYForZone("hombros");
            const yBottom = anchorYForZone("cintura");
            if (yTop != null && yBottom != null) {
              topPx = Math.min(yTop, yBottom);
              bottomPx = Math.max(yTop, yBottom);
            }
          } else if (lz.zone === "largoPierna") {
            const yTop = anchorYForZone("cadera") ?? anchorYForZone("cintura");
            const yBottom = anchorYForZone("feet");
            if (yTop != null && yBottom != null) {
              topPx = Math.min(yTop, yBottom);
              bottomPx = Math.max(yTop, yBottom);
            }
          }
        }

        // Clamp with safe padding so nothing touches the edges
        const pad = hPx > 0 ? Math.max(14, hPx * 0.025) : 18;
        if (topPx != null) topPx = Math.max(pad, topPx);
        if (bottomPx != null) bottomPx = Math.min(hPx - pad, bottomPx);

        // Fallback to old percentage layout if anchors aren't available
        if (!layout && (topPx == null || bottomPx == null)) return null;
        const color = zoneColor(lz.status);
        const shortLabel = lz.zone === "largoTorso" ? "Torso" : "Pierna";

        const chipTop =
          topPx != null && bottomPx != null
            ? `${Math.max(0, (topPx + bottomPx) / 2 - 14)}px`
            : lz.zone === "largoTorso"
            ? "24%"
            : lz.zone === "largoPierna"
            ? "76%"
            : `calc(${layout!.top} - 3%)`;

        return (
          <Fragment key={lz.zone}>
            <div
              style={{
                position: "absolute",
                top: topPx != null ? `${topPx}px` : layout!.top,
                bottom: bottomPx != null ? `${Math.max(0, hPx - bottomPx)}px` : layout!.bottom,
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
              bottom: "2%",
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
              bottom: "22%",
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

  const [mannequinGender, setMannequinGender] = useState<"M" | "F">("M");
  const [anchorApi, setAnchorApi] = useState<MannequinAnchorApi | null>(null);

  const fit = useMemo(() => computeFit(user, prenda), [user, prenda]);
  const fitUi = useMemo(() => normalizeFitForUi(fit), [fit]);

  const rec = useMemo(
    () =>
      makeRecommendation({
        category: categoria,
        garment: prenda,
        fit: fitUi,
      }),
    [categoria, prenda, fitUi]
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
      fit: fitUi,
      recommendation: rec,
      user,
      garment: prenda,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastPayloadRef.current) return;
    lastPayloadRef.current = serialized;
    onRecomendacion(payload);
  }, [fitUi, rec, user, prenda, onRecomendacion]);

  const handleChange =
    (field: keyof Measurements) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(String(e.target.value).replace(",", "."));
      setUser((prev) => ({ ...prev, [field]: isNaN(val) ? 0 : val }));
    };

  const handleFootChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(String(e.target.value).replace(",", "."));
    setFootLength(isNaN(val) ? 0 : val);
  };

  // UI recomendación (modo app/demo)
  const isOk = rec.tag === "OK";
  const isSizeUp = rec.tag === "SIZE_UP";
  const isSizeDown = rec.tag === "SIZE_DOWN";
  const isCheckLength = rec.tag === "CHECK_LENGTH";

  const relevantLengths =
    viewMode === "bottom"
      ? (fitUi?.lengths ?? []).filter((lz: any) => lz.zone === "largoPierna")
      : viewMode === "top"
      ? (fitUi?.lengths ?? []).filter((lz: any) => lz.zone === "largoTorso")
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
  const allWidths = (fitUi as any)?.widths ?? [];
  const allLengths = (fitUi as any)?.lengths ?? [];

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

  const shoeChip = viewMode === "shoes" ? shoeOverlayFromFit(fitUi, footLength) : null;
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

        <MannequinViewer variant={mannequinGender} onAnchorsReady={setAnchorApi} />
        <FitOverlay fit={fitUi} viewMode={viewMode} footLength={footLength} anchorApi={anchorApi} />
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
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Largo pierna (cm)</span>
                  <input
                    type="number"
                    value={Number.isFinite(user.largoPierna) ? user.largoPierna : ""}
                    onChange={handleChange("largoPierna")}
                    style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
                  />
                </label>
              )}
            </>
          )}

          {viewMode === "shoes" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>Largo de pie (cm)</span>
              <input
                type="number"
                value={Number.isFinite(footLength) ? footLength : ""}
                onChange={handleFootChange}
                style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}
              />
            </label>
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