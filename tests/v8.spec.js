// Pruebas de la v8.0 (V1–V7). Sin Supabase: config.js con marcadores, así los casos quedan en la cola local
// del dispositivo (localStorage «mc_cola_registro»), que sirve para comprobar si se registró un caso.
import { test, expect } from "@playwright/test";

import { SIN_CONFIG, abrir, COMPLETO, llenar, generar } from "./v8_util.mjs";

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
      await page.locator(".hemobox").screenshot({ path: `docs/v8/capturas/v3-${nombre}-${tema}.png` });
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

test("V4: «Sin signos vitales» no exige nada más, no calcula presuntivos, registra rcp: true y cierra sin diagnóstico", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  await page.evaluate(() => { setConc("ssv"); });
  expect(await page.evaluate(() => faltantes().map((x) => x.k))).toEqual([]);
  await expect(page.locator("#alerts")).toContainText("Registre el peso (aunque sea estimado) para las dosis de RCP");
  await expect(page.locator("#alerts")).toContainText("RCP inmediata (RECOVER 2024)");
  expect(await page.evaluate(() => scoreDx().length)).toBe(0);
  const r = await generar(page);
  expect(r.soap).toContain("Estado de conciencia: Sin signos vitales — protocolo RCP");
  expect(r.soap).toContain("RCP (RECOVER 2024): Compresiones");
  const q = await cola(page);
  expect(q).toHaveLength(2); expect(q[0].t).toBe("caso"); expect(q[0].p.ent.rcp).toBe(true); expect(q[0].p.ent.hemo).toBe("pcr"); expect(q[0].p.ent.esp ?? null).toBe(null);
  expect(q[1].t).toBe("cierre"); expect(q[1].k).toBe(q[0].k); expect(q[1].p.sinDx).toBe(true); expect(q[1].p.dx).toBe(null);
  expect(await page.evaluate(() => cerrado(colaLeer()[1].p))).toBe(true);
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

// ─── V6: versión única y actualización al dar «Nuevo paciente» ───
test("V6: la versión 8.0 sale de una sola constante (título, encabezado y SOAP)", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  expect(await page.title()).toBe("HVCP ER Motor Clínico v8.0 · registro en línea");
  await expect(page.locator("#htitle")).toHaveText("Motor Clínico de Urgencias v8.0 · registro en línea");
  await llenar(page, { ...COMPLETO, conc: "alerta" });
  expect((await generar(page)).soap).toContain("Motor Clínico HVCP v8.0 como apoyo");
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem("mc_cola_registro"))[0].p.v);
  expect(q).toBe("8.0+" + (await page.evaluate(() => MC_BUILD)));
  await ctx.close();
});

test("V6: «Nuevo paciente» recarga si version.json trae otro build; igual o sin red, reinicia sin error", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  // Igual: no recarga
  await ctx.route("**/version.json", (r) => page.evaluate(() => ({ version: MC_VERSION, build: MC_BUILD })).then((j) => r.fulfill({ contentType: "application/json", body: JSON.stringify(j) })));
  await page.evaluate(() => { setEsp("c"); window.__marca = 1; });
  await page.evaluate(() => nuevoPaciente());
  expect(await page.evaluate(() => [window.__marca, ST.esp])).toEqual([1, null]);
  // Sin red: no recarga, reinicia
  await ctx.unroute("**/version.json");
  await ctx.route("**/version.json", (r) => r.abort());
  await page.evaluate(() => { setEsp("f"); });
  await page.evaluate(() => nuevoPaciente());
  expect(await page.evaluate(() => [window.__marca, ST.esp])).toEqual([1, null]);
  // Otro build: recarga con ?v=<build>
  await ctx.unroute("**/version.json");
  await ctx.route("**/version.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "8.0", build: "2099-01-01z" }) }));
  await Promise.all([page.waitForURL(/\?v=2099-01-01z/), page.evaluate(() => nuevoPaciente())]);
  expect(await page.evaluate(() => window.__marca)).toBeUndefined();
  expect(errores).toEqual([]);
  await ctx.close();
});

// ─── V7: protección contra recarga accidental ───
const estadoST = (page) => page.evaluate(() => JSON.stringify({ esp: ST.esp, peso: ST.peso, edad: ST.edad, sexo: ST.sexo, conc: ST.conc, vac: [...ST.vac], ex: ST.ex, motivo: ST.motivo, signs: [...ST.signs].sort(), ans: ST.ans }));
async function medioCaso(page) {
  await page.evaluate(() => { setEsp("c"); setPeso("12.5"); setEdad("e3"); setSexo("he"); setVac("aldia"); setConc("dep");
    setEx("fc", "130"); setEx("temp", "39.6"); setEx("muc", "pali"); ST.avisoMot = true; setMotivo("dig"); toggleSign("diar"); answer("dur", "d1"); });
}

test("V7: medio caso, recarga y «Recuperar» con todos los campos, signos y respuestas; tras la SOAP el borrador desaparece", async ({ browser }) => {
  const { ctx, page, errores, dialogos } = await abrir(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await medioCaso(page);
  const antes = await estadoST(page);
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.locator("#borrador")).toContainText(/Recuperar paciente en curso \(\d\d:\d\d/);
  await page.screenshot({ path: "docs/v8/capturas/v7-recuperar-celular.png" });
  await page.locator("#borrador").getByRole("button", { name: "Recuperar" }).click();
  expect(await estadoST(page)).toBe(antes);
  await expect(page.locator("#borrador")).toBeHidden();
  // Completar y generar la nota: el borrador se borra
  await llenar(page, { fr: "24", tllc: "n", pulso: "n", dh: "0", card: "n", pulm: "n", cc: "3" });
  const r = await generar(page); expect(r.soap).not.toBe("");
  expect(await page.evaluate(() => localStorage.getItem(borKey()))).toBeNull();
  await page.reload();
  await expect(page.locator("#borrador")).toBeHidden();
  expect(errores).toEqual([]);
  await ctx.close();
});

test("V7: aviso al salir solo con paciente en curso sin SOAP; «Descartar» y «Nuevo paciente» borran el borrador", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await ctx.route("**/version.json", (r) => r.abort());
  // Sin paciente: no hay aviso
  expect(await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })).toBe(false);
  await medioCaso(page);
  expect(await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })).toBe(true);
  // El aviso también guarda el borrador al instante
  expect(await page.evaluate(() => !!localStorage.getItem(borKey()))).toBe(true);
  await page.evaluate(() => nuevoPaciente()); await page.waitForTimeout(300);
  expect(await page.evaluate(() => localStorage.getItem(borKey()))).toBeNull();
  await ctx.close();
});

test("V7: el borrador sobrevive a la recarga por versión nueva (V6)", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await medioCaso(page); const antes = await estadoST(page);
  await ctx.route("**/version.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "8.0", build: "2099-01-01z" }) }));
  await Promise.all([page.waitForURL(/\?v=2099-01-01z/), page.evaluate(() => nuevoPaciente())]);
  await expect(page.locator("#borrador")).toContainText("Recuperar paciente en curso");
  await page.locator("#borrador").getByRole("button", { name: "Recuperar" }).click();
  expect(await estadoST(page)).toBe(antes);
  await ctx.close();
});

test("V7: arrastrar hacia abajo en pantalla táctil no recarga la página", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY])).toEqual(["contain", "contain"]);
  await page.evaluate(() => { window.__sigue = true; window.scrollTo(0, 0); });
  const cdp = await ctx.newCDPSession(page);
  const t = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }] });
  await t("touchStart", 120); for (let y = 140; y <= 700; y += 40) await t("touchMove", y); await t("touchEnd", 700);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__sigue)).toBe(true);
  await ctx.close();
});
