# Registro de la sesión del 01 al 06/10/2026 (Opus 5.5)

Sesión de trabajo con Christian sobre el módulo «Planificación de turnos» (rama
`feature/planificacion`). Se hicieron las fases F3 y F4 del plan, la estimación de fin de
campaña, la ayuda para supervisión (dos versiones) y varias operaciones sobre la SQLite real.
El detalle técnico de cada fase está en `docs/plan-planificacion.md` («Estado de F3»,
«Después de F3» y «Estado de F4»); aquí va el hilo de la sesión, las decisiones, lo que se
tocó fuera del código y lo que queda pendiente.

## Commits

| Fecha | Commit | Qué |
| --- | --- | --- |
| 01/10 08:58 | `c231782` | F3: edición del tablero, ausencias, bolsas, publicación y versiones |
| 02/10 08:59 | `957fca8` | Estimación de fin de campaña, horas contratadas, ayuda (primera versión) y RTO |
| 02/10 08:59 | `6e362a2` | Plan: la migración del saldo (F4) será la 0005 |
| 06/10 09:46 | `2b30bf3` | F4: Hoy, alertas, adherencia, saldos y cierre de mes |
| 06/10 11:34 | `c4e4d75` | CLAUDE.md: septiembre importado y agregados al día en la SQLite real |
| 06/10 13:02 | `194128c` | Ayuda en lenguaje sencillo para supervisión |

(`77923c4`, facturación por horas logadas del 01/10, es de otra sesión.)

## Decisiones de Christian

- **01/10**: ejecutar F3 tal como estaba en el plan.
- **02/10**:
  - RTO = «retribución de tiempo por objetivos»: tiempo libre retribuido que cuenta como trabajado, igual que VAC y FEST (AUS no).
  - La fecha de fin de una campaña no se sabe (acaba al agotarse los contactos o las horas de contrato), así que se **estima** con históricos y campañas parecidas.
  - Guía para supervisión y una ventana de ayuda en cada pantalla.
  - La fecha límite de publicación la está consultando con supervisión.
- **06/10 («sigue»)**: hacer la F4 con lo propuesto:
  - lo real sale de `user_log`, la misma fuente que la facturación;
  - el plan de septiembre se importa una vez del Excel de supervisión.
- **06/10 («hazlo»)**: dejar la F4 lista en la SQLite real: backup, agregados e importación de septiembre.
- **06/10**: ayuda para supervisoras con poco conocimiento técnico. De tres propuestas eligió la recomendada: la ventana de Ayuda en lenguaje sencillo, con capturas numeradas, más «?» en los puntos más confusos.
- **06/10**: nueva contraseña de `admin` (tercera vez; antes el 10/09 y el 17/09).

## Lo que se hizo

### F3 (01/10)

Edición del tablero (arrastrar, estirar, menú, teclado, deshacer), ausencias, bolsas y
objetivos, publicación con avisos y motivo, versiones con diff y saldo previsto. Verificado
sobre una copia de la SQLite real con Chrome headless. Detalle en «Estado de F3».

### Estimación de fin, horas contratadas y primera ayuda (02/10)

- **Fin estimado de cada campaña** en `/[mes]/bolsas`. Cálculo puro en `motor/estimacion.ts`, con test.
- Parámetros opcionales del cliente:
  - `horasContratadas` + `inicioContrato`: topan el objetivo del mes;
  - `campaniasSimilares`: fija a mano las campañas de referencia.
- **RTO** pasa a contar como trabajada en la SQLite real, con backup antes (`dashboard_20261002_0838.db`).
- Primera ventana «Ayuda» y la «Guía de planificación de turnos para supervisión» en Claude Docs.

### F4: seguimiento (06/10)

- **Pantallas**:
  - `/planificacion/hoy`: plan del día frente a quién está conectado, cobertura de GH y alertas, refrescándose cada 60 s;
  - tarjeta «Alertas de planificación» en Supervisión;
  - pestañas del mes **Adherencia**, **Saldos** (con ajustes manuales) y **Cierre** (con XLSX).
- **Fuente de lo real**: `user_log`. Agregado nuevo `agg_logado_usuario` (migración 0005). Lo que falta por agregar se lee en vivo, con caché de 60 s.
- **Importador** de la plantilla Excel (`npm run planificacion:importar-excel`): el cliente sale del color de la celda.
- **Resultados con datos reales**:
  - Adherencia de septiembre: **97,8 % por turno** (el método del prototipo da 96,6 %) y **82,6 % por cliente**.
  - El cierre de septiembre cuadra al céntimo con la facturación: GH 1.027,88 h, UGR 195,42 h y Ávolo 23,45 h. El grupo GH+BD+LX suma 1.384,22 h, como el Excel de operaciones.
  - En 5 instantes del 05/10, los conectados según el módulo coinciden con las sesiones de `ag_in_cp_log`.
- **Ajustes tras ver los datos**:
  - En adherencia «por cliente» cuentan como correcto dos casos: BD dentro de un bloque de GH, y esperar en GH durante un bloque de Ávolo (sin esto salía 55 %).
  - Las alertas son menos ruidosas: margen al subir el mínimo y una sola alerta cuando hay más de 3 sin conectar.
  - Los agentes inactivos no acumulan saldo.

### Ayuda en lenguaje sencillo (06/10)

- **Fuente única de los textos**: `components/planificacion/ayuda-contenido.ts`, con test. De ahí salen:
  - la ventana «Ayuda»: buscador, «Cómo hago…» con 20 tareas y, por pantalla, «¿Qué veo aquí?» con captura numerada, «¿Qué tengo que hacer?» y «Si pasa esto, haz esto»;
  - los 19 «?» de las pantallas;
  - la pestaña «Guía sencilla» de Claude Docs.
- **Capturas** en modo demo, con datos inventados, generadas por `scripts/ayuda-capturas.mjs`.
- **Menos jerga** en las pantallas: sin «user_log», «motor», «agregados» ni «versión vigente».

## Operaciones fuera del código

| Cuándo | Dónde | Qué | Copia previa |
| --- | --- | --- | --- |
| 02/10 | SQLite real | RTO cuenta como trabajada | `dashboard_20261002_0838.db` |
| 02/10 | Claude Docs | Guía de supervisión creada (privada) | — |
| 06/10 ~09:30 | SQLite real | **Migración 0005 aplicada por `npm run build`** (ver incidencias) | ninguna |
| 06/10 11:27 | SQLite real | Agregados de planificación del 01/06/2025 al 05/10/2026 (71 s, 94.260 islas de tiempo logado) | `dashboard_20261006_1127.db` |
| 06/10 11:30 | SQLite real | Septiembre importado: v1 publicada, 421 bloques, 1.489 h, 39 ausencias (auditoría `plan_importar`) | la misma |
| 06/10 | Claude Docs | Guía actualizada: sección de seguimiento, pestaña «Guía sencilla» (primera) con 10 capturas; la anterior pasa a «Guía detallada» | — |
| 06/10 13:08 | SQLite real | Contraseña de `admin` reseteada: cambio obligatorio al entrar, sesiones cerradas, auditoría `reset_password` | `dashboard_20261006_1308.db` |

La contraseña provisional se dio por el chat y no se guarda en ningún documento.

Las pruebas se hicieron siempre sobre copias de la SQLite y en los puertos 3100 (datos reales) y
3200 (modo demo), sin tocar el `npm run dev` del puerto 3000.

## Incidencias y lecciones

- **`npm run build` migró la SQLite real.** Al recoger los datos de las páginas, el build abre la base de `.env` desde varios procesos, y cada uno aplica las migraciones pendientes.
  - Aplicó la 0005 (dos tablas vacías) sin backup previo.
  - Dos procesos chocaron con «table already exists».
  - Arreglo: `sqlite.ts` reintenta la migración una vez.
  - Lección: con una migración pendiente, `npm run backup` **antes** de compilar.
- **`planificacion:agregados` con `--desde` y sin `--hasta` hace un solo día** (`hasta = desde`). Hay que pasar siempre los dos. No hizo daño, porque cada lote reemplaza sus días.
- **Las capturas de la ayuda entran en el build** (`ayuda-capturas.json`): después de regenerarlas hay que recompilar.

## Datos que conviene revisar con supervisión

- **Del 22 al 25/09** el Excel tenía a 0892 en UGR, pero no tiene usuario UGR: trabajó con GH_0892.
- **El 05/10 a las 12:30** había 8 agentes conectados con UGR y el plan tenía 3, así que GH quedó por debajo del mínimo.
- **El 06/10 a las 09:30** no había ningún agente logado (Supervisión decía lo mismo).
- **0950** no tiene sesiones desde hace meses: no se planifica y no sale en saldos.
- **El color FFF6C6F6** de la plantilla se leyó como BD. Encaja con los datos (1067 hizo con GH_1067_BD 34 de sus 65 h), pero es una suposición.

## Pendiente

- **Supervisión**:
  - la fecha límite para publicar cada mes;
  - el contrato de 1008 (25 h frente a ~30 h reales);
  - compartir con ellas la guía de Claude Docs, que sigue siendo privada.
- **F5 del módulo**: una tarea nocturna única. Hasta entonces, lanzar a mano `npm run planificacion:agregados` (sin argumentos, el día de ayer). Si no se lanza, lo que falte se lee en vivo, más lento.
- **Mejora 4 de CLAUDE.md** (alertas proactivas): a medias. Están las de planificación; faltan SLA bajo, abandono alto y Not Ready largo.
- **Seguridad**: valorar un segundo usuario admin a nombre de Christian, para no depender de una sola contraseña.
- **De antes, sin cambios**: remoto git y despliegue en el servidor, y los «tests de oro» contra las queries SSMS.
