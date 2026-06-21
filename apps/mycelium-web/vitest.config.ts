import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");

export default defineConfig({
  root: appRoot,
  resolve: {
    alias: {
      "@mycelium/client": resolve(repoRoot, "src/client"),
    },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
