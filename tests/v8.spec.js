// Pruebas de la v8.0 (V1–V7). Sin Supabase: config.js con marcadores, así los casos quedan en la cola local
// del dispositivo (localStorage «mc_cola_registro»), que sirve para comprobar si se registró un caso.
import { test, expect } from "@playwright/test";

const SIN_CONFIG = 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};';
export async function abrir(browser, opts = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: SIN_CONFIG }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("dialog", (d) => d.dismiss());
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.removeItem("mc_cola_registro"));
  return { ctx, page, errores };
}

// Paciente completo (todos los obligatorios). `sin` deja vacío uno o varios.
export const COMPLETO = { esp: "c", peso: "18", edad: "e2", sexo: "mc", vac: "aldia",
  fc: "110", fr: "24", temp: "38.6", muc: "rosa", tllc: "n", pulso: "n", dh: "0", card: "n", pulm: "n", cc: "3" };
export async function llenar(page, datos) {
  await page.evaluate((d) => {
    if (d.esp) setEsp(d.esp);
    if (d.peso) setPeso(d.peso);
    if (d.edad) setEdad(d.edad);
    if (d.sexo) setSexo(d.sexo);
    if (d.vac) setVac(d.vac);
    for (const k of ["fc", "fr", "temp", "muc", "tllc", "pulso", "dh", "card", "pulm", "cc", "gluc"]) if (d[k] != null) setEx(k, d[k]);
    if (typeof setConc === "function" && d.conc) setConc(d.conc);
    ST.avisoMot = true; setMotivo("dig"); const m = MOTIVOS.find((x) => x.id === "dig"); if (m.signs[0] && !ST.signs.has(m.signs[0])) toggleSign(m.signs[0]);
  }, datos);
}
export const generar = (page) => page.evaluate(async () => { genSOAP(); await REG.cola; await new Promise((r) => setTimeout(r, 300));
  return { soap: document.getElementById("soap").value, cola: JSON.parse(localStorage.getItem("mc_cola_registro") || "[]").length }; });

test("V1: sin condición corporal no se genera la nota ni se registra el caso, y no hay botón para saltarla", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const { cc, ...sinCC } = COMPLETO;
  await llenar(page, { ...sinCC, conc: "alerta" });
  const r = await generar(page);
  expect(r.soap).toBe("");
  expect(r.cola).toBe(0);
  await expect(page.locator("#aviso")).toContainText("Condición corporal");
  await expect(page.getByText("Generar sin la condición corporal")).toHaveCount(0);
  expect(await page.evaluate(() => faltantes().map((x) => x.k))).toEqual(["cc"]);
  // Con la condición corporal, sí
  await page.evaluate(() => { avisoCerrar(); setEx("cc", "3"); });
  const r2 = await generar(page);
  expect(r2.soap).toContain("S — SUBJETIVO".slice(0, 1));
  expect(r2.cola).toBe(1);
  expect(errores).toEqual([]);
  await ctx.close();
});

test("V2: cada obligatorio vacío, uno a la vez, bloquea la nota y el registro; las funciones internas tampoco lo saltan", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const bloquean = [];
  for (const k of Object.keys(COMPLETO)) {
    await page.evaluate(() => resetAll());
    const { [k]: _, ...datos } = COMPLETO;
    await llenar(page, { ...datos, conc: "alerta" });
    const r = await generar(page);
    await page.evaluate(() => avisoCerrar());
    if (r.soap === "" && r.cola === 0) bloquean.push(k);
  }
  expect(bloquean).toEqual(Object.keys(COMPLETO));
  // Llamadas directas a las funciones internas, con un obligatorio vacío
  await page.evaluate(() => resetAll());
  const { peso, ...sinPeso } = COMPLETO;
  await llenar(page, { ...sinPeso, conc: "alerta" });
  const d = await page.evaluate(async () => { genSOAPbase(); regTrasSOAP(); await REG.cola; await new Promise((r) => setTimeout(r, 300));
    return { soap: document.getElementById("soap").value, cola: JSON.parse(localStorage.getItem("mc_cola_registro") || "[]").length }; });
  expect(d).toEqual({ soap: "", cola: 0 });
  // Completo: sí genera y registra
  await page.evaluate(() => setPeso("18"));
  const ok = await generar(page);
  expect(ok.soap).not.toBe(""); expect(ok.cola).toBe(1);
  expect(errores).toEqual([]);
  await ctx.close();
});
