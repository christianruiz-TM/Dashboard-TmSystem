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

### F0 — Cimientos y validación del esquema real ✅ HECHO (salvo validación con BBDD real)
- [x] Scaffold Next.js 16 + TS + Tailwind v4 + shadcn/ui (Base UI) + Drizzle/SQLite
- [x] CLAUDE.md con las reglas de dominio (décimas de segundo, enums, flats...)
- [x] `scripts/introspect-rdb.ts` (validación esquema real → docs/esquema-real.md)
- [ ] **PENDIENTE (requiere credenciales)**: ejecutar `npm run introspect` y revisar
      el informe: confirmación décimas, estructura activity_history (fecha de
      "lead finalizado"), frescura flats
- [ ] **PENDIENTE**: paleta exacta del logo (hoy: azul corporativo aproximado en
      `src/app/globals.css`, sección "Tema TmSystem")

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

## Primeros pasos de la próxima sesión (cuando haya credenciales RDBv2)

1. Rellenar `.env` real y `RDB_MOCK=0`.
2. `npm run introspect` → revisar docs/esquema-real.md (décimas, activity_history).
3. Ajustar la fecha de "lead finalizado" si procede (src/lib/rdb/queries/facturacion.ts).
4. Tests de oro contra SSMS (ver F2).
5. Backfill agregados reales y tareas programadas.
6. Crear clientes reales + mapeo campañas + usuarios por rol en /admin.
