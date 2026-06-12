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

**Despliegue**: v0 en red local (servidor Windows); fase posterior como subdominio
público (`dashboard.tmsystem.es`) sin VPN.

**Decisiones confirmadas**:
- Stack: Next.js + TypeScript (una sola app full-stack).
- Despliegue v0: servidor Windows como servicio (NSSM).
- Datos propios de la app: SQLite (RDBv2 permanece solo-lectura).
- Facturación mixta configurable por campaña: horas de agente, por interacción,
  por éxito/venta y por lead gestionado (finalizado).
- Aprovechar Fable 5 (hasta 23/06/2026) para cimientos; delegar F4/F5 a Opus/Sonnet.

## Arquitectura

```
[Navegadores LAN] ──HTTP──> [Servidor Windows]
                              Next.js (servicio NSSM, puerto 3000)
                              ├── SQLite (usuarios, roles, config, agregados)  ← escritura
                              └── pool mssql ──TCP 1433──> [SQL Server · RDBv2] ← SOLO LECTURA
Fase 2 internet: [Caddy reverse-proxy + HTTPS] delante, subdominio dashboard.tmsystem.es
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
- [x] Proxy (middleware) + `requireRol()` en layouts; scoping cliente EN el SQL
- [x] `/admin`: usuarios (crear/editar/activar/reset), clientes + mapeo campañas,
      facturación por campaña, umbral SLA, visor auditoría, salud del sistema
- [x] `npm run seed:admin`; cambio de contraseña forzado en primer acceso

### F2 — Motor de KPIs + Supervisión + Operaciones ✅ HECHO (tests de oro pendientes)
- [x] Capa `src/lib/rdb/queries/` completa (fórmulas del doc de referencia §7)
- [x] `/supervision`: polling 60 s, estados de agentes, KPIs campañas con SLA, top agentes
- [x] `/operaciones`: unidades facturables + importes según billing_config,
      exports CSV (`;`+BOM) y XLSX, listas outbound, pausas Not Ready
- [ ] **PENDIENTE (requiere credenciales)**: "tests de oro" — validar 4-5 cifras
      de un día/campaña contra las queries SSMS de Christian

### F3 — Dirección + Portal de clientes ✅ HECHO (backfill real pendiente)
- [x] `scripts/aggregate-daily.ts` (lotes de 7 días) + tabla agg_daily_campaign
- [x] `/direccion`: KPIs vs período anterior, tendencia 12 meses, top campañas
- [x] `/clientes`: scoping estricto por campañas del cliente, export CSV
- [ ] **PENDIENTE**: backfill con datos reales + tarea programada 02:00

### F4 — Auditorías de coherencia + pulido (PENDIENTE → Sonnet/Opus)
- Módulo "Calidad de datos" en /operaciones: logins solapados, duraciones
  negativas/extremas, threads sin agente humano, contactos Done sin outcome,
  huecos de replicación, flats desfasadas
- Wallboard para supervisión (pantalla grande), pulido responsive, dark mode

### F5 — Exposición a internet (PENDIENTE → Opus)
- Caddy reverse proxy + HTTPS en dashboard.tmsystem.es (ver docs/despliegue-windows.md)
- 2FA TOTP obligatorio para roles internos; `COOKIE_SECURE=1`
- Security headers (CSP/HSTS), npm audit, backups programados verificados

## Verificación realizada (12/06/2026, modo demo RDB_MOCK=1)

- `npx tsc --noEmit` limpio · `npm run build` exit 0 (Next 16.2.9)
- `npm run seed:admin` y `npm run agregados` (backfill 12 meses demo: 5.190 filas)
- Smoke test HTTP: sin cookie → redirige a /login; con sesión: /direccion,
  /operaciones, /supervision, /clientes y todo /admin responden 200;
  API supervisión devuelve JSON; export CSV devuelve text/csv con BOM.

## Primeros pasos de la próxima sesión

1. **Tests de oro contra SSMS** (ver F2): validar con Christian 4-5 cifras de un
   día/campaña. Atención especial a "horas logadas" por campaña: con agentes
   blended abiertos en N campañas a la vez, las horas de campaña se duplican
   entre campañas (op_type=0 cuenta lo mismo en cada una) — definir con negocio
   si facturar logado, ready o productivo.
2. Crear clientes reales + mapeo campañas (prefijos: Soc_, Bol_, gh_, Avo_,
   CajaR_, Wit_...; NO mapear Test_*) + usuarios por rol en /admin.
3. Tarea programada de agregados (02:00) y backup (02:30) en el servidor definitivo
   (docs/despliegue-windows.md). El backfill 06/2025→06/2026 ya está hecho en el
   equipo de desarrollo.
4. F4 (calidad de datos, wallboard) y F5 (internet) según plan.
