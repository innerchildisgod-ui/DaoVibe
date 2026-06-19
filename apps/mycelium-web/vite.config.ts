import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");

export default defineConfig({
  root: appRoot,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@mycelium/client": resolve(repoRoot, "src/client"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [appRoot, resolve(repoRoot, "src/client")],
    },
  },
});
