import React from "react";
import { vestiTheme } from "../theme";

type RecommendationTag = "OK" | "SIZE_UP" | "SIZE_DOWN" | "CHECK_LENGTH" | string;

type RecommendationCardProps = {
  tag: RecommendationTag;
  sizeLabel: string;
};

/**
 * RecommendationCard — Shopify Plus style
 *
 * Card limpia, fondo neutro y señal de estado en un chip.
 * Pensada para integrarse como bloque principal de recomendación de talle.
 */
export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  tag,
  sizeLabel,
}) => {
  const normalizedTag: RecommendationTag =
    tag === "OK" || tag === "SIZE_UP" || tag === "SIZE_DOWN" || tag === "CHECK_LENGTH"
      ? tag
      : "OK";

  const title = (() => {
    switch (normalizedTag) {
      case "OK":
        return `Calce recomendado · Talle ${sizeLabel}`;
      case "SIZE_UP":
        return `Revisá el calce · Talle actual ${sizeLabel}`;
      case "SIZE_DOWN":
        return `Calce holgado · Talle actual ${sizeLabel}`;
      case "CHECK_LENGTH":
        return `Revisá el largo · Talle ${sizeLabel}`;
      default:
        return `Calce estimado · Talle ${sizeLabel}`;
    }
  })();

  const pill = (() => {
    switch (normalizedTag) {
      case "OK":
        return {
          label: "Este talle se adapta muy bien a vos",
          bg: "rgba(34,197,94,0.06)",
          border: "rgba(34,197,94,0.35)",
          dot: vestiTheme.colors.success,
        };
      case "SIZE_UP":
        return {
          label: "Si buscás comodidad, probá un talle más",
          bg: "rgba(248,113,113,0.06)",
          border: "rgba(248,113,113,0.35)",
          dot: vestiTheme.colors.danger,
        };
      case "SIZE_DOWN":
        return {
          label: "Si te gusta al cuerpo, probá un talle menos",
          bg: "rgba(250,204,21,0.06)",
          border: "rgba(250,204,21,0.35)",
          dot: vestiTheme.colors.warn,
        };
      case "CHECK_LENGTH":
        return {
          label: "Chequeá el largo antes de comprar",
          bg: "rgba(59,130,246,0.06)",
          border: "rgba(59,130,246,0.35)",
          dot: vestiTheme.colors.accent,
        };
      default:
        return {
          label: "Usá tu preferencia de calce para decidir",
          bg: "rgba(148,163,184,0.08)",
          border: "rgba(148,163,184,0.45)",
          dot: "#64748b",
        };
    }
  })();

  const message = (() => {
    switch (normalizedTag) {
      case "OK":
        return "Este talle se adapta muy bien a tus medidas. Si buscás comodidad para el día a día, podés quedarte tranquilo con esta elección.";
      case "SIZE_UP":
        return "Vemos alguna zona al límite o más ajustada. Si priorizás libertad de movimiento, un talle más puede acompañarte mejor.";
      case "SIZE_DOWN":
        return "Detectamos algo de holgura en alguna zona. Si querés un calce más al cuerpo, puede servirte comparar con un talle menos.";
      case "CHECK_LENGTH":
        return "El largo puede sentirse distinto según tu altura y preferencia. Mirá el avatar y validá que el largo acompañe tu estilo.";
      default:
        return "Revisá las zonas clave en el avatar (hombros, pecho, cintura y largo) y elegí el talle que mejor acompañe tu forma de vestirte.";
    }
  })();

  return (
    <section
      style={{
        marginTop: 4,
        padding: 14,
        borderRadius: vestiTheme.radius.card,
        backgroundColor: vestiTheme.colors.bg,
        border: `1px solid ${vestiTheme.colors.border}`,
        boxShadow: vestiTheme.shadow.card,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 13.5,
            fontWeight: 700,
            color: vestiTheme.colors.text,
          }}
        >
          {title}
        </h3>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            backgroundColor: pill.bg,
            border: `1px solid ${pill.border}`,
            fontSize: 11,
            color: vestiTheme.colors.text,
            maxWidth: 220,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "999px",
              backgroundColor: pill.dot,
            }}
          />
          <span
            style={{
              lineHeight: 1.3,
            }}
          >
            {pill.label}
          </span>
        </div>
      </header>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: vestiTheme.colors.subtext,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
    </section>
  );
};
