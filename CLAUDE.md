# Motor Clínico HVCP — reglas para Claude Code

## Fuente única: GitHub (rama `main`)
- Este repositorio es la única copia oficial del motor. Los médicos usan `index.html` publicado en **GitHub Pages** con registro en línea (Supabase): **cada push a `main` lo publica**.
- La página artifact de claude.ai (3v6EcUKGsCDDwx68dxD8Dv) ya no se usa ni se actualiza.
- Una tarea programada en la nube (10:35 y 16:35, hora de El Salvador) clona este repositorio, analiza el registro y, con autorización de la Dirección General, sube cambios a `main`. Por eso la carpeta local puede quedar atrasada.

## Antes de trabajar
1. `git pull --ff-only origin main` (si falla por cambios locales: `git stash`, `git pull --ff-only`, `git stash pop` y resolver).
2. Leer las primeras secciones de `CAMBIOS.md` para saber qué cambió y qué casos ya se atendieron.
3. Los scripts que usan el motor (`scripts/retroalimentacion.mjs`, reportes, tablero) deben correr sobre el `index.html` ya actualizado.

## Al terminar un cambio del motor
1. Solo cambios autorizados por la Dirección General.
2. No cambiar el nombre ni `MC_VERSION` (hoy 8.0) salvo indicación expresa. Actualizar `MC_BUILD` (fecha y letra, p. ej. `2026-11-27a`) y `version.json` con los mismos valores: «Nuevo paciente» lo compara para actualizar los dispositivos. `MOTOR_VER` y `MOTOR_BUILD` son alias; no editarlos.
3. Ajustes de reglas o pesos: bloque IIFE antes de `const ST = {`.
4. Verificar: `node --check` del script inline, reproducción de todos los casos del registro antes/después y `tests/equivalencia.spec.js` (≥ 800 casos) comparando top-5, lista de alta probabilidad y alertas.
5. Agregar una sección al inicio de `CAMBIOS.md` con fecha, hora, propuesta (M#) y los códigos de caso que la originaron.
6. `git pull --rebase origin main`, commit y `git push origin main`.

## Reglas fijas
- Los médicos son anónimos: identificar por código de caso (MC-…) o dispositivo.
- Nunca copiar datos de propietarios. No subir `.env` ni claves (solo la publishable key de `config.js`).
- Los archivos de OneDrive («Registro del motor») son salidas de la exportación: no editarlos a mano.
