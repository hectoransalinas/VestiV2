// IMPORTANTE: Integrar theme.ts si lo estás usando
// import { vestiTheme } from "../theme";

import React, { useEffect, useMemo, useState } from "react";
import { VestiProductEmbed } from "../embed/VestiProductEmbed";
import type { GarmentCategory, Garment, Measurements } from "../motor/fitEngine";
import { computeFit, makeRecommendation, normalizeCategory } from "../motor/fitEngine";

/**
 * Demo de ficha de producto integrada con Vesti AI.
 * - Usa el motor real de calce.
 * - Si viene producto real de Shopify, lo muestra y usa su descripción.
 * - Si no, cae al producto demo (Campera Puffer).
 */

type DemoGarment = Garment & {
  sizeLabel: string;
};

const DEMO_CATEGORY: GarmentCategory = "superior";

const DEMO_GARMENTS: DemoGarment[] = [
  {
    id: "puffer-s",
    name: "Campera Puffer Vesti·Fit",
    brand: "Vesti",
    category: "remera",
    sizeLabel: "S",
    measures: {
      hombros: 44,
      pecho: 94,
      cintura: 86,
      largoTorso: 60,
      largoPierna: 0,
      pieLargo: 0,
    },
    stretchPct: 8,
    easePreset: "regular",
  },
  {
    id: "puffer-m",
    name: "Campera Puffer Vesti·Fit",
    brand: "Vesti",
    category: "remera",
    sizeLabel: "M",
    measures: {
      hombros: 46,
      pecho: 100,
      cintura: 92,
      largoTorso: 62,
      largoPierna: 0,
      pieLargo: 0,
    },
    stretchPct: 8,
    easePreset: "regular",
  },
  {
    id: "puffer-l",
    name: "Campera Puffer Vesti·Fit",
    brand: "Vesti",
    category: "remera",
    sizeLabel: "L",
    measures: {
      hombros: 48,
      pecho: 108,
      cintura: 100,
      largoTorso: 64,
      largoPierna: 0,
      pieLargo: 0,
    },
    stretchPct: 8,
    easePreset: "regular",
  },
  {
    id: "puffer-xl",
    name: "Campera Puffer Vesti·Fit",
    brand: "Vesti",
    category: "remera",
    sizeLabel: "XL",
    measures: {
      hombros: 50,
      pecho: 116,
      cintura: 108,
      largoTorso: 66,
      largoPierna: 0,
      pieLargo: 0,
    },
    stretchPct: 8,
    easePreset: "regular",
  },
];

const DEMO_PRODUCT = {
  name: "Campera Puffer Vesti·Fit",
  subtitle: "Ajuste urbano, calce inteligente con Vesti AI",
  price: 82999,
  currency: "ARS",
  colorName: "Verde petróleo",
  imageUrl:
    "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
};

type ProductFromShopify = {
  productId?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  shop?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  currency?: string | null;
  colorName?: string | null;
};

// Tipo mínimo que necesitamos de lo que viene desde App.tsx
type FullProductFromParent = {
  id?: number | string;
  title?: string;
  category?: string; // viene del loader (upper/pants/shoes)
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  colorName?: string | null;
  descriptionHtml?: string;

  variants?: Array<{
    id: number | string;
    sizeLabel: string; // ej: "S", "M", "Default Title"
    measures: {
      hombros?: number;
      pecho?: number;
      cintura?: number;
      largoTorso?: number;
      largoPierna?: number;
      pieLargo?: number;
      [k: string]: any;
    };
    stretchPct?: number;
    easePreset?: string;
  }>;
};

type ProductPageVestiDemoProps = {
  productFromShopify?: ProductFromShopify;
  fullProductFromParent?: FullProductFromParent;
};

type LastRecState = {
  tallaSugerida: string;
  resumenZonas: string;
  mensaje: string;
  tag: string;
} | null;

/** Normaliza categorías para que la UI y el motor hablen el mismo idioma */
function normalizeCategoryUI(raw: any): GarmentCategory {
  const c = String(raw ?? "").trim().toLowerCase();

  if (
    ["pants", "pantalon", "pantalón", "jeans", "denim", "trousers", "pant"].includes(
      c
    )
  ) {
    return "pants" as any;
  }
  if (
    ["shoes", "shoe", "zapatilla", "zapatillas", "calzado", "sneakers", "botas", "boots"].includes(
      c
    )
  ) {
    return "shoes" as any;
  }
  if (
    [
      "upper",
      "top",
      "superior",
      "remera",
      "camiseta",
      "shirt",
      "tshirt",
      "buzo",
      "hoodie",
      "campera",
      "jacket",
    ].includes(c)
  ) {
    return "upper" as any;
  }

  // fallback seguro
  return DEMO_CATEGORY;
}

/** Normaliza nombres de zonas para filtrar en el resumen UI */
function normalizeZoneKey(z: any): string {
  const s = String(z ?? "").trim().toLowerCase();

  if (s.includes("homb")) return "hombros";
  if (s.includes("pech")) return "pecho";
  if (s.includes("cint")) return "cintura";
  if (s.includes("torso")) return "largoTorso";
  if (s.includes("pier")) return "largoPierna";
  if (s.includes("pie")) return "pieLargo";

  // ya viene en camelCase (ej: largoPierna)
  if (s === "largopierna") return "largoPierna";
  if (s === "largotorso") return "largoTorso";
  if (s === "pielargo") return "pieLargo";

  return s;
}

function allowedZonesForCategory(cat: GarmentCategory): Set<string> {
  const c = String(cat ?? "").toLowerCase();

  if (c === "pants") return new Set(["cintura", "largoPierna"]);
  if (c === "shoes") return new Set(["pieLargo"]);
  // upper/default
  return new Set(["hombros", "pecho", "cintura", "largoTorso"]);
}


/** Mapeo simple (orientativo) de largo de pie en cm -> talle EU (36–45). */
function mapFootToEuSize(lenCm: number): number | null {
  if (!Number.isFinite(lenCm) || lenCm <= 0) return null;
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

export const ProductPageVestiDemo: React.FC<ProductPageVestiDemoProps> = ({
  productFromShopify,
  fullProductFromParent,
}) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string>(DEMO_GARMENTS[1].id); // default M (demo)

  // Perfil editable (medidas del usuario). Se pasa al widget para recalcular recomendación y overlays.
  const [perfil, setPerfil] = useState<Measurements>(() => ({
    hombros: 44,
    pecho: 96,
    cintura: 82,
    largoTorso: 52,
    largoPierna: 102,
    pieLargo: 25.8,
  } as any));
  const [openMeasures, setOpenMeasures] = useState<boolean>(false);


  const [lastRec, setLastRec] = useState<LastRecState>(null);

  const hasRealProduct =
    !!productFromShopify &&
    !!(
      productFromShopify.productId ||
      productFromShopify.productHandle ||
      productFromShopify.productTitle ||
      productFromShopify.shop
    );

  const hasRealDescription =
    !!fullProductFromParent &&
    typeof fullProductFromParent.descriptionHtml === "string" &&
    fullProductFromParent.descriptionHtml.trim().length > 0;

  // Detecto si estoy embebido en un iframe + si vengo en modo "sizeguide" (desde Shopify).
  const isEmbedded = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch (_err) {
      return true;
    }
  })();

  const isSizeGuideMode = (() => {
    if (typeof window === "undefined") return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "sizeguide";
    } catch (_err) {
      return false;
    }
  })();

  // 👉 Categoría efectiva que va al motor (normalizada)
  const effectiveCategory: GarmentCategory = useMemo(() => {
    return normalizeCategoryUI(fullProductFromParent?.category ?? DEMO_CATEGORY);
  }, [fullProductFromParent?.category]);

  const zonesAllowed = useMemo(
    () => allowedZonesForCategory(effectiveCategory),
    [effectiveCategory]
  );

  const displayProduct = useMemo(() => {
    const name =
      hasRealProduct && productFromShopify?.productTitle?.trim()
        ? productFromShopify.productTitle.trim()
        : DEMO_PRODUCT.name;

    const subtitle = hasRealProduct
      ? "Recomendación de talle para este producto de tu tienda"
      : DEMO_PRODUCT.subtitle;

    const imageUrl =
      hasRealProduct && productFromShopify?.imageUrl
        ? productFromShopify.imageUrl
        : DEMO_PRODUCT.imageUrl;

    const price =
      hasRealProduct && productFromShopify?.price
        ? Number(productFromShopify.price)
        : DEMO_PRODUCT.price;

    const currency =
      hasRealProduct && productFromShopify?.currency
        ? productFromShopify.currency
        : DEMO_PRODUCT.currency;

    const colorName =
      hasRealProduct && productFromShopify?.colorName
        ? productFromShopify.colorName
        : DEMO_PRODUCT.colorName;

    return {
      ...DEMO_PRODUCT,
      name,
      subtitle,
      imageUrl,
      price,
      currency,
      colorName,
    };
  }, [hasRealProduct, productFromShopify]);

  // 👉 Opciones de talle (prendas) para el motor:
  // - Si llega producto real desde el loader (fullProductFromParent.variants), lo usamos.
  // - Si no, caemos al set DEMO (Campera Puffer).
  const garmentOptions: DemoGarment[] = useMemo(() => {
    const variants = fullProductFromParent?.variants;
    if (Array.isArray(variants) && variants.length > 0) {
      const baseName =
        (fullProductFromParent?.title && String(fullProductFromParent.title).trim()) ||
        (hasRealProduct && productFromShopify?.productTitle?.trim()
          ? productFromShopify.productTitle.trim()
          : DEMO_PRODUCT.name);

      const baseBrand =
        (hasRealProduct && productFromShopify?.shopDomain
          ? productFromShopify.shopDomain
          : "Vesti") || "Vesti";

      return variants.map((v) => ({
        id: String(v.id),
        name: baseName,
        brand: baseBrand,
        category: String(fullProductFromParent?.category ?? DEMO_CATEGORY),
        sizeLabel: String(v.sizeLabel ?? "Default Title"),
        measures: {
          hombros: Number(v.measures?.hombros ?? 0),
          pecho: Number(v.measures?.pecho ?? 0),
          cintura: Number(v.measures?.cintura ?? 0),
          largoTorso: Number(v.measures?.largoTorso ?? 0),
          largoPierna: Number(v.measures?.largoPierna ?? 0),
          pieLargo: Number(v.measures?.pieLargo ?? 0),
        },
        stretchPct: Number(v.stretchPct ?? 0),
        easePreset: String(v.easePreset ?? "regular"),
      }));
    }

    return DEMO_GARMENTS;
  }, [
    fullProductFromParent?.variants,
    fullProductFromParent?.title,
    fullProductFromParent?.category,
    hasRealProduct,
    productFromShopify?.productTitle,
    productFromShopify?.shopDomain,
  ]);

  // Si cambian las opciones (ej: llega producto real) y el talle seleccionado no existe,
  // seleccionamos el primer talle disponible para evitar quedarnos con un id de demo.
  useEffect(() => {
    if (!Array.isArray(garmentOptions) || garmentOptions.length === 0) return;

    const exists = garmentOptions.some((g) => String(g.id) === String(selectedSizeId));
    if (!exists) {
      setSelectedSizeId(String(garmentOptions[0].id));
    }
  }, [garmentOptions, selectedSizeId]);


  const selectedGarment = useMemo(
    () =>
      garmentOptions.find((g) => String(g.id) === String(selectedSizeId)) ??
      garmentOptions[0] ??
      null,
    [garmentOptions, selectedSizeId]
  );

  
  // =========================
  // Recomendación IDEAL (independiente del talle seleccionado)
  // - Se calcula evaluando TODAS las variantes (garmentOptions) contra el perfil actual.
  // - NO toca el motor: usa computeFit + makeRecommendation.
  // =========================
  const recommendedPick = useMemo(() => {
    if (!Array.isArray(garmentOptions) || garmentOptions.length === 0) return null;

    const canon = normalizeCategory(effectiveCategory);

    const decisive = (() => {
      if (canon === "pants") {
        return { widths: ["cintura"] as const, lengths: ["largoPierna"] as const };
      }
      if (canon === "shoes") {
        return { widths: [] as const, lengths: ["pieLargo"] as const };
      }
      // upper
      return { widths: ["hombros", "pecho"] as const, lengths: ["largoTorso"] as const };
    })();

    const tagBaseScore = (tag: string) => {
      switch (tag) {
        case "OK":
          return 0;
        case "CHECK_LENGTH":
          return 1;
        case "SIZE_DOWN":
        case "SIZE_UP":
          return 2;
        default:
          return 3;
      }
    };

    const scoreFor = (g: DemoGarment) => {
      const fit = computeFit(perfil, g);
      const rec = makeRecommendation(fit);

      let penalty = 0;

      // Ancho (decisorio)
      for (const z of decisive.widths) {
        const zw = fit.widths?.find((x) => x.zone === z);
        if (!zw) continue;
        const abs = Math.abs(Number(zw.delta ?? 0));
        if (zw.status === "Ajustado") penalty += 1000 + abs * 50;
        else if (zw.status === "Holgado") penalty += 20 + abs * 2;
        else penalty += abs;
      }

      // Largo (warning, no cambia talle, pero sí afecta score)
      for (const z of decisive.lengths) {
        const zl = fit.lengths?.find((x) => x.zone === z);
        if (!zl) continue;
        const abs = Math.abs(Number(zl.delta ?? 0));
        if (zl.status === "Corto") penalty += 80 + abs * 5;
        else if (zl.status === "Largo") penalty += 40 + abs * 3;
        else penalty += abs;
      }

      const total = tagBaseScore(String(rec.tag)) * 200 + penalty;
      return { g, fit, rec, total };
    };

    let best = scoreFor(garmentOptions[0]);
    for (let i = 1; i < garmentOptions.length; i++) {
      const cand = scoreFor(garmentOptions[i]);
      if (cand.total < best.total) best = cand;
    }

    return best;
  }, [garmentOptions, perfil, effectiveCategory]);

const buildMensaje = (tag: string, cat: GarmentCategory): string => {
    const c = String(cat ?? "").toLowerCase();

    // Copy específica por categoría (prioridad: shoes/pants, luego upper)
    if (c === "shoes") {
      if (tag === "OK") {
        return "Este talle se ve ideal para tu largo de pie. Si preferís más espacio, compará con un número más.";
      }
      if (tag === "SIZE_UP") {
        return "Puede quedarte algo justo de largo. Para ir cómodo, compará con un número más.";
      }
      if (tag === "SIZE_DOWN") {
        return "Puede quedarte algo largo. Si te gusta más firme, compará con un número menos.";
      }
      return "Revisá el largo del pie para confirmar. Si dudás entre dos números, elegí el que te resulte más cómodo.";
    }

    if (c === "pants") {
      if (tag === "OK") {
        return "Este talle se ve equilibrado en cintura. Revisá el largo para confirmar cómo te gusta usar el pantalón.";
      }
      if (tag === "SIZE_UP") {
        return "La cintura puede quedar algo justa. Si buscás comodidad, compará con un talle más.";
      }
      if (tag === "SIZE_DOWN") {
        return "La cintura puede quedar algo holgada. Si preferís un calce más firme, compará con un talle menos.";
      }
      if (tag === "CHECK_LENGTH") {
        return "La cintura está bien, pero revisá el largo antes de comprar (puede variar según tu preferencia).";
      }
      return "Revisá cintura y largo para confirmar tu calce ideal.";
    }

    // Upper / default
    if (tag === "OK") {
      return "Este talle acompaña bien tus medidas. Revisá las zonas clave para confirmar que coincide con cómo te gusta vestirte.";
    }
    if (tag === "SIZE_UP") {
      return "Vemos alguna zona más ajustada de lo habitual. Si buscás comodidad o libertad de movimiento, vale la pena comparar con un talle más.";
    }
    if (tag === "SIZE_DOWN") {
      return "Vemos algo de holgura en alguna zona. Si preferís un calce más al cuerpo o prolijo, compará con un talle menos.";
    }
    if (tag === "CHECK_LENGTH") {
      return "El talle parece razonable, pero revisá el largo antes de comprar (puede variar según cómo te guste usar la prenda).";
    }
    return "El talle se ve razonable para tus medidas. Mirá las zonas clave en tu avatar antes de decidir.";
  };

  const handleRecomendacion = (data: any) => {
    if (!data) return;

    const { fit, recommendation, garment } = data;

    const tallaActual =
      (garment && (garment as DemoGarment).sizeLabel) ||
      selectedGarment?.sizeLabel ||
      "—";

    const widthsRaw: string[] =
      fit?.widths?.map((w: any) => `${w.zone}: ${w.status}`) ?? [];
    const lengthsRaw: string[] =
      fit?.lengths?.map((l: any) => `${l.zone}: ${l.status}`) ?? [];

    // Filtrar zonas según categoría (evita "hombros/pecho" cuando es pantalón)
    const filterPairs = (pairs: string[]) =>
      pairs.filter((p) => {
        const [zone] = p.split(":");
        const key = normalizeZoneKey(zone);
        return zonesAllowed.has(key);
      });

    const widths = filterPairs(widthsRaw);
    const lengths = filterPairs(lengthsRaw);

    const resumenZonas = [...widths, ...lengths].join(" · ");

    const rawTag = String(recommendation?.tag ?? "OK").toUpperCase();
    const tagNormalizado =
      rawTag === "SIZE_UP" ||
      rawTag === "SIZE_DOWN" ||
      rawTag === "OK" ||
      rawTag === "CHECK_LENGTH"
        ? rawTag
        : "OK";

    let tallaSugerida = tallaActual;

    // En modo "selector de talle", NO movemos la recomendación en base al talle seleccionado.
    // La recomendación ideal se calcula aparte comparando el perfil contra TODAS las variantes.
    // Acá, este callback solo actualiza el estado del calce del talle SELECCIONADO (chips + overlays).
    const mensaje = buildMensaje(tagNormalizado, effectiveCategory);

    setLastRec({
      tallaSugerida,
      resumenZonas: resumenZonas || "Aún sin datos de calce.",
      mensaje,
      tag: tagNormalizado,
    });
  };

  const priceFormatted = (() => {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: displayProduct.currency,
        maximumFractionDigits: 0,
      }).format(displayProduct.price);
    } catch {
      return `$${displayProduct.price.toLocaleString("es-AR")}`;
    }
  })();

  const sizeTagLabel = (tag: string) => {
    switch (tag) {
      case "SIZE_UP":
      case "SIZE_DOWN":
      case "CHECK_LENGTH":
        return "Revisá el calce antes de comprar";
      default:
        return "Este talle parece adecuado para vos";
    }
  };

  const recBackground = (() => {
    if (!lastRec) return "#f9fafb";
    switch (lastRec.tag) {
      case "OK":
        return "#ecfdf3";
      case "SIZE_UP":
        return "#fef2f2";
      case "SIZE_DOWN":
        return "#fffbeb";
      case "CHECK_LENGTH":
        return "#eff6ff";
      default:
        return "#eff6ff";
    }
  })();

  const recBorder = (() => {
    if (!lastRec) return "1px solid #e5e7eb";
    switch (lastRec.tag) {
      case "OK":
        return "1px solid #bbf7d0";
      case "SIZE_UP":
        return "1px solid #fecACA";
      case "SIZE_DOWN":
        return "1px solid #fef3c7";
      case "CHECK_LENGTH":
        return "1px solid #bfdbfe";
      default:
        return "1px solid #bfdbfe";
    }
  })();

  const vestiIntroZonesText = useMemo(() => {
    const c = String(effectiveCategory).toLowerCase();
    if (c === "pants") return "cintura y largo de pierna";
    if (c === "shoes") return "largo de pie";
    return "hombros, pecho, cintura y largo";
  }, [effectiveCategory]);

  
  // =========================
  // SIZEGUIDE (modo Shopify / iframe)
  // Render limpio tipo "guía de talles" (estilo Adidas/Nike).
  // =========================
  if (isSizeGuideMode) {
    const talleActual = selectedGarment?.sizeLabel ?? "—";
    const isShoes = String(effectiveCategory).toLowerCase() === "shoes";
    const euFromFoot = mapFootToEuSize(Number((perfil as any).pieLargo ?? 0));
    const talleIdeal = recommendedPick?.g?.sizeLabel ?? talleActual;

    const mensaje = buildMensaje(String(recommendedPick?.rec?.tag ?? "OK"), effectiveCategory);

    const resumen = lastRec?.resumenZonas ?? "";

    const chips = resumen
      ? resumen.split(" · ").filter(Boolean)
      : [];

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          padding: 20,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          background: "#ffffff",
        }}
      >
        {/* Header minimal */}
        <div
          className="vesti-sg-cols"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#16a34a",
              }}
            />
            <div style={{ fontWeight: 700, color: "#111827" }}>Vesti AI</div>
            <div style={{ color: "#6b7280" }}>Guía de talles · Recomendación personalizada</div>
          </div>

          <button
            onClick={() => window.parent?.postMessage({ type: "vesti:close" }, "*")}
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#fff",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              color: "#111827",
              fontWeight: 600,
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Layout 2 columnas */}
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "stretch",
            height: "calc(100% - 52px)",
          }}
        >
          {/* Columna izquierda: recomendación */}
          <div style={{ flex: "0 0 420px", maxWidth: 460, width: "100%" }}>
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                padding: 16,
                background: "#fafafa",
              }}
            >
              
              {/* Selector de talle base (fuente de verdad para avatar + overlays) */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {garmentOptions.map((g) => {
                  const active = String(g.id) === String(selectedSizeId);
                  return (
                    <button
                      key={String(g.id)}
                      type="button"
                      onClick={() => setSelectedSizeId(String(g.id))}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                        background: active ? "#111827" : "#ffffff",
                        color: active ? "#ffffff" : "#111827",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {String(g.sizeLabel ?? "—")}
                    </button>
                  );
                })}
              </div>
<div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#d1fae5",
                  color: "#065f46",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Tu talle ideal
              </div>

              <div style={{ fontSize: 54, fontWeight: 800, marginTop: 10, color: "#111827" }}>
                {talleIdeal}
              </div>

              <div style={{ color: "#374151", marginTop: 6, lineHeight: 1.4 }}>
                {mensaje}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: "#e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      color: "#111827",
                    }}
                  >
                    ✓
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#111827" }}>
                      Calce estimado
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      Basado en tus medidas y este producto
                    </div>
                  </div>
                </div>

                {chips.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {chips.map((c, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.04)",
                          border: "1px solid rgba(0,0,0,0.06)",
                          color: "#111827",
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>


              {/* Acordeón de medidas */}
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setOpenMeasures((v) => !v)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "#ffffff",
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  <span>¿Querés ajustar tus datos?</span>
                  <span style={{ color: "#6b7280", fontWeight: 800 }}>
                    {openMeasures ? "–" : "+"}
                  </span>
                </button>

                {openMeasures && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.06)",
                      background: "#ffffff",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    {String(effectiveCategory).toLowerCase() === "upper" && (
                      <>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Hombros (cm)</span>
                          <input
                            type="number"
                            value={perfil.hombros as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, hombros: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Pecho (cm)</span>
                          <input
                            type="number"
                            value={perfil.pecho as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, pecho: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Cintura (cm)</span>
                          <input
                            type="number"
                            value={perfil.cintura as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, cintura: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Largo torso (cm)</span>
                          <input
                            type="number"
                            value={perfil.largoTorso as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, largoTorso: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                      </>
                    )}

                    {String(effectiveCategory).toLowerCase() === "pants" && (
                      <>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Cintura (cm)</span>
                          <input
                            type="number"
                            value={perfil.cintura as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, cintura: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Largo pierna (cm)</span>
                          <input
                            type="number"
                            value={perfil.largoPierna as any}
                            onChange={(e) => setPerfil((p) => ({ ...p, largoPierna: Number(e.target.value) } as any))}
                            style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                          />
                        </label>
                      </>
                    )}

                    {String(effectiveCategory).toLowerCase() === "shoes" && (
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, gridColumn: "1 / -1" }}>
                        <span style={{ color: "#6b7280" }}>Largo de pie (cm)</span>
                        <input
                          type="number"
                          value={(perfil as any).pieLargo ?? ""}
                          onChange={(e) => setPerfil((p) => ({ ...p, pieLargo: Number(e.target.value) } as any))}
                          style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: "8px 10px" }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Columna derecha: avatar + overlays */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedGarment ? (
              <VestiProductEmbed
                garment={selectedGarment}
                category={effectiveCategory}
                perfilInicial={perfil}
                onRecomendacion={handleRecomendacion}
                style={{ height: "100%" }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  background: "rgba(0,0,0,0.04)",
                  color: "#444",
                  fontSize: 14,
                }}
              >
                Esperando datos del producto…
              </div>
            )}
          </div>
        </div>

        {/* Mobile: apilar columnas */}
        <style>{`
          @media (max-width: 860px) {
            .vesti-sg-cols { flex-direction: column; height: auto; }
          }
        `}</style>
      </div>
    );
  }

return (
    <div
      style={{
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        padding: 24,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Migas de pan */}
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          marginBottom: 8,
        }}
      >
        Inicio / Camperas /{" "}
        <span style={{ color: "#111827" }}>{displayProduct.name}</span>
      </div>

      {/* Header: título + badge Vesti */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              color: "#111827",
            }}
          >
            {displayProduct.name}
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 14,
              color: "#4b5563",
            }}
          >
            {displayProduct.subtitle}
          </p>
        </div>

        <div
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            fontSize: 11,
            color: "#3730a3",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
            }}
          />
          Probador inteligente · <strong>Vesti AI</strong>
        </div>
      </div>

      {/* Layout principal: imagen + info izquierda / Vesti derecha */}
      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
              {!(isEmbedded && isSizeGuideMode) && (
          <>
            {/* Columna izquierda: imagen, precio, talles, detalles */}
                        <div
                          style={{
                            flex: 1,
                            minWidth: 280,
                            maxWidth: 520,
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                          }}
                        >
                          {/* Imagen */}
                          <div
                            style={{
                              borderRadius: 20,
                              overflow: "hidden",
                              border: "1px solid #e5e7eb",
                              background: "#f9fafb",
                            }}
                          >
                            <img
                              src={displayProduct.imageUrl}
                              alt={displayProduct.name}
                              style={{
                                width: "100%",
                                height: "auto",
                                display: "block",
                                objectFit: "cover",
                              }}
                            />
                          </div>
                
                          {/* Precio + color */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 22,
                                  fontWeight: 700,
                                  color: "#111827",
                                }}
                              >
                                {priceFormatted}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#6b7280",
                                }}
                              >
                                3 cuotas sin interés pagando con tarjeta
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: "999px",
                                  background:
                                    "radial-gradient(circle at 30% 30%, #4ade80, #065f46)",
                                  border: "1px solid #e5e7eb",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#374151",
                                }}
                              >
                                Color: <strong>{displayProduct.colorName}</strong>
                              </span>
                            </div>
                          </div>
                
                          {/* Selector de talle demo */}
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 6,
                              }}
                            >
                              Seleccioná tu talle
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              {garmentOptions.map((g) => {
                                const active = g.id === selectedSizeId;
                                return (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setSelectedSizeId(g.id)}
                                    style={{
                                      minWidth: 40,
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      border: active
                                        ? "2px solid #111827"
                                        : "1px solid #d1d5db",
                                      background: active ? "#111827" : "#f9fafb",
                                      color: active ? "#f9fafb" : "#111827",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {g.sizeLabel}
                                  </button>
                                );
                              })}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: "#6b7280",
                              }}
                            >
                              Tip: creá tu avatar con <strong>Vesti AI</strong> y validá si este
                              talle es el ideal para vos.
                            </div>
                          </div>
                
                          {/* Botones compra */}
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 4,
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                flex: 1,
                                minWidth: 160,
                                padding: "10px 16px",
                                borderRadius: 999,
                                border: "none",
                                background: "#111827",
                                color: "#f9fafb",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Agregar al carrito
                            </button>
                            <button
                              type="button"
                              style={{
                                flex: 1,
                                minWidth: 160,
                                padding: "10px 16px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                background: "#ffffff",
                                color: "#111827",
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: "pointer",
                              }}
                            >
                              Comprar ahora
                            </button>
                          </div>
                
                          {/* Detalles del producto: descripción real Shopify o demo */}
                          <div
                            style={{
                              marginTop: 8,
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid #e5e7eb",
                              background: "#f9fafb",
                              fontSize: 12,
                              color: "#4b5563",
                            }}
                          >
                            <strong>Detalles del producto</strong>
                            {hasRealDescription ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  color: "#4b5563",
                                  lineHeight: 1.5,
                                }}
                                dangerouslySetInnerHTML={{
                                  __html: fullProductFromParent!.descriptionHtml!,
                                }}
                              />
                            ) : (
                              <ul
                                style={{
                                  margin: "4px 0 0",
                                  paddingLeft: 16,
                                }}
                              >
                                <li>Relleno sintético liviano, ideal para media estación.</li>
                                <li>Capucha desmontable y cierres termosellados.</li>
                                <li>Fit regular unisex, pensado para uso urbano.</li>
                              </ul>
                            )}
                          </div>
                        </div>
                
          </>
        )}
        {/* Columna derecha: Vesti AI */}
        <div
          style={{
            flex: 1,
            minWidth: 320,
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Probá tu talle con Vesti AI
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              Creá tu avatar con una selfie, ajustá tus medidas y mirá cómo se
              comporta el calce en <strong>{vestiIntroZonesText}</strong> antes
              de comprar.
            </div>
          </div>

          {selectedGarment ? (
          <VestiProductEmbed
            garment={selectedGarment}
            category={effectiveCategory}
            onRecomendacion={handleRecomendacion}
          />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 420,
            borderRadius: 14,
            background: "rgba(0,0,0,0.04)",
            color: "#444",
            fontSize: 14,
          }}>
            Cargando datos del producto…
          </div>
        )}

          <div
            style={{
              marginTop: 4,
              padding: 12,
              borderRadius: 14,
              background: recBackground,
              border: recBorder,
              fontSize: 12,
              color: "#111827",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {lastRec
                  ? `Talle sugerido: ${lastRec.tallaSugerida}`
                  : "Creá tu avatar para ver el talle sugerido"}
              </div>
              {lastRec && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.5)",
                    background: "rgba(15,23,42,0.02)",
                  }}
                >
                  {sizeTagLabel(lastRec.tag)}
                </span>
              )}
            </div>

            {lastRec ? (
              <>
                <div
                  style={{
                    marginBottom: 4,
                    color: "#4b5563",
                  }}
                >
                  {lastRec.mensaje}
                </div>
                {lastRec.resumenZonas && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                    }}
                  >
                    <strong>Zonas clave: </strong>
                    {lastRec.resumenZonas}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                Una vez que termines tu avatar, acá vas a ver un resumen del
                calce por zonas y el talle que te recomendamos para reducir
                devoluciones.
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#9ca3af",
              marginTop: 2,
            }}
          >
            Vesti AI es una herramienta de recomendación. El calce final puede
            variar según preferencias personales y marca.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPageVestiDemo;
