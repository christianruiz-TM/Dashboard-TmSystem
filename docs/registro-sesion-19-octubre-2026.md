# Registro de la sesión del 19/10/2026 (Opus 5.5): Dirección por cliente y filtro de origen

Christian pasó una lista de cambios para el panel de Dirección y para la
pestaña Resultados de Supervisión. Se hicieron todos, se comprobaron contra
RDBv2 y en el `next dev`, y se desplegaron el mismo día. Las reglas que quedan
en CLAUDE.md son la 17 (tiempos de los éxitos), la 18 (filtro por un dato del
contacto) y la nueva 20 (panel de Dirección).

## Lo que pidió

| Petición | Qué se hizo |
| --- | --- |
| Dirección: visión global por cliente cuando no hay cliente elegido (interacciones, atendidas, % abandono, horas logadas reales, éxitos y AHT medio) | Tabla «Por cliente» bajo las tarjetas, con los finalizados también, enlace al panel de cada cliente y fila de total |
| Añadir el número de finalizados a los valores globales | Tarjeta «Finalizados» con variación frente al mes anterior y columna en el detalle |
| «Tiempo por éxito»: media de conversación y media de gestión (script abierto) de solo los éxitos | Dos cifras nuevas, «Conversación por éxito» y «Gestión por éxito», en tarjetas y tablas (también en Supervisión, porque el componente es común) |
| Bolsas: agrupar las campañas de cartera (`Bol_` + 3-4 cifras) y el resto, con totales de cada grupo | Detalle por campaña agrupado por los tipos de campaña del cliente, con fila de total por grupo |
| Comparar dos campañas eligiéndolas en un desplegable, con todas las cifras | Tarjeta «Comparar dos campañas» al final del panel |
| Resultados de GH: filtrar por `dir_fdlt_origen` con autocompletado; «si hay una forma mejor, dímelo» | Buscador con sugerencias por «contiene» y opción «todos los que contienen…»; configurable por cliente |

## Decisiones tomadas (y por qué)

- **Finalizados = contactos cerrados de facturación** (`leadsFinalizados`). Es
  la cifra que ya se factura y no depende de la configuración de Resultados.
  En GH septiembre (sin IVR) son 8.696 = 8.417 finalizados de Resultados + 278
  cierres administrativos del 08/09 + 1 sin tocar. Lo explica el glosario.
- **Éxitos de Dirección = los de los ratios** (sesiones de agente, regla 17)
  en la tarjeta, el detalle y la vista por cliente, para que todo sume lo
  mismo. En septiembre coincide con las unidades: 5.430.
- **Horas logadas por cliente** con la misma unión que da el panel al elegir
  ese cliente (`horasAgenteReales` filtrado por sus campañas), pero de todos
  en una consulta (`horasLogadasPorServicio`). La suma de los clientes pasa
  del total (septiembre: 3.726,76 h frente a 3.618,45 h) porque un agente
  abierto a la vez en campañas de dos clientes cuenta en los dos. La fila de
  total enseña la global y la tabla lo explica.
- **Tiempos de los éxitos, por éxito**: si un éxito necesitó dos llamadas
  atendidas, se suman las dos (en Bolsas un éxito lleva ~1,8). Cada media
  divide entre los éxitos que tienen ese tiempo (GH: 124 de 2.529 sin llamada
  atendida ligada) y descarta hilos y sesiones de 2 h o más (CEFF).
- **Grupos con los «tipos de campaña» de `/admin/resultados`** en vez de una
  regla fija para Bolsas: es la misma configuración que separa las BBDD de GH
  en Resultados. Efecto: GH también sale agrupado (BBDD y resto) en Dirección.
- **Filtro de origen por «contiene»**, no por «empieza por»: muchos orígenes
  son códigos de campaña de marketing (`HUE1298_GRANADA_MARCA_VO_…`) y lo útil
  es escribir «granada» o «lexus». La primera sugerencia filtra por TODOS los
  que contienen el texto; también hay valor exacto y «sin origen». Cada
  sugerencia lleva sus finalizados del período. No distingue mayúsculas ni
  tildes (intercalación CI_AI de RDBv2).
- **Muchos valores no es problema**: 483 orígenes distintos en todo el
  directorio y 75 en septiembre; se mandan con la página (tope 2.000) y
  sugerir no consulta nada.
- **El dato se elige por cliente en `/admin/resultados`** («Filtro por un dato
  del contacto»), no en el código: sirve para otros clientes y otros datos.

## Hallazgos en RDBv2

- `dir_fdlt_origen` está en el **directorio** de contactos, no en la
  actividad: `act_GrupoHuertas.origen` está vacío en las 220.642 filas. El
  directorio de GH (`dirgrupohuertas`, código 6) es la tabla
  **`dir_1616009371`**, que no se deduce del nombre: la da
  `table_schema.directory` (ts_type 4). Se liga por
  `activity.contact_profile = easycode` (clave primaria).
- Cada servicio usa un directorio (sesiones de script de 90 días):
  `directoriosServicio` saca la lista blanca de tablas y columnas de texto.
- `script_session.duration` también va en **décimas** (ratio 10,0 exacto
  contra `gmt_end_time - gmt_start_time` en 71.276 sesiones de septiembre).
  Ninguna sesión de éxito llega a 2 h; los hilos de CEFF, sí.
- Campañas de Bolsas: 10 de cartera (`Bol_0260` … `Bol_1034`) y 10 más
  (`Bol_Fed_*`, `Bol_Fun_*`, `Bol_Incid`, `Bolsas_GC`). Ninguna campaña está
  en dos servicios.

## Cifras comprobadas (septiembre 2026)

| Qué | Resultado |
| --- | --- |
| Tiempos de los éxitos | GH 323,56 s y 451,54 s; Bolsas 302,05 s y 471,22 s; CEFF 652,50 s y 658,33 s |
| Vista por cliente | Suma de clientes = total en interacciones (119.754), éxitos (5.430) y finalizados (20.679) |
| Horas por cliente | GH 1.392,88 h, Bolsas 1.217,52 h y UGR 195,15 h, idénticas a `horasAgenteReales` de cada uno |
| Bolsas | Cartera 10.744 interacciones (351 éxitos, 522 finalizados); resto 46.861 (143, 6.210); total 57.605 |
| Filtro de origen, GH | 75 valores; sin filtro 8.417; «Centralita» 2.499 (bruto 33,61 %); «contiene granada» 454 (40,75 %); sin origen 2.576 (18,83 %). Cada filtro deja justo los finalizados que suman sus valores |
| Tiempos de consulta | Ratios GH 0,3-0,8 s; horas por cliente 0,7-2,2 s; Resultados GH con filtro 1,0-1,3 s; mes en curso 0,7 s |

Las mismas cifras salieron desde la imagen nueva en el servidor antes de
cambiar de versión.

## Verificación

- Tests: 228 en verde (nuevos en `lib/direccion.test.ts`,
  `lib/ratios-exito.test.ts` y `lib/resultados-actividad.test.ts`); `tsc` y
  ESLint sin errores.
- Páginas en el `next dev` de Christian (puerto 3000) con una sesión temporal
  en la SQLite de desarrollo, borrada al acabar (backup antes:
  `dashboard_20261019_1144.db`). En esa SQLite quedan configurados el tipo
  «Cartera» de Bolsas y el dato «Origen» de GH.

## Despliegue

- Commit `90b1192`, desplegado el 19/10/2026 a las 12:18 con el §3 de
  `docs/despliegue-linux.md` (backup `dashboard_20261019_1216.db`, sin
  migraciones, imagen `cb98ebdf9317`; vuelta atrás a `dashboard-app:anterior`
  = `001ff43cc165`). Detalle en el §9.
- En producción ya estaban la configuración de Resultados de GH y su tipo
  «BBDD». A las 12:24, a petición de Christian, se dieron de alta los dos
  que faltaban (backup `dashboard_20261019_1224.db`), con las mismas
  funciones y validaciones que `/admin/resultados` y una línea
  `config_resultados` en `audit_log` cada uno (usuario `admin`, «alta por
  Claude a petición de Christian»). El script se negaba si ya había algo:
  - Bolsas → Tipos de campaña:
    `Cartera: Bol[_][0-9][0-9][0-9], Bol[_][0-9][0-9][0-9][0-9]`. Quedan 10
    campañas en «Cartera» y 12 en «Resto» (con `IVR_Bolsas`, que el panel
    no cuenta salvo con «Incluir IVR», y `Bol_incid_prueba`).
  - GrupoHuertas → Filtro por un dato del contacto: `dir_fdlt_origen`
    (`dir_1616009371`), nombre «Origen».

## Visto de paso, sin tocar (ya pasaba antes)

- Los ratios de Bolsas tardan ~4,5 s: la consulta de atendidas de sus 20
  campañas tarda 3 s incluso con la lista literal (no es el tipo de los
  parámetros ni el plan en caché: `OPTION (RECOMPILE)` no cambia nada). La
  consulta nueva de tiempos de éxitos suma ~1,1 s en paralelo.
- El Histórico de Supervisión de un mes de GH tardó 45 s, de los que 42 son
  `metricasIvr` (la tarjeta IVR; ya avisado el 09/10).

## Ideas que quedan propuestas

- Partir los códigos de origen (`HUE1298_GRANADA_MARCA_VO_…`) en
  concesionario, marca/propia y VN/VO para filtrar o agrupar por cada parte.
- Una tabla «Por origen» en Resultados con bruto y neto de cada uno.

## Incidencias de la sesión

- Ya había un `next dev` de Christian en el puerto 3000 y Next no deja
  arrancar un segundo en la misma carpeta: se probó sobre ese.
- En el Bash de este PC fallan los heredoc largos con scripts de Python: hay
  que escribir el script en un fichero. Al editar con Python, `newline="\n"`
  y nada de escapes de barra invertida en cadenas normales.
- Vitest reescribe con LF el snapshot del motor de planificación al pasar los
  tests (sin cambiar el contenido): se devolvió con `git checkout`.
