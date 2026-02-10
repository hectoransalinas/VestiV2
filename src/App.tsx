import { useEffect, useState } from "react";
import ProductPageVestiDemo from "./components/ProductPageVestiDemo";

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
  const params = new URLSearchParams(search);
  const isSizeGuideMode = params.get("mode") === "sizeguide";
  const isVestiDebug = params.get("vestiDebug") === "1";

  const [productFromShopify, setProductFromShopify] =
    useState<ProductFromShopify | null>(null);
  const [fullProductFromParent, setFullProductFromParent] =
    useState<FullProductFromParent | null>(null);

  useEffect(() => {
    const product = getProductFromQuery();
    setProductFromShopify(product);
  }, []);

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

      if (payload.type === "vesti:product" && payload.product) {
        setFullProductFromParent(payload.product as FullProductFromParent);

        if (payload.product?.handle || payload.product?.title) {
          setProductFromShopify((prev) => ({
            ...prev,
            productHandle: prev?.productHandle ?? payload.product.handle ?? null,
            productTitle: prev?.productTitle ?? payload.product.title ?? null,
            imageUrl: prev?.imageUrl ?? payload.product.imageUrl ?? null,
            price: prev?.price ?? payload.product.price ?? null,
            currency: prev?.currency ?? payload.product.currency ?? null,
            colorName: prev?.colorName ?? payload.product.colorName ?? null,
          }));
        }
      }
    };

    window.addEventListener("message", listener);

    try {
      window.parent?.postMessage(
        JSON.stringify({ type: "vesti:ready" }),
        "*"
      );
    } catch {}

    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
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
        <ProductPageVestiDemo />
      )}
    </div>
  );
}
