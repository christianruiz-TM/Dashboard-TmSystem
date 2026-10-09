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

**Estado (09/10/2026):** **en producción** en **http://192.168.151.38:8081**
(servidor Ubuntu de la LAN, junto a la herramienta de tickets; solo por la VPN),
con Docker Compose. Código en GitHub (privado),
`christianruiz-TM/Dashboard-TmSystem`. Instalar, actualizar, volver atrás y
restaurar backups: `docs/despliegue-linux.md`. La SQLite buena es la del
servidor; el equipo de desarrollo es solo para desarrollar.

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
- **`docs/despliegue-linux.md`** — producción: Docker Compose en el servidor
  Ubuntu (nginx + app + tareas nocturnas), corte, actualizaciones, vuelta
  atrás, backups, operación diaria e histórico de despliegues.
- `docs/despliegue-windows.md` — alternativa NO usada (servicio Windows con
  NSSM), por si algún día hubiera que montarlo en un Windows.
- **`docs/plan-planificacion.md`** — módulo de planificación de turnos (F1-F6).

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
| `npm run planificacion:nocturno` | Tarea nocturna de planificación (agregados, borrador del día 20, recálculo de los lunes) |
| `npm test` | Tests unitarios (Vitest) |

En producción los scripts se lanzan dentro del contenedor:
`docker compose exec tareas npm run <script>` (en `/opt/tmsystem/dashboard`).
Los agregados (02:00), la planificación (02:15) y el backup (02:30) ya corren
solos cada noche, en hora de Madrid.

Stack: Next.js 16.3 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Recharts ·
mssql · better-sqlite3 + Drizzle · bcryptjs. Producción: Docker (Node 24 Alpine),
nginx y supercronic.
