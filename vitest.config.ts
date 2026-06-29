import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

// Smoke-test config — pure-function unit tests for the libs that gate
// trust and integrity (rate limit hashing, outlier flagging, validation,
// vibe-tag lookup, bounty formatting). DB-touching paths are covered by
// integration-style tests that mock the pg query layer, not by hitting
// live Aurora — those would slow CI and create test data noise.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(root, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/mock-cafes.ts", "lib/db.ts", "lib/world-path.ts"],
    },
  },
});
