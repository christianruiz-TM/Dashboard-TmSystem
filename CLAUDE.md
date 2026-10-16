# Dashboard TmSystem — Guía para Claude

Dashboard web multi-rol para TmSystem (contact center con Altitude uCI v8.5/8.6).
Lee datos de **RDBv2** (SQL Server, réplica de solo lectura) y guarda sus propios
datos (usuarios, config, agregados) en **SQLite**.

Convenciones generales de Next.js del scaffold: ver @AGENTS.md. Idioma del proyecto:
**español** (UI, comentarios, commits).

**Estado (09/10/2026): EN PRODUCCIÓN desde el 09/10/2026 a las 09:19.**
Servidor **Ubuntu 192.168.151.38** (el de tickets) con Docker Compose, en
http://192.168.151.38:8081: guía `docs/despliegue-linux.md` y sección
«Producción» más abajo (la guía de Windows ya no aplica). **La SQLite buena es
la del servidor** (`/opt/tmsystem/dashboard/data/`). La del equipo de
desarrollo de Christian (Windows 10) quedó congelada en el corte: solo sirve
para desarrollar, nunca para guardar nada que importe. Rama de trabajo: `master`. `feature/planificacion`
(planificación F1-F5, ayuda para supervisión y la facturación por horas
logadas de GH) se fusionó en `master` el 09/10/2026 sin conflictos (avance
directo). Remoto: GitHub privado `christianruiz-TM/Dashboard-TmSystem`, alias
SSH `github-dashboard` (deploy key con escritura en este PC y de solo lectura
en el servidor; no hay `gh`). Desplegar = commit y push aquí, y en el
servidor la sección 3 de `docs/despliegue-linux.md`. `temp/` (Excel y prototipo con nombres reales) está
en `.gitignore` y `.dockerignore`: nunca al repo ni a la imagen.

## Reglas de dominio CRÍTICAS (no negociables)

1. **DÉCIMAS DE SEGUNDO**: TODAS las columnas de duración de RDBv2 (`duration`,
   `wrapup_duration`, en replicación Y en flat tables) están en décimas de segundo,
   aunque la doc oficial de Altitude diga segundos (verificado en esta instalación).
   - Segundos = `duration / 10.0` · Minutos = `/ 600.0` · Horas = `/ 36000.0`
   - La conversión se hace SIEMPRE dentro del SQL, nunca en TypeScript/frontend.
2. **Solo RDBv2**: jamás conectar a la BBDD principal de Altitude. El usuario SQL es
   de solo lectura; cualquier escritura va a SQLite.
3. **Filtros de fecha obligatorios** sobre columnas indexadas, con rangos explícitos:
   - ✅ `WHERE t.start_time >= @desde AND t.start_time < @hasta`
   - ❌ `WHERE YEAR(start_time) = 2026` (impide usar el índice)
   - `itr_thread` y `activity_history` son enormes: NUNCA consultarlas sin rango.
4. **SQL parametrizado siempre** (`request.input(...)`). Nada de concatenar valores.
   Los nombres de campaña del scoping de clientes también van como parámetros.
5. **Enumerados**: los valores numéricos de estados se traducen con la tabla
   `rdb_enums` (cacheada en `src/lib/rdb/enums.ts`), no con CASE hardcodeados.
6. **Fórmulas estándar** (sobre `itr_thread`):
   - Talk Time = `duration - wrapup_duration` · AHT = `duration` · ACW = `wrapup_duration`
   - Atendida = `termination_state = 1` · Abandonada = `termination_state = 6`
   - Agente humano = `ph_e_user.type = 1`
   - Tiempo de cola = suma de `itr_segment.duration` con `state IN (2,3)`
   - Cola media = media sobre entrantes ATENDIDAS (0 s si no esperaron); la
     espera de las abandonadas se muestra APARTE, nunca mezclada
   - Interacciones gestionadas (unidad facturable) = atendidas, no todos los hilos
   - Origen: `origin` 1=Inbound · 2=Outbound · 3=Workflow
6.b **SLA, cola y % abandono SOLO sobre `origin = 1`** (entrantes). Verificado
   09/09/2026 con datos reales: de 4.894 atendidas de un día, 4.322 eran
   SALIENTES y ninguna de las que no tenían fila de cola era entrante. Usar el
   total de atendidas como denominador del SLA lo multiplica por ~8,6 y lo deja
   clavado cerca del 100 %. Las salientes no hacen cola: su tiempo en estado
   2/3 es enrutado del marcador, no espera de un cliente. `KpiCampaniaHoy`
   lleva `atendidasInbound`/`abandonadasInbound` justo para esto, y son el
   único denominador válido de esos tres indicadores (también en la UI).
   `VolumenCampania`/`VolumenDia` llevan también `abandonadasInbound`: el %
   de abandono es SIEMPRE `abandonadasInbound / inbound`, en todas las vistas.
7. **Flat tables vs replicación**: flats (`flat_int_*`, `contacts_*`) tienen ~15 min
   de retraso → para histórico. Supervisión intradía usa tablas de replicación
   (`itr_thread`, `ag_in_cp_log`...) que van casi en tiempo real.
8. Tablas con espacios en el nombre van con corchetes: `[contacts_Xperience Routing]`.
9. **Scoping de clientes EN EL SQL**: un usuario `cliente` solo ve sus campañas
   (mapeo en SQLite `client_campaigns`). El filtro se aplica como parámetros en la
   query, nunca solo ocultando UI.
10. **Not Ready (pausas) SE DEDUPLICAN obligatoriamente**: `ag_in_cp_log` registra
    cada evento Not Ready (`op_type = 2`) UNA VEZ POR CADA CAMPAÑA en la que el
    agente está abierto dentro del servicio. Un `SUM(duration)`/`COUNT(*)` crudo
    cuenta el mismo evento N veces e infla los tiempos ~10-20× (verificado:
    61.060 → 4.305 min en un día real). Reglas:
    - **Duplicados** (mismo agente+servicio+motivo+inicio+duración, distinta
      campaña) y **solapados** (mismo periodo real con `start_time` algo distintos
      pero mismo fin): quedarse con **UNA fila por evento real, la de duración
      MÍNIMA**. Nunca sumar duraciones ni contar repeticiones.
    - Algoritmo O(n log n) con window functions (clústeres de solapamiento por
      `MAX(fin) OVER ... ROWS UNBOUNDED PRECEDING AND 1 PRECEDING`, gana la menor
      duración del clúster) implementado en `queries/agentes.ts::razonesNotReady`.
      Es la misma lógica de la vista SSMS `v_not_ready_detalle`. NO simplificar.
    - `cp_general_cfg` es 1:N (campaña→servicio): fijar `MIN(service)` por campaña
      antes del JOIN para no volver a multiplicar filas.
10.b **`ag_in_cp_log.duration IS NULL` = evento AÚN ABIERTO**, no duración cero.
    Verificado: un día cerrado no tiene ni un NULL; hoy, 235 de 919 filas de
    `op_type = 0`. Tratarlo con `ISNULL(duration, 0)` hacía que las sesiones en
    curso contasen CERO (medido: 44,7 h en vez de 116,7 h de logadas de hoy,
    −61 %). Todo intervalo abierto se cierra en `GETDATE()`, acotado a
    `@hastaExcl` para no salirse del rango pedido. Aplica a horas logadas/ready
    y a las pausas Not Ready.

11. **Horas LOGADAS/READY también se duplican** (mismo motivo que las pausas):
    `op_type = 0` (Open/logado) y `op_type = 1` (Ready) se graban una fila por
    campaña abierta. Sumar por campaña multiplica el tiempo (~×13 medido).
    - La hora real de un agente es la **UNIÓN de sus intervalos**, no la suma.
      Solo tiene sentido como cifra **GLOBAL / por agente**, nunca por campaña.
      Implementado en `queries/agentes.ts::horasAgenteReales` (gaps & islands).
    - En `/operaciones` y `/direccion` el KPI "Horas logadas (reales)" usa esa
      cifra global. Las columnas por campaña NO muestran logadas/ready.
    - **Facturación por campaña que use horas** → unidad `horas` = horas
      PRODUCTIVAS (`itr_thread`, gestión real, no duplicada), no logadas. Ver
      `src/lib/facturacion.ts`. Facturar horas LOGADAS es otra unidad, por
      cliente y desde `user_log` (regla 16).
    - Medido 10/09/2026 en un día real: 2.602 h sumando `ag_in_cp_log` por
      campaña frente a 189 h de unión real → **×13,8**. Por eso las horas
      logadas/ready **por campaña ya no se calculan ni se guardan**: se quitaron
      de `UnidadesCampania` y de `MetricaDiariaCampania`, y las columnas
      `horas_logadas`/`horas_ready` de `agg_daily_campaign` quedan OBSOLETAS
      (las filas anteriores a esa fecha conservan el valor inflado).
    - `horasProductivas` se calcula **en el SQL** como
      `SUM(CAST(duration AS BIGINT))/36000.0` de las atendidas, no como
      «AHT medio × atendidas»: es una cifra que se factura y no debe arrastrar
      el redondeo del AHT. El CAST evita desbordar el int al sumar décimas.

12. **Campañas `Test_*` fuera de los KPIs SIEMPRE.** `listaServicios()` ya las
    excluye en el SQL, pero el maestro `listadoCampanias()` las devuelve (lo
    necesita el mapeo del admin). Al construir el alcance sin servicio elegido
    hay que filtrarlas en `campaniasEfectivas()`, o la vista «todos los
    servicios» las cuenta (24 de 201 campañas en esta instalación).

13. **Rendimiento: no volver a `NOT EXISTS` sin cota superior sobre
    `activity_history`** (1,9 M de filas). Preguntar «¿el último evento del
    contacto cae en el rango?» con `NOT EXISTS (... event_moment >= @hastaExcl)`
    obliga a recorrer todo lo posterior al rango: **40 s para un solo día**.
    Comparar contra `MAX(event_moment)` por actividad usa el índice
    `ixactivity_act_hist` y da **0,2 s con resultado idéntico** (176×).

14. **El driver trabaja en HORA LOCAL (`useUTC: false` en `rdb/pool.ts`). No
    quitarlo.** RDBv2 guarda `start_time`/`event_moment` en hora local de España
    (`gmt_start_time` es la UTC; diferencia medida: 120 min en verano) y el
    servidor SQL está en +02:00, igual que Node. Con el valor por defecto del
    driver (`true`) los parámetros viajaban en UTC: pedir el día 21 a las 00:00
    llegaba como el 20 a las 22:00, y al leer, un 10:00 salía como 12:00 (la
    frescura de /admin decía siempre «hace menos de 1 min»). Verificado
    29/09/2026. En llamadas apenas se notaba (10 hilos de 117.929 entre las
    22 y las 24 h en septiembre); en leads, 365 eventos al mes caían mal.

15. **Un usuario de Altitude por agente y cliente** (planificación de turnos):
    `usr_name = <PREFIJO>_<nº 4 díg.>[_SUFIJO]` (GH_0851, GH_0851_BD,
    GH_1067_BD_LX, UGR_0851, Av_0985, Soc_Fed_0892…; parseo en
    `planificacion/usuarios.ts`). Por eso la unión de sesiones (`ag_in_cp_log`
    op_type 0) **por usuario** da horas por cliente sin el ×13 de la regla 11
    (`agg_sesion_usuario`: verificado 30/09/2026, su suma de un día cuadra al
    céntimo con `horasAgenteReales` en 5 días). Por agente (nº), la unión de
    TODOS sus usuarios da la hora real de la persona. No mezclar las dos: con
    dos usuarios logados a la vez, la suma por cliente supera la hora real.
    - Los usuarios sin nº de agente (Angeles, Christian, TM_*, 1053_KIT…) quedan fuera.
    - Festivos y horarios: tablas propias de RDBv2 `festivos_servicio` y
      `horarios_servicio`, que mantiene supervisión, con vigencia hasta el
      31/12/2026 (el módulo avisa al salirse). `TipoDia` solo vale `FESTIVO`.
      `ServicioDirectorio` NO siempre es `ph_service.name`: GrupoHuertas sí,
      pero Ávolo es `GrupoAvolo` → cada cliente lleva `parametros.calendario`.
    - Los hilos de 2 h o más se descartan de la gestión (CEFF tiene duraciones
      imposibles): `t.duration < @maxSeg * 10`, con `plan.maxSegHilo` = 7200.
    - El SQL de las islas es común (`queries/islas.ts`) a `horasAgenteReales` y
      a la planificación: `npm run verificar` dio lo mismo antes y después.

16. **Facturar por HORAS LOGADAS = `user_log` de los usuarios del cliente**
    (decidido 01/10/2026 con Christian; unidad `horas_logadas`).
    - Cuenta el tiempo logado (login → logout) **aunque no haya campaña
      abierta**: por eso es `user_log` y no `ag_in_cp_log` op 0 (este solo
      ve el tiempo con campaña abierta: 5,39 h menos en GH, septiembre 2026).
    - **Solo los usuarios del cliente**: `<PREFIJO>_nnnn` exacto, con el
      prefijo en `billing_config.prefijo_usuario` (GH). Fuera: los que no
      llevan el prefijo (Angeles: 14 h en campañas GH en septiembre), los de
      bbdd con sufijo (`GH_0851_BD`, `_BD_LX`), que se facturan a propósito
      de otra forma por sus campañas (`gh_bbdd_*`: contactos finalizados a
      2 €, Lexus a 3 €, y su DDI; corregido en producción antes del
      14/10/2026, cuando aquí ponía «horas productivas a 2 €»), y
      `GH_Cargador2`.
    - Es una línea por CLIENTE (ámbito servicio), nunca por campaña: `user_log`
      no sabe de campañas. Las campañas que heredan esa config salen como
      «Horas logadas (cliente)» y no llevan importe propio.
    - Solo `ph_e_user.type = 1`: los puertos IVR y el router dejan sesiones
      con `duration NULL` durante semanas (31/08/2026); en agentes, NULL solo
      es la sesión de hoy en curso (se cierra en `GETDATE()`, regla 10.b).
      Las sesiones solapadas de un usuario se funden (173 de 97.798).
    - Es la misma fuente que el Excel de operaciones («HORAS LOGADAS POR
      CAMPAÑAS», vista `v_TM_TiempoAgentLogado` = `user_log`, verificado fila
      a fila): septiembre 2026 cuadra al céntimo usuario a usuario (GH
      1.027,88 h, UGR 195,42 h, Av 23,45 h). El dashboard antes facturaba
      GH por productivas: 848,28 h. Análisis completo:
      `docs/facturacion-horas-logadas.md`.
    - **Reparto por campaña = método del Excel de operaciones** (decidido
      14/10/2026 con Christian; sustituye al de usuario y día del 09/10, que
      dejaba 35,26 h «sin actividad» sin código de GS y movía 70,6 h entre
      campañas). El TOTAL del mes se reparte de una vez en proporción al
      tiempo de agente de los usuarios del cliente en cada campaña: Σ
      `itr_segment.duration` con `state NOT IN (2,3)` de sus hilos con
      `origin IN (1,2)`, atendidos o no, sin los de `itr_global.to_address`
      vacío (salientes sin número). Solo campañas del servicio sin config de
      campaña propia (las bbdd llevan la suya).
      - **Prefijos excluidos** (decidido 15/10/2026: «no sé el motivo, pero
        se quitan»): tampoco cuentan los hilos cuyo número marcado (o hunt
        group) empieza por uno de la lista del cliente, como el segmentador
        «Pref_To_Entrat» del Excel. La mantiene Operaciones en
        `/operaciones/reparto` (`app_settings`
        `facturacion.prefijosExcluidosReparto.<servicio>`). GH: 0673, 0716,
        1157, 1161, 6735, 7013, 7014, 7017, 7190, 8259, 8367, 8374, 8384,
        8394, 8430, 8537, 8554, 8761, 8800.
      - Las filas se redondean por mayor resto: suman EXACTAMENTE el total.
        Septiembre GH con la lista: 1.027,88 h; 19 de 38 campañas al céntimo
        frente a «facturacion cerrada» y todas a ±0,3 h (sin ella, 14; el
        resto son arreglos de redondeo a mano del Excel). Ver
        `docs/facturacion-tarificacion.md`.
      - No se usa `ag_in_cp_log`: los usuarios GH tienen más de 15 campañas
        abiertas a la vez el 92,8 % del tiempo (×34 sumando por campaña) y
        repartirlo da casi lo mismo a todas.
      - Código: `baseRepartoHorasLogadas` (queries/facturacion.ts) y
        `repartirHorasLogadas` (puro, con tests). Es lo que va a la fila de
        cada campaña en la «Factura por campaña» de Operaciones (regla 19).

17. **Ratios de éxito (decidido 09/10/2026 con Christian)**: éxito =
    `script_session.business_status = 3` en todas las campañas; se ven en
    Supervisión (Tiempo real e Histórico, `components/kpi/ratios-exito.tsx`).
    SQL en `queries/ratios-exito.ts`; cálculo PURO con tests en
    `lib/ratios-exito.ts`. Verificado en septiembre 2026:
    - **Los éxitos se cuentan en `script_session`, NUNCA uniendo con
      `itr_thread`** (`itr_thread.script_session` liga los dos). En Bolsas,
      Socios y UGR una sesión agrupa 2-3 llamadas atendidas del mismo
      agente al mismo contacto (otro teléfono, otro `itr_global`): 46.176
      atendidas para 24.619 sesiones en Bolsas, y 1.180 sesiones de éxito con
      2 o más hilos.
    - Conversión con DOS denominadores: **contactos** (sesiones de script, la
      que vale para todas las campañas y la del índice) y **atendidas** (la de
      siempre en GH, donde sale igual). Con atendidas, Bol_0365 daba 1,17 % en
      vez de 2,03 %.
    - **Efectividad de cierre** = éxitos ÷ (éxitos + sin éxito), solo en las
      campañas que han usado el estado 4 en los 90 días anteriores
      (`campaniasConSinExito`): las 19 de Bolsas, Soc_Avisos y Soc_Incidencias
      no lo usan y daría siempre el 100 %.
    - **Índice** = éxitos reales ÷ esperados × 100, siendo esperados = Σ
      contactos del agente por campaña × conversión de la campaña en el mismo
      rango y alcance. Con menos de 30 contactos, «muestra pequeña».
    - Éxitos por hora LOGADA solo por agente (`user_log` de su usuario, regla
      16); por campaña, por hora PRODUCTIVA, que **descarta los hilos de 2 h o
      más**: 6 hilos de CEFF sumaban 1.766 h de las 3.871 h productivas de
      septiembre. Ojo: la tabla de productividad de Supervisión y las horas
      productivas de facturación NO aplican aún ese corte.
    - **Dirección** (09/10/2026): la misma sección, en vivo para el rango
      elegido y con variación frente al mes anterior; «Éxitos» y «Conv.
      contactos» en «Detalle por campaña»; y la gráfica «Conversión 12 meses»
      desde `agg_daily_agent_campaign` (migración 0006: sumas por día, usuario
      y campaña; la rellena `npm run agregados`). Backfill del 01/06/2025 al
      08/10/2026 en 49 s; septiembre cuadra exacto con la consulta en vivo
      (61.457 contactos, 88.771 atendidas, 5.430 éxitos; solo GH, también).
    - Pendiente: objetivos de conversión por campaña con semáforo (más
      adelante). Operaciones aún no ve los ratios (su panel no tiene la
      sección; Supervisión y Dirección piden sus propios roles).

18. **Resultados de actividad (decidido 13/10/2026 con Christian)**: pestaña
    «Resultados» de Supervisión (`?vista=resultados`). SQL en
    `queries/resultados-actividad.ts`; cálculo PURO con tests en
    `lib/resultados-actividad.ts`; configuración en `/admin/resultados`
    (SQLite `resultados_config` y `objetivos_resultados`, migración 0007).
    - **Fuente**: la tipificación del script está en `ao_<servicio>`
      (`table_schema.ts_type = 3`), ligada por
      `script_session.code = ph_activity_outcome.script_session` y
      `ph_activity_outcome.code = ao.easycode`. Sus columnas guardan
      `ph_table_schema_enum_value.code` (único en la instalación) y de ahí
      sale el texto. Columnas distintas por servicio: GH `resultado`/
      `subresultado`, UGR (EGRE26) `resultado_egr`/`motivo_egr`, Bolsas y
      Socios `call_type`, Ávolo `motllamada`.
    - **Finalizado** = contacto CERRADO (`activity.status = 3`, fechado por su
      último `event_moment`, como «leads finalizados») que tipificó un agente,
      asignado al agente de su última sesión de agente en los 90 días
      anteriores al cierre (la que tiene fila en `ao` manda). Aparte, fuera
      de los ratios: **sin tocar** (familias NotTouched*,
      AutomaticallyRescheduled, *BeforeConnection, Overflowed de
      `ContactBusinessStatus`, resueltas con `rdb_enums`; casi todos son
      `IVR_*`) y **cierres administrativos** (tipificados sin sesión en esos
      90 días: el 08/09/2026 se cerraron en bloque 278 contactos de GH
      tipificados en marzo de 2025). Éxito = familia Success* del contacto.
    - **Bruto** = éxitos ÷ finalizados. **Neto** = éxitos ÷ (finalizados − no
      válidos). «No válido» = algún valor de las columnas configuradas
      marcado en el admin; sin configurar no hay neto, y en totales mixtos el
      neto se calcula solo con los servicios configurados.
    - Verificado en septiembre 2026: GH 8.417 finalizados, 2.526 éxitos,
      2.973 «No valido» → **bruto 30,01 %** (el objetivo de `RATIOS_RF` es
      30) y **neto 46,40 %** (`RATIOS_RF` dice 70: allí se calculaba de otra
      forma). UGR con `resultado_egr` y «No valido»: 91,22 % / 97,69 %.
    - **Tablas temporales** (`#cerr`, `#ses` en tempdb): con CTEs en una sola
      sentencia el optimizador no estima los cerrados y pasaba de 5 minutos
      para un mes; materializados, 1-2 s al mes y 7,9 s los dos primeros pasos a 12 meses (en
      vivo, sin agregado). Se borran al empezar por si una consulta anterior
      de la misma conexión del pool falló a medias. **`OPTION (HASH JOIN)`
      en el paso de la última sesión es obligatorio**: según cuántos cerrados
      haya, el optimizador elegía bucles anidados y el mes en curso
      (01-13/10/2026) pasaba de 200 s; con hash, 0,2 s. No quitarlo.
    - **Siempre de UN cliente** (pedido por Christian el 13/10/2026): la
      pestaña no tiene «Todos» y sin `?servicio=` no consulta nada, solo
      pide elegir cliente (`SelectorServicio obligatorio`).
    - **Tipos de campaña** (pedido el 14/10/2026 para separar las BBDD de
      GH): cada cliente puede definir tipos con patrones LIKE en
      `/admin/resultados` (GH: `BBDD: gh_bbdd_%`). Se guardan en
      `app_settings` (`resultados.tipos.<servicio>`, sin migración). El panel
      enseña «Todas · Sin BBDD · Solo BBDD» (`?tipo=resto|solo:<tipo>`); con
      varios tipos, «Resto» = de ninguno. Se filtra la LISTA de campañas
      antes de consultar (`filtrarPorTipo`), así que no cambia ningún
      cálculo; una lista vacía devuelve resultado vacío (en `filtroCampanias`
      vacío significaría «todas»). GH septiembre: sin BBDD 5.950
      finalizados, bruto 35,45 %, neto 59,97 %; solo BBDD (4 campañas)
      2.467, 16,90 % y 21,64 %; suman el total.
    - Los nombres de tabla y columna `ao_*` van en el SQL como identificadores
      (no admiten parámetros): solo los de `tablasResultados()` (lista blanca
      desde `table_schema` + `INFORMATION_SCHEMA`, columnas enteras), con
      `^[A-Za-z0-9_]+$` y entre corchetes, comprobados en cada consulta
      (`configValida`). Los códigos sí van como parámetros. Una sola consulta
      para todos los servicios: un `LEFT JOIN` por tabla `ao_*` configurada y
      `COALESCE` por nivel (`easycode` casa con una sola tabla).
    - Vistas: por agente (desplegable por campaña), por campaña, desglose
      resultado → subresultado (servicio o campaña), agente frente al RESTO
      de su campaña (marca si el % de no válidos o de un resultado se separa
      ≥ 10 p.p., con ≥ 30 finalizados) y evolución (por día; por semana ISO
      a partir de 62 días). Semáforo con objetivos de SQLite (campaña >
      servicio, vigencia por fechas): verde, ámbar a menos del 10 % y rojo.

19. **Tarificación desde Operaciones (decidido 14/10/2026 con Christian)**:
    sustituye al Excel de facturación de operaciones («Interacciones GH_cs
    v4…»). Ingeniería inversa, decisiones y cifras en
    `docs/facturacion-tarificacion.md`.
    - **Minutos de línea** (unidades `minutos_fijo`/`minutos_movil`):
      segmentos `state = 6` de hilos atendidos. Fuentes:
      - Salientes de agente humano (`origin = 2`).
      - Encuesta NFS: un hilo IVR (`type = 3`) que empieza DESPUÉS de un hilo
        de agente en la misma `itr_global` va a la campaña de ese agente.
        Vale para cualquier cliente, sin tablas de hunt groups.
      - Número = 9 últimos dígitos de `itr_global.to_address`: lleva delante
        el account code, 4 dígitos en GH y 2 en otros.
      - Menos de 9 caracteres es entrante (hunt group) o extensión, y no se
        cobra; más de 13 tampoco.
      - Clasificación pura en `lib/tarificacion.ts`: móvil 6xx y 71x-74x;
        fijo 8xx y 9xx; especial 901-909, 803-807 y 70x (se presupuestan
        desde comercial: se enseñan, no se cobran); sin coste 800 y 900 (ni
        se cobran ni cuentan).
      - Septiembre 2026: móvil 8.843,50 min frente a 8.842,38 del Excel;
        fijo 39,06, exacto.
    - **DDIs** (unidad `ddi`, tabla `ddis`): cada fila es una ASIGNACIÓN
      número → campaña con fechas (el mismo número se reasigna; `numero` no
      es único).
      - Cuota del MES ENTERO, sin prorrata, por número activo algún día del
        mes, una vez por número: a la asignación de alta más reciente.
      - El relevo el mismo día no es solape. Septiembre: 365, igual campaña a
        campaña.
      - Opción de la línea `ddi` (`billing_config.solo_con_actividad`,
        migración 0009, 15/10/2026): «solo los meses con llamadas». Depende
        del presupuesto del cliente (comercial/dirección); para las bbdd de
        GH entre tandas. Mes con llamadas = algún hilo de la campaña ese mes.
    - **Códigos de GS** (`campanias_gs`): uno vigente por campaña; las bbdd
      cambian de código en cada tanda. Los mantiene el rol `operaciones`
      (`ROLES_OPERACIONES_EDICION`, + admin), igual que los DDIs y el cierre
      de mes. Dirección solo ve.
    - **Factura por campaña** (`lib/facturacion-campania.ts`, puro):
      - Junta en una fila por campaña su parte de las horas logadas (regla
        16), las líneas de `billing_config` y el código de GS.
      - Una campaña con config propia (bbdd) no hereda la del servicio:
        necesita su propia línea de DDIs.
      - `facturacionCompleta()` (`lib/facturacion.ts`) es la ÚNICA cadena
        para la pantalla, el export y el cierre.
      - **Totales por cliente** (16/10/2026): en «Factura por campaña» y
        «Unidades por campaña», cada cliente con más de una campaña lleva
        una fila de total («Total GrupoHuertas») con la suma de cada
        columna; con «Todos»,
        además «Total general» y la columna «Cliente». La hoja «Factura por
        campaña» del XLSX lleva los mismos subtotales; «Detalle», no (mezcla
        filas de cliente y de campaña y se sumaría dos veces). Puros:
        `agruparPorServicio` y `totalesUnidades`, con tests.
    - **Cierre de mes** (`facturacion_cierres` + `_lineas`): foto fija de un
      mes PASADO y completo de un servicio, con los precios de entonces.
      - Como mucho uno «cerrado» por mes y servicio (índice único parcial).
      - Reabrir: solo admin.
      - Mes cerrado: la pantalla y el export enseñan lo guardado y avisan si
        lo calculado ahora difiere (`?vivo=1` lo recalcula).
      - Histórico ene-2025 → sep-2026 importable del Excel (origen
        `importado`, sin código GS).
      - **Ajustes manuales** (decidido 15/10/2026, migración 0010,
        `facturacion_cierre_ajustes`): con el mes cerrado, Operaciones quita
        una línea, una campaña entera o le cambia el precio, siempre con
        motivo.
        - La línea original no se toca: el ajuste se puede deshacer.
        - El total del cierre se recalcula (`aplicarAjustes`, puro).
        - Pantalla, histórico, Excel y fichero de GS salen ajustados
          (`lineasAjustadas`).
        - Es para las decisiones puntuales de dirección que ninguna regla
          deduce: julio de 2026, bbdd a precios distintos; agosto, sin
          facturarlas.
    - Comprobación: `npm run facturacion:comparar -- --archivo … --mes
      YYYY-MM` (sin SQLite: DDIs y precios del propio Excel).
      - Septiembre: 35.120,10 € en los dos.
      - Mayo-agosto: entre −0,11 € y −3,79 € al mes.
    - **Fichero de albaranes de GS** (`lib/albaranes-gs.ts`, puro, y
      `api/export/albaranes-gs`; 15/10/2026, con los ejemplos de septiembre
      de operaciones):
      - Solo de un mes CERRADO. Dos ficheros:
        - «ventas»: Cod Camp, Horas Logadas, Tarif Fija, Tarif Movil, Ddis.
        - «promociones», para las bbdd: igual con Contactos Finalizados en
          vez de horas.
      - Formato: texto tabulado, coma decimal con 2 decimales en horas y
        minutos, enteros en contactos y DDIs, sin separador de miles, CRLF y
        sin BOM. Son cantidades: los precios los pone GS.
      - Se niega si alguna campaña del cierre no tiene código de GS.
      - No incluye las campañas a cero (el Excel sí listaba las acabadas).
    - Las bbdd entre tandas no siguen una regla:
      - Julio de 2026: el Excel las facturó con precios a mano (contactos a
        ~1,63 € y DDI a 31,32 €).
      - Agosto: no se facturaron por decisión de dirección, aunque hubo 3
        llamadas sueltas el 03/08.
      - Se resuelven con los ajustes manuales del cierre (arriba).

## Referencia del esquema RDBv2

- `docs/referencia_bbdd_altitude_v85.md` — esquema completo, enumerados, relaciones
  y queries validadas (7.1–7.8). **Consultar SIEMPRE antes de inventar tablas/columnas.**
- `docs/esquema-real.md` — generado por `npm run introspect` contra la BBDD real
  (si no existe, aún no se ha ejecutado con credenciales).
- `docs/instrucciones.md` — contexto original del flujo manual con Claude chat.
- `docs/registro-sesiones.md` — índice de TODAS las sesiones de trabajo (qué se
  hizo, commits y dónde está el detalle). Al cerrar una sesión, añadir su fila.
- `docs/facturacion-horas-logadas.md` — Excel de horas de operaciones
  (`v_TM_TiempoAgentLogado` = `user_log`) frente al dashboard y la unidad
  `horas_logadas` (regla 16).
- `docs/facturacion-tarificacion.md` — el Excel de facturación de
  operaciones (horas repartidas, minutos fijo/móvil con la encuesta, DDIs,
  GS) y cómo lo reproduce el dashboard, con la comparación mes a mes (regla 19).

## Arquitectura

- **Next.js 16 App Router + TypeScript**, Server Components y Server Actions.
- **SQLite** (better-sqlite3 + Drizzle) en `src/lib/db/` — usuarios, sesiones,
  clientes, mapeos, billing_config, sla_config, agregados diarios, auditoría.
  Auto-migra al arrancar (`src/lib/db/sqlite.ts`).
- **RDBv2** (mssql) en `src/lib/rdb/` — pool singleton (`pool.ts`), enums cacheados
  (`enums.ts`), cache TTL (`cache.ts`), queries por dominio en `queries/*.ts`.
- **Auth propia**: sesiones en BBDD + cookie httpOnly (`src/lib/auth/`). Roles:
  `admin | direccion | operaciones | supervision | cliente`. Dirección ve
  también Operaciones y Supervisión (`ROLES_OPERACIONES`/`ROLES_SUPERVISION`
  en `rbac.ts`, 13/10/2026). El proxy
  (`src/proxy.ts`, el "middleware" renombrado en Next 16) solo comprueba presencia
  de cookie; la validación real la hace **cada `page.tsx`** llamando a
  `requireRol()` (`src/lib/auth/rbac.ts`), igual que cada Server Action y route
  handler. **Nunca solo en un layout**: layout y página se renderizan en
  paralelo y la redirección del layout salía con la página entera en el cuerpo
  (verificado 23/09/2026 con una cookie inventada: usuarios, IPs de auditoría y
  tarifas de `/admin/*`). `ipPeticion()` solo hace caso a
  `x-forwarded-for`/`x-real-ip` si `TRUST_PROXY=1`: esas cabeceras las pone
  quien llama y la clave del rate-limit es usuario+IP, así que sin proxy real
  delante se podía rotar la cabecera y saltarse el bloqueo de 5 intentos.
  En producción lo pone a 1 el `docker-compose.yml`: el nginx del servicio
  `web` las REESCRIBE con `$remote_addr` y `app` no publica puerto. Fuera de
  Docker (`npm run dev`/`start`), 0.
- **Modo mock**: con `RDB_MOCK=1` (ver `.env.example`) la capa RDB devuelve datos
  ficticios realistas (`src/lib/rdb/mock.ts`). Permite desarrollar UI sin
  credenciales. Las páginas no distinguen mock de real.
- Vistas por rol: `/direccion`, `/operaciones`, `/supervision`, `/clientes`, `/admin`
  y `/planificacion` (ver «Planificación de turnos» más abajo).
- **Supervisión** tiene tres pestañas (`?vista=`): «Tiempo real» (hoy, polling 60 s,
  incluye estado de agentes ahora), «Histórico» (rango de fechas: ayer, últimos 7
  días, mes anterior o intervalo) con las mismas métricas de cola/SLA/productividad,
  y «Resultados» (resultados de actividad, regla 18; por defecto el mes en curso y
  siempre de un cliente).
  Las queries comparten un `*Core(desde, hasta)`; las variantes `*Hoy` cachean 60 s
  y las `*Rango` con `ttlSegunRango`.
- **Operaciones** (rehecha el 15/10/2026 para que abra rápido):
  - Empieza SIN cliente y sin consultar nada. «Todos los clientes» es una
    opción explícita del selector (`?servicio=todos`, `TODOS_SERVICIOS` en
    `lib/servicio-todos.ts`; `SelectorServicio todosExplicito`).
  - Pestañas como enlaces (`?vista=facturacion|cerrados|listas|pausas`, como
    Supervisión): cada una consulta solo lo suyo.
  - Cada sección (`operaciones/secciones.tsx`) va en `<Suspense>` y recibe la
    promesa de sus datos sin que la página la espere: cabecera, filtros y
    pestañas salen al momento.
  - Medido en build de producción contra RDBv2:
    - Primer contenido en < 0,1 s.
    - Página completa: 1,3-2,2 s con un cliente (y con «todos» en un mes
      entero); 0,1-0,2 s «Meses cerrados» y «Listas».
    - El primer acceso tras arrancar el servidor tarda unos 5 s más (arranque
      de Next, sea cual sea la página).
- **Agrupación por Cliente/Servicio**: en esta instalación **cada cliente = un
  servicio** (`ph_service`). `/direccion`, `/operaciones` y `/supervision` llevan
  un `SelectorServicio` (dropdown `?servicio=<nombre>`, vacío = todos; en
  Operaciones, vacío = ninguno y `todos` = todos). El server
  resuelve el servicio a sus campañas con `campaniasDeServicio()`
  (`queries/servicios.ts`, cacheado 24 h, excluye `Test_*`) y las pasa como el
  parámetro `campanias?` que ya filtra las queries EN EL SQL (`filtroCampanias`).
  Para añadir el scope a una query nueva: acepta `campanias?: string[]`, mete
  `claveCampanias(campanias)` en la clave de cache y aplica `filtroCampanias`.
  Supervisión filtra también en su API de polling (`/api/supervision/datos`).
- **Campañas IVR**: son automáticas (locución/enrutado), prefijo `IVR_` (helper
  `esIvr`). **Por defecto NO se cuentan** en los KPIs: cada panel lleva un check
  «Incluir IVR» (`?ivr=1`). `campaniasEfectivas(servicio, incluirIvr)` resuelve la
  lista (excluye `IVR_*` salvo que se marque). La llamada IVR no la atiende un
  agente: el agente/callback ocurren en hilos hermanos enlazados por `itr_global`.
  Métrica `metricasIvr` (en `queries/supervision.ts`, tarjeta en Supervisión): de
  las entrantes por IVR (`origin=1` distinct `itr_global`): **atendidas por agente**
  (hermano con `e_user.type=1` y `termination_state=1`), **no atendidas** (el resto)
  y **no atendidas en horario** = las que entraron mientras había ≥1 agente logado
  (`ag_in_cp_log op_type=0`) en las campañas del servicio → "horario de producción"
  DINÁMICO (sin config fija). OJO: el `itr_global` NO liga la no-atendida con su
  callback (los hermanos `origin=2` son salientes del agente en llamadas atendidas)
  y los números salientes van codificados ≠ entrante → el seguimiento
  «devuelta/pendiente» de callbacks quedó PENDIENTE de definir el mecanismo real.
- **Planificación de turnos** (rama `feature/planificacion`, plan por fases en
  `docs/plan-planificacion.md`; F1 = datos y motor y F2 = tablero de solo
  lectura, «Generar» y configuración, hechas el 30/09/2026; F3 = edición,
  ausencias, bolsas, publicación y versiones, hecha el 01/10/2026; F4 =
  seguimiento, hecha el 06/10/2026; F5 = tarea nocturna, hecha el 09/10/2026):
  - **Motor PURO** en `src/lib/planificacion/motor/`: sin I/O, sin
    `Date.now()` ni azar, solo date-fns y zod (una regla de ESLint lo impide).
    **No añadirle I/O**: corre también en el navegador (tablero, F2) y en los
    tests. Entrada `EntradaMotor` → `generarPlan()` → bloques, avisos, resumen
    y mínimos. `validaciones.ts` son las MISMAS reglas duras/blandas en motor,
    tablero y Server Actions.
  - `cargador.ts` arma la entrada desde SQLite (+ festivos/horarios de RDBv2,
    cacheados 24 h); `repositorio.ts` es todo el acceso a SQLite del módulo;
    `parametros.ts`, los globales `plan.*` de `app_settings` (zod + valores por
    defecto). Nada de agentes, clientes, colores ni parámetros en el código:
    la semilla (`npm run planificacion:semilla`) solo rellena lo que falta.
  - Tablas (migración 0003): configuración `plan_clientes`, `plan_prefijos`,
    `plan_tipos_ausencia`, `plan_agentes`, `plan_agente_usuarios`,
    `plan_patrones` + `plan_patron_tramos`, `plan_agente_turnos` (rotación A/B
    desde `plan.semanaA`); plan `plan_versiones` (como mucho un borrador por
    mes, también con índice único parcial), `plan_bloques`, `plan_ausencias`,
    `plan_bolsas`, `plan_objetivos`; agregados propios `agg_hora_servicio`
    (franjas de 30 min, sumas), `agg_sesion_usuario` (islas por usuario y día,
    `inicio_seg`/`fin_seg` desde las 00:00), `agg_cierres_campania` y
    `plan_listas_estado` (foto de `activity`). El motor y el tablero NO
    consultan RDBv2 en caliente: leen estos agregados. F4 (migración 0005):
    `agg_logado_usuario` (islas de `user_log` por usuario y día) y
    `plan_saldo_ajustes`.
  - Cliente de planificación ≠ servicio: GH, BD (usuarios `_BD`) y LX
    (`_BD_LX`) son del servicio GrupoHuertas; BD y LX «cuentan como» GH en la
    cobertura. Los patrones de campaña (`plan_clientes.campanias`) son LIKE y
    gana el más específico. Deben apuntar SOLO a la lista EN CURSO
    (`UGR[_]EGRE26`, `CajaR[_]Autonomos[_]26`): las antiguas conservan vivos
    que ya nadie llama y inflan el objetivo.
  - Todo en minutos; `plan.pasoMin` = 60 (pasar a 30 min es cambiar el parámetro).
  - **Rutas y permisos** (`ROLES_PLAN_LECTURA` / `ROLES_PLAN_EDICION` en
    `rbac.ts`): `/planificacion` (meses y avisos de entrada) y
    `/planificacion/[mes]?vista=agente|cliente|dia&semana=&dia=&version=` y
    `/planificacion/[mes]/{ausencias,bolsas,versiones}` las leen supervisión,
    operaciones y dirección (con nombres: roles internos; los formularios y la
    edición, solo supervisión);
    `/planificacion/configuracion/{clientes,agentes,patrones,parametros,ausencias}`
    y TODAS las Server Actions (`acciones.ts` de cada carpeta), solo
    supervisión. Cliente, nunca. Como en el resto del panel, cada `page.tsx` y
    cada acción llaman a `requireRol` (el layout de configuración es solo menú).
  - **La configuración vive en SQLite**: no hardcodear clientes, colores,
    agentes, contratos, patrones ni parámetros; se editan en
    `/planificacion/configuracion` y cada cambio queda en `audit_log`
    (`plan_config`; generar, `plan_generar`).
  - **Parámetros de cada cliente** (`plan_clientes.parametros`): formulario
    por apartados en lenguaje sencillo, sin JSON (09/10/2026).
    `formulario-cliente.ts` (puro, misma regla de ESLint, con tests sobre
    los clientes de la semilla) convierte los campos al mismo objeto de
    siempre, lo valida con `esquemaParametrosCliente` y lo guarda sin las
    claves que valen lo de por defecto. El motor no cambió.
    - Los bloques NO se funden: «11-13, 13-15» son dos bloques y cada uno
      se coloca entero. «Preferidos» = `bonus` > 0.
    - El horario de atención es `horarios_servicio` de RDBv2: aquí solo se
      elige el calendario y se enseña.
    - Cada apartado se oculta según el modo con CSS `:has()`
      (`.form-cliente-plan` en `globals.css`, sin JS).
    - Una clave nueva del esquema necesita su campo, o se perdería al
      guardar: `perdidasAlEditar` lo avisa en pantalla.
  - **Auditoría del plan de un mes**: `plan_generar`, `plan_editar` (guardar,
    copiar la publicada, recortes por ausencia y también los guardados
    RECHAZADOS), `plan_publicar` (avisos aceptados por código y motivo),
    `plan_ausencia` y `plan_bolsa`. Su detalle empieza SIEMPRE por
    `mes=YYYY-MM `: así lo lista `/planificacion/[mes]/versiones`.
  - **Tablero** (`components/planificacion/`): recibe la FOTO de la entrada
    guardada con la versión con lo vivo encima (nombre/color/orden de
    clientes, contratos, ausencias; `vistas.ts::cargarTablero`) y recalcula en
    el navegador, con el motor puro, mínimos (`calcularMinimos`), cobertura,
    validaciones, barras, capacidad y saldo previsto (`lib/planificacion/tablero.ts`,
    puro, misma regla de ESLint). La vista, semana y día van en la URL por
    `history.replaceState`, **dentro de un `setTimeout`**: en el primer montaje
    el efecto del tablero corre antes de que Next instale su `replaceState`
    parcheado, y el original borraba su estado del historial («Atrás» no
    volvía al tablero; verificado 01/10/2026).
  - **Ciclo de versiones**: `borrador` → `publicada` → `sustituida` (al
    publicar otra); regenerar deja el borrador anterior como `descartada`. Una
    publicada NO se edita: «Nuevo borrador desde la vN» la copia (`copia`,
    `basadaEnId`). Como mucho un borrador por mes.
  - **Edición (borrador + supervisión)**: arrastrar (dnd-kit), estirar
    (pointer events propios), menú del bloque (uno para todo el tablero, Base
    UI; necesita un `Menu.Trigger` oculto o los submenús lo cierran) y
    teclado, con deshacer. Las operaciones son PURAS (`lib/planificacion/edicion.ts`,
    misma regla de ESLint): el navegador las aplica al momento y guardar manda
    SOLO la lista de operaciones con la `revision` leída; el servidor
    (`guardar.ts`) las repite sobre los bloques de la BBDD, vuelve a validar y
    escribe en una transacción que exige esa revisión (si otro guardó antes:
    conflicto, aviso y recargar). Nunca aceptar bloques del navegador. Soltar
    encima RECORTA lo que hay (no hay solapes desde el tablero); el hueco de un
    bloque de otro cliente vuelve a GH dentro del turno; un bloque fijado no se
    pisa. Guardar, publicar y las acciones de ausencias y bolsas hacen
    `revalidatePath("/planificacion", "layout")`, para que la caché del router
    no enseñe el plan de antes al volver atrás.
  - **Validaciones** (`motor/validaciones.ts`, las mismas en motor, tablero y
    servidor): DURAS (solape, agente sin usuario del cliente, bloque sobre una
    ausencia, entrante fuera de `horarios_servicio`) impiden soltar y guardar
    si son NUEVAS (las que ya había no bloquean otras ediciones) y publicar
    siempre. BLANDAS (bajo el mínimo, fuera de turno, festivo, semana sobre
    contrato, horas seguidas, saliente fuera de horario): se publica marcando
    «Publicar con N avisos» y con un motivo (≥ 10 caracteres) que queda en
    `motivo_publicacion` y en `audit_log`. El servidor exige que N sea el que
    vio quien publica.
  - Ausencias (`[mes]/ausencias`): son hechos, sin versiones; al darlas de alta
    se pueden recortar los bloques que pisan en los BORRADORES de esos meses
    (no en la publicada). Bolsas y objetivos (`[mes]/bolsas`): la bolsa
    confirmada o, si no, la última anterior prorrateada por laborables
    (`bolsas.ts`, la comparten página y cargador); objetivos semanales a mano
    (vacío = calculado). Se aplican al regenerar. Saldo previsto = plan +
    justificadas − contrato prorrateado por laborables de la semana. Ausencias
    que cuentan como trabajadas: VAC, FEST y RTO («retribución de tiempo por
    objetivos», decidido 02/10/2026); AUS no.
  - **Fin de campaña**: no se conoce; acaba al agotarse los contactos o las
    horas contratadas. `[mes]/bolsas` lo ESTIMA (`motor/estimacion.ts`, puro;
    `estimaciones.ts`): ritmo reciente, lo planificado, campañas parecidas
    terminadas (UGR_EGRE de 2025 para UGR_EGRE26) y contrato. Los parámetros
    opcionales `horasContratadas` + `inicioContrato` topan además el objetivo
    del mes; `campaniasSimilares` fija las referencias.
  - **Ayuda para supervisión, en lenguaje sencillo** (06/10/2026). Fuente
    ÚNICA de los textos: `components/planificacion/ayuda-contenido.ts` (solo
    texto, con test). De ahí salen: el botón «Ayuda» de cada pantalla
    (`ayuda.tsx`, tecla «?» en el tablero: buscador, «Cómo hago…», y por
    pantalla «¿Qué veo aquí?» con captura numerada, «¿Qué tengo que hacer?» y
    «Si pasa esto, haz esto»); los «?» junto a las partes confusas
    (`<PuntoAyuda id="…" />`, textos en `PUNTOS_AYUDA`); y la pestaña «Guía
    sencilla» de la guía de Claude Docs (la «Guía detallada» es la de antes).
    Las capturas (`public/ayuda/*.webp` + `ayuda-capturas.json`) se hacen en
    MODO DEMO con `node scripts/ayuda-capturas.mjs --sqlite <demo.db>` (se
    niega con `dashboard.db`); el JSON entra en el build, así que hay que
    recompilar después. Si cambia el funcionamiento o una pantalla: textos en
    `ayuda-contenido.ts`, capturas con el script y la guía de Claude Docs.
  - «Generar borrador» (`generar.ts`, la misma cadena que el script): si ya hay
    borrador, «respetar mis cambios» pasa sus bloques fijados o manuales como
    `fijados` al motor; «empezar de cero», no. El anterior queda «descartada».
  - **Seguimiento (F4)**, `seguimiento.ts` (servidor) sobre los puros
    `adherencia.ts`, `saldo.ts` y `alertas.ts` (misma regla de ESLint). Plan
    = versión VIGENTE (la publicada; si no hay, el borrador). Lo real es
    **`user_log`** (la fuente de facturación, regla 16), no `ag_in_cp_log`:
    días cerrados desde `agg_logado_usuario`, lo que falte (hoy) en vivo con
    caché de 60 s. Pantallas: `/planificacion/hoy` (polling 60 s,
    `api/planificacion/hoy`) y las pestañas del mes `adherencia`, `saldos`
    (ajustes manuales: supervisión, `plan_saldo_ajuste`) y `cierre` (XLSX en
    `api/planificacion/cierre`).
    - **Adherencia**, minuto a minuto: «correcto» = con el usuario del
      cliente planificado; «cubierto por otro» = con uno que lo cubre sin
      serlo (BD/LX en un bloque de GH; el cliente base en un bloque de
      Ávolo); «a demanda» = con `Av_` durante otro bloque (no es desvío).
      Por turno = todo lo logado ÷ planificado; por cliente = (correcto + a
      demanda) ÷ planificado: lo cubierto NO cuenta (decidido 08/10/2026:
      antes contaba y daba a Ávolo 124,56 h «correctas» de las que solo 11,05
      fueron con `Av_`). La tabla por cliente lleva además «Real del cliente»
      (las horas de Cierre). Septiembre: 97,7 % por turno y 54,5 % por cliente.
    - **Saldo** = trabajadas + justificadas − contrato del día + ajustes; se
      calcula al vuelo (no hay tabla de días). Trabajadas: hasta ayer, lo
      logado de la PERSONA (unión de todos sus usuarios); después, lo
      planificado. Arrastre desde `plan.inicioSaldo` (01/10/2026).
      **Festivos** (08/10/2026, pendiente de que RR. HH. lo confirme): el
      contrato del día es el semanal ÷ 5 de lunes a viernes, festivos
      incluidos, y el festivo justifica las horas de su turno de ese día (si
      se trabaja, cuentan las trabajadas y se compensa con FEST). Antes
      restaba 1/5 del contrato y con 38 h salían saldos de −0,40 h. La misma
      regla en `saldo.ts`, el saldo previsto del tablero y el contrato del
      mes del motor. Quedan decimales solo en semanas partidas entre dos meses
      (1-2/10 con 38 h: 15,20 h), que se compensan con la otra parte.
    - **Cierre**: real = `user_log` de los usuarios de cada cliente; cuadra
      con facturación (GH 1.027,88 h en septiembre) y el grupo GH+BD+LX con el
      Excel de operaciones (1.384,22 h).
    - **Alertas** (vista «Hoy» y tarjeta «Alertas de planificación» de
      Supervisión): Ávolo con entrantes sin atender y nadie con `Av_`; GH bajo
      el mínimo de la franja (si la franja lo sube, tras los minutos de
      margen); planificado sin conectar tras `plan.minutosAlertaConexion`
      (más de 3 → una alerta con la lista); saliente por debajo de
      `plan.pctAlertaRetraso` en la semana.
  - **Tarea nocturna (F5)**, `npm run planificacion:nocturno` a las 02:15:
    `nocturno.ts` (PURO, misma regla de ESLint) decide por fecha y
    `tarea-nocturna.ts` lo ejecuta. Idempotente y se pone al día sola:
    agregados desde el último día agregado hasta ayer; desde el día
    `plan.diaGeneracion` (20), borrador del mes siguiente si no tiene plan;
    una vez por semana (lunes), recálculo de las semanas que no han empezado
    (desde el lunes QUE VIENE) del mes actual y del siguiente
    (`generar.ts::recalcularDesde`): días anteriores copiados tal cual,
    fijados y manuales respetados, resultado SIEMPRE como borrador (autor
    «tarea nocturna») y nada si no cambia ningún tramo. Supervisión lo ve en
    «Para revisar» (/planificacion y tarjeta de Supervisión) y lo publica o
    lo descarta («Descartar el borrador» en Versiones). Estado en
    app_settings (`planificacion.nocturno.*`, `planificacion.agregados_hasta`)
    y en /admin. Con `desde`, el cargador solo reparte objetivos desde ese
    día y descuenta lo ya planificado antes (`horasYaPlanificadas`), también
    al generar el mes siguiente. Probarla SIEMPRE sobre una copia
    (`SQLITE_PATH=<copia>`; la variable de entorno manda sobre el `.env`) o
    con `--simular`.
  - **Importar un mes hecho en Excel** (`importar-excel.ts`): el cliente sale
    del COLOR de la celda (`COLORES_PLANTILLA`); entra como versión publicada
    con origen `importada` y sus ausencias. Septiembre de 2026 está importado
    así en la SQLite real (06/10/2026, v1 publicada, tras backup), con los
    agregados de planificación al día hasta el 05/10.
- **Facturación por servicio o campaña**: `billing_config` tiene dos ámbitos
  mutuamente excluyentes — `serviceName` (lo normal: aplica a TODAS las campañas
  del servicio/cliente) o `campaignShortname` (excepción puntual). Al facturar,
  `calcularFacturacion()` resuelve por campaña: config de campaña → la de su
  servicio → ninguna (necesita el mapa `mapaCampaniaServicio`). Admin lo gestiona
  en `/admin/facturacion` con un selector de ámbito (servicios + campañas).
  La unidad `horas_logadas` (regla 16) va aparte: solo con ámbito servicio y
  prefijo de usuario, la calcula `facturacionHorasLogadas()` una vez por
  cliente (lógica pura en `lib/facturacion-horas-logadas.ts`, con tests) y
  Operaciones la muestra en «Horas logadas por cliente», con el detalle por
  usuario para cuadrar con el Excel de operaciones.
  Desde el 14/10/2026 (regla 19) hay además minutos de línea a fijo y a móvil
  y cuota de DDIs, y todo se junta en la «Factura por campaña» con el código
  de GS (`facturacionCompleta()`). Los maestros (DDIs y códigos de GS) y el
  cierre de mes los lleva Operaciones (`/operaciones/ddis`,
  `/operaciones/campanias-gs`, `operaciones/acciones.ts`); las tarifas, admin.

## Comandos

- `npm run dev` / `npm run build` / `npm start`
- `npm run db:generate` — generar migración tras cambiar `src/lib/db/schema.ts`
- `npm run seed:admin` — crear usuario admin inicial (parámetros por env vars)
- `npm run introspect` — validar esquema real de RDBv2 → `docs/esquema-real.md`
- `npm run agregados [-- --desde 2026-01-01 --hasta 2026-01-31]` — agregados diarios
  (sin argumentos: ayer, en hora local). Cada lote de 7 días REEMPLAZA sus días
  enteros, así que re-ejecutar un rango lo deja idéntico a RDBv2. Recalculado
  entero el 29/09/2026 (01/06/2025 → 28/09/2026, 37 s). Desde el 09/10/2026
  rellena también `agg_daily_agent_campaign` (ratios de éxito, regla 17) en
  los mismos lotes: 16 meses en 49 s.
- `npm run backup` — backup consistente del SQLite a `./backups/`
- `npm test` — tests unitarios con Vitest (`vitest.config.mts`, junto al código
  como `*.test.ts`). Vitest 5, que exige Node ≥ 22.12; `@types/node` va en
  ^22, el mínimo del servidor, para que no se cuele ninguna API exclusiva de
  Node 24. El test del motor usa un fixture real sin nombres y un snapshot:
  si cambia a propósito, `npx vitest -u` y explicarlo en el commit.
- `npm run planificacion:semilla` — clientes, prefijos, patrones, contratos y
  parámetros de planificación. Idempotente: nunca pisa lo ya configurado.
- `npm run planificacion:agregados [-- --desde 2025-06-01 --hasta 2026-09-29]`
  — agregados de planificación (sin argumentos: ayer; `hasta` se limita a
  ayer). Lotes de 7 días que REEMPLAZAN sus días; en la misma pasada
  sincroniza usuarios de agente y hace la foto de listas (`--sin-foto` la
  omite). Backfill completo hecho el 30/09/2026: 70 lotes en 63,5 s, consulta
  más lenta 0,7 s.
- `npm run planificacion:nocturno [-- --simular] [--hoy D] [--forzar-recalculo]`
  — la tarea nocturna de planificación (F5): agregados, borrador del mes
  siguiente desde el día 20 y recálculo de los lunes. `--simular` dice qué
  haría (con los tramos que cambiarían) sin escribir nada; `--hoy` simula otra
  fecha (sin foto de listas). Sale con 1 si falla algún paso.
- `npm run planificacion:generar -- --mes 2026-11 [--hasta-datos D] [--guardar [--reemplazar]]`
  — ejecuta el motor e imprime resumen y avisos; con `--guardar` crea el borrador.
- `npm run planificacion:fixture -- --mes 2026-10 --hasta-datos 2026-09-28` —
  regenera el fixture del test del motor (aborta si detecta un nombre).
- `npm run planificacion:importar-excel -- --archivo "ruta.xlsx" --mes 2026-09 [--guardar [--reemplazar]] [--sin-ausencias]`
  — importa la plantilla Excel de supervisión como versión publicada (sin
  `--guardar`, solo enseña lo que saldría: horas por cliente, colores
  desconocidos y validaciones).
- `npm run facturacion:importar-excel -- --archivo "ruta.xlsx" [--ddis] [--gs] [--historico] [--guardar [--reemplazar]] [--servicio GrupoHuertas]`
  — carga del Excel de facturación de operaciones el inventario de DDIs, los
  códigos de GS y los meses de «facturacion cerrada» (regla 19). Sin
  `--guardar` no abre la SQLite; con él, `npm run backup` antes. Nunca toca
  un mes cerrado desde el dashboard.
- `npm run facturacion:comparar -- --archivo "ruta.xlsx" --mes 2026-09` —
  test de oro de la tarificación: recalcula el mes contra RDBv2 y lo compara
  campaña a campaña con «facturacion cerrada» (sale con 1 si algo se pasa de
  la tolerancia).
- `npm run verificar` — ejecuta los KPIs clave contra RDBv2 real y muestra
  cifras y tiempos (SLA por origen, horas reales de hoy y de ayer, unidades
  facturables, Not Ready). Es el arranque de los «tests de oro» de F2: sirve
  para comparar contra las queries SSMS antes de dar por buenos los KPIs.

## Producción (Docker en Ubuntu, desde el 09/10/2026)

Guía completa, con instalación, corte, actualización, vuelta atrás e
histórico: `docs/despliegue-linux.md`. Reglas que no se ven en el código:

- **Servidor 192.168.151.38** (`ssh tickets-prod`, usuario `tmsystem`, sin
  sudo). Es el de tickets (`/opt/tmsystem/app`, puerto 8080), así que no hay
  que romperle nada. El dashboard vive en `/opt/tmsystem/dashboard` y se
  publica en el **8081**.
- Tres servicios con una sola imagen (`docker/app.Dockerfile`):
  - `web`: nginx, el único puerto publicado.
  - `app`: `next start`.
  - `tareas`: supercronic con `docker/crontab`, a las 02:00, 02:15 y 02:30.
- **El servidor está en UTC.** Los contenedores llevan `TZ=Europe/Madrid`
  (regla 14) y la crontab va en hora de Madrid. Nunca programar tareas del
  dashboard en el cron del host: correrían en UTC (y no admite `CRON_TZ`).
- `name: dashboard` en el compose es obligatorio. Sin él, una carpeta llamada
  `app` pisaría el stack de tickets.
- nginx: `Host`/`X-Forwarded-Host` = `$http_host` (con el puerto). Con
  `$host`, Next rechaza las Server Actions porque el `Origin` lleva el `:8081`.
  Además, `X-Forwarded-For` se REESCRIBE (no se añade) y `proxy_read_timeout`
  es de 180 s (mssql corta a los 120 s).
- El compose fuerza `RDB_MOCK=0`, `TRUST_PROXY=1`, `TZ`, `NODE_ENV` y
  `SQLITE_PATH`. `data/` y `backups/` se montan desde el host. El usuario
  `node` del contenedor tiene el uid 1000, el mismo que `tmsystem`.
- **Migraciones**: en Docker, `next build` usa una SQLite desechable; las
  migraciones entran al arrancar `app`. Por eso, en cada actualización, el
  backup se hace ANTES de `up -d`.
- Para lanzar scripts en producción: `docker compose exec tareas npm run <script>`.
  `tsx` está en `dependencies` (lo necesitan las tareas) y `shadcn` en
  `devDependencies` (solo aporta CSS al compilar; como dependencia de
  producción metía en la imagen 18 avisos de `npm audit`, uno crítico).
- **Next 16.3.6 → 16.3.8** antes de subir a producción (09/10/2026): corrige
  un SSRF en la optimización de imágenes y dos envenenamientos de caché, entre
  otros avisos. `npm audit --omit=dev` dejó de dar avisos críticos: quedan 3
  altos (`sharp`, `brace-expansion` y `source-map-js`, que vienen con Next) y 6
  moderados (`mssql`/`tedious`/`uuid`/`exceljs`, sin arreglo compatible).
- **Disco justo** (unos 5 GB libres). Para limpiar imágenes viejas:
  `docker image prune --filter label=org.opencontainers.image.title=dashboard-tmsystem`.
  NUNCA un `prune` sin filtro: las imágenes `<none>` son la vuelta atrás de
  tickets.

## Convenciones de código

- Queries SQL: constantes template en `src/lib/rdb/queries/`, comentadas en español,
  con parámetros nombrados. Cada función exporta tipos TS del resultado.
- Componentes de servidor por defecto; `"use client"` solo para gráficas (Recharts),
  polling y formularios interactivos.
- Exports CSV: separador `;` y BOM UTF-8 (Excel español). Ver `src/lib/export/`.
- Fechas en parámetros de URL y BBDD propia: `YYYY-MM-DD` (hora local del servidor,
  que coincide con la hora de España de la centralita). Nunca `toISOString()`
  para sacar una fecha o una hora: da UTC (ver regla 14). Rangos por URL
  validados con `esquemaRango` (fechas que existan y máximo `MAX_DIAS_RANGO` =
  366 días); si se descartan, la vista lo avisa con `AvisoRango`.
- **Tiempos: 2 decimales fijos y unidad según tipo** (decidido 18/09/2026):
  - Por interacción (AHT, conversación, ACW, cola) → **segundos**:
    `segundosLegibles()` → «192,35 s».
  - Acumulados (logadas, ready, productivo, pausas) → **horas**:
    `horasLegibles()` / `horasDesdeSegundos()` → «8,53 h». Todos los
    acumulados en la misma unidad para poder compararlos y sumarlos.
  - Todo en `src/lib/fechas.ts`. No volver a formatos tipo «3m 12s»: pasada la
    hora descartaban los segundos y no había forma de cuadrar.
  - **Redondear solo el valor FINAL**, nunca un parcial que se vaya a sumar
    (`redondear2()` en `queries/util.ts`). Medido en agosto 2026: redondear las
    horas productivas por día y luego por campaña descuadraba la suma de la
    tabla 11 min respecto al total real; redondeando solo al final, 53 s (el
    mínimo posible con 80 filas a 0,01 h).
  - En XLSX, las columnas de tiempo llevan `formato: FORMATO_2_DECIMALES`, o
    Excel recorta los ceros finales.
  - La truncación `DATEADD(SECOND, duration / 10, …)` del SQL NO descuadra:
    medido 0 s de diferencia en 7 días (las duraciones de `ag_in_cp_log` son
    segundos enteros). No hace falta pasarla a milisegundos.

## Validaciones F0 hechas contra la BBDD real (12/06/2026, ver docs/esquema-real.md)

- [x] **Décimas de segundo CONFIRMADAS** empíricamente: ratio mediano
      duration/segundos = 10.00 exacto sobre 500 muestras.
- [x] "Lead gestionado (finalizado)" = `activity.status = 3` fechado por el
      **último `event_moment` de `activity_history`** (activity.moment es la fecha
      programada, NO la de cierre). Implementado en queries/facturacion.ts.
- [x] Frescura real: replicación ~5 min · flat tables ~24 min (algo más que los
      15 min que decía la doc — mantener flats solo para histórico).
- [x] Paleta de marca real aplicada: AMARILLO #F5CF3D + negro (logo TmSystem) con
      azul #2EA9E0 como acento de gráficas, en `src/app/globals.css`.
- [x] Campañas reales con prefijo por cliente: `Soc_*` (Socios), `Bol_*` (Bolsas),
      `gh_*` (GrupoHuertas), `Avo_*` (Avolo), `CajaR_*`, `Wit_*`, `IVR_*`, marcas
      de coche sueltas (VW, Audi...). El mapeo cliente↔campañas del admin usa estos
      shortnames. Las `Test_*` NO deben mapearse a clientes.
- [ ] Pendiente F2: "tests de oro" — validar 4-5 cifras de un día contra las
      queries SSMS de Christian antes de dar por buenos los KPIs.
      (`npm run verificar` ya imprime esas cifras contra la BBDD real.)

## Auditoría 10/09/2026 (Opus 5) — correcciones aplicadas

Todas verificadas contra RDBv2 real, no solo leyendo código:

- [x] **SLA y % abandono mezclaban entrantes con salientes** → separados por
      `origin`. SLA real de un día: **76,6 %**, no el ~99 % que salía antes.
- [x] **Horas logadas de hoy** se quedaban en 44,7 h de 116,7 h reales porque
      `duration IS NULL` (sesión abierta) se contaba como 0.
- [x] **Horas logadas por campaña (×13,8)** eliminadas del pipeline y de los
      agregados; la cifra global sigue siendo la buena.
- [x] **Campañas `Test_*`** ya no entran en la vista «todos los servicios».
- [x] **Leads finalizados**: 40 s → 0,2 s con el mismo resultado.
- [x] `horasProductivas` exacta desde SQL (antes arrastraba el AHT redondeado).
- [x] `ttlSegunRango` comparaba contra fecha UTC en vez de local.
- [x] `x-forwarded-for` ya no se cree sin `TRUST_PROXY=1`.
- [x] Lint a cero (componente creado en render, `<a>` interno, var sin usar).
- [x] ~~No hay tests automáticos~~ (30/09/2026): hay runner, Vitest (`npm test`),
      con los tests del motor de planificación. `npm run verificar` sigue
      imprimiendo cifras sin afirmar nada: convertirlo en asserts es la mejora 1.

## Precisión decimal 18/09/2026 (Sonnet 5) — tiempos a 2 decimales

Motivo: las cifras no cuadraban por redondeo. Ver la regla de convenciones de
código más arriba («Tiempos: 2 decimales fijos...») para el detalle completo.
Resumen:

- [x] `redondear2()` (2 decimales) sustituye a `redondear1()` en todos los
      tiempos; `redondear1()` queda solo para magnitudes que no son tiempo.
- [x] Se dejó de redondear el valor DIARIO de horas productivas antes de
      sumarlo por campaña; ahora solo se redondea el total ya sumado. Medido
      en agosto 2026 (80 campañas): el descuadre de la suma de la tabla contra
      el total real bajó de 11 min a 53 s (el mínimo posible con 2 decimales).
- [x] UI: `segundosLegibles()` para medias por interacción (AHT, conversación,
      ACW, cola) y `horasLegibles()`/`horasDesdeSegundos()` para acumulados
      (logadas, ready, productivo, pausas). Sustituyen a `duracionLegible()`
      (formato "3m 12s" / "1h 30m", eliminado: no se podían cuadrar cifras).
- [x] XLSX: columnas de tiempo con `formato: FORMATO_2_DECIMALES` en
      `src/lib/export/xlsx.ts`, o Excel recorta los ceros finales.
- [x] Comprobado que la truncación `DATEADD(SECOND, duration/10, ...)` del SQL
      NO aporta error (0 s de diferencia medida en 7 días): no hacía falta
      pasar a milisegundos.

## Auditoría 23/09/2026 (Opus 5.5)

Verificado contra RDBv2 real y, lo de seguridad, en build de producción:

- [x] **Next 16.2.9 → 16.3.6**: RCE sin autenticación en Windows
      (GHSA-p293-qw3h-jr36). Tras actualizar hay que hacer `npm ci`.
- [x] **Páginas de `/admin` sin `requireRol()`**: con una cookie inventada
      enviaban la página entera en el cuerpo de la redirección. Regla nueva en
      «Arquitectura → Auth propia».
- [x] **% abandono de Dirección y portal de cliente** usaba las abandonadas de
      todos los orígenes: 14,89 % en vez de 8,51 % (22/09) y 20,53 % en vez de
      14,08 % (01-23/09). Ahora cuadra al decimal con Supervisión.
- [x] **Estado de agentes**: al hacer login, la sesión (op 0) y el Not Ready
      inicial (op 2) comparten `start_time` y el empate era aleatorio. Ahora se
      elige fila abierta → estado antes que sesión → más reciente. Reproducido
      en 25 instantes del 23/09: 14 errores antes, 0 ahora.
- [x] **Tendencia 12 meses de Dirección** (29/09): columna nueva
      `abandonadas_inbound` en `agg_daily_campaign` (migración 0002) y la
      gráfica pinta solo entrantes. Histórico recalculado entero: agosto 2026
      cuadra al número con RDBv2 en vivo. Del histórico viejo se fueron 4.021
      filas de ceros y las horas logadas infladas; interacciones y atendidas
      apenas cambian (0-17 al mes) y leads un 0,1-1 %.
- [x] **Driver en UTC** (29/09, regla 14): todas las fechas del panel iban
      desplazadas 2 h y la frescura de /admin no podía funcionar. Lo destapó
      la comprobación de `reemplazarMetricasDiarias`, que rechazaba filas del
      día anterior al rango.
- [x] **Cola media** (decidido 29/09): solo entrantes ATENDIDAS, contando 0 s
      a las que no esperaron (12,06 s el 22/09, antes 17,93 s con las
      abandonadas dentro). La espera de las abandonadas va APARTE
      (`esperaAbandonadasSeg`, 25,88 s). Q2 devuelve SUMAS y la media divide
      entre `atendidasInbound`/`abandonadasInbound` de Q1: no cambiar a
      `AVG(colaSeg)`, que solo ve los hilos con fila de cola. Las medias
      globales salen de `colaAtendidasTotalSeg`/`esperaAbandonadasTotalSeg`.
      Verificado: 217 campañas-día idénticas a una consulta independiente.
- [x] **«Interacciones gestionadas»** (unidad facturable, decidido 29/09) =
      ATENDIDAS (`termination_state = 1`), en `lib/facturacion.ts`. La medida
      `interacciones` (COUNT(*) de hilos) queda solo como volumen. Antes se
      facturaban todos los hilos: 1.701 frente a 1.160 en GrupoHuertas el 22/09.
- [x] Menores (29/09): agregados y nombre del backup en hora local; rango
      máximo 366 días y fechas inexistentes rechazadas (con aviso en la vista);
      `conCache` comparte la consulta en vuelo entre peticiones simultáneas;
      listener de `error` en el pool; SLA global desde recuentos
      (`atendidasFueraSla`, diferencia < 0,01 p.p.); tarjeta IVR de hoy a 60 s
      (94-125 ms); export de cliente comprueba `activo`; `Content-Disposition`
      con `filename*` UTF-8 (un «€» en el nombre del cliente daba error 500).
- [x] ~~Decidido NO cambiar: el bloqueo de login va por usuario (sin
      `TRUST_PROXY` no hay IP fiable), así que 5 fallos desde cualquier PC
      bloquean esa cuenta 15 min. Se resuelve en F5 con Caddy.~~ Resuelto en
      producción (09/10/2026): el nginx del compose da la IP real y
      `TRUST_PROXY=1`.

## Facturación GrupoHuertas 01/10/2026 (Opus 5.5)

Operaciones factura con un Excel de horas logadas por usuario que no cuadraba
con Operaciones → Facturación. Detalle en `docs/facturacion-horas-logadas.md`.

- [x] **Diagnóstico**: el Excel es `user_log` (tiempo logado: 1.384,22 h en
      septiembre); el dashboard facturaba horas productivas (848,28 h). Lo
      que va de una a otra: pausas 280 h, intentos no atendidos 100 h,
      espera en Ready ~150 h y 5 h logadas sin campaña.
- [x] **Unidad nueva `horas_logadas`** (regla 16): tiempo logado de los
      usuarios `PREFIJO_nnnn` del cliente, por servicio. GrupoHuertas pasa a
      1.027,88 h × 28 € = 28.780,64 € y cuadra al céntimo con el Excel,
      usuario a usuario. Las bbdd siguen igual (intencionado).
- [ ] Sin revisar en el navegador (Operaciones pide sesión): verificado con
      la misma cadena de la página contra RDBv2 real, tests, `tsc` y lint.

## Sesión 01-06/10/2026 (Opus 5.5): planificación F3, F4 y ayuda

Registro completo (decisiones, operaciones sobre la SQLite real con sus
backups, incidencias y pendientes) en `docs/registro-sesion-01-06-octubre-2026.md`.

- [x] F3 (01/10), estimación de fin y RTO (02/10), F4 seguimiento (06/10) y
      ayuda en lenguaje sencillo (06/10). Septiembre importado en la SQLite
      real; adherencia 97,8 % por turno; cierre = facturación.
- [x] **Incidencia**: `npm run build` aplica las migraciones pendientes a la
      SQLite de `.env` (la 0005 entró así, sin backup): con una migración
      pendiente, `npm run backup` ANTES de compilar.
- [ ] Pendiente de supervisión: fecha límite de publicación, contrato de
      1008 y compartir la guía de Claude Docs. ~~Siguiente fase: F5~~ hecha
      el 09/10/2026 (ver «Estado de F5» en `docs/plan-planificacion.md`).

## Sesión 09/10/2026 (Opus 5.5): formulario de clientes y reparto por campaña

Registro completo (decisiones, cifras medidas, despliegues con sus backups,
incidencias y pendientes) en `docs/registro-sesion-09-octubre-2026.md`.

- [x] Parámetros de cliente de planificación: formulario por apartados en
      vez de JSON (`7fd140b`, desplegado a las 10:00).
- [x] Operaciones: reparto estimado de las horas logadas por campaña según
      el tiempo productivo (`6099019`, desplegado a las 13:07). Septiembre
      GH cuadra con la factura: 1.027,88 h y 28.780,64 €.
- [x] «No me deja entrar» (`SSL_ERROR_RX_RECORD_TOO_LONG`): era el navegador
      pidiendo `https://`. Está en problemas frecuentes de
      `docs/despliegue-linux.md`.
- [x] Facturan por horas logadas GH, UGR, CEFF y CajaRural (altas de
      Christian en `/admin/facturacion`).
- [ ] Revisar en el navegador las dos pantallas en producción. Decidir
      Ávolo (hoy por leads: cuidado con el doble cobro) y Socios (dos
      prefijos, una línea por prefijo).

## Sesión 13-14/10/2026 (Opus 5.5): resultados de actividad

Registro completo (decisiones, cifras, incidencias y pendientes) en
`docs/registro-sesion-13-octubre-2026.md`; índice de todas las sesiones en
`docs/registro-sesiones.md`.

- [x] Pestaña «Resultados» de Supervisión y `/admin/resultados` (regla 18,
      migración 0007). GH septiembre: bruto 30,01 %, neto 46,40 %.
- [x] Siempre de un cliente y `OPTION (HASH JOIN)`: el mes en curso pasaba
      de 120 s; ahora 1,2 s.
- [x] Desplegado el 14/10/2026 a las 13:11 (`d9d70fb`, migración 0007;
      backup `dashboard_20261014_1309.db`).
- [ ] Configurar los servicios y los objetivos en `/admin/resultados` de
      producción (aún ninguno). Bolsas y Socios (`call_type`): decidir qué
      es «no válido».

## Sesión 14/10/2026 (Opus 5.5): tarificación desde Operaciones

Registro completo en `docs/registro-sesion-14-octubre-2026.md`; el detalle
técnico y las cifras, en `docs/facturacion-tarificacion.md` (regla 19).

- [x] Ingeniería inversa del Excel de facturación de operaciones,
      verificada contra RDBv2: horas repartidas, minutos fijo/móvil con la
      encuesta NFS, DDIs y contactos de bbdd.
- [x] Reparto de horas logadas por campaña con el método del Excel (regla
      16), «Factura por campaña», minutos y DDIs, maestros de Operaciones,
      cierre de mes con histórico, export y migración 0008.
- [x] Septiembre 2026 en pantalla (copia de la SQLite + RDBv2 real):
      35.120,11 € frente a los 35.120,10 € del Excel.
- [x] Commit `87f7b63`, desplegado el 15/10/2026 a las 14:38 (imagen
      `ed31b337d485`, backup `dashboard_20261015_1435.db`, migraciones
      0008-0010).
      - Maestros e histórico importados en producción; el Excel se borró del
        servidor.
      - Septiembre desde producción = Excel (35.120,10 €).
- [ ] Christian, en producción:
      - Tarifas en `/admin/facturacion`: GH minutos fijo 0,02, móvil 0,05 y
        DDI 2,50; DDI 2,50 en cada bbdd con «solo los meses con llamadas».
      - Lista de prefijos de GH en `/operaciones/reparto`.
- [x] Fichero de albaranes de GS (15/10, con los ejemplos de operaciones):
      formato idéntico; las líneas solo difieren en las horas por campaña.
- [x] SQLite de desarrollo migrada a la 0008 y con los datos del Excel
      (backup `dashboard_20261014_1456.db`): el `next dev` de otra sesión
      fallaba en /operaciones con «no such table: ddis».
- [x] 15/10: prefijos excluidos replicados (lista por cliente en
      `/operaciones/reparto`) y opción «solo los meses con llamadas» en la
      línea de DDIs (migración 0009). La SQLite de desarrollo ya tiene la 0009
      (backup `dashboard_20261015_1222.db`) y la lista de GH.
- [x] 15/10: ajustes manuales de un mes cerrado (quitar o cambiar precio,
      con motivo; migración 0010, aplicada en desarrollo con backup
      `dashboard_20261015_1250.db`) para las decisiones puntuales de dirección.
- [ ] Quitar del Excel la contraseña guardada del usuario `tms` y cambiarla.
- [x] 16/10: fila de total por cliente (con más de una campaña) y «Total
      general» en las tablas de tarificación y en la hoja «Factura por
      campaña» del XLSX. El export trata `servicio=todos` como sin cliente,
      igual que la página (antes lo buscaba como nombre de servicio y salía
      sin horas logadas). Commit `2d564d0`, desplegado a las 14:03 (backup
      `dashboard_20261016_1401.db`, sin migraciones).

## Mejoras recomendadas pendientes (auditoría 10/09/2026)

Orden de recomendación (1 = primero). La 2 está a medias; el resto sin empezar:

1. Tests de oro (F2): convertir `npm run verificar` en asserts contra las
   queries SSMS de Christian. El runner (Vitest) ya existe desde el 30/09/2026.
   La facturación ya tiene el suyo contra el Excel de operaciones
   (`npm run facturacion:comparar`, 14/10/2026).
2. ~~Programar las tareas nocturnas en el servidor~~ Resuelto con el
   despliegue Docker (09/10/2026): servicio `tareas` (supercronic,
   `docker/crontab`, hora de Madrid). Queda confirmar la primera noche tras el
   corte.
3. Degradación elegante cuando RDBv2 no responde (hoy: `ConnectionError` de
   Next sin más). `error.tsx` por vista + banner de salud visible (ya existe
   `saludRdb()`, solo lo ve /admin).
4. Alertas proactivas en Supervisión (SLA bajo, abandono alto, Not Ready largo,
   campaña con entrantes y cero agentes logados). **A medias** (06/10/2026):
   las de planificación (F4 del módulo) ya salen en Supervisión, incluida
   «Ávolo con entrantes y nadie con su usuario»; faltan SLA bajo, abandono
   alto y Not Ready largo.
5. Curva intradía por franjas de 30 min (hoy todo es total diario).
6. KPI de ocupación (productivas / logadas) y % ready.
7. Cerrar o completar el portal de clientes: 0 mapeos en `client_campaigns`,
   0 usuarios con rol `cliente` → hoy da error si alguien entra.
8. Investigación acotada (2-3 días) del seguimiento de callbacks del IVR — ver
   nota "PENDIENTE de definir el mecanismo real" en la sección de Campañas IVR.
9. Módulo de calidad de datos (F4): campañas sin servicio, `Test_*` mapeadas a
   clientes, duraciones imposibles, huecos de replicación.
10. F5: 2FA, HTTPS en el nginx del compose (el bloque TLS ya está comentado en
    `docker/nginx.conf`) y `COOKIE_SECURE=1`. `TRUST_PROXY=1` ya está puesto.
    Solo es urgente si se decide exponer a internet.

**Módulo «Planificación de turnos»** (aprobado 30/09/2026, rama
`feature/planificacion`): plan por fases F1-F6 en `docs/plan-planificacion.md`.
F1 (datos y motor) y F2 (tablero de solo lectura, «Generar borrador» y
configuración) hechas el 30/09/2026 y F3 (edición, ausencias, bolsas,
publicación y versiones) el 01/10/2026, F4 (seguimiento: Hoy, adherencia,
saldo real, alertas y cierre de mes) el 06/10/2026 y F5 (tarea nocturna
única) el 09/10/2026; sus resultados y desviaciones están en las secciones
«Estado de F1…F5» de ese documento. Queda F6 (opcionales: simulaciones,
exportar a Excel/PDF, «Mi horario» .ics); la tarea nocturna ya está
programada en el servidor (servicio `tareas`, 09/10/2026). Cubre también parte de la mejora 4
(alertas de planificación) y la 5 (curva intradía: la tabla
`agg_hora_servicio` de su F1). Sus fases F1-F6 son propias del
módulo; no confundir con las F2/F4/F5 del plan general.

## Estrategia de modelos (contexto para futuros Claude)

La base (auth, motor de KPIs, queries) la construyó Fable 5 (junio 2026). Las tareas
restantes están pensadas para Opus/Sonnet: pulido visual, módulo de calidad de datos
(F4) y exposición a internet con 2FA + HTTPS en el nginx del compose (F5). Todo el conocimiento de dominio
necesario está en este archivo y en `docs/`. Ante cualquier duda sobre el esquema
Altitude, consultar `docs/referencia_bbdd_altitude_v85.md` — no inventar.
