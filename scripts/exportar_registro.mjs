// Exporta el registro del hospital a una carpeta (OneDrive) sin intervención:
//   Registro_Motor_Clinico_HVCP.xlsx        → el Excel vigente (mismas hojas que «Exportar a Excel» del panel)
//   historico/Registro_..._AAAA-MM-DD.xlsx  → copia del día (queda la última versión de cada día)
//   datos/registro.json                     → casos, cierres y sesiones en bruto, para el análisis diario
//   exportacion.log                         → una línea por ejecución
//   Tablero_Motor_Clinico.html y Reportes/tablero/casos.json → el tablero, regenerado en cada exportación
// Uso:  node scripts/exportar_registro.mjs            (lee .env.exportacion, ver .env.exportacion.ejemplo)
// Lo programa el Programador de tareas de Windows cada 15 minutos (scripts/programar_exportacion.ps1).
// Usa una cuenta con rol «lector»: puede leer el registro pero no anular ni modificar nada.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, rename, rm, mkdtemp, appendFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const NOMBRE = "Registro_Motor_Clinico_HVCP";
// Scripts del tablero (los aprobados de la tarea de análisis). Con cada exportación se regeneran
// Reportes/tablero/casos.json y Tablero_Motor_Clinico.html, así el tablero queda al día junto con el Excel.
const DIR_TABLERO = process.env.TABLERO_SCRIPTS || join(homedir(), ".claude", "scheduled-tasks", "hvcp-analisis-diario-motor");

// GitHub (rama main) es la fuente única del motor y la nube puede publicar cambios: antes de exportar
// se trae la última versión, solo si la carpeta está en main y sin cambios locales (nunca se descarta nada).
function actualizarMotor() {
  const git = (...a) => execFileSync("git", a, { cwd: RAIZ, stdio: "pipe", timeout: 60000 }).toString().trim();
  try {
    if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") return "motor sin actualizar (la carpeta no está en main)";
    if (git("status", "--porcelain", "--untracked-files=no")) return "motor sin actualizar (hay cambios locales sin guardar)";
    const antes = git("rev-parse", "--short", "HEAD");
    git("pull", "--ff-only", "--quiet", "origin", "main");
    const despues = git("rev-parse", "--short", "HEAD");
    return antes === despues ? `motor al día (${despues})` : `motor actualizado ${antes}→${despues}`;
  } catch (e) { return "motor sin actualizar (" + String(e.stderr || e.message).trim().split(/\r?\n/).pop().slice(0, 80) + ")"; }
}

function generarTablero(carpeta) {
  const g1 = join(DIR_TABLERO, "generar_tablero.py"), g2 = join(DIR_TABLERO, "generar_tablero_html.py");
  if (!existsSync(g1) || !existsSync(g2)) return "tablero: no se encontraron los scripts";
  const dt = join(carpeta, "Reportes", "tablero");
  const py = (args) => execFileSync(process.env.PYTHON || "python", ["-I", ...args], { stdio: "pipe", timeout: 120000 });
  py([g1, join(carpeta, "datos", "registro.json"), join(RAIZ, "index.html"), join(dt, "casos.json")]);
  py([g2, join(dt, "casos.json"), join(dt, "propuestas.json"), join(carpeta, "Tablero_Motor_Clinico.html")]);
  return "tablero actualizado";
}

async function leerConfig() {
  const ruta = process.env.EXPORT_ENV || join(RAIZ, ".env.exportacion");
  if (!existsSync(ruta)) throw new Error(`Falta ${ruta} (copie .env.exportacion.ejemplo y llénelo).`);
  const cfg = {};
  for (const l of (await readFile(ruta, "utf8")).split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "LECTOR_EMAIL", "LECTOR_PASSWORD", "CARPETA"])
    if (!cfg[k]) throw new Error(`Falta ${k} en ${ruta}`);
  if (/^sb_secret_|service_role/.test(cfg.SUPABASE_PUBLISHABLE_KEY)) throw new Error("Use la clave pública (sb_publishable_…), nunca la secreta.");
  return cfg;
}

// Escribe sin dejar un archivo a medias. Si Excel tiene el archivo abierto (bloqueado), lo deja
// para la siguiente ejecución en vez de fallar.
async function escribirSeguro(destino, datos) {
  const tmp = destino + ".tmp";
  await writeFile(tmp, datos);
  try { await rename(tmp, destino); return true; }
  catch (e) {
    await rm(tmp, { force: true });
    if (["EBUSY", "EPERM", "EACCES"].includes(e.code)) return false;
    throw e;
  }
}

const hoySV = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
const ahoraSV = () => new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" });

async function exportar(cfg) {
  const dir = await mkdtemp(join(tmpdir(), "hvcp-export-"));
  const browser = await chromium.launch({ channel: process.env.PW_CANAL || "chrome" });
  try {
    // Copia del motor sin configuración: la página no abre sesiones anónimas ni ensucia el tablero de uso.
    await writeFile(join(dir, "index.html"), await readFile(join(RAIZ, "index.html")));
    await writeFile(join(dir, "config.js"), 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};');
    const page = await browser.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(pathToFileURL(join(dir, "index.html")).href);
    await page.waitForLoadState("load");
    const r = await page.evaluate(async ({ url, key, email, pass }) => {
      await cargarSupabase();
      const sb = window.supabase.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const s = await sb.auth.signInWithPassword({ email, password: pass });
      if (s.error) return { error: "No se pudo entrar con la cuenta lectora: " + s.error.message };
      Object.assign(REG, { sb, uid: s.data.user.id, admin: true, listo: true, rango: "todo", vet: "", abierto: false });
      await regCargar();
      if (REG.err) return { error: REG.err };
      await cargarXLSX();
      const wb = regLibro("Todo el registro");
      const b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
      const datos = { generado: new Date().toISOString(), version_motor: MOTOR_VER, casos: REG.todos,
        cierres: Object.fromEntries(REG.cierresTodos || new Map()), sesiones: REG.ses || [] };
      await sb.auth.signOut();
      return { b64, datos, n: REG.todos.length, cerrados: REG.todos.filter((c) => cerrado(REG.cierresTodos.get(c.id))).length };
    }, { url: cfg.SUPABASE_URL, key: cfg.SUPABASE_PUBLISHABLE_KEY, email: cfg.LECTOR_EMAIL, pass: cfg.LECTOR_PASSWORD });
    if (r.error) throw new Error(r.error);
    if (errores.length) throw new Error("Errores en el motor: " + errores.join(" | "));
    return r;
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const cfg = await leerConfig();
  const carpeta = cfg.CARPETA;
  await mkdir(join(carpeta, "historico"), { recursive: true });
  await mkdir(join(carpeta, "datos"), { recursive: true });
  await mkdir(join(carpeta, "Reportes", "tablero"), { recursive: true });
  const log = join(carpeta, "exportacion.log");
  const motor = actualizarMotor();
  try {
    const r = await exportar(cfg);
    const xlsx = Buffer.from(r.b64, "base64");
    const ok = await escribirSeguro(join(carpeta, `${NOMBRE}.xlsx`), xlsx);
    await escribirSeguro(join(carpeta, "historico", `${NOMBRE}_${hoySV()}.xlsx`), xlsx);
    await escribirSeguro(join(carpeta, "datos", "registro.json"), JSON.stringify(r.datos));
    let tab;
    try { tab = generarTablero(carpeta); } catch (e) { tab = "tablero: ERROR " + String(e.stderr || e.message).trim().split(/\r?\n/).pop(); }
    const linea = `${ahoraSV()} · OK · ${r.n} casos (${r.cerrados} cerrados) · ${motor} · ${tab}${ok ? "" : " · el Excel principal estaba abierto: se actualizará en la próxima ejecución"}`;
    await appendFile(log, linea + "\n");
    console.log(linea);
  } catch (e) {
    await appendFile(log, `${ahoraSV()} · ERROR · ${motor} · ${e.message}\n`);
    console.error("Error:", e.message);
    process.exitCode = 1;
  }
  // El log no crece sin límite: conserva las últimas 2000 líneas.
  try {
    if ((await stat(log)).size > 200_000) {
      const l = (await readFile(log, "utf8")).split("\n");
      await writeFile(log, l.slice(-2000).join("\n"));
    }
  } catch {}
}

main();
