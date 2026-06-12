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
7. **Flat tables vs replicación**: flats (`flat_int_*`, `contacts_*`) tienen ~15 min
   de retraso → para histórico. Supervisión intradía usa tablas de replicación
   (`itr_thread`, `ag_in_cp_log`...) que van casi en tiempo real.
8. Tablas con espacios en el nombre van con corchetes: `[contacts_Xperience Routing]`.
9. **Scoping de clientes EN EL SQL**: un usuario `cliente` solo ve sus campañas
   (mapeo en SQLite `client_campaigns`). El filtro se aplica como parámetros en la
   query, nunca solo ocultando UI.

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
  de cookie; la validación real ocurre en los layouts de servidor con
  `requireRol()` (`src/lib/auth/rbac.ts`).
- **Modo mock**: con `RDB_MOCK=1` (ver `.env.example`) la capa RDB devuelve datos
  ficticios realistas (`src/lib/rdb/mock.ts`). Permite desarrollar UI sin
  credenciales. Las páginas no distinguen mock de real.
- Vistas por rol: `/direccion`, `/operaciones`, `/supervision`, `/clientes`, `/admin`.

## Comandos

- `npm run dev` / `npm run build` / `npm start`
- `npm run db:generate` — generar migración tras cambiar `src/lib/db/schema.ts`
- `npm run seed:admin` — crear usuario admin inicial (parámetros por env vars)
- `npm run introspect` — validar esquema real de RDBv2 → `docs/esquema-real.md`
- `npm run agregados [-- --desde 2026-01-01 --hasta 2026-01-31]` — agregados diarios
- `npm run backup` — backup consistente del SQLite a `./backups/`

## Convenciones de código

- Queries SQL: constantes template en `src/lib/rdb/queries/`, comentadas en español,
  con parámetros nombrados. Cada función exporta tipos TS del resultado.
- Componentes de servidor por defecto; `"use client"` solo para gráficas (Recharts),
  polling y formularios interactivos.
- Exports CSV: separador `;` y BOM UTF-8 (Excel español). Ver `src/lib/export/`.
- Fechas en parámetros de URL y BBDD propia: `YYYY-MM-DD` (hora local del servidor,
  que coincide con la hora de España de la centralita).

## Validaciones pendientes con datos reales (F0 — requieren credenciales)

- [ ] Confirmar décimas de segundo empíricamente (`npm run introspect` lo comprueba
      comparando `duration` con `gmt_end_time - gmt_start_time`).
- [ ] Definición exacta de "lead gestionado (finalizado)": hoy se usa
      `activity.status = 3` (Done) con fecha `activity.moment`. Validar si la fecha
      de cierre real debe salir de `activity_history` o `contacts_*.event_moment`.
- [ ] Frescura real de las flat tables.
- [ ] Paleta de marca: variables en `src/app/globals.css` (sección "Tema TmSystem");
      ajustar con los hex exactos del logo cuando Christian los facilite.

## Estrategia de modelos (contexto para futuros Claude)

La base (auth, motor de KPIs, queries) la construyó Fable 5 (junio 2026). Las tareas
restantes están pensadas para Opus/Sonnet: pulido visual, módulo de calidad de datos
(F4) y exposición a internet con 2FA + Caddy (F5). Todo el conocimiento de dominio
necesario está en este archivo y en `docs/`. Ante cualquier duda sobre el esquema
Altitude, consultar `docs/referencia_bbdd_altitude_v85.md` — no inventar.
