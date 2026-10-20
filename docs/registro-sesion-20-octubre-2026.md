# Registro de la sesión del 20/10/2026 (Opus 5.5): Dirección no cargaba

Christian avisó a las 08:18 de que no podía entrar: «se queda colgado en la
ventana de login». El login funcionaba. Lo que se colgaba era `/direccion`,
la página a la que manda después de entrar, por una consulta que entró el día
anterior con el despliegue de `90b1192`. Se arregló con `OPTION (HASH JOIN)`
(`52329c1`), desplegado a las 09:12. La regla que queda en CLAUDE.md es la 17
(tiempos de los éxitos).

## Síntoma

- nginx: `POST /login` 200 al momento y, después, `GET /direccion` 499 (el
  navegador cerró antes de recibir nada), 500 y un `upstream timed out` a los
  180 s.
- app: tres `RequestError: Timeout: Request failed to complete in 120000ms`
  a las 08:16 y varios `The destination stream closed early`.
- Contenedores sanos, servidor sin carga (load 0,05) y RDBv2 respondiendo en
  50 ms. La réplica iba al día (último hilo, 6 minutos antes).

## Diagnóstico

Medido desde el contenedor `tareas` (misma imagen que la app, sin su caché),
con las funciones de la página y el rango por defecto: mes en curso
(01-20/10) frente al mismo rango del mes anterior, todos los clientes
(157 campañas sin IVR ni `Test_*`).

| Consulta de `/direccion` | Primera medición | Después |
| --- | --- | --- |
| `volumenPorCampania` (×2) | 0,2 s | 0,1 s |
| `unidadesPorCampania` | *timeout* 120 s | 0,8 s |
| `unidadesPorCampania` (mes anterior) | 84,8 s | 0,9 s |
| `horasAgenteReales` (×2) | 0,5 s | 0,4 s |
| `ratiosExitoRango` | **438 s** | **392 s** |
| `ratiosExitoRango` (mes anterior) | *timeout* 120 s | — |

- Dentro de `unidadesPorCampania`, la subconsulta lenta era la de éxitos
  (`script_session`): 91 s a las 08:23 y 0,2-0,8 s desde las 08:26 con el
  mismo SQL. No se cambió: lo más probable es que fuera arrastre de la carga
  de las consultas de abajo, varias en marcha a la vez.
- Cronometrando cada consulta de `ratiosExitoRango` con el código de la app:
  todas en 0,1-2 s salvo **`tiemposExitos`**, que pasó de 6 minutos.
- El mismo SQL de `tiemposExitos` copiado a mano (otro espaciado, sin un
  comentario: para SQL Server, otro texto y por tanto otro plan) tardó
  **0,5 s**. Con `OPTION (RECOMPILE)`, `FORCESEEK` o forzando el índice de
  `start_time`, lo mismo con la consulta de éxitos: 0,2 s.
- Mientras `ratiosExitoRango` tardaba 392 s, una sonda con `LOCK_TIMEOUT
  3000` cada 15 s sobre `ph_campaign`, `script_session`, `itr_thread` y
  `user_log` no encontró ni un bloqueo y respondió siempre en 0,0-0,1 s.

**Causa**: el plan que SQL Server tenía en caché para el texto exacto de
`tiemposExitos`. Ese texto solo cambia con el número de campañas del filtro,
así que es el mismo para un día (Supervisión en vivo lo pide cada 60 s) que
para un mes, y se reutiliza el plan que se compiló primero. Sin permiso para
ver los planes no se pudo confirmar con qué rango se compiló; el 19/10, al
desplegar, la página cargaba.

## Arreglo

`OPTION (HASH JOIN)` en `tiemposExitos` (`queries/ratios-exito.ts`), como el
de Resultados (regla 18): el plan ya no depende del rango con el que se
compile. Comprobado en producción con el módulo nuevo antes de desplegar:

| Rango | Alcance | Tiempo (`ratiosExitoRango` entero) | Cifras |
| --- | --- | --- | --- |
| hoy (20/10) | todos | 0,1 s | sin éxitos aún |
| 01-20/10 | todos | 1,2 s | 3.079 éxitos |
| 01-20/09 | todos | 0,9 s | 2.503 éxitos |
| septiembre | todos | 1,6 s | 5.430 éxitos (= regla 17) |
| septiembre | GrupoHuertas | 1,3 s | 2.529 éxitos, 323,56 s y 451,54 s (= regla 17) |
| septiembre | Bolsas | 1,7 s | 302,05 s y 471,22 s (= regla 17) |
| hoy (20/10) | GrupoHuertas | 0,1 s | sin éxitos aún |

Desplegado a las 09:12 (`52329c1`, imagen `613c535186f9`, sin migraciones,
backup `dashboard_20261020_0911.db`). Con la imagen nueva, las nueve
consultas de `/direccion` tardan de 0,1 a 1,0 s (los ratios, 0,9 s y 1,0 s).

## Lo que se aprendió (y queda pendiente)

- **El *timeout* de 120 s de mssql no saltó** con `tiemposExitos`: terminó
  sin error a los 392 s y a los 438 s, cuando otras consultas sí dieron
  `ETIMEOUT` a los 120 s. No se ha averiguado por qué. Consecuencia: nginx
  corta a los 180 s (504), pero la consulta sigue ocupando SQL Server y una
  conexión del pool, y **cada recarga de la página lanza otra**. Es la mejora
  3 de CLAUDE.md (degradación elegante cuando RDBv2 no responde).
- El problema de fondo puede repetirse en cualquier consulta cuyo plan
  dependa mucho del rango: el texto es el mismo para «hoy» que para un mes.
  Si otra página se queda cargando, la prueba rápida es la de hoy: el mismo
  SQL con otro texto (o con `OPTION (RECOMPILE)`). Si así va rápido, es el
  plan en caché.
- Datos de RDBv2 vistos al diagnosticar:
  - SQL Server 2019 RTM (15.0.2000.5), sin ninguna CU.
  - Nivel de compatibilidad 100, el de SQL Server 2008, así que usa el
    estimador de cardinalidad antiguo.
  - `READ_COMMITTED_SNAPSHOT` y `SNAPSHOT` desactivados: una lectura espera
    detrás de cualquier escritura de la replicación. Hoy no fue eso.
  - Las estadísticas de `ixscript_session_start_time` son del 10/09/2026. Las
    demás de `script_session` son del 01/10 y las de `itr_thread`, del 14/10.
  - El usuario SQL del dashboard (`DashTmsystem`) no tiene `VIEW SERVER
    STATE` ni `SHOWPLAN`: no puede ver planes, bloqueos ni las consultas en
    curso. Darle esos permisos (de solo lectura) facilitaría el próximo
    diagnóstico. Lo decide Christian.
- Las consultas de prueba se copiaron a `tareas` con `docker compose cp`, que
  deja los ficheros como root: para borrarlos hace falta `exec -u root`. Se
  borraron todas.
