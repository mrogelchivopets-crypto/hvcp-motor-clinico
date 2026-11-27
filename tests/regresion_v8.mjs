// Regresión v7.9.7 (tests/ref/index_v7.9.7.html) contra v8.0 (index.html), sin red.
// Uso: node tests/regresion_v8.mjs [combinaciones=600] [casosPorSemilla=3000]
//  1) Identidad clínica: combinaciones al azar (generarYAplicar de tests/equivalencia.spec.js). En la v7.9.7 se fija el
//     estado hemodinámico que calcula la v8.0; en la v8.0, conciencia = Deprimido. Compara top-5 con puntajes.
//  2) Simulación por perfiles: un perfil por diagnóstico del motor, casos generados desde sus propias reglas (signos clave,
//     signos de apoyo y respuestas que suman), 2 semillas. Acierto top-1 = el diagnóstico del perfil queda 1.º.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path"; import { tmpdir } from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const N_ID = Number(process.argv[2] || 600), N_SIM = Number(process.argv[3] || 3000);
const spec = await readFile(join(RAIZ, "tests/equivalencia.spec.js"), "utf8");
const fn = (n) => { const i = spec.indexOf(`function ${n}(`); return spec.slice(i, spec.indexOf("\n}\n", i) + 2); };
const GEN = fn("generarYAplicar"), APL = fn("aplicar");

// Generador por perfil de diagnóstico (se ejecuta en la página de la v7.9.7 y devuelve el registro de acciones).
const PERFIL = `function perfilCaso(semilla, id){
  let s=semilla>>>0||1; const rnd=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296};
  const p=(x)=>rnd()<x, uno=(l)=>l[Math.floor(rnd()*l.length)], log=[], hacer=(f,...a)=>{log.push([f,...a]);window[f](...a)};
  const d=DX.find(x=>x.id===id); const esp=uno(d.sp); hacer("setEsp",esp);
  hacer("setEdad",uno(P_EDAD)[0]);
  const sx=d.id==="piometra"?uno(["he","hl"]):d.id==="eclampsia"?"hl":uno(P_SEXO)[0]; hacer("setSexo",sx);
  hacer("setPeso",(esp==="f"?2+rnd()*5:3+rnd()*40).toFixed(1));
  const clave=d.k.filter(k=>SIGNS[k]); const k0=uno(clave.length?clave:Object.keys(d.s));
  const mot=MOTIVOS.filter(m=>m.signs.includes(k0)); hacer("setMotivo",(mot.length?uno(mot):uno(MOTIVOS)).id);
  if(SIGNS[k0]&&!ST.signs.has(k0)) hacer("toggleSign",k0);
  Object.entries(d.s).forEach(([k,w])=>{if(w>0&&k!==k0&&SIGNS[k]&&p(0.45)&&!ST.signs.has(k))hacer("toggleSign",k)});
  d.r.forEach(([q,vals,dl])=>{if(dl>0&&vals.length&&!vals.some(v=>String(v)[0]==="!")&&QS.find(x=>x.id===q)&&ST.ans[q]===undefined&&p(0.55))hacer("answer",q,vals[0])});
  log.push(["renderAll"]); renderAll(); return log;
}`;

const b = await chromium.launch({ channel: process.env.PW_CANAL || "chrome" });
async function pagina(html) {
  const d = await mkdtemp(join(tmpdir(), "rg8-")); await writeFile(join(d, "index.html"), html);
  await writeFile(join(d, "config.js"), 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};');
  const p = await b.newPage(); const err = []; p.on("pageerror", (e) => err.push(String(e))); p.on("dialog", (x) => x.dismiss());
  await p.addInitScript(() => { try { localStorage.setItem("hvcp_medico", JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", nombre: "Regresión" })); localStorage.setItem("hvcp_aviso_pin", "1"); } catch (e) {} });
  await p.goto(pathToFileURL(join(d, "index.html")).href);
  await p.evaluate(`window.__gen=${GEN};window.__apl=${APL};window.__perfil=${PERFIL};
    window.__top=()=>scoreDx().slice(0,5).map(x=>x.d.id+":"+x.sc);
    window.__reset=()=>{resetAll();ST.avisoMot=true;if(typeof perfilCerrar==="function")perfilCerrar();};`);
  return { p, err };
}
const V7 = await pagina(await readFile(join(RAIZ, "tests/ref/index_v7.9.7.html"))), V8 = await pagina(await readFile(join(RAIZ, "index.html")));

// v8: conciencia = Deprimido y estado calculado; v7.9.7: se fija ese estado (null = sin marcar, como «Pendiente»)
async function emparejar() {
  const h = await V8.p.evaluate(() => { setConc("dep"); return hemoCalc().k; });
  await V7.p.evaluate((h) => { ST.hemo = h; renderAll(); }, h);
  return h;
}

// 1) Identidad clínica
let iguales = 0; const difs = [];
for (let i = 0; i < N_ID; i++) {
  const semilla = 7919 * (i + 1) + 104729;
  await V7.p.evaluate(() => __reset()); await V8.p.evaluate(() => __reset());
  const log = await V7.p.evaluate((s) => __gen(s), semilla);
  await V8.p.evaluate((l) => __apl(l), log);
  const h = await emparejar();
  const [a, n] = await Promise.all([V7.p.evaluate(() => __top()), V8.p.evaluate(() => __top())]);
  if (a.join() === n.join()) iguales++; else difs.push({ semilla, hemo: h, v797: a.slice(0, 3), v80: n.slice(0, 3),
    hemoV797: await V7.p.evaluate(() => HEMO()), ex: await V8.p.evaluate(() => ST.ex) });
}

// 2) Simulación por perfiles
const ids = await V7.p.evaluate(() => DX.map((d) => d.id));
const sim = {};
for (const semBase of [1, 2]) {
  const r = { casos: 0, v797: 0, v80: 0, porDx: {} };
  for (let i = 0; i < N_SIM; i++) {
    const id = ids[i % ids.length], semilla = semBase * 1000003 + i * 7919;
    await V7.p.evaluate(() => __reset()); await V8.p.evaluate(() => __reset());
    const log = await V7.p.evaluate(([s, id]) => __perfil(s, id), [semilla, id]);
    await V8.p.evaluate((l) => __apl(l), log);
    await emparejar();
    const [a, n] = await Promise.all([V7.p.evaluate(() => __top()), V8.p.evaluate(() => __top())]);
    const ok7 = (a[0] || "").split(":")[0] === id, ok8 = (n[0] || "").split(":")[0] === id;
    r.casos++; r.v797 += ok7; r.v80 += ok8;
    const x = (r.porDx[id] = r.porDx[id] || { n: 0, v797: 0, v80: 0 }); x.n++; x.v797 += ok7; x.v80 += ok8;
  }
  r.pct797 = +(100 * r.v797 / r.casos).toFixed(2); r.pct80 = +(100 * r.v80 / r.casos).toFixed(2);
  r.cayeron = Object.entries(r.porDx).filter(([, x]) => x.v80 < x.v797).map(([id, x]) => `${id} ${x.v797}→${x.v80}/${x.n}`);
  sim["semilla " + semBase] = r;
}
await b.close();
const out = { identidad: { combinaciones: N_ID, iguales, diferencias: difs.length, ejemplos: difs.slice(0, 15) },
  simulacion: Object.fromEntries(Object.entries(sim).map(([k, r]) => [k, { casos: r.casos, perfiles: ids.length, acierto_v797: r.pct797, acierto_v80: r.pct80, diferencia: +(r.pct80 - r.pct797).toFixed(2), cayeron: r.cayeron }])),
  errores: { v797: V7.err.length, v80: V8.err.length } };
await mkdir(join(RAIZ, "docs/v8"), { recursive: true });
await writeFile(join(RAIZ, "docs/v8/regresion_v8.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, identidad: { ...out.identidad, ejemplos: out.identidad.ejemplos.slice(0, 5) } }, null, 1));
