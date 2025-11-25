import React, { useEffect, useMemo } from "react";
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

export function App() {
  const productFromShopify = useMemo(getProductFromQuery, []);
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
        "[VestiAI] Datos de producto recibidos desde Shopify:",
        productFromShopify
      );
    } else {
      console.log("[VestiAI] No se recibieron datos de producto en la URL.");
    }
  }, [hasProduct, productFromShopify]);

  return (
    <>
      {hasProduct && productFromShopify && (
        <div
          style={{
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
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

      {/* La página demo original sigue igual, solo que ahora recibe los datos */}
      <ProductPageVestiDemo productFromShopify={productFromShopify || undefined} />
    </>
  );
}

export default App;

