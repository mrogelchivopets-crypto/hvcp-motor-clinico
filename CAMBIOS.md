# Historial de cambios del Motor Clínico

## v8.0 — compilación 2026-11-27b · publicada el 27/11/2026 a las 17:58 (base: v7.9.7 compilación 2026-11-27a)

Rama `v8.0`, un commit por cambio; PR a `main` sin fusionar (lo aprueba la Dirección General).

**Decisiones de Melvyn (26/11/2026):** criterios del estado hemodinámico automático aprobados tal cual; escala de conciencia de 5 estados con puntaje acotado aprobada tal cual, más el estado «Crítico ER» (libera los obligatorios del examen físico para priorizar al paciente); perfil por médico opción A (nombre + PIN); número de versión v8.0. El registro deja de ser anónimo.

**Decisiones de Melvyn (27/11/2026), preguntadas antes de programar:**
- Numeración V1–V7 (no M12–M18: M12 y M13 ya son propuestas pendientes del análisis en la nube).
- Perfiles en el servidor (Supabase, migración 08), no solo en el dispositivo.
- Se agregan opciones de examen que faltaban para los criterios: TLLC «2–3 s» y «> 3 s»; pulso «Débil» y «Filiforme» por separado.
- La simulación se reconstruye (los scripts originales de 3000 casos no están en el repositorio; solo `Simulacion_Motor_Clinico_v7_0.xlsx`).
- Criterios que no cabían en el pedido: pulso débil solo → compensado; mucosas rojas solas → compensado; pulso saltón o déficit de pulso solos → estable.

### V1 · Condición corporal obligatoria — `f6c444d`
- **Qué cambió:** se quitó el botón de atajo de la condición corporal; `cc` entra en `REQ` (obligatorio).
- **Motivo:** la condición corporal quedaba sin llenar en la mayoría de casos.
- **Zonas:** bloque CC del examen físico, `REQ`.
- **Verificación:** `tests/v8.spec.js` (sin CC no genera SOAP; con CC sí). **Resultado:** OK.

### V2 · Obligatorios reales y sin atajos — `80844df`
- **Qué cambió:** `REQ` = especie, conciencia, peso, edad, sexo, vacunas, FC, FR, temperatura, mucosas, TLLC, pulso, deshidratación, auscultación cardíaca y pulmonar, CC. `genSOAPbase` y `regTrasSOAP` no avanzan con faltantes ni sin médico. Excepciones: «Sin signos vitales» solo pide especie; «Crítico ER» omite el grupo del examen físico.
- **Atajos encontrados:** solo el botón de CC (V1). No había otros.
- **Zonas:** `REQ`, `faltantes()`, `genSOAPbase`, `regTrasSOAP`.
- **Verificación:** aviso de obligatorios en pantalla y bloqueo de SOAP/registro (`v8.spec.js`). **Resultado:** OK.

### V3 · Estado hemodinámico automático — `e7b86c1`
- **Qué cambió:** el médico ya no marca el estado; `hemoCalc()` lo calcula desde el examen y lo muestra en un recuadro de solo lectura con color (verde estable, amarillo compensado, rojo descompensado, gris «Pendiente» si falta un dato). La nota SOAP dice «Estado hemodinámico (calculado): X — criterios». Se apagaron las alertas de incoherencia shock/estado marcado (ya no hay estado marcado).
- **Opciones agregadas (decisión 27/11):** TLLC `2–3 s` y `> 3 s`; pulso `Débil` y `Filiforme`.
- **Rangos de FC usados:** taquicardia — gato > 220, cachorro > 200, perro < 10 kg > 160, otros perros > 140. Bradicardia — gato < 120 (< 160 con hipoperfusión), perro < 60, perro < 10 kg < 80 (< 100 con hipoperfusión).
- **Zonas:** `EX_TLLC`, `EX_PULSO`, `hemoCalc`, `hemoInfo` (envoltura), `hemoBox`, CSS claro/oscuro, SOAP, instantánea del registro.
- **Verificación:** 23 vectores clínicos con el estado esperado (`v8.spec.js`). **Resultado:** 23/23.

### V4 · Estado de conciencia (6 estados) — `e7171e9`
- **Qué cambió:** escala Alerta / Deprimido / Estupor / Coma, más «Crítico ER» y «Sin signos vitales». Alertas: «Prioridad 1 (triaje)» en estupor, coma y Crítico ER; recordatorio de completar el examen en Crítico ER; recordatorio de peso para RCP. SOAP: línea de conciencia, «examen físico diferido» con los campos faltantes, texto de RCP.
- **Magnitud del puntaje:** ±10 (`CONC_SUBE` / `CONC_BAJA`) solo en los diagnósticos que alteran la conciencia: TCE, hipoglucemia, encefalopatía hepática, anticolinesterásicos, ivermectina, etilenglicol, golpe de calor, epilepsia. Justificación: es el mismo peso que un signo de apoyo; ordena entre candidatos sin crear un diagnóstico por sí solo. La hiponatremia no es diagnóstico del motor; no se creó.
- **«Sin signos vitales»:** no calcula diagnósticos (`scoreDx` devuelve vacío); el caso se registra como RCP sin motivo de consulta. Ajustado después en V4b.
- **Zonas:** `P_CONC`, `answers` (`A.conc`), `scoreDx` (envoltura), `setConc`, alertas, SOAP, `regTrasSOAP`.
- **Verificación:** `v8.spec.js`. **Resultado:** OK.

### V5 · Perfil por médico (nombre + PIN) — `ab5dba6`
- **Qué cambió:** pantalla de perfil al abrir el motor; botones «Médico» y «Mis casos» en el encabezado. Cada caso y cierre lleva `medicoId`. «Mis casos» lista los casos del médico pendientes de cerrar.
- **Desviación del pedido:** el PIN no se guarda con SHA-256 en el navegador, sino con bcrypt en el servidor (`extensions.crypt`); 5 intentos fallidos = espera de 60 s. Es más seguro y permite usar el mismo perfil en cualquier dispositivo.
- **Migración 08** (`supabase/migrations/20261127000800_v8_medicos.sql`): tablas `medicos` y `medico_dispositivo`; columnas nuevas en `casos` y `cierres`; funciones `listar_medicos`, `crear_medico`, `entrar_medico`, `salir_medico`, `mis_casos`; `registrar_caso`, `guardar_cierre` y `admin_casos` actualizadas. Compatible con la v7.9.7 publicada (campos nuevos opcionales). **Aplicada solo en el proyecto de prueba.**
- **Verificación:** `tests/v8_medicos.spec.js` contra el proyecto de prueba (perfiles, PIN, bloqueo, «Mis casos» y cierre desde el panel, en celular y tablet). **Resultado:** OK.

### V6 · Versión única 8.0 y actualización — `21ce3b7`
- **Qué cambió:** `MC_VERSION="8.0"` y `MC_BUILD="2026-11-27a"` son la única fuente; título, encabezado, SOAP, pie y registro la leen de ahí (`MOTOR_VER`/`MOTOR_BUILD` quedan como alias). `version.json` en la raíz. «Nuevo paciente» consulta `version.json` sin caché y recarga si hay una compilación nueva; sin red sigue normal.
- **Zonas:** constantes de versión, `nuevoPaciente()`, `scripts/catalogo_lib.mjs` (`cambiarVersion`, `leerBuild`, `actualizarVersionJson`), `scripts/catalogo_importar.mjs`.
- **Verificación:** `v8.spec.js` (misma versión: no recarga; versión distinta: recarga con `?v=`). **Resultado:** OK.

### V7 · Protección contra recarga accidental — `7043e96`
- **Qué cambió:** sin recarga por arrastre (`overscroll-behavior-y: contain`); borrador automático del paciente en curso cada ~2 s por médico (`hvcp_borrador_<medicoId>`); barra «Recuperar paciente en curso» con Recuperar / Descartar; aviso del navegador al salir con paciente sin nota SOAP. El borrador se borra al generar la SOAP o con «Nuevo paciente» y sobrevive a la recarga por versión nueva.
- **Zonas:** CSS, `#borrador`, `bor*`, `renderRight` (envoltura), `beforeunload`.
- **Verificación:** `v8.spec.js` (recargar → recuperar idéntico; descartar; SOAP borra). **Resultado:** OK.

### Ajustes pedidos por Melvyn el 27/11/2026 (después de abrir el PR)

#### V4b · «Sin signos vitales»: SOAP directa y caso cerrado sin diagnóstico — `51d1167`
- **Qué cambió:** con «Sin signos vitales» ya no se exige ningún otro dato (antes pedía la especie). Se genera la nota SOAP y el caso queda **cerrado** con «Sin diagnóstico definitivo» y la nota «Cierre automático: paciente sin signos vitales al ingreso (RCP)».
- **Cómo:** el cierre va en la cola local inmediatamente después del caso; la cola ahora envía casos (`registrar_caso`) y cierres (`guardar_cierre`), en orden. Sin red, ambos se envían al reconectar. No requiere cambios en el servidor (la migración 08 ya acepta `sinDx` y especie vacía).
- **Zonas:** `faltantes()`, `regTrasSOAP`, `regCierreRCP` (nueva), `colaEnviar_`, `netPintar`, `colaTiene`.
- **Verificación:** `v8.spec.js` (sin especie: SOAP, caso con `rcp: true` y cierre `sinDx` en la cola) y `v8_medicos.spec.js` contra el proyecto de prueba (el servidor guarda el cierre con `sin_dx = true`, sin diagnóstico y `rcp = true`). **Resultado:** OK.

#### Hipotermia graduada con la escala de hipotermia secundaria — `2f4dfdc`
- **Motivo:** un gato con 34.6 °C salía como «hipotermia leve». El motor usaba la escala de hipotermia **primaria** por exposición (leve 32–37, moderada 28–32, severa < 28 °C; Wong 1983, de medicina humana).
- **Literatura:** en el paciente enfermo o traumatizado (hipotermia **secundaria**, la habitual en urgencias) los efectos adversos aparecen a temperaturas más altas; por eso Oncken, Kirby y Rudloff (Compend Contin Educ Pract Vet 2001;23:506–521) propusieron leve 36.7–37.7, moderada 35.5–36.7, severa 33–35.5 y crítica < 33 °C, escala aceptada en veterinaria y usada en la revisión de Brodeur et al. (J Vet Emerg Crit Care 2017) y en estudios felinos recientes (con cortes de ±0.1 °C).
- **Qué cambió:** leve 36.7–37.5 (amarillo), moderada 35.5–36.7 (amarillo), severa 33–35.5 (rojo), crítica < 33 °C (rojo). 34.6 °C = **hipotermia severa**. Se aplica a todos los pacientes: el motor no distingue la causa, y la escala secundaria es la más prudente.
- **Lo que no cambia:** el umbral de hipotermia (< 37.5 °C) y el puntaje de los diagnósticos; solo la etiqueta, el color y el texto de la SOAP. El top-5 de la regresión no puede cambiar por esto.
- **Zonas:** `tempCls()`, ayuda de «Temperatura».
- **Verificación:** prueba con 10 temperaturas en los límites de cada grado (`v8.spec.js`). **Resultado:** OK.

#### «Cerrado por tiempo»: casos con más de 30 h sin cierre del médico
- **Motivo:** muchos casos de más de 24 h nunca se cierran (el médico está de acuerdo con el presuntivo, lo olvidó o no quiso), y eso no deja ver los pendientes reales.
- **Qué cambió:** todo caso sin cierre con más de 30 h desde la nota SOAP pasa a **«Cerrado por tiempo»** y sale de «Pendientes». Es un estado calculado (`VENCE_H = 30`, `vencido()`, `estadoCaso()`): no se escribe nada en el servidor ni hace falta migración. Se separa de «Sin diagnóstico definitivo», que es una decisión del médico. El médico todavía puede registrar el diagnóstico definitivo; entonces pasa a «Cerrado».
- **Dónde se ve:** la lista del registro (filtros Pendientes · Cerrados · Cerrados por tiempo · Todos, y la etiqueta en cada fila), el aviso en la ficha, «Mis casos» (pendientes de las últimas 30 h, cerrados y cerrados por tiempo) y los indicadores de uso (porcentaje de cerrados por el médico y por tiempo).
- **Pendiente:** la exportación y el análisis lo incorporan en la segunda parte; estos casos no cuentan para el acierto.
- **Verificación:** `v8.spec.js` (límites 29.9 h y 30.1 h, filtros, conteos y «Mis casos»). **Resultado:** OK.

### Segunda parte: exportación y análisis (27/11/2026)

#### Excel (`regLibro`, `regStats`; lo usan «Exportar a Excel» y la exportación de las 10:00 y 16:00)
- **Hoja «Casos», columnas nuevas:** Médico, Estado del caso (Pendiente · Cerrado · Cerrado por tiempo), Cerrado por, Estado de conciencia, Crítico ER, Completó el examen después, RCP. «Estado hemodinámico» ya existía. Vacías en los casos anteriores a la v8.0.
- **Hoja «Matriz ML»:** columnas `conciencia`, `critico`, `rcp`, `medico`, `estado`.
- **Hoja «Indicadores»:** el acierto **excluye los casos sin signos vitales (RCP)**, que se reportan aparte (cuántos, cerrados, sin diagnóstico, con diagnóstico). Aparte también: pacientes «Crítico ER» (cuántos, cuántos completaron el examen después, acierto top-1 y top-3), acierto por estado de conciencia y por estado hemodinámico.
- **Hoja nueva «Por médico»:** casos generados, pendientes (< 30 h), cerrados, cerrados por tiempo, % cerrados, con diagnóstico definitivo, top-1 y top-3. Los casos anteriores a la v8.0 quedan como «Sin perfil».
- **Diccionario:** las columnas nuevas.

#### Migración 09 (`20261127000900_v8_lector_y_marcas.sql`)
- **Corrige un error de la 08:** la 08 volvía a limitar `admin_casos` a administradores y la cuenta lectora de la exportación automática dejaba de leer el registro. La 09 vuelve a `puede_leer()` y conserva el nombre del médico.
- **`critico` y `rcp` ya no se pierden:** un disparador conserva `true` aunque el médico complete el examen y vuelva a generar la nota; así se sabe cuántos críticos completaron el examen después. `conciencia` guarda el último valor.
- **Turnos del hospital:** `turno_de()` pasa a diurno (6:00 a. m.–6:00 p. m.) y nocturno (6:00 p. m.–6:00 a. m.); igual en el motor (`turnoSV`, tablero de uso), el tablero y el análisis diario. Con los datos del 27/11: 157 diurnos y 79 nocturnos.
- **Proyecto de prueba:** aplicadas la 06 (no estaba) y la 09. **Producción:** aplicar 08 y 09 juntas antes de fusionar.

#### Tablero y análisis diario
- `scripts/tablero/generar_tablero.py`: campos `medico`, `estado`, `cerrado_por_tiempo`, `conciencia`, `critico`, `critico_completo`, `rcp`; los casos RCP no son evaluables. «Cerrado» ahora usa la misma regla que el motor (antes contaba cualquier cierre, aunque no tuviera diagnóstico ni confirmación: con los datos del 27/11, 122 → 111 cerrados).
- `scripts/tablero/generar_tablero_html.py`: «Por dispositivo» → «Por médico»; «Abiertos más de 48 h» → «Cerrados por tiempo»; sección nueva «Grupos que se reportan aparte» (RCP, Crítico ER, conciencia, estado hemodinámico). El acierto no cambia con los datos actuales (67/104 top-1, 85/104 top-3).
- `scripts/retroalimentacion.mjs`: no analiza casos RCP.
- Instrucciones de la tarea «hvcp-analisis-diario-motor»: versión nueva en `docs/v8/analisis_diario_SKILL_v8.md` (estados, resumen por médico, RCP fuera del acierto, crítico, conciencia y estado hemodinámico). **Se activan cuando la Dirección General lo apruebe**, copiándolas con los dos scripts del tablero a la carpeta de la tarea.

#### Verificación
- `v8.spec.js`: prueba del Excel (columnas, RCP fuera del acierto, crítico, conciencia, estado hemodinámico, «Por médico» y Matriz ML). 24 pruebas sin red OK.
- `v8_medicos.spec.js` contra el proyecto de prueba: «Crítico ER» → alerta conserva `critico = true` y `admin_casos` entrega médico y conciencia. 3 pruebas OK.
- Exportación manual de prueba con los datos de producción (cuenta lectora, carpeta temporal): 237 casos, 112 cerrados, 113 cerrados por tiempo, 12 pendientes; columnas nuevas vacías (producción aún sin la 08). Muestra con columnas llenas en el proyecto de prueba (3 casos, anulados después).

### Regresión (`tests/regresion_v8.mjs`, resultado en `docs/v8/regresion_v8.json`)
- Identidad clínica: **600 de 600** combinaciones con top-5 y puntajes idénticos (v7.9.7 con el mismo estado hemodinámico que calcula la v8.0; conciencia = Deprimido).
- Simulación por perfiles (142 perfiles, uno por diagnóstico; 3000 casos por semilla), acierto top-1 v7.9.7 vs. v8.0: semilla 1 — 66,7 % vs. 66,7 %; semilla 2 — 66,8 % vs. 66,8 %. Sin errores de página en ninguna de las dos versiones. Ningún diagnóstico baja.
- La cifra absoluta no es comparable con el 85,6 % de referencia: esa simulación (3000 casos, 113 perfiles) no está disponible; esta se reconstruyó desde las reglas del motor.
- Consola sin errores en Chromium y WebKit, en escritorio, tablet y celular (`tests/v8_consola.spec.js`).
- Capturas en `docs/v8/capturas`.

### Campos nuevos del registro
`conciencia`, `hemo` (calculado), `hemoCriterios`, `medicoId`, `medico`, `rcp`, `critico`, `version` (8.0). En el servidor: `casos.conciencia`, `critico`, `rcp`, `hemo_criterios`, `medico_id`; `cierres.cerrado_por_medico`.

### Publicación (27/11/2026, autorizada por la Dirección General)
- **Producción (`bjvdjznnktgfweipeshn`):** migraciones **06, 08 y 09** aplicadas, en ese orden. La 06 (rol «lector») nunca se había aplicado en producción y la 09 la necesita; la exportación automática entra con la cuenta de administrador, que la 06 no cambia. Verificado: la exportación con el Excel nuevo leyó los 237 casos.
- **Compilación 2026-11-27b** (la 27a era la v7.9.7). PR n.º 1 fusionado en `main` (`42819de`); GitHub Pages publica la v8.0.
- **Análisis diario:** instrucciones y scripts del tablero nuevos activos en la tarea «hvcp-analisis-diario-motor» desde la corrida del 28/11 a las 10:10.
- `tests/flujo.spec.js` (pruebas de la v7) actualizado: perfil de médico simulado, peso, pulso, condición corporal y conciencia.

### Inicio con usuario y PIN — compilación 2026-11-27c (pedido por Melvyn el 27/11/2026)
- **Qué cambió:** la pantalla «¿Quién atiende?» ya no muestra la lista de nombres. Pide **usuario** (el nombre con que se creó el perfil) y **PIN**, y funciona en cualquier dispositivo: el PIN se verifica en el servidor y el dispositivo queda registrado para ese médico. El usuario no distingue mayúsculas, acentos ni espacios de más. «Crear mi perfil» sigue disponible para la primera vez.
- **Sin cambios en el servidor:** usa `listar_medicos` y `entrar_medico` de la 08 (mismo bloqueo de 60 s tras 5 PIN incorrectos).
- **Corrección:** lo escrito en la pantalla de perfil ya no se borra si la pantalla se vuelve a dibujar mientras carga.
- **Pruebas:** `v8_medicos.spec.js` (sin lista de nombres, usuario inexistente, usuario en mayúsculas y con espacios, bloqueo, otro dispositivo) y `flujo.spec.js` (el primer dispositivo crea el perfil y los demás entran con usuario y PIN). Captura: `docs/v8/capturas/v5-inicio-usuario-pin.png`.

### Límites conocidos
- Seguridad del PIN: 4 dígitos con bcrypt y bloqueo por intentos; protege contra errores y uso casual, no contra alguien con acceso a la cuenta del dispositivo.
- Borrador por dispositivo (localStorage): no pasa de un dispositivo a otro.

## v7.9.7 · 27/11/2026 10:45 · heridas por mordedura frente a politrauma (M14)

Origen: análisis del registro del 26/11 a las 15:43 (211 casos y 97 cierres), hecho en Claude Code. Aprobado por la Dirección General el 27/11. Casos de origen:
- MC-ZDEHF2: pelea = sí y paciente estable. Politrauma 40, heridas por mordedura 35 (3.er lugar).
- MC-AXY2FR: empate 45–45 sin la pregunta de pelea respondida.
De 5 cierres por heridas por mordedura, solo 2 quedaban en 1.er lugar.

- Heridas por mordedura: **+20** con «¿Pelea, mordedura o herida punzante en los últimos 3–10 días?» = Sí. Antes no usaba esa pregunta. Es el mismo peso que ya usa el absceso.
- Politrauma: **−10** con mecanismo «Mordedura / pelea» y **−10** con pelea = Sí, solo con estado hemodinámico estable. En shock no se penaliza: una mordedura puede causar lesiones internas graves.
- Es un bloque IIFE antes de `const ST`. `MOTOR_BUILD` pasa a `2026-11-27a`; `MOTOR_VER` no cambia.
- MC-AXY2FR no cambia: sin la pregunta respondida es una omisión de datos, no un ajuste.
- La numeración sigue después de M12 y M13, propuestas por el análisis del 26/11 a las 16:35 y pendientes de aprobación.

### Verificación
- Sintaxis: `node --check` del script, OK.
- 231 casos del registro (exportación del 27/11 a las 10:19):
  - cambian 5 en el top-5 y 4 en la lista de alta, todos con pelea o mordedura respondida;
  - 0 cambios en las alertas y sin errores de página;
  - MC-ZDEHF2: heridas por mordedura del 3.º al 1.er lugar (55 contra 30);
  - ningún caso cerrado empeora; MC-E3UBVH sigue 1.º.
- 1200 casos generados con `generarYAplicar` de `tests/equivalencia.spec.js`, 166 de ellos con pelea o mordedura:
  - 17 cambian en el top-5 y 12 en la lista de alta, todos con pelea o mordedura;
  - 0 cambios en los casos sin pelea y 0 en las alertas;
  - sin errores de página.

## v7.9.7 · 26/11/2026 11:00 · anaplasmosis y babesiosis equivalen a hemoparásitos en los indicadores (M11)

Origen: análisis del registro del 26/11 a las 10:35 (203 casos y 103 cierres). Aprobado por la Dirección General. Caso de origen: MC-7DLPEQ (anaplasmosis canina confirmada por 4Dx, contada como «fuera del catálogo»).

- `DX_EQUIV` agrega Anaplasmosis canina (PER-INF-HEM-004) y Babesiosis (GEN-HEM-020) → Hemoparásitos (PER-INF-HEM-003), en un bloque antes de `const ST`. Los códigos equivalentes cuentan como contemplados por el motor (`MOTOR_C`) y como acierto en los indicadores del registro.
- No cambia ningún diagnóstico ni puntaje. MC-7DLPEQ pasa de «fuera del catálogo» a 6.º lugar en los indicadores; con el 4Dx del cierre, Hemoparásitos queda 1.º.
- `MOTOR_BUILD` pasa a `2026-11-26a`; `MOTOR_VER` no cambia.

### Verificación
- Sintaxis: `node --check` del script, OK.
- 203 casos del registro: misma lista completa de diagnósticos con puntajes y misma lista de alta probabilidad; `regDatosCierre` sin diferencias. Solo cambia el indicador de MC-7DLPEQ.
- 1200 casos generados desde las reglas de cada diagnóstico: 0 diferencias en el top-5, la lista de alta y las alertas. Sin errores de página.

## v7.9.7 · 25/11/2026 11:40 · aviso de base de confirmación sin resultado (M10)

Origen: análisis del registro del 25/11 a las 10:43 (153 casos y 72 cierres). Aprobado por la Dirección General como aviso no bloqueante. Casos de origen: MC-4EAY72, MC-CUTRND, MC-CFCABE, MC-PY3M3H, MC-PS4XJ2 y MC-XVPFSA (base «imagen» sin ningún examen de imagen); MC-782BSM, MC-2TVB5F, MC-HJURA4, MC-DC4FQ4 y MC-PWTG2Z (base «laboratorio» sin valores ni pruebas).

- Evidencia: 9 de 23 cierres por imagen no tenían ningún examen de imagen registrado y 5 de 21 por laboratorio no tenían valores ni pruebas. M9 no lo detecta porque solo actúa cuando hay un examen marcado como anormal.
- Al guardar un cierre con base «Imagen diagnóstica» (en `conf` o `conf2`) sin ecografía, radiografía (tórax, abdomen, cabeza o cadera), T-FAST ni A-FAST, o con base «Prueba de laboratorio específica» sin ningún valor (lactato, glucosa, Hto, PT, BUN, creatinina, Na, K) ni prueba (SNAP parvo, 4Dx, FeLV/FIV, frotis, autoaglutinación, urianálisis), aparece el aviso «Falta el resultado que confirma el diagnóstico» con «Registrar el resultado» (lleva a los exámenes) o «Guardar sin el resultado».
- El texto de «Otros resultados» cuenta como resultado, para exámenes que no están en la lista. No aplica a cierres «Sin diagnóstico definitivo» ni a las demás bases.
- `MOTOR_BUILD` pasa a `2026-11-25a`; `MOTOR_VER` no cambia.

### Verificación
- Sintaxis: `node --check` del script, OK.
- 153 casos del registro: misma lista de alta probabilidad y mismo top-5 con puntajes; `regDatosCierre` sin diferencias.
- 1200 casos generados desde las reglas de cada diagnóstico: 0 diferencias en la lista de alta y el top-5.
- Interfaz: 11 combinaciones de base y resultados. Avisa solo cuando falta el resultado de la base marcada. «Guardar sin el resultado» guarda una vez. El mensaje de M9 (hallazgo principal) sigue apareciendo cuando corresponde. Sin errores de página.

## v7.9.7 · 24/11/2026 17:30 · compilación en el registro (M8) y hallazgo principal obligatorio (M9)

Origen: análisis del registro del 24/11 a las 16:45 (136 casos y 56 cierres). Aprobado por la Dirección General (M8 y M9). Casos de origen: MC-BANPER y MC-UTMWVG (registrados como 7.9.7 antes de cambios que conservaron ese número); MC-X2GR63, MC-A2DMYT y MC-NT9M5R (cierres posteriores a la publicación de las 12:03 sin hallazgo específico); MC-66VRWU, MC-8G2VKH, MC-QUN38H, MC-6D7SX3 y MC-QGHRT2 (hallazgo de la eco no ingresado).

### Compilación (M8)
- Constante `MOTOR_BUILD` (hoy `2026-11-24b`, fecha y letra). Se actualiza en cada publicación; `MOTOR_VER` no cambia.
- Cada caso guarda `v` como «7.9.7+2026-11-24b». Se usa ese campo porque `registrar_caso` guarda `sal` campo por campo y descartaría un campo nuevo dentro de `sal`; no requiere migración (`version_motor` admite 20 caracteres).
- Excel: «Versión motor» muestra solo 7.9.7 y la columna nueva «Compilación» muestra la etiqueta (vacía en casos anteriores). Explicadas en «Diccionario». Un caso nuevo con compilación vieja = tableta con caché.

### Hallazgo principal obligatorio (M9)
- Evidencia: 0 de 26 resultados anormales o positivos con hallazgo en todo el registro, 0 de 3 desde la publicación de M1.
- Con ecografía, radiografía de tórax o de abdomen, T-FAST o urianálisis «Anormal», o 4Dx «Positivo», el cierre no se guarda sin «Hallazgo principal»; el renglón se marca «(obligatorio)». Nueva opción «No determinado» (`<examen>_h:"nd"`), que no se envía al motor en `regDatosCierre`.

### Verificación
- Sintaxis: `node --check` del script, OK.
- 136 casos del registro: misma lista de alta probabilidad y mismo top-5 con puntajes; `regDatosCierre` sin diferencias.
- 1200 casos generados desde las reglas de cada diagnóstico: 0 diferencias en la lista de alta y el top-5.
- Cierre con eco anormal y 4Dx positivo sin hallazgo: bloqueado con mensaje; con hallazgo o «No determinado»: pasa.

## v7.9.7 · 24/11/2026 · indicadores: «¿Dónde quedó el diagnóstico del médico?»

- La tabla de acierto (top-1, top-3, SOAP y top-3 con los datos del cierre, con IC95 en cada celda) se reemplaza por una tabla de posiciones: en 1.er lugar, en 2.º o 3.er lugar, fuera de los 3 primeros y total, con casos y %, para todos los casos y para los de confirmación objetiva.
- Encima, una frase automática y una barra apilada (verde, azul claro y gris). Debajo, notas con la coincidencia de la SOAP, el rango probable (IC 95 %) y, cuando difiere, el top-3 con los datos del cierre.

## v7.9.7 · 24/11/2026 · urolitiasis vesical o sedimento urinario felino (M7)

Origen: caso MC-AMXZ4N (gata esterilizada con sedimento urinario). En gatos el motor solo tenía obstrucción uretral, cistitis idiopática e infección urinaria; el sedimento o los urolitos vesicales no tenían diagnóstico propio. Aprobado por la Dirección General con un solo caso.

- Diagnóstico nuevo, solo gatos: «Urolitiasis vesical o sedimento urinario felino (cristaluria)» (GEN-URI-335). Entra con esfuerzo para orinar o hematuria.
- Suma: cristales de estruvita u oxalato en el sedimento (+30), ecografía con sedimento o urolitos vesicales (+30), hembra (+10), obstrucción urinaria previa (+10), vejiga distendida (+5), sobrepeso (+5). Sin cristales: −10. Sin cristales ni hallazgo vesical en la ecografía: −20.
- Exámenes: examen general de orina y ecografía abdominal (inmediatos), urocultivo y radiografía. Tratamiento: analgesia, más agua y manejo ambiental, dieta de disolución (estruvita) o cistotomía, antibiótico solo con urocultivo positivo; si no puede orinar, tratar como obstrucción uretral.
- Resultados: MC-AMXZ4N (vejiga distendida) sigue con obstrucción uretral 1.ª y urolitiasis 3.ª; con estruvita o sedimento en la eco, urolitiasis pasa a 1.ª. En machos con vejiga distendida la obstrucción no cambia.
- Regresión: 127 casos del registro con la misma lista de alta probabilidad (1 caso cambia en el top-5); 1000 casos generados: 7 listas distintas, todas gatos con cristales o hallazgo vesical en la eco.

## v7.9.7 · 24/11/2026 · cierre con hallazgos específicos, cierre obligatorio, condición corporal y buscador

Origen: análisis del registro del 24/11 (127 casos, 57 cierres). Aprobado por la Dirección General (M1, M2, M3, M5 y M6). No cambia ningún diagnóstico ni puntaje: 127 casos del registro y 1000 casos generados desde las reglas de cada diagnóstico dan la misma lista de alta probabilidad y el mismo top-5.

### Cierre: hallazgo específico de los exámenes (M1)
- Evidencia: 8 de 10 cierres con imagen «anormal» sin el hallazgo, 16 de 18 resultados de 4Dx y los 4 cierres con laboratorio sin esos datos en el caso. En los 3 casos en que el motor puso primero la pancreatitis (piometra, colangitis y barro biliar confirmados por eco), con el hallazgo de la eco el diagnóstico real sube al 1.er o 2.º lugar.
- Al marcar «Anormal» en ecografía abdominal, radiografía de tórax o de abdomen, T-FAST o urianálisis, o «Positivo» en 4Dx, aparece «Hallazgo principal» con las opciones de la pregunta equivalente del motor (`eco`, `tfast`, `snap4`, `crist`).
- Se guarda aparte en `tests` como `<examen>_h` (p. ej., `eco:"anormal"`, `eco_h:"utero"`); el valor general no cambia, así que la base de datos, `importar_registro.mjs` y la retroalimentación siguen funcionando igual. El Excel agrega la columna «Hallazgos específicos».
- Indicadores: fila «Top-3 con los datos del cierre». Los casos cuyo cierre trae resultados no ingresados (4Dx, parvovirus, ecografía, T-FAST o Rx, autoaglutinación, cristales, creatinina, hematocrito, glucosa y Na/K) se reproducen en el motor actual con esas respuestas; los demás conservan su posición original.

### Cierre obligatorio y sugerencia de código (M2)
- No se guarda un cierre sin diagnóstico (ni «Sin diagnóstico definitivo») y sin ningún resultado (había 8 de 57). Con resultados pero sin diagnóstico, se pide confirmar y el caso sigue pendiente.
- «No está en VetCIE-1»: antes de aceptar un diagnóstico escrito a mano se sugieren las coincidencias de VetCIE-1 (p. ej., «dirofilaria» → Dirofilariasis GEN-PAR-190).

### Aviso de condición corporal (M3)
- Con los datos obligatorios completos y sin condición corporal, un aviso (no bloqueante) antes de la nota SOAP: «Registrar la condición corporal» o «Generar sin la condición corporal». Faltó en 6 de 15 casos nuevos.

### Equivalencia de códigos en los indicadores (M5)
- «Fractura de cadera» (GEN-ORT-043) cuenta como «Fractura o luxación» (GEN-TRA-480) (caso MC-STJQB4). Los códigos equivalentes ya no aparecen como «fuera del motor» (también la bronconeumonía, GEN-RES-025).

### Sinónimos en el buscador VetCIE-1 del cierre (M6)
- «colecistitis» y «mucocele» encuentran Barro biliar (GEN-HEP-023); «sedimento urinario», «cristaluria» y «arenilla» encuentran Urolitiasis vesical (GEN-URI-335) y FLUTD (FEL-URI-MET-035). Solo amplían la búsqueda: el catálogo y los códigos no cambian (caso MC-AMXZ4N).

## v7.9.7 · 19/11/2026 · actualización de la lógica clínica

Origen: `HVCP_ER_Motor_Clinico_v7_9_6.html` actualizado por el hospital (19/11/2026). Se integró sobre el motor con registro en línea. Pruebas: 240 casos idénticos al HTML entregado (diagnósticos, puntajes, alertas, paneles y nota SOAP).

### Estado hemodinámico efectivo
- El motor compara el estado hemodinámico marcado con las constantes: FC, mucosas, TLLC, pulso y PAS.
- Si se marcó shock y las constantes son normales, analiza al paciente como **estable**. Si se marcó estable o no se marcó, pero hay al menos dos signos de shock, lo analiza como **compensado** o **descompensado**.
- Una alerta avisa del ajuste. La nota SOAP indica el estado marcado y con qué estado se analizó.
- Afecta los diagnósticos, la fluidoterapia (bolos), las contraindicaciones de los AINE y la detección de bradicardia.

### Oliguria: obstructiva o renal
- Pregunta nueva: «¿Intenta orinar y no puede, o casi no produce orina?».
- Con esfuerzo sin resultado, suma a urolitiasis, obstrucción uretral, HPB, prostatitis y retención.
- Con oliguria sin esfuerzo, suma a IRA, ERC y leptospirosis, y resta a las causas obstructivas.
- Oliguria con esfuerzo o vejiga grande se registra también como estranguria.
- La pregunta de próstata también aparece con oliguria y tiene un texto de ayuda nuevo.

### Nota SOAP
- Ya no muestra el código VetCIE-1 junto a cada diagnóstico presuntivo ni el código de laboratorio junto a cada examen.

### Cuadros respiratorios (caso MC-BANPER)
- Antecedentes nuevos: «Enfermedad respiratoria previa o tos crónica» y «Colapso traqueal o bronquitis crónica conocidos».
- Neumonía: suma con antecedente respiratorio (+15) y con leucocitosis (+20). La pregunta de leucocitos aparece también con disnea o respiración rápida.
- Edema cardiogénico (ICC): resta 15 sin cardiopatía ni soplo conocidos.
- Taponamiento: resta 25 con crepitaciones o sibilancias. Shock hipovolémico: resta 15 con hallazgos pulmonares.
- «¿Cómo se alimenta?» solo aparece en menores de 6 meses.
- Registro: «Bronconeumonía» (GEN-RES-025) cuenta como «Neumonía bacteriana / por aspiración» (GEN-RES-166) en los aciertos.

### Guía rápida de auscultación pulmonar
- Recuadro desplegable justo debajo de «Auscultación pulmonar»: qué opción marcar según el tipo de estertor y a qué orienta, más la localización. La pregunta «¿Auscultación torácica?» tiene la misma ayuda resumida.

### Cierre de casos: dos bases de confirmación, más radiografías y diagnóstico del médico en la lista
- «Base de la confirmación» admite hasta 2 opciones (se guardan en `conf` y `conf2`); la confirmación cuenta como objetiva si cualquiera de las dos lo es. El Excel exportado muestra ambas («Prueba de laboratorio específica + Imagen diagnóstica»).
- Exámenes del cierre: se agregan radiografía de abdomen (`rxa`), de cabeza (`rxcab`) y de cadera (`rxcad`), además de la de tórax.
- En la lista del registro, los casos cerrados muestran el diagnóstico definitivo del médico (o «Sin diagnóstico definitivo»); los pendientes siguen mostrando el presuntivo del motor.

### Aliento urémico, deshidratación obligatoria y ajustes por el registro del 23/11
- Signo nuevo «Aliento urémico (olor a orina o amoníaco)»; junto con las úlceras orales aparece en los motivos de decaimiento, vómito o diarrea, metabólico y urinario. Suma a ERC agudizada, IRA y estomatitis urémica, y genera la alerta «Aliento urémico: medir creatinina» si no hay creatinina ingresada.
- Signo nuevo «Inflamación o aumento de volumen (cara, miembros o cuerpo)» en trauma, dolor y piel; suma a politrauma, fractura, mordedura y absceso.
- Pancreatitis baja 25 puntos si la ecografía muestra otra causa (vesícula, útero, cuerpo extraño o vejiga).
- El aviso de FC y FR iguales (o intercambiadas) también aparece debajo de las constantes.
- El % de deshidratación pasa a ser dato obligatorio («< 5%» cuenta como respondido).
- Fecha y hora debajo del título de la página principal.
- Mensaje «Información guardada» al guardar el cierre del caso.

### Nota SOAP según la práctica del hospital, ascitis y lipidosis
- SOAP: «A — Análisis» lleva la interpretación de los exámenes ingresados, el diagnóstico presuntivo y los exámenes por realizar; «P — Plan» lleva fluidoterapia, tratamiento y líneas para completar procedimientos realizados, hospitalización o alta y lo explicado al propietario.
- El buscador del diagnóstico definitivo también busca en los sinónimos (p. ej., «esteatosis hepática» o «hígado graso» encuentran Lipidosis hepática felina).
- Signo nuevo «Ascitis o líquido libre abdominal» (motivos de dolor o distensión abdominal y de decaimiento); suma a PIF efusiva, uroabdomen, hemoabdomen, peritonitis y hepatopatía.
- Antecedente nuevo «Tratamiento prolongado reciente (antibióticos u otros)».
- Lipidosis hepática felina: más peso a la anorexia prolongada, la obesidad y el tratamiento prolongado reciente. Addison baja más en gatos.

### Ajustes por el registro del 21/11
- Registro: los filtros muestran la cantidad en «Pendientes», «Cerrados» y «Todos».
- Bradicardia felina por debajo de 120 lpm (160 en shock); antes 140.
- Avisos «¿Intercambió FC y FR?» (FC < 40 con FR > 60) y «FC y FR iguales».
- La retención urinaria neurogénica exige un signo urinario (esfuerzo sin resultado, poca orina, goteo o vejiga distendida); con paresia sola sube la IVDD.
- Pregunta nueva «¿Desde cuándo tose?» y diagnóstico bronquitis crónica canina (GEN-RES-384).
- Opción de ecografía «Vesícula con barro, mucocele o pared engrosada» y diagnóstico barro biliar, mucocele o colecistitis (GEN-HEP-023).

### Reevaluaciones, aviso de FR y motivo ocular
- Casilla «Reevaluación de un paciente ya registrado» (con el código anterior opcional): genera la nota SOAP pero no crea un caso nuevo, para no duplicar pacientes en el registro.
- Aviso «Verifique la FR» cuando la FR pasa de 100 rpm y no hay FC registrada.
- Con el motivo «Problema en los ojos», los diagnósticos oculares suman 20 puntos.
- scripts/Registro_MC_a_Drive.gs: Google Apps Script que copia cada hora el registro en línea a una hoja de Google y a un .xlsx en Drive.

### Descarga vulvar, muerte y maceración fetal, muela carnicera y SOAP sin caracteres especiales
- La nota SOAP ya no incluye «/», «&» ni comillas: las fechas usan guiones, las fracciones «de», las unidades «por» (mg por kg) y las alternativas «o».
- Preguntas nuevas en hembras: tipo de descarga vulvar, gestación o parto reciente y días desde la monta; opción nueva en ecografía «Fetos sin latido o gas en útero o fetos».
- Diagnósticos nuevos: muerte fetal (GEN-REP-505) y maceración fetal (GEN-REP-506), códigos nuevos en el clasificador, y metritis posparto (GEN-REP-343). Piometra y distocia usan el tipo de descarga.
- Signo nuevo «Fístula o herida que drena debajo del ojo (maxilar)» y diagnóstico absceso del cuarto premolar superior, muela carnicera (GEN-DEN-507, código nuevo).

### Aviso visible de datos obligatorios
- Auscultación cardíaca y pulmonar pasan a ser obligatorias (no se exigen en paro).
- Al elegir el motivo de consulta con datos obligatorios pendientes se abre un cuadro con la lista de lo que falta: «Completar datos» lleva al primer campo pendiente; «Elegir motivo de todos modos» permite continuar en una urgencia.
- Si se intenta generar la nota SOAP sin esos datos aparece el cuadro «No se generó la nota SOAP» con la lista de faltantes; la nota no se genera ni se registra el caso.

### Motivo «Dolor», «Piel y herida» y coherencia con el motivo
- Motivo nuevo «Dolor (miembro, columna o abdomen)» con el grupo de signos «Dolor y aparato locomotor»: cojera o dolor en un miembro, no apoya un miembro, articulación inflamada o caliente, se queja o agrede al tocarlo, además de dolor de columna, abdominal, paresia y parálisis aguda de posteriores.
- Preguntas nuevas: dónde está el dolor y cómo comenzó.
- Diagnósticos nuevos: ruptura de ligamento cruzado craneal (GEN-MUS-504, código nuevo en el clasificador), artrosis (GEN-MUS-016), osteosarcoma (GEN-NEO-378), poliartritis (GEN-MUS-252) y artritis séptica (GEN-MUS-330). Fractura, IVDD y tromboembolismo felino usan las preguntas nuevas.
- «Herida, piel o dolor» pasa a llamarse «Piel y herida» y ya no incluye los signos de dolor.
- La condición corporal 2/5 ya no se registra sola como «Pérdida de peso» (solo la 1/5); la pérdida de peso referida la marca el médico.
- Coherencia con el motivo: un diagnóstico de otro sistema que solo se apoya en signos generales (fiebre, pérdida de peso, letargo, anorexia, linfonodos, hipotermia, respiración rápida) baja al 60 % de su puntaje. No aplica a sepsis, shock, anafilaxia, golpe de calor, politrauma ni a diagnósticos cardiovasculares con el paciente en shock.

### Piel, trauma y signos desplegables
- El motivo «Trauma, herida o dolor» se separa en «Trauma (atropello, caída, golpe o pelea)» y «Herida, piel o dolor».
- Grupo nuevo de signos «Piel y tejido subcutáneo»: bulto bajo la piel, secreción purulenta o fístula, larvas en una herida, prurito, erupción, alopecia y arrastre o lamido anal; «Herida o mordedura» pasa a este grupo.
- Preguntas nuevas: cómo es el aumento de volumen, pelea o mordedura reciente y dónde están las lesiones de piel.
- Diagnósticos nuevos (códigos del clasificador): absceso subcutáneo o por mordedura (GEN-TRA-436), absceso o saculitis de sacos anales (GEN-DER-176), dermatitis alérgica por pulgas (GEN-DER-440), sarna sarcóptica (GEN-DER-058), pioderma (GEN-DER-155), dermatitis alérgica (GEN-DER-034), dermatofitosis (GEN-DER-327) y miasis cutánea (GEN-DER-348). Edema súbito en cara suma a anafilaxia.
- «Otros signos por sistema» y cada grupo se despliegan con una flecha azul y el texto «Ver signos / Ocultar».

### Datos obligatorios y botón de información
- Obligatorios (asterisco rojo): especie, edad, sexo, vacunación, FC, FR, temperatura, color de mucosas y TLLC. Sin ellos no se genera la nota SOAP ni se registra el caso; el motor los marca en rojo y los lista en «Alertas de triaje». En paro (RCP) no se exigen las constantes.
- Valores imposibles (FC fuera de 20–350 lpm, FR fuera de 4–150 rpm, temperatura fuera de 30–44 °C): alerta roja; el valor no se usa en el análisis ni permite generar la SOAP.
- Ícono «i» junto a cada campo del paciente y del examen físico: abre un cuadro breve con el significado y los valores de referencia.

### Registro en línea
- Columna nueva `hemo_efectivo` (migración `20261119000500_hemo_efectivo.sql`). Guarda el estado con el que el motor analizó al paciente. `hemo` sigue siendo el que marcó el médico.
- En el panel del administrador, la ficha muestra «Analizado como …» cuando los dos estados difieren. El Excel tiene la columna «Estado hemodinámico analizado».
- Los casos registrados antes de aplicar la migración no tienen este dato.
