import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests unitarios (npm test). Van junto al código: src/**/*.test.ts.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
