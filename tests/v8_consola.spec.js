// Consola sin errores en Chromium (Chrome) y WebKit, en escritorio, tablet y celular (sin red; perfil simulado).
import { test, expect, chromium, webkit } from "@playwright/test";
import { COMPLETO } from "./v8_util.mjs";
const VISTAS = { escritorio: { viewport: { width: 1366, height: 900 } }, tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true }, celular: { viewport: { width: 390, height: 844 }, hasTouch: true } };
const MOTORES = { chromium: () => chromium.launch({ channel: process.env.PW_CANAL || "chrome" }), webkit: () => webkit.launch({ channel: undefined }) };
for (const [motor, lanzar] of Object.entries(MOTORES)) for (const [vista, opts] of Object.entries(VISTAS)) {
  test(`consola sin errores · ${motor} · ${vista}`, async () => {
    const b = await lanzar(); const ctx = await b.newContext({ ...opts, baseURL: "http://127.0.0.1:5173" });
    await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};' }));
    await ctx.addInitScript(() => { localStorage.setItem("hvcp_medico", JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", nombre: "Consola" })); localStorage.setItem("hvcp_aviso_pin", "1"); });
    const p = await ctx.newPage(); const errores = [];
    p.on("pageerror", (e) => errores.push("pageerror: " + e)); p.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
    p.on("dialog", (d) => d.dismiss()); p.on("requestfailed", (r) => errores.push("requestfailed: " + r.url()));
    await p.goto("/index.html");
    await p.evaluate((d) => { setEsp(d.esp); setPeso(d.peso); setEdad(d.edad); setSexo(d.sexo); setVac(d.vac); setConc("alerta");
      for (const k of ["fc", "fr", "temp", "muc", "tllc", "pulso", "dh", "card", "pulm", "cc"]) setEx(k, d[k]);
      ST.avisoMot = true; setMotivo("dig"); toggleSign("vom"); genSOAP(); }, COMPLETO);
    await p.evaluate(() => { misCasosAbrir(); misCasosCerrar(); regToggle(true); regToggle(false); setConc("crit"); setConc("ssv"); nuevoPaciente(); });
    await p.waitForTimeout(500);
    expect(errores).toEqual([]);
    await b.close();
  });
}
