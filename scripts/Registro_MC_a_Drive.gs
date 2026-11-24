/**
 * Registro del Motor Clínico HVCP → Google Drive (actualización automática)
 * ---------------------------------------------------------------------------
 * Copia cada hora el registro en línea (Supabase) a una hoja de cálculo de Google
 * en su Drive y deja también una copia en Excel (.xlsx) que se sobrescribe.
 *
 * Instalación (una sola vez):
 *   1. Abra https://script.new con su cuenta de Google, borre el contenido y pegue este archivo.
 *   2. Menú «Configuración del proyecto» (engranaje) → «Propiedades del script» → agregue:
 *        SUPABASE_URL      https://bjvdjznnktgfweipeshn.supabase.co
 *        SUPABASE_KEY      sb_publishable_ooAmdcK3QrobsHZiXufymA_gGhVmWmE
 *        ADMIN_EMAIL       correo de la cuenta administradora del registro
 *        ADMIN_PASSWORD    contraseña de esa cuenta
 *      Recomendado: una cuenta administradora exclusiva para esta copia, no la personal.
 *   3. Arriba elija la función «instalar» y pulse «Ejecutar». Acepte los permisos.
 *      Crea la carpeta «Motor Clínico HVCP» en su Drive con la hoja «Registro MC HVCP (automático)»
 *      y el archivo «Registro_MC_HVCP.xlsx», y programa la copia cada hora.
 *
 * Seguridad: el registro no contiene datos del propietario. La contraseña queda en las
 * propiedades privadas del script (solo las ve su cuenta de Google). Nunca use la «service_role key».
 */

const CARPETA = 'Motor Clínico HVCP';
const HOJA = 'Registro MC HVCP (automático)';
const XLSX = 'Registro_MC_HVCP.xlsx';
const DIAS = 730; // período copiado

function instalar() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizar')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizar').timeBased().everyHours(1).create();
  sincronizar();
}

function sincronizar() {
  const P = PropertiesService.getScriptProperties();
  const url = P.getProperty('SUPABASE_URL'), key = P.getProperty('SUPABASE_KEY');
  if (!url || !key || !P.getProperty('ADMIN_EMAIL') || !P.getProperty('ADMIN_PASSWORD'))
    throw new Error('Faltan propiedades del script: SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAIL y ADMIN_PASSWORD.');
  if (/^sb_secret_/.test(key)) throw new Error('Use la publishable key, nunca la secret o service_role.');

  // 1. Sesión de administrador
  const auth = pedir_(url + '/auth/v1/token?grant_type=password', key, null,
    { email: P.getProperty('ADMIN_EMAIL'), password: P.getProperty('ADMIN_PASSWORD') });
  // 2. Casos y cierres
  const desde = new Date(Date.now() - DIAS * 864e5).toISOString();
  const lista = pedir_(url + '/rest/v1/rpc/admin_casos', key, auth.access_token, { p_desde: desde }) || [];

  // 3. Hoja de cálculo
  const carpeta = carpeta_();
  const ss = hoja_(carpeta);
  escribir_(ss, 'Casos', CAB, lista.map(fila_));
  escribir_(ss, 'Info', ['Dato', 'Valor'], [
    ['Actualizado', Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd HH:mm')],
    ['Casos', lista.length],
    ['Con diagnóstico definitivo', lista.filter(x => x.cierre && x.cierre.dx).length],
    ['Período', 'Últimos ' + DIAS + ' días'],
    ['Origen', 'Registro en línea del Motor Clínico (Supabase), función admin_casos'],
  ]);
  SpreadsheetApp.flush();
  // 4. Copia en Excel que se sobrescribe (mismo archivo, mismo enlace)
  copiaXlsx_(ss, carpeta);
}

// ── Columnas ──────────────────────────────────────────────────────────────
const CAB = ['codigo', 'fecha', 'actualizado', 'version_motor', 'veterinario', 'especie', 'edad', 'sexo', 'peso',
  'hemo', 'hemo_analizado', 'fc', 'fr', 'temp', 'mucosas', 'tllc', 'pulso', 'dh', 'dolor', 'cc', 'ausc_card', 'ausc_pulm', 'vejiga',
  'motivo', 'motivo2', 'signos', 'signos_todos', 'antecedentes', 'vacunacion', 'respuestas',
  'datos_insuficientes', 'campos_faltantes', 'preguntas_visibles', 'preguntas_pendientes', 'minutos_soap', 'alertas',
  'motor1_codigo', 'motor1_nombre', 'motor1_puntaje', 'motor2_codigo', 'motor2_nombre', 'motor2_puntaje',
  'motor3_codigo', 'motor3_nombre', 'motor3_puntaje', 'alta', 'soap', 'soap_automatica',
  'dx_codigo', 'dx_nombre', 'dx_capitulo', 'dx_nuevo', 'sin_dx', 'confirmacion', 'concomitantes', 'labs', 'tests',
  'otros', 'notas', 'cierre_fecha'];

function fila_(x) {
  const c = x.caso || {}, k = x.cierre || {}, e = c.ent || {}, ex = e.ex || {}, s = c.sal || {}, dx = k.dx || {};
  const top = s.top || [], t = i => top[i] || {};
  const J = v => (v == null || (typeof v === 'object' && !Object.keys(v).length)) ? '' : JSON.stringify(v);
  const L = v => Array.isArray(v) ? v.map(z => typeof z === 'object' ? (z.c || z.n || JSON.stringify(z)) : z).join('; ') : (v == null ? '' : v);
  const F = v => v ? Utilities.formatDate(new Date(v), 'America/El_Salvador', 'yyyy-MM-dd HH:mm') : '';
  return [c.id, F(c.f), F(c.fa), c.v, c.vet || '', e.esp, e.edad, e.sexo, e.peso,
    e.hemo, e.hemoEf || '', ex.fc, ex.fr, ex.temp, ex.muc, ex.tllc, ex.pulso, ex.dh, ex.dolor, ex.cc, ex.card, ex.pulm, ex.vej,
    e.motivo, e.motivo2, L(e.signs), L(e.signsAll), L(e.hxs), L(e.vac), J(e.ans),
    s.insuf ? 'sí' : 'no', L(s.faltan), s.qVis, L(s.qPend), c.min, L(c.alertas),
    t(0).c, t(0).n, t(0).sc, t(1).c, t(1).n, t(1).sc, t(2).c, t(2).n, t(2).sc, L(s.alta), L(s.soap), s.soapAuto ? 'sí' : 'no',
    dx.c || '', dx.n || '', dx.cap || '', dx.nuevo ? 'sí' : '', k.sinDx ? 'sí' : '', k.conf || '', L(k.con), J(k.labs), J(k.tests),
    k.otros || '', k.notas || '', F(k.fc)].map(v => v == null ? '' : v);
}

// ── Utilidades ────────────────────────────────────────────────────────────
function pedir_(u, key, token, cuerpo) {
  const r = UrlFetchApp.fetch(u, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(cuerpo),
    headers: Object.assign({ apikey: key }, token ? { Authorization: 'Bearer ' + token } : {})
  });
  const code = r.getResponseCode(), txt = r.getContentText();
  if (code >= 300) throw new Error('Supabase ' + code + ': ' + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : null;
}
function carpeta_() {
  const it = DriveApp.getFoldersByName(CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
}
function hoja_(carpeta) {
  const it = carpeta.getFilesByName(HOJA);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  const ss = SpreadsheetApp.create(HOJA);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  return ss;
}
function escribir_(ss, nombre, cab, filas) {
  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.clearContents();
  const datos = [cab].concat(filas);
  sh.getRange(1, 1, datos.length, cab.length).setValues(datos);
  sh.setFrozenRows(1);
  const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h1 && ss.getSheets().length > 1) ss.deleteSheet(h1);
}
function copiaXlsx_(ss, carpeta) {
  const token = ScriptApp.getOAuthToken();
  const blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + token } }).getBlob().setName(XLSX);
  const it = carpeta.getFilesByName(XLSX);
  if (!it.hasNext()) { carpeta.createFile(blob); return; }
  const id = it.next().getId();
  UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', {
    method: 'patch', contentType: MimeType.MICROSOFT_EXCEL, payload: blob.getBytes(),
    headers: { Authorization: 'Bearer ' + token }
  });
}
