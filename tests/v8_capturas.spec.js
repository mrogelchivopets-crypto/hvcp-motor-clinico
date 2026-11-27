// Capturas de la v8.0 en celular y tablet (sin red): recuadro hemodinámico en 3 colores, aviso de obligatorios y
// «Recuperar paciente en curso». Se guardan en docs/v8/capturas. Las de perfil y «Mis casos» las hace v8_medicos.spec.js.
import { test } from "@playwright/test";
import { abrir } from "./v8_util.mjs";
const DISP = { celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } };
for (const [nom, opts] of Object.entries(DISP)) test(`capturas v8.0 · ${nom}`, async ({ browser }) => {
  const { ctx, page } = await abrir(browser, opts);
  for (const [k, ex] of [["estable", { fc: "110", muc: "rosa", tllc: "n", pulso: "n" }], ["compensado", { fc: "170", muc: "rosa", tllc: "l", pulso: "n" }], ["descompensado", { fc: "120", muc: "gris", tllc: "l3", pulso: "fil" }]]) {
    await page.evaluate((ex) => { resetAll(); setEsp("c"); setPeso("20"); setEdad("e2"); setConc("alerta"); for (const [c, v] of Object.entries(ex)) setEx(c, v); }, ex);
    const f = page.locator("#s1 .field", { has: page.locator(".hemobox") });
    await f.scrollIntoViewIfNeeded(); await f.screenshot({ path: `docs/v8/capturas/hemo-${k}-${nom}.png` });
  }
  await page.evaluate(() => { resetAll(); setEsp("c"); setConc("alerta"); ST.avisoMot = true; setMotivo("dig"); toggleSign("vom"); genSOAP(); });
  await page.waitForTimeout(300); await page.screenshot({ path: `docs/v8/capturas/obligatorios-${nom}.png` });
  await page.evaluate(() => avisoCerrar());
  await page.evaluate(() => { resetAll(); setEsp("f"); setPeso("4.2"); setConc("dep"); setEx("fc", "210"); ST.avisoMot = true; setMotivo("uro"); });
  await page.waitForTimeout(2600); await page.reload(); await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/v8/capturas/recuperar-${nom}.png` });
  await ctx.close();
});
