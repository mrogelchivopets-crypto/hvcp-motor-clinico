# Historial de cambios del Motor Clínico

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
