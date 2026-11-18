// Flujo completo en el navegador contra el PROYECTO DE PRUEBA de Supabase:
// SOAP crea el caso · «No registrar» · cola sin conexión y reconexión · cierre con el código MC
// desde otro dispositivo · acceso del admin, lista y Excel con la columna «Veterinario».
// Uso: llenar .env (ver .env.ejemplo) y correr   npm run test:flujo
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { cfg, configurado } from "./entorno.mjs";

test.describe.configure({ mode: "serial" });
const SOAP_COD = /Registro Motor Clínico: (MC-[A-HJ-NP-Z2-9]{6})/;
let ADM, codigoNormal, codigoOffline, codigoPrueba;

// Sirve un config.js con el proyecto de prueba (el del repositorio queda con marcadores).
async function dispositivo(browser, { conConfig = true } = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  if (conConfig) {
    await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript",
      body: `window.HVCP_CONFIG=${JSON.stringify({ supabaseUrl: cfg.url, supabaseAnonKey: cfg.anon })};` }));
  }
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto("/index.html");
  return { ctx, page, errores };
}

async function pacienteYSoap(page) {
  await page.locator("#s1 button.opt", { hasText: "Canino" }).click();
  await page.locator("#s2 .mot").first().click();
  await page.locator("#s2 .chip").first().click();
  await page.getByRole("button", { name: "Generar nota SOAP" }).click();
  return page.locator("#soap").inputValue();
}

test("sin configuración el motor funciona igual, guarda en cola y no intenta conectarse", async ({ browser }) => {
  const { ctx, page, errores } = await dispositivo(browser, { conConfig: false });
  const remotas = [];
  page.on("request", (r) => { if (/supabase|jsdelivr/.test(r.url())) remotas.push(r.url()); });
  const soap = await pacienteYSoap(page);
  expect(soap).toContain("Motor Clínico HVCP v7.9.6");
  // El caso queda en la cola del dispositivo y se enviará cuando el registro esté configurado.
  await expect(page.locator("#netst")).toHaveText("1 caso pendiente");
  expect(remotas).toEqual([]);
  expect(errores).toEqual([]);
  await ctx.close();
});

test.describe("con el proyecto de prueba", () => {
  test.skip(!configurado, "Falta .env con el proyecto de prueba (ver .env.ejemplo)");

  test.beforeAll(async () => {
    ADM = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    const r = await ADM.auth.signInWithPassword({ email: cfg.adminEmail, password: cfg.adminPass });
    if (r.error) throw r.error;
  });
  test.afterAll(async () => {
    for (const c of [codigoNormal, codigoOffline, codigoPrueba].filter(Boolean)) {
      await ADM.rpc("anular_caso", { p_codigo: c, p_motivo: "Prueba automática (tests/flujo.spec.js)" });
    }
  });

  test("la nota SOAP crea el caso y lo sincroniza", async ({ browser }) => {
    const { ctx, page, errores } = await dispositivo(browser);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 20000 });
    const soap = await pacienteYSoap(page);
    expect(soap).toContain("v7.9.6");
    codigoNormal = soap.match(SOAP_COD)?.[1];
    expect(codigoNormal).toBeTruthy();
    await expect(page.locator("#regmsg")).toContainText(`Caso ${codigoNormal} registrado`, { timeout: 20000 });
    await expect(page.locator("#netst")).toHaveText("Sincronizado");
    const { data } = await ADM.from("casos").select("codigo,especie,prueba,sesion,minutos_soap,top").eq("codigo", codigoNormal);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ especie: "c", prueba: false });
    expect(data[0].sesion).toBeTruthy();
    expect(data[0].top.length).toBeGreaterThan(0);
    // Copiar la nota registra el evento de uso
    await page.getByRole("button", { name: "Copiar" }).click();
    expect(errores).toEqual([]);
    await ctx.close();
  });

  test("«No registrar (prueba o docencia)» guarda como prueba y no agrega el código a la nota", async ({ browser }) => {
    const { ctx, page } = await dispositivo(browser);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 20000 });
    await page.locator("#regno").check();
    const soap = await pacienteYSoap(page);
    expect(soap).not.toMatch(SOAP_COD);
    await expect(page.locator("#regmsg")).toContainText("Caso de prueba o docencia guardado", { timeout: 20000 });
    codigoPrueba = await page.evaluate(() => REG.cur && REG.cur.id);
    const { data } = await ADM.from("casos").select("prueba").eq("codigo", codigoPrueba);
    expect(data).toEqual([{ prueba: true }]);
    const v = await ADM.from("v_casos_validos").select("codigo").eq("codigo", codigoPrueba);
    expect(v.data).toEqual([]);
    await ctx.close();
  });

  test("sin conexión el caso queda en cola y se envía al reconectar", async ({ browser }) => {
    const { ctx, page } = await dispositivo(browser);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 20000 });
    await ctx.setOffline(true);
    const soap = await pacienteYSoap(page);
    codigoOffline = soap.match(SOAP_COD)?.[1];
    expect(codigoOffline).toBeTruthy();
    await expect(page.locator("#netst")).toHaveText("1 caso pendiente", { timeout: 20000 });
    await expect(page.locator("#regmsg")).toContainText("guardado en este dispositivo");
    const cola = await page.evaluate(() => JSON.parse(localStorage.getItem("mc_cola_registro") || "[]"));
    expect(cola.map((x) => x.k)).toContain(codigoOffline);
    // Lo que queda en el dispositivo no tiene datos del propietario: solo el caso clínico
    expect(JSON.stringify(cola)).not.toMatch(/propietari|tel[eé]fono|direcci|expediente/i);
    await ctx.setOffline(false);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 90000 });
    const { data } = await ADM.from("casos").select("codigo").eq("codigo", codigoOffline);
    expect(data).toHaveLength(1);
    await ctx.close();
  });

  test("otro dispositivo cierra el caso con el código MC, sin ver el historial", async ({ browser }) => {
    const { ctx, page, errores } = await dispositivo(browser);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 20000 });
    await page.locator("#regbtn").click();
    await expect(page.locator("#regbar")).toBeHidden();
    await expect(page.locator("#regbody")).toContainText("no se muestra el historial");
    await page.locator("#acccod").fill(codigoNormal.toLowerCase());
    await page.getByRole("button", { name: "Abrir caso" }).click();
    await expect(page.locator("#regbody")).toContainText(codigoNormal, { timeout: 20000 });
    await page.locator("#regbody button.opt", { hasText: "presuntivo del motor" }).first().click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#regedmsg")).toContainText("Indique la base de la confirmación");
    await page.locator("#regbody button.opt", { hasText: "Prueba de laboratorio específica" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#regedmsg")).toHaveText("Caso cerrado.", { timeout: 20000 });
    const { data } = await ADM.from("cierres").select("confirmacion,dx_nombre,casos!inner(codigo)").eq("casos.codigo", codigoNormal);
    expect(data).toHaveLength(1);
    expect(data[0].confirmacion).toBe("lab");
    // Un código inexistente da un mensaje claro
    await page.getByRole("button", { name: "← Volver" }).click();
    await page.locator("#acccod").fill("MC-ZZZZZZ");
    await page.getByRole("button", { name: "Abrir caso" }).click();
    await expect(page.locator("#regbody")).toContainText("No existe un caso con ese código");
    expect(errores).toEqual([]);
    await ctx.close();
  });

  test("el administrador entra, ve la lista del hospital y exporta el Excel con «Veterinario»", async ({ browser }) => {
    const { ctx, page, errores } = await dispositivo(browser);
    await expect(page.locator("#netst")).toHaveText("Sincronizado", { timeout: 20000 });
    await page.locator("#regbtn").click();
    await page.locator("#admmail").fill(cfg.adminEmail);
    await page.locator("#admpass").fill(cfg.adminPass);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("#regbar")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#regbody")).toContainText(codigoNormal, { timeout: 20000 });
    await expect(page.locator("#regbody")).not.toContainText(codigoPrueba);
    await expect(page.locator("#regvet option")).not.toHaveCount(1);
    const espera = page.waitForEvent("download");
    await page.locator("#regexport").click();
    const descarga = await espera;
    const wb = XLSX.read(await readFile(await descarga.path()));
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["Casos"]);
    const fila = filas.find((f) => Object.values(f).includes(codigoNormal));
    expect(fila).toBeTruthy();
    expect(fila["Veterinario"]).toMatch(/^Anónimo · disp\. [0-9A-F]{4}$/);
    expect(Object.keys(fila).join(" ")).not.toMatch(/propietari|tel[eé]fono|direcci|expediente/i);
    // Indicadores
    await page.locator("#regtabs button", { hasText: "Indicadores" }).click();
    await expect(page.locator("#regbody")).not.toBeEmpty();
    // Salir deja al dispositivo otra vez como anónimo
    await page.getByRole("button", { name: "Cerrar sesión de administrador" }).click();
    await expect(page.locator("#regbar")).toBeHidden({ timeout: 20000 });
    await expect(page.locator("#admmail")).toBeVisible();
    expect(errores).toEqual([]);
    await ctx.close();
  });
});
