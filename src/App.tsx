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

// ---------------------------------------
// Leer datos simples desde el querystring
// ---------------------------------------
function getProductFromQuery(): ProductFromShopify | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);

  const productId = params.get("productId");
  const productHandle = params.get("productHandle");
  const productTitle = params.get("productTitle");
  const shop = params.get("shop");

  // imageUrl puede venir url-encoded en la query → intentamos decodificar
  const rawImageUrl = params.get("imageUrl");
  let imageUrl: string | null = null;
  if (rawImageUrl) {
    try {
      imageUrl = decodeURIComponent(rawImageUrl);
    } catch {
      imageUrl = rawImageUrl;
    }
  }

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
    imageUrl,
    price,
    currency,
    colorName,
  };
}

export default function App() {
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
  //    y usar esos datos como fuente de verdad (imagen, precio, etc.).
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

        // 🔧 Parcheamos productFromShopify con los datos buenos del loader
        setProductFromShopify((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            imageUrl: fullProduct.imageUrl || prev.imageUrl || null,
            price:
              fullProduct.price != null
                ? String(fullProduct.price)
                : prev.price ?? null,
            currency: fullProduct.currency || prev.currency || null,
            colorName: fullProduct.colorName || prev.colorName || null,
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

      <ProductPageVestiDemo
        productFromShopify={productFromShopify ?? undefined}
        fullProductFromParent={fullProductFromParent ?? undefined}
      />
    </div>
  );
}
