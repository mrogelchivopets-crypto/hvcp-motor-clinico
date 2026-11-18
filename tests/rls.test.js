// Pruebas de seguridad (RLS y funciones) contra el PROYECTO DE PRUEBA de Supabase.
// Uso: llenar .env (ver .env.ejemplo) y correr   npm run test:rls
// Los casos que crea quedan marcados como «prueba» y al final se anulan (nadie borra).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { cfg, configurado, codigoMC, casoDePrueba } from "./entorno.mjs";

const omitir = configurado ? false : "Falta .env con el proyecto de prueba (ver .env.ejemplo)";
const nuevoCliente = () => createClient(cfg.url, cfg.anon, { auth: { persistSession: false, autoRefreshToken: false } });
const TABLAS = ["perfiles", "sesiones", "casos", "cierres", "cierres_hist", "eventos"];
const VISTAS = ["v_casos_validos", "v_casos_por_dia", "v_casos_estado", "v_cerrados_abiertos", "v_acierto_casos",
  "v_acierto_resumen", "v_tiempo_soap", "v_dx_frecuentes", "v_uso_sesiones"];

let A, B, ADM, sinSesion, codigoA, codigoCerrado, sesionA;
const creados = [];

before(async () => {
  if (omitir) return;
  A = nuevoCliente(); B = nuevoCliente(); ADM = nuevoCliente(); sinSesion = nuevoCliente();
  for (const c of [A, B]) { const r = await c.auth.signInAnonymously(); assert.ifError(r.error); }
  const r = await ADM.auth.signInWithPassword({ email: cfg.adminEmail, password: cfg.adminPass });
  assert.ifError(r.error);
});

after(async () => {
  if (omitir || !ADM) return;
  for (const cod of creados) await ADM.rpc("anular_caso", { p_codigo: cod, p_motivo: "Prueba automática (tests/rls.test.js)" });
});

test("sin sesión (rol anon) no puede leer ni llamar funciones", { skip: omitir }, async () => {
  for (const t of [...TABLAS, ...VISTAS]) {
    const { data, error } = await sinSesion.from(t).select("*").limit(1);
    assert.ok(error || (data && data.length === 0), `rol anon leyó ${t}`);
  }
  const { error } = await sinSesion.rpc("registrar_caso", { p: casoDePrueba(codigoMC()) });
  assert.ok(error, "rol anon pudo registrar un caso");
});

test("un dispositivo anónimo registra casos e inicia sesión de uso", { skip: omitir }, async () => {
  const s = await A.rpc("iniciar_sesion", { p_dispositivo: "Prueba · Node", p_version: "7.9.6" });
  assert.ifError(s.error); sesionA = s.data;
  codigoA = codigoMC();
  const r = await A.rpc("registrar_caso", { p: casoDePrueba(codigoA, { sesion: sesionA }) });
  assert.ifError(r.error); assert.equal(r.data.codigo, codigoA); creados.push(codigoA);
  // Reenvío desde la cola: idempotente (mismo dispositivo, mismo código)
  const r2 = await A.rpc("registrar_caso", { p: casoDePrueba(codigoA, { sesion: sesionA, min: 6 }) });
  assert.ifError(r2.error); assert.equal(r2.data.id, r.data.id);
  assert.ifError((await A.rpc("latido", { p_sesion: sesionA })).error);
  assert.ifError((await A.rpc("registrar_evento", { p_tipo: "copiar_soap", p_sesion: sesionA, p_codigo: codigoA })).error);
});

test("un dispositivo anónimo NO ve el historial (ni el propio)", { skip: omitir }, async () => {
  for (const t of [...TABLAS, ...VISTAS]) {
    const { data, error } = await A.from(t).select("*").limit(5);
    assert.ok(error || data.length === 0, `el dispositivo anónimo leyó ${t}: ${JSON.stringify(data)}`);
  }
  const l = await A.rpc("admin_casos", { p_desde: "2000-01-01T00:00:00Z" });
  assert.ok(l.error, "un anónimo pudo llamar admin_casos");
});

test("un dispositivo anónimo NO puede insertar, modificar ni borrar directamente", { skip: omitir }, async () => {
  const ins = await A.from("casos").insert({ codigo: codigoMC(), especie: "c" });
  assert.ok(ins.error, "insert directo en casos permitido");
  const upd = await A.from("casos").update({ anulado: true }).eq("codigo", codigoA).select();
  assert.ok(upd.error || upd.data.length === 0, "update directo en casos permitido");
  const del = await A.from("casos").delete().eq("codigo", codigoA).select();
  assert.ok(del.error || del.data.length === 0, "delete directo en casos permitido");
  for (const t of ["cierres", "eventos", "sesiones", "cierres_hist"]) {
    const d = await A.from(t).delete().neq("usuario", "00000000-0000-0000-0000-000000000000").select();
    assert.ok(d.error || d.data.length === 0, `delete en ${t} permitido`);
  }
  for (const v of VISTAS.slice(0, 1)) {
    const d = await A.from(v).delete().eq("codigo", codigoA).select();
    assert.ok(d.error || d.data.length === 0, `delete por la vista ${v} permitido`);
  }
});

test("un anónimo no puede hacerse administrador", { skip: omitir }, async () => {
  const { data: { user } } = await A.auth.getUser();
  const ins = await A.from("perfiles").insert({ id: user.id, nombre: "Intruso", rol: "admin" });
  assert.ok(ins.error, "se creó un perfil admin");
  const upd = await A.from("perfiles").update({ rol: "admin" }).eq("id", user.id).select();
  assert.ok(upd.error || upd.data.length === 0, "se cambió el rol");
  const es = await A.rpc("es_admin"); assert.equal(es.data, false);
  for (const [fn, args] of [["anular_caso", { p_codigo: codigoA, p_motivo: "x" }], ["importar_caso", { p: casoDePrueba(codigoMC()) }]]) {
    const r = await A.rpc(fn, args); assert.ok(r.error, `un anónimo pudo llamar ${fn}`);
  }
});

test("otro dispositivo no puede sobrescribir un caso ajeno", { skip: omitir }, async () => {
  const r = await B.rpc("registrar_caso", { p: casoDePrueba(codigoA, { ent: { esp: "f" } }) });
  assert.ok(r.error); assert.match(r.error.message, /codigo_ocupado/);
});

test("validaciones del servidor: código, tamaño y cierre", { skip: omitir }, async () => {
  const mal = await A.rpc("registrar_caso", { p: casoDePrueba("MC-0O1IL0") });
  assert.match(mal.error?.message || "", /codigo_invalido/);
  const grande = await A.rpc("registrar_caso", { p: casoDePrueba(codigoMC(), { relleno: "x".repeat(70000) }) });
  assert.match(grande.error?.message || "", /caso_muy_grande/);
  const sinConf = await B.rpc("guardar_cierre", { p_codigo: codigoA, p: { dx: { c: "", n: "Gastritis aguda", cap: "", nuevo: false }, conf: "" } });
  assert.match(sinConf.error?.message || "", /falta_confirmacion/);
  const noExiste = await B.rpc("guardar_cierre", { p_codigo: "MC-ZZZZZZ", p: { sinDx: true } });
  assert.match(noExiste.error?.message || "", /caso_no_encontrado/);
});

test("cualquier médico abre un caso con su código y lo cierra", { skip: omitir }, async () => {
  const o = await B.rpc("caso_por_codigo", { p_codigo: codigoA.toLowerCase() });
  assert.ifError(o.error); assert.equal(o.data.caso.id, codigoA); assert.equal(o.data.cierre, null);
  assert.equal(o.data.caso.ent.peso, 12.5);
  const c = await B.rpc("guardar_cierre", { p_codigo: codigoA, p: {
    dx: { c: "GEN-DIG-001", n: "Gastritis aguda", cap: "11", nuevo: false }, con: [], sinDx: false, conf: "clin",
    labs: { glu: "95" }, tests: { parvo: "neg" }, otros: "", notas: "Cierre de prueba" } });
  assert.ifError(c.error); codigoCerrado = codigoA;
  const o2 = await A.rpc("caso_por_codigo", { p_codigo: codigoA });
  assert.equal(o2.data.cierre.dx.n, "Gastritis aguda"); assert.equal(o2.data.cierre.conf, "clin");
  // Aun así, ninguno de los dos puede listar cierres
  const l = await B.from("cierres").select("*"); assert.ok(l.error || l.data.length === 0);
});

test("ningún dato del propietario existe en el esquema", { skip: omitir }, async () => {
  const r = await ADM.from("casos").select("*").eq("codigo", codigoA).single();
  assert.ifError(r.error);
  const cols = Object.keys(r.data).join(" ");
  assert.doesNotMatch(cols, /propietari|dueñ|duen|telefono|teléfono|direcci|expediente|cliente|correo|email/i);
});

test("el administrador ve todo, los indicadores y puede anular (no borrar)", { skip: omitir }, async () => {
  assert.equal((await ADM.rpc("es_admin")).data, true);
  const t = await ADM.from("casos").select("codigo,prueba,usuario").eq("codigo", codigoA);
  assert.ifError(t.error); assert.equal(t.data.length, 1); assert.equal(t.data[0].prueba, true);
  for (const v of VISTAS) { const r = await ADM.from(v).select("*").limit(3); assert.ifError(r.error, v); }
  // Los casos de prueba quedan fuera de los indicadores
  const val = await ADM.from("v_casos_validos").select("codigo").eq("codigo", codigoA);
  assert.equal(val.data.length, 0);
  const l1 = await ADM.rpc("admin_casos", { p_desde: "2000-01-01T00:00:00Z" });
  assert.ok(!l1.data.some((x) => x.caso.id === codigoA), "un caso de prueba apareció sin pedirlo");
  const l2 = await ADM.rpc("admin_casos", { p_desde: "2000-01-01T00:00:00Z", p_incluir_pruebas: true });
  const fila = l2.data.find((x) => x.caso.id === codigoA);
  assert.ok(fila); assert.match(fila.caso.vet, /^Anónimo · disp\. [0-9A-F]{4}$/); assert.equal(fila.cierre.conf, "clin");
  const ses = await ADM.from("sesiones").select("id,dispositivo").eq("id", sesionA);
  assert.equal(ses.data[0].dispositivo, "Prueba · Node");
  // Ni el admin puede borrar
  const del = await ADM.from("casos").delete().eq("codigo", codigoA).select();
  assert.ok(del.error || del.data.length === 0, "el admin pudo borrar");
  // Anular
  const an = await ADM.rpc("anular_caso", { p_codigo: codigoA, p_motivo: "Prueba automática" });
  assert.ifError(an.error); creados.splice(creados.indexOf(codigoA), 1);
  const o = await B.rpc("caso_por_codigo", { p_codigo: codigoA }); assert.equal(o.data, null);
  const re = await A.rpc("registrar_caso", { p: casoDePrueba(codigoA) });
  assert.match(re.error?.message || "", /caso_anulado/);
});

test("importación del admin: idempotente y marcada como migrada", { skip: omitir }, async () => {
  const cod = codigoMC();
  const caso = casoDePrueba(cod, { f: "2026-10-01T15:00:00Z" });
  const r1 = await ADM.rpc("importar_caso", { p: caso, p_cierre: { sinDx: true } });
  assert.ifError(r1.error); assert.equal(r1.data, true); creados.push(cod);
  const r2 = await ADM.rpc("importar_caso", { p: caso, p_cierre: null });
  assert.equal(r2.data, false);
  const t = await ADM.from("casos").select("migrado,creado").eq("codigo", cod).single();
  assert.equal(t.data.migrado, true); assert.equal(new Date(t.data.creado).toISOString(), "2026-10-01T15:00:00.000Z");
});
