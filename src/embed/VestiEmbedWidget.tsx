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
  const [showMedidas, setShowMedidas] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // En producción, la categoría siempre viene del producto (Shopify).
  // Así que NO usamos selector de categoría. Solo derivamos el modo de vista.
  const viewMode: ViewMode = (() => {
    const cat: any = categoria;
    if (cat === "pantalon" || cat === "pants") return "bottom";
    if (cat === "calzado" || cat === "zapatilla" || cat === "shoes") return "shoes";
    return "top";
  })();

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
  // -------------------- Copys "guía de talles" (solo UI) --------------------
  const recSizeLabel =
    (rec as any)?.sizeLabel ||
    (rec as any)?.recommendedSize ||
    (rec as any)?.size ||
    "";

  // Título corto según tag
  const recTitle =
    rec.tag === "OK"
      ? "Calce estimado"
      : rec.tag === "SIZE_UP"
      ? "Te conviene subir un talle"
      : rec.tag === "SIZE_DOWN"
      ? "Te conviene bajar un talle"
      : "Revisá el calce";

  // Punto de color para el badge
  const recDot =
    isOk && !shouldWarn ? "#16a34a" : isError ? "#ef4444" : "#eab308";

  // Mensaje principal (corto, sin humo)
  const recBody = (() => {
    if (viewMode === "shoes") {
      if (rec.tag === "OK") return "Con el talle seleccionado, el calzado se ve bien de largo.";
      if (rec.tag === "SIZE_UP") return "Se ve justo de largo. Para estar cómodo, conviene subir un número.";
      if (rec.tag === "SIZE_DOWN") return "Se ve holgado de largo. Si lo preferís más justo, probá bajar un número.";
      return "Revisá el calce de largo antes de comprar.";
    }

    if (viewMode === "bottom") {
      if (rec.tag === "OK") return "Con el talle seleccionado, la cintura se ve bien.";
      if (rec.tag === "SIZE_UP") return "La cintura se ve ajustada. Te conviene subir un talle.";
      if (rec.tag === "SIZE_DOWN") return "La cintura se ve holgada. Si lo preferís más al cuerpo, bajá un talle.";
      return "Revisá la cintura y el largo de pierna antes de comprar.";
    }

    // top
    if (rec.tag === "OK") return "Con el talle seleccionado, el calce se ve bien en las zonas clave.";
    if (rec.tag === "SIZE_UP") return "Vemos alguna zona al límite o ajustada. Te conviene subir un talle para estar cómodo.";
    if (rec.tag === "SIZE_DOWN") return "Vemos holgura marcada. Si lo preferís más al cuerpo, bajá un talle.";
    return "Revisá el calce en hombros y pecho antes de comprar.";
  })();

  // Meta opcional (solo cuando hay warning de largo)
  const recMeta =
    shouldWarn && viewMode !== "shoes"
      ? "Ojo con el largo: puede requerir revisar antes de comprar."
      : "";

  // Chips simples (zonas clave + informativas)
  const chips = (() => {
    const arr: string[] = [];
    if (viewMode === "shoes") {
      const z = (fit?.widths ?? []).find((w) => w.zone === "pieLargo");
      if (z) arr.push(`pie: ${z.status}`);
      return arr;
    }

    if (viewMode === "bottom") {
      const w = (fit?.widths ?? []).find((x) => x.zone === "cintura");
      if (w) arr.push(`cintura: ${w.status}`);
      const l = (fit?.lengths ?? []).find((x) => x.zone === "largoPierna");
      if (l && l.status !== "Perfecto") arr.push(`pierna: ${l.status}`);
      return arr;
    }

    // top
    const hombros = (fit?.widths ?? []).find((x) => x.zone === "hombros");
    const pecho = (fit?.widths ?? []).find((x) => x.zone === "pecho");
    const cintura = (fit?.widths ?? []).find((x) => x.zone === "cintura");
    const torso = (fit?.lengths ?? []).find((x) => x.zone === "largoTorso");

    if (pecho) arr.push(`pecho: ${pecho.status}`);
    if (hombros) arr.push(`hombros: ${hombros.status}`);
    if (cintura) arr.push(`cintura: ${cintura.status} (info)`);
    if (torso && torso.status !== "Perfecto") arr.push(`torso: ${torso.status}`);
    return arr;
  })();

  const fieldsToShow = (() => {
    if (viewMode === "shoes") {
      return [
        { key: "pieLargo", label: "Largo pie (cm)", placeholder: "Ej: 26.5" },
      ];
    }
    if (viewMode === "bottom") {
      return [
        { key: "cintura", label: "Cintura (cm)", placeholder: "Ej: 84" },
        { key: "largoPierna", label: "Largo pierna (cm)", placeholder: "Ej: 104" },
      ];
    }
    return [
      { key: "hombros", label: "Hombros (cm)", placeholder: "Ej: 44" },
      { key: "pecho", label: "Pecho (cm)", placeholder: "Ej: 100" },
      { key: "cintura", label: "Cintura (cm)", placeholder: "Ej: 84" },
      { key: "largoTorso", label: "Largo torso (cm)", placeholder: "Ej: 52" },
    ];
  })();


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
    <div className="vestiSG-root">
      <style>{`
        .vestiSG-root{
          width:100%;
          max-width:1120px;
          margin:0 auto;
          padding:18px;
          box-sizing:border-box;
          font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
          color:#0f172a;
        }
        .vestiSG-header{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom:14px;
        }
        .vestiSG-title{
          margin:0;
          font-size:22px;
          line-height:1.15;
          font-weight:800;
          letter-spacing:-0.01em;
        }
        .vestiSG-sub{
          margin:6px 0 0 0;
          color:#64748b;
          font-size:13px;
        }

        .vestiSG-grid{
          display:grid;
          grid-template-columns: 1fr 520px;
          gap:16px;
          align-items:start;
        }

        .vestiSG-card{
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:16px;
          padding:14px;
          box-shadow: 0 10px 25px rgba(15,23,42,0.08);
        }

        .vestiSG-hero{
          border-radius:16px;
          border: 1px solid rgba(15,23,42,0.10);
          padding:14px;
        }

        .vestiSG-heroTop{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:8px;
        }
        .vestiSG-badge{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:6px 10px;
          border-radius:999px;
          font-size:12px;
          font-weight:700;
          border:1px solid rgba(15,23,42,0.10);
          background: rgba(15,23,42,0.03);
          white-space:nowrap;
        }
        .vestiSG-dot{
          width:9px;
          height:9px;
          border-radius:999px;
          display:inline-block;
        }
        .vestiSG-heroMsg{
          margin:0;
          color:#0f172a;
          font-size:13px;
          line-height:1.35;
        }
        .vestiSG-heroMeta{
          margin:8px 0 0 0;
          color:#334155;
          font-size:12px;
        }

        .vestiSG-accordionBtn{
          width:100%;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:14px;
          padding:12px 12px;
          cursor:pointer;
          font-weight:700;
          font-size:13px;
          color:#0f172a;
        }
        .vestiSG-accordionBody{
          margin-top:10px;
          border:1px solid #e5e7eb;
          border-radius:14px;
          padding:12px;
          background:#fff;
        }

        .vestiSG-formGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:10px;
        }

        .vestiSG-field label{
          display:block;
          font-size:11px;
          color:#64748b;
          margin:0 0 4px 2px;
          font-weight:600;
        }
        .vestiSG-field input{
          width:100%;
          padding:10px 10px;
          border-radius:12px;
          border:1px solid #e5e7eb;
          font-size:14px;
          outline:none;
        }

        .vestiSG-chipRow{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:10px;
        }
        .vestiSG-chip{
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:6px 10px;
          border-radius:999px;
          background:#f8fafc;
          border:1px solid #e5e7eb;
          font-size:12px;
          color:#0f172a;
          font-weight:600;
        }

        .vestiSG-rightSticky{
          position:sticky;
          top:14px;
        }
        .vestiSG-view{
          width:100%;
          height: 680px;
          border-radius:18px;
          overflow:hidden;
          background:#f8fafc;
          border:1px solid #e5e7eb;
          position:relative;
        }

        .vestiSG-footer{
          margin-top:12px;
          color:#94a3b8;
          font-size:11px;
          line-height:1.35;
        }

        @media (max-width: 980px){
          .vestiSG-grid{
            grid-template-columns: 1fr;
          }
          .vestiSG-rightSticky{
            position:relative;
            top:auto;
          }
          .vestiSG-view{
            height: 540px;
          }
        }
      `}</style>

      <div className="vestiSG-header">
        <div>
          <h2 className="vestiSG-title">Guía de talles · Recomendación personalizada</h2>
          <p className="vestiSG-sub">Basado en tus medidas y este producto.</p>
        </div>
      </div>

      <div className="vestiSG-grid">
        {/* IZQUIERDA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* HERO */}
          <div className="vestiSG-hero" style={{ background: recBg, border: recBorder }}>
            <div className="vestiSG-heroTop">
              <div className="vestiSG-badge">
                <span className="vestiSG-dot" style={{ background: recDot }} />
                {recTitle}
              </div>

              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {recSizeLabel}
              </div>
            </div>

            <p className="vestiSG-heroMsg">{recBody}</p>

            {recMeta && <p className="vestiSG-heroMeta">{recMeta}</p>}

            <div className="vestiSG-chipRow">
              {chips.map((c) => (
                <span key={c} className="vestiSG-chip">{c}</span>
              ))}
            </div>
          </div>

          {/* ACORDEÓN MEDIDAS */}
          <button
            type="button"
            className="vestiSG-accordionBtn"
            onClick={() => setShowMedidas((v) => !v)}
          >
            <span>Ajustá tus medidas (si hace falta)</span>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{showMedidas ? "▲" : "▼"}</span>
          </button>

          {showMedidas && (
            <div className="vestiSG-accordionBody">
              <div className="vestiSG-formGrid">
                {fieldsToShow.map((f) => (
                  <div className="vestiSG-field" key={f.key}>
                    <label>{f.label}</label>
                    <input
                      inputMode="decimal"
                      value={(user as any)[f.key] ?? ""}
                      onChange={handleChange(f.key as any)}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>

              {/* Avanzado: URL glb manual */}
              <div style={{ marginTop: 12 }}>
                <div className="vestiSG-field">
                  <label>URL avatar ReadyPlayerMe (.glb) (opcional)</label>
                  <input
                    value={avatarUrl}
                    onChange={(e) => {
                      const v = e.target.value || "";
                      setAvatarUrl(v);
                      if (v.trim().length > 0) setShowCreatorHelp(false);
                    }}
                    placeholder="Pegá una URL .glb si ya tenés un avatar"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="vestiSG-footer">
            Vesti AI es una herramienta de recomendación. El calce final puede variar según marca y preferencias.
          </div>
        </div>

        {/* DERECHA */}
        <div className="vestiSG-rightSticky">
          <div className="vestiSG-view">
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
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="camera *; microphone *; clipboard-write"
                />

                {showCreatorHelp && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(15,23,42,0.55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 16,
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: 520,
                        background: "rgba(255,255,255,0.95)",
                        borderRadius: 14,
                        padding: 14,
                        border: "1px solid rgba(15,23,42,0.12)",
                        boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>
                        Creá tu avatar (rápido)
                      </div>
                      <div style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.35 }}>
                        Usá una selfie en el creador para generar tu avatar. Cuando se exporte,
                        Vesti lo toma automáticamente.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
