import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", timeout: 45_000, use: { baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000", browserName: "chromium", channel: "chrome", headless: true, trace: "retain-on-failure" }, reporter: "list", workers: 1 });
