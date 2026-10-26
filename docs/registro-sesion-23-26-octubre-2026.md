# Registro de la sesión del 23-26/10/2026 (Opus 5.5): ausencias editables, copia del horario para las agentes y Next 16.4.2

Christian pidió dos cosas para Planificación:

1. Un botón «Editar» en las ausencias, para no tener que borrarlas y crearlas
   de nuevo.
2. Con el mes publicado, un botón para descargar la copia que se manda a las
   agentes: sin cliente, solo los días y las horas de cada una, bien claro.
   En dos formatos: un PDF horizontal de una sola página con todas, y otro
   «más moderno y dinámico» a elegir por Claude (él pensaba en un HTML).

Después pidió terminar lo pendiente antes de desplegar (subir Next y poner al
día la ayuda, las capturas y la guía de Claude Docs). El 26/10, supervisión
pidió que el PDF lleve el código de agente de GH y vaya ordenado por él.

Las reglas que quedan están en CLAUDE.md («Planificación de turnos →
Ausencias» y «Copia para las agentes», y «Producción → Next 16.3.8 →
16.4.2»).

## 1. Editar ausencias

- Botón «Editar» en cada fila de `/planificacion/[mes]/ausencias` (solo
  supervisión, como el alta y el borrado). Lleva a `?editar=<id>` y el
  formulario de arriba sale relleno con esa ausencia: persona, tipo, fechas,
  jornada completa o por horas, y notas. «Cancelar» vuelve sin cambiar nada.
- Se guarda con la misma acción del alta (`guardarAusenciaAccion`) con un
  `id` oculto, y por eso pasa las mismas comprobaciones. Al buscar solapes no
  choca consigo misma.
- La ausencia conserva quién la apuntó y cuándo (no se borra ni se crea
  otra). La auditoría (`plan_ausencia`) guarda «antes → después».
- Si algo falla (solape, horas mal), vuelve al formulario de cambio con el
  aviso, no al de alta.
- Si se acorta, lo que deja de ser ausencia no vuelve solo al borrador (igual
  que al borrar): la pantalla lo avisa.
- Un tipo ya desactivado vale si la ausencia que se cambia ya lo tenía; la
  persona sale en el desplegable aunque ya no sea de la plantilla.

Verificado en el `next dev` (SQLite de desarrollo, sesión temporal de
`admin`) enviando el formulario como lo haría el navegador sin JavaScript:
el cambio se guardó con su línea de auditoría, el solape devolvió «Se solapa
con VAC del 2026-09-03…» al formulario de cambio y la ausencia volvió a
quedar como estaba.

## 2. Copia del horario para las agentes

### Qué se decidió

- **Siempre la versión PUBLICADA**, aunque se esté viendo un borrador. Los
  botones («Copia para las agentes (vN publicada)»: «PDF» y «Para el móvil»)
  salen en la cabecera del tablero solo si el mes tiene una publicada.
- **Sin cliente.** Los bloques seguidos de una persona se juntan aunque sean
  de clientes distintos: «9–12 GH + 12–14 UGR» sale «9–14».
- **Se descuentan las ausencias de ahora**, que son hechos y no van por
  versiones. Una vacación apuntada después de publicar no puede salir como
  día de trabajo en la copia que recibe la agente.
- Un día sin trabajo sale como su ausencia (código y color del tipo, con la
  leyenda), «Festivo» (festivo de la plantilla o cierre de empresa) o
  «Libre». Las ausencias de unas horas no se enseñan: salen las horas que
  quedan de trabajo.
- **Formato «moderno» recomendado: un HTML de un solo fichero.** No necesita
  internet ni cuenta (el panel solo está en la red interna y las agentes no
  tienen usuario), se manda por correo o WhatsApp y se abre en el móvil.
  Con JavaScript: «¿Quién eres?» (se recuerda en ese navegador), «hoy»
  marcado, «Ver todo el equipo» y «Añadir a mi calendario» (.ics con
  `TZID=Europe/Madrid`). Sin JavaScript (por ejemplo, la vista previa de un
  adjunto en el iPhone) se ve el horario de todas: mejora progresiva.
- **Código de agente y orden** (26/10, pedido por supervisión): cada persona
  sale con su usuario de Altitude del cliente base sin sufijo («GH_0851», no
  «GH_0851_BD»; con los prefijos vigentes) y las filas van de menor a mayor
  por número de agente, que es el mismo orden. Si alguien no tuviera usuario
  de GH, sale su número. Sustituye al «(0851)» que se añadía a los nombres
  repetidos (lo destapó la demo, donde todas se llaman «Agente»).

### Cómo está hecho

| Pieza | Qué hace |
| --- | --- |
| `lib/planificacion/horario-agentes.ts` | Modelo PURO (misma regla de ESLint que el motor): junta tramos, resta ausencias, marca festivos, código y orden |
| `lib/planificacion/horario-html.ts` | HTML PURO (texto): CSS y JavaScript dentro, sin librerías |
| `lib/planificacion/horario-pdf.ts` | PDF con `pdf-lib` 1.17.1 (JavaScript puro, sin binarios en la imagen Docker); Helvetica del propio PDF |
| `lib/planificacion/vistas.ts::horarioPublicado` | Carga la publicada con `cargarTablero` (ausencias y calendario de ahora) y los códigos de agente |
| `app/api/planificacion/horario/route.ts` | `?mes=YYYY-MM&formato=pdf|html`; roles de lectura del plan; auditoría `export` |
| `components/planificacion/copia-agentes.tsx` | Los dos botones del tablero, con su «?» |

El PDF: A4 apaisado, una fila por persona y una columna por día; cada tramo
en una línea («9–14», con raya, minutos solo si hacen falta); un único
tamaño de letra para todas las horas (con uno por casilla «9–14» salía más
grande que «10–14»); fines de semana y festivos sombreados, raya gruesa al
empezar cada semana; leyenda solo con los tipos que salen; cabecera con la
fecha de publicación, la versión y «vale siempre el más reciente». Con 12-13
agentes sobra sitio; con unas 30 la letra quedaría pequeña.

### Cifras

| Mes | Dónde | Bloques | Copia | Nota |
| --- | --- | --- | --- | --- |
| Septiembre 2026 (v1) | desarrollo y producción | 1.489 h | 1.489 h | 11 días de ausencia (FEST, RTO, VAC) |
| Octubre 2026 (v1) | desarrollo y producción | 1.595 h | 1.595 h | el 12/10, «Festivo» para las 12 |
| Noviembre 2026 (v4) | producción | 1.572 h | 1.530 h | −42 h: tres VAC apuntadas el 22/10, después de publicar el 20/10 (#41, #42 y #43) |

Generar la copia de un mes: 0,1-0,4 s. PDF ~17 KB, HTML ~135 KB.

## 3. Next 16.3.8 → 16.4.2

`npm audit` daba **dos críticos** en Next (ejecución de código sin
autenticación: GHSA-2464-fhr4-w9xw, optimización de imágenes con SVG, y
GHSA-673q-mjm6-r5xr, `use cache`) y uno alto de Server Actions, en todo
16.0-16.4.0; no había parche en 16.3. Se subió a 16.4.2 (del 15/10) con
`eslint-config-next` igual. Después: sin críticos (quedan 2 altos y 3
moderados de siempre). Tests, `tsc`, ESLint, build y `next start` en verde.

## 4. Ayuda, capturas y guías

- `ayuda-contenido.ts`: «Editar» en el «¿Qué veo aquí?» de ausencias,
  6.º punto del tablero («Copia para las agentes»), tareas «Cambiar una
  ausencia» y «Mandar el horario a las agentes», casos nuevos y el «?» de la
  copia.
- Capturas del tablero y de ausencias rehechas en modo demo
  (`scripts/ayuda-capturas.mjs`, puerto 3200, copia de la SQLite de demo del
  21/10). La de ausencias destapó que la tabla ya no cabía con «Editar» y
  «Borrar» (botones fuera de la vista a 1.040 px): el tipo parte línea.
- Guía de Claude Docs (<https://claude.ai/artifact/5P4qk2BKQCUfURPWqRg5U3>):
  «3 · Ausencias» (captura, punto 3, paso a paso «Cambiar una ausencia» y
  caso nuevo), «2 · Avisos y publicar» (paso a paso «Mandar el horario a las
  agentes» con ejemplos del PDF y del móvil hechos con datos inventados;
  rehechos el 26/10 con el código de GH), «1 · Preparar el mes» (captura del
  tablero con el punto 6), «Empieza aquí» y «Guía detallada».
- `guia-supervision.html` regenerado (`npm run guia:html`).

## Commits y despliegues

| Commit | Qué | Despliegue |
| --- | --- | --- |
| `c25ab60` | Next 16.4.2 y `pdf-lib` | 23/10 14:55 (imagen `381cd9fb0d99`) |
| `ac91cc2` | Editar ausencias, copia para las agentes, ayuda y capturas | 23/10 14:55 |
| `5c3a12d` | Histórico y registro | solo documentación |
| `e832b16` | Código de agente de GH y orden en la copia | 26/10 08:05 (imagen `057f20bb182d`) |
| `0375e31` | Histórico | solo documentación |

## Operaciones fuera del código

| Cuándo | Dónde | Qué | Copia previa |
| --- | --- | --- | --- |
| 23/10 14:04 | SQLite de desarrollo | Sesión temporal de `admin` para probar en el `next dev` y en `next start` (puerto 3100); borrada al acabar. La nota de la ausencia #7 de prueba, restaurada | `dashboard_20261023_1404.db` |
| 23/10 | SQLite de desarrollo | Quedan en `audit_log` las líneas de la prueba (2 `plan_ausencia` y varias `export`): la auditoría no se borra (el sistema de permisos lo impidió, con razón) | — |
| 23/10 | Copia de la SQLite de demo | Servidor en modo demo (puerto 3200) para las capturas; la SQLite original de demo, sin tocar | — |
| 23/10 14:38 | Producción | Backup antes de desplegar | `dashboard_20261023_1438.db` |
| 23/10 ~14:50 | Producción (Docker) | Con el visto bueno de Christian: `docker image prune` con el filtro del dashboard y **`docker builder prune -f`** (2,25 GB de caché de compilación, también la de tickets). De 2,9 a 5,4 GB libres | — |
| 23/10 | Claude Docs | Guía al día (arriba) | — |
| 26/10 07:49 | Producción | Backup antes de desplegar | `dashboard_20261026_0749.db` |
| 26/10 | Claude Docs | Ejemplos del PDF y del móvil con el código de GH | — |

## Incidencias y lecciones

- **El build de Docker falló con «database is locked»** en la SQLite
  desechable del build (el fallo intermitente del 22/10). Repetirlo basta.
  Mientras corría dejó el disco en 410 MB libres: no se reintentó hasta
  liberar espacio con permiso. El 26/10 el disco ya era de 77 GB (59 GB
  libres).
- **PowerShell y ssh**: canalizar texto a `ssh` mete BOM y CRLF y `bash -s`
  falla. Funciona copiar el script con `scp` y lanzar `ssh tickets-prod "bash
  /tmp/x.sh"`. Los scripts tsx con `await` arriba, en `.mts`. En el Git Bash
  de esta máquina no hay `ssh`.
- **Mensajes de commit desde PowerShell 5.1**: `Set-Content -Encoding utf8`
  pone BOM y acabó en el título del commit (se corrigió antes de subirlo).
  Mejor el mensaje en un fichero escrito sin BOM.
- **Vitest reescribe** `motor/__snapshots__/motor.test.ts.snap` con otros
  finales de línea: deshacerlo con `git checkout` antes de cada commit.
- **Permisos**: el sistema de permisos frenó borrar líneas de auditoría de
  prueba (correcto: no se borran) y el `up -d` del 26/10 hasta que Christian
  lo autorizó de forma expresa para ese cambio.

## Pendiente

- **Noviembre**: el plan publicado (v4) sigue con horas encima de las tres
  VAC del 22/10 y salen como aviso rojo. Supervisión debe hacer un borrador
  nuevo y publicarlo (la copia ya las enseña bien).
- Copiar `guia-supervision.html` a la carpeta compartida de supervisión.
- Que supervisión pruebe la copia en el móvil (iPhone y Android) y el .ics.
- Si el equipo pasa de ~25 personas, revisar el tamaño de letra del PDF.
