# Auditoría del Dashboard TmSystem — 11/11/2026

Auditoría de solo lectura (Fable 5.2). No se ha tocado código, ni git, ni producción.
Lo único escrito es este informe.

**Cómo se ha comprobado:** lectura del código, `npm test`, `npx tsc --noEmit`,
`npm run lint`, `npm audit --omit=dev`, funciones puras ejecutadas con datos de prueba,
una copia de la SQLite de desarrollo abierta en solo lectura y consultas cortas de
solo lectura contra RDBv2 (un día o una semana, una cada vez; la más lenta, 0,34 s).

**Grado de certeza de cada punto:**

- **VERIFICADO**: reproducido con un test, una consulta o un cálculo (con la cifra).
- **EN CÓDIGO**: se ve leyendo el código; no se ha ejecutado.
- **SOSPECHA**: merece revisarse; se dice qué mirar.

---

## 1. Resumen

El proyecto está sano: 329 tests en verde, lint a cero y las reglas de dominio se
cumplen en el código. No he encontrado ningún fallo crítico ni ninguna cifra facturada
mal calculada. El 05/11 las llamadas, gestionadas, éxitos y sesiones dan lo mismo en
las consultas de los distintos paneles (GrupoHuertas, Ávolo y todos los clientes).
Los roles se comprueban en las 34 páginas, los 9 route handlers y todas las Server
Actions, y el rol cliente no puede salir de su servicio.

Lo que haría primero:

1. **Poner un límite de tiempo real a las consultas de RDBv2.** El de 120 s no
   protege: el driver para el reloj al llegar el primer paquete (reproducido). Es la
   causa de que el 20/10 una consulta corriera 390-440 s sin cortarse.
2. **Asegurar los datos propios**: copia automática de los backups fuera del servidor
   y agregados nocturnos que se recuperen solos si una noche fallan.
3. **Cerrar lo pendiente de seguridad antes de dar acceso a clientes externos**:
   sesiones con vida máxima, fórmulas en los CSV, `npm audit fix` y HTTPS.

---

## 2. Fallos

No hay ninguno crítico. De más a menos grave.

### Alto

#### F1 · El timeout de 120 s de las consultas no corta casi nunca — VERIFICADO

- **Qué pasa:** `requestTimeout: 120_000` ([src/lib/rdb/pool.ts:44](../src/lib/rdb/pool.ts#L44))
  solo cuenta hasta que llega el **primer paquete** de la respuesta. A partir de ahí
  el driver quita el temporizador (`node_modules/tedious/lib/connection.js:2610`,
  «request timer is stopped on first data package», tedious 19.2.1) y la consulta
  puede correr sin límite.
- **Prueba contra RDBv2** (sin tocar tablas, timeout de 3 s):
  - `WAITFOR DELAY '00:00:06'` → `ETIMEOUT` a los 3,12 s (correcto).
  - Un mensaje enviado al momento y después la misma espera → termina a los 6,12 s
    **sin error**.
- **Consecuencia:** cualquier consulta que empiece a devolver filas (un plan malo con
  bucles anidados las va soltando poco a poco) o un lote de varias sentencias (los de
  tablas temporales de Resultados y Salientes) se queda sin límite. Explica el
  pendiente de la incidencia del 20/10 («el timeout de 120 s no saltó»): nginx cortaba
  a los 180 s, la consulta seguía en SQL Server y cada recarga lanzaba otra.
- **Arreglo:** una función única `consultar(request, sql, { maxMs })` que arranque su
  propio temporizador y llame a `request.cancel()` al vencer, y pasar por ella las
  57 llamadas a `.query(` de `src/lib/rdb`. Límite distinto según la vista (por
  ejemplo, 20 s en Tiempo real y 90 s en rangos largos).
- **Esfuerzo:** M.

#### F2 · Los backups de la SQLite solo están en el mismo servidor — SOSPECHA

- **Qué pasa:** `npm run backup` deja los 30 últimos en `./backups` del propio
  servidor ([scripts/backup-sqlite.ts](../scripts/backup-sqlite.ts)). La guía
  (`docs/despliegue-linux.md` §5) dice que la copia fuera se hace a mano con `scp`.
  La SQLite del servidor es la única buena: usuarios, tarifas, cierres de mes,
  planes publicados, ausencias y saldos.
- **Ejemplo:** si se pierde el disco, se pierden a la vez la base y sus 30 copias.
- **Qué mirar:** si la máquina virtual tiene snapshot o copia de TI. No he entrado
  al servidor.
- **Arreglo:** copia diaria automática a otro equipo o carpeta de red, y probar una
  restauración cada trimestre.
- **Esfuerzo:** S.

### Medio

#### F3 · Las sesiones no caducan mientras haya una pestaña abierta — EN CÓDIGO

- **Qué pasa:** la sesión se renueva con cualquier petición
  ([src/lib/auth/session.ts:76](../src/lib/auth/session.ts#L76)) y no tiene vida
  máxima (la columna `sessions.created_at` existe y no se usa). La campana consulta
  `/api/alertas` cada 60 s en todas las páginas
  ([campana-alertas.tsx:121](../src/components/alertas/campana-alertas.tsx#L121)),
  Supervisión y «Hoy» hacen lo mismo, y «Mi servicio» se refresca cada 60 s.
- **Ejemplo:** un PC con el panel abierto el viernes sigue con sesión el lunes, aunque
  `SESSION_HORAS` sea 8. Le pasará igual al rol cliente con «Mi servicio» abierto.
- **Arreglo:** tope absoluto (12 h desde `created_at`, por ejemplo) y no renovar desde
  los endpoints de sondeo.
- **Esfuerzo:** S.

#### F4 · Fórmulas en los CSV — VERIFICADO

- **Qué pasa:** `escaparCelda` ([src/lib/export/csv.ts:11](../src/lib/export/csv.ts#L11))
  no neutraliza las celdas que empiezan por `=`, `+`, `-` o `@`. El CSV de contactos
  finalizados lleva datos que escribe el cliente final en un formulario web
  (`dir_fdlt_nombre`, `nombre_campdig`) y teléfonos.
- **Ejemplo ejecutado con `generarCsv`:**
  - Nombre `=HYPERLINK("http://x";"pulsa")` → sale tal cual: Excel lo abre como enlace.
  - Teléfono `+34600111222` → sale tal cual: Excel lo trata como fórmula y lo deja en
    el número 34600111222.
- **Arreglo:** anteponer un apóstrofo a los textos que empiecen por esos caracteres
  (o por tabulador o retorno de carro), y test. Los XLSX no tienen el problema:
  exceljs guarda los textos como texto.
- **Esfuerzo:** S.

#### F5 · `npm run agregados` solo agrega ayer: una noche fallida deja un hueco para siempre — EN CÓDIGO

- **Qué pasa:** sin argumentos, el script toma `ayerISO()`
  ([scripts/aggregate-daily.ts:43](../scripts/aggregate-daily.ts#L43)). El comentario
  de [docker/crontab:6](../docker/crontab#L6) dice que las tres tareas «se ponen al
  día solas», pero eso solo es cierto para la de planificación.
- **Ejemplo:** si RDBv2 o el servidor no responden a las 02:00 de un martes, el lunes
  no se agrega nunca. La «Tendencia 12 meses» y la «Conversión 12 meses» de Dirección
  salen con un día menos y sin aviso.
- **Añadido:** aunque corra, el agregado de un día queda fijo y los «finalizados» de
  ese día cambian después (un contacto que se reabre y se cierra otro día cambia de
  fecha). CLAUDE.md ya midió un 0,1-1 % al recalcular.
- **Arreglo:** empezar en la última fecha agregada + 1 (`estadoAgregados()` ya la da)
  y rehacer siempre los últimos 7 días. Es barato: 16 meses tardan 49 s.
- **Esfuerzo:** S.

#### F6 · Una lista de campañas vacía significa «todas» — EN CÓDIGO (hoy sin efecto, VERIFICADO)

- **Qué pasa:** `filtroCampanias` devuelve cadena vacía con `[]`
  ([src/lib/rdb/queries/util.ts:32](../src/lib/rdb/queries/util.ts#L32)).
  `campaniasEfectivas` devuelve `[]` si el servicio solo tiene campañas `IVR_*` y no
  se marca «Incluir IVR» ([servicios.ts:86](../src/lib/rdb/queries/servicios.ts#L86)),
  y «todas» si el servicio de la URL no existe
  ([servicios.ts:71](../src/lib/rdb/queries/servicios.ts#L71)).
- **Ejemplo:** se da de alta un cliente nuevo que empieza solo con su IVR. Al elegirlo
  en Supervisión, Dirección u Operaciones salen las cifras de TODOS los clientes con
  su nombre encima. Lo mismo con `?servicio=GrupoHuertass`.
- **Hoy no ocurre:** los 27 servicios tienen al menos una campaña que no es IVR
  (consulta a los maestros). Resultados y «Mi servicio» ya lo evitan a mano.
- **Arreglo:** que `[]` genere `AND 1 = 0`, dejar `undefined` como único «sin filtro»
  y avisar cuando el servicio de la URL no existe.
- **Esfuerzo:** S.

#### F7 · Una campaña nueva no aparece en los paneles hasta 24 h después — EN CÓDIGO

- **Qué pasa:** el mapa servicio → campañas y el maestro de campañas se cachean 24 h
  ([servicios.ts:36](../src/lib/rdb/queries/servicios.ts#L36),
  [campanias.ts:14](../src/lib/rdb/queries/campanias.ts#L14)) y todos los paneles
  filtran con esa lista (`IN (...)`).
- **Ejemplo:** se crea a las 09:00 la campaña de una tanda nueva de bbdd. Sus llamadas
  no salen en Supervisión en vivo, ni con el cliente elegido ni con «todos», hasta
  que caduque la caché o se reinicie `app`.
- **Arreglo:** bajar esos dos TTL a 5-10 min (mis consultas a esos maestros tardaron
  menos de 0,30 s) o un botón «Actualizar campañas» en `/admin`.
- **Esfuerzo:** S.

#### F8 · Dependencias con avisos nuevos — VERIFICADO

- `npm audit --omit=dev` da hoy **5 altos y 3 moderados** (CLAUDE.md: 2 y 3). Nuevos:
  - `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5): agota memoria al validar colecciones con
    tope. zod valida lo que mandan los formularios y las Server Actions.
  - `@azure/msal-node` (GHSA-xcx6-jx8p-x3h5), que llega por `mssql`. No se usa la
    autenticación de Azure, así que el riesgo real es bajo.
- **Arreglo:** `npm audit fix` (sin cambios de versión mayor; quedan `uuid`/`exceljs`).
- **Esfuerzo:** S.

#### F9 · «Salientes» carga todas las llamadas desde el inicio del rango hasta hoy — EN CÓDIGO

- **Qué pasa:** la tabla temporal `#ll`
  ([salientes.ts:211](../src/lib/rdb/queries/salientes.ts#L211)) no tiene tope
  superior ni filtro de campañas: `t.start_time >= @desdeLl`, de todos los clientes.
- **Ejemplo:** el Histórico de noviembre de 2025 con un cliente elegido copia a tempdb
  un año de salientes de toda la casa. El 05/11 hubo 3.218 salientes con número, así
  que estimo del orden de 800.000 filas por petición sin caché. Y sin timeout que la
  corte (F1).
- **Arreglo:** tope en `@hastaExcl` más el margen de las rellamadas y filtro de
  campañas.
- **Esfuerzo:** S. No lo he medido para no lanzar una consulta larga.

### Bajo

#### F10 · Un DDI que cambia de cliente a mitad de mes se cobra a los dos — VERIFICADO en cálculo

- **Qué pasa:** `ddisParaFacturar` filtra por las campañas del alcance
  ([src/lib/db/facturacion.ts:50](../src/lib/db/facturacion.ts#L50)) **antes** de que
  `ddisPorMes` elija la asignación más reciente de cada número. El cierre siempre es
  por cliente.
- **Ejemplo ejecutado:** número con baja en una campaña del cliente X el 15/09 y alta
  en una del cliente Y ese día → con «todos», 1 DDI (a Y); cerrando X, 1; cerrando
  Y, 1. Se factura dos veces.
- **Hoy no ocurre:** en los 878 DDIs de la copia de desarrollo, los cambios de
  campaña con mes compartido son dentro de GrupoHuertas o desde «sin campaña».
- **Arreglo:** elegir el titular con todos los DDIs y filtrar después.
- **Esfuerzo:** S.

#### F11 · El reparto de horas no suma el importe del cliente si el precio lleva céntimos — VERIFICADO

- **Qué pasa:** las horas se reparten por mayor resto y suman exacto, pero el importe
  de cada campaña se redondea por separado
  ([facturacion-horas-logadas.ts:129](../src/lib/facturacion-horas-logadas.ts#L129)).
- **Ejemplo ejecutado** (1.027,88 h en 38 campañas):
  - A 28,00 €: 28.780,64 € en los dos sitios.
  - A 27,50 €: 28.266,76 € sumando campañas y 28.266,70 € en la línea del cliente.
- **Hoy no afecta** con GH a 28 €. El cierre guarda las líneas por campaña, así que
  el total del cierre sería el primero y la tarjeta «Horas logadas por cliente», el
  segundo.
- **Arreglo:** repartir también el importe por mayor resto.
- **Esfuerzo:** S.

#### F12 · La tabla de campañas de Supervisión pierde las que tienen fichas pero no hilos — VERIFICADO

- **Qué pasa:** la tabla se monta sobre las filas de `itr_thread`
  ([supervision.ts:290](../src/lib/rdb/queries/supervision.ts#L290)); una campaña con
  sesiones de script y ningún hilo ese día no sale.
- **Ejemplo:** 05/11, todos los clientes: 3.041 contactos en la base de los ratios y
  3.037 en la tabla de campañas. Los éxitos coinciden (168).
- **Arreglo:** unir las campañas de las cuatro consultas.
- **Esfuerzo:** S.

#### F13 · Los albaranes de un mes cerrado se clasifican con la tarifa de hoy — EN CÓDIGO

- **Qué pasa:** qué campañas van a «promociones» sale de `billing_config` actual
  ([albaranes-gs/route.ts:37](../src/app/api/export/albaranes-gs/route.ts#L37)), no
  del cierre.
- **Ejemplo:** se borra la tarifa propia de una bbdd en noviembre; al volver a sacar
  el fichero de septiembre, esa campaña pasa de «promociones» a «ventas».
- **Arreglo:** deducirlo de las unidades guardadas en el cierre o guardar el tipo.
- **Esfuerzo:** S.

#### F14 · `must_change_password` no se comprueba fuera de las páginas — EN CÓDIGO

- **Qué pasa:** `requireSesion` lo exige, pero 8 de los 9 route handlers,
  `requireAdmin` ([admin/acciones.ts:21](../src/app/(dashboard)/admin/acciones.ts#L21))
  y `usuarioConCampana` ([alertas-acciones.ts:12](../src/app/(dashboard)/alertas-acciones.ts#L12))
  usan `obtenerSesion` a secas.
- **Ejemplo:** un usuario con la contraseña recién reseteada (la conoce el
  administrador) puede descargar exports sin haberla cambiado.
- **Arreglo:** un `requireApi(...roles)` común para route handlers y acciones.
- **Esfuerzo:** S.

#### F15 · Bloqueo de login solo en memoria — EN CÓDIGO

- **Qué pasa:** el contador ([rate-limit.ts:16](../src/lib/auth/rate-limit.ts#L16))
  se pierde en cada despliegue, no se limpia (crece con cada usuario inexistente
  probado) y no hay límite por IP.
- **Ejemplo:** probar una contraseña común contra 50 usuarios desde una IP no bloquea
  nada.
- **Arreglo:** guardarlo en SQLite y añadir un tope por IP. Hacerlo junto con la
  apertura a clientes.
- **Esfuerzo:** S.

#### F16 · Otros puntos menores

- **`npx tsc --noEmit` falla en local — VERIFICADO.** 3 errores, todos en
  `.next/types/validator.ts`, que apunta a dos rutas borradas
  (`admin/clientes/[id]` y `api/export/cliente`). El código fuente no tiene errores.
  Arreglo: un `tsconfig` de comprobación que no incluya `.next`, o borrar
  `.next/types` antes. S.
- **Comentario que ya no es cierto — EN CÓDIGO.**
  [servicios.ts:100](../src/lib/rdb/queries/servicios.ts#L100) dice que, si una
  campaña está en dos servicios, «gana el de más campañas (la lista viene ordenada
  así)». Desde `2b5a24c` la lista va por orden alfabético. Hoy ninguna de las 181
  campañas está en dos servicios (VERIFICADO), pero la regla debe ser explícita. S.
- **«Solo los meses con llamadas» de los DDIs — EN CÓDIGO.** Usa `interacciones`
  ([src/lib/facturacion.ts:207](../src/lib/facturacion.ts#L207)), que desde el 22/10
  y el 05/11 ya no cuenta preparaciones ni emails. CLAUDE.md dice «algún hilo». Un
  mes con solo preparaciones no pagaría el DDI. Decidir cuál vale. S.
- **Auditoría de los ajustes de cierre — EN CÓDIGO.** El cliente y el mes del detalle
  salen del formulario, no del cierre
  ([operaciones/acciones.ts:331](../src/app/(dashboard)/operaciones/acciones.ts#L331)).
  La línea de `audit_log` puede nombrar un mes distinto del ajustado. S.
- **Cabeceras — EN CÓDIGO.** nginx pone `X-Frame-Options`, `nosniff` y
  `Referrer-Policy`; faltan `Content-Security-Policy` y `Permissions-Policy`, y Next
  anuncia `X-Powered-By`. S.

### Comprobado y correcto

Para que no se vuelva a revisar sin motivo:

| Qué | Resultado |
| --- | --- |
| Llamadas del 05/11 en `volumenPorCampania`, `volumenPorDia`, base de ratios, facturación y «Mi servicio» | GH 991, Ávolo 19, todos 3.395: igual en las cinco |
| Gestionadas, éxitos y sesiones de GH el 05/11 en Supervisión, ratios y facturación | 659, 103 y 828 en las tres |
| Intentos de la calidad de la BD frente a salientes con número (05/11) | GH 826 = 826; todos 3.218 = 3.218 |
| «Llamadas gestionadas» de la tabla (cualquier usuario) frente a la cabecera (agentes), semana del 03 al 09/11 | 9.740 hilos, todos de agente humano: no pueden discrepar |
| Contactos de bbdd de GH facturables en octubre frente a los tipificados por un agente | 2.006 = 2.006 (ninguno «sin tocar» ni administrativo) |
| Campañas sin servicio o en dos servicios | 0 de 181 |
| Hilos de 2 h o más del 03 al 09/11 | 0 de 30.264 |
| Entrantes que no son telefonía con estado 1 o 6 (afectarían al SLA) | 0 (18 emails entrantes, todos sin estado) |
| Hash ficticio del login (enumeración de usuarios por tiempo) | Válido: 302 ms frente a 288 ms |
| Alcance del rol cliente en `/clientes` y en el informe | Lo decide `servicioDeMiServicio`; la campaña y el tipo se validan contra su servicio; lo interno no llega al navegador |
| Informe HTML y copia del horario | Todo texto pasa por `esc`/`escapar`; el JSON escapa `<`; los globos usan `textContent` |
| Identificadores `ao_*` y `dir_*` | Lista blanca + patrón + corchetes en cada consulta; los valores, como parámetros |
| Motor de planificación | Regla de ESLint activa; sin reloj, azar ni I/O; guardar comprueba la revisión dentro de la transacción |
| Secretos en git | Solo `.env.example` |
| Columnas `horas_logadas`/`horas_ready` de `agg_daily_campaign` | 0 filas con valor en la copia: se pueden quitar |

---

## 3. Mejoras

### Cifras y KPIs

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **Cuadre automático entre paneles** cada noche (las cinco cuentas de llamadas, gestionadas y éxitos del día anterior), con aviso en `/admin` y en la campana | Coincido con el pendiente 1 (tests de oro). Aporto el guion que he usado: siete funciones, un día, entre 1,0 y 1,4 s en total | Detecta el día en que una consulta nueva se salta `sqlLlamada` | S | Bajo |
| **Corte de 2 h también en las horas productivas** ([queries/facturacion.ts:88](../src/lib/rdb/queries/facturacion.ts#L88)) y en la tabla de productividad | CLAUDE.md ya lo avisa. Añado: la unidad `horas` se factura, y 6 hilos de CEFF sumaron 1.766 h en septiembre | Un hilo con duración imposible no llega a una factura | S | Cambia cifras: decidir con Christian |
| **Avisos al cerrar un mes**: contactos «sin tocar» o administrativos en campañas que cobran por contacto, hilos de 2 h o más, campañas sin código de GS | Hoy los 2.006 de octubre son de agente, pero un cierre en bloque de una lista se facturaría a 2 € por contacto | Se ve antes de cerrar, no después | S | Bajo |
| **«Datos de las HH:MM» y botón «Recalcular» antes de cerrar** | El cierre guarda lo que hay en caché (hasta 12 h para un mes pasado) | La foto es del momento y se sabe de cuándo | S | Bajo |
| **Aviso en Operaciones con un rango que no es un mes entero** | Los DDIs cobran el mes entero aunque el rango sea de 7 días (decidido), y en pantalla se mezclan con horas de 7 días | Evita leer mal un importe | S | Bajo |

### Seguridad

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **HTTPS y `COOKIE_SECURE=1` antes del primer usuario cliente** | Coincido con el pendiente 10. Añado: debe ser condición para dar de alta clientes externos, no «si se expone a internet»: su contraseña y su cookie viajan en claro | Sin esto no hay confidencialidad entre clientes | M | Medio (certificado, pruebas) |
| **Segundo factor o, al menos, bloqueo por IP y aviso de acceso nuevo para el rol cliente** | Los clientes entran desde fuera de la oficina | Una contraseña filtrada no basta | M | Bajo |
| **Tope de sesión, CSV, `requireApi`, `npm audit fix`, CSP** | F3, F4, F14, F8 y F16 | Cierra lo encontrado | S cada uno | Bajo |
| **`npm audit` y cuadre en cada push** (GitHub Actions, repositorio privado) | Hoy todo depende de acordarse | Los avisos nuevos se ven el día que salen | S | Bajo |
| **Quitar al usuario SQL lo que no use** y confirmar que sigue sin permisos de escritura | El 21/10 tuvo `INSERT/UPDATE/DELETE` sobre dos tablas unas horas | Solo lectura garantizada en el servidor | S | Bajo |

### Rendimiento

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **`consultar()` con cancelación, duración y nombre de la consulta en el log** | F1. Además, hoy no hay forma de saber qué consulta fue lenta | Límite real y un registro de las lentas | M | Medio: toca todas las consultas |
| **Política única para consultas con rango** (`RECOMPILE` o `HASH JOIN`) dentro de `consultar()` | Las incidencias del 13/10 y del 20/10 son la misma: el plan de un día reutilizado para un mes. Hoy se arregla consulta a consulta, cuando falla | No depende de acordarse en cada consulta nueva | S (con lo anterior) | Bajo: `RECOMPILE` cuesta milisegundos |
| **`metricasIvr` de un mes (42 s)** | Ya está apuntado. Aporto: calcular una vez los tramos «con alguien logado» (las islas que ya existen) y cruzar por intervalo, en vez de un `EXISTS` por llamada | El Histórico de un mes deja de tardar | M | Bajo |
| **`#ll` de Salientes acotada** | F9 | Los rangos antiguos dejan de crecer con el tiempo | S | Bajo |
| **Caché con «sirve lo anterior mientras recalcula»** en las vistas de 60 s | Al caducar, el primero que entra espera toda la consulta | Tiempo real siempre instantáneo | M | Bajo |
| **TTL de 12 h solo para rangos que acabaron hace 2 días o más** ([cache.ts:64](../src/lib/rdb/cache.ts#L64)) | Ayer sigue cambiando: réplica con ~5 min de retraso tras medianoche y finalizados que se mueven | Ayer no se queda 12 h con un dato parcial | S | Bajo |

### Fiabilidad y operación

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **Abrir la SQLite al primer uso, no al importar el módulo** ([sqlite.ts:50](../src/lib/db/sqlite.ts#L50)) | Coincido con el pendiente 11, pero el reintento propuesto trata el síntoma. `next build` importa el módulo desde varios procesos y todos ejecutan `PRAGMA journal_mode = WAL` y las migraciones | Arregla de raíz el «database is locked» al compilar **y** la incidencia del 06/10 (`npm run build` migrando la SQLite del `.env`) | S | Bajo: probar arranque y scripts |
| **Backup automático justo antes de migrar** en el arranque de `app` | Hoy depende de acordarse de hacerlo antes de `up -d` | Ninguna migración sin copia previa | S | Bajo |
| **Copia externa de backups y prueba de restauración** | F2 | Se sobrevive a la pérdida del disco | S | Bajo |
| **Aviso cuando una tarea nocturna falla** (campana, origen «sistema») | Hoy solo queda en `docker compose logs` y en `/admin` | Se sabe a las 08:00, no al mirar la gráfica | S | Bajo |
| **`error.tsx` por panel y aviso de salud de RDBv2** | Coincido con el pendiente 3, sin nada que añadir salvo que F1 va primero | — | M | Bajo |
| **Agregados que se ponen al día** | F5 | Sin huecos silenciosos | S | Bajo |

### Código y tests

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **Tests con SQLite en memoria** para `repositorio.ts` (1.157 líneas), `guardar.ts` y `db/facturacion.ts` | Es donde están el control de revisión, el cierre de mes y los ajustes, y no tienen ni un test | El conflicto de dos personas guardando y «un cierre por mes» quedan probados | M | Bajo |
| **Tests de `fechas.ts`, `export/csv.ts`, `rate-limit.ts` y `ddis.ts` con alcance** | Son pequeños, puros y sin test | Cubre F4, F10 y F15 | S | Bajo |
| **Test «de contrato» de las consultas**: falla si un fichero de `queries/` lee `itr_thread` contando llamadas sin `sqlLlamada`, o un rango sin `@desde` y `@hastaExcl` | Las reglas 3 y 6 hoy solo las vigila quien revisa | La regla se cumple sola | S | Bajo |
| **Tipar los resultados de SQL** (un `consultar<T>()` con validación ligera en desarrollo) | Hay un `as` por consulta; una columna renombrada no da error | Los fallos de nombre salen en los tests | M | Bajo |
| **Partir los ficheros grandes**: `tablero.tsx` (1.317), `secciones.tsx` (946), `resultados-actividad.ts` (954 y 845) | Cuestan de leer para una persona y para un modelo | Cambios más seguros | M | Medio: solo con tests delante |
| **Limpieza**: tabla `client_campaigns`, columnas `horas_logadas`/`horas_ready`, `docs/despliegue-windows.md`, los cinco SVG de la plantilla en `public/` | Código y documentos muertos (comprobado: 0 filas, 0 usos) | Menos ruido | S | Bajo (una migración) |
| **`mock.ts` (1.317 líneas) con un test que compare sus formas con los tipos reales** | El modo demo se usa para las capturas de la ayuda y se puede quedar atrás | Demo fiable | S | Bajo |

### Producto y uso

| Mejora | Por qué | Beneficio | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| **Vista sencilla por defecto en Supervisión** (equipo ahora, 6 cifras y alertas) con el resto plegado | Tiempo real enseña cabecera, 12 cajas, ratios, Salientes, calidad de la BD, IVR, campañas, agentes y comparador en una sola página | Supervisión ve lo urgente sin buscarlo | M | Bajo |
| **Guía de los KPIs de Supervisión** en el mismo formato que la de Planificación | Ya está pendiente. Añado: salir del glosario (`glosario.ts`) para no escribirla dos veces | Menos preguntas del tipo «¿por qué 873 y no 577?» | M | Bajo |
| **Nombre visible de campaña para el cliente** (alias opcional) | «Mi servicio» enseña `gh_gra_pre_mer` tal cual (decidido). Un cliente externo no lo entiende | Informe legible sin explicación | S | Bajo |
| **No enseñar «Sin configurar» al rol cliente** | Hoy la tarjeta de no válidos y el neto salen con ese texto si falta la configuración interna | El cliente no ve un pendiente nuestro | S | Bajo |
| **Dos nombres, dos colores para las dos familias de éxito** («Éxitos» por día de la llamada y «Finalizados con éxito» por día del cierre) en todos los paneles | Están separadas por decisión, pero en la misma pantalla dan cifras distintas | Menos dudas | S | Bajo |
| **Hora de los datos visible en todos los paneles** | Solo la llevan «Mi servicio» y Tiempo real | Se entiende por qué dos personas ven cifras distintas | S | Bajo |
| **Aviso «servicio no encontrado»** | F6 | No se confunde «todos» con un cliente | S | Bajo |

### Documentación

Ver el apartado 4.5: es el cambio de mayor efecto para los próximos modelos.

---

## 4. Cambios de mayor alcance

### 4.1 Una sola puerta para RDBv2

- **Qué:** todas las consultas pasan por `consultar()`: límite de tiempo con
  cancelación, registro de nombre y duración, política de plan y tipado.
- **A favor:** resuelve F1 y las dos incidencias de planes; da por primera vez una
  lista de consultas lentas; hace posible el test de contrato.
- **En contra:** toca 16 ficheros y 57 consultas. Hay que hacerlo por partes y
  comparar cifras antes y después con el guion de cuadre.
- **Mi opinión:** es el cambio con mejor relación entre riesgo evitado y trabajo.

### 4.2 Abrir a clientes externos como un paso aparte, con su lista

- **Qué:** no dar de alta el primer usuario cliente hasta tener HTTPS, tope de sesión,
  bloqueo por IP y el CSV corregido. Valorar que el cliente entre por un nombre de
  host distinto, con solo `/login` y `/clientes` publicados en nginx.
- **A favor:** si aparece un fallo en un panel interno, desde fuera no se puede
  llegar a él. Hoy la separación depende de que cada página llame a `requireRol`
  (lo hacen todas, pero es una sola barrera).
- **En contra:** otro bloque de nginx que mantener.
- **Discrepo** de dejar HTTPS y el segundo factor como «F5, solo si se expone a
  internet»: con clientes externos el riesgo cambia aunque sigan entrando por VPN.

### 4.3 Agregados: mantenerlos, pero que se curen solos

- **Qué:** rehacer cada noche los últimos 7 días y rellenar huecos.
- **A favor:** las consultas en vivo de un día tardan 0,1-0,3 s (medido) y las de un
  mes 1-2 s (CLAUDE.md), así que estimo 10-20 s por carga para 12 meses en vivo: el
  agregado sigue haciendo falta para Dirección.
- **En contra:** ninguna relevante (7 días son unos 2 s).
- **Alternativa descartada:** quitar los agregados y cachear 12 meses en memoria: se
  pierde en cada despliegue.

### 4.4 Planificación como módulo con sus propias reglas

- **Qué:** Planificación es el 44 % del código (25.185 de 57.059 líneas) y cerca de
  la mitad de CLAUDE.md. No propongo separarla en otra aplicación:
  comparte sesión, roles, SQLite y la campana. Sí darle su propio documento de reglas
  y su propio bloque de tests.
- **A favor:** quien toca facturación no carga 800 líneas de turnos, y al revés.
- **En contra:** hay que mantener los enlaces entre documentos.

### 4.5 Reorganizar CLAUDE.md

- **Dato:** 1.977 líneas y 134 KB, cargados enteros en cada sesión. Mezcla cuatro
  cosas: reglas que no se pueden romper, explicación de cómo funciona cada módulo,
  el diario de sesiones (repetido en `registro-sesiones.md`) y las cifras con las que
  se verificó cada decisión.
- **Riesgo real:** la regla 6 ocupa hoy unas 70 líneas con seis decisiones dentro.
  Una regla crítica enterrada en un párrafo de cifras es la que un modelo se salta.
- **Propuesta:**

| Fichero | Contenido | Tamaño |
| --- | --- | --- |
| `CLAUDE.md` | Estado en 5 líneas, límites de producción (qué no hacer nunca), las reglas críticas en una línea cada una en imperativo con enlace a su detalle, mapa de carpetas, comandos | 200-250 líneas |
| `docs/reglas/llamadas.md` | Reglas 1-14: décimas, qué es una llamada, SLA, pausas, horas, hora local | Detalle y cifras |
| `docs/reglas/facturacion.md` | Reglas 16 y 19, con enlaces a los dos documentos que ya existen | — |
| `docs/reglas/exitos-y-resultados.md` | Reglas 17, 18, 20 y las 12 cajas | — |
| `docs/reglas/planificacion.md` | Regla 15 y todo «Planificación de turnos» | — |
| `docs/reglas/mi-servicio.md` | Regla 21 | — |
| `docs/produccion.md` | «Producción (Docker)», unido a `despliegue-linux.md` | — |
| `docs/registro-sesiones.md` | Todos los apartados «Sesión…» y «Auditoría…» (ya están casi todos) | — |
| `docs/pendientes.md` | Las casillas sin marcar, hoy repartidas por 15 apartados | Una sola lista |

- **Tres normas para que no vuelva a crecer:**
  1. En `CLAUDE.md` solo entra lo que cambia lo que un modelo debe **hacer**. El
     porqué y la cifra van al documento de la regla.
  2. Cada regla crítica lleva al lado el test que la vigila. Si no tiene, es un
     pendiente.
  3. Al cerrar una sesión se escribe en el registro, no en `CLAUDE.md`.
- **A favor:** menos contexto gastado en cada sesión y reglas críticas a la vista.
- **En contra:** una sesión de trabajo de solo mover texto, y hay que comprobar que
  no se pierde ninguna decisión (hacerlo con un listado de todas las fechas
  «decidido el…» antes y después).

---

## 5. Arreglos rápidos (menos de una hora cada uno)

1. `npm audit fix` (zod y msal-node).
2. Apóstrofo en las celdas de CSV que empiezan por `=`, `+`, `-`, `@`, con su test.
3. Tope absoluto de sesión con `sessions.created_at`.
4. `filtroCampanias([])` → `AND 1 = 0`.
5. TTL de 10 min para `rdb:servicios` y `rdb:campanias`.
6. `agregados` sin argumentos: desde la última fecha agregada + 1, y siempre los
   últimos 7 días.
7. Corregir el comentario de `docker/crontab` y el de `mapaCampaniaServicio`.
8. `ddisParaFacturar`: elegir titular con todos y filtrar después.
9. Importe del reparto por mayor resto.
10. Tabla de campañas de Supervisión con la unión de las cuatro consultas.
11. `tsconfig` de comprobación sin `.next` para que `tsc` salga en verde.
12. Tope superior y filtro de campañas en `#ll` de Salientes.
13. Borrar los cinco SVG de la plantilla en `public/` y `docs/despliegue-windows.md`.
14. `poweredByHeader: false` y cabecera `Permissions-Policy` en nginx.
15. Comprobar `must_change_password` en los route handlers.

---

## 6. Hoja de ruta: los 10 primeros, por impacto y esfuerzo

| # | Qué | Impacto | Esfuerzo | Punto |
| --- | --- | --- | --- | --- |
| 1 | Copia externa de los backups y prueba de restauración | Evita perder la única base buena | S | F2 |
| 2 | `npm audit fix`, CSV y tope de sesión | Cierra tres puntos de seguridad en una tarde | S | F8, F4, F3 |
| 3 | Agregados que se ponen al día y rehacen 7 días | Dirección sin huecos silenciosos | S | F5 |
| 4 | Lista vacía ≠ «todas» y maestros a 10 min | Evita cifras de otro cliente y campañas invisibles | S | F6, F7 |
| 5 | `consultar()` con cancelación y registro, empezando por Dirección, Resultados y Salientes | Ninguna consulta vuelve a correr 400 s | M | F1, 4.1 |
| 6 | SQLite perezosa y backup antes de migrar | Fin del «database is locked» y de migrar al compilar | S | 3, fiabilidad |
| 7 | Cuadre nocturno entre paneles con aviso | Las reglas de cifras se vigilan solas | S | 3, cifras |
| 8 | Tests con SQLite en memoria (guardar plan, cierre de mes, ajustes) | Protege lo que más costaría recuperar | M | 3, código |
| 9 | HTTPS, bloqueo por IP y host aparte antes del primer cliente externo | Condición para abrir «Mi servicio» | M | 4.2 |
| 10 | Reorganizar CLAUDE.md | Los próximos modelos no pierden las reglas críticas | M | 4.5 |

---

## 7. Qué no he podido revisar y por qué

- **Producción.** Sin SSH: no he visto el estado real de los backups, los logs de las
  tareas nocturnas, la configuración (tarifas, clientes, tipos de campaña), las
  cabeceras que sirve nginx ni si los agregados tienen huecos. La copia de desarrollo
  quedó congelada el 22/10 y solo tiene un usuario.
- **Las pantallas.** No he lanzado `next dev` ni `next build`, así que lo de producto
  y uso sale del código y de CLAUDE.md, no de usar el panel. No he medido tiempos de
  carga.
- **Consultas largas.** Me he limitado a un día o una semana. No he medido
  `metricasIvr` de un mes, Salientes de un rango antiguo ni el efecto de los planes
  en caché. F9 queda como «en código» por eso.
- **Facturación contra el Excel.** No he ejecutado `facturacion:comparar` (necesita
  el Excel de `temp/` y consulta meses enteros) ni `npm run verificar`.
- **Planificación a fondo.** He comprobado la pureza del motor, el guardado y los
  permisos, y sus tests pasan. No he reproducido saldos ni el contrato del día con
  datos reales, ni revisado línea a línea el motor (633 líneas), las validaciones o
  la tarea nocturna.
- **Lectura parcial.** De `referencia_bbdd_altitude_v85.md` he leído el índice y la
  sección 8, no las 596 líneas. No he revisado los componentes de interfaz
  (accesibilidad, modo oscuro), el modo demo ni la guía de supervisión.
- **El Power BI** que lee los calendarios y la configuración de SQL Server (permisos
  del usuario, nivel de compatibilidad) quedan fuera.
