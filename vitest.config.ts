import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: process.env.TEST_DATABASE_URL ? ["tests/*.test.ts"] : ["tests/format.test.ts"] }, resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } } });
