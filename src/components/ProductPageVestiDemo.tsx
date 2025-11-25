// IMPORTANTE: Integrar theme.ts
// import { vestiTheme } from "../theme";
// -------------------------------
import React, { useMemo, useState } from "react";
import { VestiProductEmbed } from "../embed/VestiProductEmbed";
import type { GarmentCategory, Garment } from "../motor/fitEngine";

/**
 * Demo de ficha de producto integrada con Vesti AI.
 *
 * Usa el motor real de calce, pero para no chocar con
 * configuraciones internas del fitEngine:
 * - category de la prenda queda en "remera" (categoría conocida)
 * - el texto visible habla de "Campera Puffer"
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
    // IMPORTANTE: usar una categoría conocida por el motor
    category: "remera",
    sizeLabel: "S",
    measures: {
      hombros: 44,
      pecho: 94,
      cintura: 86,
      largoTorso: 60,
      // Campos que el motor puede ignorar según categoría,
      // pero los dejamos en 0 para no romper el tipo.
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
};

type ProductPageVestiDemoProps = {
  productFromShopify?: ProductFromShopify;
};

type LastRecState = {
  tallaSugerida: string;
  resumenZonas: string;
  mensaje: string;
  tag: string;
} | null;

export const ProductPageVestiDemo: React.FC<ProductPageVestiDemoProps> = ({ productFromShopify }) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string>(
    DEMO_GARMENTS[1].id // default M
  );
  const [lastRec, setLastRec] = useState<LastRecState>(null);
  const hasRealProduct =
    !!productFromShopify &&
    !!(
      productFromShopify.productId ||
      productFromShopify.productHandle ||
      productFromShopify.productTitle ||
      productFromShopify.shop
    );

  const displayProduct = useMemo(() => {
    const name =
      hasRealProduct && productFromShopify?.productTitle?.trim()
        ? productFromShopify.productTitle.trim()
        : DEMO_PRODUCT.name;

    const subtitle = hasRealProduct
      ? "Recomendación de talle para este producto de tu tienda"
      : DEMO_PRODUCT.subtitle;

    return {
      ...DEMO_PRODUCT,
      name,
      subtitle,
    };
  }, [hasRealProduct, productFromShopify]);


  const selectedGarment = useMemo(
    () => DEMO_GARMENTS.find((g) => g.id === selectedSizeId) ?? DEMO_GARMENTS[0],
    [selectedSizeId]
  );


  const buildMensaje = (tag: string): string => {
    if (tag === "OK") {
      return "Este talle acompaña bien tus medidas. Revisá las zonas clave para confirmar que coincide con cómo te gusta vestirte.";
    }
    if (tag === "SIZE_UP") {
      return "Vemos alguna zona más ajustada de lo habitual. Si buscás comodidad o libertad de movimiento, vale la pena comparar con un talle más.";
    }
    if (tag === "SIZE_DOWN") {
      return "Vemos algo de holgura en alguna zona. Si preferís un calce más al cuerpo o prolijo, compará con un talle menos.";
    }
    // CHECK_LENGTH u otros tags: el talle se ve razonable de ancho, pero hay detalles a revisar.
    return "El talle se ve razonable para tus medidas. Mirá las zonas clave y el largo en tu avatar antes de decidir.";
  };

  const handleRecomendacion = (data: any) => {
    if (!data) return;

    const { fit, recommendation, garment } = data;

    // Talle actual evaluado (el que tiene el usuario seleccionado)
    const tallaActual =
      (garment && (garment as DemoGarment).sizeLabel) ||
      selectedGarment.sizeLabel ||
      "—";

    const widths: string[] =
      fit?.widths?.map((w: any) => `${w.zone}: ${w.status}`) ?? [];
    const lengths: string[] =
      fit?.lengths?.map((l: any) => `${l.zone}: ${l.status}`) ?? [];

    const resumenZonas = [...widths, ...lengths].join(" · ");

    const rawTag = recommendation?.tag ?? "OK";
    const tagNormalizado =
      rawTag === "SIZE_UP" || rawTag === "SIZE_DOWN" || rawTag === "OK"
        ? rawTag
        : "OK";

    // A partir del tag, calculamos un "talle sugerido" relativo al talle actual
    // usando la lista DEMO_GARMENTS (S, M, L, XL).
    let tallaSugerida = tallaActual;

    const currentId =
      (garment && (garment as DemoGarment).id) || selectedGarment.id;
    const currentIndex = DEMO_GARMENTS.findIndex((g) => g.id === currentId);

    if (currentIndex >= 0) {
      if (
        tagNormalizado === "SIZE_UP" &&
        currentIndex < DEMO_GARMENTS.length - 1
      ) {
        tallaSugerida = (DEMO_GARMENTS[currentIndex + 1] as DemoGarment).sizeLabel;
      } else if (tagNormalizado === "SIZE_DOWN" && currentIndex > 0) {
        tallaSugerida = (DEMO_GARMENTS[currentIndex - 1] as DemoGarment).sizeLabel;
      }
    }

    const mensaje = buildMensaje(tagNormalizado);

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
        // Tag de alerta: el motor detectó alguna zona al límite,
        // pero dejamos que la decisión de talle la tome el usuario.
        return "Revisá el calce antes de comprar";
      default:
        // Tag neutro: el talle se ve razonable para tus medidas.
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
      default:
        return "1px solid #bfdbfe";
    }
  })();

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

      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
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
              {DEMO_GARMENTS.map((g) => {
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
              Tip: creá tu avatar con{" "}
              <strong>Vesti AI</strong> y validá si este talle es
              el ideal para vos.
            </div>
          </div>

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
          </div>
        </div>

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
              Creá tu avatar con una selfie, ajustá tus medidas y
              mirá cómo se comporta el calce en{" "}
              <strong>hombros, pecho, cintura y largo</strong> antes
              de comprar.
            </div>
          </div>

          <VestiProductEmbed
            garment={selectedGarment}
            category={DEMO_CATEGORY}
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
                Una vez que termines tu avatar, acá vas a ver un
                resumen de cómo te queda esta campera por zonas
                (hombros, pecho, cintura y largo) y el talle que te
                recomendamos para reducir devoluciones.
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
            Vesti AI es una herramienta de recomendación. El calce
            final puede variar según preferencias personales y marca.
          </div>
        </div>
      </div>
    </div>
  );
};
