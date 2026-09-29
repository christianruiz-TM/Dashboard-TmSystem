# Dashboard TmSystem

Panel de control multi-rol del contact center de **TmSystem** (Telemarketing
Sistemas S.L.). Lee los datos de **RDBv2** (réplica de solo lectura de Altitude
uCI v8.5/8.6 en SQL Server) y gestiona usuarios, permisos y configuración en una
BBDD propia SQLite.

| Vista | Rol | Contenido |
|---|---|---|
| `/direccion` | Dirección, admin | KPIs globales, comparativa mensual, tendencia 12 meses, top campañas |
| `/operaciones` | Operaciones, admin | Unidades facturables por campaña (horas productivas, interacciones atendidas, éxitos, leads), exports CSV/XLSX, listas outbound, pausas |
| `/supervision` | Supervisión, admin | «Tiempo real» (refresco 60 s): estado de agentes, cola de atendidas y espera de abandonadas, % abandono y SLA de entrantes, IVR · «Histórico»: lo mismo por rango de fechas |
| `/clientes` | Cliente | Portal del cliente: SOLO sus campañas, evolución diaria, listas, export |
| `/admin` | Admin | Usuarios, clientes y mapeo de campañas, facturación, SLA, auditoría, salud (frescura de la réplica) |

**Estado (29/09/2026):** en desarrollo en el equipo de Christian, conectado a la
RDBv2 real; **aún no desplegado en servidor**. Para desplegar, ver
`docs/despliegue-windows.md`.

## Arranque rápido (desarrollo / demo)

```bash
npm install
copy .env.example .env        # por defecto RDB_MOCK=1: datos ficticios, sin BBDD real
npm run seed:admin            # crea el usuario admin (contraseña por consola)
npm run agregados -- --desde 2025-07-01 --hasta 2026-06-11   # tendencias demo
npm run dev                   # http://localhost:3000
```

Con credenciales reales de RDBv2: edita `.env` (`RDB_MOCK=0`) y ejecuta
`npm run introspect` para validar el esquema real (genera `docs/esquema-real.md`).

## Documentación

- **`CLAUDE.md`** — reglas de dominio críticas (⚠ duraciones en décimas de segundo,
  solo entrantes para SLA/cola/abandono, driver en hora local, enumerados, flats
  vs replicación), convenciones y el registro de las auditorías contra la BBDD
  real. Leer antes de tocar queries.
- **`docs/plan-implementacion.md`** — plan por fases y estado actual.
- **`docs/referencia_bbdd_altitude_v85.md`** — esquema de RDBv2, enumerados y
  queries validadas.
- **`docs/despliegue-windows.md`** — despliegue como servicio Windows (NSSM),
  tareas programadas y fase de exposición a internet.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run seed:admin` | Crea el usuario administrador inicial |
| `npm run introspect` | Valida el esquema real de RDBv2 → docs/esquema-real.md |
| `npm run agregados` | Agregados diarios por campaña (tendencias de Dirección). Sin argumentos: ayer. Con `-- --desde … --hasta …` recalcula el rango (reemplaza los días enteros) |
| `npm run backup` | Backup consistente del SQLite a ./backups/ (guarda los 30 últimos) |
| `npm run verificar` | Imprime los KPIs clave contra la RDBv2 real, para contrastar con SSMS |
| `npm run db:generate` | Genera migración tras cambiar src/lib/db/schema.ts |

Stack: Next.js 16.3 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Recharts ·
mssql · better-sqlite3 + Drizzle · bcryptjs.
