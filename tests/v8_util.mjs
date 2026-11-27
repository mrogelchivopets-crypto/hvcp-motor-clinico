// Utilidades compartidas por las pruebas de la v8.0 (no es un archivo de pruebas).
import { expect } from "@playwright/test";
export const SIN_CONFIG = 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};';
export async function abrir(browser, opts = {}, { medico = true } = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: SIN_CONFIG }));
  // Perfil activo simulado (sin servidor no se verifica el PIN); medico: false = dispositivo sin perfil.
  if (medico) await ctx.addInitScript(() => { try { localStorage.setItem("hvcp_medico", JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", nombre: "Médico de prueba" })); localStorage.setItem("hvcp_aviso_pin", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [], dialogos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  // El aviso de salida (beforeunload) se acepta y se registra; los demás diálogos se cierran.
  page.on("dialog", (d) => { dialogos.push(d.type()); return d.type() === "beforeunload" ? d.accept() : d.dismiss(); });
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.removeItem("mc_cola_registro"));
  return { ctx, page, errores, dialogos };
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
