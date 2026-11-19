// Exporta la guía rápida a imagen (para WhatsApp) y PDF (para imprimir).
// Uso: node scripts/exportar_guia.mjs   → guia/Guia-rapida-Motor-Clinico.png y .pdf
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const dir = resolve(fileURLToPath(new URL("../guia", import.meta.url)));
const url = pathToFileURL(resolve(dir, "guia-rapida.html")).href;
const browser = await chromium.launch({ channel: process.env.PW_CANAL || "chrome" });
const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForLoadState("networkidle");
const alto = await page.evaluate(() => document.body.scrollHeight);
console.log("alto de la página:", alto, alto > 1056 ? "(¡no cabe en una carta!)" : "(cabe en una carta)");
await page.screenshot({ path: resolve(dir, "Guia-rapida-Motor-Clinico.png"), fullPage: true });
await page.pdf({ path: resolve(dir, "Guia-rapida-Motor-Clinico.pdf"), format: "Letter", printBackground: true, pageRanges: "1" });
await browser.close();
console.log("listo");
