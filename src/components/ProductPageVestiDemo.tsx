import React, { useEffect, useMemo, useState } from "react";
import { VestiProductEmbed } from "../embed/VestiProductEmbed";
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
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  colorName?: string | null;
  descriptionHtml?: string | null;
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
  }[];
};

type Props = {
  productFromShopify?: ProductFromShopify;
  fullProductFromParent?: FullProductFromParent;
};

const DEMO_PRODUCT = {
  name: "Campera Puffer Vesti·Fit",
  subtitle: "Recomendación de talle basada en el motor Vesti AI",
  price: 82999,
  currency: "ARS",
  colorName: "Verde petróleo",
  imageUrl:
    "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
  descriptionHtml: `
    <ul>
      <li>Relleno sintético liviano, ideal para media estación.</li>
      <li>Capucha desmontable y cierres termosellados.</li>
      <li>Fit regular unisex, pensado para uso urbano.</li>
    </ul>
  `,
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
    measures: { hombros: 42, pecho: 96, cintura: 80, largo_torso: 54 },
  },
  {
    id: "L",
    sizeLabel: "L",
    category: "remera",
    measures: { hombros: 44, pecho: 104, cintura: 90, largo_torso: 58 },
  },
  {
    id: "XL",
    sizeLabel: "XL",
    category: "remera",
    measures: { hombros: 46, pecho: 112, cintura: 100, largo_torso: 62 },
  },
];

const DEFAULT_USER_MEASURES: UserMeasures = {
  hombros: 43,
  pecho: 96,
  cintura: 82,
  largoTorso: 60,
};

export default function ProductPageVestiDemo({
  productFromShopify,
  fullProductFromParent,
}: Props) {
  const [userMeasures, setUserMeasures] =
    useState<UserMeasures | null>(DEFAULT_USER_MEASURES);

  const hasRealProduct =
    !!fullProductFromParent && fullProductFromParent.variants?.length > 0;

  const garments = useMemo(() => {
    if (hasRealProduct && fullProductFromParent?.variants?.length) {
      return fullProductFromParent.variants.map((variant) => {
        const m = variant.measures || {};
        return {
          id: variant.id,
          sizeLabel: variant.sizeLabel ?? String(variant.id),
          category: fullProductFromParent.category || "upper",
          measures: {
            hombros: m.hombros,
            pecho: m.pecho,
            cintura: m.cintura,
            largo_torso: m.largo_torso ?? m.largoTorso,
            stretch: m.stretch,
            ease: m.ease,
          },
        };
      });
    }
    return DEMO_GARMENTS;
  }, [hasRealProduct, fullProductFromParent]);

  const [selectedGarmentId, setSelectedGarmentId] = useState<
    string | number
  >(garments[0]?.id ?? "M");

  // Si cambian las variantes (producto nuevo), ajustar selección
  useEffect(() => {
    if (!garments.length) return;
    const exists = garments.some((g) => g.id === selectedGarmentId);
    if (!exists) {
      setSelectedGarmentId(garments[0].id);
    }
  }, [garments, selectedGarmentId]);

  const selectedGarment =
    garments.find((g) => g.id === selectedGarmentId) ?? garments[0];

  const displayProduct = useMemo(() => {
    const name =
      (hasRealProduct && fullProductFromParent?.title) ||
      productFromShopify?.productTitle ||
      DEMO_PRODUCT.name;

    const subtitle = hasRealProduct
      ? "Recomendación de talle para este producto de tu tienda"
      : DEMO_PRODUCT.subtitle;

    const price = (() => {
      if (hasRealProduct && typeof fullProductFromParent?.price === "number") {
        return fullProductFromParent.price;
      }
      if (productFromShopify?.price) {
        const parsed = Number(productFromShopify.price);
        return isNaN(parsed) ? DEMO_PRODUCT.price : parsed;
      }
      return DEMO_PRODUCT.price;
    })();

    const currency =
      (hasRealProduct && fullProductFromParent?.currency) ||
      productFromShopify?.currency ||
      DEMO_PRODUCT.currency;

    const colorName =
      (hasRealProduct && fullProductFromParent?.colorName) ||
      productFromShopify?.colorName ||
      DEMO_PRODUCT.colorName;

    const imageUrl =
      (hasRealProduct && fullProductFromParent?.imageUrl) ||
      productFromShopify?.imageUrl ||
      DEMO_PRODUCT.imageUrl;

    const descriptionHtml =
      (hasRealProduct && fullProductFromParent?.descriptionHtml) ||
      DEMO_PRODUCT.descriptionHtml;

    return {
      name,
      subtitle,
      price,
      currency,
      colorName,
      imageUrl,
      descriptionHtml,
    };
  }, [hasRealProduct, fullProductFromParent, productFromShopify]);

  const formattedPrice =
    typeof displayProduct.price === "number"
      ? new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: displayProduct.currency || "ARS",
          maximumFractionDigits: 0,
        }).format(displayProduct.price)
      : displayProduct.price;

  return (
    <div
      style={{
        minHeight: "100vh",
        maxWidth: 420,
        margin: "0 auto",
        padding: 16,
        background:
          "linear-gradient(180deg, #020617 0%, #020617 120px, #f9fafb 120px, #f9fafb 100%)",
        fontFamily:
          '-apple-system, system-ui, -system-ui, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      {/* Header negro con marca */}
      <header
        style={{
          color: "white",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            marginBottom: 4,
          }}
        >
          Vesti·AI – Probador inteligente
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Datos en tiempo real desde tu tienda
        </div>
        {hasRealProduct && (
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              opacity: 0.85,
            }}
          >
            Estás viendo: <strong>{displayProduct.name}</strong>
          </div>
        )}
      </header>

      {/* Tarjeta de producto */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 12,
          boxShadow:
            "0 18px 60px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.06)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          {/* Imagen */}
          <div
            style={{
              width: 110,
              height: 140,
              borderRadius: 12,
              overflow: "hidden",
              background: "#e5e7eb",
              flexShrink: 0,
            }}
          >
            <img
              src={displayProduct.imageUrl}
              alt={displayProduct.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>

          {/* Texto */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
                marginBottom: 2,
                lineHeight: 1.2,
              }}
            >
              {displayProduct.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#6b7280",
                marginBottom: 6,
              }}
            >
              {displayProduct.subtitle}
            </div>

            {/* Etiquetas / chips */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginBottom: 8,
              }}
            >
              {displayProduct.colorName && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                  }}
                >
                  Color: {displayProduct.colorName}
                </span>
              )}
              {hasRealProduct && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#ecfdf3",
                    color: "#15803d",
                  }}
                >
                  Producto real de tu tienda
                </span>
              )}
            </div>

            {/* Precio */}
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#111827",
                marginBottom: 4,
              }}
            >
              {formattedPrice}
            </div>
          </div>
        </div>

        {/* Descripción del producto */}
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
          {displayProduct.descriptionHtml ? (
            <div
              style={{ marginTop: 4 }}
              dangerouslySetInnerHTML={{
                __html: displayProduct.descriptionHtml,
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

      {/* Selector de talle (opcional, basado en variantes) */}
      {garments.length > 1 && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 6,
            }}
          >
            Talle de prenda a evaluar
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {garments.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGarmentId(g.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border:
                    g.id === selectedGarmentId
                      ? "1px solid #0f172a"
                      : "1px solid #e5e7eb",
                  background:
                    g.id === selectedGarmentId ? "#0f172a" : "white",
                  color: g.id === selectedGarmentId ? "white" : "#111827",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {g.sizeLabel || g.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Widget principal de Vesti */}
      <VestiProductEmbed
        garment={selectedGarment}
        category={fullProductFromParent?.category || "upper"}
        userMeasures={userMeasures}
        onUserMeasuresChange={setUserMeasures}
      />
    </div>
  );
}
