# Registro de la sesión del 21-23/10/2026 (Opus 5.5): KPIs de Supervisión y Dirección

Peticiones de Christian y de supervisión sobre el panel de Supervisión y la
vista de Dirección, desde la «calidad de la base de datos» hasta las horas de
cada cliente. Todo se propuso antes de tocar producción (los KPIs van también
a Dirección) y se desplegó con su OK. Las reglas que quedan están en
CLAUDE.md (reglas 6, 17, 18 y las secciones «Sesión 21/10/2026, tarde» a
«Sesión 23/10/2026»); aquí, el porqué, las cifras y lo que se aprendió.

## 1. Calidad de la base de datos (21/10)

- Christian quería ver, como el gráfico del supervisor de Altitude, cómo
  acaban los intentos de salida. Bloque «Calidad de la base de datos» en
  Supervisión (Tiempo real e Histórico) y Dirección: intentos por
  `itr_thread.termination_state` (`origin = 2`), por tipo de campaña y por
  día. Fuera: sin resultado (NULL, -1), abandonadas (6), redirigidas (11),
  canceladas (17) y reencoladas (18). «Sin líneas troncales disponibles» es
  el estado 10.
- Grupos: contactable (1), para reintentar (2, 3, 4), no sirven (8, 12,
  13), rechazo (5, 7), red (9, 10). Puro en `lib/calidad-bd.ts`.
- **Ojo (22/10):** el gráfico del supervisor de Altitude cuenta las
  preparaciones de llamada manual como «Gestionadas» (ver § 3). Validar
  siempre contra el INFORME («Socios_General», hoja «Raw Data - LL»), no
  contra ese gráfico.

## 2. «Atendidas», reloj, selector y KPIs (21/10)

- La supervisora no entendía 466 «atendidas» de un agente en 7 h. Pasa a
  **«Llamadas gestionadas»**, con **«Conversaciones»** (algún segmento
  `state = 6` Connected) y **«Contactos»** (sesiones de script de agente
  humano) al lado.
- Tiempos con «reloj» debajo («60,63 s» / «1 min 01 s»): `<Tiempo>`,
  `relojDesdeSegundos`.
- Selector de clientes: arriba los que tienen llamadas en los últimos 7
  días, abajo «Parados» con su última llamada (`actividadServicios`).
- KPIs, en dos familias que NO se mezclan (Christian: «no quiero mezclar
  resultados con llamadas»):
  - **Actividad** (sesiones y llamadas, por la fecha de la llamada; en
    «Rendimiento por éxitos» de Supervisión y Dirección): llamadas y éxitos
    por hora (logada en el agente y el total; con script abierto por
    campaña), «% éxito por llamada», gestión por éxito y sin éxito.
  - **Resultados** (contactos cerrados; solo en Supervisión → Resultados):
    «Aprovechamiento (bruto)» (el antiguo «ratio bruto»), finalizados por
    éxito, llamadas a cada contacto de éxito (intentos de salida en los 90
    días antes del cierre) y finalizados por hora.

## 3. Las preparaciones de llamada manual (22/10)

Christian bajó el informe «Socios_General» del 21/10: 577 interacciones,
frente a 873 «llamadas gestionadas» en el panel.

| Socios, 21/10 | Hilos | Gestionadas | Con conversación | Talk medio |
| --- | --- | --- | --- | --- |
| Con número de destino (= el informe, una a una) | 577 | 334 | 334 | 73,6 s |
| Sin número de destino | 603 | 539 | 0 | 36,4 s |

- Al llamar a mano, Altitude graba DOS hilos salientes en dos `itr_global`
  seguidos: el agente cogiendo el contacto y abriendo la ficha
  (`itr_global.to_address` vacío, ~36 s, «gestionado», sin conversación ni
  ACW) y la llamada al número. 555 de las 603 preparaciones van seguidas de
  la llamada real del mismo agente al mismo contacto en menos de 2 min.
- Afectaba sobre todo a Bolsas (1.822 de 2.834 gestionadas el 21/10), GH
  (538 de 1.339) y Socios (539 de 873).
- **Decidido:** la preparación no es una llamada (fuera de interacciones,
  llamadas gestionadas, abandonadas, AHT/Talk/ACW, intentos, llamadas por
  éxito y conversación por éxito), pero su tiempo es trabajo: sigue en el
  productivo y sale aparte en «Preparación». Condición única en
  `queries/util.ts` (`sqlLlamada`, `sqlPreparacion`, `sqlJoinGlobal`).
- Facturación no cambia: nadie factura por interacciones; minutos de línea
  y reparto de horas ya descartaban las salientes sin número.
- Agregados recalculados (`npm run agregados -- --desde 2025-06-01`):
  septiembre de 2026 pasa de 88.383 a 52.252 llamadas gestionadas y de
  115.755 a 80.426 interacciones; éxitos y contactos, iguales.

## 4. Las 12 cajas principales (22/10)

Christian fijó el orden, el mismo en Tiempo real, Histórico, Resultados y
Dirección (`components/kpi/kpis-principales.tsx`), con globo de ayuda en
cada tarjeta (`TarjetaKpi ayuda`, texto del glosario con `ayudaDe`):

| # | Caja | Fuente |
| --- | --- | --- |
| 1 | Horas logadas | `user_log` (ratios, regla 16) |
| 2 | Llamadas | llamadas gestionadas sin preparaciones |
| 3 | Finalizados | Resultados (contactos cerrados por un agente) |
| 4 | Éxitos | sesiones de script Success, por la fecha de la llamada |
| 5 | Llamadas por hora | 2 ÷ 1 |
| 6 | Llamadas por éxito | 2 ÷ 4 (el % va debajo) |
| 7 | Finalizados por hora | 3 ÷ horas logadas |
| 8 | Finalizados por éxito | Resultados |
| 9 | Aprovechamiento (bruto) | Resultados |
| 10 | Aprovechamiento (neto) | Resultados |
| 11 | Duración llamadas sin éxito | `itr_thread.duration` de las llamadas cuya sesión no es éxito |
| 12 | Duración llamadas de éxito | lo mismo, sesión de éxito |

- Después: «Equipo ahora» (Tiempo real) y «Entrantes» solo si el cliente
  recibe llamadas (en Bolsas y Socios salía siempre a 0 y «—»). Dirección
  mantiene debajo interacciones, % abandono y AHT.
- Dirección cambia dos fuentes: «Finalizados» = el de Resultados (el de
  facturación, con los cierres administrativos, sale debajo) y las horas de
  `user_log` en vez de `ag_in_cp_log`.
- GH septiembre: 1.384,22 h, 13.340 llamadas, 8.417 finalizados, 2.529
  éxitos, 9,64 llamadas/h, 5,27 llamadas por éxito, 6,08 finalizados/h,
  3,33 finalizados por éxito, 30,01 % bruto, 445 s y 151 s.

## 5. Salientes (22-23/10)

Siete KPIs de salida aprobados, por agente, campaña y global, en Supervisión
y Dirección (`queries/salientes.ts`, `lib/salientes.ts`,
`components/kpi/salientes.tsx`). Definiciones en CLAUDE.md («Sesión
22/10/2026, tarde: KPIs de salida»). Lo que costó averiguar:

- **Tiempo esperando llamada.** El Ready de `ag_in_cp_log` (op_type 1)
  incluye el tiempo hablando (GH septiembre: Ready 1.106 h ≈ logadas 1.384 −
  pausas 280), y «Ready − script» daba negativo (la ficha sigue abierta en
  pausa). Se mide el tiempo en Ready SIN ninguna ficha abierta: GH
  septiembre 150,56 h, lo mismo que la «espera en Ready ~150 h» que salió al
  cuadrar la facturación (`docs/facturacion-horas-logadas.md`). En salida es
  casi cero: Altitude da el siguiente contacto con la ficha abierta (ese rato
  es la preparación).
- **Rellamadas.** Los eventos de agendado están en `activity_history`
  (`event_action` AutomaticOutboundAgentScript o AgentUpdate,
  `schedule_status` Scheduled, `event_agent`), pero la hora solo en
  `activity.man_sch_moment`, que guarda la ÚLTIMA. Validado con supervisión
  en Altitude (contacto 01781989, ID Único 1107104):
  `man_sch_moment` = «Momento de la Rellamada/Agendado manual» y
  `activity.moment` = «Momento». Historia de ese contacto:

  | Cuándo | Qué | Agente |
  | --- | --- | --- |
  | 21/10 09:06 | llamada, gestionada | GH_0973 |
  | 21/10 09:07 | agenda (hora sobrescrita después) | GH_0973 |
  | 21/10 19:49 | llamada, gestionada | GH_1048 |
  | 21/10 19:50 | agenda para el 22/10 11:00 | GH_1048 |
  | 22/10 17:11 | llamada (6 h tarde), gestionada | GH_0851 |
  | 22/10 17:11 | agenda para el 23/10 10:11 (lo que ve Altitude) | GH_0851 |

  Por eso el retraso medio es APROXIMADO (lo dice la ayuda). Supervisión
  explicó que la agente puede guardar o no su nombre en la rellamada (si la
  deja para otro turno, no lo guarda: `activity.agent = -1`), así que las
  vencidas se atribuyen a la agente del último evento de agendado y una
  rellamada «hecha» la puede hacer cualquiera. En pantalla «momento de la
  rellamada», nunca «cita» (supervisión no usa esa palabra).
- **Rendimiento.** `ROW_NUMBER` sobre los intentos de 90 días pasaba la
  consulta de un mes de todos los clientes de 4,2 s a 11,7 s: se cuenta
  sobre el índice de la tabla temporal. `OPTION (HASH JOIN)` en la creación.
  En Dirección la sección va en `Suspense`.

## 6. Planificación (23/10)

La única cuenta de salientes que usa planificación es la tasa de contacto
por franja de los clientes por objetivo (`agg_hora_servicio`), que entra en
la puntuación del motor. Con las preparaciones dentro estaba inflada (GH
septiembre 71,2 %; real 59,4 %). Corregida y agregados de planificación
recalculados. En dos copias de la SQLite, los borradores de noviembre (358
bloques) y diciembre (333) salieron idénticos bloque a bloque: solo CEFF y
LX tienen horas por objetivo esos meses.

## 7. Horas del cliente y tabla por agente de Resultados (23/10)

- La columna «Horas» de Resultados cambiaba de significado según la fila: se
  separa en «Horas logadas» (agente y total) y «Horas con ficha».
- Fila de total en la vista por agente; salen también los agentes que
  trabajaron en las campañas sin cerrar contactos (0 finalizados).
- «¿Por qué no sale GH_1071?»: sí sale (fila 24 de 28, «Miriam Delgado_GH»,
  muestra pequeña al final); hoy no, porque no había cerrado contactos.
- La caja «Horas logadas» (880,10 h, GH 01-23/10) y la suma de la tabla
  (799,92 h) se separaban 80,18 h: todas de **«Manu»**, un usuario sin
  número ni prefijo que abrió 1 ficha en una campaña de GH y metía todas sus
  horas logadas. **Decidido:** las horas totales de un cliente son solo las
  de sus usuarios, por el prefijo de su línea `horas_logadas` (GH, CR, UGR,
  CEFF; `prefijoUsuariosDe`, `esUsuarioDelCliente`). Caja y total cuadran:
  803,02 h en octubre; 1.384,22 h en septiembre (= facturación).
- El glosario de Resultados tenía «Finalizados por éxito» y «por hora» dos
  veces (Next marcaba «2 Issues» por claves de React repetidas): una entrada
  de cada uno y el glosario usa la clave interna como key.

## 8. Despliegues

Todos con backup antes, `docker tag … anterior`, `npm run verificar` de la
imagen nueva sin errores y sin migraciones. Detalle en
`docs/despliegue-linux.md` § 9.

| Fecha y hora | Commit | Qué | Después del despliegue |
| --- | --- | --- | --- |
| 21/10 15:08 | `c9c5d27` | Calidad de la BD, llamadas gestionadas, KPIs, reloj, selector | — |
| 22/10 10:31 | `1cf6c87` | Preparaciones fuera de las llamadas, cabecera | `npm run agregados` (57 s). El primer `build` falló sin causa a la vista; el segundo, igual, compiló |
| 22/10 14:03 | `9592ab6` | Las 12 cajas | — |
| 23/10 09:24 | `bde74ba` | Salientes | imágenes antiguas del dashboard quitadas con `prune` filtrado |
| 23/10 10:01 | `c741fc8` | Tasa de contacto de planificación | `planificacion:agregados --sin-foto` (52 s) |
| 23/10 10:59 | `abd4e71` | Horas logadas / con ficha en Resultados | — |
| 23/10 11:14 | `29f658f` | Fila de total, glosario sin repetidos | — |
| 23/10 11:25 | `47e1779` | Horas del cliente por prefijo, agentes sin finalizados | — |

Disco del servidor: 2,9 GB libres. La caché de compilación (~2 GB) es
compartida con tickets: Christian decidió **no limpiar nada** de momento.

## 9. Pendientes

- Confirmar si la regla del prefijo vale para los cuatro clientes con
  facturación por horas (hoy sí) o solo para GrupoHuertas.
- ¿Quitar a los usuarios sin prefijo (como Manu) también de las filas de
  «Rendimiento por éxitos → Por agente»? Hoy salen con sus horas, que no
  suman al total.
- La guía de supervisión (Claude Docs y HTML) sigue siendo solo de
  Planificación: no explica el panel de Supervisión ni estos KPIs.
- De antes: los 2 festivos locales del calendario laboral y qué hacen el 24
  y el 31/12 las 13 personas con turno sin cliente.
