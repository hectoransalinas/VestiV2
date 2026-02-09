/* ProductPageVestiDemo.tsx
 * Vesti – Pants with Hip (Cadera) Contract
 * Single source of truth for Pants zones
 */

import React, { useMemo, useState } from "react";
import VestiProductEmbed from "./VestiProductEmbed";
import RecommendationCard from "./RecommendationCard";
import { runFitEngine } from "./fitEngine";

export const PANTS_ZONES = {
  cintura: { decisive: true, overlay: true },
  cadera: { decisive: false, overlay: true, warning: true },
  largoPierna: { decisive: false, overlay: true },
};

export default function ProductPageVestiDemo({ productFromShopify }: any) {
  const category = String(productFromShopify?.category || "").toLowerCase();

  const [perfil, setPerfil] = useState<any>({
    cintura: "",
    cadera: "",
    largoPierna: "",
  });

  const garments = useMemo(() => {
    if (!productFromShopify?.variants) return [];
    return productFromShopify.variants.map((v: any) => ({
      id: v.id,
      sizeLabel: v.sizeLabel,
      easePreset: v.easePreset ?? "regular",
      stretchPct: v.stretchPct ?? 0,
      measures: {
        cintura: v.measures?.cintura ?? 0,
        cadera: v.measures?.cadera ?? 0,
        largoPierna: v.measures?.largoPierna ?? 0,
      },
    }));
  }, [productFromShopify]);

  const fitResult = useMemo(() => {
    if (category !== "pants") return null;

    return runFitEngine({
      category: "pants",
      user: {
        cintura: Number(perfil.cintura) || 0,
        cadera: Number(perfil.cadera) || 0,
        largoPierna: Number(perfil.largoPierna) || 0,
      },
      garments,
      zones: Object.keys(PANTS_ZONES),
    });
  }, [category, perfil, garments]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 24 }}>
      <div>
        {category === "pants" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              Cintura (cm)
              <input
                type="number"
                value={perfil.cintura}
                onChange={(e) => setPerfil({ ...perfil, cintura: e.target.value })}
              />
            </label>

            <label>
              Cadera (cm)
              <input
                type="number"
                value={perfil.cadera}
                onChange={(e) => setPerfil({ ...perfil, cadera: e.target.value })}
              />
            </label>

            <label>
              Largo pierna (cm)
              <input
                type="number"
                value={perfil.largoPierna}
                onChange={(e) =>
                  setPerfil({ ...perfil, largoPierna: e.target.value })
                }
              />
            </label>
          </div>
        )}

        <RecommendationCard
          category={category}
          fitResult={fitResult}
          zones={PANTS_ZONES}
        />
      </div>

      <VestiProductEmbed
        product={productFromShopify}
        fitResult={fitResult}
        zones={PANTS_ZONES}
      />
    </div>
  );
}
