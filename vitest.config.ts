import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/test/**/*.test.ts", "workers/**/test/**/*.test.ts", "packages/**/test/**/*.test.ts"],
    environment: "node",
    reporters: "default",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["apps/**/src/**", "workers/**/src/**", "packages/**/src/**"],
      exclude: ["**/*.test.ts", "**/test/**"],
    },
  },
});
