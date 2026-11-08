import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = process.cwd();
const webRoot = path.resolve(root, "web");

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(webRoot, "src"), "@shared": path.resolve(root, "shared") },
  },
  build: { outDir: path.resolve(root, "public"), emptyOutDir: true, sourcemap: false },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [root] },
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/auth": "http://127.0.0.1:8788",
      "/setup": "http://127.0.0.1:8788",
    },
  },
});
