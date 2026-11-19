// Exporta el catálogo del motor a Excel: lo que farmacia y laboratorio revisan y editan.
// Uso:  npm run catalogo:exportar [-- --vetcie "ruta/VetCIE-1_HVCP_Clasificador_v3.xlsx"] [-- --salida archivo.xlsx]
// Las hojas «Medicamentos HVCP», «Medicamentos faltantes» y «Exámenes» (y el inventario de
// referencia en «Resumen») se pueden editar y volver a cargar con  npm run catalogo:importar.
// Las demás hojas son de consulta: se regeneran solas desde el motor.
import XLSX from "xlsx";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { INDEX, RAIZ, cargarMotor, usos, SI } from "./catalogo_lib.mjs";

export const HOJAS = {
  med: "Medicamentos HVCP", falt: "Medicamentos faltantes", lab: "Exámenes", res: "Resumen",
};
export const COL = {
  med: ["Clave motor", "Medicamento", "Familia", "Presentación en HVCP", "Concentración (por mL)", "Unidad",
    "Dosis por hora (CRI)", "Dosis perro", "Perro mín (por kg)", "Perro máx (por kg)", "Dosis gato",
    "Gato mín (por kg)", "Gato máx (por kg)", "Contraindicaciones / precauciones", "Verificar en farmacia",
    "En inventario", "N.º diagnósticos que lo usan (automático)", "Diagnósticos que lo usan (automático)"],
  falt: ["Clave motor", "Medicamento recomendado", "Crítico para ER", "Sustituto disponible en HVCP (clave)",
    "Sustituto (nombre, automático)", "N.º diagnósticos que lo recomiendan (automático)", "Diagnósticos (automático)"],
  lab: ["Clave motor", "Examen", "Código HVCP", "Tipo", "Disponible en HVCP", "Verificar",
    "Si no está, se usa (clave)", "N.º diagnósticos que lo piden (automático)", "De ellos, como inmediato (automático)",
    "Diagnósticos (automático)"],
};
export const ETQ_INV = "Inventario de referencia";
export const TIPO_IMG = "Imagen o técnica", TIPO_LAB = "Laboratorio";

const enVetcie = (v, c) => String(c || "").split("/").map((x) => x.trim()).every((x) => v.has(x));
const lista = (s) => (s ? [...s].sort((a, b) => a.localeCompare(b, "es")).join("; ") : "");
const vacio = (v) => (v === null || v === undefined ? "" : v);

async function leerVetCIE(ruta) {
  const wb = XLSX.read(await readFile(ruta));
  const hoja = wb.Sheets["Clasificador Principal"];
  if (!hoja) throw new Error("El archivo VetCIE-1 no tiene la hoja «Clasificador Principal».");
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false });
  const codigos = new Map();
  for (const f of filas) if (typeof f[0] === "string" && /^[A-Z]{3}(-[A-Z]{3})+-\d+$/.test(f[0].trim())) codigos.set(f[0].trim(), f[3] || "");
  return codigos;
}

export function libroCatalogo(M, { vetcie = null, fecha = new Date() } = {}) {
  const U = usos(M.DX);
  const nombreSub = (k) => (M.DR[k] ? M.DR[k].n : "");
  const meds = Object.entries(M.DR).map(([k, d]) => [k, d.n, vacio(d.f), vacio(d.prod), vacio(d.conc), vacio(d.u),
    d.per === "/h" ? "Sí" : "No", vacio(d.c), vacio(d.mc), vacio(d.hc), vacio(d.fe), vacio(d.mf), vacio(d.hf),
    vacio(d.ci), vacio(d.ver), SI(d.inv !== false), U.med[k]?.size || 0, lista(U.med[k])]);
  const falt = Object.entries(M.GAP).map(([k, n]) => [k, n, SI(M.CRITICOS.includes(k)), vacio(M.SUB[k]),
    nombreSub(M.SUB[k]), U.med[k]?.size || 0, lista(U.med[k])]);
  const labs = Object.entries(M.LB).map(([k, l]) => [k, l.n, vacio(l.cod), l.img ? TIPO_IMG : TIPO_LAB,
    SI(l.inv !== false), vacio(l.ver), vacio(M.LSUB[k]), U.lab[k]?.size || 0, U.labU[k]?.size || 0, lista(U.lab[k])]);

  const ESP = { c: "Perro", f: "Gato" };
  const nomMed = (id) => M.DR[id]?.n || M.GAP[id] || id;
  const dx = M.DX.map((d) => {
    const f = [d.c, d.n, M.SYS[d.sys] || d.sys, d.sp.map((e) => ESP[e] || e).join(", "), SI(d.z),
      d.prio ? (d.prio >= 2 ? "Emergencia vital" : "Urgente") : "", d.why,
      d.lab.map((l) => (M.LB[l.replace("!", "")]?.n || l) + (l[0] === "!" ? " (inmediato)" : "")).join("; "),
      d.tx.filter(([id]) => id !== "_").map(([id]) => nomMed(id)).join("; "),
      d.tx.filter(([id]) => id === "_").map(([, n]) => n).join("; "), d.ref, d.id];
    if (vetcie) f.push(enVetcie(vetcie, d.c) ? "Sí" : "NO");
    return f;
  });
  const dxMed = [], dxLab = [];
  for (const d of M.DX) {
    d.tx.forEach(([id, nota], i) => {
      if (id === "_") return;
      const disp = !!M.DR[id];
      dxMed.push([d.c, d.n, i + 1, nomMed(id), id, SI(disp), disp ? "" : nombreSub(M.SUB[id]), nota || ""]);
    });
    d.lab.forEach((l) => { const id = l.replace("!", ""), x = M.LB[id] || {};
      dxLab.push([d.c, d.n, x.n || id, id, vacio(x.cod), l[0] === "!" ? "Inmediato" : "Diferencial", SI(x.inv !== false)]); });
  }

  const nVer = Object.values(M.DR).filter((d) => d.ver).length;
  const nCrit = M.CRITICOS.filter((k) => M.GAP[k]).length, nSub = Object.keys(M.GAP).filter((k) => M.SUB[k]).length;
  const nLabNo = Object.values(M.LB).filter((l) => l.inv === false).length;
  const fueraVetcie = vetcie ? M.DX.filter((d) => !enVetcie(vetcie, d.c)) : [];
  const resumen = [
    [`Catálogo del Motor Clínico de Urgencias HVCP v${M.version}`],
    [`Generado desde el motor el ${fecha.toLocaleDateString("es-SV")} con  npm run catalogo:exportar`],
    [],
    [ETQ_INV, M.INV_FECHA, "← editable: nombre y fecha del listado de inventario usado"],
    [],
    ["Contenido", "Cantidad", "Detalle"],
    ["Medicamentos del formulario HVCP", meds.length, `${nVer} con dato por verificar en farmacia`],
    ["Medicamentos recomendados que no hay en HVCP", falt.length, `${nCrit} críticos para ER; ${nSub} con sustituto`],
    ["Exámenes y monitoreos", labs.length, `${labs.length - nLabNo} disponibles en HVCP; ${nLabNo} no disponibles`],
    ["Diagnósticos presuntivos", M.DX.length, vetcie ? (fueraVetcie.length ? `${fueraVetcie.length} con código que no está en VetCIE-1: ${fueraVetcie.map((d) => d.c).join(", ")}` : "Todos los códigos existen en VetCIE-1") : ""],
    [],
    ["Cómo actualizar"],
    ["1. Edite solo las hojas «Medicamentos HVCP», «Medicamentos faltantes» y «Exámenes», y el inventario de referencia de arriba."],
    ["2. Las columnas marcadas «(automático)» y las hojas de diagnósticos no se leen: se regeneran desde el motor."],
    ["3. «Clave motor» es el identificador interno: no la cambie en filas existentes. Para un medicamento nuevo use minúsculas sin espacios (ej. ondansetron)."],
    ["4. Agotado temporalmente: ponga «No» en «En inventario». Si el hospital deja de tenerlo, mueva la fila a «Medicamentos faltantes»."],
    ["5. Si se compra un medicamento faltante, borre su fila de «Medicamentos faltantes» y agréguelo en «Medicamentos HVCP» con la misma clave y sus dosis."],
    ["6. Dosis mín./máx. son mg (o la unidad indicada) por kg y alimentan la calculadora de volumen; la «Dosis perro/gato» es el texto que ve el médico."],
    ["7. Revise primero con  npm run catalogo:importar -- archivo.xlsx  (solo muestra los cambios) y aplique con  --aplicar."],
    ["8. Diagnósticos, signos y puntajes NO se cambian desde este Excel: son lógica clínica y requieren validación."],
  ];

  const wb = XLSX.utils.book_new();
  const hoja = (nombre, cab, filas, anchos) => {
    const ws = XLSX.utils.aoa_to_sheet(cab ? [cab, ...filas] : filas);
    ws["!cols"] = anchos.map((w) => ({ wch: w }));
    if (cab) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: cab.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja(HOJAS.res, null, resumen, [44, 50, 60]);
  hoja(HOJAS.med, COL.med, meds, [16, 24, 24, 40, 12, 8, 10, 40, 10, 10, 40, 10, 10, 50, 40, 10, 10, 60]);
  hoja(HOJAS.falt, COL.falt, falt, [16, 30, 10, 18, 24, 10, 60]);
  hoja(HOJAS.lab, COL.lab, labs, [16, 44, 22, 16, 10, 40, 18, 10, 10, 60]);
  hoja("Diagnósticos", ["Código VetCIE-1", "Diagnóstico", "Sistema", "Especie", "Zoonosis", "Prioridad",
    "Por qué considerarlo", "Exámenes que sugiere", "Medicamentos del plan", "Otras medidas del plan", "Referencia",
    "Clave motor", ...(vetcie ? ["¿Código en VetCIE-1?"] : [])], dx, [18, 40, 24, 12, 9, 14, 60, 60, 50, 50, 40, 14, 12]);
  hoja("Dx-Medicamentos", ["Código VetCIE-1", "Diagnóstico", "Orden en el plan", "Medicamento", "Clave motor",
    "Disponible en HVCP", "Sustituto", "Indicación en ese diagnóstico"], dxMed, [18, 40, 8, 30, 16, 10, 24, 60]);
  hoja("Dx-Exámenes", ["Código VetCIE-1", "Diagnóstico", "Examen", "Clave motor", "Código HVCP", "Prioridad",
    "Disponible en HVCP"], dxLab, [18, 40, 44, 16, 22, 12, 10]);
  return wb;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const M = await cargarMotor(await readFile(INDEX, "utf8"));
  if (M.errores.length) throw new Error("El motor tiene errores al cargar:\n" + M.errores.join("\n"));
  const vetcie = opt("--vetcie") ? await leerVetCIE(opt("--vetcie")) : null;
  const salida = opt("--salida") || join(RAIZ, "catalogo", `Catalogo_Motor_Clinico_HVCP_v${M.version.replace(/\./g, "_")}.xlsx`);
  await mkdir(join(salida, ".."), { recursive: true });
  XLSX.writeFile(libroCatalogo(M, { vetcie }), salida);
  console.log(`Catálogo v${M.version} exportado: ${salida}`);
  console.log(`  ${Object.keys(M.DR).length} medicamentos · ${Object.keys(M.GAP).length} faltantes · ${Object.keys(M.LB).length} exámenes · ${M.DX.length} diagnósticos`);
  if (vetcie) {
    const fuera = M.DX.filter((d) => !enVetcie(vetcie, d.c));
    console.log(fuera.length ? `  ⚠ ${fuera.length} códigos del motor no están en VetCIE-1: ${fuera.map((d) => `${d.c} (${d.n})`).join("; ")}`
      : `  Todos los códigos de diagnóstico existen en VetCIE-1 (${vetcie.size} códigos leídos).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
}
