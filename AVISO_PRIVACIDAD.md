# Aviso de privacidad · Motor Clínico de Urgencias HVCP v7.9.7 · registro en línea

**Responsable:** Hospital Veterinario Chivo Pets, Dirección General.
**Última actualización:** 17 de noviembre de 2026.

El Motor Clínico es una herramienta de **apoyo a la decisión clínica** para el área de urgencias del hospital. No sustituye el criterio del médico veterinario. Este aviso explica qué datos guarda el registro en línea, para qué se usan y quién los puede ver.

## 1. Lo que NO se guarda

El registro **no guarda datos del propietario ni del expediente**:
- nombre;
- teléfono;
- dirección;
- correo;
- documento de identidad;
- número de expediente;
- cualquier otro dato que identifique a una persona.

El código del caso (por ejemplo `MC-7K3PQ2`) es aleatorio y solo conecta la nota SOAP del expediente con el registro.

Los campos de texto libre del cierre («Otros resultados» y «Notas clínicas») son para información clínica. **No escriba ahí nombres ni datos del propietario.**

## 2. Lo que sí se guarda

| Dato | Ejemplo | Para qué |
|---|---|---|
| Datos clínicos del paciente animal | Especie, edad, sexo, peso, estado hemodinámico, constantes del examen físico, motivo, signos, respuestas, antecedentes y vacunación | Reproducir la evaluación del motor y medir su desempeño |
| Resultado del motor | Diagnósticos presuntivos con su puntaje, alertas, diagnósticos usados en la nota SOAP | Indicadores de acierto del motor |
| Cierre del caso | Diagnóstico definitivo (VetCIE-1), base de la confirmación, exámenes clave, notas clínicas | Comparar el presuntivo con el definitivo |
| Datos de uso | Fecha y hora del caso, minutos hasta la nota SOAP, inicio y última actividad de la sesión, eventos (copiar nota, nuevo paciente, abrir un caso por código, exportar) | Conocer el uso por día y turno, y mejorar el servicio |
| Identificador anónimo del dispositivo | Un número aleatorio y una descripción resumida como «Android · Chrome» | Agrupar los casos por dispositivo («Veterinario: Anónimo · disp. 3F9A») y evitar abusos |
| Cuenta de administración | Correo y nombre de quien administra | Acceso a la lista de casos, los indicadores y el Excel |

Los médicos usan el motor **sin cuenta**: no se pide ni se guarda su nombre.

## 3. Quién puede ver el registro

- **Solo la cuenta de administración** del hospital puede ver la lista de casos, los indicadores y el Excel.
- Los médicos **no ven el historial**, ni siquiera el de su propio dispositivo. Solo pueden abrir un caso si escriben su código MC exacto, para registrar el cierre.
- El acceso se controla en la base de datos con seguridad a nivel de fila (RLS). No depende de ocultar botones en la pantalla.
- **Nadie borra registros.** El administrador puede *anular* un caso, por ejemplo uno duplicado. El caso deja de contarse, pero queda constancia de quién lo anuló, cuándo y por qué. Los cambios de cada cierre quedan en un historial.

## 4. Dónde se guarda

- **En la nube:** en Supabase (base de datos Postgres) y en servidores de la región *East US*, en los Estados Unidos. Como cualquier servicio en internet, Supabase registra datos técnicos de conexión, como la dirección IP, por un tiempo limitado y para seguridad. El hospital no usa esos registros para identificar a nadie.
- **En el dispositivo del médico:** quedan la sesión anónima y, mientras no haya conexión, los casos pendientes de enviar, en el almacenamiento del navegador. Al sincronizarse, la cola se vacía.
- **La página del motor:** se publica en GitHub Pages. El motor no usa cookies de publicidad ni herramientas de rastreo.

## 5. Para qué se usan los datos

1. Control de calidad del área de urgencias: casos por día y turno, casos cerrados y abiertos, tiempo hasta la nota SOAP.
2. Medir y mejorar el motor clínico: acierto en el primer lugar y en el top 3, y los diagnósticos más frecuentes.
3. Docencia e investigación interna, con datos agregados o sin identificar.

Los casos marcados **«No registrar (prueba o docencia)»** se guardan marcados como prueba y **no** cuentan en los indicadores.

## 6. Conservación

Los datos se conservan mientras el hospital use el motor, para medir su desempeño a lo largo del tiempo. Si la Dirección decide cerrar el registro, puede exportar los datos y eliminar el proyecto completo.

## 7. Contacto

Para dudas sobre este aviso o sobre el uso de los datos, escriba a la Dirección General del Hospital Veterinario Chivo Pets.
