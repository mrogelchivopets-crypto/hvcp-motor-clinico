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
// v8.0: perfil de médico real en el proyecto de prueba; el primer dispositivo lo crea y los demás entran con usuario y PIN.
const PERFIL = { nombre: `Prueba Flujo ${Math.random().toString(36).slice(2, 6).toUpperCase()}`, pin: "4826", creado: false };

// Sirve un config.js con el proyecto de prueba (el del repositorio queda con marcadores).
async function dispositivo(browser, { conConfig = true } = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  // Nunca se usa el config.js del repositorio (es el de producción): proyecto de prueba o marcadores.
  const conf = conConfig ? { supabaseUrl: cfg.url, supabaseAnonKey: cfg.anon }
                         : { supabaseUrl: "https://TU-PROYECTO.supabase.co", supabaseAnonKey: "PEGUE-AQUI-LA-ANON-KEY" };
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript",
    body: `window.HVCP_CONFIG=${JSON.stringify(conf)};` }));
  // v8.0: la nota SOAP exige un perfil de médico activo. Sin configuración no hay servidor: perfil simulado.
  if (!conConfig) await ctx.addInitScript(() => { try { localStorage.setItem("hvcp_medico", JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", nombre: "Médico de prueba" })); localStorage.setItem("hvcp_aviso_pin", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  // Aviso de salida: se acepta; confirmaciones: se cancelan; los prompt los responde cada prueba.
  page.on("dialog", (d) => { if (d.type() !== "prompt") (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.goto("/index.html");
  if (conConfig) {
    await expect(page.locator("#perfil")).toBeVisible({ timeout: 30000 });
    await page.evaluate(() => { try { perfilAvisoOk(); } catch (e) {} });
    if (!PERFIL.creado) {
      await page.getByRole("button", { name: "Crear mi perfil" }).click();
      await page.locator("#pfnom").fill(PERFIL.nombre); await page.locator("#pfpin").fill(PERFIL.pin); await page.locator("#pfpin2").fill(PERFIL.pin);
      await page.getByRole("button", { name: "Crear y entrar" }).click(); PERFIL.creado = true;
    } else {
      await page.locator("#pfusr").fill(PERFIL.nombre); await page.locator("#pfpin").fill(PERFIL.pin);
      await page.getByRole("button", { name: "Entrar" }).click();
    }
    await expect(page.locator("#perfil")).toBeHidden({ timeout: 20000 });
  }
  return { ctx, page, errores };
}

async function pacienteYSoap(page) {
  await page.locator("#s1 button.opt", { hasText: "Canino" }).click();
  // Datos obligatorios del motor (REQ): sin ellos, elegir el motivo abre el aviso y la nota SOAP no se genera.
  await page.evaluate(() => {
    setEdad("e2"); setSexo("mc"); setVac(VAC.c[0][0]);
    setEx("fc", "110"); setEx("fr", "24"); setEx("temp", "38.6");
    setEx("muc", "rosa"); setEx("tllc", "n"); setEx("dh", "0"); setEx("card", "n"); setEx("pulm", EX_PULM[0][0]);
    setPeso("18"); setEx("pulso", "n"); setEx("cc", "3"); setConc("alerta"); // obligatorios desde la v8.0
  });
  expect(await page.evaluate(() => faltantes().map((x) => x.l))).toEqual([]);
  // Motivo «Vómito o diarrea» (con signos marcados por el motivo, así el motor da diagnósticos)
  const motivo = await page.evaluate(() => MOTIVOS.find((m) => m.id === "dig").n);
  await page.locator("#s2 .mot", { hasText: motivo }).click();
  await page.locator("#s2 .chip:not(.on)").first().click();
  await page.getByRole("button", { name: "Generar nota SOAP" }).click();
  return page.locator("#soap").inputValue();
}

test("sin configuración el motor funciona igual, guarda en cola y no intenta conectarse", async ({ browser }) => {
  const { ctx, page, errores } = await dispositivo(browser, { conConfig: false });
  const remotas = [];
  page.on("request", (r) => { if (/supabase|jsdelivr/.test(r.url())) remotas.push(r.url()); });
  const soap = await pacienteYSoap(page);
  expect(soap).toContain(`Motor Clínico HVCP v${await page.evaluate(() => MOTOR_VER)}`);
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
    expect(soap).toContain(`v${await page.evaluate(() => MOTOR_VER)}`);
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
    // El panel se vuelve a dibujar solo (sincronización de la cola, latido): el código escrito no debe perderse.
    await page.evaluate(() => regRender());
    await expect(page.locator("#acccod")).toHaveValue(codigoNormal.toLowerCase());
    await page.getByRole("button", { name: "Abrir caso" }).click();
    await expect(page.locator("#regbody")).toContainText(codigoNormal, { timeout: 20000 });
    await page.locator("#regbody button.opt", { hasText: "presuntivo del motor" }).first().click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#regedmsg")).toContainText("Indique la base de la confirmación");
    await page.locator("#regbody button.opt", { hasText: "Solo criterio clínico" }).click(); // laboratorio sin resultado pide confirmar (M10)
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#regedmsg")).toHaveText("Caso cerrado.", { timeout: 20000 });
    const { data } = await ADM.from("cierres").select("confirmacion,dx_nombre,casos!inner(codigo)").eq("casos.codigo", codigoNormal);
    expect(data).toHaveLength(1);
    expect(data[0].confirmacion).toBe("clin");
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
    // La lista abre en «Pendientes»: el caso cerrado aparece en «Cerrados» y en «Todos».
    await expect(page.locator("#regbody")).toContainText(codigoOffline, { timeout: 20000 });
    await expect(page.locator("#regbody")).not.toContainText(codigoNormal);
    await page.getByRole("button", { name: /^Cerrados \(\d+\)$/ }).click();
    await expect(page.locator("#regbody")).toContainText(codigoNormal);
    // Los filtros muestran la cantidad: «Todos (3)»
    await page.getByRole("button", { name: /^Todos( \(\d+\))?$/ }).click();
    await expect(page.locator("#regbody")).toContainText(codigoNormal);
    await expect(page.locator("#regbody")).not.toContainText(codigoPrueba);
    await expect(page.locator("#regvet option")).not.toHaveCount(1);
    const espera = page.waitForEvent("download");
    await page.locator("#regexport").click();
    const descarga = await espera;
    const wb = XLSX.read(await readFile(await descarga.path()));
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["Casos"]);
    const fila = filas.find((f) => Object.values(f).includes(codigoNormal));
    expect(fila).toBeTruthy();
    expect(fila["Veterinario"]).toBe(PERFIL.nombre);
    expect(fila["Médico"]).toBe(PERFIL.nombre);
    expect(Object.keys(fila).join(" ")).not.toMatch(/propietari|tel[eé]fono|direcci|expediente/i);
    // Anular desde la ficha (no se borra)
    await page.locator(`[onclick="regAbrir('${codigoOffline}')"]`).first().click();
    page.once("dialog", (d) => d.accept("Prueba automática: duplicado"));
    await page.getByRole("button", { name: "Anular este caso" }).click();
    await expect(page.locator("#regbody")).not.toContainText(codigoOffline, { timeout: 20000 });
    const an = await ADM.from("casos").select("anulado,anulado_motivo").eq("codigo", codigoOffline).single();
    expect(an.data).toEqual({ anulado: true, anulado_motivo: "Prueba automática: duplicado" });
    codigoOffline = null;
    // Indicadores
    await page.locator("#regtabs button", { hasText: "Indicadores" }).click();
    await expect(page.locator("#regbody")).not.toBeEmpty();
    // Tablero de uso: casos por día y turno, por veterinario o dispositivo y sesiones
    await page.locator("#regtabs button", { hasText: "Uso" }).click();
    await expect(page.locator("#regbody")).toContainText("Casos por día");
    await expect(page.locator("#regbody")).toContainText("Por turno");
    await expect(page.locator("#regbody .uso-tabla")).toContainText(PERFIL.nombre);
    await expect(page.locator("#regbody")).not.toContainText("(no disponible)");
    await page.screenshot({ path: "test-results/tablero-uso.png", fullPage: true });
    await expect(page.locator("#regbody .uso-tabla")).not.toContainText("Abrieron el motor sin registrar casos: 0");
    // Cambiar el período recarga casos y sesiones sin errores
    await page.selectOption("#regrango", "todo");
    await expect(page.locator("#regbody")).toContainText(/Casos por (día|semana)/, { timeout: 20000 });
    // Salir deja al dispositivo otra vez como anónimo
    await page.getByRole("button", { name: "Cerrar sesión de administrador" }).click();
    await expect(page.locator("#regbar")).toBeHidden({ timeout: 20000 });
    await expect(page.locator("#admmail")).toBeVisible();
    expect(errores).toEqual([]);
    await ctx.close();
  });
});
