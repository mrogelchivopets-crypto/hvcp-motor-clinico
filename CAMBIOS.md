# Historial de cambios del Motor Clínico

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

### Pendiente
- El registro en línea todavía no guarda el estado hemodinámico efectivo, solo el marcado. Guardarlo requiere un cambio en la base de Supabase.
