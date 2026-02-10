import { useEffect, useMemo, useState } from "react";
import ProductPageVestiDemo from "./components/ProductPageVestiDemo";

/**
 * App.tsx (sizeguide embed)
 * - Oculta el panel de debug por defecto (solo ?vestiDebug=1)
 * - Recibe el producto real por postMessage desde el loader de Shopify
 * - ✅ Fix: cachea el último producto recibido a nivel window para evitar race condition
 *   (si el parent envía vesti:product ANTES de que React monte, igual lo capturamos)
 */

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
  category: "upper" | "pants" | "shoes";
  title?: string;
  handle?: string;
  imageUrl?: string;
  price?: string;
  currency?: string;
  colorName?: string;
  measurements: any;
};

declare global {
  interface Window {
    __VESTI_LAST_PRODUCT__?: FullProductFromParent | null;
    __VESTI_LISTENER_READY__?: boolean;
  }
}

function safeParseJson(input: any): any | null {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return null;
}


function getVestiProductCandidate(payload: any): any | null {
  if (!payload) return null;

  // soporta varios formatos de loader:
  // 1) { type: "vesti:product", product: {...} }
  // 2) { type: "VESTI_PRODUCT_READY", payload: {...} }
  // 3) { type: "...", data: {...} }
  const t = payload.type;

  const candidate =
    payload.product ?? payload.payload ?? payload.data ?? payload.detail ?? null;

  if (!candidate) return null;

  // Si no tiene forma de producto, igual lo dejamos pasar; la pantalla demo valida.
  // Tipos aceptados (si no hay type, igual aceptamos si viene "category" o "measurements")
  const typeOk =
    t === "vesti:product" ||
    t === "VESTI_PRODUCT_READY" ||
    t === "vesti:productReady" ||
    t === "VESTI_PRODUCT" ||
    t === "PRODUCT_READY" ||
    t === "vesti:product_ready" ||
    t === "vesti:product:ready" ||
    t === "VESTI:PRODUCT" ||
    t == null;

  const shapeOk =
    candidate.category != null || candidate.measurements != null || candidate.handle != null;

  if (typeOk && shapeOk) return candidate;

  // Último recurso: si parece producto (tiene title/handle/measurements), lo aceptamos.
  if (shapeOk) return candidate;

  return null;
}

/** Listener global (fuera de React) para capturar mensajes tempranos */
(function attachEarlyListener() {
  if (typeof window === "undefined") return;
  if (window.__VESTI_LISTENER_READY__) return;

  window.__VESTI_LISTENER_READY__ = true;

  window.addEventListener("message", (event: MessageEvent) => {
    const payload = safeParseJson(event.data);
    if (!payload) return;

    const cand = getVestiProductCandidate(payload);
    if (cand) {
      window.__VESTI_LAST_PRODUCT__ = cand as FullProductFromParent;
    }
  });
})();

function getProductFromQuery(): ProductFromShopify | null {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);

  const productId = params.get("productId");
  const productHandle = params.get("handle") || params.get("productHandle");
  const productTitle = params.get("title") || params.get("productTitle");
  const shop = params.get("shop");
  const imageUrl = params.get("imageUrl");
  const price = params.get("price");
  const currency = params.get("currency");
  const colorName = params.get("colorName");

  const hasAny =
    productId || productHandle || productTitle || shop || imageUrl || price;

  if (!hasAny) return null;

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
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const isSizeGuideMode = params.get("mode") === "sizeguide";
  const isVestiDebug = params.get("vestiDebug") === "1";

  const [productFromShopify, setProductFromShopify] =
    useState<ProductFromShopify | null>(null);

  // ✅ inicializa desde el cache si el mensaje llegó antes
  const [fullProductFromParent, setFullProductFromParent] =
    useState<FullProductFromParent | null>(() => {
      if (typeof window === "undefined") return null;
      return window.__VESTI_LAST_PRODUCT__ ?? null;
    });

  useEffect(() => {
    const product = getProductFromQuery();
    setProductFromShopify(product);
  }, []);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const payload = safeParseJson(event.data);
      if (!payload) return;

      const cand = getVestiProductCandidate(payload);
      if (cand) {
        const p = cand as FullProductFromParent;
        window.__VESTI_LAST_PRODUCT__ = p;
        setFullProductFromParent(p);

        if (p?.handle || p?.title) {
          setProductFromShopify((prev) => ({
            ...prev,
            productHandle: prev?.productHandle ?? p.handle ?? null,
            productTitle: prev?.productTitle ?? p.title ?? null,
            imageUrl: prev?.imageUrl ?? p.imageUrl ?? null,
            price: prev?.price ?? p.price ?? null,
            currency: prev?.currency ?? p.currency ?? null,
            colorName: prev?.colorName ?? p.colorName ?? null,
          }));
        }
      }
    };

    window.addEventListener("message", listener);

    // avisamos al parent que estamos listos (si el loader usa handshake)
    try {
      window.parent?.postMessage(JSON.stringify({ type: "vesti:ready" }), "*");
    } catch {}

    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
      {/* Debug Panel: visible solo con ?vestiDebug=1 */}
      {isVestiDebug && productFromShopify && (
        <div
          style={{
            background: "#000",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
          }}
        >
          <strong>Vesti · Debug (Shopify)</strong>
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
        // mode=sizeguide: esperamos el producto real del loader
        fullProductFromParent ? (
          <ProductPageVestiDemo
            productFromShopify={productFromShopify ?? undefined}
            fullProductFromParent={fullProductFromParent}
          />
        ) : (
          <div style={{ padding: 16, fontFamily: "system-ui" }}>
            Cargando producto…
          </div>
        )
      ) : (
        // modo dev / web normal
        <ProductPageVestiDemo />
      )}
    </div>
  );
}