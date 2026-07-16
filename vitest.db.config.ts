import { defineConfig } from "vitest/config";
import path from "path";

// DB integration tests: run against a live local Supabase Postgres.
// Start the stack with `npx supabase start`, then `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.db.test.ts"],
    // A fresh reset + connection can take a moment.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
