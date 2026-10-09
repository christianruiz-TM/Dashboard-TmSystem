# Facturación por horas logadas (sesión del 01/10/2026)

Por qué el Excel de horas de operaciones no cuadraba con Operaciones →
Facturación del dashboard para GrupoHuertas (septiembre 2026), qué se decidió
y cómo quedó implementado. La regla resumida está en `CLAUDE.md` (regla 16).

## 1. El Excel de operaciones

Archivo «SEPTIEMBRE HORAS LOGADAS POR CAMPAÑAS.xlsx» (origen:
`Q:\A_GRUPO TRABAJO ALTITUDE 8\SQL para GH\`). Es una tabla dinámica sobre un
modelo de Power Pivot alimentado por Power Query:

```
Odbc.Query("dsn=RDB2_Altitude", "select * from v_TM_TiempoAgentLogado")
```

- `v_TM_TiempoAgentLogado` (sin permiso para ver su definición) devuelve
  `code, usr_name, Type, Start Time (date), Tiempo Logado, Agrupación`. Es
  **exactamente `user_log`**: una fila por sesión (login → logout) de cada
  usuario. Verificado fila a fila y usuario a usuario en septiembre.
- `HORAS_LOGADAS = Tiempo Logado / 36000` (décimas → horas): conversión
  correcta. No tiene el inflado ×13 de `ag_in_cp_log` (regla 11).
- Agrupación: `GH` = usuarios `GH_nnnn` (`Type = VTA`), `GH_BBDD` = usuarios
  `GH_nnnn_BD` y `_BD_LX` (`PROM`), `OTRO` = sin prefijo de cliente (Angeles,
  TM_*, `GH_Cargador2`, `rdb2`…). Filtro de escala de tiempo: 1-30/09.
- Pese al nombre, **no hay campañas**: `user_log` no sabe de campañas. La
  asignación a cliente sale del prefijo del usuario (regla 15).

Septiembre 2026: GH 1.027,88 h + GH_BBDD 356,34 h = **1.384,22 h**.

## 2. Diagnóstico: por qué no cuadraba

El dashboard facturaba GrupoHuertas con la unidad `horas` = horas
**productivas** (duración de las llamadas atendidas: conversación + ACW),
848,28 h × 28 €/h en las campañas del servicio. Medían cosas distintas:
536 h de diferencia. Descomposición del tiempo logado de los usuarios GH_*
en septiembre:

| Concepto | Horas |
|---|---:|
| Llamadas atendidas (conversación + ACW): lo que facturaba el dashboard | 848,30 |
| Pausas Not Ready (deduplicadas, regla 10) | 280,11 |
| Intentos salientes no atendidos (ocupado, no contesta, contestador) | 100,13 |
| Resto: Ready esperando, 8,22 h de llamadas con campaña inexistente en `ph_campaign` y solapes | ~150,29 |
| Logado en la plataforma sin ninguna campaña GH abierta | 5,39 |
| **Total = Excel (GH + GH_BBDD)** | **1.384,22** |

Pausas: NOT_WORKING 82,25 h, Descanso 72,79, Formación 41,26, Llamada
Supervisora 29,97, Tiempo administrativo 18,99, Servicio 11,91…

Comparando logado con logado, el KPI «Horas logadas (reales)» de Operaciones
(1.392,88 h, unión de `ag_in_cp_log` op 0 en las campañas del servicio) solo
difiere en 8,66 h: +14,04 h de **Angeles** (logada en campañas GH sin usuario
GH_) y −5,39 h de tiempo logado sin campaña abierta, que `user_log` cuenta y
`ag_in_cp_log` no.

Otros hallazgos de la sesión:

- Con «Incluir IVR», `IVR_GrupoHuertas` sumaba 79,56 h × 28 € = 2.227,68 €
  de horas de la propia IVR (usuario `type = 3`), no de agentes. Desaparece al
  pasar GH a horas logadas (sección 3); seguiría pasando con cualquier cliente
  que facture `horas` productivas a nivel de servicio con el check marcado.
- La tarifa de 2 €/hora de `gh_bbdd_dimovil/granada/autoclasse` parecía un
  error, pero **es intencionada**: las campañas de bbdd se facturan de otra
  forma.

## 3. Decisiones (Christian, 01/10/2026)

1. Las horas de facturación son el **tiempo efectivo en estado logado**,
   aunque no haya campaña abierta (→ `user_log`).
2. Un usuario **sin el prefijo del cliente** (GH_ en GrupoHuertas) **no cuenta**.
3. La facturación de las campañas de **bbdd es distinta y está bien así**
   (horas productivas a 2 € y leads a 3 €).

Derivada de la 3, aplicada y expuesta a Christian antes del commit: los
usuarios con sufijo (`GH_nnnn_BD`, `_BD_LX`) **no** entran en la línea de
28 €/h. Su trabajo ya se factura por las campañas de bbdd; incluirlos lo
cobraría dos veces (~356 h). Si hubiera que cambiarlo, la regla vive en
`esUsuarioDelCliente()` / `patronLikeUsuarios()`.

## 4. Implementación

- **Unidad nueva `horas_logadas`** en `billing_config` (la de `horas` sigue
  siendo productivas y la usan las bbdd), con la columna `prefijo_usuario`
  (migración `0004`). Solo admite ámbito servicio y exige prefijo; el
  formulario de `/admin/facturacion` lo valida (aviso `error_horas_logadas`).
- **Usuario del cliente** = `<PREFIJO>_nnnn` exacto, sin distinguir
  mayúsculas: `GH_0851` sí; `GH_0851_BD`, `GH_Cargador2`, Angeles, no.
  Lógica pura en `src/lib/facturacion-horas-logadas.ts` (con tests).
- **Consulta** `horasLogadasUsuarios()` en `rdb/queries/facturacion.ts`:
  `user_log` de agentes humanos (`type = 1`), un `LIKE` parametrizado por
  prefijo, unión de sesiones por usuario con las islas comunes
  (`queries/islas.ts`) y sesiones abiertas cerradas en `GETDATE()` (regla
  10.b). Cada sesión cuenta entera en el día en que empieza, como el Excel.
  Unos 450 ms para un mes y tres prefijos.
- **Facturación**: `facturacionHorasLogadas()` calcula una línea por cliente;
  `calcularFacturacion()` ya no mete esa unidad en las campañas y las marca
  `porHorasLogadas`.
- **Operaciones**: tabla «Horas logadas por cliente» con el detalle por
  usuario desplegable; las campañas cubiertas salen como «Horas logadas
  (cliente)»; el importe estimado suma las dos cosas. El export CSV/XLSX
  lleva una fila por cliente y la columna «Horas logadas (cliente)».
- **Configuración**: la línea de GrupoHuertas (id 5) pasó de `horas` a
  `horas_logadas`, prefijo GH, 28 € (en `audit_log`, `config_facturacion`).

## 5. Verificación (RDBv2 real, septiembre 2026)

- Horas por usuario idénticas al Excel en los 14 `GH_nnnn`, y también en los
  10 `UGR_nnnn` y 6 `Av_nnnn` (diferencia 0,0000 h).
- GrupoHuertas: **1.027,88 h × 28 € = 28.780,64 €**, más bbdd 677,76 € =
  importe estimado **29.458,40 €** (antes 16.854,20 €).
- `user_log`: 173 solapes en 97.798 sesiones desde junio 2025 (ninguno en
  los usuarios GH de septiembre); `duration NULL` en agentes solo en las
  sesiones de hoy. Los puertos IVR y el router tienen sesiones abiertas desde
  el 31/08 y se excluyen con `type = 1`.
- 89 tests, `tsc` y lint limpios. No se revisó la página en el navegador.

## 6. A tener en cuenta

- El KPI «Horas logadas (reales)» de Operaciones es la cifra operativa (con
  campaña abierta, cualquier usuario) y no coincide con la facturada. Es a
  propósito.
- Otro cliente que quiera facturar así: nueva línea en `/admin/facturacion`
  con unidad «Horas logadas (usuarios del cliente)», ámbito su servicio y su
  prefijo (UGR, Av…).
- Un cliente que ya factura de otra forma (Ávolo por leads) cobraría dos
  veces si se le añade la línea de horas logadas sin desactivar la otra. Un
  cliente con varios prefijos (Socios: `Soc` y `Soc_Fed`) necesita una línea
  por prefijo.
- Desde el 09/10/2026 facturan así GrupoHuertas (28 €/h), UGR (22,50 €/h),
  CEFF (25 €/h) y CajaRural (25 €/h, prefijo `CR`; antes, horas productivas
  al mismo precio).

## 7. Reparto estimado por campaña (09/10/2026)

Operaciones pidió ver las horas logadas de cada cliente también por campaña.
`user_log` no sabe de campañas, así que es un **reparto estimado**. Se factura
el total del cliente.

**Por qué no sirve el tiempo con campaña abierta.** Los usuarios del cliente
tienen casi siempre todas sus campañas abiertas a la vez. Medido con los
`GH_nnnn` en septiembre de 2026:

| Medida | Valor |
| --- | --- |
| `ag_in_cp_log` op 0 sumado por campaña | 34.985,49 h |
| Unión real | 1.023,37 h (×34,2) |
| Tiempo con más de 15 campañas abiertas a la vez | 92,8 % |
| Con una sola campaña abierta | 0,03 h |

Repartir ese tiempo a partes iguales da unas 23 h (el 2,3 %) a casi todas las
campañas: no dice dónde se trabajó. La única señal real son las llamadas.

**Regla (decidida con Christian).** Por usuario y día, sus horas logadas se
reparten en proporción a su tiempo productivo en cada campaña ese día.

- Las horas logadas son las islas de `user_log`, por el día en que empieza la
  sesión, igual que la factura.
- El tiempo productivo es la `duration` de las atendidas, la misma medida que
  «H. productivas».
- Un día logado sin ninguna atendida va a la fila **«Logado sin actividad en
  campaña»**: no se inventa a qué campaña asignarlo.
- Las filas se redondean a centésimas por **mayor resto**, para que sumen
  exactamente el total facturado. El importe de cada fila es informativo.

**Dónde se ve.** En Operaciones → Facturación hay un desplegable bajo cada
cliente con: campaña, h. productivas de los usuarios del cliente, % del tiempo
productivo, horas logadas repartidas, importe repartido y total. En el export
CSV/XLSX va en cuatro columnas propias, para no contar dos veces al sumar.

**Código.**

- `baseRepartoHorasLogadas` en `src/lib/rdb/queries/facturacion.ts`: dos
  consultas en un lote, 1,3 s para un mes de GH.
- `repartirHorasLogadas` en `src/lib/facturacion-horas-logadas.ts`: puro, con
  tests.

**Verificación.** Septiembre GH: 1.027,88 h y 28.780,64 €, igual que la
factura, con 35,26 h sin actividad en campaña.

| Campaña | % del tiempo productivo | Horas logadas repartidas |
| --- | --- | --- |
| gh_la_mur_toyota | 10,23 % | 98,01 h |
| gh_gra_pre_mer | 10,34 % | 94,81 h |
| gh_dimovil_mer | 9,14 % | 93,23 h |

El % productivo del mes y el % de horas logadas de una campaña no coinciden
exactamente: el reparto se hace día a día con lo logado de cada persona.
