import React, { useEffect, useMemo, useState } from "react";
import { ProductPageVestiDemo } from "./components/ProductPageVestiDemo";

type ProductFromShopify = {
  productId?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  shop?: string | null;
};

type ShopifyVariantFromParent = {
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
};

export type ShopifyFullProductFromParent = {
  id: string | number;
  title: string;
  category: string;
  variants: ShopifyVariantFromParent[];
};

function getProductFromQuery(): ProductFromShopify | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);

  const productId = params.get("productId");
  const productHandle = params.get("productHandle");
  const productTitle = params.get("productTitle");
  const shop = params.get("shop");

  if (!productId && !productHandle && !productTitle && !shop) {
    return null;
  }

  return {
    productId,
    productHandle,
    productTitle,
    shop,
  };
}

export function App() {
  const productFromShopify = useMemo(getProductFromQuery, []);
  const [fullProductFromParent, setFullProductFromParent] =
    useState<ShopifyFullProductFromParent | null>(null);

  const hasProduct =
    !!productFromShopify &&
    !!(
      productFromShopify.productId ||
      productFromShopify.productHandle ||
      productFromShopify.productTitle ||
      productFromShopify.shop
    );

  useEffect(() => {
    if (hasProduct && productFromShopify) {
      console.log(
        "[VestiAI] Datos de producto recibidos desde Shopify (URL):",
        productFromShopify
      );
    } else {
      console.log("[VestiAI] No se recibieron datos de producto en la URL.");
    }
  }, [hasProduct, productFromShopify]);

  // Handshake con la página Shopify (parent) para recibir VESTI_PRODUCT completo
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data) return;

      let payload: any = data;
      if (typeof data === "string") {
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (payload.type === "vesti:product" && payload.payload) {
        setFullProductFromParent(
          payload.payload as ShopifyFullProductFromParent
        );
        console.log(
          "[VestiAI] Producto completo recibido vía postMessage:",
          payload.payload
        );
      }
    }

    window.addEventListener("message", handleMessage);

    // Avisar al parent que el iframe está listo para recibir el producto
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "vesti:ready" }, "*");
        console.log("[VestiAI] Mensaje vesti:ready enviado al parent.");
      }
    } catch (err) {
      console.warn("[VestiAI] No se pudo enviar vesti:ready al parent:", err);
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <>
      {hasProduct && productFromShopify && (
        <div
          style={{
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            borderBottom: "1px solid #333",
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

      {/* La página demo original ahora también puede recibir el producto completo */}
      <ProductPageVestiDemo
        productFromShopify={productFromShopify || undefined}
        fullProductFromParent={fullProductFromParent || undefined}
      />
    </>
  );
}

export default App;
