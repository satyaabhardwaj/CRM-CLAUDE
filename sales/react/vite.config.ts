import { defineConfig } from "vite";
export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  base: "/sales/assets/",
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
