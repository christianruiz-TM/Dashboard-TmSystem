# Despliegue en el servidor Ubuntu (producción)

El dashboard corre en **192.168.151.38** (Ubuntu 24.04), el mismo servidor que la
herramienta de tickets y montado igual que ella: clon de GitHub, Docker Compose
y nginx delante, solo por la VPN.

| | |
|---|---|
| URL | **http://192.168.151.38:8081** (tickets sigue en el 8080) |
| Acceso al servidor | `ssh tickets-prod` (usuario `tmsystem`, sin sudo para nada de esto) |
| Carpeta | `/opt/tmsystem/dashboard`, clon de `github-dashboard:christianruiz-TM/Dashboard-TmSystem.git`, rama `master` |
| Proyecto de Compose | `dashboard` (fijo en el `docker-compose.yml`; tickets es `app`) |
| SQLite | `/opt/tmsystem/dashboard/data/dashboard.db` (en el host, fuera de git) |
| Backups | `/opt/tmsystem/dashboard/backups/` (30 últimos) y los snapshots diarios de la VM (15 días) |
| RDBv2 | 192.168.151.21:1433, usuario de solo lectura (en el `.env`) |

## Cómo está montado

```
navegador ──VPN──▶ :8081 ─▶ web (nginx) ─▶ app:3000 (next start) ─▶ RDBv2
                                               │
                         tareas (supercronic) ─┴─▶ data/dashboard.db (SQLite)
```

- **`web`**: `nginx:1.27-alpine` con `docker/nginx.conf`. Es el único puerto
  publicado. Reescribe las cabeceras de IP, así que el compose activa
  `TRUST_PROXY=1`: la auditoría guarda la IP real y el bloqueo de login va por
  usuario+IP.
- **`app`**: la imagen `dashboard-app` (`docker/app.Dockerfile`) con
  `next start`. Aplica las migraciones de la SQLite al arrancar.
- **`tareas`**: la misma imagen con `supercronic` y `docker/crontab`: 02:00
  agregados, 02:15 `planificacion:nocturno` y 02:30 backup.
- **Hora de España** (regla 14 de CLAUDE.md): el servidor está en **UTC**, pero
  los contenedores llevan `TZ=Europe/Madrid`. Las horas de la crontab son de
  Madrid todo el año. No poner tareas del dashboard en el cron del host: correrían
  en UTC (y el cron de Ubuntu no admite `CRON_TZ`).
- El compose **fuerza** `NODE_ENV=production`, `TZ`, `RDB_MOCK=0`,
  `SQLITE_PATH` y `TRUST_PROXY=1`: un `.env` copiado de `.env.example` no puede
  arrancar en modo demo ni sin proxy.
- `data/` y `backups/` se montan desde el host. El usuario `node` del contenedor
  tiene el uid 1000, el mismo que `tmsystem`, así que los ficheros son suyos.

## 1. Primera instalación

Una sola vez. Nada de esto necesita sudo ni para tickets.

```bash
ssh tickets-prod

# 1. Clave de solo lectura para clonar (una deploy key no sirve para dos repos:
#    la de tickets no vale). Añadir la .pub en GitHub → repo → Settings →
#    Deploy keys, SIN permiso de escritura.
ssh-keygen -t ed25519 -N '' -C 'dashboard@tickets-prod' -f ~/.ssh/github_dashboard
cat >> ~/.ssh/config <<'EOF'

Host github-dashboard
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_dashboard
    IdentitiesOnly yes
EOF
cat ~/.ssh/github_dashboard.pub

# 2. Clonar y preparar carpetas
git clone github-dashboard:christianruiz-TM/Dashboard-TmSystem.git /opt/tmsystem/dashboard
cd /opt/tmsystem/dashboard
mkdir -p data backups

# 3. .env: copiarlo desde el PC de desarrollo con scp (NUNCA pegar la
#    contraseña de RDBv2 en un chat). Debe llevar RDB_HOST, RDB_USER,
#    RDB_PASSWORD, RDB_DATABASE, RDB_ENCRYPT=false, RDB_TRUST_CERT=true,
#    SESSION_HORAS=8 y COOKIE_SECURE=0. Lo demás lo pone el compose.
chmod 600 .env

# 4. Espacio: la caché de build es prescindible (no toca las imágenes de
#    tickets). NO hacer `docker image prune` sin filtro: las imágenes <none>
#    son la vuelta atrás de tickets.
docker builder prune -f
df -h /

# 5. Compilar
docker compose build
docker images dashboard-app
```

### Pruebas de humo antes de meter datos

Con `SQLITE_PATH` apuntando dentro del contenedor, para no crear una base vacía
en `data/` (estorbaría al copiar la buena):

```bash
# Hora: debe salir GMT+0200 (CEST) en verano o GMT+0100 (CET) en invierno
docker compose run --rm --no-deps -e SQLITE_PATH=/tmp/prueba.db app \
  node -e "console.log(new Date().toString())"

# RDBv2 y KPIs desde el contenedor (mismas cifras que en el PC de desarrollo)
docker compose run --rm --no-deps -e SQLITE_PATH=/tmp/prueba.db app npm run verificar

# Crontab válida
docker compose run --rm --no-deps tareas supercronic -test /app/docker/crontab
```

## 2. Corte: llevarse la SQLite del PC de desarrollo

La SQLite del PC de desarrollo tiene el usuario admin, la facturación, el
histórico de agregados y **toda la planificación** (configuración, versiones,
ausencias, bolsas, ajustes de saldo). Se lleva tal cual. Unos 30-45 min; no
hacerlo entre las 02:00 y las 02:30.

1. Avisar a supervisión: que no toque la planificación hasta tener la URL nueva.
2. En el PC de desarrollo (PowerShell, en la carpeta del proyecto), con
   `npm run dev` **parado**:
   ```powershell
   npm run backup                       # → backups\dashboard_AAAAMMDD_HHmm.db
   $f = (Get-ChildItem backups\dashboard_*.db | Sort-Object Name | Select-Object -Last 1).FullName
   node -e "const D=require('better-sqlite3');const d=new D(process.argv[1],{readonly:true});console.log(d.pragma('integrity_check'))" $f
   scp $f tickets-prod:/opt/tmsystem/dashboard/data/dashboard.db
   scp $f "tickets-prod:/opt/tmsystem/backups/dashboard-$(Get-Date -Format yyyyMMdd)-pre-produccion.db"
   ```
   (`integrity_check` debe decir `ok`. En `data/` no debe haber `-wal`/`-shm`
   de otra base al lado.)
3. En el servidor:
   ```bash
   cd /opt/tmsystem/dashboard
   ls -la data/                         # solo dashboard.db
   docker compose up -d
   docker compose ps                    # app healthy, tareas y web Up
   docker compose logs app --tail 50
   ```
4. Poner al día los agregados (idempotentes: repetir días los deja iguales):
   ```bash
   docker compose exec tareas npm run agregados -- --desde 2026-09-29 --hasta <ayer>
   docker compose exec tareas npm run planificacion:nocturno -- --simular
   docker compose exec tareas npm run planificacion:nocturno
   ```
   Si esa semana aún no se había recalculado, el nocturno deja un borrador en
   «Para revisar»: es lo esperado.
5. Desde un PC con VPN, en http://192.168.151.38:8081, revisar todo esto:
   - Login.
   - Dirección, Operaciones y Supervisión, con el refresco de 60 s.
   - Planificación (tablero; guardar sobre un borrador).
   - Las exportaciones XLSX/CSV.
   - `/admin`: salud de RDBv2, frescura y «Tarea nocturna de planificación».
   - `/admin/auditoria`: tu login con la IP de tu PC.
6. `docker compose exec tareas npm run backup` debe dejar un fichero en
   `backups/`.
7. Dar la URL a los usuarios. **Desde aquí la SQLite buena es la del
   servidor**: la del PC de desarrollo solo vale para desarrollar (con
   `RDB_MOCK=1` o con una copia de un backup del servidor).

**Si algo sale mal en el corte**: `docker compose down` y volver a arrancar
`npm run dev` en el PC de desarrollo. Su SQLite no ha cambiado desde el backup.

Al día siguiente: `docker compose logs tareas --since 12h` debe mostrar las
tres tareas a las 02:00, 02:15 y 02:30 con salida correcta, y `/admin` la
tarea nocturna del día.

## 3. Actualizar a una versión nueva

En el PC de desarrollo: commit y `git push`. En el servidor:

```bash
cd /opt/tmsystem/dashboard

# 1. Backup ANTES de nada: las migraciones se aplican al arrancar `app`
docker compose exec tareas npm run backup

# 2. Guardar la imagen actual para poder volver atrás
docker tag dashboard-app:latest dashboard-app:anterior

# 3. Traer y compilar (los contenedores en marcha no se tocan todavía)
git pull --ff-only
docker compose build

# 4. Prueba de humo de la imagen nueva antes de cambiar nada
docker compose run --rm --no-deps -e SQLITE_PATH=/tmp/prueba.db app npm run verificar

# 5. Cambiar
docker compose up -d
docker compose ps
docker compose logs app --tail 50
```

Comprobar en el navegador lo tocado en esa versión y apuntar el despliegue en el
histórico (§9). Si el commit solo cambia documentación, basta `git pull --ff-only`.

## 4. Volver atrás

```bash
cd /opt/tmsystem/dashboard
docker tag dashboard-app:anterior dashboard-app:latest
git checkout <commit anterior>   # si cambiaron docker-compose.yml o nginx.conf
docker compose up -d --no-build
```

Si la versión nueva aplicó una **migración** de SQLite, restaurar además el
backup del paso 1 (§5). Después, `git checkout master` cuando se arregle.

## 5. Backups y restauración

- **Automático**: `npm run backup` a las 02:30 en `backups/`
  (`dashboard_AAAAMMDD_HHmm.db`, en hora de Madrid; conserva 30). Es la API de
  backup de SQLite: es consistente aunque la app esté escribiendo.
- **A mano** (antes de cada actualización o de tocar datos):
  `docker compose exec tareas npm run backup`.
- La carpeta entra en los snapshots diarios de la VM. Para tener una copia
  fuera del servidor: `scp tickets-prod:/opt/tmsystem/dashboard/backups/<fichero> .`

Restaurar:

```bash
cd /opt/tmsystem/dashboard
# Copia de lo que hay ahora, por si acaso. Con la API de backup: copiar el .db a
# mano dejaría fuera lo que aún está en el -wal.
docker compose exec tareas npm run backup
ls -l backups/                        # elegir el que se restaura (no el recién hecho)
docker compose stop app tareas
rm -f data/dashboard.db-wal data/dashboard.db-shm
cp backups/dashboard_<marca>.db data/dashboard.db
docker compose up -d
```

## 6. Tareas nocturnas

`docker/crontab`, que ejecuta supercronic en el servicio `tareas`. Las horas
son de Madrid:

| Hora | Tarea |
|---|---|
| 02:00 | `npm run agregados` (ayer) |
| 02:15 | `npm run planificacion:nocturno` (agregados de planificación, borrador del mes siguiente desde el día 20, recálculo de los lunes) |
| 02:30 | `npm run backup` |

Las tres son idempotentes y se ponen al día solas si alguna noche falla (RDBv2
caída, servidor apagado). Para lanzarlas a mano:
`docker compose exec tareas npm run <tarea>`. Cambiar una hora es editar
`docker/crontab`, commit y desplegar (va dentro de la imagen).

## 7. Operación diaria

```bash
cd /opt/tmsystem/dashboard
docker compose ps                         # estado
docker compose logs -f app                # logs de la web (rotan: 3 × 10 MB)
docker compose logs tareas --since 24h    # qué hicieron las tareas
docker compose restart app                # reiniciar la web
docker compose exec tareas npm run verificar

# Cualquier script del proyecto, dentro del contenedor:
docker compose exec tareas npm run planificacion:generar -- --mes 2026-11

# Importar la plantilla Excel de supervisión: primero copiarla al contenedor
scp "plantilla.xlsx" tickets-prod:/tmp/plantilla.xlsx          # desde el PC
docker compose cp /tmp/plantilla.xlsx tareas:/tmp/plantilla.xlsx
docker compose exec tareas npm run planificacion:importar-excel -- --archivo /tmp/plantilla.xlsx --mes 2026-11
```

**Disco** (19 GB, unos 5 GB libres en octubre de 2026). Revisar con `df -h /`
y `docker system df`. Para liberar espacio sin tocar tickets:

```bash
docker builder prune -f --filter until=168h
# Imágenes viejas SOLO del dashboard (las <none> de tickets no llevan esta etiqueta):
docker image prune -f --filter label=org.opencontainers.image.title=dashboard-tmsystem
```

Tras un reinicio del servidor todo vuelve solo (`restart: unless-stopped` y el
servicio docker habilitado, igual que tickets).

## 8. Problemas frecuentes

| Síntoma | Qué mirar |
|---|---|
| La página no carga (8081) | `docker compose ps`. Si `app` no está `healthy`: `docker compose logs app`. Si desde el servidor responde (`curl -I localhost:8081/login`) pero no desde la VPN, es el cortafuegos de la VPN. |
| `SSL_ERROR_RX_RECORD_TOO_LONG` / «Conexión segura fallida» | El navegador está pidiendo `https://` y el 8081 solo sirve HTTP. Escribir la dirección entera, `http://192.168.151.38:8081`, y borrar del historial la entrada con `https` (en Firefox, flecha en la sugerencia → «Eliminar»). Si sigue: Firefox, `Ajustes → Privacidad → Modo solo HTTPS` desactivado o con excepción para la IP. Se acaba del todo al activar TLS (bloque comentado de `nginx.conf`). |
| 502 Bad Gateway | `app` caída o arrancando: `docker compose logs app`. |
| Login en bucle (vuelve a la pantalla de acceso) | `COOKIE_SECURE=1` sirviendo por HTTP: ponerlo a 0 en el `.env` y `docker compose up -d`. |
| Los formularios (Server Actions) fallan | Revisar que `nginx.conf` mande `Host $http_host` y `X-Forwarded-Host $http_host` (con el puerto). |
| «Faltan variables de entorno para RDBv2» | El `.env` no tiene `RDB_HOST`/`RDB_USER`/`RDB_PASSWORD`. |
| Horas desplazadas 1-2 h | El contenedor no está en hora de Madrid: `docker compose exec app date`. Revisar `TZ` en el compose. |
| Una tarea nocturna no se ejecutó | `docker compose logs tareas --since 24h`; `/admin` («Tarea nocturna de planificación»). Lanzarla a mano: se pone al día. |
| Consulta larga corta con 504 | Pasa de 180 s (`proxy_read_timeout` de nginx); el límite de mssql es 120 s, así que es RDBv2 que no responde. |
| Error al compilar `better-sqlite3` | La etapa de build lleva `python3 make g++`; comprobar que hay salida a internet (npm, GitHub). |

## 9. Histórico de despliegues

| Fecha | Commit | Contenido | Migración | Backup previo | Vuelta atrás a |
| ----- | ------ | --------- | --------- | ------------- | -------------- |
| 2026-10-09 13:09 | `6099019` (imagen `6fa6b5b4fe42`) | Operaciones: reparto estimado de las horas logadas por campaña (según el tiempo productivo, por usuario y día). `verificar` sin errores; en producción, del 01 al 09/10 el reparto suma el total de cada cliente (GH 225,16 h, UGR 108,57 h, CEFF 1,98 h; CajaRural 0 h, sin actividad en octubre) | — | `dashboard_20261009_1307.db` | `dashboard-app:anterior` (`4a0d718ae673`); solo código |
| 2026-10-09 10:02 | `7fd140b` (imagen `4a0d718ae673`) | Parámetros de cliente de planificación con formulario en vez de JSON (Configuración → Clientes). `verificar` de la imagen nueva sin errores; los 7 clientes de la SQLite real pasan por el formulario sin perder nada (comprobado en solo lectura desde `tareas`) | — | `dashboard_20261009_1000.db` | `dashboard-app:anterior` (`8891d2349133`); solo código |
| 2026-10-09 09:31 | `c32ea7e` (imagen `8891d2349133`) | Texto de la tarjeta «Tarea nocturna» de `/admin`: remite a `docs/despliegue-linux.md` en vez de a la guía de Windows. Primera actualización con el procedimiento del §3; nginx no se reinició y encontró el contenedor nuevo | — | `dashboard_20261009_0930.db` | `dashboard-app:anterior` (`8c9c197921d4`); solo código |
| 2026-10-09 09:19 | `3861c06` (imagen `8c9c197921d4`, 745 MB) | Puesta en producción inicial con la SQLite del PC de desarrollo (backup 0918, integrity_check ok, SHA-256 comprobado). Agregados del 29/09 al 08/10 (577 filas) y nocturno de planificación (08/10). `verificar` desde el contenedor = PC al decimal | — | `/opt/tmsystem/backups/dashboard-20261009-0918-pre-produccion.db` | PC de desarrollo (`npm run dev` con su SQLite del 09/10 09:18) |
