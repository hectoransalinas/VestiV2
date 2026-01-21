// IMPORTANTE: Integrar theme.ts si lo estás usando
// import { vestiTheme } from "../theme";

import React, { useEffect, useMemo, useState } from "react";
import { VestiProductEmbed } from "../embed/VestiProductEmbed";
import type { GarmentCategory, Garment } from "../motor/fitEngine";

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

export const ProductPageVestiDemo: React.FC<ProductPageVestiDemoProps> = ({
  productFromShopify,
  fullProductFromParent,
}) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string>(DEMO_GARMENTS[1].id); // default M (demo)

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
    () => garmentOptions.find((g) => String(g.id) === String(selectedSizeId)) ?? garmentOptions[0],
    [garmentOptions, selectedSizeId]
  );

  const buildMensaje = (tag: string, cat: GarmentCategory): string => {
  // SHOES: mensajes específicos (no hablar de "zonas" como si fuera ropa)
  if (cat === "shoes") {
    if (tag === "OK") {
      return "Este talle se ve adecuado para tu largo de pie.";
    }
    if (tag === "SIZE_UP") {
      return "Este talle podría quedarte corto de largo. Te recomendamos comparar con un talle más.";
    }
    if (tag === "SIZE_DOWN") {
      return "Este talle se ve algo largo. Si preferís un calce más justo, compará con un talle menos.";
    }
    return "Revisá el largo del calzado en tu avatar antes de decidir.";
  }

  // Resto de categorías (mensaje general)
  if (tag === "OK") {
    return "Este talle acompaña bien tus medidas. Revisá las zonas clave para confirmar que coincide con cómo te gusta vestirte.";
  }
  if (tag === "SIZE_UP") {
    return "Vemos alguna zona más ajustada de lo habitual. Si buscás más comodidad o libertad de movimiento, vale la pena comparar con un talle más.";
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
      selectedGarment.sizeLabel ||
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

    const currentId =
      (garment && (garment as DemoGarment).id) || selectedGarment.id;
    const currentIndex = garmentOptions.findIndex((g) => String(g.id) === String(currentId));

    if (currentIndex >= 0) {
      if (
        tagNormalizado === "SIZE_UP" &&
        currentIndex < garmentOptions.length - 1
      ) {
        tallaSugerida = garmentOptions[currentIndex + 1].sizeLabel;
      } else if (tagNormalizado === "SIZE_DOWN" && currentIndex > 0) {
        tallaSugerida = garmentOptions[currentIndex - 1].sizeLabel;
      }
    }

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

          <VestiProductEmbed
            garment={selectedGarment}
            category={effectiveCategory}
            onRecomendacion={handleRecomendacion}
          />

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
