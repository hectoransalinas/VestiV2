// VestiEmbedWidget.tsx
// Layout "Guía de talles" (ancho, 2 columnas) usando el widget existente como base.
// - NO toca el motor.
// - Mantiene ReadyPlayerMe + Avatar + Overlays.
// - Respeta Upper / Pants / Shoes (solo UI/estructura).

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  pieLargo: 26,
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
  hombros: "33%",
  pecho: "44%",
  cintura: "58%",
  cadera: "62%",
};

const lengthBarLayout: Record<string, { top: string; bottom: string }> = {
  largoTorso: { top: "32%", bottom: "42%" },
  largoPierna: { top: "58%", bottom: "10%" },
};

type ViewMode = "top" | "bottom" | "shoes";

type OverlayProps = {
  fit: FitResult;
  viewMode: ViewMode;
};

const FitOverlay: React.FC<OverlayProps> = ({ fit, viewMode }) => {
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
  } else {
    const torso = rawLengths.find((lz) => lz.zone === "largoTorso");
    if (torso) lengthZones = [torso];
  }

  const pie = (fit?.lengths ?? []).find((l) => l.zone === "pieLargo");
  const pieStatus = (pie?.status ?? "Perfecto") as any;
  const statusKey =
    pieStatus === "Corto"
      ? "Ajustado"
      : pieStatus === "Largo"
      ? "Holgado"
      : "Perfecto";
  const shoeColor = zoneColor(statusKey);

  const hasShoeOverlay = isShoesView;

  if (!widthZones.length && !lengthZones.length && !hasShoeOverlay) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
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

      {/* Indicadores verticales de largo */}
      {lengthZones.map((lz) => {
        const layout = lengthBarLayout[lz.zone];
        if (!layout) return null;
        const color = zoneColor(lz.status);
        const shortLabel = lz.zone === "largoTorso" ? "Torso" : "Pierna";
        const chipTop =
          lz.zone === "largoTorso" ? "24%" : lz.zone === "largoPierna" ? "76%" : `calc(${layout.top} - 3%)`;

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
            <span>{statusKey}</span>
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const cat: any = categoria;
    if (cat === "pantalon" || cat === "pants") return "bottom";
    if (cat === "calzado" || cat === "zapatilla" || cat === "shoes") return "shoes";
    return "top";
  });

  const lastPayloadRef = useRef<string | null>(null);

  // Fit + recomendación (motor)
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

  // ReadyPlayerMe: escuchar avatar exportado
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

  // Suscripción al iframe cuando carga
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
      const raw = String(e.target.value).replace(",", ".");
      const val = Number(raw);
      setUser((prev) => ({ ...prev, [field]: Number.isFinite(val) ? val : (prev as any)[field] }));
    };

  const creandoAvatar = !avatarUrl;

  // ---- UI status (no toca motor) ----
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

  const hasLengthAlert = relevantLengths.some((lz) => (lz?.status ?? "") !== "Perfecto");

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

  // Copy de tarjeta principal (izquierda)
  const mainTitle =
    isOk && !shouldWarn
      ? "Tu talle ideal"
      : isError
      ? "Revisá el talle"
      : shouldWarn
      ? "Buen talle, ojo con el largo"
      : "Tu talle recomendado";

  const mainBody =
    isOk && !shouldWarn
      ? "Este talle se ve bien en general. Abajo podés ajustar tus datos si querés afinar el calce."
      : isSizeUp
      ? "Vemos alguna zona al límite o ajustada. Te conviene subir un talle para estar cómodo."
      : isSizeDown
      ? "Vemos holgura. Si te gusta más al cuerpo, compará con un talle menos."
      : shouldWarn
      ? "El talle se ve bien, pero el largo podría no ser ideal. Mirá la alerta antes de decidir."
      : "Revisá las zonas clave del calce antes de decidir tu talle final.";

  // Para shoes, mostramos también el status de largo pie como foco
  const pie = (fit?.lengths ?? []).find((l) => l.zone === "pieLargo");
  const pieStatus = (pie?.status ?? "Perfecto") as any;
  const shoeLabel = pieStatus === "Corto" ? "Ajustado" : pieStatus === "Largo" ? "Holgado" : "Perfecto";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        borderRadius: 18,
        padding: 18,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>
          Guía de talles · Recomendación personalizada
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
          Basado en tus medidas y este producto
        </div>
      </div>

      {/* Layout 2 columnas (en pantallas angostas se apila) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Izquierda: recomendación + inputs */}
        <div style={{ flex: "1 1 360px", minWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tarjeta principal */}
          <div style={{ padding: 14, borderRadius: 14, background: recBg, border: recBorder }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{mainTitle}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                  Seleccionaste: <strong>{prenda.sizeLabel}</strong>
                  {" · "}
                  Te recomendamos: <strong>{rec.sizeLabel}</strong>
                </div>
              </div>

              {viewMode === "shoes" && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: shoeLabel === "Perfecto" ? "#ecfdf3" : shoeLabel === "Ajustado" ? "#fef2f2" : "#fffbeb",
                    border:
                      shoeLabel === "Perfecto" ? "1px solid #bbf7d0" : shoeLabel === "Ajustado" ? "1px solid #fecACA" : "1px solid #fef3c7",
                    whiteSpace: "nowrap",
                  }}
                >
                  Largo: <strong>{shoeLabel}</strong>
                </span>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>{mainBody}</div>
          </div>

          {/* Inputs (compactos, por categoría) */}
          <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ajustá tus datos (si hace falta)</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: viewMode === "shoes" ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              {viewMode === "top" && (
                <>
                  <Field label="Hombros (cm)" value={user.hombros} onChange={handleChange("hombros")} />
                  <Field label="Pecho (cm)" value={user.pecho} onChange={handleChange("pecho")} />
                  <Field label="Cintura (cm)" value={user.cintura} onChange={handleChange("cintura")} />
                  <Field label="Largo torso (cm)" value={user.largoTorso} onChange={handleChange("largoTorso")} />
                </>
              )}

              {viewMode === "bottom" && (
                <>
                  <Field label="Cintura (cm)" value={user.cintura} onChange={handleChange("cintura")} />
                  <Field label="Largo pierna (cm)" value={user.largoPierna} onChange={handleChange("largoPierna")} />
                </>
              )}

              {viewMode === "shoes" && (
                <Field label="Largo pie (cm)" value={user.pieLargo ?? 26} onChange={handleChange("pieLargo")} />
              )}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                }}
              >
                Zonas clave:{" "}
                <strong>
                  {viewMode === "top" ? "pecho y hombros" : viewMode === "bottom" ? "cintura" : "largo del pie"}
                </strong>
              </span>

              {viewMode !== "shoes" && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  {viewMode === "top" ? "cintura y largo: informativo" : "largo pierna: warning"}
                </span>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            Vesti AI es una herramienta de recomendación. El calce final puede variar según marca y preferencias.
          </div>
        </div>

        {/* Derecha: avatar + overlays + creator */}
        <div style={{ flex: "1 1 360px", minWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              position: "relative",
              height: 560,
            }}
          >
            {avatarUrl ? (
              <>
                <AvatarViewer avatarUrl={avatarUrl} />
                <FitOverlay fit={fit} viewMode={viewMode} />
              </>
            ) : (
              <>
                <iframe
                  ref={iframeRef}
                  title="Creador de avatar ReadyPlayerMe"
                  src="https://readyplayer.me/avatar?frameApi"
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="camera *; microphone *; clipboard-write"
                />
                {showCreatorHelp && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(15,23,42,0.65)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 16,
                      zIndex: 10,
                    }}
                  >
                    <div
                      style={{
                        background: "#f9fafb",
                        borderRadius: 16,
                        padding: "12px 14px",
                        maxWidth: 520,
                        fontSize: 12,
                        color: "#0f172a",
                        boxShadow: "0 10px 25px rgba(15,23,42,0.35)",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Creá tu avatar rápido</div>
                      <ol style={{ margin: 0, paddingLeft: 18, marginBottom: 8 }}>
                        <li>Tocá el <strong>icono de persona con pincel</strong>.</li>
                        <li>Después tocá el <strong>icono de cámara</strong>.</li>
                        <li>Subí una selfie o sacá una foto.</li>
                      </ol>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCreatorHelp(false);
                        }}
                        style={{
                          borderRadius: 999,
                          border: "none",
                          padding: "6px 10px",
                          fontSize: 12,
                          background: "#111827",
                          color: "#f9fafb",
                          cursor: "pointer",
                        }}
                      >
                        Entendido
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* URL manual */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>URL avatar ReadyPlayerMe (.glb)</span>
            <input
              type="text"
              placeholder="Pegá o ajustá la URL .glb de tu avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              style={{
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "8px 10px",
                fontSize: 12,
              }}
            />
          </div>

          {/* Selector solo demo (si querés ocultarlo en tienda real, lo sacamos) */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["top", "Superiores"],
              ["bottom", "Pantalón"],
              ["shoes", "Calzado"],
            ] as [ViewMode, string][]).map(([mode, label]) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    flex: "1 1 auto",
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: active ? "#e0f2fe" : "#f9fafb",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: active ? 700 : 600,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

type FieldProps = {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const Field: React.FC<FieldProps> = ({ label, value, onChange }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      onChange={onChange}
      style={{
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        padding: "8px 10px",
        fontSize: 13,
      }}
    />
  </label>
);
