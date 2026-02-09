import { useEffect, useState } from "react";
import ProductPageVestiDemo from "./components/ProductPageVestiDemo";

type ProductFromShopify = {
  productId?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  shop?: string | null;
  imageUrl?: string | null;
  price?: string | null; // lo manejamos como string en este nivel
  currency?: string | null;
  colorName?: string | null;
};

type FullProductFromParent = {
  id: string | number;
  title: string;
  category: string;
  imageUrl?: string;
  price?: number; // 👈 viene desde Shopify en centavos
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

// ---------------------------------------
// Leer datos básicos desde el querystring
// (NO usamos la imageUrl de la query)
// ---------------------------------------
function getProductFromQuery(): ProductFromShopify | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);

  const productId = params.get("productId");
  const productHandle = params.get("productHandle");
  const productTitle = params.get("productTitle");
  const shop = params.get("shop");

  const price = params.get("price");
  const currency = params.get("currency");
  const colorName = params.get("colorName");

  if (!productId && !productHandle && !productTitle && !shop) {
    return null;
  }

  return {
    productId,
    productHandle,
    productTitle,
    shop,
    imageUrl: null, // 👈 imageUrl se completará SOLO con el loader
    price,
    currency,
    colorName,
  };
}

export default function App() {
  // Modo "sizeguide" (cuando se abre dentro del modal/iframe desde Shopify)
  // El loader de Shopify agrega ?mode=sizeguide
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const isSizeGuideMode = params.get("mode") === "sizeguide";

  const [productFromShopify, setProductFromShopify] =
    useState<ProductFromShopify | null>(null);
  const [fullProductFromParent, setFullProductFromParent] =
    useState<FullProductFromParent | null>(null);

  // 1) Cargar datos básicos desde la URL al montar
  useEffect(() => {
    const product = getProductFromQuery();

    if (product) {
      console.log(
        "[VestiAI] Datos de producto recibidos desde Shopify (URL):",
        product
      );
    } else {
      console.log(
        "[VestiAI] No se recibieron datos de producto en la URL."
      );
    }

    setProductFromShopify(product);
  }, []);

  // 2) Handshake con el parent (vesti-loader.js) para recibir VESTI_PRODUCT
  //    y usar ESA imageUrl + price/currency/colorName como fuente de verdad.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!event.data) return;

      let payload: any = event.data;

      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (payload.type === "vesti:product" && payload.payload) {
        const fullProduct = payload.payload as FullProductFromParent;

        console.log(
          "[VestiAI] Producto completo recibido vía postMessage:",
          fullProduct
        );
        setFullProductFromParent(fullProduct);

        // 👇 Ahora sincronizamos también precio / moneda / color
        setProductFromShopify((prev) => {
          const base: ProductFromShopify =
            prev ?? {
              productId: null,
              productHandle: null,
              productTitle: fullProduct.title ?? null,
              shop: null,
              imageUrl: null,
              price: null,
              currency: null,
              colorName: null,
            };

          // fullProduct.price viene en centavos desde Shopify (product.js)
          const priceFromFull =
            typeof fullProduct.price === "number"
              ? String(Math.round(fullProduct.price / 100))
              : null;

          return {
            ...base,
            imageUrl: fullProduct.imageUrl || base.imageUrl,
            price: priceFromFull ?? base.price,
            currency: fullProduct.currency || base.currency,
            colorName: fullProduct.colorName || base.colorName,
          };
        });
      }
    };

    window.addEventListener("message", listener);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "vesti:ready" }, "*");
        console.log("[VestiAI] Mensaje vesti:ready enviado al parent.");
      }
    } catch (err) {
      console.warn("[VestiAI] Error enviando vesti:ready:", err);
    }

    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
      {/* Barra de debug con info básica del producto */}
      {productFromShopify && (
        <div
          style={{
            background: "#000",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
          }}
        >
          <strong>Vesti AI · Datos de producto desde Shopify</strong>
          <div style={{ marginTop: 4 }}>
            <div>
              <strong>Título:</strong>{" "}
              {productFromShopify.productTitle || "—"}
            </div>
            <div>
              <strong>Handle:</strong>{" "}
              {productFromShopify.productHandle || "—"}
            </div>
            <div>
              <strong>ID:</strong> {productFromShopify.productId || "—"}
            </div>
            <div>
              <strong>Shop:</strong> {productFromShopify.shop || "—"}
            </div>
          </div>
        </div>
      )}

      {isSizeGuideMode ? (
        // IMPORTANTE:
        // En mode=sizeguide el producto llega async por postMessage.
        // No debemos renderizar ningún componente que asuma que existe
        // `garment/category` antes de recibir `vesti:product`.
        fullProductFromParent ? (
          <ProductPageVestiDemo
            productFromShopify={productFromShopify ?? undefined}
            fullProductFromParent={fullProductFromParent}
          />
        ) : (
          <div
            style={{
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 260,
              color: "#0f172a",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Cargando guía de talles…
            </div>
            <div style={{ fontSize: 12, color: "#64748b", maxWidth: 420, textAlign: "center" }}>
              Estamos esperando los datos del producto desde la tienda.
            </div>

            {/* Skeleton simple para que nunca se vea “en blanco” */}
            <div
              style={{
                width: "min(720px, 100%)",
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: 12,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  height: 180,
                  borderRadius: 16,
                  border: "1px solid #e5e7eb",
                  background: "linear-gradient(90deg, #f8fafc, #eef2ff, #f8fafc)",
                }}
              />
              <div
                style={{
                  height: 180,
                  borderRadius: 16,
                  border: "1px solid #e5e7eb",
                  background: "linear-gradient(90deg, #f8fafc, #f1f5f9, #f8fafc)",
                }}
              />
            </div>
          </div>
        )
      ) : (
        <ProductPageVestiDemo
          productFromShopify={productFromShopify ?? undefined}
          fullProductFromParent={fullProductFromParent ?? undefined}
        />
      )}
    </div>
  );
}
