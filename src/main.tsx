import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { VestiProductEmbed } from "./embed/VestiProductEmbed";
import { VestiEmbedWidget } from "./embed/VestiEmbedWidget";
import type {
  Garment,
  GarmentCategory,
  Measurements,
  FitResult,
} from "./motor/fitEngine";

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

export type VestiInitOptions = {
  containerId?: string;
  container?: HTMLElement | null;
  garment: Garment;
  category?: GarmentCategory;
  perfilInicial?: Measurements;
  onRecomendacion?: (data: {
    fit: FitResult;
    tallaSugerida: string | null;
    tallaActual: string | null;
  }) => void;
};

declare global {
  interface Window {
    VestiAI?: {
      init: (options: VestiInitOptions) => void;
    };
  }
}

window.VestiAI = {
  init: (options: VestiInitOptions) => {
    try {
      const container =
        options.container ??
        (options.containerId
          ? document.getElementById(options.containerId)
          : document.getElementById("vesti-embed-root"));

      if (!container) {
        console.error(
          "[VestiAI] No se encontró el contenedor. Pasá container o containerId."
        );
        return;
      }

      const root = ReactDOM.createRoot(container);
      root.render(
        <React.StrictMode>
          <VestiProductEmbed
            garment={options.garment}
            category={options.category}
            perfilInicial={options.perfilInicial}
            onRecomendacion={options.onRecomendacion}
          />
        </React.StrictMode>
      );
    } catch (err) {
      console.error("[VestiAI] Error inicializando el widget:", err);
    }
  },
};

// Compat: algunas versiones (o minificados) referencian un símbolo global.
// Esto evita el ReferenceError "VestiEmbedWidget is not defined".
(window as any).VestiEmbedWidget = VestiEmbedWidget;
