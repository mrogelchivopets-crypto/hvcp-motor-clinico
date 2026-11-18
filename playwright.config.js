import { defineConfig } from "@playwright/test";

// Usa el Chrome o Edge instalado en la computadora (no hace falta descargar Chromium).
// Cambie con la variable PW_CANAL=msedge si no tiene Google Chrome.
export default defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.js/,
  timeout: 10 * 60 * 1000,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.PW_CANAL || "chrome",
    headless: true,
  },
  webServer: {
    command: "node scripts/servir.mjs 5173",
    url: "http://127.0.0.1:5173/index.html",
    reuseExistingServer: true,
  },
});
