import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["__tests__/e2e/**", "node_modules"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/app/**/layout.tsx",
        // Azure-ARM helpers only run against a live subscription; they
        // are covered by integration tests, not unit coverage.
        "src/lib/azure-arm.ts",
        "src/lib/azure-pricing.ts",
        // Pure re-export barrel — nothing to cover.
        "src/lib/edc/index.ts",
      ],
      // Thresholds are a regression guard, set ~1% below the measured
      // values on main so CI catches genuine drops without nagging on
      // every unrelated PR. Raise as we ship more unit tests.
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
