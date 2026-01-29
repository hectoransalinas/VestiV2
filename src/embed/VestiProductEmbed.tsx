import type { CSSProperties } from "react";
import {
  Garment,
  GarmentCategory,
  Measurements,
  FitResult,
  makeRecommendation,
} from "../motor/fitEngine";
import { VestiEmbedWidget } from "./VestiEmbedWidget";

export type VestiProductEmbedProps = {
  garment?: Garment;
  category?: GarmentCategory;
  perfilInicial?: Measurements;
  onRecomendacion?: (data: {
    fit: FitResult;
    recommendation: ReturnType<typeof makeRecommendation>;
    user: Measurements;
    avatarUrl: string;
  }) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * VestiProductEmbed
 * ------------------
 * Componente pensado como API estable para integrar Vesti AI
 * en fichas de producto reales. Envuelve al VestiEmbedWidget
 * y expone una interfaz simple basada en `garment` + callbacks.
 */
export function VestiProductEmbed({
  garment,
  category,
  perfilInicial,
  onRecomendacion,
  className,
  style,
}: VestiProductEmbedProps) {
    // Si todavía no llegó el producto (por postMessage), evitamos crashear.
  if (!garment) {
    return (
      <div className={className} style={style}>
        <div style={{ padding: 16, textAlign: "center", color: "#666" }}>
          Cargando producto…
        </div>
      </div>
    );
  }

  const effectiveCategory: GarmentCategory =
    (category ?? garment.category ?? ("upper" as GarmentCategory)) as GarmentCategory;

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
}
