# Dashboard TmSystem — Guía para Claude

Dashboard web multi-rol para TmSystem (contact center con Altitude uCI v8.5/8.6).
Lee datos de **RDBv2** (SQL Server, réplica de solo lectura) y guarda sus propios
datos (usuarios, config, agregados) en **SQLite**.

Convenciones generales de Next.js del scaffold: ver @AGENTS.md. Idioma del proyecto:
**español** (UI, comentarios, commits).

## Reglas de dominio CRÍTICAS (no negociables)

1. **DÉCIMAS DE SEGUNDO**: TODAS las columnas de duración de RDBv2 (`duration`,
   `wrapup_duration`, en replicación Y en flat tables) están en décimas de segundo,
   aunque la doc oficial de Altitude diga segundos (verificado en esta instalación).
   - Segundos = `duration / 10.0` · Minutos = `/ 600.0` · Horas = `/ 36000.0`
   - La conversión se hace SIEMPRE dentro del SQL, nunca en TypeScript/frontend.
2. **Solo RDBv2**: jamás conectar a la BBDD principal de Altitude. El usuario SQL es
   de solo lectura; cualquier escritura va a SQLite.
3. **Filtros de fecha obligatorios** sobre columnas indexadas, con rangos explícitos:
   - ✅ `WHERE t.start_time >= @desde AND t.start_time < @hasta`
   - ❌ `WHERE YEAR(start_time) = 2026` (impide usar el índice)
   - `itr_thread` y `activity_history` son enormes: NUNCA consultarlas sin rango.
4. **SQL parametrizado siempre** (`request.input(...)`). Nada de concatenar valores.
   Los nombres de campaña del scoping de clientes también van como parámetros.
5. **Enumerados**: los valores numéricos de estados se traducen con la tabla
   `rdb_enums` (cacheada en `src/lib/rdb/enums.ts`), no con CASE hardcodeados.
6. **Fórmulas estándar** (sobre `itr_thread`):
   - Talk Time = `duration - wrapup_duration` · AHT = `duration` · ACW = `wrapup_duration`
   - Atendida = `termination_state = 1` · Abandonada = `termination_state = 6`
   - Agente humano = `ph_e_user.type = 1`
   - Tiempo de cola = suma de `itr_segment.duration` con `state IN (2,3)`
   - Origen: `origin` 1=Inbound · 2=Outbound · 3=Workflow
6.b **SLA, cola y % abandono SOLO sobre `origin = 1`** (entrantes). Verificado
   09/09/2026 con datos reales: de 4.894 atendidas de un día, 4.322 eran
   SALIENTES y ninguna de las que no tenían fila de cola era entrante. Usar el
   total de atendidas como denominador del SLA lo multiplica por ~8,6 y lo deja
   clavado cerca del 100 %. Las salientes no hacen cola: su tiempo en estado
   2/3 es enrutado del marcador, no espera de un cliente. `KpiCampaniaHoy`
   lleva `atendidasInbound`/`abandonadasInbound` justo para esto, y son el
   único denominador válido de esos tres indicadores (también en la UI).
7. **Flat tables vs replicación**: flats (`flat_int_*`, `contacts_*`) tienen ~15 min
   de retraso → para histórico. Supervisión intradía usa tablas de replicación
   (`itr_thread`, `ag_in_cp_log`...) que van casi en tiempo real.
8. Tablas con espacios en el nombre van con corchetes: `[contacts_Xperience Routing]`.
9. **Scoping de clientes EN EL SQL**: un usuario `cliente` solo ve sus campañas
   (mapeo en SQLite `client_campaigns`). El filtro se aplica como parámetros en la
   query, nunca solo ocultando UI.
10. **Not Ready (pausas) SE DEDUPLICAN obligatoriamente**: `ag_in_cp_log` registra
    cada evento Not Ready (`op_type = 2`) UNA VEZ POR CADA CAMPAÑA en la que el
    agente está abierto dentro del servicio. Un `SUM(duration)`/`COUNT(*)` crudo
    cuenta el mismo evento N veces e infla los tiempos ~10-20× (verificado:
    61.060 → 4.305 min en un día real). Reglas:
    - **Duplicados** (mismo agente+servicio+motivo+inicio+duración, distinta
      campaña) y **solapados** (mismo periodo real con `start_time` algo distintos
      pero mismo fin): quedarse con **UNA fila por evento real, la de duración
      MÍNIMA**. Nunca sumar duraciones ni contar repeticiones.
    - Algoritmo O(n log n) con window functions (clústeres de solapamiento por
      `MAX(fin) OVER ... ROWS UNBOUNDED PRECEDING AND 1 PRECEDING`, gana la menor
      duración del clúster) implementado en `queries/agentes.ts::razonesNotReady`.
      Es la misma lógica de la vista SSMS `v_not_ready_detalle`. NO simplificar.
    - `cp_general_cfg` es 1:N (campaña→servicio): fijar `MIN(service)` por campaña
      antes del JOIN para no volver a multiplicar filas.
10.b **`ag_in_cp_log.duration IS NULL` = evento AÚN ABIERTO**, no duración cero.
    Verificado: un día cerrado no tiene ni un NULL; hoy, 235 de 919 filas de
    `op_type = 0`. Tratarlo con `ISNULL(duration, 0)` hacía que las sesiones en
    curso contasen CERO (medido: 44,7 h en vez de 116,7 h de logadas de hoy,
    −61 %). Todo intervalo abierto se cierra en `GETDATE()`, acotado a
    `@hastaExcl` para no salirse del rango pedido. Aplica a horas logadas/ready
    y a las pausas Not Ready.

11. **Horas LOGADAS/READY también se duplican** (mismo motivo que las pausas):
    `op_type = 0` (Open/logado) y `op_type = 1` (Ready) se graban una fila por
    campaña abierta. Sumar por campaña multiplica el tiempo (~×13 medido).
    - La hora real de un agente es la **UNIÓN de sus intervalos**, no la suma.
      Solo tiene sentido como cifra **GLOBAL / por agente**, nunca por campaña.
      Implementado en `queries/agentes.ts::horasAgenteReales` (gaps & islands).
    - En `/operaciones` y `/direccion` el KPI "Horas logadas (reales)" usa esa
      cifra global. Las columnas por campaña NO muestran logadas/ready.
    - **Facturación por campaña que use horas** → unidad `horas` = horas
      PRODUCTIVAS (`itr_thread`, gestión real, no duplicada), no logadas. Ver
      `src/lib/facturacion.ts`.
    - Medido 10/09/2026 en un día real: 2.602 h sumando `ag_in_cp_log` por
      campaña frente a 189 h de unión real → **×13,8**. Por eso las horas
      logadas/ready **por campaña ya no se calculan ni se guardan**: se quitaron
      de `UnidadesCampania` y de `MetricaDiariaCampania`, y las columnas
      `horas_logadas`/`horas_ready` de `agg_daily_campaign` quedan OBSOLETAS
      (las filas anteriores a esa fecha conservan el valor inflado).
    - `horasProductivas` se calcula **en el SQL** como
      `SUM(CAST(duration AS BIGINT))/36000.0` de las atendidas, no como
      «AHT medio × atendidas»: es una cifra que se factura y no debe arrastrar
      el redondeo del AHT. El CAST evita desbordar el int al sumar décimas.

12. **Campañas `Test_*` fuera de los KPIs SIEMPRE.** `listaServicios()` ya las
    excluye en el SQL, pero el maestro `listadoCampanias()` las devuelve (lo
    necesita el mapeo del admin). Al construir el alcance sin servicio elegido
    hay que filtrarlas en `campaniasEfectivas()`, o la vista «todos los
    servicios» las cuenta (24 de 201 campañas en esta instalación).

13. **Rendimiento: no volver a `NOT EXISTS` sin cota superior sobre
    `activity_history`** (1,9 M de filas). Preguntar «¿el último evento del
    contacto cae en el rango?» con `NOT EXISTS (... event_moment >= @hastaExcl)`
    obliga a recorrer todo lo posterior al rango: **40 s para un solo día**.
    Comparar contra `MAX(event_moment)` por actividad usa el índice
    `ixactivity_act_hist` y da **0,2 s con resultado idéntico** (176×).

## Referencia del esquema RDBv2

- `docs/referencia_bbdd_altitude_v85.md` — esquema completo, enumerados, relaciones
  y queries validadas (7.1–7.8). **Consultar SIEMPRE antes de inventar tablas/columnas.**
- `docs/esquema-real.md` — generado por `npm run introspect` contra la BBDD real
  (si no existe, aún no se ha ejecutado con credenciales).
- `docs/instrucciones.md` — contexto original del flujo manual con Claude chat.

## Arquitectura

- **Next.js 16 App Router + TypeScript**, Server Components y Server Actions.
- **SQLite** (better-sqlite3 + Drizzle) en `src/lib/db/` — usuarios, sesiones,
  clientes, mapeos, billing_config, sla_config, agregados diarios, auditoría.
  Auto-migra al arrancar (`src/lib/db/sqlite.ts`).
- **RDBv2** (mssql) en `src/lib/rdb/` — pool singleton (`pool.ts`), enums cacheados
  (`enums.ts`), cache TTL (`cache.ts`), queries por dominio en `queries/*.ts`.
- **Auth propia**: sesiones en BBDD + cookie httpOnly (`src/lib/auth/`). Roles:
  `admin | direccion | operaciones | supervision | cliente`. El proxy
  (`src/proxy.ts`, el "middleware" renombrado en Next 16) solo comprueba presencia
  de cookie; la validación real la hace **cada `page.tsx`** llamando a
  `requireRol()` (`src/lib/auth/rbac.ts`), igual que cada Server Action y route
  handler. **Nunca solo en un layout**: layout y página se renderizan en
  paralelo y la redirección del layout salía con la página entera en el cuerpo
  (verificado 23/09/2026 con una cookie inventada: usuarios, IPs de auditoría y
  tarifas de `/admin/*`). `ipPeticion()` solo hace caso a
  `x-forwarded-for`/`x-real-ip` si `TRUST_PROXY=1`: esas cabeceras las pone
  quien llama y la clave del rate-limit es usuario+IP, así que sin proxy real
  delante se podía rotar la cabecera y saltarse el bloqueo de 5 intentos.
  Ponerlo a 1 SOLO al montar Caddy en F5.
- **Modo mock**: con `RDB_MOCK=1` (ver `.env.example`) la capa RDB devuelve datos
  ficticios realistas (`src/lib/rdb/mock.ts`). Permite desarrollar UI sin
  credenciales. Las páginas no distinguen mock de real.
- Vistas por rol: `/direccion`, `/operaciones`, `/supervision`, `/clientes`, `/admin`.
- **Supervisión** tiene dos pestañas (`?vista=`): «Tiempo real» (hoy, polling 60 s,
  incluye estado de agentes ahora) e «Histórico» (rango de fechas: ayer, últimos 7
  días, mes anterior o intervalo) con las mismas métricas de cola/SLA/productividad.
  Las queries comparten un `*Core(desde, hasta)`; las variantes `*Hoy` cachean 60 s
  y las `*Rango` con `ttlSegunRango`.
- **Agrupación por Cliente/Servicio**: en esta instalación **cada cliente = un
  servicio** (`ph_service`). `/direccion`, `/operaciones` y `/supervision` llevan
  un `SelectorServicio` (dropdown `?servicio=<nombre>`, vacío = todos). El server
  resuelve el servicio a sus campañas con `campaniasDeServicio()`
  (`queries/servicios.ts`, cacheado 24 h, excluye `Test_*`) y las pasa como el
  parámetro `campanias?` que ya filtra las queries EN EL SQL (`filtroCampanias`).
  Para añadir el scope a una query nueva: acepta `campanias?: string[]`, mete
  `claveCampanias(campanias)` en la clave de cache y aplica `filtroCampanias`.
  Supervisión filtra también en su API de polling (`/api/supervision/datos`).
- **Campañas IVR**: son automáticas (locución/enrutado), prefijo `IVR_` (helper
  `esIvr`). **Por defecto NO se cuentan** en los KPIs: cada panel lleva un check
  «Incluir IVR» (`?ivr=1`). `campaniasEfectivas(servicio, incluirIvr)` resuelve la
  lista (excluye `IVR_*` salvo que se marque). La llamada IVR no la atiende un
  agente: el agente/callback ocurren en hilos hermanos enlazados por `itr_global`.
  Métrica `metricasIvr` (en `queries/supervision.ts`, tarjeta en Supervisión): de
  las entrantes por IVR (`origin=1` distinct `itr_global`): **atendidas por agente**
  (hermano con `e_user.type=1` y `termination_state=1`), **no atendidas** (el resto)
  y **no atendidas en horario** = las que entraron mientras había ≥1 agente logado
  (`ag_in_cp_log op_type=0`) en las campañas del servicio → "horario de producción"
  DINÁMICO (sin config fija). OJO: el `itr_global` NO liga la no-atendida con su
  callback (los hermanos `origin=2` son salientes del agente en llamadas atendidas)
  y los números salientes van codificados ≠ entrante → el seguimiento
  «devuelta/pendiente» de callbacks quedó PENDIENTE de definir el mecanismo real.
- **Facturación por servicio o campaña**: `billing_config` tiene dos ámbitos
  mutuamente excluyentes — `serviceName` (lo normal: aplica a TODAS las campañas
  del servicio/cliente) o `campaignShortname` (excepción puntual). Al facturar,
  `calcularFacturacion()` resuelve por campaña: config de campaña → la de su
  servicio → ninguna (necesita el mapa `mapaCampaniaServicio`). Admin lo gestiona
  en `/admin/facturacion` con un selector de ámbito (servicios + campañas).

## Comandos

- `npm run dev` / `npm run build` / `npm start`
- `npm run db:generate` — generar migración tras cambiar `src/lib/db/schema.ts`
- `npm run seed:admin` — crear usuario admin inicial (parámetros por env vars)
- `npm run introspect` — validar esquema real de RDBv2 → `docs/esquema-real.md`
- `npm run agregados [-- --desde 2026-01-01 --hasta 2026-01-31]` — agregados diarios
- `npm run backup` — backup consistente del SQLite a `./backups/`
- `npm run verificar` — ejecuta los KPIs clave contra RDBv2 real y muestra
  cifras y tiempos (SLA por origen, horas reales de hoy y de ayer, unidades
  facturables, Not Ready). Es el arranque de los «tests de oro» de F2: sirve
  para comparar contra las queries SSMS antes de dar por buenos los KPIs.

## Convenciones de código

- Queries SQL: constantes template en `src/lib/rdb/queries/`, comentadas en español,
  con parámetros nombrados. Cada función exporta tipos TS del resultado.
- Componentes de servidor por defecto; `"use client"` solo para gráficas (Recharts),
  polling y formularios interactivos.
- Exports CSV: separador `;` y BOM UTF-8 (Excel español). Ver `src/lib/export/`.
- Fechas en parámetros de URL y BBDD propia: `YYYY-MM-DD` (hora local del servidor,
  que coincide con la hora de España de la centralita).
- **Tiempos: 2 decimales fijos y unidad según tipo** (decidido 18/09/2026):
  - Por interacción (AHT, conversación, ACW, cola) → **segundos**:
    `segundosLegibles()` → «192,35 s».
  - Acumulados (logadas, ready, productivo, pausas) → **horas**:
    `horasLegibles()` / `horasDesdeSegundos()` → «8,53 h». Todos los
    acumulados en la misma unidad para poder compararlos y sumarlos.
  - Todo en `src/lib/fechas.ts`. No volver a formatos tipo «3m 12s»: pasada la
    hora descartaban los segundos y no había forma de cuadrar.
  - **Redondear solo el valor FINAL**, nunca un parcial que se vaya a sumar
    (`redondear2()` en `queries/util.ts`). Medido en agosto 2026: redondear las
    horas productivas por día y luego por campaña descuadraba la suma de la
    tabla 11 min respecto al total real; redondeando solo al final, 53 s (el
    mínimo posible con 80 filas a 0,01 h).
  - En XLSX, las columnas de tiempo llevan `formato: FORMATO_2_DECIMALES`, o
    Excel recorta los ceros finales.
  - La truncación `DATEADD(SECOND, duration / 10, …)` del SQL NO descuadra:
    medido 0 s de diferencia en 7 días (las duraciones de `ag_in_cp_log` son
    segundos enteros). No hace falta pasarla a milisegundos.

## Validaciones F0 hechas contra la BBDD real (12/06/2026, ver docs/esquema-real.md)

- [x] **Décimas de segundo CONFIRMADAS** empíricamente: ratio mediano
      duration/segundos = 10.00 exacto sobre 500 muestras.
- [x] "Lead gestionado (finalizado)" = `activity.status = 3` fechado por el
      **último `event_moment` de `activity_history`** (activity.moment es la fecha
      programada, NO la de cierre). Implementado en queries/facturacion.ts.
- [x] Frescura real: replicación ~5 min · flat tables ~24 min (algo más que los
      15 min que decía la doc — mantener flats solo para histórico).
- [x] Paleta de marca real aplicada: AMARILLO #F5CF3D + negro (logo TmSystem) con
      azul #2EA9E0 como acento de gráficas, en `src/app/globals.css`.
- [x] Campañas reales con prefijo por cliente: `Soc_*` (Socios), `Bol_*` (Bolsas),
      `gh_*` (GrupoHuertas), `Avo_*` (Avolo), `CajaR_*`, `Wit_*`, `IVR_*`, marcas
      de coche sueltas (VW, Audi...). El mapeo cliente↔campañas del admin usa estos
      shortnames. Las `Test_*` NO deben mapearse a clientes.
- [ ] Pendiente F2: "tests de oro" — validar 4-5 cifras de un día contra las
      queries SSMS de Christian antes de dar por buenos los KPIs.
      (`npm run verificar` ya imprime esas cifras contra la BBDD real.)

## Auditoría 10/09/2026 (Opus 5) — correcciones aplicadas

Todas verificadas contra RDBv2 real, no solo leyendo código:

- [x] **SLA y % abandono mezclaban entrantes con salientes** → separados por
      `origin`. SLA real de un día: **76,6 %**, no el ~99 % que salía antes.
- [x] **Horas logadas de hoy** se quedaban en 44,7 h de 116,7 h reales porque
      `duration IS NULL` (sesión abierta) se contaba como 0.
- [x] **Horas logadas por campaña (×13,8)** eliminadas del pipeline y de los
      agregados; la cifra global sigue siendo la buena.
- [x] **Campañas `Test_*`** ya no entran en la vista «todos los servicios».
- [x] **Leads finalizados**: 40 s → 0,2 s con el mismo resultado.
- [x] `horasProductivas` exacta desde SQL (antes arrastraba el AHT redondeado).
- [x] `ttlSegunRango` comparaba contra fecha UTC en vez de local.
- [x] `x-forwarded-for` ya no se cree sin `TRUST_PROXY=1`.
- [x] Lint a cero (componente creado en render, `<a>` interno, var sin usar).
- [ ] **Sin resolver**: no hay tests automáticos. `npm run verificar` imprime
      cifras pero no afirma nada; convertirlo en asserts es el paso natural.

## Precisión decimal 18/09/2026 (Sonnet 5) — tiempos a 2 decimales

Motivo: las cifras no cuadraban por redondeo. Ver la regla de convenciones de
código más arriba («Tiempos: 2 decimales fijos...») para el detalle completo.
Resumen:

- [x] `redondear2()` (2 decimales) sustituye a `redondear1()` en todos los
      tiempos; `redondear1()` queda solo para magnitudes que no son tiempo.
- [x] Se dejó de redondear el valor DIARIO de horas productivas antes de
      sumarlo por campaña; ahora solo se redondea el total ya sumado. Medido
      en agosto 2026 (80 campañas): el descuadre de la suma de la tabla contra
      el total real bajó de 11 min a 53 s (el mínimo posible con 2 decimales).
- [x] UI: `segundosLegibles()` para medias por interacción (AHT, conversación,
      ACW, cola) y `horasLegibles()`/`horasDesdeSegundos()` para acumulados
      (logadas, ready, productivo, pausas). Sustituyen a `duracionLegible()`
      (formato "3m 12s" / "1h 30m", eliminado: no se podían cuadrar cifras).
- [x] XLSX: columnas de tiempo con `formato: FORMATO_2_DECIMALES` en
      `src/lib/export/xlsx.ts`, o Excel recorta los ceros finales.
- [x] Comprobado que la truncación `DATEADD(SECOND, duration/10, ...)` del SQL
      NO aporta error (0 s de diferencia medida en 7 días): no hacía falta
      pasar a milisegundos.

## Mejoras recomendadas pendientes (auditoría 10/09/2026, sin implementar)

Ninguna de estas se ha empezado. Orden de recomendación (1 = primero):

1. Tests de oro (F2): convertir `npm run verificar` en asserts contra las
   queries SSMS de Christian.
2. Programar `npm run agregados` como tarea nocturna (Programador de tareas de
   Windows) y **re-ejecutar el histórico completo** — los agregados llevan
   parados desde el 12/06/2026 y las filas anteriores al 10/09 guardan las
   horas logadas por campaña infladas (×13,8, ya eliminadas del código).
3. Degradación elegante cuando RDBv2 no responde (hoy: `ConnectionError` de
   Next sin más). `error.tsx` por vista + banner de salud visible (ya existe
   `saludRdb()`, solo lo ve /admin).
4. Alertas proactivas en Supervisión (SLA bajo, abandono alto, Not Ready largo,
   campaña con entrantes y cero agentes logados).
5. Curva intradía por franjas de 30 min (hoy todo es total diario).
6. KPI de ocupación (productivas / logadas) y % ready.
7. Cerrar o completar el portal de clientes: 0 mapeos en `client_campaigns`,
   0 usuarios con rol `cliente` → hoy da error si alguien entra.
8. Investigación acotada (2-3 días) del seguimiento de callbacks del IVR — ver
   nota "PENDIENTE de definir el mecanismo real" en la sección de Campañas IVR.
9. Módulo de calidad de datos (F4): campañas sin servicio, `Test_*` mapeadas a
   clientes, duraciones imposibles, huecos de replicación.
10. F5 (2FA + Caddy + `TRUST_PROXY=1` + `COOKIE_SECURE=1`) y programar
    `npm run backup` — nunca se ha ejecutado, no existe `./backups`. Solo
    urgente si se decide exponer a internet.

## Estrategia de modelos (contexto para futuros Claude)

La base (auth, motor de KPIs, queries) la construyó Fable 5 (junio 2026). Las tareas
restantes están pensadas para Opus/Sonnet: pulido visual, módulo de calidad de datos
(F4) y exposición a internet con 2FA + Caddy (F5). Todo el conocimiento de dominio
necesario está en este archivo y en `docs/`. Ante cualquier duda sobre el esquema
Altitude, consultar `docs/referencia_bbdd_altitude_v85.md` — no inventar.
