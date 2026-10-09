# Registro de la sesión del 09/10/2026 (Opus 5.5)

Primera sesión con el dashboard ya en producción (desde las 09:19 de ese día). Se hicieron
dos cambios y se desplegaron los dos:

- La configuración de los clientes de planificación pasó de un JSON a un formulario en
  lenguaje sencillo.
- Operaciones enseña el reparto estimado de las horas logadas de cada cliente por campaña.

Además se resolvió una duda de acceso (el navegador entraba por HTTPS) y otra de facturación
(por qué solo salía GH en «Horas logadas por cliente»). El detalle técnico está en CLAUDE.md
(planificación, «Parámetros de cada cliente», y regla 16, «Reparto ESTIMADO por campaña») y en
`docs/despliegue-linux.md` (histórico y problemas frecuentes). Aquí van el hilo de la sesión,
las decisiones, las cifras medidas y lo que se tocó fuera del código.

## Commits

| Hora | Commit | Qué |
| --- | --- | --- |
| 10:00 | `7fd140b` | Planificación: parámetros de cliente con formulario en vez de JSON |
| 10:02 | `bc32931` | Histórico de despliegues: formulario de parámetros de cliente |
| 10:02 | `4d053e7` | Despliegue: el error `SSL_ERROR_RX_RECORD_TOO_LONG` en problemas frecuentes |
| 13:06 | `6099019` | Operaciones: reparto estimado de las horas logadas por campaña |
| 13:10 | `6016013` | Histórico de despliegues: reparto de horas logadas por campaña |

(`c32ea7e` y `ca4dc52`, de esa misma mañana, son de otra sesión.)

## Decisiones de Christian

- **Formulario de clientes**: aprobada la propuesta tal cual. El JSON se queda solo para
  consultarlo («Ver la configuración guardada», solo lectura).
- **Commit, push y despliegue** de los dos cambios (pedido de forma expresa en cada uno).
- **Reparto de horas logadas por campaña**:
  - Por usuario y día, en proporción a su tiempo productivo (gestión de las atendidas) en
    cada campaña.
  - Los días logados sin ninguna atendida van a una fila aparte.
  - En pantalla se ve también el dato de partida: horas productivas y % del tiempo
    productivo de cada campaña.
- **Clientes por horas logadas**: Christian dio de alta en `/admin/facturacion`, durante la
  sesión, UGR (22,50 €/h, prefijo `UGR`), CEFF (25 €/h, `CEFF`) y CajaRural (25 €/h, `CR`).
  CajaRural antes facturaba por horas productivas a 25 €; esa línea ya no está activa.

## Lo que se hizo

### 1. Parámetros de cliente sin JSON (`7fd140b`)

Configuración → Clientes → Editar enseñaba `plan_clientes.parametros` como un JSON con las
franjas en minutos (660 = 11:00). Supervisión no podía cambiar sin ayuda las horas
contratadas, los bloques ni el fin de campaña.

- **Formulario por apartados**: horario de atención, cuándo se le puede planificar,
  contrato y fin de campaña, límites por persona, llamadas entrantes, lista de llamadas y
  opciones avanzadas (plegadas).
  - Las horas se escriben como en Patrones («11-14, 16-18») y los decimales con coma.
  - Solo salen los apartados del modo del cliente (CSS `:has()`, sin JS). Si el navegador no
    lo entiende, salen todos.
- **`src/lib/planificacion/formulario-cliente.ts`** (puro, misma regla de ESLint que el
  motor, 11 tests) hace la ida y vuelta entre los campos y el objeto de siempre.
  - Valida con `esquemaParametrosCliente` y guarda sin las claves que valen lo de por defecto.
  - El motor no cambió.
  - **Los bloques no se funden**: el motor da cada bloque entero a una persona, así que
    «11-13, 13-15» son dos bloques de 2 h, no uno de 4 h. Por eso no se usa `parsearTramos`
    para ellos.
- **Horario de atención**: es `horarios_servicio` de RDBv2 (solo lectura), así que no se
  edita. Se elige el calendario y se enseñan sus tramos, la vigencia de los festivos y el
  próximo festivo. Si RDBv2 no responde, la página sigue funcionando sin esa lista.
- **Protecciones**:
  - Aviso en ámbar si lo guardado no cabe tal cual en el formulario (`perdidasAlEditar`).
  - Rechazo de un envío del formulario antiguo, que habría dejado los parámetros vacíos.
- **Resto de cambios**:
  - Columna «Cómo se planifica» en la tabla de clientes.
  - Auditoría legible («Horas contratadas: — → 300 h»).
  - Avisos del cargador sin nombres técnicos (`ritmoManual`, `horasContratadas`).
- **Ayuda**:
  - Dos casos nuevos en Configuración, la tarea «Cambiar las horas contratadas o las horas de
    un cliente» (`config-cliente`) y cuatro «?» (`cliente-horario`, `cliente-bloques`,
    `cliente-contrato`, `cliente-entrantes`).
  - La captura de Configuración es la pantalla de Agentes: no hubo que repetirla.

### 2. «No me deja entrar» (`SSL_ERROR_RX_RECORD_TOO_LONG`)

No era un fallo del servidor. Por HTTP respondía bien (`/login` 200; la redirección de `/` es
relativa) y no manda HSTS ni nada que obligue a usar HTTPS. Era Firefox, en una ventana
privada, pidiendo `https://` a un puerto que solo sirve HTTP.

- **Solución**: escribir `http://192.168.151.38:8081` entero y borrar la sugerencia con
  `https` del historial (Mayús + Supr). Si sigue, revisar «Modo solo HTTPS».
- Quedó en la tabla de problemas frecuentes de `docs/despliegue-linux.md` (`4d053e7`).
- La solución definitiva es TLS en el nginx (bloque ya preparado y comentado). Necesita un
  certificado de TI: mejora 10 de CLAUDE.md.

### 3. Por qué solo salía GH en «Horas logadas por cliente»

La sección solo lista las líneas de `billing_config` con unidad `horas_logadas`, ámbito servicio
y prefijo. En ese momento solo GH la tenía. Se explicó cómo dar de alta las demás en
`/admin/facturacion` y dos riesgos:

- **Doble cobro**: un cliente que ya factura de otra forma (Ávolo por leads) cobraría por las
  dos vías si se dejan las dos líneas.
- **Varios prefijos**: un cliente con varios prefijos (Socios: `Soc_0307` y `Soc_Fed_0892`)
  necesita una línea por prefijo.

### 4. Reparto estimado de las horas logadas por campaña (`6099019`)

`user_log` no sabe de campañas, y el tiempo con campaña abierta (`ag_in_cp_log` op 0) no
sirve para repartir. Medido sobre los usuarios `GH_nnnn` en septiembre de 2026:

| Medida | Valor |
| --- | --- |
| Suma de `ag_in_cp_log` op 0 por campaña | 34.985,49 h |
| Unión real de esos intervalos | 1.023,37 h (×34,2) |
| Tiempo con más de 15 campañas abiertas a la vez | 949,26 h (92,8 %) |
| Con 6-15 / 2-5 / 1 campaña | 3,0 % / 4,2 % / 0,03 h |
| Reparto a partes iguales del tiempo abierto | ~23 h y 2,3 % casi todas las campañas: no distingue nada |
| Horas productivas de esos usuarios | 640,64 h en 38 campañas (la primera, el 10,5 %) |

- **Regla**: por usuario y día, lo logado (islas de `user_log` por el día en que empiezan,
  igual que la factura) se reparte en proporción a la gestión de las atendidas de cada campaña
  (la misma medida que «H. productivas»). Un día logado sin ninguna atendida va a «Logado sin
  actividad en campaña».
- **Redondeo**: por mayor resto, para que las filas sumen EXACTAMENTE el total facturado.
- **Código**:
  - `baseRepartoHorasLogadas` (`queries/facturacion.ts`): dos consultas en un lote; 1,3 s
    para un mes de GH.
  - `repartirHorasLogadas` (`lib/facturacion-horas-logadas.ts`), puro, con tests.
  - Mock para el modo demo.
- **Pantalla**: Operaciones → Facturación, desplegable bajo cada cliente con:
  - campaña;
  - h. productivas de los usuarios del cliente;
  - % del tiempo productivo;
  - horas logadas repartidas;
  - importe repartido;
  - fila Total.
- **Export CSV/XLSX**: el reparto va en cuatro columnas propias, para que las de arriba sigan
  sumando sin contar dos veces. Término nuevo en el glosario.
- **Se factura el total del cliente**; el reparto es informativo. El % productivo del mes y el
  % de horas logadas de una campaña no coinciden exactamente, porque el reparto se hace día a
  día con lo logado de cada persona.

## Cifras de verificación

| Qué | Resultado |
| --- | --- |
| GH septiembre, reparto contra RDBv2 (local) | 1.027,88 h y 28.780,64 € (= factura y Excel), 39 filas, 35,26 h sin actividad. gh_la_mur_toyota 10,23 % → 98,01 h; gh_gra_pre_mer 10,34 % → 94,81 h |
| Producción, 01-09/10, desde el contenedor | GH 225,16 h / 6.304,48 €, UGR 108,57 h / 2.442,82 €, CEFF 1,98 h / 49,50 €, CajaRural 0 h; en todos el reparto = total |
| CajaRural | Sin actividad en octubre (ni sesiones `CR_` ni llamadas en CajaR_Autonomos_26). Septiembre: todo lo hizo `CR_0985`, con 1.219 atendidas, 14,98 h productivas y 18,61 h logadas (a 25 €/h, 465,25 €) |
| Clientes reales en el formulario nuevo | Los 7 de la SQLite de producción (GH, BD, LX, AV, UGR, CR, CEFF) caben enteros: ninguno pierde nada al guardar |
| Tests | 141 → 144, todos en verde; `tsc` y lint a cero en los dos commits |

## Operaciones fuera del código

| Cuándo | Dónde | Qué | Copia previa |
| --- | --- | --- | --- |
| ~09:50 | Claude Docs, guía de supervisión | «Guía sencilla»: tarea nueva y dos filas en Configuración. «Guía detallada»: el párrafo de horas contratadas ya no nombra `horasContratadas`/`inicioContrato`/`campaniasSimilares`, y la fila «Clientes» describe el formulario | historial del documento |
| 10:00 | Producción | Despliegue de `7fd140b` (imagen `4a0d718ae673`) | `dashboard_20261009_1000.db`, imagen `8891d2349133` como `anterior` |
| 10:05 | Producción, solo lectura | Los 7 clientes por `perdidasAlEditar` | — |
| 13:07 | Producción | Despliegue de `6099019` (imagen `6fa6b5b4fe42`) | `dashboard_20261009_1307.db`, imagen `4a0d718ae673` como `anterior` |
| 13:09 | Producción, solo lectura | Reparto de octubre, `billing_config` activa y actividad de CajaRural | — |
| Durante la sesión | `/admin/facturacion` (Christian) | Altas por horas logadas de UGR, CEFF y CajaRural | — |

Las pruebas en el navegador se hicieron en **modo demo** (`RDB_MOCK=1`, puerto 3200) con una
SQLite desechable en el scratchpad (migrada, con semilla y un usuario de prueba). `data/dashboard.db`
del PC no se tocó, y en producción no se creó ninguna sesión ni se escribió nada salvo con los
despliegues.

## Incidencias y lecciones

- **Cruce de intervalos en el SQL, demasiado caro**: repartir los segmentos de `ag_in_cp_log`
  con un JOIN de rangos pasó de los 120 s. Con los 28.807 intervalos de un mes de GH llevados
  a Node, tardó 1 s. No hizo falta en la versión final, que no usa `ag_in_cp_log`.
- **`TaskStop` no mató el `next dev`**: el proceso de Node siguió escuchando en el 3200 y el
  segundo arranque dio `EADDRINUSE`. Como recarga en caliente, sirvió el código nuevo y la
  prueba valió. Se cerró después con `Stop-Process` sobre el dueño del puerto.
- **Caracteres de control en el código**: un `\u0000` escrito desde Python acabó como un byte
  NUL real en dos ficheros (grep los daba por binarios). Al arreglarlo con `sed`, `\u`
  significa «mayúscula» en GNU sed y dejó «0000sin». Se sustituyó por un texto normal que no
  puede ser un shortname («(sin actividad en campaña)»).
- **Vitest y los finales de línea**: al pasar los tests reescribe el snapshot del motor con
  LF. Git lo marca como modificado sin cambios de contenido; se deja como estaba con
  `git checkout --` antes de cada commit.
- **`/app` es de solo lectura en el contenedor**: los scripts de comprobación en producción
  van en `/tmp`, con imports absolutos (`/app/src/...`, `/app/node_modules/...`), y se borran
  después.
- **Ruido de auditoría que ya había**: al guardar un cliente, el selector de color envía el
  color en minúsculas y `cambios()` lo apunta como cambio (`#F8CBAD` → `#f8cbad`). No se tocó.

## Pendiente

- **Christian**: mirar en el navegador las dos pantallas en producción (Configuración →
  Clientes → Editar, y el desplegable del reparto en Operaciones). Se verificó con la misma
  cadena desde el contenedor, pero sin sesión.
- **Facturación**:
  - Decidir si Ávolo y Socios pasan a horas logadas. Ávolo factura por leads: no dejar las
    dos líneas.
  - Socios tiene dos prefijos (`Soc` y `Soc_Fed`): una línea por prefijo.
- **HTTPS** en el nginx cuando TI dé un certificado (mejora 10).
- Confirmar mañana (10/10) la primera noche de las tareas programadas en el servidor (ya
  estaba pendiente).
