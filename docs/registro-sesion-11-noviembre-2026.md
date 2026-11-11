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

## 3. Pendiente

- Lo siguiente de la auditoría: F1 (`consultar()` con límite de tiempo real),
  F2 (copia de los backups fuera del servidor) y las decisiones del tope de
  sesión (F3) y del CSV (F4).
- Añadir esta sesión a `docs/registro-sesiones.md` (tenía cambios preparados
  de otra sesión y no se tocó). Que el build no vuelva a dar «database is
  locked» se confirma del todo tras varios builds (el primero, bien).
