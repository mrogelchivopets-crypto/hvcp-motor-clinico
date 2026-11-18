// Equivalencia clínica: el motor nuevo (index.html) debe dar EXACTAMENTE el mismo resultado
// que el original v7.9.6 (tests/fixtures/original_v7_9_6.html) para las mismas entradas.
//
// Cada caso se genera al azar (semilla fija, reproducible) en el original usando los propios
// catálogos del motor (MOTIVOS, SIGNS, QS, VAC, HXS, EX_*) y las mismas funciones que usa la
// interfaz (setEsp, setMotivo, toggleSign, answer, setEx…). Las acciones se repiten tal cual en
// la versión nueva y se compara:
//   · scoreDx() completo: id, puntaje, hallazgos a favor/en contra, desempates (incluye el top 5)
//   · altaList(), alertas (ST._al) y el HTML de alertas, diagnósticos, laboratorios,
//     fluidoterapia, IRIS, sistemas, preguntas y barra inferior
//   · la nota SOAP completa (con la hora congelada para que la fecha coincida)
import { test, expect } from "@playwright/test";

const CASOS = Number(process.env.EQ_CASOS || 240);
const LOTES = 8;
const HORA_FIJA = new Date("2026-11-17T10:30:00-06:00");

// Se ejecuta dentro de la página original: genera y aplica un caso, devuelve las acciones.
function generarYAplicar(semilla) {
  let s = semilla >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const p = (prob) => rnd() < prob;
  const uno = (l) => l[Math.floor(rnd() * l.length)];
  const num = (a, b, dec = 0) => (a + rnd() * (b - a)).toFixed(dec);
  const log = [];
  const hacer = (fn, ...args) => { log.push([fn, ...args]); window[fn](...args); };

  const esp = p(0.92) ? uno(P_ESP)[0] : null;
  if (esp) hacer("setEsp", esp);
  if (p(0.85)) hacer("setEdad", uno(P_EDAD)[0]);
  if (p(0.85)) hacer("setSexo", uno(P_SEXO)[0]);
  if (p(0.85)) hacer("setHemo", uno(P_HEMO)[0]);
  if (p(0.8)) hacer("setPeso", num(0.8, 55, 1));
  if (esp && p(0.7)) { const n = 1 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) hacer("setVac", uno(VAC[esp])[0]); }
  if (p(0.5)) { const n = 1 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) hacer("setHx", uno(HXS)[0]); }
  // Examen físico
  if (p(0.6)) hacer("setEx", "temp", num(35, 42.5, 1));
  if (p(0.55)) hacer("setEx", "fc", num(35, 240));
  if (p(0.5)) hacer("setEx", "fr", num(8, 90));
  if (p(0.6)) hacer("setEx", "muc", uno(EX_MUC)[0]);
  if (p(0.55)) hacer("setEx", "tllc", uno(EX_TLLC)[0]);
  if (p(0.45)) hacer("setEx", "pulso", uno(EX_PULSO)[0]);
  if (p(0.4)) hacer("setEx", "card", uno(EX_CARD)[0]);
  if (p(0.4)) hacer("setEx", "pulm", uno(EX_PULM)[0]);
  if (p(0.3)) hacer("setEx", "vej", uno(EX_VEJ)[0]);
  if (p(0.4)) hacer("setEx", "dh", uno(EX_DH)[0]);
  if (p(0.35)) hacer("setEx", "dolor", uno(EX_DOL)[0]);
  if (p(0.25)) hacer("setEx", "gluc", num(25, 520));
  if (p(0.3)) hacer("setEx", "cc", String(1 + Math.floor(rnd() * 5)));
  if (p(0.12)) hacer("setEx", "mam", "si");
  if (p(0.12)) hacer("setEx", "linf", "gen");
  if (p(0.12)) hacer("setEx", "abm", "si");
  if (p(0.2)) hacer("setEx", "ecto", uno(["no", "garr", "pulg"]));
  // Motivo, signos y preguntas
  hacer("setMotivo", uno(MOTIVOS).id);
  if (p(0.2)) { const m2 = uno(MOTIVOS.filter((m) => m.id !== ST.motivo)).id; hacer("setMotivo2", m2); }
  const M = MOTIVOS.find((m) => m.id === ST.motivo);
  const nMot = Math.floor(rnd() * 5), nOtros = Math.floor(rnd() * 4);
  for (let i = 0; i < nMot && M.signs.length; i++) { const id = uno(M.signs); if (!ST.signs.has(id)) hacer("toggleSign", id); }
  const todos = Object.keys(SIGNS);
  for (let i = 0; i < nOtros; i++) { const id = uno(todos); if (!ST.signs.has(id)) hacer("toggleSign", id); }
  for (let ronda = 0; ronda < 2; ronda++) {
    visibleQs().forEach((q) => {
      if (ST.ans[q.id] !== undefined || !p(0.65)) return;
      const n = q.multi ? 1 + Math.floor(rnd() * 2) : 1;
      for (let i = 0; i < n; i++) hacer("answer", q.id, uno(q.o)[0]);
    });
  }
  if (p(0.25)) {
    const cand = scoreDx().slice(0, 4);
    if (cand.length) { const n = 1 + Math.floor(rnd() * Math.min(2, cand.length)); for (let i = 0; i < n; i++) { const id = uno(cand).d.id; log.push(["__soapSel", id]); ST.soapSel.add(id); } }
  }
  if (p(0.15)) { const t = uno(["rl", "ssn", "mix"]); log.push(["__fl", "tipo", t]); ST.fl.tipo = t; ST.fl.tipoSet = true; }
  log.push(["renderAll"]); renderAll();
  return log;
}

// Se ejecuta en la página nueva: repite las mismas acciones.
function aplicar(log) {
  for (const [fn, ...args] of log) {
    if (fn === "__soapSel") ST.soapSel.add(args[0]);
    else if (fn === "__fl") { ST.fl[args[0]] = args[1]; ST.fl.tipoSet = true; }
    else window[fn](...args);
  }
}

// Se ejecuta en ambas páginas: todo lo que produce el motor.
function extraer() {
  const all = scoreDx();
  const html = (id) => { const e = document.getElementById(id); return e ? e.innerHTML : null; };
  const salida = {
    dx: all.map((x) => ({ id: x.d.id, sc: x.sc, nr: x.nr, tie: !!x.tie, lab: !!x.labHit, pos: x.pos, neg: x.neg, sg: x.sg })),
    alta: altaList(all).map((x) => [x.d.id, x.sc]),
    alertas: ST._al || [],
    respuestas: answers(),
    vistas: Object.fromEntries(["alerts", "dxcount", "dxlist", "labs", "fluids", "flout", "iriscard", "systems", "s1", "s2", "s3", "bbar"].map((id) => [id, html(id)])),
  };
  genSOAPbase();
  salida.soap = document.getElementById("soap").value;
  salida.soapmsg = document.getElementById("soapmsg").textContent;
  return salida;
}

async function listo(page) {
  await page.waitForLoadState("load");
  expect(await page.evaluate(() => typeof scoreDx === "function" && typeof renderAll === "function")).toBe(true);
}

async function abrir(browser, ruta) {
  const ctx = await browser.newContext();
  await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.setFixedTime(HORA_FIJA);
  await page.goto(ruta);
  await listo(page);
  return { ctx, page, errores };
}

const porLote = Math.ceil(CASOS / LOTES);
for (let lote = 0; lote < LOTES; lote++) {
  test(`equivalencia clínica · lote ${lote + 1}/${LOTES}`, async ({ browser }) => {
    const O = await abrir(browser, "/tests/fixtures/original_v7_9_6.html");
    const N = await abrir(browser, process.env.EQ_NUEVO || "/index.html");
    let comparados = 0, conDx = 0;
    for (let i = 0; i < porLote; i++) {
      const caso = lote * porLote + i;
      if (caso >= CASOS) break;
      const semilla = 7919 * (caso + 1) + 104729;
      await Promise.all([O.page.reload(), N.page.reload()]);
      await listo(O.page);
      await listo(N.page);
      const log = await O.page.evaluate(generarYAplicar, semilla);
      await N.page.evaluate(aplicar, log);
      const [a, b] = await Promise.all([O.page.evaluate(extraer), N.page.evaluate(extraer)]);
      const msj = `caso ${caso} (semilla ${semilla}); acciones: ${JSON.stringify(log)}`;
      expect(b.dx.slice(0, 5).map((x) => [x.id, x.sc]), "top 5 y puntajes · " + msj).toEqual(a.dx.slice(0, 5).map((x) => [x.id, x.sc]));
      expect(b, msj).toEqual(a);
      comparados++; if (a.dx.length) conDx++;
    }
    expect(O.errores, "errores en el original").toEqual([]);
    expect(N.errores, "errores en la versión nueva").toEqual([]);
    console.log(`lote ${lote + 1}: ${comparados} casos idénticos (${conDx} con diagnósticos)`);
    await O.ctx.close(); await N.ctx.close();
  });
}
