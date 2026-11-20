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

### Cuadros respiratorios (caso MC-BANPER)
- Antecedentes nuevos: «Enfermedad respiratoria previa o tos crónica» y «Colapso traqueal o bronquitis crónica conocidos».
- Neumonía: suma con antecedente respiratorio (+15) y con leucocitosis (+20). La pregunta de leucocitos aparece también con disnea o respiración rápida.
- Edema cardiogénico (ICC): resta 15 sin cardiopatía ni soplo conocidos.
- Taponamiento: resta 25 con crepitaciones o sibilancias. Shock hipovolémico: resta 15 con hallazgos pulmonares.
- «¿Cómo se alimenta?» solo aparece en menores de 6 meses.
- Registro: «Bronconeumonía» (GEN-RES-025) cuenta como «Neumonía bacteriana / por aspiración» (GEN-RES-166) en los aciertos.

### Guía rápida de auscultación pulmonar
- Recuadro desplegable justo debajo de «Auscultación pulmonar»: qué opción marcar según el tipo de estertor y a qué orienta, más la localización. La pregunta «¿Auscultación torácica?» tiene la misma ayuda resumida.

### Datos obligatorios y botón de información
- Obligatorios (asterisco rojo): especie, edad, sexo, vacunación, FC, FR, temperatura, color de mucosas y TLLC. Sin ellos no se genera la nota SOAP ni se registra el caso; el motor los marca en rojo y los lista en «Alertas de triaje». En paro (RCP) no se exigen las constantes.
- Valores imposibles (FC fuera de 20–350 lpm, FR fuera de 4–150 rpm, temperatura fuera de 30–44 °C): alerta roja; el valor no se usa en el análisis ni permite generar la SOAP.
- Ícono «i» junto a cada campo del paciente y del examen físico: abre un cuadro breve con el significado y los valores de referencia.

### Registro en línea
- Columna nueva `hemo_efectivo` (migración `20261119000500_hemo_efectivo.sql`). Guarda el estado con el que el motor analizó al paciente. `hemo` sigue siendo el que marcó el médico.
- En el panel del administrador, la ficha muestra «Analizado como …» cuando los dos estados difieren. El Excel tiene la columna «Estado hemodinámico analizado».
- Los casos registrados antes de aplicar la migración no tienen este dato.
