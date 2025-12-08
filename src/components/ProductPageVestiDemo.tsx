import React, { useMemo, useState } from "react";
import { VestiProductEmbed } from "./VestiProductEmbed";
import type { UserMeasures } from "./fitEngine";

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

type FullProductFromParent = {
  id: string | number;
  title: string;
  category: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  colorName?: string;
  variants: {
    id: string | number;
    sizeLabel?: string;
    measures?: {
      hombros?: number;
      pecho?: number;
      cintura?: number;
      largo_torso?: number;
      largoTorso?: number;
      stretch?: number;
      ease?: string;
    };
    stretchPct?: number;
    easePreset?: string;
  }[];
};

// DEMO backup
const DEMO_PRODUCT = {
  name: "Campera Puffer Demo",
  subtitle: "Recomendación de talle basada en el motor Vesti AI",
  price: 82999,
  currency: "ARS",
  colorName: "Verde petróleo",
  imageUrl:
    "https://cdn.shopify.com/s/files/1/0000/0001/products/demo.jpg?v=1",
};

const DEMO_GARMENTS = [
  {
    id: "S",
    sizeLabel: "S",
    category: "remera",
    measures: { hombros: 40, pecho: 88, cintura: 70, largo_torso: 50 },
  },
  {
    id: "M",
    sizeLabel: "M",
    category: "remera",
    measures: { hombros: 42, pecho: 96, cintura: 82, largo_torso: 52 },
  },
  {
    id: "L",
    sizeLabel: "L",
    category: "remera",
    measures: { hombros: 44, pecho: 104, cintura: 90, largo_torso: 54 },
  },
  {
    id: "XL",
    sizeLabel: "XL",
    category: "remera",
    measures: { hombros: 46, pecho: 112, cintura: 98, largo_torso: 56 },
  },
];

type Props = {
  productFromShopify?: ProductFromShopify;
  fullProductFromParent?: FullProductFromParent;
};

export const ProductPageVestiDemo: React.FC<Props> = ({
  productFromShopify,
  fullProductFromParent,
}) => {
  const hasRealProduct =
    !!productFromShopify &&
    !!(
      productFromShopify.productId ||
      productFromShopify.productHandle ||
      productFromShopify.productTitle ||
      productFromShopify.shop
    );

  // PRODUCTO VISUAL (nombre, imagen, precio, color...)
  const displayProduct = useMemo(() => {
    const anyProduct =
      hasRealProduct || (fullProductFromParent && fullProductFromParent.id);

    const name =
      (anyProduct && productFromShopify?.productTitle) ||
      fullProductFromParent?.title ||
      DEMO_PRODUCT.name;

    const subtitle = anyProduct
      ? "Recomendación de talle para este producto de tu tienda"
      : DEMO_PRODUCT.subtitle;

    // 1) Imagen: priorizamos SIEMPRE la del loader (fullProductFromParent),
    // luego lo que venga por query, y por último el demo.
    let imageUrl: string = DEMO_PRODUCT.imageUrl;

    if (fullProductFromParent?.imageUrl) {
      imageUrl = fullProductFromParent.imageUrl;
    } else if (productFromShopify?.imageUrl) {
      let raw = productFromShopify.imageUrl;

      // Intentamos decodificar por si viene con %2F%2F...
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // si falla, seguimos con raw
      }

      // Normalizamos los casos típicos de Shopify: //cdn.shopify.com/...
      if (raw.startsWith("//")) {
        imageUrl = `https:${raw}`;
      } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
        imageUrl = raw;
      } else {
        // Último recurso: lo usamos tal cual
        imageUrl = raw;
      }
    }

    // 2) Precio y moneda: usamos primero lo que viene por query,
    // luego lo que pudiera venir del loader, y por último el demo.
    let price = DEMO_PRODUCT.price;
    if (productFromShopify?.price) {
      const n = Number(productFromShopify.price);
      price = Number.isFinite(n) ? n : DEMO_PRODUCT.price;
    } else if (fullProductFromParent?.price != null) {
      price = fullProductFromParent.price;
    }

    const currency =
      productFromShopify?.currency ||
      fullProductFromParent?.currency ||
      DEMO_PRODUCT.currency;

    const colorName =
      productFromShopify?.colorName ||
      fullProductFromParent?.colorName ||
      DEMO_PRODUCT.colorName;

    console.log("[VESTI][iframe] displayProduct:", {
      name,
      subtitle,
      imageUrl,
      price,
      currency,
      colorName,
      fromLoader: !!fullProductFromParent?.imageUrl,
      fromQuery: !!productFromShopify?.imageUrl,
    });

    return {
      ...DEMO_PRODUCT,
      name,
      subtitle,
      imageUrl,
      price,
      currency,
      colorName,
    };
  }, [hasRealProduct, productFromShopify, fullProductFromParent]);

  // DEMO: selección de talle y medidas del usuario
  const [selectedGarmentId, setSelectedGarmentId] = useState("M");

  const selectedGarment = useMemo(() => {
    return (
      DEMO_GARMENTS.find((g) => g.id === selectedGarmentId) ||
      DEMO_GARMENTS[1]
    );
  }, [selectedGarmentId]);

  const [userMeasures, setUserMeasures] = useState<UserMeasures>({
    hombros: 44,
    pecho: 96,
    cintura: 82,
    largo_torso: 52,
  });

  const formattedPrice = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: displayProduct.currency,
        maximumFractionDigits: 0,
      }).format(displayProduct.price);
    } catch {
      return `${displayProduct.currency} ${displayProduct.price.toLocaleString(
        "es-AR"
      )}`;
    }
  }, [displayProduct.currency, displayProduct.price]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>{displayProduct.name}</h2>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        {displayProduct.subtitle}
      </p>

      <img
        src={displayProduct.imageUrl}
        alt={displayProduct.name}
        style={{ width: "100%", borderRadius: 12, marginBottom: 16 }}
      />

      <h3 style={{ margin: 0 }}>{formattedPrice}</h3>
      <p style={{ marginTop: 4, color: "#4b5563" }}>
        Color: <strong>{displayProduct.colorName}</strong>
      </p>

      <div style={{ margin: "24px 0" }}>
        <h3 style={{ marginBottom: 8 }}>Seleccioná un talle</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {DEMO_GARMENTS.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGarmentId(g.id as string)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border:
                  selectedGarmentId === g.id
                    ? "2px solid #111827"
                    : "1px solid #d1d5db",
                background:
                  selectedGarmentId === g.id ? "#111827" : "#ffffff",
                color:
                  selectedGarmentId === g.id ? "#f9fafb" : "#111827",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {g.sizeLabel}
            </button>
          ))}
        </div>
      </div>

      <VestiProductEmbed
        garment={selectedGarment}
        category="remera" // después lo conectamos con la categoría real
        userMeasures={userMeasures}
        onUserMeasuresChange={setUserMeasures}
      />
    </div>
  );
};

// Export default también, para que el import actual siga funcionando.
export default ProductPageVestiDemo;
