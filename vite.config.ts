import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    lib: {
      entry: "src/VestiProductEmbed.tsx",
      name: "VestiAI",
      formats: ["iife"],
      fileName: () => "vesti-ai-embed.js",
    },

    rollupOptions: {
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
