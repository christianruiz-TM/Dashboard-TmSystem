# Sesión 11/11/2026 (Opus 5.5): arreglos rápidos de la auditoría de Fable

Primer paquete de la auditoría de Fable 5.2 del 11/11/2026
(`docs/auditoria-2026-11-11.md`), elegido con Christian: arreglos pequeños que
no cambian ninguna cifra. Todo comprobado contra RDBv2 en solo lectura.

Commit `2a5944b`, desplegado el 11/11/2026 a las 13:30 (imagen
`3b1995bab5b7`, sin migraciones, backup `dashboard_20261111_1323.db`, vuelta
atrás `dashboard-app:anterior` = `3fe774ce5355`; `despliegue-linux.md` §9).
El build salió a la primera, sin «database is locked».

## 1. Qué se cambió

| Punto | Cambio | Comprobación |
| --- | --- | --- |
| F6 | `filtroCampanias([])` = `AND 1 = 0` (ninguna); `undefined` sigue siendo «todas». `campaniasEfectivas`/`campaniasDeServicio` de un servicio que no existe dan `[]`. Supervisión, Dirección y Operaciones tratan ese servicio como sin cliente y lo avisan (`AvisoServicio`). También en `metricasIvr` (su propio `IN`) y en las tendencias de `agg_daily_*` | 10/11: «todos» 158 campañas y 66 filas de volumen, GH 47 y 36 (igual que antes); `GrupoHuertass` 0 y 0 (antes, todos los clientes). Hoy no hay ningún servicio con solo campañas IVR (27 servicios) |
| F7 | `TTL.campanias` = 10 min para `rdb:servicios` y `rdb:campanias` (antes 24 h) | — |
| F5 | `npm run agregados` sin argumentos: desde el día siguiente al último agregado y, como mínimo, los últimos 7 días, hasta ayer (`lib/agregados-rango.ts`, con tests) | Copia de la SQLite de desarrollo (último día 28/09): 1.ª pasada 29/09 → 10/11 (2.178 filas); 2.ª pasada 04/11 → 10/11 |
| F9 | Salientes: `#ll` solo copia las llamadas de los contactos que se miran (`#ctc`: agendados en el rango y con momento de rellamada en los últimos 30 días, de las campañas pedidas), por el índice `ixitrthr_contact` | Versión anterior y nueva, mismas filas en GH agosto, todos 03-09/11, GH hoy, todos y GH de noviembre de 2025 (la «vencidas» de todos difería en 1 entre dos ejecuciones seguidas: es la foto del momento). Noviembre de 2025: todos 8,2 → 4,6 s; GH 5,2 → 3,6 s |
| Mejora 11 | `db` (SQLite) se abre y migra al primer uso, no al importar el módulo: `next build` ya no la abre desde varios procesos | Scripts (agregados) contra la copia; el `next dev` del puerto 3000 siguió respondiendo. Falta el build de la imagen (abajo) |
| F8 | `npm audit fix` sin `--force`: zod 4.4.3 → 4.6.7, msal-node 5.2.4 → 7.2.1 (por `mssql`), source-map-js 1.2.2, brace-expansion 1.1.21 | `npm audit --omit=dev`: de 5 altos y 3 moderados a 2 moderados (`uuid`). `mssql` conecta bien tras el cambio |
| F16 | `npm run typecheck` (`tsconfig.typecheck.json`, sin `.next`). Comentarios de `docker/crontab` y `mapaCampaniaServicio` corregidos | `typecheck` en verde |

338 tests (4 del filtro de campañas y 5 del rango de agregados nuevos), ESLint
y `typecheck` en verde.

## 2. Efecto en producción

- La primera noche tras desplegar, `npm run agregados` rellena los huecos que
  haya y rehace la última semana; los finalizados de esos días se pueden mover
  un poco (el 0,1-1 % ya medido), porque ahora se actualizan.
- Nada cambia de cifras en pantalla, salvo un cliente con solo IVR o un
  `?servicio=` que no existe (hoy, ninguno en uso).

## 3. F1: límite de tiempo real de las consultas (tarde)

- **Reproducido**: con `requestTimeout` de 3 s, una espera sola corta a los
  3,1 s, pero un primer resultado grande seguido de una espera de 6 s acaba a
  los 7,7 s SIN error, y un mensaje `RAISERROR … WITH NOWAIT` seguido de
  espera, a los 6,0 s. tedious para su reloj con el primer paquete.
- **Arreglo** en `pool.ts`, un solo sitio: `pool.request()` devuelve cada
  petición con `conLimite` (reloj de `MAX_MS_CONSULTA` = 120 s de principio
  a fin; `RDB_MAX_MS` lo cambia). Al vencer, `request.cancel()` (señal de
  atención de TDS: el servidor para el lote) y un error claro con el nombre
  de la consulta (su primer comentario `--`). Las de más de 5 s salen en el
  log como `[rdb] consulta lenta`. Cubre las 63 llamadas a `.query(` sin
  tocarlas y las que se añadan. No se hizo la función `consultar()` con un
  límite por vista que proponía la auditoría: con una consulta compartida
  en caché (`conCache`) no se apilan, y 120 s es el límite que ya se quería.
- **Comprobado contra RDBv2** con `RDB_MAX_MS=3000`: los dos casos de
  arriba se cancelan a los 3,0 s (la espera de 20 s no llega a terminar);
  una consulta de 32 ms y otra de 2 s, iguales; después, la conexión sirve
  sin transacción abierta (`@@TRANCOUNT` 0). Con el límite normal,
  `npm run verificar` y Salientes de octubre de todos los clientes (4
  consultas, tablas temporales) iguales y sin avisos de lentitud.
- Tablas temporales: las 8 (`#cerr`, `#ses`, `#lla`, `#int`, `#ctc`,
  `#ll`, `#rdy`, `#scr`) se borran al empezar su consulta, así que una
  cancelada no deja nada que moleste a la siguiente de esa conexión.
- 6 tests nuevos (`pool.test.ts`). 344 tests, ESLint y `typecheck` en verde.

## 4. F3 y F4, decididos con Christian

- **F2 resuelta sin código** (Christian, 11/11/2026): la máquina virtual
  tiene backups diarios en el CPD, así que la copia de `backups/` fuera del
  servidor no hace falta.
- **F3, tope de sesión de 12 h** (elegido entre «12 h», «12 h y 8 h sin
  uso» y «fin del día»): `auth/caducidad.ts` (puro, 5 tests) y
  `session.ts`. La sesión sigue siendo deslizante de 8 h, pero nunca pasa de
  12 h desde el login (`sessions.created_at`, que ya existía). Una pestaña
  abierta con la campana cada 60 s caduca a las 12 h (simulado minuto a
  minuto en el test). `SESSION_MAX_HORAS` lo cambia. Tiempo real y «Hoy»
  van al login si su consulta recibe un 401, en vez de quedarse con datos
  viejos y «HTTP 401». **Al desplegar, las sesiones abiertas desde hace más
  de 12 h se cierran** y esas personas tienen que volver a entrar.
- **F4, la descarga de contactos pasa a Excel** (elegido entre apóstrofo en
  el CSV, apóstrofo y botón Excel, y solo Excel). Antes de elegir se midió el
  CSV real de GH: en octubre, 9.749 filas con 1 teléfono con «+», un nombre
  «@Morenilla» y una campaña «-» (septiembre: 1 «+», 3 «-» y «-Miguel
  Angel»), y unos 40 teléfonos al mes con 0 delante, que Excel ya convertía
  en número. En el XLSX:
  - Octubre de GH generado con la cadena de la descarga y leído de nuevo:
    9.749 filas, 0 fórmulas; «-», «+…335» y «@Morenilla» como texto; la
    fecha, fecha con formato `dd/mm/yyyy hh:mm:ss` y la hora de la
    centralita (09:04:36 en los dos).
  - exceljs escribe las fechas en UTC: `fechaParaExcel` le pasa una fecha
    con los campos locales en UTC (si no, saldría 1-2 h desplazada).
  - El botón se llama «Excel de contactos» y el fichero acaba en `.xlsx`.
  - El CSV de Operaciones sigue igual (nombres de campaña y cifras, nada que
    escriba un cliente).
- 351 tests (7 nuevos: caducidad y XLSX), ESLint y `typecheck` en verde.

## 5. Pendiente

- Commit y despliegue de F1, F3 y F4.
- Añadir esta sesión a `docs/registro-sesiones.md` (tenía cambios preparados
  de otra sesión y no se tocó). Que el build no vuelva a dar «database is
  locked» se confirma del todo tras varios builds (el primero, bien).
