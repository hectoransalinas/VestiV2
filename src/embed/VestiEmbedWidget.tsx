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

/* ===================== TIPOS ===================== */

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

/* ===================== HELPERS VISUALES ===================== */

function zoneColor(status: string): string {
  switch (status) {
    case "Perfecto":
      return "rgba(22,163,74,0.45)";
    case "Justo":
    case "Ajustado":
      return "rgba(220,38,38,0.45)";
    default:
      return "rgba(234,179,8,0.45)";
  }
}

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

/* ===================== OVERLAY ===================== */

const FitOverlay: React.FC<{
  fit: FitResult;
  viewMode: ViewMode;
}> = ({ fit, viewMode }) => {
  if (!fit) return null;

  const widths =
    viewMode === "bottom"
      ? fit.widths.filter((z) => ["cintura", "cadera"].includes(z.zone))
      : fit.widths.filter((z) =>
          ["hombros", "pecho", "cintura"].includes(z.zone)
        );

  const lengths =
    viewMode === "bottom"
      ? fit.lengths.filter((l) => l.zone === "largoPierna")
      : fit.lengths.filter((l) => l.zone === "largoTorso");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {widths.map((z) => (
        <div
          key={z.zone}
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: widthTopPercent[z.zone] ?? "45%",
            height: "5%",
            borderRadius: 999,
            background: zoneColor(z.status),
            display: "flex",
            justifyContent: "space-between",
            padding: "0 8px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span>{z.zone.toUpperCase()}</span>
          <span>{z.status}</span>
        </div>
      ))}

      {lengths.map((l) => {
        const layout = lengthBarLayout[l.zone];
        if (!layout) return null;

        return (
          <div
            key={l.zone}
            style={{
              position: "absolute",
              top: layout.top,
              bottom: layout.bottom,
              right: "6%",
              width: "3%",
              borderRadius: 999,
              background: zoneColor(l.status),
            }}
          />
        );
      })}
    </div>
  );
};

/* ===================== COMPONENTE PRINCIPAL ===================== */

export const VestiEmbedWidget: React.FC<VestiEmbedProps> = ({
  categoria,
  prenda,
  perfilInicial,
  onRecomendacion,
}) => {
  const [user, setUser] = useState<Measurements>(
    perfilInicial ?? defaultPerfil
  );
  const [avatarUrl, setAvatarUrl] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const viewMode: ViewMode =
    categoria === "pants" ? "bottom" : "top";

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

  /* ===================== REGLA GLOBAL DE COLOR ===================== */

  const relevantLengths =
    viewMode === "bottom"
      ? fit.lengths.filter((l) => l.zone === "largoPierna")
      : fit.lengths.filter((l) => l.zone === "largoTorso");

  const hasLengthAlert = relevantLengths.some(
    (l) => l.status !== "Perfecto"
  );

  const isOk = rec.tag === "OK";
  const isError = rec.tag === "SIZE_UP" || rec.tag === "SIZE_DOWN";

  const isGreen = isOk && !hasLengthAlert;
  const isYellow = isOk && hasLengthAlert;

  const recBg = isGreen
    ? "#ecfdf3"
    : isYellow
    ? "#fffbeb"
    : isError
    ? "#fef2f2"
    : "#eff6ff";

  const recBorder = isGreen
    ? "1px solid #bbf7d0"
    : isYellow
    ? "1px solid #fef3c7"
    : isError
    ? "1px solid #fecaca"
    : "1px solid #bfdbfe";

  const recTitle = isGreen
    ? `Calce recomendado · Talle ${prenda.sizeLabel}`
    : isYellow
    ? `Ojo con el largo · Talle ${prenda.sizeLabel}`
    : isError
    ? `Revisá el calce · Talle ${prenda.sizeLabel}`
    : `Calce estimado · Talle ${prenda.sizeLabel}`;

  const recBody = isGreen
    ? "Este talle se ve bien en general para tus medidas."
    : isYellow
    ? "El talle es correcto, pero el largo podría no ser ideal. Revisá la alerta antes de comprar."
    : isError
    ? "Vemos un posible problema de calce. Compará con otro talle antes de decidir."
    : "Revisá las zonas clave del calce.";

  /* ===================== RENDER ===================== */

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>
      <div
        style={{
          aspectRatio: "9 / 16",
          background: "#f9fafb",
          borderRadius: 16,
          position: "relative",
        }}
      >
        {avatarUrl ? (
          <>
            <AvatarViewer avatarUrl={avatarUrl} />
            <FitOverlay fit={fit} viewMode={viewMode} />
          </>
        ) : (
          <iframe
            ref={iframeRef}
            title="ReadyPlayerMe"
            src="https://readyplayer.me/avatar?frameApi"
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="camera *; microphone *"
          />
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          background: recBg,
          border: recBorder,
        }}
      >
        <div style={{ fontWeight: 600 }}>{recTitle}</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>{recBody}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Cintura</label>
        <input
          type="number"
          value={user.cintura}
          onChange={(e) =>
            setUser({ ...user, cintura: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label>Largo pierna</label>
        <input
          type="number"
          value={user.largoPierna}
          onChange={(e) =>
            setUser({ ...user, largoPierna: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
};
