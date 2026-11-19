# Registro de sesiones del proyecto

Todas las sesiones de trabajo del dashboard, en orden: qué se hizo, con qué commits y dónde
está el detalle. Sirve para saber cuándo y por qué cambió algo sin tener que leer todo el
histórico de git.

**De dónde sale cada sesión:**

- Diecisiete tienen registro propio en `docs/` (las del 01-06/10, 09/10, 13-14/10, 14-16/10, 19/10, 20/10, 20-21/10, 21-23/10, 23-26/10, 04/11, 06/11, 10/11, 11-12/11, 12/11, 12-13/11, 16/11 y 18/11 del escandallo).
- Las demás se han reconstruido el 14/10/2026 a partir de los commits, los apartados con fecha
  de CLAUDE.md, los «Estado de F…» de `docs/plan-planificacion.md` y el histórico de
  `docs/despliegue-linux.md`. De esas no hay transcripción.
- Donde la fuente no dice qué modelo trabajó, pone «no consta».
- Las horas son las de los commits.

**Al cerrar una sesión:**

- Añadir aquí su fila y su apartado.
- Si hubo decisiones, cifras u operaciones fuera del código, escribir además su
  `docs/registro-sesion-<fecha>.md`.

## Resumen

| # | Fecha | Modelo | Tema | Commits | Detalle |
| --- | --- | --- | --- | --- | --- |
| 1 | 12/06/2026 | Fable 5 | Dashboard v0 y validación contra RDBv2 | `74d8501` `5a48e39` `b04a8ed` | CLAUDE.md «Validaciones F0»; `plan-implementacion.md`; `esquema-real.md` |
| 2 | 10/09/2026 | Opus 5 | Auditoría de KPIs contra RDBv2 | `1dbd3fa` (el 23/09) | CLAUDE.md «Auditoría 10/09/2026» |
| 3 | 18/09/2026 | Sonnet 5 | Tiempos a 2 decimales | `1dbd3fa` (el 23/09) | CLAUDE.md «Precisión decimal 18/09/2026» |
| 4 | 23-24/09/2026 | Opus 5.5 | Auditoría de seguridad y KPIs | `d2ccaa9` `8e745c6` | CLAUDE.md «Auditoría 23/09/2026» |
| 5 | 29/09/2026 | no consta | Cola media, facturación por atendidas, hora local, agregados | `1f3bece` `19fdf18` `c9f712b` | CLAUDE.md «Auditoría 23/09/2026» (marcas del 29/09) |
| 6 | 30/09/2026 | no consta | Planificación: plan, F1 y F2 | `3aaaabd` `bafb55b` `604d2f8` `30c18c4` `9d777ce` | `plan-planificacion.md` «Estado de F1» y «Estado de F2» |
| 7 | 01/10/2026 | Opus 5.5 | Facturación GH por horas logadas | `77923c4` | CLAUDE.md «Facturación GrupoHuertas 01/10/2026»; `facturacion-horas-logadas.md` |
| 8 | 01-06/10/2026 | Opus 5.5 | Planificación F3, estimación de fin, F4 y ayuda | `c231782` `957fca8` `6e362a2` `2b30bf3` `c4e4d75` `194128c` `a887ec4` | `registro-sesion-01-06-octubre-2026.md` |
| 9 | 08/10/2026 | Opus 5.5 | Festivos y adherencia por cliente | `df48a2a` `0e04250` | `registro-sesion-01-06-octubre-2026.md` «Continuación» |
| 10 | 09/10/2026 (08:10-09:32) | no consta | Planificación F5 y puesta en producción con Docker | `2b672a0` `4813eff` `7c83561` `3861c06` `b6585cc` `9265ac9` `c32ea7e` `ca4dc52` | `plan-planificacion.md` «Estado de F5»; `despliegue-linux.md` |
| 11 | 09/10/2026 (10:00-13:31) | Opus 5.5 | Formulario de clientes y reparto de horas por campaña | `7fd140b` `bc32931` `4d053e7` `6099019` `6016013` `3e7af0a` | `registro-sesion-09-octubre-2026.md` |
| 12 | 09/10/2026 (14:25-14:46) | no consta | Ratios de éxito en Supervisión y Dirección | `12e303f` `595ca57` `e55d757` `d1a56bc` | CLAUDE.md regla 17 |
| 13 | 13/10/2026 (11:40) | no consta | Dirección ve Operaciones y Supervisión | `31f638a` `ecae120` | CLAUDE.md «Arquitectura → Auth propia»; `despliegue-linux.md` |
| 14 | 13-14/10/2026 | Opus 5.5 | Resultados de actividad (ratio bruto y neto) y tipos de campaña | `d9d70fb` `9b9e080` `708da22` `a49c856` | `registro-sesion-13-octubre-2026.md`; CLAUDE.md regla 18 |
| 15 | 14-16/10/2026 | Opus 5.5 | Tarificación desde Operaciones (sustituye al Excel de facturación), Operaciones más rápida y totales por cliente | `87f7b63` `2d564d0` (+ histórico de despliegues) | `registro-sesion-14-octubre-2026.md`; `facturacion-tarificacion.md`; CLAUDE.md reglas 16 y 19 |
| 16 | 16/10/2026 | Opus 5.5 | Alerta de Ávolo: llamadas por devolver | `1783cb3` (+ histórico de despliegues) | CLAUDE.md «Planificación → Alertas» y «Campañas IVR» |
| 17 | 19-20/10/2026 | Opus 5.5 | Dirección por cliente, comparador y filtro de origen; Supervisión por tipo de campaña; CSV de contactos de GH; artículos de GS en Operaciones (migración 0011) | `90b1192` `cf283cf` `7f1d014` `df434d8` (+ documentación) | `registro-sesion-19-octubre-2026.md`; CLAUDE.md reglas 17-20; `facturacion-tarificacion.md` §5 |
| 18 | 20/10/2026 | Opus 5.5 | Incidencia: Dirección no cargaba tras el login (plan en caché de `tiemposExitos`) | `52329c1` (+ documentación) | `registro-sesion-20-octubre-2026.md`; CLAUDE.md regla 17 |
| 19 | 20-21/10/2026 | Opus 5.5 | Guía de supervisión: al día, en pestañas por momento del mes y en un HTML único para la carpeta compartida | sin commit | `registro-sesion-20-21-octubre-2026.md`; CLAUDE.md «Planificación → Ayuda para supervisión» |
| 20 | 21/10/2026 | Opus 5.5 | Cupos y calendarios de planificación | `0ac0f0f` | CLAUDE.md «Planificación → Calendarios»; apartado 20 |
| 21 | 21/10/2026 | Opus 5.5 | Calidad de la base de datos y KPIs de supervisión | `c9c5d27` | `registro-sesion-21-23-octubre-2026.md` |
| 22 | 22-23/10/2026 | Opus 5.5 | Preparaciones, 12 cajas, Salientes y horas del cliente | `1cf6c87` `9592ab6` `bde74ba` `c741fc8` `abd4e71` `29f658f` `47e1779` | `registro-sesion-21-23-octubre-2026.md` |
| 23 | 23-26/10/2026 | Opus 5.5 | Editar ausencias, copia del horario para las agentes (PDF y móvil) y Next 16.4.2 | `c25ab60` `ac91cc2` `e832b16` (+ documentación) | `registro-sesion-23-26-octubre-2026.md` |
| 24 | 04-05/11/2026 | Opus 5.5 | Semana partida, pestaña «Horas», campana de alertas y orden alfabético | `2b5a24c` `07207df` | `registro-sesion-04-noviembre-2026.md` |
| 25 | 05/11/2026 | Opus 5.5 | Emails y entrantes rechazadas o desbordadas fuera de las llamadas; caja «Llamadas» con todas | `fceff23` `98753b4` | CLAUDE.md regla 6 |
| 26 | 06/11/2026 | Opus 5.5 | La campana sonaba todo el rato con Ávolo | `fe08c31` `bc85012` `9e700b4` | CLAUDE.md «Campana de alertas» y «Alertas» |
| 27 | 06/11/2026 | Opus 5.5 | «Mi servicio» con informe para el cliente y accesos de Planificación | `75ad403` `815f2ae` | `registro-sesion-06-noviembre-2026-mi-servicio.md`; CLAUDE.md regla 21 |
| 28 | 10/11/2026 | Opus 5.5 | La alerta de Ávolo no salió en todo el 09/11 | `3ec9e23` | CLAUDE.md «Alertas» |
| 29 | 10/11/2026 | Opus 5.5 | Contrato del día con las horas de su turno | `c55a58d` | `registro-sesion-10-noviembre-2026.md` |
| 30 | 11-12/11/2026 | Opus 5.5 | Arreglos de la auditoría de Fable del 11/11 | `2a5944b` `51250eb` | `registro-sesion-11-noviembre-2026.md`; `auditoria-2026-11-11.md` |
| 31 | 11/11/2026 | no consta | Éxitos: solo las sesiones Success tipificadas | `b93dab0` | CLAUDE.md regla 17 |
| 32 | 12-13/11/2026 | Opus 5.5 | Cuadre de llamadas con Altitude, callback con alerta y ticket, «Mi servicio» | `ae3efcd` `d593eef` `3013dcd` `2bcd6d7` | `registro-sesion-12-noviembre-2026.md`; CLAUDE.md regla 22 |
| 33 | 12-13/11/2026 | Opus 5.5 | Paneles en pestañas por sección, animación de carga y vista mensual rápida | `75bc18b` `b6acfd3` | `registro-sesion-12-13-noviembre-2026.md` |
| 34 | 16/11/2026 | Opus 5.5 | Planificación: horas restantes, regenerar desde la publicada, editar turnos y semana A↔B | `a8f0f0b` `cf2c46b` | `registro-sesion-16-noviembre-2026.md` |
| 35 | 16-17/11/2026 | Opus 5.5 | Panel de RRHH: ausencias, día, «Por agente», grupos y «Turnos» | `0eb70b0` `5452846` | `plan-rrhh.md`; CLAUDE.md regla 23 |
| 36 | 18/11/2026 | Opus 5.5 | RRHH: supervisión en solo lectura | `0175fca` `4e96d75` | `plan-rrhh.md`; CLAUDE.md regla 23 |
| 38 | 18/11/2026 | Opus 5.5 | Facturación: escandallo (precio por tramos) de Ávolo | `92a656f` `25b5cd3` `5142e9c` | `registro-sesion-18-noviembre-2026-escandallo.md`; `facturacion-tarificacion.md` §6; CLAUDE.md regla 19 |
| 39 | 18/11/2026 | Opus 5.5 | Tarificación de GH: fuera las llamadas con la ficha a medias (cuadre de octubre con operaciones) | `6ef75b3` `718270a` | `registro-sesion-18-noviembre-2026-ficha-incompleta.md`; `facturacion-tarificacion.md` §2; CLAUDE.md reglas 16 y 19 |
| 40 | 18-19/11/2026 | Opus 5.5 | Facturación de las bbdd: sin los contactos que cierra supervisión (414 de operaciones frente a 2.006) | `06080ba` | `facturacion-tarificacion.md` §2 («Bbdd»); CLAUDE.md regla 19 |
| 41 | 19/11/2026 | Opus 5.5 | Caja «Llamadas»: tramos sin campaña (cuadre de supervisión del 18/11) | `2d602a6` | CLAUDE.md, «las 12 cajas principales» (caja 2) |
| 42 | 19/11/2026 | Opus 5.5 | Supervisión: horas de las BBDD y contactos fallidos | `84096b9` | CLAUDE.md reglas 24 y 25 |

Entre el 12/06 y el 23/09 no hay commits: lo de las sesiones 2 y 3 se subió junto el 23/09.

## Sesiones

### 1 · 12/06/2026 · Dashboard v0 (Fable 5)

- Scaffold de Next.js 16 y dashboard v0 completo.
  - Capa RDBv2 con las fórmulas de Altitude y la conversión de décimas de segundo; caché, enumerados y modo demo.
  - Autenticación propia con roles.
  - Vistas de Dirección, Operaciones, Supervisión y Clientes.
  - Administración y scripts.
- Validación contra la BBDD real:
  - Décimas de segundo confirmadas (ratio 10,00).
  - Retrasos medidos: réplica ~5 min y flat tables ~24 min.
  - Leads fechados por su último evento.
  - Consulta de Supervisión de 86 s a 0,6 s.
  - Colores de la marca.

### 2 · 10/09/2026 · Auditoría de KPIs (Opus 5)

- SLA, cola y % de abandono solo de entrantes (regla 6.b): el SLA real de un día era el 76,6 %, no el ~99 %.
- Sesiones abiertas contadas como 0 en las horas logadas de hoy (regla 10.b).
- Horas logadas por campaña infladas ×13,8: quitadas (regla 11).
- `Test_*` fuera de «todos los servicios» (regla 12).
- Leads finalizados de 40 s a 0,2 s (regla 13).
- `x-forwarded-for` solo con `TRUST_PROXY=1`.
- Se subió a git el 23/09, junto con la sesión 3.

### 3 · 18/09/2026 · Precisión decimal (Sonnet 5)

- Todos los tiempos a 2 decimales: segundos por interacción y horas en los acumulados.
- Se redondea solo el valor final: el descuadre de agosto bajó de 11 min a 53 s.
- Formato de 2 decimales en los XLSX.

### 4 · 23-24/09/2026 · Auditoría de seguridad y KPIs (Opus 5.5)

- **Seguridad**:
  - `requireRol()` en cada página de `/admin`: con una cookie inventada se veía la página entera en la redirección.
  - Next 16.2.9 → 16.3.6, por una ejecución remota de código en Windows.
- **KPIs**:
  - % de abandono de Dirección y del portal de clientes solo de entrantes (14,89 % → 8,51 % el 22/09).
  - Estado de agentes con empates bien resueltos: 14 errores de 25 → 0.

### 5 · 29/09/2026 · Decisiones de KPIs y fechas en hora local (no consta)

- Cola media solo de las entrantes atendidas (12,06 s frente a 17,93 s); la espera de las abandonadas va aparte.
- «Interacciones gestionadas» facturables = atendidas (GH, 22/09: 1.160, no 1.701).
- Driver de RDBv2 en hora local (regla 14): todas las fechas iban desplazadas 2 h.
- Migración 0002 (`abandonadas_inbound`) e histórico de agregados recalculado.
- Ese día Christian tomó también las decisiones del módulo de planificación.

### 6 · 30/09/2026 · Planificación F1 y F2 (no consta)

- Plan del módulo por fases (F1-F6).
- F1: modelo SQLite (migración 0003), capa RDBv2, agregados propios y motor puro con tests. Arranca Vitest.
- F2: tablero de solo lectura, «Generar borrador» y configuración.

### 7 · 01/10/2026 · Facturación por horas logadas (Opus 5.5)

- El Excel de operaciones es `user_log`.
- Unidad nueva `horas_logadas` por cliente (regla 16): GH cuadra al céntimo con el Excel (1.027,88 h, 28.780,64 €).

### 8 · 01-06/10/2026 · Planificación F3, F4 y ayuda (Opus 5.5)

- F3: edición, ausencias, bolsas, publicación y versiones.
- Estimación de fin de campaña y RTO.
- F4: seguimiento (Hoy, adherencia, saldos, alertas y cierre).
- Ayuda en lenguaje sencillo para supervisión.
- Septiembre importado del Excel en la SQLite real.
- Registro completo en `registro-sesion-01-06-octubre-2026.md`.

### 9 · 08/10/2026 · Festivos y adherencia por cliente (Opus 5.5)

- Contrato diario = semanal ÷ 5, festivos incluidos; el festivo justifica su turno. Pendiente de que lo confirme RR. HH.
- La adherencia por cliente solo cuenta el usuario del propio cliente: septiembre, 54,5 %.

### 10 · 09/10/2026 (mañana) · F5 y producción (no consta)

- Tarea nocturna única de planificación.
- Despliegue en el servidor Ubuntu con Docker Compose (web, app y tareas), junto a tickets.
- **En producción desde las 09:19.**
- Next 16.3.8.

### 11 · 09/10/2026 (10:00-13:31) · Formulario de clientes y reparto de horas (Opus 5.5)

- Parámetros de los clientes de planificación con un formulario en vez de JSON.
- Reparto estimado de las horas logadas por campaña.
- Altas de UGR, CEFF y CajaRural por horas logadas.
- Registro completo en `registro-sesion-09-octubre-2026.md`.

### 12 · 09/10/2026 (tarde) · Ratios de éxito (no consta)

- Sección «Rendimiento por éxitos» en Supervisión: conversión por contactos y por atendidas, efectividad de cierre, éxitos por hora e índice frente a la campaña.
- En Dirección, además, la tendencia de 12 meses (migración 0006).
- Septiembre: 5.430 éxitos.
- Desplegado.

### 13 · 13/10/2026 (mañana) · Dirección ve Operaciones y Supervisión (no consta)

- Roles de cada panel en un único sitio (`ROLES_OPERACIONES` y `ROLES_SUPERVISION`).
- Desplegado a las 11:42.

### 14 · 13-14/10/2026 · Resultados de actividad (Opus 5.5)

- Pestaña «Resultados» en Supervisión (siempre de un cliente) y `/admin/resultados` (migración 0007).
- **Ratio bruto** = éxitos ÷ finalizados; **neto** = éxitos ÷ (finalizados − no válidos), con los «no válidos» configurables por servicio.
- GH, septiembre: 30,01 % y 46,40 %.
- Desplegado el 14/10/2026 a las 13:11 (migración 0007).
- Tipos de campaña por cliente para separar las BBDD de GH: sin BBDD, el neto de GH en septiembre sube al 59,97 %. Desplegado a las 14:13.
- Falta configurar los servicios y los tipos en producción.
- Registro completo en `registro-sesion-13-octubre-2026.md`.

### 15 · 14-16/10/2026 · Tarificación desde Operaciones (Opus 5.5)

- Ingeniería inversa del Excel de facturación de operaciones, verificada contra RDBv2.
- Reparto de horas logadas por campaña con el método del Excel (sustituye al del 09/10).
- Minutos de línea a fijo y a móvil (con la encuesta NFS), DDIs y «Factura por campaña» con el código de GS.
- Maestros en Operaciones (DDIs, códigos GS), cierre de mes con histórico importado, export y migración 0008.
- Septiembre: 35.120,10 € en el Excel y en el dashboard.
- Fichero de albaranes de GS el 15/10, con los ejemplos de operaciones.
- 15/10: prefijos excluidos del reparto replicados (Operaciones → Reparto) y opción «solo los meses con llamadas» en los DDIs (migración 0009).
- 15/10: ajustes manuales de un mes cerrado (quitar o cambiar precio, con motivo; migración 0010).
- 15/10: Operaciones más rápida: sin cliente por defecto («Todos» explícito), pestañas por URL y secciones en Suspense.
- Desplegado el 15/10/2026 a las 14:38 (migraciones 0008-0010); maestros e histórico importados en producción.
- 16/10: fila de total por cliente con más de una campaña y «Total general» en las tablas de tarificación y en la hoja «Factura por campaña» del XLSX Desplegado a las 14:03 (`2d564d0`, sin migraciones).
- Pendiente: tarifas de minutos y DDIs y lista de prefijos de GH en producción (Christian).
- Registro completo en `registro-sesion-14-octubre-2026.md`.

### 16 · 16/10/2026 · Alerta de Ávolo: llamadas por devolver (Opus 5.5)

- Supervisión veía «Ávolo: 9 entrantes sin atender» sin nada pendiente: la alerta contaba todas las perdidas del día (estado 7, campaña sin nadie con `Av_`) aunque ya estuvieran devueltas. Comprobado en RDBv2: las 9 se devolvieron, 3 dando ocupado.
- La devolución se liga por el número: la saliente lleva el account code delante en `to_address` (9 últimos dígitos = `from_address` de la entrante). Era el «PENDIENTE» del seguimiento de callbacks del IVR.
- `llamadasPorDevolverHoy` sustituye a `entrantesNoAtendidasHoy`: números con una perdida sin saliente de agente después ni entrante suya atendida. Un ocupado ya cuenta como devuelta (decidido con Christian). 0,1-0,2 s.
- Texto nuevo: «Ávolo: N llamadas por devolver (la más antigua, de las HH:MM)…», también en la ayuda de supervisión.
- Desplegado el 19/10/2026 a las 08:56 (`1783cb3`, sin migraciones; backup `dashboard_20261019_0854.db`). Al momento salían 2 por devolver de esa mañana, comprobadas en RDBv2.

### 17 · 19-20/10/2026 · Dirección por cliente, comparador, filtro de origen, CSV de GH y artículos de GS (Opus 5.5)

- Dirección: tabla «Por cliente» sin cliente elegido (interacciones, atendidas, % abandono, horas logadas, éxitos, finalizados y AHT; horas con `horasLogadasPorServicio`, una consulta), tarjeta «Finalizados» (contactos cerrados, como en facturación), detalle agrupado por los tipos de campaña del cliente con total por grupo (Bolsas: cartera `Bol_` + 3-4 cifras y resto) y «Comparar dos campañas». Lógica pura en `lib/direccion.ts`, con tests.
- «Tiempo por éxito» → «Conversación por éxito» (llamadas atendidas de cada éxito) y «Gestión por éxito» (`script_session.duration`, en décimas). GH septiembre: 323,56 s y 451,54 s.
- Supervisión → Resultados: buscador con autocompletado por un dato del directorio del contacto (GH: `dir_fdlt_origen`, tabla `dir_1616009371`), por valor exacto, «contiene» o sin valor; se configura en `/admin/resultados`. GH septiembre «contiene granada»: 454 finalizados, bruto 40,75 %.
- Verificado contra RDBv2 y en el `next dev`. Desplegado el 19/10/2026 a las 12:18 (`90b1192`, sin migraciones; backup `dashboard_20261019_1216.db`).
- 12:24: dados de alta en producción el tipo «Cartera» de Bolsas y el dato «Origen» de GrupoHuertas (backup `dashboard_20261019_1224.db`, con su línea en `audit_log`).
- Después: lo mismo en Supervisión (Tiempo real e Histórico): tabla de campañas agrupada por tipo con total por grupo (SLA, cola y abandono desde los recuentos) y «Comparar dos campañas»; comparador y reparto por tipo comunes a los dos paneles.
- Después: CSV de contactos finalizados de GH en Resultados (mismos filtros que la pestaña) y artículos facturables de GS en Operaciones (encuestas, 90X, DDIs geográficos y móviles, leads recibidos, finalizados en éxito y cargos puntuales de base de datos y preparación; tarifas en `/operaciones/articulos`; migración 0011). Desplegado el 20/10/2026 a las 13:15 (`df434d8`, backup `dashboard_20261020_1313.db`), con `OPTION (RECOMPILE)` en las consultas nuevas por la incidencia de la mañana (sesión 18).
- Registro completo en `registro-sesion-19-octubre-2026.md`.

### 18 · 20/10/2026 · Incidencia: Dirección no cargaba (Opus 5.5)

- «No puedo logarme, se queda colgado en la ventana de login»: el login iba bien; se colgaba `/direccion`, la página a la que manda después.
- Causa: `tiemposExitos` (ratios de éxito, del despliegue del 19/10) tardaba 390-440 s para el mes en curso de todos los clientes con el plan que SQL Server tenía en caché; el mismo SQL con otro texto, 0,5 s. Sin bloqueos en RDBv2 (comprobado con `LOCK_TIMEOUT` mientras tanto).
- Arreglo: `OPTION (HASH JOIN)` en esa consulta. Septiembre igual que lo verificado (5.430 éxitos; GH 323,56 s y 451,54 s; Bolsas 302,05 s y 471,22 s).
- Desplegado a las 09:12 (`52329c1`, solo ese fichero, sin migraciones; backup `dashboard_20261020_0911.db`). Las 9 consultas de `/direccion`, en 0,1-1,0 s.
- Pendiente: el timeout de 120 s de mssql no saltó con esa consulta (mejora 3), y los permisos del usuario SQL `DashTmsystem` para ver planes y bloqueos.
- Registro completo en `registro-sesion-20-octubre-2026.md`.

### 19 · 20-21/10/2026 · Guía de supervisión (Opus 5.5)

- La guía de Claude Docs no estaba del todo al día: la alerta de Ávolo seguía siendo «entrantes sin atender» (cambió el 19/10, sesión 16), en las dos pestañas. Corregida.
- Reorganizada en pestañas por momento del mes: «Empieza aquí» (dibujo del mes, «¿Qué quieres hacer?» y rutina), 1 Preparar, 2 Avisos y publicar, 3 Ausencias, 4 Cada día, 5 Fin de mes, 6 Configuración, Palabras y la Guía detallada. Cada tarea va junto a su pantalla. La «Guía sencilla» antigua se borró.
- Las supervisoras no tienen cuenta de claude.ai: HTML único (1,2 MB, capturas dentro, buscador, sin internet) para una carpeta compartida, con `npm run guia:html`, generado desde `ayuda-contenido.ts`. `TECLAS_AYUDA` pasa a esa fuente única.
- Probado en Chrome sin ventana (sin errores de JavaScript); `tsc`, ESLint y tests en verde.
- Pendiente: commit, dejar el HTML en la carpeta compartida y decidir si la guía cubre también el panel de Supervisión.
- Registro completo en `registro-sesion-20-21-octubre-2026.md`.

### 20 · 21/10/2026 · Cupos y calendarios de planificación (Opus 5.5)

- «Bolsas y objetivos» → «Cupos y objetivos» en pantalla, ayuda, cierre y su Excel (para no confundir con el servicio Bolsas). La ruta `/bolsas` y los nombres internos no cambian.
- Calendarios, todo en SQLite para no tocar lo que lee el Power BI: copia de `festivos_servicio`/`horarios_servicio` al generar un borrador, cambios a mano de un día por cliente (abre, cierra, horario especial) y calendario laboral de la plantilla (festivo laboral o cierre de empresa), en `/planificacion/configuracion/calendarios`. Migración 0012.
- Revisado el III Convenio de Contact Center (BOE 09/06/2023, vigente hasta el 31/12/2026): el 24 y el 31/12 no son festivos laborales (festivo especial desde las 20:00, sin descanso), así que salen del calendario de la plantilla; GH sigue cerrado esos días. El motor deja libre el turno donde el cliente base está cerrado y avisa (`base_cerrada`); tipo de ausencia CIERRE.
- Cupo prorrateado con los laborables del calendario de cada cliente (`plan.cupoLaborablesCliente`).
- Verificado contra RDBv2 en una copia de la SQLite: octubre y noviembre, plan y avisos idénticos; diciembre sin avisos duros. 253 tests, `tsc` y ESLint en verde. Probado en el `next dev`.
- Desplegado el 21/10/2026 a las 09:10 (`0ac0f0f`, migración 0012, backup `dashboard_20261021_0908.db`); tipo CIERRE dado de alta y primera copia de calendarios hecha en producción. Permisos de escritura de `DashTmsystem` retirados por Christian. Capturas de la ayuda, guía HTML y guía de Claude Docs al día.
- Pendiente: los 2 festivos locales y qué hacen el 24 y el 31/12 las 13 personas con turno sin cliente.

### 21 · 21/10/2026 · Calidad de la base de datos y KPIs de supervisión (Opus 5.5)

Registro completo de las sesiones 21 y 22: `docs/registro-sesion-21-23-octubre-2026.md`.


- «Atendidas» pasa a «Llamadas gestionadas» (en salientes no quiere decir que contestaran), con «Conversaciones» (con segmento Connected) y «Contactos» (sesiones de script) al lado.
- Bloque «Calidad de la base de datos» en Supervisión y Dirección: intentos de salida por resultado, como el gráfico de Altitude (Socios 20/10: 1.031 intentos, igual), por tipo de campaña y evolución diaria. Fuera: sin resultado, abandonadas, redirigidas, canceladas y reencoladas.
- Tiempos con reloj debajo; selector de clientes con los activos arriba y los parados abajo.
- KPIs nuevos sin mezclar familias: en «Rendimiento por éxitos» (actividad), llamadas y éxitos por hora (logada en lo agrupado, script abierto por campaña), «% éxito por llamada» y gestión sin éxito; en Resultados (contactos cerrados), «Aprovechamiento (bruto)», finalizados por éxito, llamadas por éxito (intentos a cada contacto de éxito en los 90 días antes de cerrarlo) y finalizados por hora.
- Verificado contra RDBv2 (GH septiembre: 2.529 éxitos, 1.384,22 h logadas, aprovechamiento 30,01 %, 2,52 llamadas por éxito; comprobación independiente en gh_gra_pre_mer) y en el `next dev`. 263 tests.

### 22 · 22-23/10/2026 · Preparaciones, 12 cajas, Salientes y horas del cliente (Opus 5.5)

Registro completo: `docs/registro-sesion-21-23-octubre-2026.md`. Commits desplegados: `1cf6c87`, `9592ab6`, `bde74ba`, `c741fc8`, `abd4e71`, `29f658f` y `47e1779`.


- Socios 21/10: 873 llamadas gestionadas en el panel y 577 interacciones en el informe «Socios_General» de Altitude. Cruzado uno a uno: el informe son exactamente los 577 hilos salientes con número; los 603 sin número son la preparación de cada llamada manual (el agente abre la ficha antes de marcar), de los que 539 salían «gestionados». 873 = 334 llamadas + 539 preparaciones.
- Decidido con Christian: la preparación no es una llamada (fuera de llamadas gestionadas, interacciones, AHT, intentos y llamadas por éxito), pero su tiempo es trabajo (sigue en el productivo y sale aparte en «Preparación»). Socios 21/10 cuadra resultado a resultado con Altitude; agregados recalculados.
- Cabecera nueva de Supervisión con lo importante arriba (equipo, actividad, entrantes solo si las hay) y Resultados en dos filas.
- Pendiente: planificación (ritmo de salientes) y KPIs de salida que propuso Claude.
- Por la tarde: las 12 cajas principales en el orden de Christian, iguales en Supervisión (Tiempo real, Histórico, Resultados) y Dirección, con globo de ayuda en cada tarjeta; duración media de las llamadas de éxito y sin éxito (nueva). Propuesta aprobada de 7 KPIs de salida (ocupación, contactabilidad por franja, contactos alcanzados, rellamadas agendadas, conversión por intento, tiempo esperando llamada, preparación por campaña), también para Dirección.
- 23/10: «Salientes» validado con supervisión (contacto 1781989): `activity.man_sch_moment` = «Momento de la Rellamada/Agendado manual» de Altitude y `activity.moment` = «Momento». En pantalla «momento de la rellamada», nunca «cita». Las vencidas cuentan para la agente que programó la rellamada (puede dejarla sin agente guardado) y «hecha» la puede hacer cualquier agente.
- 23/10: planificación deja de contar las preparaciones en la tasa de contacto por franja (intentos con número y resultado válido). Agregados de planificación recalculados; borradores de noviembre y diciembre idénticos bloque a bloque en una copia.
- 23/10: Resultados por agente con horas logadas y horas con ficha separadas, fila de total y agentes sin finalizados; horas totales de un cliente solo con sus usuarios (prefijo de facturación, fuera «Manu»: 80,17 h en GH en octubre).

### 23 · 23-26/10/2026 · Editar ausencias, copia del horario para las agentes y Next 16.4.2 (Opus 5.5)

Registro completo: `docs/registro-sesion-23-26-octubre-2026.md`. Commits desplegados: `c25ab60` (Next 16.4.2) y `ac91cc2` (planificación), el 23/10 a las 14:55, y `e832b16` (código de agente en la copia), el 26/10 a las 08:05 (`despliegue-linux.md` §9). Detalle técnico en CLAUDE.md «Planificación de turnos» («Copia para las agentes» y ausencias) y «Producción» (Next).

- Pedido por Christian: «Editar» en las ausencias (sin borrar y volver a crear) y una copia del plan publicado para mandar a las agentes, sin cliente, en PDF de una página y en un formato más moderno. Se eligió un HTML de un solo fichero (sin internet ni cuentas; con «¿Quién eres?», «hoy» y paso de turnos al calendario del móvil con .ics).
- La copia descuenta las ausencias de ahora: en producción, noviembre (v4) sale con 42 h menos que sus bloques por tres VAC apuntadas el 22/10, después de publicar. Esos días salen como «VAC», no como trabajo.
- Las capturas en modo demo destaparon dos fallos que se arreglaron: la tabla de ausencias ya no cabía con «Editar» y «Borrar», y los nombres repetidos no se distinguían en la copia (ahora llevan el número).
- Next 16.3.8 → 16.4.2 por dos avisos críticos. El primer build falló por el «database is locked» intermitente y llenó el disco mientras corría; con el visto bueno de Christian se borraron las imágenes viejas del dashboard y la caché de compilación (también la de tickets).
- Guía de Claude Docs y guía HTML al día (copia y edición de ausencias, capturas nuevas y ejemplos del PDF y del móvil con datos inventados). Falta dejar `guia-supervision.html` en la carpeta compartida.
- Pruebas en la SQLite de desarrollo: dos líneas de `plan_ausencia` y algunas de `export` de la prueba se quedan en su `audit_log` (no se borra la auditoría).
- 26/10, pedido por supervisión: en la copia, cada persona con su código de agente de GH («GH_0851», su usuario del cliente base sin sufijo) y de menor a mayor por él, en el PDF y en el móvil; sustituye al número en los nombres repetidos. Ejemplos de la guía de Claude Docs rehechos. El disco del servidor ya es de 77 GB.
- Pendiente: borrador nuevo de noviembre por las tres VAC del 22/10, copiar la guía HTML a la carpeta compartida y que supervisión pruebe la copia en el móvil.

### 24 · 04/11/2026 · Semana partida, pestaña «Horas», campana de alertas y orden alfabético (Opus 5.5)

Registro completo: `docs/registro-sesion-04-noviembre-2026.md`. Commit `2b5a24c`, desplegado el 04/11 a las 17:06 (`despliegue-linux.md` §9). Detalle técnico en CLAUDE.md («Saldo» y «Horas» en Planificación de turnos, «Campana de alertas» en Arquitectura y el orden alfabético en Convenciones de código).

- Contrato del día repartido según el turno: el lunes 30/11 ya no sale con +3 h y desaparece el negativo del arrastre del 1-2/10 (entre −2 y −5,20 h). Semana partida entera en el tablero, con los días del otro mes en gris.
- Pestaña «Horas» del mes: contrato frente a horas logadas por día, semana y mes, por persona y por cliente.
- Campana de alertas con sonido en todas las páginas (roles internos), «vista» y ajustes por usuario, recordatorio cada 3 min configurable y avisos de Windows con la directiva del PC (`docs/notificaciones-escritorio.md`).
- Orden alfabético en todas las tablas y desplegables, con cabeceras que ordenan; Planificación por número y los rankings de éxitos y Resultados, como estaban.
- Incidencia: el `next dev` del puerto 3000 se quedó dando error 500 tras intentar arrancar otro; hay que reiniciarlo.

### 25 · 05/11/2026 · Emails y entrantes rechazadas o desbordadas fuera de las llamadas (Opus 5.5)

Sin registro aparte: el porqué y las cifras están en CLAUDE.md (regla 6, «Los EMAILS y las ENTRANTES RECHAZADAS tampoco son llamadas») y en el comentario de `sqlLlamada` (`queries/util.ts`).

- «No me cuadran las llamadas de CEFF del 04/11» frente al informe «CEFF_General» de Altitude: mismos hilos, pero el panel contaba 8 emails como llamadas gestionadas (55 frente a 47) y 8 tramos rechazados de entrantes del IVR como recibidas de Curso_maquinista.
- `sqlLlamada` exige telefonía y quita las entrantes rechazadas (estado 7). Columna «Emails» en las tablas de campañas y agentes de Supervisión. CEFF 04/11 cuadra con el informe: 47 gestionadas, 79 intentos y 0 recibidas (12 en IVR_CEFF).
- Octubre 2026 (rechazadas y desbordadas fuera): Ávolo pasa de 530 a 145 recibidas (abandono del 8,87 % al 32,41 %) y de 663 a 304 gestionadas (359 emails); GH, de 3.932 a 3.016 recibidas (abandono del 11,32 % al 14,75 %).
- Commit `fceff23`, desplegado el 05/11 a las 12:55 (imagen `c0a2b232ccc9`, backup `dashboard_20261105_1254.db`, `despliegue-linux.md` §9), con los dos agregados recalculados desde el 01/06/2025. Comprobado en producción: CEFF 04/11 = informe y octubre, agregado = en vivo.
- Las entrantes desbordadas (estado 9, Overflow; 1.361 en GH desde el 01/09, todas con su hilo del IVR) siguen la misma regla, decidido el mismo día.
- La caja «Llamadas» (la 2 de las 12) cuenta TODAS las llamadas, contesten o no, y las gestionadas salen debajo. Lo pidió Christian porque supervisión contaba 192 llamadas hechas en gh_bbdd_autoclasse el 04/11 y la caja decía 124; ahora dice 194 (189 salientes + 5 entrantes). Llamadas por hora y por éxito siguen con las gestionadas. Commit `98753b4`, desplegado el 05/11 a las 13:28 (imagen `40cbc1e13790`, backup `dashboard_20261105_1326.db`).

### 26 · 06/11/2026 · La campana de alertas sonaba todo el rato con Ávolo (Opus 5.5)

Sin registro aparte: el porqué y las cifras están en CLAUDE.md («Campana de alertas» y la alerta de Ávolo en «Alertas» de Planificación).

- «Siempre muestra la misma aunque la marquemos como leída y no hay contactos de Ávolo para llamar»: el 05/11 sonaba toda la tarde por la llamada de las 10:05.
- Dos causas. Esa llamada venía de Alemania (`004923122400031`) y nadie la devolvió: las otras 20 perdidas del día sí. Y la campana olvidaba el «vista» cada vez que la alerta desaparecía, que en Ávolo es cada vez que alguien se conecta con `Av_`: a las 11:49, 12:18, 14:40 y 20:29 volvía «nueva» y sonaba.
- La alerta de Ávolo solo cuenta números españoles: del 01/09 al 06/11 hubo 2 perdidas de fuera y ninguna se devolvió, frente a 991 de 1.125 españolas. El 05/11 cierra a 0; el 03 y el 04/11 quedó una española en cada uno, que no se ha devuelto nunca.
- La campana marca como vistas las PARTES de cada alerta (cada llamada por devolver, la franja, la desconexión de cada agente), con la fecha, y las de hoy se guardan hasta mañana. Una parte nueva vuelve a sonar; la misma alerta que va y vuelve, no.
- 307 tests, `tsc` y ESLint en verde; la cadena del servidor probada contra RDBv2 sobre una copia de la SQLite de desarrollo.
- Segunda vuelta, el mismo día: «le dan a visto y le sigue saliendo lo mismo, y está todo llamado». La versión nueva sí guardaba lo visto (4 usuarios con vistas del formato nuevo), pero había pestañas sin recargar (11 «Failed to find Server Action» de 10:21 a 10:58; Miriam y Patricia sin ninguna vista guardada) y la alerta contaba como pendientes a clientes que nos devolvían la llamada (CEFF: llamada a las 10:42, devolución a las 10:44). Ahora no cuenta la perdida de un número al que un agente ya llamó ese día (38 de 147 en Ávolo y 27 de 33 en CEFF del 01/09 al 06/11), y la campana pide recargar cuando el servidor cambia de versión.
- Tercera vuelta: «hay contactos de Ávolo que no se tienen que llamar y los marcan como Terminados; tened en cuenta que estén pendientes». Tras cada perdida el IVR da de alta un contacto en la campaña con ese teléfono (AgentCreation, 13-92 s después): es la lista que trabajan. La alerta solo cuenta la perdida si ese contacto de hoy sigue pendiente (`status` 0/1/2); se casa por campaña, teléfono y 10 minutos porque el alta no guarda la llamada. 06/11 a las 14:13: Ávolo y CEFF a 0; sin el filtro de pendiente, la consulta encuentra los 9 contactos del día.

### 27 · 06/11/2026 · «Mi servicio» con informe para el cliente y accesos de Planificación (Opus 5.5)

Registro completo: `docs/registro-sesion-06-noviembre-2026-mi-servicio.md`. Commits `75ad403` y `815f2ae`, desplegados el 06/11 a las 14:33 (imagen `179eea0feb3c`, migración 0013, backup `dashboard_20261106_1431.db`, `despliegue-linux.md` §9). Detalle técnico en CLAUDE.md (regla 21 y «Planificación de turnos»).

- Planificación: botones «Horas» y «Ausencias» del mes en curso junto a «Hoy», y «Horas» en cada mes.
- «Mi servicio» nuevo, para supervisión, operaciones, dirección y el rol cliente (solo el suyo): llamadas, finalizados, no válidos, éxitos y horas logadas con sus ratios, evolución, embudo, resultados, motivos de no válido y detalle por campaña, refresco cada 60 s y filtros por tipo y campaña.
- Informe en un solo HTML de la marca (sin internet, filtrable por campaña, imprimible en A4) con comentarios; cada descarga, en la auditoría.
- Cliente = servicio de Altitude (migración 0013); en el selector, solo los clientes dados de alta con su servicio.
- Verificado contra RDBv2 (GH septiembre = Resultados y cajas) y en un `next build` + `next start` de una copia: pantalla, informe, PDF y que el usuario cliente solo ve lo suyo.

### 28 · 10/11/2026 · La alerta de Ávolo no salió en todo el 09/11 (Opus 5.5)

Sin registro aparte: el porqué y las cifras están en CLAUDE.md (alerta de Ávolo en «Alertas» de Planificación) y en el comentario de `llamadasPorDevolverHoy`.

- «Ayer no nos llegó ningún aviso de contactos de Ávolo, cuando sí que hubo»: el 09/11 hubo 33 perdidas, todas devueltas, pero con unos 12 tramos sin nadie con `Av_` (el primero de 09:01 a 09:23).
- Causa: el filtro del 06/11 («solo si su contacto sigue pendiente») casaba la perdida con su contacto por el teléfono del PERFIL, que el IVR crea vacío y se rellena más tarde. Mientras la llamada estaba por devolver, nunca casaba. Se validó con el día ya cerrado, cuando el perfil ya tenía el teléfono.
- Visto en vivo el 10/11 a las 08:22 (VW_Ubeda): contacto pendiente, perfil sin teléfono y el número en `activity.resch_phone_value`. La consulta pasa a usar ese campo: Ávolo, del 01/10 al 09/11, 481 de 605 perdidas casan (449 por el perfil, todas incluidas). Con la corrección, 1 por devolver a las 08:27; con la de producción, 0.
- 326 tests y ESLint en verde. Commit `3ec9e23`, desplegado el 10/11 a las 08:44 (imagen `2a728e7c5062`, backup `dashboard_20261110_0842.db`, `despliegue-linux.md` §9). En producción, a las 08:44, la campana ya avisa de la de las 08:22.

### 29 · 10/11/2026 · Contrato del día con las horas de su turno (Opus 5.5)

Registro completo: `docs/registro-sesion-10-noviembre-2026.md`. Commit `c55a58d`, desplegado el 10/11 a las 13:28 (imagen `3fe774ce5355`, sin migraciones, backup `dashboard_20261110_1326.db`, `despliegue-linux.md` §9). Regla en CLAUDE.md («Planificación de turnos» → Saldo).

- «¿Por qué María sale con −3 h la primera semana de noviembre?»: −1 h de semana B (37 h de turno, 38 h de contrato) y −2 h de los recortes del borrador v21 del 03 y 04/11. El festivo trabajado del 02/11 es neutro (falta su FEST); la RTO del 05/11 cae fuera de su turno.
- «¿Por qué el contrato tiene decimales?» (1.781,17 h en noviembre): la semana partida del 30/11 repartía el contrato en proporción al turno. Ahora cada día cuenta las horas de su turno y el último día con turno de la semana lleva la diferencia con el contrato semanal (en el mes siguiente si cae allí). Noviembre: 1.780 h; el 30/11 de María, 9 h.
- Leyenda «Cómo se cuenta el contrato» en «Horas» y «Saldos», con las semanas partidas del mes. Ayuda, guía de Claude Docs y guía HTML al día (11/11).
- El arrastre de octubre se mueve entre −1,40 y +0,69 h según la persona. 329 tests en verde.

### 30 · 11-12/11/2026 · Arreglos de la auditoría de Fable del 11/11 (Opus 5.5)

Registro completo: `docs/registro-sesion-11-noviembre-2026.md`; la auditoría, en `docs/auditoria-2026-11-11.md`. Commits `2a5944b` (desplegado el 11/11 a las 13:30) y `51250eb` (12/11 a las 07:58), `despliegue-linux.md` §9.

- Lista de campañas vacía = ninguna (antes, todas), agregados que se ponen al día solos, Salientes acotada y SQLite que se abre al primer uso (la causa del «database is locked» al compilar).
- Límite real de 120 s por consulta con cancelación, tope de sesión de 12 h y Excel de contactos en vez de CSV.

### 31 · 11/11/2026 · Éxitos: solo las sesiones Success tipificadas (no consta)

Sin registro aparte: CLAUDE.md regla 17 («Y TIPIFICADA»). Commit `b93dab0`, desplegado el 11/11 a las 14:40 con los agregados recalculados. Bolsas 03-10/11: 162 → 156 éxitos.

### 32 · 12-13/11/2026 · Cuadre de llamadas con Altitude, callback y «Mi servicio» (Opus 5.5)

Registro completo: `docs/registro-sesion-12-noviembre-2026.md`; reglas en CLAUDE.md (caja 2 de «Las 12 cajas principales» y regla 22). Commits `ae3efcd` (12/11 13:18), `d593eef`, `3013dcd` (12/11 14:30) y `2bcd6d7` (13/11 12:58), `despliegue-linux.md` §9.

- Caja «Llamadas»: una por `itr_global`, en la campaña del tramo que termina el último (la regla de Altitude) y sin las del IVR salvo «Incluir IVR».
- Callback de las entrantes en Supervisión y Dirección, con alerta «callback sin funcionar» que abre un ticket por la API de la herramienta de tickets. El de GH no creó ninguna ficha del 03/07 al 26/10/2026.

### 33 · 12-13/11/2026 · Paneles en pestañas por sección, animación de carga y vista mensual rápida (Opus 5.5)

Registro completo: `docs/registro-sesion-12-13-noviembre-2026.md`. Commits `75bc18b` (13/11 13:10, migración 0014) y `b6acfd3` (13/11 13:37), `despliegue-linux.md` §9. Detalle técnico en CLAUDE.md («Arquitectura»: Supervisión, «Animación de carga» y «Vista mensual»).

- «Mucho scroll y es difícil perderse entre secciones»: Supervisión, Dirección y Operaciones en pestañas por sección, cada una consulta solo lo suyo, con la barra de pestañas y filtros fija arriba. El Resumen de Dirección mide 1.313 px (antes, la página entera 13.736 px).
- Dirección sin las 7 cajas de «Rendimiento por éxitos»; Operaciones con «Llamadas gestionadas» y «Contactos cerrados» y un menú «Maestros».
- Animación de carga en todo el panel: el contenido se emborrona con «Cargando datos…» mientras llega la página nueva.
- `metricasIvr` reescrita: octubre de todos los clientes, de cancelarse a los 120 s a 0,5 s, con las mismas cifras. Rangos cerrados guardados en la SQLite (migración 0014) y `npm run precalentar` a las 02:45; **relanzarlo a mano tras cada despliegue**.

### 34 · 16/11/2026 · Planificación: horas restantes, regenerar desde la publicada, editar turnos y semana A↔B (Opus 5.5)

Registro completo: `docs/registro-sesion-16-noviembre-2026.md`. Commit `a8f0f0b`, desplegado el 16/11 a las 09:10 (imagen `f5d7f79b6730`, sin migraciones, backup `dashboard_20261116_0909.db`, `despliegue-linux.md` §9). Reglas en CLAUDE.md («Planificación de turnos»).

- «Horas restantes» (planificadas del periodo − efectivas hasta ayer) en la pestaña Horas, solo del equipo.
- «Generar borrador» con solo la publicada: respetar sus cambios a mano o empezar de cero. La copia exacta ya existía («Nuevo borrador desde la vN»).
- Asignaciones de turno editables y borrables, también las ya empezadas; los patrones, igual que antes.
- Semana A↔B de una persona desde la letra del tablero: cambia su turno (contrato, saldo y avisos) y sus bloques de esa semana pasan al cliente base; se conserva al regenerar respetando los cambios.

### 35 · 16-17/11/2026 · Panel de RRHH: ausencias, día y «Por agente» (Opus 5.5)

Plan y decisiones en `docs/plan-rrhh.md`; regla 23 de CLAUDE.md. Migración 0015 (aplicada antes en la SQLite de desarrollo, con backup `dashboard_20261116_1049.db`). Despliegue: ver `despliegue-linux.md` §9.

- Rol `rrhh` («RRHH» en Administración → Usuarios) y `/rrhh`. Pestaña «Día»: el día de cada persona en una barra (horario, conectada, pausas, sin conectar, ausencias apuntadas), cajas, detalle por persona con notas y alta de ausencias, Excel del día. Pestaña «Por agente»: de un periodo, tiempo conectado y tiempo ausente (solo pausas de ausencia) desplegable por motivo con tiempo acumulado y veces, ausencias apuntadas aparte, Excel. Configuración: horario aprendido o confirmado (hasta dos tramos por día), contrato con aviso frente a Planificación, motivos de pausa y tipos de ausencia.
- Averiguado: `NREADY_REASON_NOT_WORKING` es casi siempre el rato entre conectarse y el primer «Disponible»; los jueves de Bolsas son de turno partido; «Fin de Jornada» se pone también al cambiar de usuario de Altitude (por eso las pausas de menos de 1 min no cuentan).
- 17/11, tras el primer despliegue: filtro «Todos · Bolsas · Socios · GH» en las tres pestañas y en los Excel (GH = plantilla de Planificación; si no, prefijo del usuario principal; corregible en Configuración, migración 0016) y pestaña «Turnos» con el último plan publicado (lo mismo que la copia para las agentes) y su PDF. «Día» toma el horario de la plantilla solo del plan publicado.

### 36 · 18/11/2026 · RRHH: supervisión en solo lectura (Opus 5.5)

Pedido por Christian. Sin migraciones. Despliegue: ver `despliegue-linux.md` §9 (07:57, backup `dashboard_20261118_0756.db`).

- `supervision` entra en `ROLES_RRHH_LECTURA` (`src/lib/auth/rbac.ts`), como dirección: ve «RRHH» en el menú, las pestañas Día, Por agente y Turnos, los Excel, el PDF de turnos y la Configuración. No apunta notas ni ausencias desde el panel ni cambia la Configuración: las Server Actions exigen `ROLES_RRHH_EDICION` (solo `rrhh`; admin siempre) y la pantalla oculta lo editable con `puedeEditarRrhh`. Las ausencias las sigue apuntando desde Planificación.
- Abrir el detalle de una persona queda en `audit_log` (`rrhh_ver_persona`), igual que con dirección.
- Operaciones y el cliente siguen sin ver el panel.
- Precalentado relanzado tras el despliegue: 103 s, 121 consultas, 0 fallos.
- Pendiente: comprobarlo en el navegador con una cuenta de supervisión.

### 37 · 18/11/2026 · Tarificación: los minutos en espera también se cobran (Opus 5.5)

Pedido por operaciones (Ávolo, Tarificación). Commit `ae15a51`, sin migraciones. Despliegue: ver `despliegue-linux.md` §9 (backup `dashboard_20261118_1117.db`). Regla 19 de CLAUDE.md y `docs/facturacion-tarificacion.md`.

- El «estado 7» que pedía operaciones no es una transferencia: en `rdb_enums` (`InteractionSegmentState`) el 7 es **Held**, la llamada en espera. El cliente sigue en la línea y el operador la cobra.
- Los minutos de línea (`queries/tarificacion.ts`) cuentan ahora `itr_segment.state IN (6, 7)` en las dos fuentes (salientes atendidas y encuesta del IVR), para todos los clientes. Una espera en un hilo que no acaba atendido (la de VW_Ubeda del 17/11, «Busy», 0,68 min) sigue sin cobrarse (decidido con Christian).
- Cifras de espera en salientes atendidas: septiembre GH 0,02 min, Socios 2,68, Bolsas 0,37; octubre Ávolo 7,93 a móvil y 0,08 a fijo (operaciones: 7,98 y 0,08; 3 s de diferencia), Bolsas 0,40; 1-17/11 Ávolo 12,58 a móvil. En el IVR no hay esperas.
- Ávolo octubre con el cambio, igual en desarrollo y en producción: 275,57 min a móvil (267,63 conectados + 7,93) y 26,32 a fijo.
- Los meses cerrados son una foto y no cambian; recalcular septiembre en vivo avisará de una diferencia de pocos minutos.
- El glosario («Minutos de línea») explica que incluye el tiempo en espera.

### 38 · 18/11/2026 · Facturación: escandallo (precio por tramos) de Ávolo (Opus 5.5)

Pedido por Christian, con propuesta aprobada antes de tocar nada. Registro completo en `registro-sesion-18-noviembre-2026-escandallo.md`; detalle técnico en `facturacion-tarificacion.md` §6. Commits `92a656f` (migración 0017) y `25b5cd3`. Despliegues: ver `despliegue-linux.md` §9 (12:10 y 12:27; backups `dashboard_20261118_1207.db` y `dashboard_20261118_1224.db`). Regla 19 de CLAUDE.md.

- Escandallo de Ávolo: contactos finalizados del mes desde 600 a 4,00 €, 800 a 3,75, 1.000 a 3,60, 1.200 a 3,49 y 1.500 a 3,00; por debajo, los 4,00 de la línea. Decidido con Christian: POR VOLUMEN (todas las unidades al precio del tramo alcanzado), volumen = mes natural sumando todas las campañas de la línea, todos los finalizados. Solo Ávolo; en el futuro habrá clientes con otras formas de facturar.
- `billing_config.tramos` (null = precio fijo), `lib/escandallo.ts` y `aplicarEscandallos` (`lib/facturacion-campania.ts`), puros con tests; volumen por mes desde `metricasDiariasPorCampania`, sin consultas nuevas. Con varios meses, cada uno con su tramo.
- Pantallas: «Precio por tramos» en Artículos y tarifas (auditado `~tramos`), tarjeta en la Factura con el tramo de cada mes y cuánto falta para bajar de precio, y el cálculo en el globo del importe. El cierre guarda el precio aplicado; el fichero de GS no cambia.
- Tramos dados de alta en producción en la línea 17 (Ávolo, leads, 4 €) a las 12:12, con su fila en `audit_log` («Claude (pedido por Christian)»).
- Ávolo: septiembre 500, octubre 444 y 1-17/11 313 finalizados: siempre a 4,00 € (octubre 1.776 €, igual que antes). Del 01/09 al 17/11 suman 1.257, pero cada mes va por separado.
- `25b5cd3`: el «faltan N para bajar» apuntaba al tramo de 600 (mismo precio que la base); ahora al primero que cambia el precio (con 444, «faltan 356 para bajar a 3,75 €»).
- Visto de paso: la línea de DDIs de Ávolo (3,30 €) no suma nada en la factura de octubre (total = solo los finalizados); no se ha investigado.
- Pendiente: verlo en el navegador (Artículos y tarifas y la Factura de Ávolo).

### 39 · 18/11/2026 · Tarificación de GH: fuera las llamadas con la ficha a medias (Opus 5.5)

Pedido por Christian: «en GH, si no hay `contact` pero sí `contact_profile`, no se tienen en cuenta». Primero se simuló octubre sin tocar nada y se cuadró con la «COMPROBACION FACTURACION MES DE OCTUBRE 26 version 1 03_11_26» de operaciones; luego, «aplica todas las reglas que tiene operaciones para que en el futuro cuadre, solo para GH». Registro completo en `registro-sesion-18-noviembre-2026-ficha-incompleta.md`; detalle técnico en `facturacion-tarificacion.md` §2 («Llamadas con la ficha a medias»).

- Regla del Excel: fuera la llamada del agente con SOLO UNO de los dos campos (contacto sin perfil o al revés); su encuesta del IVR sí se cobra; los hilos sin ninguno se quedan. Vale para los minutos de línea y el reparto de horas logadas.
- Octubre GH sin BBDD: móvil 14.868,91 → 14.814,92 (43 de 43 campañas como el Excel), fijo 36,25 igual, horas por campaña al céntimo 8 → 21 de 43 (quedan gh_dimovil_mer −0,15 h y gh_la_car_toyota −0,07 h, sin regla que lo explique: retoques a mano, como en septiembre). Total de horas igual (1.206,16 h).
- Primera simulación errónea (contada a Christian): quitaba también la encuesta (−4,61 min) y no veía el caso contrario (0,08 min de un hilo de GH_1045 sin perfil).
- Opción por cliente en `/operaciones/reparto` (`facturacion.sinFichaIncompleta.<servicio>`, sin migración). Verificado con `facturacionCompleta` sobre una copia de la SQLite de desarrollo: con la opción, las cifras de arriba; sin ella, igual que antes. 443 tests, `tsc` y ESLint en verde.
- Desplegado el 18/11/2026 a las 13:14 (`6ef75b3`, imagen `98e9e8c3a5a5`, backup `dashboard_20261118_1313.db`, sin migraciones) y opción marcada para GrupoHuertas a las 13:15 (con su fila en `audit_log`). Desde producción, GH octubre: móvil 14.814,92 = Excel.
- Visto: la factura de GH en producción no tiene líneas de minutos ni de DDIs (sin tarifa dada de alta), así que el cambio de los minutos aún no mueve euros; el Excel cobra móvil a 0,05 €, fijo a 0,02 € y DDI a 2,50 € (741,47 € + 902,50 € en octubre).
- Pendiente: verlo en el navegador (Operaciones → Reparto y la Factura de GH).

### 40 · 18-19/11/2026 · Facturación de las bbdd: sin los contactos que cierra supervisión (Opus 5.5)

Pregunta de Christian: «¿por qué a operaciones le salen 414 contactos a facturar de bbdd de GH y nosotros tenemos muchísimos más?». Detalle técnico en `facturacion-tarificacion.md` §2 («Bbdd»).

- Octubre: 2.006 en el panel = 415 cerrados por una agente + 1.591 que supervisión vació en bloque (`SupervisorResubmit`, 07/10 Lexus y 08/10 granada, dimovil y autoclasse). El Excel de supervisión «Contactos sin resultado de actividad de BBDD» son 1.509 de ellos, uno a uno.
- Decidido con Christian: solo las bbdd, con una casilla en la línea (migración 0018); los 2 «sin cualificar» que cerró una agente con tipificación cuentan (415, no 413). La diferencia de 1 con los 414 de operaciones no se localizó.
- Cotejado el 19/11 con el Excel de supervisión «Finalizados Lexus y Mercedes BBDD sept_oct. 26»: octubre 415 contacto a contacto; septiembre 2.467 frente a 2.466 (un contacto de autoclasse retocado por una agente el 09/11, que el panel fecha en noviembre).
- 438 tests, `tsc` y ESLint en verde; verificado contra RDBv2 con la función del panel.
- Desplegado el 19/11/2026 a las 09:37 (`06080ba`, imagen `dfa1b8ea586c`, backup `dashboard_20261119_0934.db`, migración 0018) y casilla marcada en las 4 líneas de las bbdd a las 09:36 (backup `dashboard_20261119_0936.db`, con su fila en `audit_log`). GH octubre en producción: 415 contactos de bbdd, 1.118,50 € (antes 4.255 €); total 34.890,98 €. Octubre de GH no estaba cerrado en el panel: no hubo que reabrir.
- Pendiente: verlo en el navegador (Artículos y tarifas y la Factura de GH de octubre).

### 41 · 19/11/2026 · Caja «Llamadas»: tramos sin campaña (Opus 5.5)

Cuadre de supervisión del 18/11 con los informes de Altitude: GH 1.226 frente a 1.225 del panel, Bolsas 1.184 frente a 1.183 y Socios 616 frente a 614.

- Causa: 4 llamadas acababan con un tramo sin campaña (`campaign = -1`: la agente sigue en la línea tras cerrar la ficha; Bol_0567, Soc_nuevos ×2 y gh_aclasse_mer, este de 5 min 19 s). Era el último en terminar, así que `sqlLlamadasPorGlobal` asignaba la llamada a una campaña inexistente y no contaba. Ahora solo elige entre tramos con campaña.
- Del 01 al 18/11, los días ya cuadrados con los informes (GH 01-11/11, CEFF y Ávolo 12/11) no cambian; Socios y Bolsas suben entre 1 y 6 al día en 11 días, Ávolo +1 el 10/11.
- Respondido además: las horas de GH BBDD no salen a propósito (las bbdd no facturan por horas, regla 24); Ávolo da 7 éxitos el 18/11 y falta saber con qué los compara supervisión («???»).
- Desplegado el 19/11/2026 a las 10:21 (`2d602a6`, imagen `3df9a63743d5`, backup `dashboard_20261119_1020.db`, sin migraciones). En producción, 18/11: 1.184, 616 y 1.226.

### 42 · 19/11/2026 · Supervisión: horas de las BBDD y contactos fallidos (Opus 5.5)

Dos peticiones de Christian tras el cuadre de supervisión del 18/11.

- Horas de las BBDD: «aunque no se facturen por horas, en supervisión tienen que ver ese dato para estudiar las horas dedicadas». Con «Solo BBDD», Supervisión (Tiempo real, Histórico y Resultados) enseña las horas logadas y las cifras por hora; Dirección, Operaciones y Mi servicio, igual que antes (regla 24). GH 18/11: 19,03 h para 490 llamadas.
- Contactos fallidos (regla 25), con propuesta aprobada antes de construir: estados `Aborted…`, `Invalid` y `Rejected`, solo con movimiento en 30 días, sin campana. Pestaña «Fallidos» y casilla en el Resumen (negra con 0, roja con alguno). 19/11: 42.
- Incidencias al probar: con el filtro de campañas en la misma sentencia Bolsas tardaba 16 s (dos pasos con `#fal`: 0,7 s) e interbloqueos con la réplica en 2 de 4 pruebas (`NOLOCK` en el primer paso y reintento).
- 454 tests, `tsc` y ESLint en verde. Desplegado a las 11:34 (`84096b9`, imagen `952f57f0dc4f`, backup `dashboard_20261119_1132.db`, sin migraciones).
- Pendiente: verlo en el navegador.
