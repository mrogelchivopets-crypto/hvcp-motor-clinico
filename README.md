# Motor Clínico de Urgencias HVCP v7.9.7 · registro en línea

Hospital Veterinario Chivo Pets. Es el Motor Clínico (v7.9.7; los cambios de cada versión están en `CAMBIOS.md`), con un enlace fijo en GitHub Pages y un **registro de casos único para todo el hospital** en Supabase (base de datos Postgres con autenticación).

- **La lógica clínica no cambió.** Diagnósticos, signos, preguntas, motivos, pesos, `scoreDx`, `altaList`, alertas, fluidoterapia y nota SOAP son idénticos al original. Así se comprobó: en 240 casos generados al azar, el original y la versión nueva dieron exactamente el mismo resultado (ver [Pruebas](#pruebas)).
- **No se guarda ningún dato del propietario**: ni nombre, ni teléfono, ni dirección, ni número de expediente.
- La interfaz es la misma: barra inferior fija, pasos arriba, buscador de signos y modo claro u oscuro.

## Cómo funciona

| Quién | Qué hace | Cuenta |
|---|---|---|
| **Médicos** | Usan el motor con el enlace. Al generar la nota SOAP se crea el caso, y el código MC queda escrito en la nota. Para cerrar un caso, escriben su código MC en «Registro de casos». | **No necesitan cuenta.** Cada dispositivo recibe una sesión anónima. |
| **Dirección (admin)** | Ve todos los casos, los indicadores del hospital y la columna «Veterinario», exporta a Excel y anula casos. | Correo y contraseña. |

- **Los médicos no ven el historial**, ni siquiera el de su propio dispositivo. Solo pueden abrir un caso si tienen su código MC exacto.
- **Nadie borra registros.** El admin solo *anula*: el caso sale de la lista y de los indicadores, y queda constancia de quién lo anuló, cuándo y por qué.
- **«No registrar (prueba o docencia)»**: el caso se guarda marcado como *prueba*, no lleva el código en la nota y no cuenta en los indicadores.
- **Sin internet el motor funciona igual.** Los casos quedan en una cola en el dispositivo y se envían solos al volver la conexión. Arriba se muestra un indicador discreto: **«Sincronizado»**, **«X casos pendientes»** o **«Sin conexión»**.
- **Uso que queda registrado:**
  - sesiones de uso: dispositivo resumido, inicio y última actividad;
  - casos creados y minutos hasta la nota SOAP;
  - cierres;
  - eventos (copiar la nota, nuevo paciente, abrir un caso por código, exportar).
- **Columna «Veterinario»:** como el uso es anónimo, muestra una etiqueta del dispositivo, por ejemplo `Anónimo · disp. 3F9A`.

## Plan de Supabase recomendado

- **Prueba piloto: plan gratuito (Free).**
- **Producción: plan Pro, US$25 al mes.** El plan gratuito tiene dos problemas para un registro clínico:
  - **se pausa después de 1 semana sin actividad**, y el registro deja de recibir casos hasta que alguien lo reactiva desde el panel;
  - **no incluye copias de seguridad**. Pro incluye copias diarias.

---

## Puesta en marcha, paso a paso

> Haga primero todo esto en un **proyecto de prueba**. Cuando todo funcione, repítalo en el de producción.

### 1. Crear el proyecto en Supabase

1. Entre a <https://supabase.com> y cree una cuenta con el correo de la dirección.
2. Haga clic en **New project**:
   - Nombre: `hvcp-motor-clinico`.
   - Región: **East US (North Virginia)**, la más cercana a El Salvador.
   - Contraseña de la base: genérela, guárdela en un lugar seguro y **no la comparta**. No hace falta para el motor.
3. Espere 1 o 2 minutos a que el proyecto quede listo.

### 2. Crear las tablas (migraciones)

En el panel, vaya a **SQL Editor → New query**. Pegue y ejecute (**Run**) **en este orden** el contenido de cada archivo:

1. `supabase/migrations/20261117000100_esquema.sql`: tablas.
2. `supabase/migrations/20261117000200_seguridad_rls.sql`: seguridad (RLS) y funciones.
3. `supabase/migrations/20261117000300_indicadores.sql`: vistas de indicadores.
4. `supabase/migrations/20261117000400_admin.sql`: funciones del admin.
5. `supabase/migrations/20261119000500_hemo_efectivo.sql`: estado hemodinámico efectivo (motor v7.9.7).
6. `supabase/migrations/20261120000600_rol_lector.sql`: rol de solo lectura.
7. `supabase/migrations/20261124000700_segunda_confirmacion.sql`: segunda base de la confirmación.
8. `supabase/migrations/20261124000800_mis_pendientes.sql`: aviso de casos por cerrar en cada dispositivo (M10). Sin ella, el aviso usa la lista local del dispositivo.

Cuando se agregue una migración nueva a un proyecto que ya está funcionando, se ejecuta **solo esa**. Conviene correrla primero en el proyecto de prueba y después en el de producción.

Cada uno debe terminar con «Success. No rows returned». **No ejecute `supabase/seed.sql` en la nube**: es solo para pruebas locales.

> Si tiene la CLI de Supabase, puede hacerlo en su lugar con `supabase link --project-ref SU-REF` y `supabase db push`.

### 3. Configurar la autenticación

En **Authentication**:

1. **Sign In / Providers**:
   - Active **Allow anonymous sign-ins**. Sin esto, los médicos no pueden registrar casos.
   - En **Email**: déjelo activado, active **Confirm email** y defina una contraseña mínima de 10 caracteres.
2. **URL Configuration**:
   - **Site URL**: la dirección de GitHub Pages (paso 6), por ejemplo `https://SU-USUARIO.github.io/hvcp-motor-clinico/`.
   - **Redirect URLs**: agregue esa misma dirección seguida de `**`.
3. **Emails → Templates** (opcional): Supabase solo permite editar las plantillas si configura un servidor de correo propio (**SMTP Settings**). Sin eso, los correos salen en inglés con el texto estándar, y funcionan igual. Si configura SMTP, ponga los textos en español: para cada plantilla, copie el contenido de `supabase/templates/` y use estos asuntos:

   | Plantilla | Archivo | Asunto |
   |---|---|---|
   | Reset Password | `recuperar.html` | Motor Clínico HVCP · Cambiar contraseña |
   | Invite user | `invitar.html` | Motor Clínico HVCP · Invitación al registro |
   | Confirm signup | `confirmar.html` | Motor Clínico HVCP · Confirme su correo |
   | Change Email Address | `cambio_correo.html` | Motor Clínico HVCP · Confirme su nuevo correo |

> **Correos:** el servicio de correo incluido en Supabase solo envía unos pocos mensajes por hora, y únicamente a los miembros del equipo del proyecto. Para recuperar la contraseña del admin alcanza. Si un día necesita enviar correos a más personas, configure su propio SMTP en **Project Settings → Authentication → SMTP**.

### 4. Copiar la URL y la clave pública en `config.js`

1. En **Project Settings → API** (o **API Keys**), copie:
   - la **Project URL**;
   - la clave **anon public**, que en los proyectos nuevos se llama *publishable*.
2. Abra `config.js` y reemplace los dos valores:

   ```js
   window.HVCP_CONFIG = {
     supabaseUrl: "https://abcdefghijkl.supabase.co",
     supabaseAnonKey: "eyJhbGciOi…"
   };
   ```

> ⚠️ **Nunca ponga la `service_role` key (o *secret*) en `config.js`, en el HTML ni en el repositorio.** Esa clave salta toda la seguridad. La *anon* es pública por diseño, porque la protección la da RLS en la base. Si alguien pegara la `service_role` por error, el motor se niega a conectarse.

### 5. Nombrar al administrador

1. Vaya a **Authentication → Users → Add user → Create new user**. Escriba el correo de la dirección y una contraseña de 10 caracteres o más, y marque **Auto Confirm User**.
2. En **SQL Editor**, ejecute lo siguiente con su correo:

   ```sql
   insert into public.perfiles (id, nombre, rol)
   select id, 'Dirección general', 'admin' from auth.users where email = 'SU-CORREO@chivopets.sv'
   on conflict (id) do update set rol = 'admin', nombre = excluded.nombre;
   ```

Para agregar otro administrador, repita los dos pasos con su correo. Para quitarle el acceso: `update public.perfiles set activo = false, rol = 'veterinario' where id = '…';`. Un admin no puede quitarse a sí mismo el rol.

### 6. «Agregar veterinarios»

**No hay que crear cuentas.** Los médicos solo necesitan el enlace de GitHub Pages:
- Compártalo por el grupo del hospital.
- En el teléfono, pueden «Agregar a pantalla de inicio».

Cada dispositivo queda identificado de forma anónima. La sesión dura indefinidamente, porque se renueva sola. Si se borran los datos del navegador, el dispositivo empieza una sesión anónima nueva y le aparece otra etiqueta en «Veterinario».

> Si más adelante quiere ver nombres en lugar de etiquetas anónimas, la tabla `perfiles` ya lo permite. Haría falta dar cuenta a cada médico, y es una decisión aparte.

### 7. Publicar en GitHub Pages

1. Cree el repositorio en GitHub, por ejemplo `hvcp-motor-clinico`, y suba la rama `main` con `config.js` ya llenado.
2. Vaya a **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**.
   - Branch: `main`, carpeta `/ (root)`.
   - Clic en **Save**.
3. En 1 o 2 minutos aparece la dirección fija: `https://SU-USUARIO.github.io/hvcp-motor-clinico/`.
4. Vuelva al paso 3 y ponga esa dirección como **Site URL**.
5. Abra el enlace, genere una nota SOAP de prueba marcando «No registrar», y verifique que arriba diga **«Sincronizado»**.

> El enlace de GitHub Pages es público, como lo era el HTML compartido. Cualquiera con el enlace puede usar el motor y registrar casos, pero **nadie sin la cuenta de admin puede leer el registro**.

### 8. Pasar el registro anterior (opcional)

1. En la versión anterior, abra «Registro de casos», elija **«Todo el registro»** y use **Exportar a Excel**.
2. Instale Node.js 20 o más reciente y, en esta carpeta, ejecute `npm install`.
3. Copie `.env.ejemplo` como `.env` y llénelo con la URL, la anon key y el correo y la contraseña del admin.
4. Revise el archivo (**no envía nada**):

   ```bash
   npm run importar -- "Registro_MC_HVCP_2026-11-17.xlsx"
   ```

5. Importe:

   ```bash
   npm run importar -- "Registro_MC_HVCP_2026-11-17.xlsx" --enviar
   ```

El script:
- Lee las hojas «Casos» y «Matriz ML».
- Entra como admin; no usa la service_role key.
- Es **idempotente por código MC**: si lo corre dos veces, no duplica nada.
- Deja los casos a nombre del admin y marcados como **«Migrado»**.

Del Excel anterior no se pueden recuperar:
- los minutos hasta la nota SOAP;
- las alertas;
- la lista de preguntas pendientes (se conserva cuántas preguntas había).

## Indicadores y Excel

- En el motor, el admin ve la pestaña **Indicadores**, con los mismos cálculos de la versión anterior, ahora con los casos de todo el hospital.
- La pestaña **Uso** muestra el uso del hospital, con el mismo período y filtro de veterinario que las demás pestañas:
  - casos por día (o por semana en períodos largos);
  - casos por turno y por día de la semana;
  - especie, motivos de consulta más frecuentes y versión del motor;
  - mediana de tiempo hasta la nota SOAP y hasta el cierre;
  - una tabla por veterinario o dispositivo con casos, % cerrados y sesiones de uso. Las sesiones se leen de `v_uso_sesiones`.
- **Exportar a Excel** produce las mismas hojas y columnas que antes, más la columna **«Veterinario»**.
- Para análisis aparte, la base tiene estas vistas, solo para el admin y en el **SQL Editor**:

| Vista | Qué muestra |
|---|---|
| `v_casos_por_dia` | Casos por día, turno (mañana 07–14 h, tarde 15–22 h, noche 23–06 h) y veterinario |
| `v_cerrados_abiertos` / `v_casos_estado` | Casos cerrados contra abiertos |
| `v_acierto_resumen` / `v_acierto_casos` | Acierto del motor: diagnóstico en 1.er lugar y en el top 3, total y solo con confirmación objetiva |
| `v_tiempo_soap` | Minutos hasta la nota SOAP (promedio y mediana) |
| `v_dx_frecuentes` | Diagnósticos más frecuentes, presuntivos y definitivos |
| `v_uso_sesiones` | Sesiones de uso por día y dispositivo |

Todas excluyen los casos anulados y los de prueba o docencia. La hora es la de El Salvador. Si los turnos del hospital son otros, ajuste la función `turno_de`.

## Excel automático en OneDrive y análisis diario

- **Exportación dos veces al día (10:00 y 16:00).** La tarea de Windows «HVCP Motor - Exportar registro» (`scripts/programar_exportacion.ps1`) corre `scripts/exportar_registro.mjs` y guarda en `Documentos\Motor\Registro del motor`:
  - `Registro_Motor_Clinico_HVCP.xlsx`: el Excel vigente, con las mismas hojas que «Exportar a Excel» del panel.
  - `historico\`: una copia por día.
  - `datos\registro.json`: los datos en bruto para el análisis.
  - `exportacion.log`: el resultado de cada ejecución.
- **Requisitos de la exportación:**
  - la computadora encendida con la sesión de Windows iniciada;
  - el archivo `.env.exportacion` lleno (plantilla en `.env.exportacion.ejemplo`; no se sube a GitHub).
- **Si el Excel está abierto:** Excel lo bloquea y esa actualización se salta. La siguiente lo actualiza.
- **Análisis a las 10:30 a. m. y 4:30 p. m.** Una tarea programada de Claude («Motor Clínico HVCP · análisis») lee los datos de la exportación anterior y escribe `Reportes\Reporte_Motor_AAAA-MM-DD.html` (en la tarde, `…_tarde.html`):
  - uso, cierre de casos, acierto del motor y propuestas de corrección;
  - retroalimentación por caso (`scripts/retroalimentacion.mjs`): `Retroalimentacion_AAAA-MM-DD.html` (o `…_tarde.html`) y `propuestas.json`. Cada caso se reporta una sola vez;
  - solo propone. Los cambios al motor se aplican con aprobación y pruebas;
  - corre con la aplicación de Claude abierta. Si está cerrada a esa hora, corre al abrirla.
- **Cuenta de solo lectura (recomendado).** La migración `20261120000600_rol_lector.sql` agrega el rol «lector»: puede leer el registro, pero no anular ni modificar nada. Así la contraseña guardada en la computadora no da permisos de administrador. Mientras no se aplique, la exportación usa la cuenta de administrador.

## Actualizar medicamentos, exámenes e inventario

El catálogo (formulario de medicamentos, faltantes con su sustituto y exámenes) vive dentro de `index.html`. Se edita en Excel y se carga con dos comandos. **Los diagnósticos, signos y puntajes no se cambian así**: son lógica clínica y se validan aparte.

### 1. Sacar el Excel del motor actual

```powershell
npm run catalogo:exportar -- --vetcie "C:\ruta\VetCIE-1_HVCP_Clasificador_v3.xlsx"
```

- Genera `catalogo/Catalogo_Motor_Clinico_HVCP_v<versión>.xlsx`.
- `--vetcie` es opcional: si lo da, revisa que cada código de diagnóstico del motor exista en el clasificador.

### 2. Editar

- Se editan solo tres hojas: **Medicamentos HVCP**, **Medicamentos faltantes** y **Exámenes**. También la fila **Inventario de referencia** de la hoja **Resumen**.
- Las columnas «(automático)» y las hojas de diagnósticos son de consulta y no se leen.
- La hoja **Resumen** explica cada caso:
  - un medicamento agotado se marca «No» en «En inventario»;
  - un medicamento que se compra pasa de **Medicamentos faltantes** a **Medicamentos HVCP** con la misma clave;
  - cambios en el código del laboratorio, sustitutos, etc.

### 3. Revisar

```powershell
npm run catalogo:importar -- catalogo\Catalogo_Motor_Clinico_HVCP_v7_9_6.xlsx
```

No cambia nada. Muestra (y guarda en `catalogo/informe_revision.md`):

- **Errores** que impiden aplicar:
  - dosis mínima mayor que la máxima;
  - un examen o medicamento que algún diagnóstico usa y fue borrado;
  - un sustituto que no existe;
  - celdas de Sí/No o números mal escritos.
- **Cambios**, campo por campo y con el valor de antes y el de después. Por ejemplo: «Amikacina: dosis gato «10–15 mg/kg…» → «15 mg/kg…»».
- **Avisos**, por ejemplo cuántos diagnósticos mostrarán un medicamento como «No disponible», o un medicamento nuevo que ningún diagnóstico usa todavía.

### 4. Aplicar

```powershell
npm run catalogo:importar -- catalogo\Catalogo_Motor_Clinico_HVCP_v7_9_6.xlsx --aplicar
```

1. Reescribe solo las líneas del catálogo en `index.html`.
2. Sube la versión, por ejemplo de 7.9.7 a 7.9.8. Para elegir otra, use `--version 7.10.0`.
3. Comprueba con 240 casos que los diagnósticos y puntajes son **idénticos** a la versión anterior. Tarda unos 3 minutos. Si algo cambió, deja el motor como estaba.
4. Anota el cambio en `CAMBIOS.md` y genera el Excel de la versión nueva.

### 5. Publicar

- Revise el motor con `npm run servir`.
- Luego haga commit y push a `main`. GitHub Pages lo publica en un minuto.
- Cada caso del registro guarda la versión del motor, así que los indicadores se pueden comparar entre versiones.
- Si algo sale mal, se vuelve a la versión anterior con `git revert`.

## Pruebas

```bash
npm install
npm run test:equivalencia
npm run test:rls
npm run test:flujo
```

- **`test:equivalencia`** compara 240 combinaciones al azar entre el original (`tests/fixtures/original_v7_9_6.html`) y `index.html`, con semilla fija, así que siempre son las mismas combinaciones. Compara:
  - la lista completa de diagnósticos y sus puntajes, incluido el top 5;
  - los hallazgos a favor y en contra;
  - `altaList`;
  - las alertas;
  - los paneles de laboratorio, fluidoterapia e IRIS;
  - la nota SOAP completa.

  Usa el Google Chrome instalado; con Edge, use `PW_CANAL=msedge`.

  Después de una actualización del catálogo, el texto de los planes cambia a propósito. Por eso `catalogo:importar` compara contra la versión anterior (`EQ_BASE`) y solo el razonamiento clínico (`EQ_MODO=diagnostico`).
- **`test:rls`** y **`test:flujo`** necesitan un **proyecto de prueba** configurado en `.env` (ver `.env.ejemplo`). Verifican:
  - que un dispositivo anónimo no puede leer, modificar ni borrar nada, ni hacerse admin;
  - la cola sin conexión;
  - el cierre por código desde otro dispositivo;
  - el acceso del admin, el Excel con «Veterinario» y la anulación.

  Los casos que crean quedan marcados como prueba y se anulan al final.

También puede probar el motor en su computadora con `npm run servir` y abrir <http://127.0.0.1:5173/>.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | El motor (lo que publica GitHub Pages) |
| `config.js` | URL del proyecto y anon key |
| `supabase/migrations/` | Tablas, seguridad, indicadores y funciones del admin |
| `supabase/seed.sql` | Admin de prueba **solo para Supabase local** (sin datos reales) |
| `supabase/templates/` | Correos de autenticación en español |
| `scripts/importar_registro.mjs` | Importación del Excel anterior |
| `scripts/catalogo_exportar.mjs` / `catalogo_importar.mjs` | Catálogo de medicamentos y exámenes en Excel: exportar, revisar y aplicar |
| `CAMBIOS.md` | Historial de versiones del motor (lo escribe `catalogo:importar`) |
| `guia/` | Guía rápida para médicos (QR, imagen y PDF); se regenera con `npm run guia` |
| `tests/` | Equivalencia clínica, RLS y flujo |
| `AVISO_PRIVACIDAD.md` | Qué datos se guardan y para qué |
