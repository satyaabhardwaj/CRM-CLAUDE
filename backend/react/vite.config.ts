import { defineConfig } from "vite";
export default defineConfig({
  base: "/auth-assets/",
  build: {
    outDir: "../web/assets",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: { login: "src/login.tsx", session: "src/session.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
