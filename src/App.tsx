import React, { useMemo } from "react";
import { ProductPageVestiDemo } from "./components/ProductPageVestiDemo";

type ProductFromShopify = {
  productId?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  shop?: string | null;
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

export default function App() {
  const productFromShopify = useMemo(() => getProductFromQuery(), []);

  if (productFromShopify) {
    console.log("[VestiAI] Datos de producto recibidos desde Shopify:", {
      productId: productFromShopify.productId,
      productHandle: productFromShopify.productHandle,
      productTitle: productFromShopify.productTitle,
      shop: productFromShopify.shop,
    });
  } else {
    console.log(
      "[VestiAI] Sin parámetros de producto en la URL (modo demo local)."
    );
  }

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh" }}>
      {productFromShopify && productFromShopify.productTitle && (
        <div
          style={{
            background: "#111827",
            color: "#e5e7eb",
            padding: "8px 16px",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <strong>Vesti AI · Integración Shopify</strong>{" "}
            – Producto recibido:&nbsp;
            <strong>{productFromShopify.productTitle}</strong>
          </span>
          {productFromShopify.shop && (
            <span style={{ opacity: 0.7 }}>
              tienda: {productFromShopify.shop}
            </span>
          )}
        </div>
      )}

      <ProductPageVestiDemo />
    </div>
  );
}
