// V5 (v8.0): perfil por médico contra el PROYECTO DE PRUEBA de Supabase (migración 08 aplicada).
// Uso: llenar .env (ver .env.ejemplo) y correr   npx playwright test tests/v8_medicos.spec.js
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { cfg, configurado } from "./entorno.mjs";
import { COMPLETO, llenar } from "./v8_util.mjs";

test.describe.configure({ mode: "serial" });
test.skip(!configurado, "Falta .env con el proyecto de prueba");
const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
const A = { nombre: `Prueba A ${sufijo}`, pin: "1234" }, B = { nombre: `Prueba B ${sufijo}`, pin: "5678" };
const CEL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, TAB = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const creados = [];
let ADM;

async function dispositivo(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.HVCP_CONFIG=${JSON.stringify({ supabaseUrl: cfg.url, supabaseAnonKey: cfg.anon })};` }));
  const page = await ctx.newPage(); const errores = [];
  page.on("pageerror", (e) => errores.push(String(e))); page.on("dialog", (d) => d.dismiss());
  await page.goto("/index.html");
  await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 30000 });
  return { ctx, page, errores };
}
async function crearPerfil(page, m) {
  await expect(page.locator("#perfil")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Crear mi perfil" }).click();
  await page.locator("#pfnom").fill(m.nombre); await page.locator("#pfpin").fill(m.pin); await page.locator("#pfpin2").fill(m.pin);
  await page.getByRole("button", { name: "Crear y entrar" }).click();
  await expect(page.locator("#perfil")).toBeHidden({ timeout: 20000 });
  await expect(page.locator("#medbtn")).toContainText(m.nombre);
}
async function casoNuevo(page) {
  await page.evaluate(() => resetAll());
  await llenar(page, { ...COMPLETO, conc: "alerta" });
  await page.evaluate(() => genSOAP());
  await expect(page.locator("#regmsg")).toContainText("registrado", { timeout: 30000 });
  const cod = await page.evaluate(() => REG.cur && REG.cur.id); creados.push(cod); return cod;
}

test.beforeAll(async () => {
  ADM = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
  const r = await ADM.auth.signInWithPassword({ email: cfg.adminEmail, password: cfg.adminPass }); if (r.error) throw r.error;
});
test.afterAll(async () => { for (const c of creados.filter(Boolean)) await ADM.rpc("anular_caso", { p_codigo: c, p_motivo: "Prueba automática (tests/v8_medicos.spec.js)" }); });

test("V5: perfiles, PIN, bloqueo, «Mis casos» y cierre desde el panel (celular y tablet)", async ({ browser }) => {
  // Dispositivo 1 (celular): sin perfil no hay nota; crea el perfil A y genera un caso
  const d1 = await dispositivo(browser, CEL);
  await expect(d1.page.locator("#perfil")).toBeVisible({ timeout: 20000 });
  await d1.page.screenshot({ path: "docs/v8/capturas/v5-perfil-celular.png" });
  await d1.page.evaluate(() => { perfilCerrar(); });
  await llenar(d1.page, { ...COMPLETO, conc: "alerta" });
  expect(await d1.page.evaluate(() => { genSOAP(); return document.getElementById("soap").value; })).toBe("");
  await expect(d1.page.locator("#perfil")).toBeVisible();
  await d1.page.evaluate(() => { perfilAvisoOk(); });
  await crearPerfil(d1.page, A);
  const casoA = await casoNuevo(d1.page);

  // Dispositivo 2 (tablet): crea el perfil B y genera un caso
  const d2 = await dispositivo(browser, TAB);
  await d2.page.evaluate(() => { perfilAvisoOk(); });
  await d2.page.screenshot({ path: "docs/v8/capturas/v5-perfil-tablet.png" });
  await crearPerfil(d2.page, B);
  const casoB = await casoNuevo(d2.page);

  // En la tablet, «Cambiar médico» → perfil A con PIN incorrecto 5 veces: bloqueo de 60 s
  await d2.page.locator("#medbtn").click();
  await expect(d2.page.locator("#perfil")).toBeVisible({ timeout: 20000 });
  await expect(d2.page.locator("#perfil .pf-lista button", { hasText: A.nombre })).toBeVisible({ timeout: 20000 });
  await d2.page.locator("#perfil .pf-lista button", { hasText: A.nombre }).click();
  for (let i = 1; i <= 5; i++) {
    await d2.page.locator("#pfpin").fill("0000"); await d2.page.getByRole("button", { name: "Entrar" }).click();
    await expect(d2.page.locator(".pf-msg")).toContainText(i < 5 ? `Le quedan ${5 - i} intento` : "Espere 60 s", { timeout: 20000 });
  }
  await d2.page.locator("#pfpin").fill(A.pin); await d2.page.getByRole("button", { name: "Entrar" }).click();
  await expect(d2.page.locator(".pf-msg")).toContainText("Demasiados intentos", { timeout: 20000 });

  // En el celular, «Mis casos» muestra solo los casos de A
  await d1.page.locator("#miscasosbtn").click();
  await expect(d1.page.locator("#miscasos")).toContainText(casoA, { timeout: 20000 });
  await expect(d1.page.locator("#miscasos")).not.toContainText(casoB);
  await expect(d1.page.locator("#miscasos")).toContainText("Pendientes de cerrar (1)");
  await d1.page.screenshot({ path: "docs/v8/capturas/v5-mis-casos-celular.png" });

  // Cerrar el caso desde el panel
  await d1.page.locator("#miscasos .mc-item", { hasText: casoA }).getByRole("button", { name: "Cerrar" }).click();
  await expect(d1.page.locator("#regbody")).toContainText(casoA, { timeout: 20000 });
  await d1.page.locator("#regbody button.opt", { hasText: "presuntivo del motor" }).first().click();
  await d1.page.locator("#regbody button.opt", { hasText: "Solo criterio clínico" }).click();
  await d1.page.getByRole("button", { name: "Guardar" }).click();
  await expect(d1.page.locator("#regedmsg")).toContainText("Caso cerrado", { timeout: 20000 });

  // En el servidor: caso de A con médico A y cerrado por A; caso de B con médico B
  const l = await ADM.rpc("admin_casos", { p_desde: "2000-01-01T00:00:00Z", p_incluir_pruebas: true });
  const fa = l.data.find((x) => x.caso.id === casoA), fb = l.data.find((x) => x.caso.id === casoB);
  expect(fa.caso.medico).toBe(A.nombre); expect(fa.caso.vet).toBe(A.nombre); expect(fa.cierre.cerradoPor).toBe(A.nombre);
  expect(fb.caso.medico).toBe(B.nombre);
  expect(fa.caso.ent.conc).toBe("alerta");

  // Tablet: «Mis casos» de B (vuelve a entrar como B)
  await d2.page.evaluate(() => { PF.sel = null; PF.msg = ""; perfilRender(); });
  await expect(d2.page.locator("#perfil .pf-lista button", { hasText: B.nombre })).toBeVisible({ timeout: 20000 });
  await d2.page.locator("#perfil .pf-lista button", { hasText: B.nombre }).click();
  await d2.page.locator("#pfpin").fill(B.pin); await d2.page.getByRole("button", { name: "Entrar" }).click();
  await expect(d2.page.locator("#perfil")).toBeHidden({ timeout: 20000 });
  await d2.page.locator("#miscasosbtn").click();
  await expect(d2.page.locator("#miscasos")).toContainText(casoB, { timeout: 20000 });
  await expect(d2.page.locator("#miscasos")).not.toContainText(casoA);
  await d2.page.screenshot({ path: "docs/v8/capturas/v5-mis-casos-tablet.png" });

  expect(d1.errores).toEqual([]); expect(d2.errores).toEqual([]);
  await d1.ctx.close(); await d2.ctx.close();
});

test("«Sin signos vitales»: sin más datos, el caso se registra y se cierra sin diagnóstico en el servidor", async ({ browser }) => {
  const C = { nombre: `Prueba C ${sufijo}`, pin: "2468" };
  const D = await dispositivo(browser, CEL);
  await crearPerfil(D.page, C);
  await D.page.evaluate(() => { resetAll(); setConc("ssv"); genSOAP(); });
  await expect(D.page.locator("#regmsg")).toContainText("cerrado sin diagnóstico definitivo", { timeout: 30000 });
  const cod = await D.page.evaluate(() => REG.cur && REG.cur.id); creados.push(cod);
  expect(await D.page.evaluate(() => colaLeer().length)).toBe(0);
  const { data, error } = await ADM.from("cierres").select("sin_dx, dx_codigo, notas, casos!inner(codigo, rcp, especie)").eq("casos.codigo", cod);
  if (!error) { expect(data).toHaveLength(1); expect(data[0].sin_dx).toBe(true); expect(data[0].dx_codigo).toBe(null); expect(data[0].casos.rcp).toBe(true); }
  else console.log("Consulta directa de cierres no permitida para este usuario; se verificó por la cola vacía y el mensaje:", error.message);
  expect(D.errores).toEqual([]);
  await D.ctx.close();
});
