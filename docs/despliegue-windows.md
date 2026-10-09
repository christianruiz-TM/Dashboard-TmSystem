# Despliegue en servidor Windows (v0 — red local)

> **No es el despliegue real.** El dashboard se despliega en el servidor Ubuntu
> 192.168.151.38 con Docker, junto a tickets: ver
> [despliegue-linux.md](despliegue-linux.md). Esta guía queda como alternativa
> por si algún día hubiera que montarlo en un Windows.

Guía para dejar el dashboard funcionando como servicio en un servidor Windows de
la LAN de TmSystem con acceso al SQL Server de RDBv2.

## Requisitos

- Windows Server (o Windows 10/11 Pro) con acceso por TCP 1433 al SQL Server.
- **Node.js 22.12 o superior** (22 LTS o 24; probado con Node 24.15): https://nodejs.org
- Usuario SQL de **solo lectura** sobre la BBDD `RDBv2`.
- **Zona horaria del servidor: la de España** («(UTC+01:00) Bruselas,
  Copenhague, Madrid, París»), la misma
  que el SQL Server de Altitude. La conexión a RDBv2 trabaja en hora local
  (`useUTC: false`, regla 14 de CLAUDE.md): con otra zona, todos los rangos de
  fechas y el «hoy» del panel quedarían desplazados. Comprobar con `tzutil /g`
  → `Romance Standard Time`.

## Instalación

```powershell
# 1. Copiar el proyecto al servidor (o clonar el repo) p. ej. en C:\apps\dashboard-tmsystem
cd C:\apps\dashboard-tmsystem

# 2. Dependencias y build de producción
npm ci
npm run build

# 3. Configuración
Copy-Item .env.example .env
notepad .env
#   → RDB_HOST, RDB_USER, RDB_PASSWORD reales
#   → RDB_MOCK=0   (¡importante! con 1 muestra datos ficticios)

# 4. Usuario administrador inicial
$env:ADMIN_PASSWORD = "una-contraseña-temporal"   # opcional; si no, se genera una
npm run seed:admin

# 5. Validar el esquema real contra la documentación (genera docs/esquema-real.md)
npm run introspect

# 6. Backfill del histórico para las tendencias de Dirección (por lotes de 7 días;
#    cada lote reemplaza sus días enteros, se puede repetir sin miedo)
npm run agregados -- --desde 2025-06-01 --hasta <ayer, YYYY-MM-DD>

# 7. Arranque manual de prueba
npm start    # → http://localhost:3000  y desde otro PC http://<servidor>:3000
```

> Si el firewall de Windows bloquea el puerto: `New-NetFirewallRule -DisplayName
> "Dashboard TmSystem" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow`

### Alternativa a los pasos 4 y 6 (RECOMENDADA): llevarse la BBDD del equipo de desarrollo

La SQLite del equipo de desarrollo ya tiene el usuario admin, la configuración
de facturación, el histórico de agregados recalculado (29/09/2026) y **todo el
módulo de planificación**: clientes, prefijos, agentes con sus contratos,
patrones y parámetros; las versiones del plan (septiembre importado del Excel,
octubre publicado, noviembre en borrador), ausencias, bolsas, ajustes de saldo
y los agregados de planificación desde el 01/06/2025. Empezar de cero en el
servidor obligaría a repetir toda esa configuración a mano, así que conviene
llevarla:

1. En el equipo de desarrollo, **con `npm run dev` parado**: `npm run backup`
   → `backups\dashboard_AAAAMMDD_HHmm.db`.
2. En el servidor, **con la app parada**: copiar ese fichero como
   `data\dashboard.db` (sin ficheros `-wal`/`-shm` de otra copia al lado: el
   `npm run build` del paso 2 deja una base vacía con los suyos; borrar los
   tres antes de copiar).
3. Arrancar: las migraciones que falten se aplican solas. Después, completar
   los días que falten de los agregados generales con
   `npm run agregados -- --desde <día siguiente al último> --hasta <ayer>`. Los
   de planificación se ponen al día solos con `npm run planificacion:nocturno`
   (hasta 31 días atrás; si faltan más, `npm run planificacion:agregados --
   --desde <día> --hasta <ayer>` antes).
4. Desde ese momento, la SQLite buena es la del servidor: no volver a usar la
   del equipo de desarrollo para nada que se vaya a guardar.

Si aun así se empieza de cero: después del paso 6, `npm run planificacion:semilla`
(clientes, prefijos, patrones y parámetros por defecto) y
`npm run planificacion:agregados -- --desde 2025-06-01 --hasta <ayer>`, y
supervisión tendrá que revisar agentes, contratos y patrones en
/planificacion/configuracion.

Las sesiones abiertas en el equipo de desarrollo viajan en la copia, pero su
cookie es de otro servidor: en la práctica todos tendrán que volver a entrar.

## Servicio de Windows con NSSM

[NSSM](https://nssm.cc) mantiene la app arrancada y la reinicia si cae:

```powershell
nssm install DashboardTmSystem "C:\Program Files\nodejs\node.exe" `
  "C:\apps\dashboard-tmsystem\node_modules\next\dist\bin\next" start
nssm set DashboardTmSystem AppDirectory C:\apps\dashboard-tmsystem
nssm set DashboardTmSystem AppStdout C:\apps\dashboard-tmsystem\logs\salida.log
nssm set DashboardTmSystem AppStderr C:\apps\dashboard-tmsystem\logs\error.log
nssm set DashboardTmSystem AppRotateFiles 1
nssm start DashboardTmSystem
```

(Crear antes la carpeta `logs`. El `.env` se carga solo porque `AppDirectory`
apunta a la raíz del proyecto.)

## Tareas programadas (Task Scheduler)

| Tarea | Comando | Hora sugerida |
|---|---|---|
| Agregados diarios | `cmd /c "cd /d C:\apps\dashboard-tmsystem && npm run agregados"` | 02:00 |
| Planificación (nocturna) | `cmd /c "cd /d C:\apps\dashboard-tmsystem && npm run planificacion:nocturno"` | 02:15 |
| Backup SQLite | `cmd /c "cd /d C:\apps\dashboard-tmsystem && npm run backup"` | 02:30 |

Para darlas de alta de una vez (PowerShell **como administrador**, con la
carpeta `logs` ya creada; corren como SYSTEM, así que Node debe estar en el
PATH del sistema, que es lo que hace su instalador):

```powershell
schtasks /Create /TN "Dashboard TmSystem\Agregados" /SC DAILY /ST 02:00 /RU SYSTEM `
  /TR "cmd /c cd /d C:\apps\dashboard-tmsystem && npm run agregados >> logs\agregados.log 2>&1"
schtasks /Create /TN "Dashboard TmSystem\Planificacion" /SC DAILY /ST 02:15 /RU SYSTEM `
  /TR "cmd /c cd /d C:\apps\dashboard-tmsystem && npm run planificacion:nocturno >> logs\planificacion.log 2>&1"
schtasks /Create /TN "Dashboard TmSystem\Backup" /SC DAILY /ST 02:30 /RU SYSTEM `
  /TR "cmd /c cd /d C:\apps\dashboard-tmsystem && npm run backup >> logs\backup.log 2>&1"
# Probarlas sin esperar a la noche:
schtasks /Run /TN "Dashboard TmSystem\Agregados"
```

«Ayer» se calcula en hora local, así que la tarea puede ir a cualquier hora de
la madrugada (antes, programada antes de las 02:00, se saltaba un día).

La de **planificación** es una sola tarea, diaria e idempotente (se puede
lanzar dos veces sin duplicar nada). Según la fecha:

1. agregados de planificación hasta ayer, sincronización de usuarios y foto de
   listas. Si alguna noche no se ejecutó, se pone al día sola (hasta 31 días);
2. a partir del día `plan.diaGeneracion` (20), borrador del mes siguiente si no
   tiene ni borrador ni publicada;
3. los lunes (o la primera noche de la semana en que se ejecute), recálculo de
   las semanas que aún no han empezado del mes actual y del siguiente. Siempre
   como borrador: lo publicado no se toca, y supervisión lo ve en «Para
   revisar» (/planificacion y Supervisión).

Sale con código 1 si algún paso falla; el resultado de la última ejecución se
ve en /admin («Tarea nocturna de planificación»). Para ver qué haría sin
escribir nada: `npm run planificacion:nocturno -- --simular`. Si fallan los
agregados (RDBv2 caída), esa noche no genera ni recalcula; la siguiente lo
intenta otra vez.

El backup deja copias en `.\backups\` (retención: 30). Incluir esa carpeta en la
política de copias del servidor.

## Actualizaciones

```powershell
git pull          # o copiar la nueva versión
npm run backup    # ANTES de compilar (ver abajo)
npm ci
npm run build
nssm restart DashboardTmSystem
```

Las migraciones de SQLite se aplican solas al arrancar, **y también al
compilar**: `npm run build` abre la SQLite del `.env` y aplica las que falten
(así entró la 0005 en el equipo de desarrollo, sin backup previo). Por eso el
backup va antes del build.

## Problemas frecuentes

- **«Faltan variables de entorno para RDBv2»**: revisa el `.env` o pon `RDB_MOCK=1`
  para modo demo.
- **Error de conexión/cert TLS al SQL Server**: en LAN deja `RDB_ENCRYPT=false` y
  `RDB_TRUST_CERT=true` (por defecto). Si el SQL tiene certificado válido, usa
  `RDB_ENCRYPT=true`.
- **El portal del cliente sale vacío**: faltan campañas mapeadas en
  Administración → Clientes.
- **La tendencia de 12 meses sale vacía**: ejecutar el backfill de agregados (paso 6).

## Fase 2 — Exposición a internet (resumen; ver plan F5)

NO publicar el puerto 3000 directamente. Pasos previstos:

1. **Caddy** en el mismo servidor como reverse proxy con HTTPS automático:
   ```
   dashboard.tmsystem.es {
       reverse_proxy localhost:3000
   }
   ```
2. DNS del subdominio → IP pública; abrir solo 80/443 hacia el servidor.
3. En `.env`: `COOKIE_SECURE=1` y reiniciar el servicio.
4. Pendiente de F5 antes de abrir: 2FA TOTP para roles internos, revisión de
   dependencias (`npm audit`), y comprobar que el SQL Server NO es accesible
   desde fuera (solo el proxy expone 443).
