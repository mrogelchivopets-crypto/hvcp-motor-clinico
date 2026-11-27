// Pruebas de la v8.0 (V1–V7). Sin Supabase: config.js con marcadores, así los casos quedan en la cola local
// del dispositivo (localStorage «mc_cola_registro»), que sirve para comprobar si se registró un caso.
import { test, expect } from "@playwright/test";

const SIN_CONFIG = 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};';
export async function abrir(browser, opts = {}, { medico = true } = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: SIN_CONFIG }));
  // Perfil activo simulado (sin servidor no se verifica el PIN); medico: false = dispositivo sin perfil.
  if (medico) await ctx.addInitScript(() => { try { localStorage.setItem("hvcp_medico", JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", nombre: "Médico de prueba" })); localStorage.setItem("hvcp_aviso_pin", "1"); } catch (e) {} });
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

// ─── V3: estado hemodinámico automático ───
const N = { fc: "110", temp: "38.6", muc: "rosa", tllc: "n", pulso: "n" };
const VECTORES = [
  ["perro grande (30 kg), todo en rango", { esp: "c", peso: "30", edad: "e2", ex: N }, "est"],
  ["perro grande, FC 160 (> 140)", { esp: "c", peso: "30", edad: "e2", ex: { ...N, fc: "160" } }, "comp"],
  ["perro pequeño (5 kg), FC 150 (≤ 160)", { esp: "c", peso: "5", edad: "e2", ex: { ...N, fc: "150" } }, "est"],
  ["perro pequeño (5 kg), FC 175", { esp: "c", peso: "5", edad: "e2", ex: { ...N, fc: "175" } }, "comp"],
  ["cachorro (< 6 meses), FC 190 (≤ 200)", { esp: "c", peso: "8", edad: "e0", ex: { ...N, fc: "190" } }, "est"],
  ["perro, TLLC 2–3 s", { esp: "c", peso: "20", edad: "e2", ex: { ...N, tllc: "l" } }, "comp"],
  ["perro, TLLC > 3 s", { esp: "c", peso: "20", edad: "e2", ex: { ...N, tllc: "l3" } }, "desc"],
  ["perro, pulso filiforme con PAS normal", { esp: "c", peso: "20", edad: "e2", ex: { ...N, pulso: "fil" }, pas: "n" }, "desc"],
  ["perro, pulso ausente", { esp: "c", peso: "20", edad: "e2", ex: { ...N, pulso: "aus" } }, "desc"],
  ["perro, mucosas grisáceas", { esp: "c", peso: "20", edad: "e2", ex: { ...N, muc: "gris" } }, "desc"],
  ["perro, PAS < 90 con el resto en rango", { esp: "c", peso: "20", edad: "e2", ex: N, pas: "bajo" }, "desc"],
  ["perro, PAS no registrada y taquicardia", { esp: "c", peso: "20", edad: "e2", ex: { ...N, fc: "170" } }, "comp"],
  ["perro, bradicardia (50) con mucosas pálidas", { esp: "c", peso: "30", edad: "e2", ex: { ...N, fc: "50", muc: "pali" } }, "desc"],
  ["perro, bradicardia (50) sin hipoperfusión", { esp: "c", peso: "30", edad: "e2", ex: { ...N, fc: "50" } }, "est"],
  ["gato, todo en rango (FC 180)", { esp: "f", peso: "4", edad: "e2", ex: { ...N, fc: "180" } }, "est"],
  ["gato, FC 240", { esp: "f", peso: "4", edad: "e2", ex: { ...N, fc: "240" } }, "comp"],
  ["gato con tríada: FC 110, 36.5 °C y PAS < 90", { esp: "f", peso: "4", edad: "e3", ex: { ...N, fc: "110", temp: "36.5" }, pas: "bajo" }, "desc"],
  ["gato sin tríada: FC 110 e hipotermia, PAS normal", { esp: "f", peso: "4", edad: "e3", ex: { ...N, fc: "110", temp: "36.5" }, pas: "n" }, "est"],
  ["perro, mucosas rojas", { esp: "c", peso: "20", edad: "e2", ex: { ...N, muc: "roja" } }, "comp"],
  ["perro, pulso débil", { esp: "c", peso: "20", edad: "e2", ex: { ...N, pulso: "deb" } }, "comp"],
  ["perro, pulso saltón", { esp: "c", peso: "20", edad: "e2", ex: { ...N, pulso: "salt" } }, "est"],
  ["datos incompletos: sin TLLC", { esp: "c", peso: "20", edad: "e2", ex: { ...N, tllc: "" } }, null],
  ["datos incompletos pero pulso filiforme", { esp: "c", peso: "20", edad: "e2", ex: { fc: "120", pulso: "fil" } }, "desc"],
];

test("V3: tabla de vectores del estado hemodinámico", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const res = [];
  for (const [nombre, v, esperado] of VECTORES) {
    const k = await page.evaluate((v) => {
      resetAll(); setEsp(v.esp); setPeso(v.peso); setEdad(v.edad);
      for (const [c, x] of Object.entries(v.ex)) if (x !== "") setEx(c, x);
      if (v.pas) ST.ans.pas = v.pas;
      return { k: hemoCalc().k, crit: hemoCalc().crit, hemo: HEMO() };
    }, v);
    res.push({ nombre, esperado, obtenido: k.k, crit: k.crit.join(", ") });
  }
  console.log(res.map((r) => `${r.obtenido === r.esperado ? "OK " : "MAL"} ${r.nombre} → ${r.obtenido ?? "pendiente"}${r.crit ? " (" + r.crit + ")" : ""}`).join("\n"));
  expect(res.filter((r) => r.obtenido !== r.esperado)).toEqual([]);
  expect(errores).toEqual([]);
  await ctx.close();
});

test("V3: la nota SOAP dice «Estado hemodinámico (calculado)» y no hay selector manual", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await llenar(page, { ...COMPLETO, fc: "170", tllc: "l", conc: "alerta" });
  await expect(page.locator("#s1")).not.toContainText("Estado hemodinámico al ingreso");
  await expect(page.locator(".hemobox.y")).toContainText("Shock compensado");
  const r = await generar(page);
  expect(r.soap).toContain("Estado hemodinámico (calculado): Shock compensado — taquicardia (170 lpm), TLLC 2–3 s");
  await ctx.close();
});

test("V3: capturas de los tres colores en modo claro y oscuro", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, { viewport: { width: 820, height: 1180 } });
  for (const tema of ["oscuro", "claro"]) {
    if (tema === "claro") await page.evaluate(() => toggleTheme());
    for (const [nombre, ex] of [["estable", N], ["compensado", { ...N, fc: "170" }], ["descompensado", { ...N, pulso: "fil" }]]) {
      await page.evaluate((ex) => { resetAll(); setEsp("c"); setPeso("20"); setEdad("e2"); for (const [c, x] of Object.entries(ex)) setEx(c, x); }, ex);
      await page.locator(".hemobox").screenshot({ path: `test-results/capturas/v3-${nombre}-${tema}.png` });
    }
  }
  await ctx.close();
});

// ─── V4: estado de conciencia ───
const cola = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mc_cola_registro") || "[]"));
test("V4: el puntaje de conciencia está en los 8 diagnósticos indicados y en ningún otro", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const r = await page.evaluate(() => ({ con: DX.filter((d) => d.r.some((x) => x[0] === "conc")).map((d) => d.id).sort(), faltan: CONC_DX.filter((id) => !DX.find((d) => d.id === id)) }));
  expect(r.faltan).toEqual([]);
  expect(r.con).toEqual(["anticolin", "enc_hep", "epilepsia", "etilenglicol", "golpe_calor", "hipoglucemia", "ivermectina", "tce"]);
  await ctx.close();
});

test("V4: estupor y coma suben esos diagnósticos sin desplazar uno con evidencia clara", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const caso = async (conc, datos) => page.evaluate(({ conc, datos }) => {
    resetAll(); setEsp(datos.esp); setPeso(datos.peso); setEdad("e3"); setSexo(datos.sexo);
    for (const [k, v] of Object.entries(datos.ex)) setEx(k, v);
    ST.avisoMot = true; setMotivo(datos.motivo); datos.signos.forEach((x) => { if (!ST.signs.has(x)) toggleSign(x); });
    Object.assign(ST.ans, datos.ans || {}); setConc(conc);
    const l = scoreDx(); return { top: l.slice(0, 3).map((x) => x.d.id + ":" + x.sc), pos: (id) => 0, lista: l.map((x) => x.d.id + ":" + x.sc) };
  }, { conc, datos });
  // Obstrucción uretral felina con vejiga distendida: sigue 1.ª con coma
  const obst = { esp: "f", peso: "5", sexo: "mc", motivo: "uro", signos: ["estr", "olig", "vom"], ex: { fc: "150", temp: "37.8", muc: "rosa", tllc: "n", pulso: "n", vej: "grande" }, ans: { orinq: "obst" } };
  const o1 = await caso("dep", obst), o2 = await caso("coma", obst);
  expect(o1.top[0].split(":")[0]).toBe("obs_uret_f");
  expect(o2.top[0].split(":")[0]).toBe("obs_uret_f");
  // Trauma craneoencefálico: con estupor sube 10 frente a deprimido, y con alerta baja 10
  const tce = { esp: "c", peso: "20", sexo: "mc", motivo: "tra", signos: ["traum"], ex: { fc: "120", temp: "38.5", muc: "rosa", tllc: "n", pulso: "n" }, ans: {} };
  const sc = (r) => Number((r.lista.find((x) => x.startsWith("tce:")) || "tce:0").split(":")[1]);
  const [dep, est, ale] = [await caso("dep", tce), await caso("estupor", tce), await caso("alerta", tce)];
  expect(sc(est) - sc(dep)).toBe(10);
  expect(sc(dep) - sc(ale)).toBe(10);
  console.log("TCE deprimido/estupor/alerta:", sc(dep), sc(est), sc(ale), "· obstrucción con coma:", o2.top.join(" | "));
  await ctx.close();
});

test("V4: «Sin signos vitales» solo exige la especie, no calcula presuntivos y registra rcp: true", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  await page.evaluate(() => { setEsp("c"); setConc("ssv"); });
  expect(await page.evaluate(() => faltantes().map((x) => x.k))).toEqual([]);
  await expect(page.locator("#alerts")).toContainText("Registre el peso (aunque sea estimado) para las dosis de RCP");
  await expect(page.locator("#alerts")).toContainText("RCP inmediata (RECOVER 2024)");
  expect(await page.evaluate(() => scoreDx().length)).toBe(0);
  const r = await generar(page);
  expect(r.soap).toContain("Estado de conciencia: Sin signos vitales — protocolo RCP");
  expect(r.soap).toContain("RCP (RECOVER 2024): Compresiones");
  const q = await cola(page);
  expect(q).toHaveLength(1); expect(q[0].p.ent.rcp).toBe(true); expect(q[0].p.ent.hemo).toBe("pcr");
  expect(errores).toEqual([]);
  await ctx.close();
});

test("V4: «Crítico ER» con el examen vacío genera presuntivos, prioridad 1 y SOAP diferida; luego iguala a un caso normal", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const pac = { esp: "c", peso: "25", edad: "e2", sexo: "mc", vac: "aldia", conc: "crit" };
  await llenar(page, pac);
  expect(await page.evaluate(() => faltantes().map((x) => x.k))).toEqual([]);
  await expect(page.locator("#alerts")).toContainText("Prioridad 1 (triaje)");
  await expect(page.locator("#alerts")).toContainText("Paciente priorizado: complete el examen físico cuando esté estable");
  expect(await page.evaluate(() => scoreDx().length)).toBeGreaterThan(0);
  await expect(page.locator("#exfis .miss")).toHaveCount(0);
  const r = await generar(page);
  expect(r.soap).toContain("Estado de conciencia: Crítico ER — examen físico diferido");
  expect(r.soap).toMatch(/Examen físico sin registrar: FC, FR, Temperatura/);
  const q = await cola(page); expect(q[0].p.ent.critico).toBe(true);
  // Se completa el examen y se cambia la conciencia: igual a un caso normal con los mismos datos
  const despues = await page.evaluate((ex) => { for (const [k, v] of Object.entries(ex)) setEx(k, v); setConc("alerta"); return scoreDx().slice(0, 5).map((x) => x.d.id + ":" + x.sc); },
    { fc: "110", fr: "24", temp: "38.6", muc: "rosa", tllc: "n", pulso: "n", dh: "0", card: "n", pulm: "n", cc: "3" });
  expect(await page.evaluate(() => faltantes().length)).toBe(0);
  const normal = await page.evaluate(() => { const sig = [...ST.signs], mot = ST.motivo; resetAll();
    setEsp("c"); setPeso("25"); setEdad("e2"); setSexo("mc"); setVac("aldia");
    for (const [k, v] of Object.entries({ fc: "110", fr: "24", temp: "38.6", muc: "rosa", tllc: "n", pulso: "n", dh: "0", card: "n", pulm: "n", cc: "3" })) setEx(k, v);
    ST.avisoMot = true; setMotivo(mot); sig.forEach((x) => { if (!ST.signs.has(x)) toggleSign(x); }); setConc("alerta");
    return scoreDx().slice(0, 5).map((x) => x.d.id + ":" + x.sc); });
  expect(despues).toEqual(normal);
  expect(errores).toEqual([]);
  await ctx.close();
});
