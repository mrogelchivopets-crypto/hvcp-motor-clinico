// Funciones compartidas para exportar e importar el catálogo del motor (medicamentos y exámenes).
// El catálogo vive dentro de index.html como constantes JSON de una sola línea:
//   INV_FECHA · DR (medicamentos HVCP) · GAP (faltantes) · SUB (sustitutos) · CRITICOS · LB (exámenes) · LSUB
// Aquí se leen y se reescriben sin tocar nada más del archivo.
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const INDEX = join(RAIZ, "index.html");
export const CONSTANTES = ["INV_FECHA", "DR", "GAP", "SUB", "CRITICOS", "LB", "LSUB"];

// Serializa igual que las líneas actuales del motor: {"a": 1, "b": [1, 2]} (sin escapar acentos).
export function ser(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(ser).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + ser(x)).join(", ") + "}";
  return JSON.stringify(v);
}

const linea = (nombre) => new RegExp(`^const ${nombre}=(.*);\\r?$`, "m");

export function leerConstantes(html) {
  const out = {};
  for (const n of CONSTANTES) {
    const m = html.match(linea(n));
    if (!m) throw new Error(`No se encontró la línea «const ${n}=…;» en index.html`);
    out[n] = JSON.parse(m[1]);
    if (ser(out[n]) !== m[1]) throw new Error(`La línea de ${n} no tiene el formato esperado; no se puede reescribir con seguridad.`);
  }
  const v = html.match(/const MOTOR_VER="([^"]+)"/);
  if (!v) throw new Error("No se encontró MOTOR_VER en index.html");
  out.version = v[1];
  return out;
}

export function escribirConstantes(html, datos) {
  for (const n of CONSTANTES) {
    html = html.replace(linea(n), (todo) => `const ${n}=${ser(datos[n])};` + (todo.endsWith("\r") ? "\r" : ""));
  }
  return html;
}

// Cambia el número de versión visible (título, encabezado, nota SOAP, pie y MOTOR_VER).
export function cambiarVersion(html, anterior, nueva) {
  const esc = anterior.replace(/\./g, "\\.");
  let n = 0;
  html = html.replace(new RegExp(`(Motor Clínico(?: de Urgencias| HVCP)? v)${esc}(?![0-9])`, "g"), (_, a) => { n++; return a + nueva; });
  html = html.replace(`const MOTOR_VER="${anterior}"`, () => { n++; return `const MOTOR_VER="${nueva}"`; });
  if (n < 5) throw new Error(`Solo se encontraron ${n} lugares con la versión ${anterior} (se esperaban 5).`);
  return html;
}

export function siguienteVersion(v) {
  const p = v.split(".").map(Number);
  p[p.length - 1]++;
  return p.join(".");
}

// Abre una copia del motor en Chrome (sin conexión: config.js con marcadores) y devuelve
// los datos tal como quedan al ejecutarse, incluidos los ajustes que se aplican por código.
export async function cargarMotor(html) {
  const dir = await mkdtemp(join(tmpdir(), "hvcp-catalogo-"));
  const browser = await chromium.launch({ channel: process.env.PW_CANAL || "chrome" });
  try {
    await writeFile(join(dir, "index.html"), html);
    await writeFile(join(dir, "config.js"),
      'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};');
    const page = await browser.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(pathToFileURL(join(dir, "index.html")).href);
    await page.waitForLoadState("load");
    const datos = await page.evaluate(() => ({
      version: MOTOR_VER, INV_FECHA, DR, GAP, SUB, CRITICOS, LB, LSUB,
      SYS: Object.fromEntries(Object.entries(SYS).map(([k, v]) => [k, v.n])),
      DX: DX.map((d) => ({ id: d.id, n: d.n, c: d.c, sys: d.sys, sp: d.sp, z: !!d.z, prio: d.prio || 0,
        why: d.why || "", lab: d.lab || [], tx: d.tx || [], ref: d.ref || "" })),
    }));
    // Prueba mínima: el motor calcula y dibuja sin errores
    await page.evaluate(() => { setEsp("c"); setMotivo(MOTIVOS[0].id); renderAll(); genSOAPbase(); });
    return { ...datos, errores };
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// Qué diagnósticos usan cada medicamento y examen
export function usos(DX) {
  const med = {}, lab = {}, labU = {};
  for (const d of DX) {
    for (const [id] of d.tx) if (id !== "_") (med[id] = med[id] || new Set()).add(d.n);
    for (const l of d.lab) {
      const id = l.replace("!", "");
      (lab[id] = lab[id] || new Set()).add(d.n);
      if (l[0] === "!") (labU[id] = labU[id] || new Set()).add(d.n);
    }
  }
  return { med, lab, labU };
}

export const SI = (v) => (v ? "Sí" : "No");
