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

test("Hipotermia: grados de la escala de hipotermia secundaria (Oncken 2001) sin cambiar el puntaje", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const r = await page.evaluate(() => [37.6, 37.4, 36.7, 36.6, 35.5, 35.4, 34.6, 33, 32.9, 30].map((t) => { const c = tempCls(t); return [t, c.s, c.c]; }));
  expect(r).toEqual([
    [37.6, "normotermia", "g"], [37.4, "hipotermia leve", "y"], [36.7, "hipotermia leve", "y"], [36.6, "hipotermia moderada", "y"],
    [35.5, "hipotermia moderada", "y"], [35.4, "hipotermia severa", "r"], [34.6, "hipotermia severa", "r"], [33, "hipotermia severa", "r"],
    [32.9, "hipotermia crítica", "r"], [30, "hipotermia crítica", "r"]]);
  await page.evaluate(() => { setEsp("f"); setEx("temp", "34.6"); });
  await expect(page.locator("#exfis")).toContainText("Hipotérmico (hipotermia severa)");
  expect(errores).toEqual([]);
  await ctx.close();
});

test("Casos con más de 30 h sin cierre: salen de Pendientes y pasan a «Cerrado por tiempo»", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const r = await page.evaluate(() => {
    const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
    const est = [[h(2), null], [h(29.9), null], [h(30.1), null], [h(72), { dx: null, conf: "", labs: {} }], [h(72), { sinDx: true }], [h(72), { dx: { c: "X", n: "X" }, conf: "clin" }], [h(1), { sinDx: true }]]
      .map(([f, k]) => estadoCaso(f, k));
    // Lista del administrador
    REG.casos = [["MC-A", 2, null], ["MC-B", 40, null], ["MC-C", 50, { sinDx: true }], ["MC-D", 31, { dx: null, conf: "" }]].map(([id, n, k]) => {
      if (k) REG.cierres.set(id, k);
      return { id, f: h(n), v: "8.0", ent: { esp: "c" }, sal: { top: [], insuf: false } };
    });
    const lista = (f) => { REG.filtro = f; const d = document.createElement("div"); d.innerHTML = regLista(); return [...d.querySelectorAll(".reg-row .code")].map((e) => e.textContent); };
    const botones = (() => { const d = document.createElement("div"); d.innerHTML = regLista(); return [...d.querySelectorAll(".reg-tools .opts .opt")].map((b) => b.textContent); })();
    const filas = { pend: lista("pend"), cerr: lista("cerr"), venc: lista("venc"), todos: lista("todos").length };
    // «Mis casos» del médico
    MC.casos = [{ codigo: "MC-1", f: h(3), cerrado: false }, { codigo: "MC-2", f: h(45), cerrado: false }, { codigo: "MC-3", f: h(45), cerrado: true, sinDx: true }];
    misCasosRender();
    const mc = document.getElementById("miscasos").innerText;
    return { est, botones, filas, mc };
  });
  expect(r.est).toEqual(["pend", "pend", "venc", "venc", "cerr", "cerr", "cerr"]);
  expect(r.botones).toEqual(["Pendientes (1)", "Cerrados (1)", "Cerrados por tiempo (2)", "Todos (4)"]);
  expect(r.filas).toEqual({ pend: ["MC-A"], cerr: ["MC-C"], venc: ["MC-B", "MC-D"], todos: 4 });
  expect(r.mc).toContain("Pendientes de cerrar, últimas 30 h (1)");
  expect(r.mc).toContain("Cerrados (1)");
  expect(r.mc).toContain("Cerrados por tiempo (1)");
  expect(errores).toEqual([]);
  await ctx.close();
});

test("Excel: columnas nuevas, RCP fuera del acierto, crítico, conciencia, estado hemodinámico y hoja «Por médico»", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const r = await page.evaluate(async () => {
    const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
    const top = [{ c: "GEN-DIG-001", n: "Gastritis", sc: 40 }, { c: "GEN-DIG-002", n: "Otro", sc: 30 }];
    const caso = (id, n, ent, medico) => ({ id, f: h(n), v: "8.0+2026-11-27", vet: medico || "Anónimo", medico, ent: { esp: "c", ex: {}, signsAll: [], ...ent },
      sal: { top, alta: [], soap: ["GEN-DIG-001"], soapAuto: true, insuf: false, faltan: [], qPend: [], qVis: 0 } });
    REG.casos = [
      caso("MC-AAAAA2", 2, { conc: "alerta", hemo: "est", critico: false, rcp: false }, "Dra. Uno"),
      caso("MC-AAAAA3", 40, { conc: "crit", hemo: "desc", critico: true, rcp: false }, "Dra. Uno"),
      caso("MC-AAAAA4", 5, { conc: "alerta", hemo: "comp", critico: true, rcp: false }, "Dr. Dos"),
      caso("MC-AAAAA5", 5, { conc: "ssv", hemo: "pcr", critico: false, rcp: true }, "Dr. Dos"),
      caso("MC-AAAAA6", 60, { hemo: "est" }, undefined),
    ];
    const dx = (c) => ({ dx: { c, n: c, cap: "" }, conf: "lab", fc: h(1) });
    REG.cierres = new Map([["MC-AAAAA2", dx("GEN-DIG-001")], ["MC-AAAAA4", dx("GEN-DIG-002")], ["MC-AAAAA5", dx("GEN-DIG-001")], ["MC-AAAAA6", { sinDx: true, fc: h(1) }]]);
    await cargarXLSX();
    const wb = regLibro("Prueba"), hoja = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" });
    const casos = XLSX.utils.sheet_to_json(wb.Sheets["Casos"], { defval: "" });
    const col = (k) => casos.map((x) => x[k]);
    const ind = hoja("Indicadores"), fila = (t) => { const v = (ind.find((x) => x[0] === t) || []).slice(1, 5); while (v.length && v[v.length - 1] === "") v.pop(); return v; };
    const ml = hoja("Matriz ML");
    return {
      hojas: wb.SheetNames,
      medico: col("Médico"), estado: col("Estado del caso"), conc: col("Estado de conciencia"), crit: col("Crítico ER"),
      completo: col("Completó el examen después"), rcp: col("RCP"), top1: col("Acierto top-1"),
      acc: fila("Top-1"), rcpN: fila("Casos sin signos vitales (RCP)"), rcpEv: fila("  con diagnóstico definitivo (fuera del acierto)"),
      critN: fila("Pacientes «Crítico ER»"), critComp: fila("  completaron el examen físico después"), critTop3: fila("  acierto top-3"),
      alerta: fila("Alerta"), desc: fila("Shock descompensado"), sinConc: fila("Sin marcar (casos anteriores a la v8.0)"),
      porMed: hoja("Por médico").slice(0, 4),
      mlCab: ml[0].slice(15, 20), mlFila: ml[1].slice(15, 20),
    };
  });
  expect(r.hojas).toContain("Por médico");
  expect(r.medico).toEqual(["Dra. Uno", "Dra. Uno", "Dr. Dos", "Dr. Dos", ""]);
  expect(r.estado).toEqual(["Cerrado", "Cerrado por tiempo", "Cerrado", "Cerrado", "Cerrado"]);
  expect(r.conc).toEqual(["Alerta", "Crítico ER", "Alerta", "Sin signos vitales", ""]);
  expect(r.crit).toEqual(["No", "Sí", "Sí", "No", ""]);
  expect(r.completo).toEqual(["", "No", "Sí", "", ""]);
  expect(r.rcp).toEqual(["No", "No", "No", "Sí", ""]);
  expect(r.top1).toEqual([1, "", 0, "", ""]);           // el caso RCP con diagnóstico no cuenta para el acierto
  expect(r.acc[0]).toBe("50% (1/2)");
  expect(r.rcpN).toEqual([1]); expect(r.rcpEv).toEqual([1]);
  expect(r.critN).toEqual([2]); expect(r.critComp).toEqual([1]); expect(r.critTop3).toEqual(["100% (1/1)"]);
  expect(r.alerta).toEqual([2, 2, "50% (1/2)", "100% (2/2)"]);
  expect(r.desc).toEqual([1, 0, "—", "—"]);
  expect(r.sinConc).toEqual([1, 0, "—", "—"]);
  expect(r.porMed[0]).toEqual(["Médico", "Casos generados", "Pendientes (menos de 30 h)", "Cerrados", "Cerrados por tiempo", "% cerrados por el médico", "Con dx definitivo", "Top-1", "Top-3"]);
  expect(r.porMed[1].slice(0, 6)).toEqual(["Dr. Dos", 2, 0, 2, 0, "100%"]);
  expect(r.porMed[2].slice(0, 6)).toEqual(["Dra. Uno", 2, 0, 1, 1, "50%"]);
  expect(r.porMed[3].slice(0, 6)).toEqual(["Sin perfil (anterior a la v8.0)", 1, 0, 1, 0, "100%"]);
  expect(r.mlCab).toEqual(["conciencia", "critico", "rcp", "medico", "estado"]);
  expect(r.mlFila).toEqual(["alerta", 0, 0, "Dra. Uno", "cerr"]);
  expect(errores).toEqual([]);
  await ctx.close();
});

test("Turnos del hospital: diurno 6:00–18:00 y nocturno 18:00–6:00 (hora de El Salvador)", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const r = await page.evaluate(() => ["05:59", "06:00", "17:59", "18:00", "23:30"].map((h) => turnoSV(`2026-11-27T${h}:00-06:00`).split(" ")[0]));
  expect(r).toEqual(["Nocturno", "Diurno", "Diurno", "Nocturno", "Nocturno"]);
  expect(errores).toEqual([]);
  await ctx.close();
});

test("Cerrar sesión: pide confirmación, borra el perfil del dispositivo y vuelve a la pantalla de inicio", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  await expect(page.locator("#medbtn")).toHaveText("👤 Médico de prueba");
  await expect(page.locator("#salirbtn")).toBeVisible();
  // Si cancela, la sesión sigue
  await page.evaluate(() => { window.confirm = () => false; });
  await page.locator("#salirbtn").click();
  expect(await page.evaluate(() => MED && MED.nombre)).toBe("Médico de prueba");
  // Si confirma, se cierra
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator("#salirbtn").click();
  await expect(page.locator("#perfil")).toBeVisible();
  expect(await page.evaluate(() => [MED, localStorage.getItem("hvcp_medico")])).toEqual([null, null]);
  await expect(page.locator("#salirbtn")).toBeHidden();
  await expect(page.locator("#miscasosbtn")).toBeHidden();
  await expect(page.locator("#medbtn")).toHaveText("Iniciar sesión");
  expect(errores).toEqual([]);
  await ctx.close();
});

test("Administrador: pestaña «Usuarios» con perfiles de médico y sus estadísticas", async ({ browser }) => {
  const { ctx, page, errores } = await abrir(browser);
  const r = await page.evaluate(() => {
    const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
    const U = "00000000-0000-4000-8000-0000000000a1", D = "00000000-0000-4000-8000-0000000000a2", T = "00000000-0000-4000-8000-0000000000a3";
    REG.meds = [
      { id: U, nombre: "Dra. Uno", activo: true, bloqueado_hasta: null, creado: h(100) },
      { id: D, nombre: "Dr. Dos", activo: true, bloqueado_hasta: new Date(Date.now() + 6e4).toISOString(), creado: h(90) },
      { id: T, nombre: "Dr. Tres", activo: false, bloqueado_hasta: null, creado: h(80) }];
    REG.medDisp = [{ usuario: "d1", medico_id: U, activo: true }, { usuario: "d2", medico_id: U, activo: true }, { usuario: "d3", medico_id: D, activo: false }];
    const top = [{ c: "GEN-DIG-001", n: "Gastritis", sc: 40 }];
    const caso = (id, n, medicoId, medico, ent = {}) => ({ id, f: h(n), v: "8.0", medicoId, medico, min: 5, ent: { esp: "c", ex: {}, signsAll: [], ...ent },
      sal: { top, alta: [], soap: ["GEN-DIG-001"], soapAuto: true, insuf: false, faltan: [], qPend: [], qVis: 0 } });
    REG.casos = [caso("MC-U1", 2, U, "Dra. Uno"), caso("MC-U2", 10, U, "Dra. Uno"), caso("MC-U3", 40, U, "Dra. Uno"),
      caso("MC-D1", 5, D, "Dr. Dos", { rcp: true, conc: "ssv" }), caso("MC-X1", 60, null, undefined)];
    REG.cierres = new Map([["MC-U2", { dx: { c: "GEN-DIG-001", n: "Gastritis" }, conf: "lab", fc: h(1), cerradoPor: "Dr. Dos" }],
      ["MC-D1", { sinDx: true, fc: h(1), cerradoPor: "Dr. Dos" }]]);
    REG.vet = "";
    const d = document.createElement("div"); d.innerHTML = regMedicos();
    const filas = [...d.querySelectorAll("#medtabla tr")].slice(1).map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()));
    const btn = !!document.querySelector('#regtabs .opt[data-v="med"]');
    return { btn, filas, kpis: d.querySelector(".reg-kpis").innerText };
  });
  expect(r.btn).toBe(true);
  const fila = (n) => r.filas.find((f) => f[0].startsWith(n));
  // Columnas: médico, casos, pendientes, cerrados, por tiempo, % cerrados, cierres hechos, con dx, top-1, top-3, mediana, último, dispositivos
  expect(fila("Dra. Uno").slice(1, 8)).toEqual(["3", "1", "1", "1", "33%", "0", "1"]);
  expect(fila("Dra. Uno")[8]).toContain("100%");
  expect(fila("Dra. Uno")[12]).toBe("2");
  expect(fila("Dr. Dos")[0]).toContain("Bloqueado");
  expect(fila("Dr. Dos").slice(1, 8)).toEqual(["1", "0", "1", "0", "100%", "2", "0"]);
  expect(fila("Dr. Tres")[0]).toContain("Inactivo");
  expect(fila("Dr. Tres")[1]).toBe("0");
  expect(r.filas[r.filas.length - 1][0]).toContain("Sin perfil");
  expect(r.kpis).toContain("perfiles de médico");
  expect(errores).toEqual([]);
  await ctx.close();
});
