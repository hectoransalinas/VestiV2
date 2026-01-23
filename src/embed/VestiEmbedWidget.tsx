// VESTI SIZE GUIDE – FINAL
// Este archivo reemplaza por completo el widget viejo.
// Modal ancho tipo guía de talles (estilo Adidas).

import React, { useMemo, useState } from "react";
import {
  Garment,
  GarmentCategory,
  Measurements,
  computeFit,
  makeRecommendation,
} from "../motor/fitEngine";
import { AvatarViewer } from "../3d/AvatarViewer";

type Props = {
  categoria: GarmentCategory;
  prenda: Garment;
};

const defaultPerfil: Measurements = {
  hombros: 44,
  pecho: 96,
  cintura: 82,
  largoTorso: 52,
  largoPierna: 102,
  pieLargo: 26,
};

export const VestiEmbedWidget: React.FC<Props> = ({ categoria, prenda }) => {
  const [user, setUser] = useState<Measurements>(defaultPerfil);

  const fit = useMemo(() => computeFit(user, prenda), [user, prenda]);
  const rec = useMemo(
    () => makeRecommendation({ category: categoria, garment: prenda, fit }),
    [categoria, prenda, fit]
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1100,
        margin: "0 auto",
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Guía de talles · Recomendación personalizada</h2>
        <p style={{ margin: 0, color: "#6b7280" }}>
          Basado en tus medidas y este producto
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div>
          <h3>Tu talle ideal</h3>
          <div style={{ fontSize: 48, fontWeight: 800 }}>
            {rec.sizeLabel}
          </div>
          <p style={{ color: "#374151" }}>
            Este es el talle que mejor se ajusta a vos para este producto.
          </p>
        </div>

        <div
          style={{
            height: 420,
            background: "#f9fafb",
            borderRadius: 16,
          }}
        >
          <AvatarViewer />
        </div>
      </div>
    </div>
  );
};
