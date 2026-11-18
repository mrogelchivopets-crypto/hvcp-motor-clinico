// Importa al registro en línea los casos y cierres del Excel exportado por el Motor Clínico
// v7.9.6 (botón «Exportar a Excel» del registro anterior). Usa las hojas «Casos» y «Matriz ML».
//
//   Revisión (no envía nada):   npm run importar -- "Registro_MC_HVCP_2026-11-01.xlsx"
//   Ver el detalle:             npm run importar -- "archivo.xlsx" --ver
//   Importar de verdad:         npm run importar -- "Registro_MC_HVCP_2026-11-01.xlsx" --enviar
//
// · Entra como ADMINISTRADOR (ADMIN_EMAIL / ADMIN_PASSWORD en .env). No usa la service_role key.
// · Idempotente por código MC: si el código ya existe en el registro, no lo toca.
// · Los casos quedan a nombre del admin y marcados como «migrado».
// · El Excel no trae datos del propietario; el script tampoco los acepta (ver COLUMNAS_PROHIBIDAS).
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
if (existsSync(RAIZ + ".env")) process.loadEnvFile(RAIZ + ".env");

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const ENVIAR = args.includes("--enviar");
const VER = args.includes("--ver");   // muestra en JSON lo que se enviaría
if (!archivo) {
  console.error('Uso: npm run importar -- "archivo.xlsx" [--enviar]');
  process.exit(1);
}

// ─── Catálogos del motor, leídos de index.html (así el mapeo nunca se desfasa) ───
function literal(src, nombre) {
  const m = new RegExp(`const ${nombre}\\s*=\\s*`).exec(src);
  if (!m) throw new Error(`No encontré ${nombre} en index.html`);
  let i = m.index + m[0].length, prof = 0, cad = null;
  const ini = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (cad) { if (ch === "\\") i++; else if (ch === cad) cad = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") cad = ch;
    else if (ch === "[" || ch === "{") prof++;
    else if (ch === "]" || ch === "}") { prof--; if (prof === 0) break; }
  }
  return vm.runInNewContext(`(${src.slice(ini, i + 1)})`);
}
const html = await readFile(RAIZ + "index.html", "utf8");
const K = Object.fromEntries(["P_ESP", "P_EDAD", "P_SEXO", "P_HEMO", "EX_CARD", "EX_PULM", "EX_VEJ", "CONF", "LABN", "LABT", "TLBL", "VCIE", "QS", "SIGNS", "MOTIVOS"]
  .map((n) => [n, literal(html, n)]));
// Código VetCIE-1 → id interno y sistema del diagnóstico (para completar el top del motor)
const DXMAP = new Map([...html.matchAll(/\{id:"([^"]+)",n:"[^"]*",c:"([^"]*)",sys:"([^"]*)"/g)].map(([, id, c, sys]) => [c, { id, sys }]));
const VC = new Map(K.VCIE.map((r) => [r[0], r]));
const MULTI = new Set(K.QS.filter((q) => q.multi).map((q) => q.id));
const inv = (lista, etiqueta) => { const o = lista.find((x) => x[1] === etiqueta); return o ? o[0] : null; };

const COLUMNAS_PROHIBIDAS = /propietari|dueñ|due[nñ]o|cliente|tel[eé]fono|celular|direcci|domicilio|expediente|dui|correo|e-?mail/i;
const CODIGO = /^MC-[A-HJ-NP-Z2-9]{6}$/;

// ─── Lectura del Excel ───
const wb = XLSX.read(await readFile(archivo));
for (const h of ["Casos", "Matriz ML"]) if (!wb.Sheets[h]) { console.error(`El archivo no tiene la hoja «${h}». ¿Es el Excel exportado por el Motor Clínico?`); process.exit(1); }
const casos = XLSX.utils.sheet_to_json(wb.Sheets["Casos"], { defval: "" });
const matriz = new Map(XLSX.utils.sheet_to_json(wb.Sheets["Matriz ML"], { defval: "" }).map((r) => [String(r.codigo).trim().toUpperCase(), r]));
const cols = Object.keys(casos[0] || {});
const malas = cols.filter((c) => COLUMNAS_PROHIBIDAS.test(c));
if (malas.length) { console.error(`El archivo trae columnas con posibles datos del propietario (${malas.join(", ")}). Quítelas antes de importar.`); process.exit(1); }

const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const txt = (v) => (v === "" || v == null ? "" : String(v));
const lista = (v) => txt(v).split(";").map((s) => s.trim()).filter(Boolean);
// «2026-10-03 14:25» (hora de El Salvador, UTC−6) → ISO
function fecha(v) {
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); v = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")} ${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}`; }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(txt(v));
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-06:00`).toISOString() : null;
}

function convertir(f) {
  const codigo = txt(f["Código"]).trim().toUpperCase();
  if (!CODIGO.test(codigo)) return { error: `código inválido «${f["Código"]}»` };
  const m = matriz.get(codigo);
  if (!m) return { error: `${codigo}: no está en la hoja «Matriz ML»` };
  const f0 = fecha(f["Fecha"]);
  if (!f0) return { error: `${codigo}: fecha ilegible «${f["Fecha"]}»` };

  const signsAll = Object.keys(K.SIGNS).filter((s) => +m["s_" + s] === 1);
  const ans = {};
  for (const q of K.QS) {
    const v = m["q_" + q.id];
    if (v === "" || v == null) continue;
    ans[q.id] = MULTI.has(q.id) ? String(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : String(v);
  }
  const ex = {};
  for (const [k, col] of [["fc", "fc"], ["fr", "fr"], ["temp", "temp"], ["muc", "mucosas"], ["tllc", "tllc"], ["pulso", "pulso"], ["dh", "dh"], ["cc", "cc"]]) {
    if (m[col] !== "" && m[col] != null) ex[k] = String(m[col]);
  }
  const card = inv(K.EX_CARD, f["Ausc. cardíaca"]), pulm = inv(K.EX_PULM, f["Ausc. pulmonar"]), vej = inv(K.EX_VEJ, f["Vejiga"]);
  if (card) ex.card = card; if (pulm) ex.pulm = pulm; if (vej) ex.vej = vej;

  const top = [];
  for (let i = 1; i <= 3; i++) {
    const n = txt(f[`Motor ${i}`]); if (!n) continue;
    const c = txt(f[`Motor ${i} código`]), d = DXMAP.get(c) || {};
    top.push({ id: d.id || "", c, n, sys: d.sys || "", sc: num(f[`Motor ${i} puntaje`]) ?? 0 });
  }
  const [, qVis] = txt(f["Preguntas sin responder"]).split("/").map(Number);
  const motivo2 = K.MOTIVOS.find((x) => x.n === txt(f["Motivo secundario"]));

  const caso = {
    id: codigo, f: f0, v: txt(f["Versión motor"]) || "?",
    ent: { esp: m.especie || null, peso: num(m.peso), edad: m.edad || null, sexo: m.sexo || null, hemo: m.hemo || null,
           ex, motivo: m.motivo || null, motivo2: motivo2 ? motivo2.id : null, signs: signsAll, signsAll, ans },
    sal: { top, alta: lista(f["Alta probabilidad"]), soap: lista(f["SOAP"]), soapAuto: txt(f["SOAP elegida por"]) !== "Médico",
           insuf: txt(f["Datos insuficientes"]) === "Sí", sinDx: top.length === 0, faltan: lista(f["Campos faltantes"]),
           qVis: Number.isFinite(qVis) ? qVis : 0, qPend: [] },
  };

  // Cierre (si lo hubo)
  const dxNom = txt(f["Dx definitivo"]), dxCod = txt(f["Dx definitivo código"]);
  const sinDx = dxNom === "Sin diagnóstico definitivo";
  const dx = dxNom && !sinDx ? { c: dxCod, n: dxNom, cap: (VC.get(dxCod) || [])[3] || "", nuevo: m.dx_def === "NUEVO" || !dxCod } : null;
  const con = lista(f["Concomitantes"]).map((x) => { const r = VC.get(x); return r ? { c: r[0], n: r[1], cap: r[3] } : { c: "", n: x, cap: "", nuevo: true }; });
  const labs = {}; for (const [id, n, u] of K.LABN) { const v = num(f[`${n} (${u})`]); if (v != null) labs[id] = v; }
  const tests = {}; for (const [id, n] of K.LABT) { const v = Object.entries(K.TLBL).find(([, l]) => l === txt(f[n])); if (v) tests[id] = v[0]; }
  const conf = txt(m.conf) || inv(K.CONF, f["Confirmación"]) || "";
  const hayCierre = dx || sinDx || con.length || Object.keys(labs).length || Object.keys(tests).length || txt(f["Otros resultados"]) || txt(f["Notas"]);
  if (dx && !conf) return { error: `${codigo}: tiene diagnóstico definitivo sin base de confirmación` };
  const cierre = hayCierre ? { dx, con, sinDx, conf, labs, tests, otros: txt(f["Otros resultados"]).slice(0, 300), notas: txt(f["Notas"]).slice(0, 600) } : null;
  return { codigo, caso, cierre };
}

const listos = [], errores = [];
const vistos = new Set();
for (const f of casos) {
  const r = convertir(f);
  if (r.error) { errores.push(r.error); continue; }
  if (vistos.has(r.codigo)) { errores.push(`${r.codigo}: repetido en el archivo (se usa la primera fila)`); continue; }
  vistos.add(r.codigo); listos.push(r);
}

console.log(`Archivo: ${archivo}`);
console.log(`Filas en «Casos»: ${casos.length} · listas para importar: ${listos.length} · con cierre: ${listos.filter((x) => x.cierre).length}`);
if (errores.length) { console.log(`\nNo se importarán (${errores.length}):`); errores.forEach((e) => console.log("  · " + e)); }

if (VER) console.log(JSON.stringify(listos, null, 1));
if (!ENVIAR) {
  console.log("\nModo revisión: no se envió nada. Para importar agregue --enviar.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error("Faltan SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL o ADMIN_PASSWORD en .env");
  process.exit(1);
}
if (anon.startsWith("sb_secret_") || /service_role/.test(Buffer.from(anon.split(".")[1] || "", "base64").toString())) {
  console.error("SUPABASE_ANON_KEY es la service_role key. Use la anon key: este script entra como administrador.");
  process.exit(1);
}
const sb = createClient(url, anon, { auth: { persistSession: false } });
const { error: eLogin } = await sb.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
if (eLogin) { console.error("No se pudo entrar como administrador: " + eLogin.message); process.exit(1); }
console.log(`\nImportando en ${new URL(url).host} …`);

let nuevos = 0, existentes = 0, fallos = 0;
for (const { codigo, caso, cierre } of listos) {
  const { data, error } = await sb.rpc("importar_caso", { p: caso, p_cierre: cierre });
  if (error) { fallos++; console.log(`  ✗ ${codigo}: ${error.message}`); }
  else if (data) nuevos++;
  else existentes++;
}
console.log(`\nListo. Nuevos: ${nuevos} · ya existían (sin cambios): ${existentes} · con error: ${fallos}`);
await sb.auth.signOut();
process.exit(fallos ? 2 : 0);
