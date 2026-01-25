import React from "react";

// In the repo this file should live under `src/embed/`.
// Therefore, ProductPageVestiDemo is typically at `src/components/ProductPageVestiDemo.tsx`.
// (If your structure differs, adjust this import accordingly.)
import ProductPageVestiDemo from "../components/ProductPageVestiDemo";

export type VestiEmbedWidgetMode = "default" | "sizeguide";

export type VestiEmbedWidgetProps = {
  /** Optional rendering mode (e.g. when opened inside the Shopify iframe modal). */
  mode?: VestiEmbedWidgetMode | string;
  /** Product payload coming from Shopify (window.VESTI_PRODUCT). */
  product?: any | null;
};

/**
 * Embedded widget entry.
 *
 * IMPORTANT: This component must be a real value export named `VestiEmbedWidget`.
 * If it is missing, the embed bundle will throw `ReferenceError: VestiEmbedWidget is not defined`.
 */
export function VestiEmbedWidget({ mode, product }: VestiEmbedWidgetProps) {
  const embedded = (mode || "") === "sizeguide";

  return (
    <ProductPageVestiDemo
      embeddedMode={embedded}
      fullProductFromParent={(product || undefined) as any}
    />
  );
}
