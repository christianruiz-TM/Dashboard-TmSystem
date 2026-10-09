# Dashboard TmSystem — Plan de implementación y estado

> Plan aprobado el 12/06/2026. Este documento es la referencia para continuar el
> proyecto en futuras sesiones (cualquier modelo). Estado actualizado al final.

## Contexto

TmSystem (Telemarketing Sistemas S.L.) es un contact center que opera sobre
**Altitude uCI v8.5/8.6** con **Reporting Database v2** en SQL Server. El flujo
anterior era manual: queries generadas en Claude chat y ejecutadas en SSMS contra
**RDBv2** (Subscription DB de replicación, solo lectura).

**Objetivo**: dashboard web multi-rol que sustituya ese flujo:

- **Dirección/Negocio**: visión global y tendencias.
- **Operaciones/Facturación**: unidades facturables por cliente/campaña + exportaciones.
- **Supervisión**: intradía casi en tiempo real (agentes, colas, abandonos).
- **Clientes**: portal con SOLO sus campañas.
- **Admin** (Christian, Responsable TI): acceso total + gestión.

**Despliegue**: en red local, solo por la VPN. Se planeó en un servidor Windows,
pero desde el 09/10/2026 está en el servidor **Ubuntu** 192.168.151.38 (el de
tickets) con Docker Compose, en el puerto 8081: ver `docs/despliegue-linux.md`.
Fase posterior, si se decide: subdominio público (`dashboard.tmsystem.es`).

**Decisiones confirmadas**:
- Stack: Next.js + TypeScript (una sola app full-stack).
- ~~Despliegue v0: servidor Windows como servicio (NSSM).~~ Sustituido el
  09/10/2026 por Docker en Ubuntu, igual que tickets.
- Datos propios de la app: SQLite (RDBv2 permanece solo-lectura).
- Facturación mixta configurable por campaña: horas de agente, por interacción,
  por éxito/venta y por lead gestionado (finalizado).
- Aprovechar Fable 5 (hasta 23/06/2026) para cimientos; delegar F4/F5 a Opus/Sonnet.

## Arquitectura

```
[Navegadores por VPN] ──HTTP :8081──> [Ubuntu 192.168.151.38 · Docker Compose «dashboard»]
                              web: nginx (único puerto publicado)
                              app: Next.js (next start, :3000 interno)
                              ├── SQLite (usuarios, roles, config, agregados)  ← escritura
                              └── pool mssql ──TCP 1433──> [SQL Server · RDBv2] ← SOLO LECTURA
                              tareas: supercronic (02:00 agregados, 02:15 planificación, 02:30 backup)
Fase internet (si se decide): HTTPS en el mismo nginx (bloque comentado en docker/nginx.conf) + 2FA
```

Detalles de arquitectura, esquema SQLite, roles/vistas y convenciones: ver
`CLAUDE.md` (raíz) y el código en `src/lib/` (está comentado en español).

## Fases

### F0 — Cimientos y validación del esquema real ✅ HECHO Y VALIDADO CONTRA BBDD REAL
- [x] Scaffold Next.js 16 + TS + Tailwind v4 + shadcn/ui (Base UI) + Drizzle/SQLite
- [x] CLAUDE.md con las reglas de dominio (décimas de segundo, enums, flats...)
- [x] Introspección ejecutada contra 192.168.151.21/RDBv2 (12/06/2026):
      **décimas confirmadas (ratio 10.00)**, replicación ~5 min, flats ~24 min,
      220 tablas, 1,1M hilos → docs/esquema-real.md
- [x] "Lead finalizado" corregido: fecha = último `event_moment` de
      `activity_history` (no `activity.moment`)
- [x] Paleta real del logo aplicada: amarillo #F5CF3D + negro + azul #2EA9E0
- [x] Lección de rendimiento: NO combinar hilos+colas en una sola query
      (plan de 86 s en este SQL Server); divididas tardan <1 s. Ver comentario
      en queries/supervision.ts. `serverExternalPackages` para mssql/better-sqlite3
      en next.config.ts (si no, EPARAM en producción).

### F1 — Autenticación, RBAC y Admin ✅ HECHO
- [x] Sesiones en SQLite + cookie httpOnly, bcryptjs, expiración deslizante 8 h
- [x] Rate-limit de login (5 fallos/15 min → bloqueo) + audit_log
- [x] Proxy (middleware) + `requireRol()` en CADA página (no basta el layout:
      corregido 23/09/2026, ver CLAUDE.md); scoping cliente EN el SQL
- [x] `/admin`: usuarios (crear/editar/activar/reset), clientes + mapeo campañas,
      facturación por campaña, umbral SLA, visor auditoría, salud del sistema
- [x] `npm run seed:admin`; cambio de contraseña forzado en primer acceso

### F2 — Motor de KPIs + Supervisión + Operaciones ✅ HECHO (tests de oro pendientes)
- [x] Capa `src/lib/rdb/queries/` completa (fórmulas del doc de referencia §7)
- [x] `/supervision`: polling 60 s, estados de agentes, KPIs campañas con SLA, top agentes
- [x] `/operaciones`: unidades facturables + importes según billing_config,
      exports CSV (`;`+BOM) y XLSX, listas outbound, pausas Not Ready
- [x] Auditorías contra RDBv2 real (10/09, 23/09 y 29/09/2026): SLA/abandono
      solo entrantes, horas reales sin duplicar, cola media de atendidas,
      estado de agentes, driver en hora local… Detalle en CLAUDE.md.
- [ ] **PENDIENTE**: "tests de oro" — validar 4-5 cifras de un día/campaña
      contra las queries SSMS de Christian y convertir `npm run verificar` en
      asserts (recomendado junto con una capa única de definiciones de KPI)

### F3 — Dirección + Portal de clientes ✅ HECHO
- [x] `scripts/aggregate-daily.ts` (lotes de 7 días) + tabla agg_daily_campaign
- [x] `/direccion`: KPIs vs período anterior, tendencia 12 meses, top campañas
- [x] `/clientes`: scoping estricto por campañas del cliente, export CSV
- [x] Backfill con datos reales 01/06/2025 → 28/09/2026 (recalculado entero el
      29/09/2026, tras corregir el UTC del driver; cuadra con RDBv2 en vivo)
- [x] Tareas programadas en el servidor desde el 09/10/2026: 02:00 agregados,
      02:15 planificación y 02:30 backup (servicio `tareas`, `docker/crontab`)

### F4 — Auditorías de coherencia + pulido (PENDIENTE → Sonnet/Opus)
- Módulo "Calidad de datos" en /operaciones: logins solapados, duraciones
  negativas/extremas, threads sin agente humano, contactos Done sin outcome,
  huecos de replicación, flats desfasadas
- Wallboard para supervisión (pantalla grande), pulido responsive, dark mode

### F5 — Exposición a internet (PENDIENTE → Opus; solo si se decide)
- [x] Proxy inverso: el nginx del compose (09/10/2026), con `TRUST_PROXY=1`
- [ ] HTTPS en ese nginx (bloque TLS comentado en `docker/nginx.conf`) y
      `COOKIE_SECURE=1`; subdominio dashboard.tmsystem.es
- [ ] 2FA TOTP obligatorio para roles internos
- [ ] CSP/HSTS. npm audit (revisado el 09/10/2026: 0 críticos en producción) y
      backups programados (hechos el 09/10/2026; falta una prueba de restauración)

## Verificación realizada (12/06/2026, modo demo RDB_MOCK=1)

- `npx tsc --noEmit` limpio · `npm run build` exit 0 (Next 16.2.9)
- `npm run seed:admin` y `npm run agregados` (backfill 12 meses demo: 5.190 filas)
- Smoke test HTTP: sin cookie → redirige a /login; con sesión: /direccion,
  /operaciones, /supervision, /clientes y todo /admin responden 200;
  API supervisión devuelve JSON; export CSV devuelve text/csv con BOM.

Desde el 23/09/2026 las verificaciones se hacen contra RDBv2 REAL (no demo) y
en build de producción; ver las secciones de auditoría de CLAUDE.md.

## Estado a 09/10/2026

- **En producción** desde el 09/10/2026 en http://192.168.151.38:8081 (Docker
  en el servidor Ubuntu de tickets; `docs/despliegue-linux.md`). La SQLite buena
  es la del servidor.
- Next 16.3.8 (16.3.6 tenía, entre otros, un SSRF en la optimización de imágenes).
- Repo en GitHub privado (`christianruiz-TM/Dashboard-TmSystem`), rama `master`.
- Módulo de planificación de turnos F1-F5 hecho (`docs/plan-planificacion.md`).

## Primeros pasos de la próxima sesión (escrito el 29/09/2026)

1. **Tests de oro contra SSMS** (ver F2): validar con Christian 4-5 cifras de un
   día/campaña y convertir `npm run verificar` en asserts. (La duda de las
   horas por campaña ya está resuelta: se factura por horas PRODUCTIVAS.)
2. Crear clientes reales + mapeo campañas (prefijos: Soc_, Bol_, gh_, Avo_,
   CajaR_, Wit_...; NO mapear Test_*) + usuarios por rol en /admin.
3. ~~Desplegar en el servidor definitivo~~ Hecho el 09/10/2026 con Docker en
   Ubuntu (`docs/despliegue-linux.md`), llevando la SQLite del equipo de
   desarrollo.
4. F4 (calidad de datos, wallboard) y F5 (internet) según plan.
