import React from "react";
import { vestiTheme } from "../theme";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Card
 * ----
 * Contenedor visual base estilo Shopify Premium.
 * Se puede reutilizar en el widget y en integraciones futuras.
 */
export const Card: React.FC<CardProps> = ({ children, className, style }) => {
  return (
    <section
      className={className}
      style={{
        borderRadius: vestiTheme.radius.card,
        border: `1px solid ${vestiTheme.colors.border}`,
        backgroundColor: vestiTheme.colors.bg,
        boxShadow: vestiTheme.shadow.card,
        padding: 14,
        ...style,
      }}
    >
      {children}
    </section>
  );
};
