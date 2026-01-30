import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // ✅ Dedicated config for Shopify embed build
  build: {
    outDir: "dist-embed",
    emptyOutDir: true,

    lib: {
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
