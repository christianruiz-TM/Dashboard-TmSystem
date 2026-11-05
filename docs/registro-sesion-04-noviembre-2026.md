# Sesión 04/11/2026 (Opus 5.5): semana partida, Horas, campana de alertas y orden alfabético

Cuatro peticiones de supervisión, traídas por Christian. Primero se hizo una
propuesta con preguntas y no se tocó nada hasta su visto bueno.

## Decisiones de Christian

| Punto | Pregunta | Respuesta |
|---|---|---|
| 2 | Regla del contrato del día | A: repartido según el turno de la persona |
| 2a | ¿Hace falta RR. HH.? | No: vale así |
| 2b | ¿Pueden cambiar los saldos acumulados ya vistos? | Sí |
| 2c | ¿Semana partida entera en el tablero? | Sí |
| 1a | «Horas efectivas» | Horas logadas reales (tiempo logado) |
| 1b | ¿También por cliente? | Sí |
| 1c | Días que no han pasado | En cursiva, como en Saldos |
| 1d | ¿Pestaña nueva? | Sí |
| 1e | ¿Excel? | De momento no |
| 3 | Campana | Propuesta aprobada |
| 3a | ¿Quién la ve? | Todos (roles internos) |
| 3b | ¿Solo planificación? | Dejar sitio para las demás alertas |
| 3c | ¿Historial del día? | No de momento |
| 3d | «Vista» y silencio | Por usuario |
| 3e | Recordatorio | Sí, cada 3 minutos, configurable |
| 3f | Avisos de Windows | Sí; los PC de supervisión aún no tienen la directiva |
| 4 | Orden alfabético | Propuesta aprobada |
| 4a | Nombre de agente | Usuario de Altitude |
| 4b | Planificación | Por número |
| 4c | Rendimiento por éxitos y Resultados | Conservan su ranking |
| 4d | ¿Recordar el orden? | No: siempre vuelve al alfabético |
| 4e | Alcance | Todas las vistas |

## 2. Semana partida (lunes 30/11 con +3)

Diagnóstico, con el borrador de noviembre de la SQLite de desarrollo: no
fallaba la suma sino la regla «contrato del día = semanal ÷ 5». Los lunes son
de 9 h (partido) y los viernes de 4-5 h: en una semana entera se compensa, en
una partida no.

| Contrato | Antes, el lunes 30/11 | Ahora |
|---|---|---|
| 30 h (0851, 1008) | +3,00 h | 0,00 / −0,31 h |
| 35 h (1048, 1067) | +2,00 h | +0,25 h |
| 38 h (0892, 0925, 0940, 0973, 0985) | +1,40 h | −0,24 / +0,23 h |
| 25 h de mañanas | 0 | 0 |

Las décimas que quedan son el ±1 de las semanas A/B (patrones de 39 y 37 h con
38 h de contrato) repartido por días.

Lo mismo pasaba al revés con el jueves y viernes 01-02/10: el saldo empieza
ese jueves (`plan.inicioSaldo`) y el lunes a miércoles de esa semana son de
septiembre, que no cuenta. Con lo planificado, todos arrastraban entre −2 y
−5,20 h que nada compensaba (0973 −5,20; 1008, 1048 y 1067 −4,00; 0892, 0925,
0940 y 0985 −3,20; 0851 y 1086 −2,00). Ahora: entre −0,61 y +0,31 h. En
producción el arrastre real cambia en la misma medida.

Cambios:

- `motor/contrato.ts` (puro, con tests): `horasTurnoSemanas` y
  `contratoDelDia`. `diasFueraDelMes` en `motor/calendario.ts`.
- `AgenteMotor.turnosFuera`: el turno de los días de otro mes de la semana
  partida. El cargador lo guarda en las fotos nuevas; para las anteriores,
  `cargarTablero` lo calcula con los patrones de ahora.
- La misma regla en `saldo.ts` (Saldos y cierre), el saldo previsto del
  tablero y `contratoMesH` del motor. El snapshot del motor no cambia.
- Tablero, vista por agente: la semana partida entera, con los días del otro
  mes en gris y sin editar (los bloques de su plan vigente o, si aún no tiene,
  solo el turno) y un aviso encima.
- Ayuda de Saldos al día («¿Cómo se calcula?» y «La primera o la última
  semana del mes tiene pocos días»).

## 1. Pestaña «Horas»

`/planificacion/[mes]/horas`, entre Saldos y Cierre. «Por día», «Por semana»
y «Mes». Por persona: horas conectadas (user_log de la persona, como el
saldo) frente al contrato del día con la regla nueva y la diferencia; de hoy
en adelante, lo planificado en cursiva. «Mes»: hasta ayer y mes completo con
lo planificado. Por cliente: las horas de sus usuarios de toda la empresa
(como Cierre) y lo planificado después. Por día no salen los días sin
contrato ni horas de nadie. Ayuda: tema «Horas», dos «?» y una tarea.

## 3. Campana de alertas

En la barra de arriba de todas las páginas, para admin, dirección,
operaciones y supervisión. Detalle técnico en CLAUDE.md («Campana de
alertas»). Probado en el navegador con una alerta real de ese día (Ávolo, 3
llamadas por devolver): número en la campana y en el título («(1) Horas ·
…»), icono de la pestaña cambiado y «Marcar todas como vistas» guardado por
usuario. Avisos de Windows: guía para informática en
`docs/notificaciones-escritorio.md` (la directiva pone tickets y el panel).

## 4. Orden alfabético

Todas las tablas y desplegables con agentes, campañas o clientes. Las tablas
se ordenan además pulsando la cabecera, dentro de cada grupo y sin mover los
totales:

- Supervisión: campañas, agentes, estado de agentes ahora, Salientes y
  Calidad de la BD.
- Dirección: por cliente y detalle por campaña.
- Operaciones: factura por campaña, horas logadas por cliente y su reparto,
  unidades por campaña, listas y pausas.
- Portal de clientes.
- Selectores de cliente: alfabético dentro de «activos» y «parados».
- Códigos GS, DDIs y artículos.

En Supervisión los agentes llevan ahora el usuario delante del nombre.
Planificación sigue por número; Rendimiento por éxitos y Resultados, con su
ranking.

## Verificación

- 304 tests (8 ficheros nuevos o ampliados), `tsc`, ESLint y `next build`
  (webpack) en verde.
- Pantallas comprobadas en un `next dev` aparte (copia del proyecto en el
  scratchpad, con `node_modules` enlazado y webpack, y copia de la SQLite de
  desarrollo) contra RDBv2: tablero de noviembre y octubre, Horas, Supervisión
  Histórico, Dirección, Operaciones y la campana.
- Ese `next dev` aparte destapó un fallo que los tests no veían:
  `valoresOrden` estaba en un fichero de cliente y lo llamaban componentes de
  servidor. Se pasó a `lib/orden.ts`.

## Incidencia

El `next dev` que Christian tenía abierto en el puerto 3000 (desde el 13/10)
devuelve error 500 en todas las páginas desde que se intentó arrancar otro en
el mismo proyecto (falta `.next/dev/server/preview-props.json`). No se pudo
parar desde aquí: hay que cerrarlo y volver a lanzar `npm run dev`. La SQLite
de desarrollo no se tocó (backup `dashboard_20261104_1410.db` por si acaso).

## Despliegue

Commit `2b5a24c`, desplegado el 04/11/2026 a las 17:06 (imagen
`83819cdc8f57`, sin migraciones, backup `dashboard_20261104_1658.db`). Los
dos primeros builds fallaron con «database is locked» en la SQLite desechable
del build; el tercero compiló. `verificar` sin errores. Comprobado desde
`tareas` en solo lectura con los datos de producción:

- Noviembre v4 publicada, lunes 30/11: de +3,00 / +2,00 / +1,40 h a entre
  −0,95 y +0,56 h.
- Arrastre de octubre: mejora entre +1,66 h (0851) y +4,93 h (0973); sin
  cambio a quien no tiene lunes largos (0950, 1045, 1118). A mitad de semana
  el saldo de noviembre puede bajar: los lunes y martes llevan ya su contrato
  de días largos y se compensan el resto de la semana.
- Horas de noviembre en 51 ms; campana con 5 alertas en 400 ms.
- Sin sesión, las rutas nuevas mandan al login.

## 05/11: ayuda, capturas y guías

- **SQLite de demo nueva** (no quedaba ninguna de sesiones anteriores), en
  el scratchpad y con `RDB_MOCK=1`: `seed:admin`, una usuaria `supervision`
  insertada sin cambio de contraseña pendiente (el script de capturas entra
  con ese rol), `planificacion:semilla`, `planificacion:agregados` del
  01/07 al 03/11, octubre generado y su v1 publicada a mano, tres ausencias
  de ejemplo, el borrador de octubre regenerado después (si no, el tablero
  sale con 8 incidencias duras por las ausencias) y el borrador de noviembre
  para «Hoy». Servidor `next start` en modo demo en el puerto 3200, desde la
  copia del proyecto.
- **Capturas**: las 11 rehechas con `scripts/ayuda-capturas.mjs`, «Horas»
  nueva (4 puntos). El tablero de octubre enseña la semana partida.
- **Textos** (`ayuda-contenido.ts`): «La semana tiene días en gris de otro
  mes» en el tablero, «Suena la campana de arriba» en Hoy, «Contrato del
  día» y «Semana partida» en las palabras, y «las horas» en la rutina de
  principio de mes.
- **Guía de Claude Docs**: las 11 capturas con los números pintados,
  sección «Horas» en «5 · Fin de mes», la regla nueva del contrato en
  Saldos (y en la «Guía detallada», que aún decía «entre cinco» y
  «se prorratea por laborables»), la fila de la semana partida en el
  tablero, la campana en «4 · Cada día» y en la guía detallada, la rutina
  de «Empieza aquí» y dos palabras.
- **Guía HTML** regenerada (`npm run guia:html`, 1,5 MB, con las 11
  capturas).
- El `next dev` del puerto 3000: el sistema de permisos no dejaba pararlo en
  modo automático. Fuera de él, con la aprobación de Christian, se paró
  (`taskkill /T`) y se volvió a lanzar en una consola minimizada titulada
  «Dashboard TmSystem - npm run dev». `/login` responde 200 y no hay errores.
  Al arrancar, Next 16.4.2 reescribe `AGENTS.md` (un título de `#` a `##`).

## Pendiente

- Avisar a supervisión de que los saldos acumulados cambian.
- Arreglar el «database is locked» del build (mejora 11 de CLAUDE.md).
- Copiar `guia-supervision.html` a la carpeta compartida.
- Directiva de los avisos de Windows en los PC de supervisión.
- Capturas de la ayuda en modo demo, guía de Claude Docs y guía HTML con
  «Horas» y la semana partida.
