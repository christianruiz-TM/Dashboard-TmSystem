# Registro de sesiones del proyecto

Todas las sesiones de trabajo del dashboard, en orden: qué se hizo, con qué commits y dónde
está el detalle. Sirve para saber cuándo y por qué cambió algo sin tener que leer todo el
histórico de git.

**De dónde sale cada sesión:**

- Siete tienen registro propio en `docs/` (las del 01-06/10, 09/10, 13-14/10, 14-16/10, 19/10, 20/10 y 20-21/10).
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
