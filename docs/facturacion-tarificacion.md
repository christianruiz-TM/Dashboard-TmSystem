# Tarificación desde Operaciones (sustituye al Excel de operaciones)

Sesión del 14/10/2026 (Opus 5.5) con Christian. Operaciones factura GrupoHuertas
(y sirve para otros clientes) con el Excel «Interacciones GH_cs v4 CAMBIOS DESDE
01.05.2026 NFS V1 PW.xlsx». Este documento explica qué hace ese Excel, cómo lo
reproduce el dashboard y con qué cifras se ha comprobado. Reglas de dominio
resumidas en CLAUDE.md (reglas 16 y 19).

## 1. Qué hace el Excel

Power Query + Power Pivot (modelo de 34 MB) contra RDBv2 por el DSN
`RDB2_Altitude`, sobre vistas propias:

| Vista | Qué es |
| --- | --- |
| `v_GH_Interaccionesv2` | Una fila por **segmento** (`itr_segment`) de las llamadas de GH: `state`, `S_Duration`, `To` (= `itr_global.to_address`), `origin`, `Termination Status`, `IVR_AG` (= `ph_e_user.type`), `Tipo_Interaccion` («Atencion agente», «Entrada IVR», «Encuesta NFS»)… |
| `v_GH_TiempoAgentLogado` | `user_log` por usuario y día (la de la regla 16) |
| `v_GH_ListCodeAgent` | Usuarios GH con su tipo: VTA (GH_nnnn) o PROM (bbdd) |

El usuario del dashboard (`DashTmsystem`) puede leerlas pero no ver su
definición (`sys.sql_modules` da NULL): todo lo de abajo se ha deducido de los
datos y comprobado contra «facturacion cerrada».

Y maestros a mano: «LISTADO DDI DETALLE» (878 asignaciones de DDI), «CAMP GS»
(código de cada campaña en GS), «HG_IVR_CAMP» (hunt group → campaña),
«CALENDARIO», «HORARIOS». La hoja «FACTURACION» calcula; «facturacion cerrada»
guarda lo facturado cada mes (ene-2025 → sep-2026, pegado a mano).

### Cómo factura (septiembre 2026: 35.120,10 €)

| Concepto | Cálculo del Excel | Precio | Sept. 2026 |
| --- | --- | --- | --- |
| Horas logadas (campañas de venta) | `user_log` de los VTA, repartido por campaña en proporción a la «duración de agentes» | 28 €/h | 1.027,882 h · 28.780,70 € |
| Minutos fijo / móvil | Segmentos conectados (`state = 6`) de salientes atendidas + encuesta NFS, por el tipo del número | 0,02 / 0,05 €/min | 39,06 / 8.842,38 min |
| DDIs | DDIs «EN PRODUCCIÓN» y «Alt V8» por campaña | 2,50 €/mes | 365 · 912,50 € |
| Bbdd (187, 188, 189 en el DAX; 292 a mano) | Contactos finalizados, **tecleados** | 2 € (Lexus 3 €, en la fórmula) | 2.467 · 4.984 € |

Salida: un bloque «FORMATO PARA GENERAR ALBARANES EN GS — guardar como texto
tabulado» con código GS, horas, minutos fijo, minutos móvil y DDIs
(cantidades, sin importes).

**Seguridad**: la conexión «Consulta desde Altitudev811» guarda en claro el
usuario `tms` y su contraseña de RDBv2 y se refresca al abrir. Avisado a
Christian (quitarla y cambiarla). El dashboard usa otro login.

## 2. Reproducción en el dashboard (verificada contra RDBv2)

### Reparto de las horas logadas por campaña
Peso de cada campaña = Σ `itr_segment.duration` con `state NOT IN (2,3)` (sin
cola) de los hilos de agente humano (`type = 1`) de los usuarios del cliente,
`origin IN (1,2)`, **cualquier** `termination_state`, sin los hilos cuyo
`itr_global.to_address` está vacío. El total del mes se reparte de una vez en
proporción a ese peso (mayor resto: las filas suman el total exacto).

- «Si blanco no suma, Javier decidió que si no había llamada estos tiempos no
  contaban» (nota de la hoja): son las salientes sin número marcado, 4.304 min
  en septiembre.
- Probado y descartado: solo conectado (6), conectado + ACW (6, 8), solo
  atendidas, todos los estados. El que cuadra es «todo menos cola».
- Además, el Excel excluye a mano en un segmentador una lista de prefijos de
  `To` (0673, 0716, 1161, 6735, 7013, 7014, 7017, 7190, 1157 y los hunt groups
  8259, 8367, 8374, 8384, 8394, 8430, 8537, 8554, 8761, 8800). 8259 es de
  gh_car_seat (+0,69 h en agosto sin la lista).
- **Se replica** (decidido 15/10/2026: «no sé el motivo, pero se quitan»): lista
  por cliente en `/operaciones/reparto`, que mantiene Operaciones
  (`app_settings` `facturacion.prefijosExcluidosReparto.<servicio>`). Con ella,
  septiembre pasa de 14 a 19 campañas al céntimo de 38, y todas a ±0,3 h.
  Agosto queda dentro de tolerancia (antes, gh_car_seat +0,69 h).
- Solo campañas del servicio SIN config de campaña propia (las bbdd llevan la
  suya): es el «Tipo_Camp = VENTA» del Excel.
- Sustituye al reparto por usuario y día según las atendidas (09/10/2026), que
  dejaba 35,26 h «sin actividad» sin código de GS y movía 70,6 h (≈1.976 €)
  entre campañas respecto del Excel.

### Tarificación (`queries/tarificacion.ts`, `lib/tarificacion.ts`)
- Salientes: hilo de agente humano con `origin = 2` y `termination_state = 1`,
  segmentos `state = 6`.
- Encuesta NFS: hilo de un puerto IVR (`type = 3`) atendido que empieza
  DESPUÉS de un hilo de agente en la misma llamada (`itr_global`); va a la
  campaña de ese agente. El Excel la asignaba con la tabla de hunt groups; con
  el hilo hermano sale lo mismo (783,48 min a móvil en septiembre) y vale para
  cualquier cliente.
- Número: `to_address` lleva delante el account code (4 dígitos en GH, 2 en
  otros clientes). Se toman los **9 últimos dígitos** y su prefijo de 3. Menos
  de 9 caracteres = hunt group (entrante, lo paga quien llama) o extensión
  interna (1.708 min en jul-sep, todos los clientes); más de 13 =
  internacional o raro. Ninguno de los dos se cobra.
- Clasificación (plan de numeración): móvil 6xx y 71x-74x; fijo 8xx y 9xx;
  especial 901-909, 803-807 y 70x; sin coste 800 y 900. No aparece ningún 70x
  en jul-sep.

### DDIs (`lib/ddis.ts`)
- Cada fila de `ddis` es una ASIGNACIÓN número → campaña con fechas: 354 de los
  482 números del Excel tienen 2 o 3 filas (v7 → v8). `numero` no es único.
- Cuota del **mes entero** por cada número activo algún día del mes, una vez
  por número: a la asignación activa de alta más reciente. El relevo el mismo
  día (baja de una = alta de la otra) no es un solape.
- Las filas «Alt V7» se importan sin campaña: sus códigos son de la
  instalación anterior.
- **Opción «solo los meses con llamadas»** en la línea `ddi` (15/10/2026,
  migración 0009): según el presupuesto del cliente, los DDIs se cobran todos
  los meses o solo los meses con algún hilo de la campaña.
- Cuidado con las bbdd entre tandas:
  - Julio de 2026: hubo llamadas (37, 190 y 47 hilos) y el Excel las facturó
    con precios a mano: 92 contactos a ~1,63 € y cada DDI a 31,32 €, 244,07 €
    en total.
  - Agosto: no se facturó nada por decisión de dirección, pero hubo 3
    llamadas sueltas el 03/08, así que la opción no evitaría cobrar esos DDIs.
  - Resuelto con los ajustes manuales del cierre (decidido 15/10/2026).

### Bbdd
`leadsFinalizados` (activity cerrada, fechada por su último evento) da en
septiembre 574 / 1.273 / 570 / 50, lo mismo que se tecleaba a mano.

## 3. Comprobación (`npm run facturacion:comparar`)

Recalcula un mes contra RDBv2 sin leer la SQLite (DDIs de la propia hoja del
Excel, precios = importe ÷ cantidad) y compara campaña a campaña:

| Mes | Horas (total) | Horas por campaña | Min. móvil | Min. fijo | DDIs | Contactos | € dashboard − € Excel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09 | = | 14/38 exactas, todas ±0,3 h | 31/33 (8.843,50 vs 8.842,38) | 8/8 | 42/42 | 4/4 | 0,00 € |
| 2026-08 | = | 1 a +0,69 h (gh_car_seat) | 35/35 | 4/4 | 38/38 | — | −0,11 € |
| 2026-07 | = | 3 entre −1,22 y +0,82 h | 36/36 | 13/13 | 41/41 | 3/3 | −0,14 € |
| 2026-06 | = | 2 a −0,64 / +0,32 h | 31/37 (+19,8 min) | 22/22 | 41/41 | 2/3 (−1) | −1,04 € |
| 2026-05 | = | 1 a +0,39 h | 27/36 (+5,8 min) | 13/17 | 41/41 | 2/3 (−2) | −3,79 € |

Las horas por campaña no cuadran al céntimo por la lista de prefijos excluidos
a mano y por los arreglos de redondeo a mano del Excel (p. ej. gh_ind_iveco en
julio: 2,00 h justas). En mayo-junio el Excel se refrescó en otro momento (la
versión «NPS» anterior) y hay algún minuto y contacto de diferencia.

En agosto el Excel no facturó nada a las bbdd (su tanda acabó en junio y la
siguiente empezó el 01/09), pero siguen teniendo un DDI cada una (ver
«Opción solo los meses con llamadas» arriba).

Con la lista de prefijos (`--excluir`) y la opción de DDIs para las bbdd
(`--ddi-con-llamadas gh_bbdd_`): septiembre 19/38 campañas exactas y 0,00 €;
agosto todo dentro de tolerancia; julio, dos campañas fuera (gh_ind_iveco: el
Excel puso 2,00 h justas).

## 4. En el dashboard

- **Operaciones → Facturación**: «Factura por campaña» (código GS, horas,
  minutos, contactos, DDIs, total) y, con un cliente y el mes completo,
  «Cerrar el mes». Mes cerrado: se enseña lo guardado y se avisa si lo
  calculado ahora difiere. Reabrir: solo admin.
- **Ajustes manuales del cierre** (15/10/2026, migración 0010): con el mes
  cerrado, Operaciones quita una línea o una campaña entera, o le cambia el
  precio, siempre con motivo; se puede deshacer y la línea original se
  conserva. La pantalla, el histórico, el Excel y el fichero de GS salen
  ajustados. Es para lo que decide dirección cada mes (julio de 2026: bbdd a
  precios distintos; agosto: sin facturarlas).
- **Totales por cliente** (16/10/2026), en «Factura por campaña» y en
  «Unidades por campaña»:
  - Cada cliente con más de una campaña lleva su fila de total («Total
    GrupoHuertas») con la suma de cada columna (cantidades, importes y
    total). Con una sola
    campaña no hay fila de total: repetiría la misma.
  - Con «Todos los clientes», además «Total general» y la columna «Cliente».
  - Septiembre de 2026 en vivo: Total GrupoHuertas 35.120,11 € (1.027,88 h,
    4.984 €, fijo 0,79 €, móvil 442,18 €, DDIs 912,50 €); Total general de
    todos los clientes 37.498,61 €.
- **Operaciones → Meses cerrados**: histórico, incluido el importado del Excel.
- **/operaciones/ddis** y **/operaciones/campanias-gs**: maestros. Los edita
  el rol operaciones (y admin); Dirección los ve.
- **/admin/facturacion**: tarifas. Unidades nuevas `minutos_fijo`,
  `minutos_movil` y `ddi`. Una campaña con config propia (bbdd) no hereda la
  del servicio: necesita su propia línea de DDIs.
- Export XLSX: hoja «Factura por campaña» + «Detalle».
  - «Factura por campaña» lleva los mismos subtotales por cliente que la
    pantalla y el total final («Total general» si hay varios clientes).
  - «Detalle» no lleva subtotales: mezcla la fila de horas logadas de cada
    cliente, su reparto y las campañas, y al sumar en Excel se contaría dos
    veces.
  - `servicio=todos` es lo mismo que sin cliente, como en la página.
- **Albaranes de GS** (15/10/2026): con un mes cerrado, botones «Albaranes GS
  (ventas)» y «(promociones)». Mismo formato que los ficheros que operaciones
  sacaba del Excel («COMPROBACION FACTURACION MES DE SEPTIEMBRE 26 version 1
  02_10_26.txt» y el de PROMOCIONES):
  - Cabecera `Cod Camp · Horas Logadas | Contactos Finalizados · Tarif Fija ·
    Tarif Movil · Ddis`, separada por tabuladores.
  - Horas y minutos con coma y 2 decimales, sin separador de miles; contactos
    y DDIs, enteros.
  - CRLF y sin BOM.
  - Comparado con el de septiembre: cabecera y formato idénticos.
    - Promociones: igual.
    - Ventas: difieren las horas de 29 campañas (centésimas, por el reparto),
      2 líneas de minutos (+0,33 y +0,79) y 5 campañas acabadas que el Excel
      listaba a cero y aquí no salen.
  - Si una campaña del cierre no tiene código de GS, no se genera: hay que
    darle código y volver a cerrar (el aviso sale ya al cerrar).
- `npm run facturacion:importar-excel -- --archivo … [--ddis] [--gs] [--historico] [--guardar [--reemplazar]]`.

### Pendiente
- Nada de lógica: queda el despliegue.
- Los códigos de GS de las bbdd cambian en cada tanda (0003304 en mayo,
  0003313 en septiembre): hay que actualizarlos antes de cerrar el mes; el
  cierre guarda el que había.
