// IMPORTANTE: Integrar theme.ts
// import { vestiTheme } from "../theme";
// -------------------------------
// Agregar wrappers de estilo Shopify Premium aquí
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Garment,
  GarmentCategory,
  Measurements,
  computeFit,
  makeRecommendation,
  FitResult,
} from "../motor/fitEngine";
import { AvatarViewer } from "../3d/AvatarViewer";

type VestiEmbedProps = {
  categoria: GarmentCategory;
  prenda: Garment;
  perfilInicial?: Measurements;
  onRecomendacion?: (data: {
    fit: FitResult;
    recommendation: ReturnType<typeof makeRecommendation>;
    user: Measurements;
    garment: Garment;
    avatarUrl: string;
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
    default:
      return "rgba(234, 179, 8, 0.45)"; // amarillo
  }
}

// Mapeo de zona -> posición vertical (porcentaje sobre alto del visor)
const widthTopPercent: Record<string, string> = {
  hombros: "33%", // un poco más abajo
  pecho: "44%",
  cintura: "58%",
};

const lengthBarLayout: Record<string, { top: string; bottom: string }> = {
  // Barra desde hombro aprox hasta cintura aprox
  largoTorso: { top: "32%", bottom: "42%" },
  // Barra de pierna: desde cadera / muslo alto hasta tobillo
  largoPierna: { top: "58%", bottom: "10%" },
};

type ViewMode = "top" | "bottom" | "shoes";

type OverlayProps = {
  fit: FitResult;
  viewMode: ViewMode;
  footLength: number;
};

// (SHOES) La lógica de talles se calcula con el motor (fitEngine). No usamos mapeos heurísticos.


const FitOverlay: React.FC<OverlayProps> = ({ fit, viewMode, footLength }) => {
  if (!fit && viewMode !== "shoes") return null;

  const isTopView = viewMode === "top";
  const isBottomView = viewMode === "bottom";
  const isShoesView = viewMode === "shoes";

  const widthZones = (fit?.widths ?? []).filter((z) => {
    if (isShoesView) return false;
    if (isBottomView) {
      return z.zone === "cintura" || z.zone === "cadera";
    }
    // Vista superior
    return z.zone === "hombros" || z.zone === "pecho" || z.zone === "cintura";
  });

  const rawLengths = fit?.lengths ?? [];
  let lengthZones: typeof rawLengths = [];

  if (isShoesView) {
    lengthZones = [];
  } else if (isBottomView) {
    const leg = rawLengths.find((lz) => lz.zone === "largoPierna");
    if (leg) {
      lengthZones = [leg];
    } else if (rawLengths.length) {
      const base = rawLengths[0];
      lengthZones = [{ ...base, zone: "largoPierna" } as typeof base];
    }
  } else {
    const torso = rawLengths.find((lz) => lz.zone === "largoTorso");
    if (torso) {
      lengthZones = [torso];
    }
  }

  const hasShoeOverlay = isShoesView;

  if (!widthZones.length && !lengthZones.length && !hasShoeOverlay) {
    return null;
  }

  const pie = (fit?.lengths ?? []).find((l) => l.zone === "pieLargo");
  const pieStatus = (pie?.status ?? "Perfecto") as any;
  const statusKey = pieStatus === "Corto" ? "Ajustado" : pieStatus === "Largo" ? "Holgado" : "Perfecto";
  const shoeFit = { label: statusKey, statusKey };
  const shoeColor = zoneColor(shoeFit.statusKey);
return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "block",
      }}
    >
      {/* Bandas horizontales de ancho */}
      {widthZones.map((z) => {
        const top = widthTopPercent[z.zone] ?? "45%";
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
              {z.zone.toUpperCase()}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: "#0f172a" }}>
              {z.status}
            </span>
          </div>
        );
      })}

      {/* Indicadores verticales de largo (torso / pierna) */}
      {lengthZones.map((lz) => {
        const layout = lengthBarLayout[lz.zone];
        if (!layout) return null;
        const color = zoneColor(lz.status);
        const shortLabel = lz.zone === "largoTorso" ? "Torso" : "Pierna";

        let chipTop: string;
        if (lz.zone === "largoTorso") {
          chipTop = "24%";
        } else if (lz.zone === "largoPierna") {
          chipTop = "76%";
        } else {
          chipTop = `calc(${layout.top} - 3%)`;
        }

        return (
          <React.Fragment key={lz.zone}>
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
                border: "1px solid #e5e7eb",
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
          </React.Fragment>
        );
      })}

      {/* Overlay específico para calzado */}
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
              border: "1px solid #e5e7eb",
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

// -------------------- Componente principal --------------------

export const VestiEmbedWidget: React.FC<VestiEmbedProps> = ({
  categoria,
  prenda,
  perfilInicial,
  onRecomendacion,
}) => {
  const [user, setUser] = useState<Measurements>(perfilInicial ?? defaultPerfil);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [showCreatorHelp, setShowCreatorHelp] = useState<boolean>(true);
  const [showZoneDetails, setShowZoneDetails] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if ((categoria as any) === "pantalon") return "bottom";
    if ((categoria as any) === "pants") return "bottom";
    if ((categoria as any) === "calzado" || (categoria as any) === "zapatilla")
      return "shoes";
    if ((categoria as any) === "shoes") return "shoes";
    return "top";
  });

  const lastPayloadRef = useRef<string | null>(null);
  const [footLength, setFootLength] = useState<number>(26);

  const fit = useMemo(() => computeFit(user, prenda), [user, prenda]);

  const rec = useMemo(
    () =>
      makeRecommendation({
        category: categoria,
        garment: prenda,
        fit,
      }),
    [categoria, prenda, fit]
  );

  // Suscribirse a eventos de ReadyPlayerMe
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!event.data) return;

      let data: any = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (data.source !== "readyplayerme") return;

      if (data.eventName === "v1.avatar.exported") {
        const url = data.data?.url;
        if (url && typeof url === "string") {
          setAvatarUrl(url);
          setShowCreatorHelp(false);
        }
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  // Enviar mensaje de suscripción al iframe cuando carga
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          target: "readyplayerme",
          type: "subscribe",
          eventName: "v1.avatar.exported",
        }),
        "*"
      );
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeRef]);

  // Auto-ajuste de alto cuando se usa dentro de un iframe embebido
  useEffect(() => {
    if (window.self === window.top) return;

    const sendHeight = () => {
      try {
        const doc = document;
        const height =
          doc.documentElement.scrollHeight || doc.body.scrollHeight || 0;

        window.parent.postMessage({ type: "vesti:resize", height }, "*");
      } catch {
        // ignorar
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

  // Notificar hacia afuera (tienda) cuando cambia algo relevante
  useEffect(() => {
    if (!onRecomendacion) return;

    const payload = {
      fit,
      recommendation: rec,
      user,
      garment: prenda,
      avatarUrl,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastPayloadRef.current) return;

    lastPayloadRef.current = serialized;
    onRecomendacion(payload);
  }, [fit, rec, user, prenda, avatarUrl, onRecomendacion]);

  const handleChange =
    (field: keyof Measurements) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(String(e.target.value).replace(",", "."));
      setUser((prev) => ({ ...prev, [field]: isNaN(val) ? 0 : val }));
    };

  const handleFootChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(String(e.target.value).replace(",", "."));
    setFootLength(isNaN(val) ? 0 : val);
  };

  const creandoAvatar = !avatarUrl;

  /* =========================================================
     REGLA PREMIUM DE ESTADO GLOBAL (SOLO UI, NO TOCA MOTOR)
     - Verde: OK y largo relevante Perfecto
     - Amarillo: CHECK_LENGTH o OK + largo no Perfecto
     - Rojo: SIZE_UP o SIZE_DOWN
  ========================================================= */

  const isOk = rec.tag === "OK";
  const isSizeUp = rec.tag === "SIZE_UP";
  const isSizeDown = rec.tag === "SIZE_DOWN";
  const isCheckLength = rec.tag === "CHECK_LENGTH";

  const relevantLengths =
    viewMode === "bottom"
      ? (fit?.lengths ?? []).filter((lz) => lz.zone === "largoPierna")
      : viewMode === "top"
      ? (fit?.lengths ?? []).filter((lz) => lz.zone === "largoTorso")
      : [];

  const hasLengthAlert = relevantLengths.some(
    (lz) => (lz?.status ?? "") !== "Perfecto"
  );

  const shouldWarn = isCheckLength || (isOk && hasLengthAlert);
  const isError = isSizeUp || isSizeDown;

  const recBg =
    isOk && !shouldWarn
      ? "#ecfdf3"
      : isError
      ? "#fef2f2"
      : shouldWarn
      ? "#fffbeb"
      : "#eff6ff";

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
      ? "Calce recomendado · Talle " + prenda.sizeLabel
      : isError
      ? "Revisá el calce · Talle actual " + prenda.sizeLabel
      : shouldWarn
      ? "Ojo con el largo · Talle " + prenda.sizeLabel
      : "Calce estimado · Talle " + prenda.sizeLabel;

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

  const computeRecommendedSizeLabel = (selectedLabel: string, tag: string): string => {
    if (tag !== "SIZE_UP" && tag !== "SIZE_DOWN") return selectedLabel;
    const dir = tag === "SIZE_UP" ? 1 : -1;

    // Numeric sizes (shoes, some pants)
    const n = Number(String(selectedLabel).replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(n) && String(n) !== "") {
      return String(n + dir);
    }

    // Alpha sizes (XS..4XL)
    const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
    const up = selectedLabel.trim().toUpperCase();
    const idx = order.indexOf(up);
    if (idx >= 0) {
      const next = Math.max(0, Math.min(order.length - 1, idx + dir));
      return order[next];
    }

    // Fallback: show relative suggestion
    return dir === 1 ? "un talle más" : "un talle menos";
  };

  const keyZonesLabel = (() => {
    if ((categoria as any) === "shoes") return "Zona clave: Largo del pie";
    if ((categoria as any) === "pants" || (categoria as any) === "pantalon") return "Zona clave: Cintura";
    return "Zonas clave: Pecho y hombros";
  })();
return (
  <div
    style={{
      width: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      borderRadius: 18,
      border: "1px solid #e5e7eb",
      background: "#ffffff",
      boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: "hidden",
      height: "85vh",
      display: "flex",
      flexDirection: "column",
    }}
  >
    {/* Header tipo guía de talles */}
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid #eef2f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>
          Guía de talles · Recomendación personalizada
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{keyZonesLabel}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            fontSize: 12,
            color: "#0f172a",
          }}
        >
          Producto: <b>{prenda?.titulo ?? "—"}</b>
        </span>
      </div>
    </div>

    {/* Body 2 columnas */}
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1.05fr 0.95fr",
        gap: 14,
        padding: 16,
        overflow: "hidden",
      }}
    >
      {/* Columna izquierda: recomendación */}
      <div style={{ overflow: "auto", paddingRight: 4 }}>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 16,
            background: "#ffffff",
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            Tu talle ideal
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5 }}>
              {computeRecommendedSizeLabel(prenda?.sizeLabel ?? "—", rec?.tag ?? "OK")}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#334155" }}>
                <b>Seleccionaste:</b> {prenda?.sizeLabel ?? "—"}
              </div>
              <div style={{ fontSize: 12, color: "#334155" }}>
                <b>Te recomendamos:</b>{" "}
                {computeRecommendedSizeLabel(prenda?.sizeLabel ?? "—", rec?.tag ?? "OK")}
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  width: "fit-content",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background:
                      fit.overall === "Perfecto"
                        ? "#22c55e"
                        : fit.overall === "Ajustado"
                        ? "#ef4444"
                        : "#f59e0b",
                  }}
                />
                <span style={{ fontSize: 12, color: "#0f172a" }}>
                  Calce: <b>{fit.overall}</b>
                </span>
              </div>
            </div>
          </div>

          {/* Resumen corto */}
          <div style={{ marginTop: 12, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            {rec?.tag === "OK"
              ? "Excelente. Este talle se adapta muy bien a vos para este producto."
              : rec?.tag === "SIZE_UP"
              ? "Se ve algo ajustado en la zona clave. Si querés comodidad, probá un talle más."
              : rec?.tag === "SIZE_DOWN"
              ? "Se ve algo holgado en la zona clave. Si te gusta al cuerpo, compará con un talle menos."
              : "Revisá el calce en el avatar y elegí según tu preferencia."}
          </div>

          {/* Detalle por zonas (opcional) */}
          <button
            type="button"
            onClick={() => setShowZoneDetails((v) => !v)}
            style={{
              marginTop: 12,
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 12,
              color: "#0f172a",
            }}
          >
            {showZoneDetails ? "Ocultar detalle por zonas" : "Ver detalle por zonas"}
          </button>

          {showZoneDetails && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(fit?.lengths ?? {}).map(([k, v]) => (
                <span
                  key={k}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 12,
                    color: "#0f172a",
                  }}
                >
                  {k}: <b>{v}</b>
                </span>
              ))}
              {Object.entries(fit?.zones ?? {}).map(([k, v]) => (
                <span
                  key={k}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 12,
                    color: "#0f172a",
                  }}
                >
                  {k}: <b>{v}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recomendación extendida (usa tu componente existente) */}
        <div style={{ marginTop: 10 }}>
          <RecommendationCard tag={rec?.tag ?? "OK"} sizeLabel={prenda?.sizeLabel ?? "—"} />
        </div>

        <div style={{ marginTop: 10, fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>
          Vesti AI es una herramienta de recomendación. El calce final puede variar según marca y preferencias personales.
        </div>
      </div>

      {/* Columna derecha: avatar + overlays */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#ffffff",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 360,
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid #eef2f7" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Vista previa</div>
        </div>

        <div style={{ flex: 1, position: "relative" }}>
          {avatarUrl ? (
            <>
              <AvatarViewer avatarUrl={avatarUrl} />
              <FitOverlay fit={fit} viewMode={viewMode} />
            </>
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                fontSize: 12,
                padding: 14,
                textAlign: "center",
              }}
            >
              Pegá una URL de avatar (ReadyPlayerMe .glb) para ver el calce visual.
            </div>
          )}

          {/* Chip de estado sobre el avatar */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 12,
              padding: "8px 12px",
              borderRadius: 999,
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 22px rgba(15,23,42,0.15)",
              fontSize: 12,
              color: "#0f172a",
            }}
          >
            Calce {((categoria as any) === "shoes") ? "calzado" : "estimado"}: <b>{fit.overall}</b>
          </div>
        </div>
      </div>
    </div>

    {/* Footer compacto: inputs */}
    <div
      style={{
        padding: 14,
        borderTop: "1px solid #eef2f7",
        background: "#fbfdff",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 10 }}>
        <Field
          label="URL avatar ReadyPlayerMe (.glb)"
          value={avatarUrl}
          onChange={(v) => setAvatarUrl(v)}
          placeholder="https://models.readyplayer.me/..."
        />

        {((categoria as any) === "shoes") && (
          <Field
            label="Largo pie (cm)"
            value={String(user.pieLargo ?? "")}
            onChange={(v) => handleChange("pieLargo", v)}
            type="number"
            step="0.1"
            placeholder="Ej: 26.7"
          />
        )}

        {((categoria as any) === "pants" || (categoria as any) === "pantalon") && (
          <Field
            label="Cintura (cm)"
            value={String(user.cintura ?? "")}
            onChange={(v) => handleChange("cintura", v)}
            type="number"
            step="0.1"
            placeholder="Ej: 86"
          />
        )}

        {((categoria as any) !== "pants" && (categoria as any) !== "pantalon" && (categoria as any) !== "shoes") && (
          <Field
            label="Pecho (cm)"
            value={String(user.pecho ?? "")}
            onChange={(v) => handleChange("pecho", v)}
            type="number"
            step="0.1"
            placeholder="Ej: 98"
          />
        )}
      </div>

      {/* Selfie como upgrade */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
          ¿Querés una recomendación aún más precisa? Creá tu avatar con una selfie (modo avanzado).
        </div>

        <button
          type="button"
          onClick={() => setShowCreatorHelp(true)}
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            cursor: "pointer",
            fontSize: 12,
            color: "#0f172a",
            fontWeight: 700,
          }}
        >
          Usar selfie (opcional)
        </button>
      </div>

      {showCreatorHelp && (
        <div
          style={{
            marginTop: 6,
            padding: 12,
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            fontSize: 12,
            color: "#334155",
            lineHeight: 1.5,
          }}
        >
          <b>Modo selfie (opcional):</b> podés integrar un flujo de creación automática de avatar para acelerar la personalización.
          Por ahora, pegá una URL de ReadyPlayerMe para ver el avatar.
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreatorHelp(false)}
              style={{
                borderRadius: 10,
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                cursor: "pointer",
                fontSize: 12,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);
  );
};

type FieldProps = {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const Field: React.FC<FieldProps> = ({ label, value, onChange }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      onChange={onChange}
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        padding: "6px 8px",
        fontSize: 12,
      }}
    />
  </label>
);
