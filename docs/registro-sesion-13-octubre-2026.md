# Registro de la sesión del 13-14/10/2026 (Opus 5.5)

Christian pidió un panel nuevo en Supervisión para analizar los **resultados de actividad** (la
tipificación que el agente pone en el script) por agente, campaña y fecha. Para cada agente
quería dos ratios:

- **Ratio bruto**: éxitos sobre el total de finalizados.
- **Ratio neto**: éxitos sin contar los contactos «no válidos».

Las demás vistas las dejó a recomendación. Pidió que se le preguntara cualquier duda y que no se
diera nada por hecho.

Resultado: pestaña «Resultados» en Supervisión y página `/admin/resultados`, verificadas contra
RDBv2 real. **Sin commit ni despliegue** al cerrar la sesión. El detalle técnico está en la
regla 18 de CLAUDE.md; aquí van el hilo, las decisiones, las cifras y las incidencias.

## Commits

Ninguno. Todo está en la copia de trabajo de `master`:

- **Ficheros nuevos**:
  - `src/lib/resultados-actividad.ts` y `src/lib/resultados-actividad.test.ts`
  - `src/lib/rdb/queries/resultados-actividad.ts`
  - `src/lib/db/resultados.ts`
  - `src/components/kpi/resultados-actividad.tsx`
  - `src/app/(dashboard)/supervision/panel-resultados.tsx`
  - `src/app/(dashboard)/admin/resultados/{page.tsx,acciones.ts}`
  - `drizzle/0007_ambiguous_black_panther.sql` y su snapshot
- **Ficheros modificados**:
  - Supervisión: `page.tsx` y `tabs-supervision.tsx`.
  - Esquema SQLite, tipos de RDBv2, enumerados de respaldo y mock.
  - `GraficaLineas` (línea discontinua y líneas de objetivo) y `TarjetaKpi` (`extra`).
  - `SelectorServicio` (`obligatorio`).
  - Glosario, auditoría (`config_resultados`), mensajes del admin y menú del admin.
  - CLAUDE.md.

(`31f638a` y `ecae120`, de la mañana del 13/10, son de otra sesión: Dirección ve también
Operaciones y Supervisión.)

## Decisiones de Christian

| Tema | Decisión |
| --- | --- |
| Ratio neto | Éxitos ÷ (finalizados − no válidos) |
| Qué es «finalizado» | Contacto (lead) cerrado: `activity.status = 3`, fechado por su último evento, como en facturación |
| Cerrados sin que hablara ningún agente | Fuera de los ratios; se enseñan aparte como dato de campaña |
| Agente y fecha de cada contacto | Agente de la última sesión tipificada; fecha del cierre |
| Qué es «no válido» | Configurable por servicio en `/admin`, para **todos** los servicios |
| Vistas además de «por agente» | Desglose de resultados, agente frente a su campaña y evolución por fecha. Sin export |
| Objetivos | Semáforo configurable en el dashboard (SQLite), no leído de `RATIOS_RF` |
| Al día siguiente (14/10) | La pestaña tarda mucho: **siempre con un cliente elegido**, sin «Todos» |

Al presentar las opciones se le enseñaron cifras reales de GH de septiembre para cada una (por
ejemplo, el neto saldría 46,33 % quitando solo los no válidos, o 54,57 % quitando también los
ilocalizables).

## Lo que se hizo

### 1. Exploración de RDBv2 (solo `SELECT`)

En el código no había nada de la tipificación. Con consultas de solo lectura se encontró dónde
está:

- **Tablas `ao_<servicio>`.** Una por servicio, con columnas propias.
  - Se enlazan con la sesión así: `script_session.code = ph_activity_outcome.script_session` y
    `ph_activity_outcome.code = ao.easycode`.
  - El texto de cada código sale de `ph_table_schema_enum_value.code`, que es único en toda la
    instalación.
  - Qué tabla es de qué servicio lo dice `table_schema` (`ts_type = 3`).
- **Columnas de cada servicio.** Cada uno usa las suyas:
  - GH: `resultado`/`subresultado`.
  - UGR: `resultado_egr`/`motivo_egr` (la campaña EGRE26).
  - Bolsas y Socios: `call_type`.
  - Ávolo: `motllamada`.
- **El «no válido» se llama distinto** según el servicio: «No valido», «Invalido», «Nulo»,
  «Telefono erroneo»…
- **`RATIOS_RF`** (tabla de RDBv2 que mantiene alguien) ya tiene objetivos de GH: «Ratio Aprove
  Bruto» > 30 y «Ratio Aprove Neto» > 70.
- **Vistas `v_*_ResultadosActividad`.** Existen, pero el usuario de solo lectura no puede ver
  su definición.

### 2. Consulta (`queries/resultados-actividad.ts`)

Una sola consulta para todos los servicios, con tres pasos y tablas temporales en tempdb:

1. **`#cerr`**: los contactos cerrados en el rango.
2. **`#ses`**: la última sesión de agente de cada contacto, en los 90 días anteriores a su
   cierre. Si alguna tiene fila en `ao`, manda esa.
3. **Agrupado final.** Saca la categoría de cada contacto (tipificado, sin tocar o cierre
   administrativo), los códigos de los niveles configurados, el éxito y el «no válido». Agrupa
   por día de cierre, campaña y agente.
   - Lleva un `LEFT JOIN` por cada tabla `ao_*` configurada y un `COALESCE` por nivel.
   - Funciona porque `easycode` solo casa con una de las tablas.

Los nombres de tabla y columna no admiten parámetros. Solo se aceptan los que salen de
`tablasResultados()` (lista blanca desde `table_schema` + `INFORMATION_SCHEMA`, columnas
enteras), y van entre corchetes. Los códigos sí van como parámetros.

### 3. Cálculo puro y tests (`lib/resultados-actividad.ts`)

- Ratios por agente (con su detalle por campaña) y por campaña.
- Desglose resultado → subresultado del servicio entero o de una campaña.
- Comparación de cada agente con el RESTO de su campaña. Se marca cuando el % de no válidos o
  el de algún resultado se separa 10 puntos o más, con 30 finalizados o más.
- Evolución por día, y por semana ISO a partir de 62 días.
- Semáforo:
  - Va contra el objetivo de la campaña o, si no tiene, el de su servicio, con vigencia por
    fechas.
  - Verde si cumple, ámbar si se queda a menos del 10 % y rojo si no llega.
  - Sin color con muestra pequeña.
- 15 tests, entre ellos el caso real de GH de septiembre a escala.

### 4. Pantallas

- **Supervisión → «Resultados»** (`?vista=resultados`):
  - Por defecto, el mes en curso.
  - Cuatro tarjetas: finalizados, bruto, neto y % de no válidos.
  - Cinco pestañas: por agente, por campaña, desglose, agente frente a campaña y evolución.
  - La gráfica valida su paleta para daltonismo y lleva la línea de no válidos discontinua y
    una tabla de datos.
- **`/admin/resultados`** (solo admin):
  - Por servicio, se eligen las columnas (niveles) y se marcan los valores «no válidos», viendo
    cuántas veces se ha usado cada uno.
  - Vista previa con las cifras del mes anterior.
  - Objetivos del semáforo.
  - Cada cambio queda en `audit_log` (`config_resultados`).
- **Glosario**: nueve términos nuevos en lenguaje sencillo.

### 5. Siempre por cliente y arreglo de la lentitud (14/10)

Christian lo probó en local y la pestaña tardaba mucho.

- **Siempre con cliente.** El selector de esa pestaña ya no tiene «Todos». Sin cliente no se
  consulta nada: sale «Elige un cliente» con un botón por cliente.
- **La causa real.** No era ver todos los clientes: el paso 2 se pasaba de 120 s con el mes en
  curso, incluso solo con GH. Detalle en «Incidencias».

## Cifras de verificación (RDBv2 real)

| Alcance | Finalizados | Éxitos | No válidos | Bruto | Neto | Tiempo |
| --- | --- | --- | --- | --- | --- | --- |
| GH, septiembre 2026 | 8.417 | 2.526 | 2.973 | 30,01 % | 46,40 % | 1,3 s |
| UGR (`resultado_egr`, «No valido»), septiembre | 2.129 | 1.942 | 141 | 91,22 % | 97,69 % | — |
| Todos los servicios, septiembre | 20.242 | 5.351 | — | 26,44 % | — | 2,1 s |
| GH, 01-13/10/2026 | 3.885 | — | — | — | — | 1,2 s |
| Todos los servicios, 12 meses (pasos 1 y 2) | — | — | — | — | — | 7,9 s |

Lo que se comprobó en esas cifras:

- **GH, septiembre**:
  - 8.695 cerrados tipificados, menos 278 cierres administrativos, dejan 8.417 finalizados.
  - Los 2.526 éxitos coinciden con los 2.526 «Exito» tipificados.
  - El bruto (30,01 %) coincide con el objetivo de 30 de `RATIOS_RF`. El neto (46,40 %) no
    llega al 70 de esa tabla: allí se calculaba de otra forma.
  - La suma por agente es igual al total.
- **Todos los servicios, septiembre**: 20.679 cerrados; 105 sin tocar y 332 cierres
  administrativos.
- **Sin tocar de GH**: los 6.946 de septiembre son de `IVR_GrupoHuertas`, que el panel ya excluye
  por defecto. En las campañas de agentes de GH solo hay 1.

## Operaciones fuera del código

- Backup de la SQLite de desarrollo antes de generar la migración:
  `backups/dashboard_20261013_1251.db`.
- La migración **0007** (`resultados_config`, `objetivos_resultados`) se aplicó a
  `data/dashboard.db` de desarrollo al arrancar `npm run dev`. **En producción no está.**
- Pruebas del modo mock con una COPIA de la SQLite en el scratchpad (`SQLITE_PATH=…`), con una
  sesión de prueba y configuración de prueba. La SQLite de desarrollo no se tocó para esto.
- Servidor local `npm run dev` en `http://localhost:3000`, con RDBv2 real, para que Christian lo
  viera.

## Incidencias y lecciones

- **El optimizador y los CTE.** Con todo en una sola sentencia de CTEs, un mes pasaba de 5
  minutos: el optimizador no estima cuántos contactos hay cerrados. Con `#cerr` y `#ses`
  materializados, 1,5 s. Las tablas temporales se borran al empezar, por si una consulta
  anterior de la misma conexión del pool falló a medias.
- **`OPTION (HASH JOIN)` obligatorio en `#ses`.** Según cuántos cerrados haya, SQL Server elegía
  bucles anidados:
  - Septiembre iba bien sin el hint (la consulta entera, 1,2 s).
  - 01-13/10: más de 200 s.
  - Con hash, el paso 2: 0,2 s el mes en curso, 0,3 s septiembre y 1,8 s 12 meses.
  - `OPTION (RECOMPILE)` no lo arreglaba.
- **Cierres administrativos.** El 08/09/2026 a las 11:00 se cerraron en bloque 278 contactos de
  GH tipificados en marzo de 2025. Sin separarlos habrían contado como finalizados de
  septiembre. Es una categoría que no estaba en las preguntas a Christian: queda anotada como
  decisión técnica revisable.
- **Una configuración de prueba inválida se descarta sola.** Con Bolsas configurado con `motivo`
  (texto, no entero), la lista blanca rechazó la configuración y el servicio pasó a «sin
  configurar». Es lo esperado. El admin solo ofrece columnas enteras.
- **Snapshot del motor.** `npm test` reescribió `motor.test.ts.snap` con finales de línea LF, sin
  cambiar el contenido. Se restauró con `git checkout` para no meterlo en el commit.
- **Corte de red puntual con RDBv2** (ETIMEOUT y ECONNRESET). En realidad era la consulta
  lenta del punto anterior: una conexión básica respondía en 0,3 s.

## Pendiente

- **Commit, push y despliegue**, con backup antes de `up -d` porque lleva la migración 0007.
- **Configurar los servicios en `/admin/resultados` de producción.** Lo de desarrollo no se
  copia:
  - GH: `resultado` → `subresultado`, con «No valido».
  - UGR: `resultado_egr` → `motivo_egr`, con «No valido».
  - Bolsas y Socios (`call_type`): no usan «Invalido». Christian tiene que decidir si cuentan
    «Llamada Equivocada», «No utiliza» u otros.
  - Ávolo, CEFF, CajaRural y el resto, por revisar.
- **Objetivos del semáforo**, y aclarar cómo se calculaba el 70 % de neto de `RATIOS_RF`.
- **Revisión en el navegador.** Christian la empezó en local. Los botones de guardar del admin
  no se probaron.
- Si se quiere más adelante: export a Excel (se descartó en esta versión).
