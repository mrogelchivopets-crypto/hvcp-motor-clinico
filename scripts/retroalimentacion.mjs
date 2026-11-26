// Retroalimentación por caso: para cada caso cerrado con diagnóstico definitivo codificado que NO
// quedó en el primer lugar del motor, explica por qué y qué dato no registrado lo habría acercado.
//
// Uso: node scripts/retroalimentacion.mjs [--carpeta "…\Registro del motor"] [--todos]
//   Lee   datos/registro.json (lo genera exportar_registro.mjs)
//   Escribe Reportes/Retroalimentacion_AAAA-MM-DD.html (o …_tarde.html desde las 12:00), Reportes/propuestas.json,
//           Reportes/retro_procesados.json (casos ya reportados) y Reportes/retro_resumen.json (para el reporte diario)
//
// Clasificación de cada diferencia:
//   a) Omisión de datos: el diagnóstico está en el motor y, al agregar los datos no registrados que usan
//      sus reglas, el motor lo habría puesto en el top-3.
//   b) Ajuste del motor: aun con esos datos, el motor no lo pone en el top-3. Va a propuestas.json.
//   c) Fuera del catálogo del motor: el código no corresponde a ningún diagnóstico del motor.
//   d) Cierre inconsistente: especie o sexo incompatibles con el diagnóstico, o cierre anterior al caso.
//   Diferencial cercano: con los datos registrados ya estaba 2.º o 3.º y no falta nada que lo cambie.
// El motor se ejecuta igual que en la página (index.html, sin conexión) en Chrome sin ventana.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const TODOS = args.includes("--todos");
const UMBRAL = 30; // casos evaluables con confirmación objetiva antes de recalibrar pesos de un diagnóstico

async function carpetaRegistro() {
  if (opt("--carpeta")) return opt("--carpeta");
  const env = join(RAIZ, ".env.exportacion");
  if (existsSync(env)) { const m = (await readFile(env, "utf8")).match(/^\s*CARPETA\s*=\s*(.+?)\s*$/m); if (m) return m[1].replace(/^["']|["']$/g, ""); }
  throw new Error("Indique la carpeta del registro con --carpeta o en .env.exportacion (CARPETA=…)");
}
const leerJSON = async (r, def) => { try { return JSON.parse(await readFile(r, "utf8")); } catch { return def; } };
const hoySV = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
// Dos corridas al día. El nombre sigue a la EXPORTACIÓN analizada (no a la hora en que corre el análisis):
// la de las 16:00 (desde las 12:00) usa «_tarde»; la de las 10:00, sin sufijo, aunque se analice más tarde.
const corridaSV = (d) => (parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/El_Salvador", hour: "numeric", hourCycle: "h23" }).format(new Date(d || Date.now()))) >= 12 ? "_tarde" : "");
const fechaSV = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date(d || Date.now()));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const disp = (uid) => "disp. " + String(uid || "").replace(/-/g, "").slice(0, 4).toUpperCase();
const cerrado = (k) => !!(k && (k.sinDx || (k.dx && k.conf)));
const OBJ = new Set(["histo", "lab", "img", "qx"]);
// Con dos bases se muestran abreviadas: «Laboratorio + Imagen».
const CONF_CORTA = { histo: "Histopatología", lab: "Laboratorio", img: "Imagen", qx: "Cirugía", resp: "Respuesta al tratamiento", clin: "Criterio clínico" };
const confTexto = (c1, c2) => (c2 ? `${CONF_CORTA[c1] || c1} + ${CONF_CORTA[c2] || c2}` : CONF[c1] || c1 || "sin indicar");
const esObjetiva = (k) => OBJ.has(k.conf) || OBJ.has(k.conf2);
// Radiografías del cierre (desde v7.9.7 también abdomen, cabeza y cadera). Si el resultado está en el cierre
// pero no se ingresó al motor, se informa como omisión. Solo la de tórax tiene una pregunta en el motor.
const RX = { rxt: { n: "Radiografía de tórax", q: "tfast" }, rxa: { n: "Radiografía de abdomen" }, rxcab: { n: "Radiografía de cabeza" }, rxcad: { n: "Radiografía de cadera" } };
const rxNoIngresadas = (k, ent) => Object.entries(RX).filter(([id, r]) => (k.tests || {})[id] && !(r.q && (ent.ans || {})[r.q] !== undefined))
  .map(([id, r]) => ({ id, n: r.n, res: k.tests[id] === "anormal" ? "Anormal" : k.tests[id] === "normal" ? "Normal" : String(k.tests[id]) }));
const CONF = { histo: "histopatología o necropsia", lab: "prueba de laboratorio específica", img: "imagen diagnóstica", qx: "hallazgo quirúrgico", resp: "respuesta al tratamiento", clin: "solo criterio clínico" };

// ─── Dentro de la página: reproducir el caso en el motor y simular datos faltantes ───
function analizarEnMotor(entrada) {
  const ORIG = { answers: window.answers, SG: window.SG };
  let OV = null; // datos simulados
  window.SG = function () { const u = ORIG.SG(); if (OV) OV.signs.forEach((s) => u.add(s)); return u; };
  window.answers = function () {
    const A = ORIG.answers();
    if (OV) for (const [k, v] of Object.entries(OV.ans)) A[k] = k === "ant" ? [...new Set([...(A.ant || []), ...v])] : v;
    return A;
  };
  const EXLBL = { temp: "Temperatura", gluc: "Glucemia", perf: "Perfusión (TLLC, mucosas y pulso)", card: "Auscultación cardíaca", galope: "Ritmo de galope",
    ausc: "Auscultación pulmonar", vejiga: "Palpación de la vejiga", garr: "Ectoparásitos en el examen", cc: "Condición corporal (CC)" };
  const VALLBL = { temp: { bajo: "< 37.5 °C", n: "normal", alto: "39.5–41 °C", vhi: "> 41 °C" }, perf: { hipo: "hipoperfusión", hiper: "hiperdinámica", n: "normal" },
    cc: { del: "CC ≤ 2/5", obeso: "CC ≥ 4/5", ideal: "CC 3/5" }, gluc: { lo: "< 60 mg/dL", n: "normal", hi: "180–300 mg/dL", vhi: "> 300 mg/dL" } };
  const PAC = { edad: ["Edad", P_EDAD], sexo: ["Sexo", P_SEXO], hemo: ["Estado hemodinámico", P_HEMO] };
  const lbl = (list, v) => (list.find((x) => x[0] === v) || [, v])[1];

  function cargar(e) {
    resetAll();
    Object.assign(ST, { esp: e.esp || null, peso: e.peso || null, edad: e.edad || null, sexo: e.sexo || null, hemo: e.hemo || null,
      motivo: e.motivo || null, motivo2: e.motivo2 || null, ex: { ...(e.ex || {}) }, ans: { ...(e.ans || {}) } });
    ST.vac.clear(); (e.vac || []).forEach((x) => ST.vac.add(x));
    ST.hxs.clear(); (e.hxs || []).forEach((x) => ST.hxs.add(x));
    ST.signs.clear(); (e.signs || []).forEach((x) => ST.signs.add(x));
  }
  function posicion(id, ov) {
    OV = ov || null;
    const l = scoreDx(); OV = null;
    const i = l.findIndex((x) => x.d.id === id);
    return { pos: i < 0 ? null : i + 1, sc: i < 0 ? null : l[i].sc, top: l.slice(0, 3).map((x) => x.d.c) };
  }
  // Datos que las reglas del diagnóstico usan y que no se registraron (ausente ≠ medido normal).
  function faltantes(d) {
    const A = answers(), G = SG(), it = [], vistos = new Set();
    const add = (o) => { if (!vistos.has(o.clave)) { vistos.add(o.clave); it.push(o); } };
    const signo = (k, w) => {
      if (G.has(k) || !SIGNS[k] || locked(k) || !sxOk(k)) return;
      const ctrl = EXCTRL[k];
      add({ clave: "s:" + k, tipo: ctrl ? "Constante o examen físico" : "Signo", dato: SIGNS[k][0] + (ctrl ? ` (examen: ${ctrl.join(", ")})` : ""), peso: w, ov: { signs: [k], ans: {} } });
    };
    if (!d.k.some((k) => G.has(k))) d.k.forEach((k) => signo(k, d.s[k] || 0));
    if (d.need && !d.need.s.some((k) => G.has(k))) d.need.s.forEach((k) => signo(k, d.s[k] || 0));
    Object.entries(d.s).forEach(([k, w]) => { if (w > 0) signo(k, w); });
    d.r.forEach(([q, vals, dl, txt, cond]) => {
      if (!(dl > 0) || !vals.length || vals.some((v) => String(v)[0] === "!") || A[q] !== undefined || q === "especie") return;
      const val = vals[0], ov = { signs: [], ans: { [q]: q === "ant" ? [val] : val } };
      if (cond) { if (A[cond[0]] === undefined) ov.ans[cond[0]] = cond[1][0]; else if (!ruleMatch(cond[1], A[cond[0]])) return; }
      const Q = QS.find((x) => x.id === q);
      let o;
      if (Q) {
        if ((Q.sp && ST.esp && !Q.sp.includes(ST.esp)) || (Q.sx && ST.sexo && !Q.sx.includes(ST.sexo))) return;
        // La pregunta solo cuenta si está visible: se simulan también sus signos de activación si faltan.
        if (!Q.w.some((s) => G.has(s))) ov.signs.push(Q.w[0]);
        o = { tipo: Q.lab ? "Examen" : "Pregunta", dato: `${qT(Q)} → «${lbl(Q.o, val)}»` };
      } else if (q === "ant") o = { tipo: "Antecedente", dato: `Antecedente: ${lbl(HXS, val)}` };
      else if (PAC[q]) o = { tipo: "Dato del paciente", dato: `${PAC[q][0]}: ${lbl(PAC[q][1], val)}` };
      else if (q === "cc") o = { tipo: "Condición corporal", dato: `Condición corporal (${(VALLBL.cc || {})[val] || val})` };
      else if (EXLBL[q]) o = { tipo: "Constante o examen físico", dato: `${EXLBL[q]}${VALLBL[q] && VALLBL[q][val] ? ` (${VALLBL[q][val]})` : ""}` };
      else if (/^s_/.test(q) && SIGNS[q.slice(2)]) { signo(q.slice(2), dl); return; }
      else if (/^v(p|r|pl|fl)$/.test(q)) o = { tipo: "Vacunación", dato: "Estado de vacunación" };
      else o = { tipo: "Otro", dato: q };
      add({ clave: "q:" + q, ...o, peso: dl, motivo: txt || "", ov });
    });
    return it;
  }

  const res = [];
  for (const c of entrada.casos) {
    const d = DX.find((x) => String(x.c).split("/").map((s) => s.trim()).includes(c.dx));
    const r = { codigo: c.codigo, dxId: d ? d.id : null, dxMotor: d ? d.n : null, sp: d ? d.sp : null };
    if (!d) { res.push(r); continue; }
    cargar(c.ent);
    const base = posicion(d.id);
    r.base = base;
    r.replicaIgual = base.top[0] === c.top1;
    const f = faltantes(d);
    r.faltantes = f.map((x) => ({ ...x, ov: undefined, conDato: posicion(d.id, x.ov) }))
      .sort((a, b) => (a.conDato.pos || 999) - (b.conDato.pos || 999) || b.peso - a.peso); // primero lo que más acerca el diagnóstico
    const todo = { signs: f.flatMap((x) => x.ov.signs), ans: Object.assign({}, ...f.map((x) => x.ov.ans)) };
    if (f.some((x) => x.ov.ans.ant)) todo.ans.ant = f.flatMap((x) => x.ov.ans.ant || []);
    r.conTodo = f.length ? posicion(d.id, todo) : base;
    res.push(r);
  }
  window.SG = ORIG.SG; window.answers = ORIG.answers;
  return res;
}

async function main() {
  const carpeta = await carpetaRegistro();
  const R = await leerJSON(join(carpeta, "datos", "registro.json"), null);
  if (!R) throw new Error(`No existe ${join(carpeta, "datos", "registro.json")}. Corra antes la exportación.`);
  const dirRep = join(carpeta, "Reportes");
  await mkdir(dirRep, { recursive: true });
  const procesados = await leerJSON(join(dirRep, "retro_procesados.json"), {});

  // Casos candidatos: cerrados, con dx definitivo codificado y que no fueron el top-1 del motor
  const cands = [], objPorDx = {};
  for (const c of R.casos) {
    const k = R.cierres[c.id];
    if (!cerrado(k) || k.sinDx || !k.dx) continue;
    const cod = String(k.dx.c || "").trim();
    if (cod && esObjetiva(k)) objPorDx[cod] = (objPorDx[cod] || 0) + 1;
    const top1 = c.sal && c.sal.top && c.sal.top[0] ? c.sal.top[0].c : null;
    if (!cod || (top1 && String(top1).split("/").map((s) => s.trim()).includes(cod))) continue;
    const posReg = (c.sal.top || []).findIndex((t) => String(t.c).split("/").map((s) => s.trim()).includes(cod));
    cands.push({ codigo: c.id, f: c.f, v: c.v, por: c.por, ent: c.ent || {}, dx: cod, dxNombre: k.dx.n, conf: k.conf, conf2: k.conf2 || null, rx: rxNoIngresadas(k, c.ent || {}), fc: k.fc,
      top1, top1Nombre: c.sal.top[0] ? c.sal.top[0].n : "—", posRegistrada: posReg < 0 ? null : posReg + 1 });
  }

  // Ejecutar el motor
  const dir = await mkdtemp(join(tmpdir(), "hvcp-retro-"));
  const browser = await chromium.launch({ channel: process.env.PW_CANAL || "chrome" });
  let res;
  try {
    await writeFile(join(dir, "index.html"), await readFile(join(RAIZ, "index.html")));
    await writeFile(join(dir, "config.js"), 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};');
    const page = await browser.newPage();
    const errores = []; page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(pathToFileURL(join(dir, "index.html")).href);
    await page.waitForLoadState("load");
    const motorVer = await page.evaluate(() => MOTOR_VER);
    res = await page.evaluate(analizarEnMotor, { casos: cands.map((c) => ({ codigo: c.codigo, dx: c.dx, top1: c.top1, ent: c.ent })) });
    if (errores.length) throw new Error("Errores del motor: " + errores.join(" | "));
    res.motorVer = motorVer;
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }

  // Clasificar
  const ESP = { c: "c", f: "f" }, filas = [];
  cands.forEach((c, i) => {
    const r = res[i], e = c.ent;
    let tipo, nota = "";
    if (!r.dxId) tipo = "c";
    else if (e.esp && r.sp && !r.sp.includes(ESP[e.esp])) { tipo = "d"; nota = `El diagnóstico del cierre no corresponde a la especie registrada (${e.esp === "f" ? "felino" : "canino"}).`; }
    else if ((r.dxId === "piometra" && e.sexo && !["he", "hl"].includes(e.sexo)) || (r.dxId === "eclampsia" && e.sexo && e.sexo !== "hl")) { tipo = "d"; nota = "El diagnóstico del cierre no corresponde al sexo o estado reproductivo registrado."; }
    else if (c.fc && new Date(c.fc) < new Date(c.f)) { tipo = "d"; nota = "La fecha del cierre es anterior a la del caso."; }
    else if (r.base.pos && r.base.pos <= 3 && !r.faltantes.some((x) => x.conDato.pos && x.conDato.pos < r.base.pos)) tipo = "cercano";
    else if (r.faltantes.length && r.conTodo.pos && r.conTodo.pos <= 3) tipo = "a";
    else tipo = "b";
    filas.push({ ...c, ...r, tipo, nota, nuevo: TODOS || !procesados[c.codigo] });
  });

  // Resumen de datos omitidos (solo diferencias tipo «a»)
  const cuenta = (lista) => { const m = {}; lista.filter((f) => f.tipo === "a").forEach((f) => f.faltantes.filter((x) => x.conDato.pos && (!f.base.pos || x.conDato.pos < f.base.pos))
    .forEach((x) => { const k = x.tipo + " · " + x.dato; (m[k] = m[k] || new Set()).add(f.codigo); })); lista.forEach((f) => (f.rx || []).forEach((x) => { const k = "Resultado del cierre no ingresado al motor · " + x.n; (m[k] = m[k] || new Set()).add(f.codigo); }));
    return Object.entries(m).map(([k, s]) => [k, s.size]).sort((a, b) => b[1] - a[1]); };
  const nuevos = filas.filter((f) => f.nuevo);
  const resumenHoy = cuenta(nuevos), resumenAcum = cuenta(filas);

  // propuestas.json: diferencias tipo «b», acumuladas por diagnóstico; conserva decisiones ya tomadas
  const rutaProp = join(dirRep, "propuestas.json");
  const prev = await leerJSON(rutaProp, { propuestas: [] });
  const previas = new Map((prev.propuestas || []).map((p) => [p.id, p]));
  const porDx = {};
  filas.filter((f) => f.tipo === "b").forEach((f) => {
    const p = (porDx[f.dx] = porDx[f.dx] || { id: "ajuste:" + f.dx, tipo: "ajuste_motor", dx_codigo: f.dx, dx_motor: f.dxId, diagnostico: f.dxMotor || f.dxNombre, casos: [] });
    p.casos.push({ codigo: f.codigo, dispositivo: disp(f.por), confirmacion: confTexto(f.conf, f.conf2), posicion_registrada: f.posRegistrada, posicion_con_datos_completos: f.conTodo.pos,
      top1_motor: f.top1Nombre, datos_simulados: f.faltantes.map((x) => x.dato) });
  });
  const propuestas = Object.values(porDx).map((p) => {
    const nObj = objPorDx[p.dx_codigo] || 0, ant = previas.get(p.id) || {};
    return { ...p, n_casos: p.casos.length, evaluables_con_confirmacion_objetiva: nObj, umbral: UMBRAL,
      estado: ant.decision ? ant.estado : nObj >= UMBRAL ? "pendiente de aprobación" : `a vigilar (faltan ${UMBRAL - nObj} casos con confirmación objetiva)`,
      decision: ant.decision || null, nota_decision: ant.nota_decision || null,
      propuesta: `Revisar pesos y reglas de «${p.diagnostico}» frente a ${p.casos[0].top1_motor} y los demás diagnósticos que lo superan; validar con la prueba de equivalencia antes de publicar.`,
      actualizado: new Date().toISOString() };
  });
  for (const [id, p] of previas) if (!propuestas.some((x) => x.id === id)) propuestas.push(p); // no se pierde ninguna
  await writeFile(rutaProp, JSON.stringify({ generado: new Date().toISOString(), umbral_evidencia: UMBRAL,
    nota: "Propuestas pendientes de aprobación. Para decidir, llene «decision» (aprobada/rechazada) y «nota_decision». Nada se aplica solo.", propuestas }, null, 2));

  // HTML
  const fecha = fechaSV(R.generado), sufijo = corridaSV(R.generado);
  const TIT = { a: "a) Omisión de datos", b: "b) Ajuste del motor", c: "c) Fuera del catálogo del motor", d: "d) Cierre inconsistente", cercano: "Diferencial cercano (2.º o 3.º con los datos registrados)" };
  const pos = (p) => (p ? `${p}.º` : "fuera de la lista");
  const ficha = (f) => {
    let cuerpo = "";
    if (f.tipo === "a" || f.tipo === "b" || f.tipo === "cercano") {
      const utiles = f.faltantes.filter((x) => x.conDato.pos && (!f.base.pos || x.conDato.pos < f.base.pos));
      const items = (f.tipo === "a" ? utiles : f.faltantes).slice(0, 8).map((x) =>
        `<li>No se registró <b>${esc(x.dato)}</b> <span class="t">(${esc(x.tipo)})</span>. Si estaba presente, registrarlo orienta a <b>${esc(f.dxMotor)}</b>: habría quedado ${pos(x.conDato.pos)}${f.base.pos ? ` (con lo registrado quedó ${pos(f.base.pos)})` : ""}.</li>`).join("");
      cuerpo = f.tipo === "a"
        ? `<ul>${items}</ul><p class="m">Con todos esos datos, ${esc(f.dxMotor)} habría quedado ${pos(f.conTodo.pos)}.</p>`
        : f.tipo === "b"
          ? `<p>Con los datos registrados quedó ${pos(f.base.pos)}${f.faltantes.length ? ` y, aun agregando lo que sus reglas usan (${f.faltantes.length} dato${f.faltantes.length > 1 ? "s" : ""}), quedaría ${pos(f.conTodo.pos)}` : "; sus reglas no usan ningún dato que falte"}. Pasa a <i>propuestas.json</i> para revisar el motor.</p>${items ? `<details><summary>Datos simulados</summary><ul>${items}</ul></details>` : ""}`
          : `<p>Con los datos registrados ${esc(f.dxMotor)} quedó ${pos(f.base.pos)}: era un diferencial cercano y el médico confirmó el correcto.</p>`;
    } else if (f.tipo === "c") cuerpo = `<p>El código ${esc(f.dx)} no corresponde a ningún diagnóstico del motor. Se cuenta para proponer diagnósticos nuevos.</p>`;
    else cuerpo = `<p>${esc(f.nota)} Revisar el cierre del caso.</p>`;
    return `<div class="caso"><div class="h"><b>${esc(f.codigo)}</b> · ${esc(disp(f.por))} · ${esc(String(f.f).slice(0, 10))} · v${esc(f.v)}</div>
      <p>Definitivo: <b>${esc(f.dxNombre)}</b> <span class="t">${esc(f.dx)} · confirmación: ${esc(confTexto(f.conf, f.conf2))}</span><br>Motor (1.º): ${esc(f.top1Nombre)}${f.posRegistrada ? ` · el definitivo estaba ${pos(f.posRegistrada)}` : " · el definitivo no estaba entre los 8 primeros"}${f.replicaIgual === false ? ` <span class="t">(al repetirlo con el motor v${esc(res.motorVer)} el orden cambia)</span>` : ""}</p>${cuerpo}${(f.rx || []).length ? `<p class="m">Resultado registrado en el cierre que no se ingresó al motor: ${f.rx.map((x) => `<b>${esc(x.n)}</b> («${esc(x.res)}»)`).join("; ")}. Ingresarlo en el motor al atender ayuda a orientar el diagnóstico.</p>` : ""}</div>`;
  };
  const seccion = (lista, t) => { const g = lista.filter((f) => f.tipo === t); return g.length ? `<h3>${TIT[t]} · ${g.length}</h3>${g.map(ficha).join("")}` : ""; };
  const tabla = (rs) => rs.length ? `<table><tr><th>Dato no registrado</th><th>Casos</th></tr>${rs.slice(0, 15).map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`).join("")}</table>` : `<p class="m">Sin omisiones que cambien el resultado.</p>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retroalimentación ${fecha}${sufijo ? " (tarde)" : ""}</title>
<style>body{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#1d2433;background:#f6f7fb;margin:0;padding:16px}main{max-width:900px;margin:auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:24px 0 8px;color:#0f2a3d}h3{font-size:15px;margin:18px 0 8px;color:#3d4a66}
.caso{background:#fff;border:1px solid #dfe4ee;border-radius:10px;padding:10px 14px;margin:8px 0}.caso .h{font-size:13px;color:#5a6478}.t{color:#5a6478;font-size:13px}.m{color:#5a6478}ul{padding-left:20px;margin:6px 0}li{margin:3px 0}
table{border-collapse:collapse;width:100%;background:#fff}td,th{border-bottom:1px solid #dfe4ee;padding:6px 8px;text-align:left;font-size:14px}td.n{text-align:right;font-variant-numeric:tabular-nums}.aviso{background:#fff6d6;border:1px solid #f0d77a;border-radius:10px;padding:10px 14px}</style></head><body><main>
<h1>Retroalimentación de casos · ${fecha}${sufijo ? " · tarde" : ""}</h1><p class="m">Motor v${esc(res.motorVer)} · casos cerrados con diagnóstico definitivo codificado que no quedaron en el 1.er lugar del motor. ${TODOS ? "Todos los casos del registro." : "Casos nuevos desde el reporte anterior."}</p>
<p class="aviso">Material formativo. El motor no distingue un dato ausente de uno no registrado: «no se registró» no significa que el médico no lo evaluó. Los casos se identifican por código MC y dispositivo, sin nombres.</p>
<h2>Casos (${nuevos.length})</h2>${nuevos.length ? ["a", "b", "cercano", "c", "d"].map((t) => seccion(nuevos, t)).join("") : `<p class="m">No hay casos nuevos con diferencias.</p>`}
<h2>Datos que más se omiten</h2><h3>En este reporte</h3>${tabla(resumenHoy)}<h3>Acumulado del registro (${filas.length} diferencias)</h3>${tabla(resumenAcum)}
<p class="m">Tipos en el acumulado: ${["a", "b", "cercano", "c", "d"].map((t) => `${TIT[t].split(" (")[0]}: ${filas.filter((f) => f.tipo === t).length}`).join(" · ")}. Propuestas de ajuste en propuestas.json (umbral: ${UMBRAL} casos con confirmación objetiva por diagnóstico).</p>
</main></body></html>`;
  const rutaHtml = join(dirRep, `Retroalimentacion_${fecha}${sufijo}.html`);
  await writeFile(rutaHtml, html);
  nuevos.forEach((f) => { procesados[f.codigo] = fecha; });
  await writeFile(join(dirRep, "retro_procesados.json"), JSON.stringify(procesados, null, 1));
  const resumen = { fecha, corrida: sufijo ? "tarde" : "mañana", motor: res.motorVer, casos_nuevos: nuevos.length, por_tipo_nuevos: Object.fromEntries(["a", "b", "cercano", "c", "d"].map((t) => [t, nuevos.filter((f) => f.tipo === t).length])),
    por_tipo_acumulado: Object.fromEntries(["a", "b", "cercano", "c", "d"].map((t) => [t, filas.filter((f) => f.tipo === t).length])),
    mas_omitidos_hoy: resumenHoy.slice(0, 10), mas_omitidos_acumulado: resumenAcum.slice(0, 10), propuestas: propuestas.length, archivo: rutaHtml };
  await writeFile(join(dirRep, "retro_resumen.json"), JSON.stringify(resumen, null, 1));
  console.log(`Retroalimentación: ${nuevos.length} casos nuevos (${Object.entries(resumen.por_tipo_nuevos).map(([k, v]) => k + "=" + v).join(", ")}) · ${propuestas.length} propuestas · ${rutaHtml}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
