// Tarararara IMPORTANTE: Integrar theme.ts
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

// Mapear largo de pie en cm -> talle EU aproximado (36–45)
function mapFootToEuSize(lenCm: number): number | null {
  if (!Number.isFinite(lenCm) || lenCm <= 0) return null;

  // Rango orientativo, luego se puede ajustar por marca
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

// Heurística de calce de calzado en función del largo de pie.
function shoeFitFromFootLength(lenCm: number): {
  label: string;
  statusKey: "Perfecto" | "Ajustado" | "Holgado";
} {
  if (!Number.isFinite(lenCm) || lenCm <= 0) {
    return { label: "Sin datos", statusKey: "Holgado" };
  }

  const eu = mapFootToEuSize(lenCm);

  let statusKey: "Perfecto" | "Ajustado" | "Holgado";
  if (lenCm < 23) {
    statusKey = "Ajustado";
  } else if (lenCm > 27.5) {
    statusKey = "Holgado";
  } else {
    statusKey = "Perfecto";
  }

  const statusText =
    statusKey === "Perfecto"
      ? "Perfecto"
      : statusKey === "Ajustado"
      ? "Corto"
      : "Largo";

  if (!eu) {
    return { label: statusText, statusKey };
  }

  return {
    label: `${eu} (${statusText})`,
    statusKey,
  };
}

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

  const shoeFit = shoeFitFromFootLength(footLength);
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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        borderRadius: 16,
        padding: 16,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Paso a paso arriba */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: creandoAvatar ? "#eef2ff" : "#f9fafb",
          }}
        >
          1 · Creá tu avatar (subí una selfie)
        </span>
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: !creandoAvatar ? "#ecfdf3" : "#f9fafb",
          }}
        >
          2 · Visualizá el calce recomendado
        </span>
      </div>

      {/* Selector de tipo de prenda (solo UI del widget/demo) */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 4,
          fontSize: 11,
        }}
      >
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

      {/* Panel principal 3D / Creador embebido */}
      <div
        style={{
          width: "100%",
          aspectRatio: "9 / 16",
          borderRadius: 16,
          overflow: "hidden",
          background: "#f9fafb",
          marginBottom: 8,
          position: "relative",
        }}
      >
        {avatarUrl ? (
          <>
            <AvatarViewer avatarUrl={avatarUrl} />
            <FitOverlay fit={fit} viewMode={viewMode} footLength={footLength} />
          </>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              title="Creador de avatar ReadyPlayerMe"
              src="https://readyplayer.me/avatar?frameApi"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
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
                    maxWidth: "90%",
                    fontSize: 12,
                    color: "#0f172a",
                    boxShadow: "0 10px 25px rgba(15,23,42,0.35)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    Cómo crear tu avatar en 3 pasos
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      marginBottom: 8,
                    }}
                  >
                    <li>
                      Tocá el{" "}
                      <strong>icono de la persona con pincel</strong> en la barra
                      inferior.
                    </li>
                    <li>
                      Luego tocá el <strong>icono de cámara</strong>.
                    </li>
                    <li>
                      Elegí si querés tomarte una foto o subir una selfie. Cuando
                      termine, tu avatar se va a mostrar automáticamente acá.
                    </li>
                  </ol>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreatorHelp(false);
                    }}
                    style={{
                      marginTop: 4,
                      borderRadius: 999,
                      border: "none",
                      padding: "6px 10px",
                      fontSize: 12,
                      background: "#4f46e5",
                      color: "#f9fafb",
                      cursor: "pointer",
                    }}
                  >
                    Entendido, quiero crear mi avatar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Campo opcional para pegar o editar la URL manualmente */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          URL avatar ReadyPlayerMe (.glb)
        </span>
        <input
          type="text"
          placeholder="Pegá o ajustá la URL .glb de tu avatar"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          style={{
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            padding: "6px 8px",
            fontSize: 12,
          }}
        />
      </div>

      {/* Medidas rápidas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: viewMode === "shoes" ? "1fr" : "1fr 1fr",
          gap: 8,
          fontSize: 12,
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
          <Field label="Largo pie (cm)" value={footLength} onChange={handleFootChange} />
        )}
      </div>

      {/* Tarjeta de recomendación */}
      {viewMode === "shoes" ? (
        (() => {
          const shoe = shoeFitFromFootLength(footLength);
          const euSize = mapFootToEuSize(footLength);
          const bg =
            shoe.statusKey === "Perfecto"
              ? "#ecfdf3"
              : shoe.statusKey === "Ajustado"
              ? "#fef2f2"
              : "#fffbeb";
          const border =
            shoe.statusKey === "Perfecto"
              ? "1px solid #bbf7d0"
              : shoe.statusKey === "Ajustado"
              ? "1px solid #fecACA"
              : "1px solid #fef3c7";

          return (
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 12,
                background: bg,
                border,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Calzado recomendado · Talle {euSize ?? "—"}
              </div>
              <div style={{ fontSize: 12, color: "#4b5563" }}>
                {shoe.statusKey === "Perfecto"
                  ? "Este talle es ideal para tu largo de pie. Si preferís un calce más holgado, podés probar medio número más."
                  : shoe.statusKey === "Ajustado"
                  ? "Este talle puede quedarte algo justo de largo. Si te gusta el calce relajado, te conviene un número más."
                  : "Este talle puede quedarte algo largo. Si querés un calce más ajustado, probá un número menos."}
              </div>
            </div>
          );
        })()
      ) : (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            borderRadius: 12,
            background: recBg,
            border: recBorder,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {recTitle}
          </div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>{recBody}</div>
        </div>
      )}

      {/* Vista rápida por zonas */}
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {(() => {
          const allWidths = fit?.widths ?? [];
          const allLengths = fit?.lengths ?? [];

          let widthBadges = allWidths;
          let lengthBadges = allLengths;

          if (viewMode === "top") {
            widthBadges = allWidths.filter((z) =>
              ["hombros", "pecho", "cintura"].includes(z.zone)
            );
            lengthBadges = allLengths.filter((lz) => lz.zone === "largoTorso");
          } else if (viewMode === "bottom") {
            widthBadges = allWidths.filter((z) =>
              ["cintura", "cadera"].includes(z.zone)
            );
            const leg = allLengths.find((lz) => lz.zone === "largoPierna");
            if (leg) {
              lengthBadges = [leg];
            } else if (allLengths.length) {
              const base = allLengths[0];
              lengthBadges = [{ ...base, zone: "largoPierna" } as typeof base];
            } else {
              lengthBadges = [];
            }
          } else if (viewMode === "shoes") {
            widthBadges = [];
            lengthBadges = [];
          }

          return (
            <>
              {widthBadges.map((z) => (
                <span
                  key={z.zone}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    backgroundColor: "#f9fafb",
                    border: `1px solid ${z.color}`,
                  }}
                >
                  {z.zone}: {z.status}
                </span>
              ))}
              {lengthBadges.map((lz) => (
                <span
                  key={lz.zone}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {lz.zone === "largoTorso"
                    ? "largo torso"
                    : lz.zone === "largoPierna"
                    ? "largo pierna"
                    : lz.zone}
                  : {lz.status}
                </span>
              ))}
              {viewMode === "shoes" && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  largo pie: {shoeFitFromFootLength(footLength).label}
                </span>
              )}
            </>
          );
        })()}
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
