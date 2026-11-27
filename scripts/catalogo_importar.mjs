// Carga al motor un catálogo editado en Excel (medicamentos, faltantes, exámenes e inventario).
// Uso:
//   npm run catalogo:importar -- catalogo/archivo.xlsx              → SOLO revisa: muestra el informe de cambios
//   npm run catalogo:importar -- catalogo/archivo.xlsx --aplicar    → aplica, sube la versión y corre las pruebas
// Opciones con --aplicar:  --version 7.10.0  (por defecto sube el último número)   --sin-pruebas
//
// Qué hace al aplicar:
//   1. Reescribe solo las constantes del catálogo en index.html (la lógica clínica no se toca).
//   2. Sube la versión visible del motor y deja la anterior en tests/fixtures/anterior.html.
//   3. Comprueba con 240 casos que los diagnósticos y puntajes son idénticos a la versión anterior.
//   4. Guarda el informe en CAMBIOS.md y regenera el Excel del catálogo con la versión nueva.
import XLSX from "xlsx";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { INDEX, RAIZ, leerConstantes, escribirConstantes, cambiarVersion, actualizarVersionJson, siguienteVersion, cargarMotor, usos } from "./catalogo_lib.mjs";
import { HOJAS, COL, ETQ_INV, TIPO_IMG, TIPO_LAB, libroCatalogo } from "./catalogo_exportar.mjs";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--version");
const APLICAR = args.includes("--aplicar"), SIN_PRUEBAS = args.includes("--sin-pruebas");
const VERSION = args.includes("--version") ? args[args.indexOf("--version") + 1] : null;

const errores = [], avisos = [];
const texto = (v) => (v === undefined || v === null ? "" : String(v).trim());
const vacioN = (v) => v === undefined || v === null || v === "";
function numero(v, donde) {
  const t = texto(v).replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) { errores.push(`${donde}: «${v}» no es un número válido`); return null; }
  return n;
}
function siNo(v, donde) {
  const t = texto(v).toLowerCase();
  if (["sí", "si", "s", "x", "1", "true"].includes(t)) return true;
  if (["no", "n", "0", "false"].includes(t)) return false;
  if (t === "") return null;
  errores.push(`${donde}: use «Sí» o «No» (dice «${v}»)`); return null;
}
const igual = (a, b) => (vacioN(a) && vacioN(b)) || (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b);

function filas(wb, clave) {
  const ws = wb.Sheets[HOJAS[clave]];
  if (!ws) { errores.push(`Falta la hoja «${HOJAS[clave]}»`); return []; }
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  const cab = (a[0] || []).map(texto);
  const faltan = COL[clave].filter((c) => !c.includes("(automático)") && !cab.includes(c));
  if (faltan.length) { errores.push(`Hoja «${HOJAS[clave]}»: faltan las columnas ${faltan.map((c) => `«${c}»`).join(", ")}`); return []; }
  return a.slice(1).map((f, i) => ({ fila: i + 2, v: Object.fromEntries(cab.map((c, j) => [c, f[j]])) }))
    .filter((r) => Object.values(r.v).some((x) => texto(x) !== ""));
}

// Aplica un valor nuevo conservando la representación original cuando no cambió.
function poner(obj, base, k, nuevo, modoVacio) {
  if (base && igual(base[k], nuevo) && (k in base)) { obj[k] = base[k]; return; }
  if (vacioN(nuevo)) { if (modoVacio === "null") obj[k] = null; else if (modoVacio === "") obj[k] = ""; else delete obj[k]; return; }
  obj[k] = nuevo;
}
const ORDEN_DR = ["n", "f", "prod", "conc", "u", "per", "c", "fe", "mc", "mf", "ci", "ver", "hc", "hf", "inv"];
const ORDEN_LB = ["n", "cod", "inv", "img", "ver"];
function ordenar(obj, base, orden) {
  const claves = base ? [...Object.keys(base).filter((k) => k in obj), ...orden.filter((k) => k in obj && !(k in base))] : orden.filter((k) => k in obj);
  return Object.fromEntries(claves.map((k) => [k, obj[k]]));
}
const claveValida = (k) => /^[a-z0-9_]+$/.test(k);
// Mismo contenido, en el orden de claves de la versión anterior (las nuevas al final).
const enOrden = (obj, base) => Object.fromEntries([...Object.keys(base).filter((k) => k in obj), ...Object.keys(obj).filter((k) => !(k in base))].map((k) => [k, obj[k]]));

function leerMedicamentos(wb, base) {
  const DR = {}, h = HOJAS.med;
  for (const { fila, v } of filas(wb, "med")) {
    const k = texto(v["Clave motor"]), donde = `«${h}» fila ${fila}${k ? ` (${k})` : ""}`;
    if (!claveValida(k)) { errores.push(`${donde}: la clave debe ir en minúsculas, sin espacios ni acentos`); continue; }
    if (DR[k]) { errores.push(`${donde}: la clave está repetida`); continue; }
    const b = base[k], d = { ...(b || {}) };
    const n = texto(v["Medicamento"]);
    if (!n) errores.push(`${donde}: falta el nombre del medicamento`);
    poner(d, b, "n", n);
    for (const [campo, col] of [["f", "Familia"], ["prod", "Presentación en HVCP"], ["u", "Unidad"], ["c", "Dosis perro"], ["fe", "Dosis gato"], ["ci", "Contraindicaciones / precauciones"]])
      poner(d, b, campo, texto(v[col]), "");
    if (!d.c) errores.push(`${donde}: falta la dosis de perro (texto)`);
    if (!d.fe) errores.push(`${donde}: falta la dosis de gato (texto); si no se usa en gatos escríbalo así`);
    poner(d, b, "conc", numero(v["Concentración (por mL)"], `${donde}, concentración`), "null");
    for (const [campo, col] of [["mc", "Perro mín (por kg)"], ["hc", "Perro máx (por kg)"], ["mf", "Gato mín (por kg)"], ["hf", "Gato máx (por kg)"]])
      poner(d, b, campo, numero(v[col], `${donde}, ${col}`));
    for (const [mn, mx, esp] of [["mc", "hc", "perro"], ["mf", "hf", "gato"]])
      if (!vacioN(d[mn]) && !vacioN(d[mx]) && Number(d[mn]) > Number(d[mx])) errores.push(`${donde}: la dosis mínima de ${esp} es mayor que la máxima`);
    const cri = siNo(v["Dosis por hora (CRI)"], `${donde}, dosis por hora`);
    poner(d, b, "per", cri ? "/h" : (b && b.per === "" ? "" : null));
    poner(d, b, "ver", texto(v["Verificar en farmacia"]));
    const inv = siNo(v["En inventario"], `${donde}, en inventario`);
    if (inv === null) errores.push(`${donde}: indique «Sí» o «No» en «En inventario»`);
    poner(d, b, "inv", inv === null ? true : inv);
    if (!["mg", "µg", "g", "mL", "UI", ""].includes(d.u)) avisos.push(`${donde}: unidad «${d.u}» poco común; confirme que la calculadora la interpreta bien`);
    DR[k] = ordenar(d, b, ORDEN_DR);
  }
  return DR;
}

function leerFaltantes(wb, base, DR) {
  const GAP = {}, SUB = {}, crit = new Set(), h = HOJAS.falt;
  const porNombre = new Map(Object.entries(DR).map(([k, d]) => [d.n.toLowerCase(), k]));
  for (const { fila, v } of filas(wb, "falt")) {
    const k = texto(v["Clave motor"]), donde = `«${h}» fila ${fila}${k ? ` (${k})` : ""}`;
    if (!claveValida(k)) { errores.push(`${donde}: la clave debe ir en minúsculas, sin espacios ni acentos`); continue; }
    if (GAP[k]) { errores.push(`${donde}: la clave está repetida`); continue; }
    if (DR[k]) { errores.push(`${donde}: «${k}» también está en «${HOJAS.med}». Si ya hay en el hospital, borre esta fila.`); continue; }
    const n = texto(v["Medicamento recomendado"]);
    if (!n) errores.push(`${donde}: falta el nombre`);
    GAP[k] = n;
    const s = texto(v["Sustituto disponible en HVCP (clave)"]);
    if (s) {
      const sk = DR[s] ? s : porNombre.get(s.toLowerCase());
      if (!sk) errores.push(`${donde}: el sustituto «${s}» no está en «${HOJAS.med}»`); else SUB[k] = sk;
    }
    if (siNo(v["Crítico para ER"], `${donde}, crítico`)) crit.add(k);
  }
  return { GAP, SUB, crit };
}

function leerExamenes(wb, base, runtime) {
  const LB = {}, LSUB = {}, h = HOJAS.lab, deAjuste = [];
  const fs = filas(wb, "lab");
  for (const { fila, v } of fs) {
    const k = texto(v["Clave motor"]), donde = `«${h}» fila ${fila}${k ? ` (${k})` : ""}`;
    if (!claveValida(k)) { errores.push(`${donde}: la clave debe ir en minúsculas, sin espacios ni acentos`); continue; }
    if (LB[k] || deAjuste.includes(k)) { errores.push(`${donde}: la clave está repetida`); continue; }
    const b = base[k], l = { ...(b || {}) };
    const n = texto(v["Examen"]);
    if (!n) errores.push(`${donde}: falta el nombre del examen`);
    poner(l, b, "n", n);
    poner(l, b, "cod", texto(v["Código HVCP"]), "");
    const tipo = texto(v["Tipo"]);
    if (tipo && ![TIPO_IMG, TIPO_LAB].includes(tipo)) errores.push(`${donde}: «Tipo» debe ser «${TIPO_LAB}» o «${TIPO_IMG}»`);
    poner(l, b, "img", tipo === TIPO_IMG ? true : null);
    const inv = siNo(v["Disponible en HVCP"], `${donde}, disponible`);
    if (inv === null) errores.push(`${donde}: indique «Sí» o «No» en «Disponible en HVCP»`);
    poner(l, b, "inv", inv === null ? true : inv);
    poner(l, b, "ver", texto(v["Verificar"]));
    const s = texto(v["Si no está, se usa (clave)"]);
    if (s) LSUB[k] = s;
    const final = ordenar(l, b, ORDEN_LB);
    if (!b && runtime.LB[k]) {
      // Examen que el motor crea por código (un ajuste clínico): no se puede editar desde el Excel.
      deAjuste.push(k);
      const r = runtime.LB[k];
      if (!igual(r.n, final.n) || !igual(r.cod, final.cod) || (r.inv !== false) !== (final.inv !== false) || !igual(r.ver, final.ver) || !!r.img !== !!final.img)
        avisos.push(`${donde}: este examen lo define un ajuste del motor; sus cambios NO se aplicaron (se hace editando la lógica).`);
      continue;
    }
    LB[k] = final;
  }
  for (const [k, s] of Object.entries(LSUB)) {
    if (!LB[s] && !(runtime.LB[s] && !base[s])) { errores.push(`«${h}» (${k}): el examen sustituto «${s}» no existe`); delete LSUB[k]; }
    else if (LB[k] && LB[k].inv !== false) avisos.push(`«${h}» (${k}): tiene sustituto pero está disponible; el sustituto solo se usa cuando no hay.`);
  }
  return { LB, LSUB };
}

const NOM_DR = { n: "nombre", f: "familia", prod: "presentación", conc: "concentración", u: "unidad", per: "dosis por hora",
  c: "dosis perro", fe: "dosis gato", mc: "perro mín/kg", mf: "gato mín/kg", ci: "precauciones", ver: "verificar en farmacia",
  hc: "perro máx/kg", hf: "gato máx/kg", inv: "en inventario" };
const NOM_LB = { n: "nombre", cod: "código HVCP", inv: "disponible", img: "tipo", ver: "verificar" };
const mostrar = (k, v) => (vacioN(v) ? "(vacío)" : k === "inv" ? (v === false ? "No" : "Sí") : k === "img" ? (v ? TIPO_IMG : TIPO_LAB) : k === "per" ? (v === "/h" ? "Sí" : "No") : `«${v}»`);

function diferencias(titulo, antes, despues, nombres, etiqueta) {
  const L = [];
  for (const k of Object.keys(despues)) if (!antes[k]) L.push(`- **Nuevo:** ${etiqueta(despues[k], k)}`);
  for (const k of Object.keys(antes)) if (!despues[k]) L.push(`- **Quitado:** ${etiqueta(antes[k], k)}`);
  for (const k of Object.keys(despues)) {
    if (!antes[k]) continue;
    const a = antes[k], d = despues[k];
    const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((c) => !igual(a[c], d[c]) && !(c === "inv" && (a[c] !== false) === (d[c] !== false)) && !(c === "img" && !!a[c] === !!d[c]));
    if (campos.length) L.push(`- **${etiqueta(d, k)}:** ` + campos.map((c) => `${nombres[c] || c} ${mostrar(c, a[c])} → ${mostrar(c, d[c])}`).join("; "));
  }
  return L.length ? [`### ${titulo}`, ...L, ""] : [];
}

async function main() {
  if (!archivo) { console.log("Uso: npm run catalogo:importar -- ruta/al/catalogo.xlsx [--aplicar]"); process.exit(1); }
  const html = await readFile(INDEX, "utf8");
  const base = leerConstantes(html);
  const runtime = await cargarMotor(html);
  const wb = XLSX.read(await readFile(archivo));

  const DR = leerMedicamentos(wb, base.DR);
  const { GAP, SUB: subF, crit } = leerFaltantes(wb, base.GAP, DR);
  const { LB, LSUB } = leerExamenes(wb, base.LB, runtime);
  // SUB también guarda equivalencias que no son faltantes (p. ej. adrenalina → epinefrina): se conservan
  // mientras el destino siga en el formulario. Se respeta el orden original para no generar cambios falsos.
  const subTodo = { ...subF };
  for (const [k, s] of Object.entries(base.SUB)) if (!(k in GAP) && !(k in subTodo) && DR[s]) subTodo[k] = s;
  const SUB = enOrden(subTodo, base.SUB);
  const CRITICOS = [...base.CRITICOS.filter((k) => crit.has(k)), ...[...crit].filter((k) => !base.CRITICOS.includes(k))];
  let INV_FECHA = base.INV_FECHA;
  const res = wb.Sheets[HOJAS.res] ? XLSX.utils.sheet_to_json(wb.Sheets[HOJAS.res], { header: 1, blankrows: false }) : [];
  const filaInv = res.find((f) => texto(f[0]) === ETQ_INV);
  if (filaInv && texto(filaInv[1])) INV_FECHA = texto(filaInv[1]);

  // Referencias desde los diagnósticos
  const U = usos(runtime.DX);
  for (const [id, dxs] of Object.entries(U.med)) {
    if (!DR[id] && !GAP[id]) errores.push(`El medicamento «${id}» lo usan ${dxs.size} diagnósticos (${[...dxs].slice(0, 3).join("; ")}…) y ya no está en ninguna hoja. Póngalo en «${HOJAS.falt}» si el hospital dejó de tenerlo.`);
    else if (!DR[id] && GAP[id] && base.DR[id]) avisos.push(`«${base.DR[id].n}» pasa a faltante: en ${dxs.size} diagnósticos el plan mostrará ${SUB[id] ? `el sustituto ${DR[SUB[id]].n}` : "que no hay en el hospital"}.`);
  }
  for (const [id, dxs] of Object.entries(U.lab)) if (!LB[id] && !(runtime.LB[id] && !base.LB[id])) errores.push(`El examen «${id}» lo piden ${dxs.size} diagnósticos y ya no está en la hoja «${HOJAS.lab}».`);
  for (const k of Object.keys(DR)) if (!base.DR[k] && !U.med[k]) avisos.push(`«${DR[k].n}» es nuevo pero ningún diagnóstico lo usa todavía: no aparecerá en ningún plan hasta que se agregue a un diagnóstico (eso es un cambio de lógica clínica).`);
  for (const k of Object.keys(LB)) if (!base.LB[k] && !U.lab[k]) avisos.push(`El examen «${LB[k].n}» es nuevo pero ningún diagnóstico lo pide todavía.`);
  for (const [k, d] of Object.entries(DR)) if (d.inv === false && U.med[k] && (base.DR[k]?.inv !== false)) avisos.push(`«${d.n}» marcado sin inventario: ${U.med[k].size} diagnósticos lo mostrarán como «No disponible».`);
  for (const k of crit) if (!SUB[k] && (!base.CRITICOS.includes(k) || base.SUB[k])) avisos.push(`«${GAP[k]}» es crítico para ER y queda sin sustituto.`);

  // Si alguien ordenó o filtró las hojas, el orden de las filas no debe generar cambios en el motor.
  const nuevo = { INV_FECHA, DR: enOrden(DR, base.DR), GAP: enOrden(GAP, base.GAP), SUB, CRITICOS,
    LB: enOrden(LB, base.LB), LSUB: enOrden(LSUB, base.LSUB) };
  const etqMed = (d, k) => `${d.n} (${k})`, etqLab = (l, k) => `${l.n} (${k})`;
  const nombreMed = (k) => (DR[k] || base.DR[k])?.n || k;
  const cambios = [
    ...(INV_FECHA !== base.INV_FECHA ? ["### Inventario de referencia", `- «${base.INV_FECHA}» → «${INV_FECHA}»`, ""] : []),
    ...diferencias("Medicamentos HVCP", base.DR, DR, NOM_DR, etqMed),
    ...diferencias("Medicamentos faltantes", Object.fromEntries(Object.entries(base.GAP).map(([k, n]) => [k, { n, crit: base.CRITICOS.includes(k), sub: base.SUB[k] ? nombreMed(base.SUB[k]) : "" }])),
      Object.fromEntries(Object.entries(GAP).map(([k, n]) => [k, { n, crit: CRITICOS.includes(k), sub: SUB[k] ? nombreMed(SUB[k]) : "" }])),
      { n: "nombre", crit: "crítico", sub: "sustituto" }, etqMed),
    ...diferencias("Exámenes", base.LB, LB, NOM_LB, etqLab),
    ...diferencias("Sustitutos de exámenes", Object.fromEntries(Object.entries(base.LSUB).map(([k, s]) => [k, { n: k, s }])),
      Object.fromEntries(Object.entries(LSUB).map(([k, s]) => [k, { n: k, s }])), { s: "sustituto" }, (x, k) => k),
  ].map((l) => l.replace(/crítico (true|false)/g, (_, b) => `crítico ${b === "true" ? "Sí" : "No"}`).replace(/«(true|false)»/g, (_, b) => (b === "true" ? "Sí" : "No")));

  const informe = [`# Revisión del catálogo · ${new Date().toLocaleString("es-SV")}`, `Archivo: ${archivo}`, `Motor actual: v${base.version}`, ""];
  if (errores.length) informe.push("## ❌ Errores (hay que corregirlos en el Excel)", ...errores.map((e) => `- ${e}`), "");
  informe.push(cambios.length ? "## Cambios" : "## Sin cambios respecto al motor actual", ...cambios);
  if (avisos.length) informe.push("## ⚠ Para revisar", ...avisos.map((a) => `- ${a}`), "");
  console.log(informe.join("\n"));
  await mkdir(join(RAIZ, "catalogo"), { recursive: true });
  await writeFile(join(RAIZ, "catalogo", "informe_revision.md"), informe.join("\n") + "\n");

  if (errores.length) { console.log("\nNo se aplicó nada: corrija los errores y vuelva a revisar."); process.exit(1); }
  if (!cambios.length) { console.log("Nada que aplicar."); return; }
  if (!APLICAR) { console.log("\nSolo revisión: no se cambió el motor. Si los cambios son correctos, repita con  --aplicar"); return; }

  // Aplicar
  const version = VERSION || siguienteVersion(base.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versión inválida: ${version}`);
  let html2 = cambiarVersion(escribirConstantes(html, nuevo), base.version, version);
  const r2 = await cargarMotor(html2);
  if (r2.errores.length) throw new Error("El motor con el catálogo nuevo da errores al cargar (no se guardó nada):\n" + r2.errores.join("\n"));
  await mkdir(join(RAIZ, "tests", "fixtures"), { recursive: true });
  await copyFile(INDEX, join(RAIZ, "tests", "fixtures", "anterior.html"));
  await writeFile(INDEX, html2);
  await actualizarVersionJson(html2);
  console.log(`\n✔ Motor actualizado a v${version} (la versión anterior quedó en tests/fixtures/anterior.html).`);

  let pruebas = "no se corrieron (--sin-pruebas)";
  if (!SIN_PRUEBAS) {
    console.log("Comprobando con 240 casos que los diagnósticos no cambiaron (tarda unos minutos)…");
    const p = spawnSync(process.execPath, [join(RAIZ, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/equivalencia.spec.js"],
      { cwd: RAIZ, stdio: "inherit", env: { ...process.env, EQ_BASE: "/tests/fixtures/anterior.html", EQ_MODO: "diagnostico" } });
    if (p.status !== 0) {
      await writeFile(INDEX, html);
      console.log("\n✖ Los diagnósticos o puntajes cambiaron respecto a la versión anterior. Se restauró el motor anterior; no se guardó nada.");
      process.exit(1);
    }
    pruebas = "240 casos con diagnósticos y puntajes idénticos a la versión anterior";
  }

  const fecha = new Date().toLocaleDateString("es-SV");
  const entrada = [`## v${version} · ${fecha} · actualización del catálogo`, `Archivo: ${archivo.split(/[\\/]/).pop()} · Pruebas: ${pruebas}`, "", ...cambios,
    ...(avisos.length ? ["### Avisos", ...avisos.map((a) => `- ${a}`), ""] : [])].join("\n");
  const ruta = join(RAIZ, "CAMBIOS.md");
  let prev = ""; try { prev = await readFile(ruta, "utf8"); } catch {}
  const cab = "# Historial de cambios del Motor Clínico\n\n";
  await writeFile(ruta, cab + entrada + "\n\n" + prev.replace(cab, ""));
  const M = await cargarMotor(html2);
  const salida = join(RAIZ, "catalogo", `Catalogo_Motor_Clinico_HVCP_v${version.replace(/\./g, "_")}.xlsx`);
  XLSX.writeFile(libroCatalogo(M), salida);
  console.log(`✔ Pruebas: ${pruebas}`);
  console.log(`✔ CAMBIOS.md actualizado y catálogo nuevo en ${salida}`);
  console.log("\nFalta publicar: revise el motor en local (npm run servir) y luego haga commit y push a main.");
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
