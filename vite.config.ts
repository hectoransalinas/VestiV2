import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    // Shopify embed: single self-contained script (no window.React dependency)
    lib: {
      // ✅ Real embed entry inside /src/embed
      entry: "src/embed/VestiProductEmbed.tsx",
      name: "VestiAI",
      formats: ["iife"],
      fileName: () => "vesti-ai-embed.js",
    },

    rollupOptions: {
      // 🔴 IMPORTANT: do NOT externalize React / jsx-runtime
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
  },

  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
