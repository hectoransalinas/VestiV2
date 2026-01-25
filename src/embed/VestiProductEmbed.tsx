import React from "react";
import {
  Garment,
  GarmentCategory,
  Measurements,
  FitResult,
  makeRecommendation,
} from "../motor/fitEngine";
import { VestiEmbedWidget } from "./VestiEmbedWidget";

export type VestiProductEmbedProps = {
  garment?: Garment | null;
  category?: GarmentCategory;
  perfilInicial?: Measurements;
  onRecomendacion?: (data: {
    fit: FitResult;
    recommendation: ReturnType<typeof makeRecommendation>;
    user: Measurements;
    garment?: Garment | null;
    avatarUrl: string;
  }) => void;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * VestiProductEmbed
 * ------------------
 * Componente pensado como API estable para integrar Vesti AI
 * en fichas de producto reales. Envuelve al VestiEmbedWidget
 * y expone una interfaz simple basada en `garment` + callbacks.
 */
export const VestiProductEmbed: React.FC<VestiProductEmbedProps> = ({
  garment,
  category,
  perfilInicial,
  onRecomendacion,
  className,
  style,
}) => {

  // Guard: el producto todavía no llegó (postMessage) o viene vacío.
  if (!garment) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        Cargando producto…
      </div>
    );
  }

  const effectiveCategory: GarmentCategory =
    (category ?? garment?.category ?? "superiores") as GarmentCategory;

  return (
    <div className={className} style={style}>
      <VestiEmbedWidget
        categoria={effectiveCategory}
        prenda={garment}
        perfilInicial={perfilInicial}
        onRecomendacion={onRecomendacion}
      />
    </div>
  );
};