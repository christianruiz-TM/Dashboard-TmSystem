# Plan: módulo «Planificación de turnos»

> Plan aprobado el 30/09/2026. Documento de referencia para ejecutar las fases en sesiones
> nuevas. Rama: `feature/planificacion` (desde `master`). Idioma: español en UI, comentarios y commits.

## Contexto

Supervisión reparte cada mes, a mano y en Excel, qué agente trabaja en qué cliente en cada
franja horaria (ejemplo: `C:\Users\Rocio\Desktop\TEMP\Septiembre V1.xlsx`). El 29/09/2026 un
prototipo en Python (`temp/prototipo-planificacion/`, empezar por su README) generó la
propuesta de octubre (`temp/Planificacion_Octubre_2026.xlsx`; la hoja «Criterios» explica
cada regla) a partir de RDBv2. El módulo sustituye el Excel por una pantalla del dashboard que:

1. genera sola el borrador de cada mes;
2. deja ajustarlo visualmente y publicarlo;
3. compara después el plan con lo que pasó de verdad.

Las personas solo marcan ausencias, confirman bolsas y aprueban. El Excel pasa a ser una
exportación. `temp/` no se versiona porque lleva nombres de agentes: las fases lo leen del disco.

## Decisiones tomadas (29/09/2026, Christian)

| Tema | Decisión |
|---|---|
| Vacaciones y permisos | Solo existen en el Excel: se introducen a mano en el módulo (formulario). Sin integración. |
| Roles | **Supervisión (y admin) generan, editan y publican.** Operaciones y Dirección, solo lectura. Cliente: nunca. |
| Datos personales | Operaciones y Dirección ven el tablero **con nombres** (roles internos). Nunca en el portal de clientes. |
| Granularidad | **1 h**, con todo guardado en minutos: pasar a 30 min es cambiar el parámetro `plan.pasoMin`. |
| Equipos | Solo el equipo multicliente (GH, BBDD, Lexus, UGR, CEFF, Caja Rural, Ávolo). El modelo admite otros equipos (`equipo`), sin configurarlos. |
| Bolsas de horas | Supervisión las confirma **cada mes**. Por defecto: la del mes anterior prorrateada por días laborables. |
| Ávolo | **A demanda**: no se planifican bloques. Alguien se loga con `Av_` solo cuando hay una entrante sin atender. El módulo lo avisa en Supervisión y mide las horas reales de `Av_`. |
| Saldo «+1/−1» | **Los dos**: el plan da el saldo previsto y cada día cerrado se sustituye por el real. Supervisión puede añadir ajustes manuales con motivo. |

Decisiones de diseño propias (aprobadas con el plan):

- **Estacionalidad**: el factor «mismo mes del año anterior» se calcula y se muestra como aviso, pero **no se aplica al mínimo de GH por defecto** (`plan.estacionalidad.aplicar = false`). El mínimo protege el SLA; aplicarlo es una decisión que se activa a mano.
- **Test runner**: Vitest.
- **Arrastre**: `@dnd-kit/core` + `@dnd-kit/modifiers` (MIT). El redimensionado va con pointer events propios, porque dnd-kit no lo trae. Todas las operaciones tienen también menú contextual y teclado.
- **Lexus (`_BD_LX`) es un cliente de planificación propio** (`LX`, cuenta como GH). Así desaparece el caso especial del prototipo: cada par prefijo+sufijo corresponde a un cliente de planificación.

Quedan por confirmar durante las fases (no bloquean): ~~qué significa `TipoDia` en
`festivos_servicio`~~ (resuelto en F1: solo vale `FESTIVO`); qué es RTO y qué tipos de ausencia cuentan como horas justificadas en el
saldo; el contrato de Celia (25 h frente a ~30 h reales); la fecha de fin de UGR; y la fecha
límite de publicación.

## Reglas de dominio nuevas (van a CLAUDE.md en F1)

- **Un usuario de Altitude por agente y cliente**: `usr_name = <PREFIJO>_<nº 4 díg.>[_SUFIJO]`. Por eso la unión de sesiones (`ag_in_cp_log`, op_type 0) **por usuario** da horas por cliente sin el ×13 de la regla 11. Por agente (nº), la unión de TODOS sus usuarios da la hora real de la persona. No mezclar las dos cosas: si un agente tiene dos usuarios logados a la vez, la suma por cliente supera la hora real.
- Los usuarios sin número de agente (Angeles, Christian, TM_*…) quedan fuera.
- Festivos y horarios salen de las tablas propias de RDBv2 `festivos_servicio` y `horarios_servicio`, que mantiene supervisión y cuya vigencia acaba el 31/12/2026. El módulo avisa cuando el mes planificado se sale de esa vigencia.
- Los hilos de más de 2 h se descartan en los cálculos de gestión (CEFF tiene duraciones imposibles). El umbral va como parámetro en segundos y se compara en el SQL: `t.duration < @maxSeg * 10`.

## Modelo de datos (SQLite, `src/lib/db/schema.ts`)

Migración `0003` (F1) con el núcleo, y `0004` (F4) con el saldo. Se generan con `npm run db:generate`.
Los parámetros globales NO tienen tabla nueva: van en `app_settings` con claves `plan.*` y un
accesor tipado con zod y valores por defecto (`src/lib/planificacion/parametros.ts`).

**Configuración**

- `plan_clientes`: `codigo` (único: GH, BD, LX, UGR, CEFF, CR, AV), `nombre`, `color` (hex), `equipo`, `servicioAltitude` (ph_service.name), `cuentaComo` (código; BD y LX → GH para la cobertura), `modo` (`erlang` | `objetivo` | `a_demanda` | `resto`), `prioridad`, `campanias` (patrones LIKE de shortname, p. ej. `gh_bbdd_%`), `parametros` (JSON validado con zod: AHT, SLA %, umbral s, margen de agentes, bloques candidatos con bonus, franjas a evitar, máx. h/día por agente, máx. horas seguidas, máx. bloques/día, % de vivos objetivo, ritmo manual, h/semana fijas, fecha fin, nombre en festivos/horarios…), `activo`, `orden`.
- `plan_prefijos`: `prefijo`, `sufijo` ('' | '_BD' | '_BD_LX' | '_RE'…), `clienteCodigo`. Único (prefijo, sufijo). Los prefijos sin mapear (p. ej. AEP) generan el aviso «cliente nuevo».
- `plan_tipos_ausencia`: `codigo` (VAC, AUS, RTO, FEST…), `nombre`, `color`, `computaComoTrabajada` (para el saldo), `activo`.
- `plan_agentes`: `numero` (PK, '0851'), `alias`, `contratoSemanalH`, `enPlantilla`, `equipo`, `notas`, `actualizadoAt`.
- `plan_agente_usuarios`: `usrName` (PK), `agenteNumero`, `altitudeCode`, `clienteCodigo` (null = prefijo sin mapear), `fullname`, `ultimaSesion`, `sincronizadoAt`. Las habilidades de un agente son los clientes de sus usuarios.
- `plan_patrones` (`id`, `nombre`, `activo`) + `plan_patron_tramos` (`patronId`, `diaSemana` 0=lunes, `inicioMin`, `finMin`).
- `plan_agente_turnos`: `agenteNumero`, `patronAId`, `patronBId`, `desde`, `hasta`. La semana A de referencia es `plan.semanaA = '2026-08-31'` (A si las semanas desde esa fecha son pares).

**Plan**

- `plan_versiones`: `id`, `mes` ('YYYY-MM'), `numero`, `estado` (`borrador` | `publicada` | `sustituida` | `descartada` | `simulacion`), `origen` (`motor` | `copia` | `recalculo`), `basadaEnId`, `revision` (concurrencia optimista), `entradas` (JSON: foto de mínimos, objetivos, bolsas y parámetros usados, para que el plan se explique aunque cambien los datos), `avisos` (JSON), `resumen` (JSON: horas por cliente y semana), `creadaPor`/`creadaAt`, `publicadaPor`/`publicadaAt`, `motivoPublicacion` (avisos aceptados). Como mucho un borrador por mes, controlado en una transacción.
- `plan_bloques`: `versionId` (cascade), `agenteNumero`, `fecha`, `inicioMin`, `finMin`, `clienteCodigo`, `origen` (`motor` | `manual`), `fijado` (el motor no lo toca al regenerar), `regla`, `datos` (JSON de la explicación), `editadoPor`, `editadoAt`. Índices (versionId, fecha) y (versionId, agenteNumero).
- `plan_ausencias` (sin versiones: son hechos): `agenteNumero`, `tipoCodigo`, `desde`, `hasta`, `inicioMin`/`finMin` (null = jornada completa según turno), `notas`, `creadoPor`, `creadoAt`.
- `plan_bolsas`: `mes`, `clienteCodigo`, `horas`, `origen` (`prorrateo` | `manual`), `confirmadaPor`, `confirmadaAt`. Único (mes, cliente).
- `plan_objetivos`: `mes`, `clienteCodigo`, `semanaLunes`, `horas`, `origen` (`calculado` | `manual`), `detalle` (JSON: vivos, ritmo, % objetivo). Único (mes, cliente, semana). Si hay uno manual, prevalece.

**Agregados propios** (precalculados: el motor y el tablero no consultan RDBv2 en caliente)

- `agg_hora_servicio`: `fecha`, `servicio`, `inicioMin` (**franjas de 30 min**, así el paso de 30 min no necesita recalcular), `entrantes`, `entrantesAtendidas`, `entrantesAbandonadas`, `entrantesRechazadas` (ts=7), `salientes`, `salientesAtendidas`, `segGestionEntrantes` (humanos, < 2 h). Guarda sumas, no medias. Sirve también para la mejora nº 5 pendiente (curva intradía).
- `agg_sesion_usuario`: `fecha`, `usrName`, `inicio`, `fin` (islas de sesión de días cerrados, recortadas al día). Índices (fecha) y (usrName, fecha).
- `agg_cierres_campania`: `fecha`, `campania`, `cierres` (contactos que dejan de estar vivos, fechados por su último `event_moment`).
- `plan_listas_estado`: `fecha` (foto nocturna), `campania`, `total`, `vivos`, `vivosSinTocar`.

**Saldo** (F4, migración 0004)

- `plan_saldo_dias`: `agenteNumero`, `fecha`, `horasPlan`, `horasReales` (null hasta cerrar), `horasJustificadas`, `cerrado`.
- `plan_saldo_ajustes`: `agenteNumero`, `fecha`, `horas` (±), `motivo`, `autor`, `creadoAt`.

`AccionAuditoria` (`src/lib/auth/audit.ts`) se amplía con `plan_generar`, `plan_editar`,
`plan_publicar`, `plan_ausencia`, `plan_bolsa`, `plan_config` y `plan_saldo_ajuste`.

## Capa RDBv2: `src/lib/rdb/queries/planificacion.ts`

Todas las consultas van parametrizadas, con rango de fechas explícito sobre columna indexada y
con la conversión de décimas dentro del SQL. Excluyen `Test_*` e `IVR_*`, y cada una tiene su
mock en `src/lib/rdb/mock.ts`. El SQL Server es anterior a 2017: sin `STRING_AGG`.

| Función | Base | Uso |
|---|---|---|
| `usuariosAgente()` | `ph_e_user` type=1, `usr_name LIKE '%[_][0-9][0-9][0-9][0-9]%'` | Sincronizar agentes y usuarios (cache 24 h). El parseo prefijo/nº/sufijo va en TS (`planificacion/usuarios.ts`). |
| `islasSesionUsuario(desde, hasta, usuarios?)` | Mismas islas que `horasAgenteReales`, **por usuario**, con la regla 10.b (NULL → `GETDATE()` acotado) | Días cerrados → `agg_sesion_usuario`. Hoy → en vivo (TTL 60 s). |
| `demandaPorFranja(desde, hasta)` | `h1.sql` generalizado a 30 min, por servicio | → `agg_hora_servicio` |
| `cierresPorDia(desde, hasta, campanias)` | Patrón de la regla 13: `MAX(event_moment)` por actividad, como los leads de `facturacion.ts` (nunca `NOT EXISTS`) | → `agg_cierres_campania` |
| `estadoListas(campanias)` | `a2.sql`: `activity` filtrado por campaña | → `plan_listas_estado` |
| `festivosServicio(desde, hasta)` / `horariosServicio()` | `fh2.sql` | Cache 24 h. Avisa si no cubren el mes. |
| `entrantesNoAtendidasHoy(campanias)` | `itr_thread` origin=1, ts≠1, hoy | Alerta de Ávolo a demanda (TTL 60 s). |

Se reutiliza lo que ya existe: `limitesRango`, `filtroCampanias`, `claveCampanias`, `conCache`
y `ttlSegunRango` (`queries/util.ts`, `cache.ts`); `listaServicios`, `campaniasEfectivas`,
`esIvr` y `esTest` (`queries/servicios.ts`) para convertir los patrones de campaña de cada
cliente en shortnames concretos; `estadoAgentes` (`queries/supervision.ts`) para las alertas;
y `agg_daily_campaign` (entrantes por día) para la estacionalidad. El CTE de islas se extrae a
un generador común (`queries/islas.ts`) que usan `horasAgenteReales` y la consulta nueva. Antes
y después del cambio, `npm run verificar` debe dar cifras idénticas.

Los agregados los rellena `scripts/planificacion-agregados.ts`
(`npm run planificacion:agregados [-- --desde --hasta]`), con el mismo patrón que
`aggregate-daily.ts`: lotes de 7 días, cada lote REEMPLAZA sus días completos y sin argumentos
procesa ayer en hora local. En la misma pasada sincroniza usuarios y hace la foto de listas.

## Motor: `src/lib/planificacion/motor/` (puro y determinista)

Sin I/O, sin `Date.now()` ni azar, y solo importa `date-fns` y `zod`, así que también corre en
el navegador (validaciones y cobertura en vivo). Una regla `no-restricted-imports` de ESLint
impide que importe `@/lib/db` o `@/lib/rdb`. Los empates se deshacen siempre por orden estable
(fecha, nº de agente).

**Entrada (`EntradaMotor`)**: `mes`; `pasoMin`; `dias[]` (fecha, día de la semana, rotación
A/B, laborable, festivos por servicio, día equivalente: el siguiente a un festivo se dimensiona
como lunes); `agentes[]` (nº, contrato, habilidades, tramos de turno ya expandidos por fecha,
ausencias); `clientes[]` (modo, prioridad, `cuentaComo`, parámetros, horario del servicio por
fecha); `demanda` (λ por cliente `erlang` × día de la semana × franja, AHT, SLA, margen);
`objetivos` (h por cliente `objetivo` y semana); `bolsas`; `experiencia` (horas reales de los
últimos 60 días por agente y cliente); `tasaContacto` por cliente y franja; `fijados` (bloques
que no se tocan).

**Salida (`SalidaMotor`)**: `bloques[]` (con `regla` y `datos`), `avisos[]`, `resumen`
(horas por cliente, semana y agente) y `minimos` por franja.

**Orden de las reglas** (generaliza `plan.py`):

1. **Capacidad**: turno según el patrón A/B, menos ausencias y festivos del calendario del equipo (`plan.servicioCalendario`). Los agentes inactivos (sin sesión en `plan.diasInactividad` = 30) se excluyen, salvo que se fuercen.
2. **Base**: todo el turno queda en el cliente de modo `resto` (GH). Regla `base_turno`.
3. **Mínimos**: Erlang C por franja para los clientes `erlang` (λ = media de 12 semanas; el denominador son los **días laborables de ese día de la semana en la ventana, sin festivos**, y no los días con llamadas, que inflaban las franjas flojas), + margen, y solo dentro de `horarios_servicio`.
4. **Fijados**: los bloques manuales o congelados se aplican tal cual.
5. **Clientes `objetivo`, por prioridad**: se recorren las (fecha, bloque candidato) y se elige la de mayor `score = holguraMin − asignadoDía/k + w·contacto + bonus`. Solo se colocan si la holgura del cliente base es ≥ 1 en todas las franjas; los clientes que «cuentan como» GH no restan holgura. El agente se elige por menos horas de ese cliente en la semana → menos ese día → sin otro cliente ese día → más experiencia → nº. Se respetan los topes de h/día, horas seguidas y bloques/día.
6. **Clientes `a_demanda`** (Ávolo): no generan bloques. Aparecen en el resumen con su bolsa informativa y en las alertas.
7. **Fusión**: las franjas contiguas del mismo cliente forman un bloque, que conserva la regla y los datos de su origen.
8. **Comprobación final**: `validarPlan` más los avisos `objetivo_no_alcanzado`, `franja_bajo_minimo`, `agente_inactivo`, `prefijo_sin_cliente`, `datos_caducados` y `festivos_sin_vigencia`.

**Objetivos** (`objetivos.ts`, también puro): `cierresNecesarios = vivos − %objetivo × total`
y `horas = cierres ÷ ritmo`. El ritmo son los cierres de las campañas del cliente entre las
horas de sesión de sus usuarios, en las últimas 2 semanas completas (se puede fijar a mano).
Las horas se reparten por semanas según la curva del mismo periodo del año anterior; si no hay
curva, a partes iguales. Si el cliente tiene `horasSemanaFijas` (CEFF), ese es el tope. Las
bolsas por defecto se prorratean por laborables del servicio. Cuando una lista se agota, sus
horas de semanas futuras no fijadas vuelven a la base (regla `devuelto_a_base`).

**Explicación**: cada bloque guarda `regla` y `datos`, y `explicaciones.ts` genera el texto:
«UGR aquí: holgura GH 4, contacto 65 %, objetivo de la semana 70 h (42 h asignadas)». Un bloque
editado a mano dice quién lo cambió y cuándo, y qué regla tenía antes.

**Validaciones** (`validaciones.ts`, las mismas en el tablero, en las Server Actions y en el motor):

| Regla | Tipo | Efecto |
|---|---|---|
| Bloques solapados del mismo agente | **Dura** | No se puede soltar ni guardar |
| Agente sin usuario de ese cliente | **Dura** | No podría logarse |
| Bloque sobre una ausencia | **Dura** | |
| Fuera de `horarios_servicio` en un cliente entrante (`erlang` / `a_demanda`) | **Dura** | Las llamadas no llegan. En salientes es blanda. |
| GH por debajo del mínimo | Blanda | Rojo en el mapa. Para publicar hay que aceptarlo expresamente. |
| Fuera del turno del agente | Blanda | Horas extra o cambio puntual |
| Trabajo en festivo | Blanda | Sugiere compensarlo con una libranza FEST |
| Semana por encima de max(contrato, horas del patrón) | Blanda | |
| Más de N horas seguidas del mismo cliente | Blanda | N por cliente (`maxHorasSeguidas`) |

No se puede publicar con incidencias duras. Con blandas, sí, marcando «Publicar con N avisos»
y escribiendo un motivo, que queda en `motivoPublicacion` y en `audit_log`.

**Tests (Vitest)**: `npm test` = `vitest run`, con `vitest.config.ts` y el alias `@`. Los tests van junto al código (`*.test.ts`).

- `erlang.test.ts`: casos conocidos. Con las entrantes reales de GH, el mínimo va de 4 a 6 y el máximo, 6, cae el lunes de 10 a 13 h (cifras del prototipo).
- `calendario.test.ts`: 05/10 y 19/10 son semana B; 12/10 y 26/10, A. El 13/10 se dimensiona como lunes. Octubre tiene 21 laborables.
- `objetivos.test.ts`: UGR con 6.177 contactos, 4.310 vivos, 28 % y 12 cierres/h da ~2.560 cierres y ~213 h. CR con 47 vivos a 12,6/h da 4 h.
- `validaciones.test.ts`: un caso por regla, dura y blanda.
- `motor.test.ts` con el fixture `__fixtures__/octubre-2026.json` (generado por `scripts/planificacion-fixture.ts --mes 2026-10 --hasta-datos 2026-09-28`, **sin nombres, solo nº**, y versionado). Comprueba:
  - 0 franjas por debajo del mínimo;
  - dos ejecuciones dan una salida idéntica;
  - ninguna incidencia dura;
  - horas totales = capacidad (no se pierde ninguna hora);
  - UGR ≥ 95 % de su objetivo; CEFF 18 ± 2 h; CR 4 h; BD+LX 88 ± 5 h; Ávolo 0 h planificadas;
  - un snapshot de horas por cliente y semana: cambiarlo a propósito exige `vitest -u` y explicarlo en el commit.
- `diff.test.ts` (F3) y `alertas.test.ts` / `adherencia.test.ts` (F4).

## Pantallas (`src/app/(dashboard)/planificacion/`)

Cada `page.tsx` llama a `requireRol(...)`: lectura con `"supervision", "operaciones", "direccion"`;
edición y Server Actions con `requireRol("supervision")` (admin siempre pasa). El route handler
de «Hoy» comprueba rol como `/api/supervision/datos`. Se añade «Planificación» a `rutasVisibles`
(admin, supervisión, operaciones, dirección) y su icono a `nav-lateral.tsx`.

| Ruta | Tipo | Contenido |
|---|---|---|
| `/planificacion` | Server | Meses con su estado, avisos de entrada (datos caducados, prefijos nuevos, inactivos, fuera de plantilla) y botón «Generar borrador» |
| `/planificacion/[mes]?vista=agente\|cliente\|dia\|hoy&semana=` | Server que carga + **Client `<Tablero>`** | El tablero (boceto abajo) |
| `/planificacion/[mes]/ausencias` | Server (form + action) | Alta y baja de ausencias por rango de fechas y horas |
| `/planificacion/[mes]/bolsas` | Server (form + action) | Bolsas y objetivos semanales: calculado frente a confirmado |
| `/planificacion/[mes]/versiones` | Server | Versiones y diff con la publicada: «María 07/10 11-14: UGR → GH» |
| `/planificacion/[mes]/cierre` | Server + export XLSX | Por cliente: bolsa, planificado, real y diferencia |
| `/planificacion/adherencia?fecha=` | Server | Plan frente a real por agente y cliente |
| `/planificacion/saldos` | Server | Saldo acumulado por agente, con ajustes |
| `/planificacion/configuracion/{clientes,agentes,patrones,parametros,ausencias}` | Server (forms) | Toda la configuración (supervisión y admin) |

Componentes de cliente en `src/components/planificacion/`: `tablero.tsx` (estado, deshacer,
guardado con `revision`), `fila-agente.tsx`, `bloque.tsx` (tooltip con `ui/tooltip`, menú:
cambiar cliente, dividir, mover a…, eliminar), `barras-bolsa.tsx`, `mapa-cobertura.tsx`,
`panel-incidencias.tsx` y `panel-hoy.tsx` (polling de 60 s). Todos recalculan con las funciones
puras del motor sobre los datos ya cargados. Solo guardar llama al servidor, que vuelve a
validar. El color del texto de cada bloque se elige por contraste con el color del cliente.

```
┌ Planificación · Octubre 2026 · Borrador v3 (sin publicar) ─── [Generar] [Ausencias] [Publicar…] ┐
│ Vista: (Agente) Cliente Día Hoy        ◀ Semana 05/10–09/10 · B ▶        ⚠ 3 avisos · ⛔ 0 duras   │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Bolsas  GH  ███████████████████░ 1.221,00 / 1.264,00 h   UGR ███████████ 214,00 / 213,00 h      │
│         CEFF ████ 18,00 / 18,00 h   CR █ 4,00 / 4,00 h   Ávolo: a demanda (real Av_ 3,00 h)      │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ GH / mín.  L 05  9 10 11 12 13 │16 17 18 19   M 06  9 10 11 12 13 │16 17 18 19   …              │
│                 ▓▓ ▓▓ ░░ ░░ ▓▓ │▓▓ ▓▓ ▓▓ ▓▓         ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ │▓▓ ▒▒ ▓▓ ▓▓   (verde/ámbar/rojo)│
├──────────────┬──────────────────────────────┬──────────────────────────────┬─────────────────────┤
│ Agente  Sem. │ Lun 05/10  9    12    16   20│ Mar 06/10  9    12    16   20│ …                   │
├──────────────┼──────────────────────────────┼──────────────────────────────┼─────────────────────┤
│ 0851 Lourdes │ [GH 9-14          ][GH 16-20]│ [GH 9-11][UGR 11-14]         │                     │
│ 30 h · +1    │                              │                              │                     │
│ 0925 Bego    │ [▒▒▒▒▒▒▒▒▒▒▒ VAC ▒▒▒▒▒▒▒▒▒▒▒]│ [GH 9-14          ][BD 18-20]│                     │
│ 0940 Nieves  │ [GH 9-11][UGR 11-14][GH 16-18][CEFF 18-20]                  │                     │
└──────────────┴──────────────────────────────┴──────────────────────────────┴─────────────────────┘
  Tooltip: «UGR aquí: holgura GH 4, contacto 65 %, objetivo de la semana 70 h (42 h asignadas)»
```

Las demás vistas del mismo plan:

- **Cliente**: filas = clientes; celdas = agentes por franja, y al hacer clic se ve quiénes.
- **Día**: zoom de un día, preparado para 30 min.
- **Hoy**: el plan de hoy con las sesiones reales superpuestas, en una barra fina bajo cada bloque y del color del cliente del usuario logado.

## Fases

F1 y F2 son la fase 1 sugerida, partida en dos para que cada sesión sea abarcable. Cada fase
termina con el lint a cero, `npm test` en verde, `npm run build` sin errores y un commit en
`feature/planificacion`.

### F1 · Datos y motor (sin UI)

- **Archivos**:
  - `package.json` (vitest y scripts `test`, `planificacion:*`) y `vitest.config.ts`;
  - `schema.ts` + `drizzle/0003_*`;
  - `src/lib/planificacion/{parametros,usuarios,cargador,repositorio}.ts` y `motor/*` con sus tests;
  - `src/lib/rdb/queries/{planificacion,islas}.ts`, `agentes.ts` (usa `islas.ts`) y `mock.ts`;
  - `scripts/planificacion-{agregados,semilla,generar,fixture}.ts`;
  - `eslint.config.mjs` (aislamiento del motor).
- **Semilla** (`npm run planificacion:semilla`, idempotente): clientes, prefijos, colores (GH #FFCCFF, BD #FF99FF, Ávolo #4E95D9, UGR #C1E5F5, CR #B4E5A2, CEFF #F8CBAD; LX, uno a elegir), tipos de ausencia (VAC #FF00FF, FEST #FF0000, AUS #BFBFBF, RTO #FFC000), patrones y contratos de `modelo.py` **solo con números** (los nombres salen de `ph_e_user`) y parámetros.
- **Primero**, comprobar con SELECTs los valores reales de `ServicioDirectorio`, `TipoDia` y `horarios_servicio.Servicio`, y cómo casan con `ph_service.name`.
- **Aceptación**:
  - `npm test` en verde, con el fixture de octubre y los criterios de arriba;
  - backfill `planificacion:agregados` desde 2025-06-01 hasta ayer, sin errores y con el tiempo por lote anotado (ninguna consulta de más de 30 s);
  - contra RDBv2: la suma de `agg_sesion_usuario` de un día cerrado, **sin filtrar por número**, es igual a `horasAgenteReales(día).horasLogadas`; en septiembre salen ~3 h de `Av_`; el ritmo de UGR de la semana del 21/09 sale ~12 cierres/h; el mínimo de GH va de 4 a 6, con 6 el lunes de 10 a 13 h;
  - `npm run verificar` da lo mismo antes y después de extraer `islas.ts`;
  - `planificacion:generar -- --mes 2026-11` imprime el resumen y los avisos;
  - con `RDB_MOCK=1` todo funciona.
- **Riesgos**:
  - coste del backfill de `ag_in_cp_log` (7 M de filas): lotes semanales y medir;
  - un `TipoDia` o nombres de servicio distintos de lo supuesto;
  - que el reparto se aleje del prototipo: se admiten bandas, no igualdad, porque Ávolo cambia.
- **CLAUDE.md**:
  - las reglas de dominio de arriba, como regla 15;
  - las tablas `plan_*` y `agg_*` nuevas;
  - los comandos `npm test` y `npm run planificacion:*`;
  - que el motor es puro y no se le añade I/O;
  - que el test runner ya existe: se cierra el pendiente «no hay tests automáticos».

#### Estado de F1 (hecha el 30/09/2026)

Verificado contra RDBv2 real:

- **Backfill** 01/06/2025 → 29/09/2026: 70 lotes en 63,5 s; la consulta más lenta, 0,7 s
  (islas de sesión de una semana). Ninguna isla cruza la medianoche.
- **Sesiones = `horasAgenteReales`**: la suma de `agg_sesion_usuario` sin filtrar por número
  es idéntica en 5 días cerrados (21, 22, 25, 28 y 29/09: 181,75 / 175,44 / 118,42 / 190,35 /
  178,58 h). Las horas por cliente y mes del equipo reproducen al decimal la tabla F del
  prototipo (GH 1.115,2 / 1.181,4 / 789,5 / 890,4 h de junio a septiembre; BD+LX 347,5 h,
  UGR 132,2 h, CEFF 17,2 h, CR 17,3 h en septiembre).
- **`npm run verificar`** da lo mismo antes y después de extraer `islas.ts` (y las horas de
  22/09, 28/09 y 1-28/09, con y sin filtro de servicio).
- **Octubre** (`--hasta-datos 2026-09-28`): capacidad 1.596 h (la misma que el prototipo);
  CR 4 h, CEFF 18 h, BD+LX 87 h, Ávolo 0 h y UGR al 100 % de su objetivo. Vivos reconstruidos
  al 28/09 a partir de la foto del 30/09: UGR 4.310 y CR 47, como el prototipo.
- `planificacion:generar -- --mes 2026-11` imprime resumen y avisos; con `RDB_MOCK=1` (y otra
  SQLite) funcionan semilla, agregados, generar y el control de un solo borrador.

Diferencias con lo previsto (y por qué):

- **Mínimo de GH de 3 a 6**, no de 4 a 6: el viernes de 19 a 20 h sale 3 también en la hoja
  «Demanda» del prototipo. El máximo, 6, sí cae el lunes de 10 a 13 h.
- **Dos franjas bajo el mínimo** en octubre (jueves 08 y 22/10, 17-18 h, semanas B): con la
  ventana de 12 semanas la λ de esa franja es 18,8 llamadas/h (el prototipo usaba 17,5 con
  jun-sep) y el mínimo sube de 4 a 5, pero a esa hora solo 4 agentes tienen turno y los 4 están
  en GH. Es un déficit de turnos, no del reparto: el test exige que el motor no cree ninguno.
- **UGR: 176 h, no 214 h**. El ritmo medido en las 2 últimas semanas completas es 14,57
  cierres/h (15,04 la del 14/09 y 14,39 la del 21/09); los ~12/h del prototipo eran la semana
  del 28/09, incompleta (11,71 con dos días). La curva de 2025 acaba a mediados de octubre, así
  que UGR se concentra en las tres primeras semanas; si la campaña de 2026 va a durar más, basta
  con poner su `curva` en `uniforme`.
- **Ávolo**: el «~3 h de `Av_`» del plan eran las horas con `Av_` DENTRO de los bloques de Ávolo
  planificados en septiembre (necesita el plan de septiembre: F4). El total de septiembre con
  `Av_` es 17,8 h del equipo, como en el prototipo.
- **CR** apunta solo a `CajaR_Autonomos_26`: `CajaR_Banca_26` (acabada en junio) conserva 23
  vivos que nadie va a llamar.
- **BD**: tope fijo de 10 h/semana (restos sin contactos nuevos); LX usa `ritmoManual` 6,9
  porque su lista es del 28/09 y no tiene historia.
- **Modelo**: `plan_agentes.forzarActivo` (para «salvo que se fuercen») y
  `plan_agente_usuarios.prefijo/sufijo` (el cliente se resuelve con los prefijos vigentes);
  `agg_sesion_usuario` guarda `inicio_seg`/`fin_seg` (segundos exactos, cuadran con SQL). GH es
  modo `resto` con `parametros.erlang` (base y entrante a la vez).
- **Bolsas**: si el mes anterior tampoco tiene bolsa confirmada, se prorratea la última
  confirmada (noviembre sale de septiembre: 1.324 × 20/22 = 1.203,64 h).
- **Vitest 5** con `@types/node` subido de ^20 a ^22 (Vitest 5 lo exige; 22 es el mínimo del
  servidor) y `vitest.config.mts` (con `.ts` Vite avisaba de ESM en CommonJS).

Confirmado de las preguntas abiertas: `TipoDia` solo vale `FESTIVO`.

Decidido por Christian al cerrar F1 (30/09/2026):

- **UGR: ritmo medido y reparto uniforme** (`curva: "uniforme"`). Con el fixture de octubre
  queda 17 / 42 / 33 / 42 / 42 h (176 h) en vez de concentrarse en las tres primeras semanas.
- **El déficit de los jueves de semana B (17-18 h) se acepta**: el plan saldrá con ese aviso
  blando mientras no cambien los turnos.
- **CR solo con `CajaR_Autonomos_26`**: confirmado.

Borrador v1 de octubre guardado en la SQLite real con datos hasta el 29/09: 1.596 h, UGR 148 h
(el 29/09 se cerraron ~400 contactos más), CR 0 h (la lista se terminó ese día), CEFF 18 h,
BD 42 h y LX 45 h.

### F2 · Tablero de solo lectura, «Generar borrador» y configuración

- **Archivos**:
  - `rbac.ts` (ruta nueva) y `nav-lateral.tsx`;
  - `planificacion/page.tsx`, `[mes]/page.tsx` y `configuracion/*`, más sus `acciones.ts`;
  - `components/planificacion/{tablero,fila-agente,bloque,barras-bolsa,mapa-cobertura,panel-incidencias}.tsx` en modo lectura;
  - `audit.ts`.
- **«Generar borrador»** (Server Action): carga la entrada desde SQLite (y RDBv2 solo para lo que está cacheado 24 h) y crea la versión `borrador`. Si ya hay uno, pregunta entre «regenerar respetando mis cambios» (los fijados se quedan) y «empezar de cero».
- **«Aprender patrones»** (en configuración/patrones): propone el patrón A/B de cada agente a partir de las últimas 8 semanas de `agg_sesion_usuario` y lo compara con el configurado. Supervisión lo acepta o no.
- **Aceptación**:
  - con un usuario `operaciones` se ve el tablero sin controles de edición, y una Server Action llamada a mano se rechaza;
  - con un usuario `cliente`, redirección;
  - con una cookie inventada, sin contenido en el cuerpo (como en la auditoría del 23/09);
  - el borrador de noviembre se ve en las tres vistas y las barras y el mapa cuadran con `planificacion:generar`;
  - cada bloque tiene su tooltip;
  - cambiar un color o un contrato en configuración se refleja sin tocar código.
- **Riesgos**: rendimiento del tablero con ~1.500 bloques (medir; posicionar en % y memoizar por fila).
- **CLAUDE.md**: rutas y permisos del módulo; «la configuración vive en SQLite: no hardcodear clientes, colores ni agentes».

#### Estado de F2 (hecha el 30/09/2026)

Verificado con `next build` + `next start` sobre una COPIA de la SQLite real (usuarios de prueba de
cada rol) y RDBv2 real; la SQLite real no se ha tocado (sigue con el borrador v1 de octubre).

- **Permisos**, con curl sobre las 9 rutas nuevas: cookie inventada → 307 a `/login` sin contenido
  en el cuerpo (solo el `<title>` estático, como el resto del panel); cliente → 307 a `/clientes`;
  operaciones y dirección ven el tablero (200) sin «Generar» y reciben 307 en `configuracion/*`.
  Las Server Actions llamadas a mano (el POST exacto que manda el navegador, capturado) se
  rechazan para operaciones, dirección, cliente y cookie inventada sin tocar la BBDD; la misma
  petición como supervisión sí crea el borrador (control positivo).
- **Noviembre generado desde la web** (2,9 s): 1.572 h, 456 bloques, GH+BD+LX 1.407 h frente a
  1.203,64 h de bolsa, UGR 148/148, BD 40/40, LX 45/45, CEFF 17/17 y dos franjas bajo mínimo
  (jueves 05 y 19/11, 17-18 h): lo mismo que `planificacion:generar`. Además, lo que recalcula el
  navegador a partir de la foto es idéntico a la salida del motor en octubre y noviembre (bloques,
  mínimos, validaciones, horas por cliente y semana, franjas en rojo).
- **Tooltips**: 114 bloques con tooltip en la semana del 09/11 = 114 bloques en la BBDD; el
  texto sale de `explicarBloque` («UGR aquí: holgura GH 6, contacto 60 %, objetivo de la semana
  37,00 h…»).
- **Configuración sin tocar código**: cambiar el color de GH y el contrato de 1118 (25 → 30 h) se
  ve en el tablero al recargar, sin regenerar.
- **Regenerar respetando mis cambios**: con un bloque marcado a mano como fijado, la v2 lo
  conserva tal cual (`recalculo`, basada en la v1, que queda «descartada»).
- **Rendimiento** (Chrome headless, equipo de desarrollo): con 423 bloques, cambio de semana
  85-103 ms; con 1.435 bloques (cada bloque partido en horas), carga completa 0,6 s, cambio de
  semana 130-190 ms y de vista 66-149 ms. Basta con posicionar en % y memoizar por fila.
- **Modo demo** (`RDB_MOCK=1`, SQLite nueva): semilla, agregados, generar y las 8 pantallas.

Diferencias con lo previsto (y por qué):

- **Vistas**: agente, cliente y día. «Hoy» (sesiones reales superpuestas) queda para F4, con el
  resto del seguimiento. La vista de día usa `?dia=`, además de `?semana=`.
- **Foto + datos vivos**: el tablero usa la entrada guardada con la versión (explica el plan aunque
  cambien los datos), pero con nombre, color y orden de los clientes, contrato de los agentes y
  ausencias VIVOS encima: así un color o un contrato se ven sin regenerar y una ausencia nueva ya
  cuenta en las validaciones (F3). Los mínimos no se guardan: se recalculan de la foto
  (`motor/minimos.ts`, extraído del motor sin cambiar el snapshot).
- **Incidencias**: las validaciones (`CODIGOS_VALIDACION`) se recalculan en el navegador; el resto
  de avisos (datos caducados, inactivos, objetivos…) son los guardados al generar.
- **Barras**: GH va con los que cuentan como GH (BD y LX), que comparten su bolsa, como en la hoja
  «Resumen» del prototipo; BD y LX llevan además su barra contra su objetivo.
- **Nombres**: alias de configuración o, si no hay, la primera palabra de los `fullname` de sus
  usuarios que no sea un prefijo («Lourdes GH» → «Lourdes»), la más repetida.
- **Configuración**: los parámetros de cada cliente se editan como JSON validado con el esquema
  del motor en modo estricto (una clave mal escrita se rechaza en vez de ignorarse). Se exige un
  único cliente «resto» activo en el equipo planificado. Los prefijos sin cliente se asignan desde
  la misma pantalla.
- **Aprender patrones**: franja trabajada = al menos media franja con sesión; entra en el patrón si
  se trabajó en MÁS de la mitad de los días válidos de esa rotación (semanas sin ninguna sesión y
  festivos fuera). Aceptar reutiliza el patrón con esos mismos tramos o crea «Aprendido 0851 A…».
  Con datos reales coinciden 0851, 0985, 1048 y 1067; 1086 parece tener A y B cruzadas y 1008
  trabaja menos tardes de las configuradas (a revisar con supervisión).
- **Avisos de entrada** en `/planificacion`: los mismos criterios que el cargador (se extrajeron a
  `equipo.ts`; la entrada del motor sale idéntica byte a byte para octubre y noviembre) más los
  agentes de plantilla sin turno vigente.
- **Ventana de generación**: el mes actual y los tres siguientes.

### F3 · Edición, ausencias, bolsas, publicación, versiones y saldo previsto

- **Archivos**:
  - dependencias `@dnd-kit/core` y `@dnd-kit/modifiers`;
  - `tablero.tsx` editable, con deshacer y guardado por lotes de operaciones con `revision` (si otro supervisor guardó antes: aviso y recarga);
  - `motor/diff.ts` con su test;
  - las páginas `ausencias`, `bolsas` y `versiones`;
  - `[mes]/acciones.ts`: `guardarCambios`, `publicar`, `crearBorradorDesdePublicada`, `guardarAusencia`, `confirmarBolsa`.
- **Saldo previsto** por agente y semana: plan + justificadas − contrato, visible en la fila del agente.
- **Aceptación**:
  - arrastrar, estirar, dividir y cambiar de cliente, también por teclado y por menú;
  - una incidencia dura impide soltar y el servidor la rechaza aunque se salte el cliente;
  - publicar con avisos blandos exige un motivo y deja rastro en `audit_log`;
  - el diff muestra exactamente las celdas cambiadas;
  - una ausencia recalcula la capacidad y las barras al instante;
  - una bolsa prorrateada: 1.324 h × 21/22 = 1.263,82 h.
- **Riesgos**:
  - que dos supervisores editen a la vez: lo cubre la revisión optimista;
  - la accesibilidad del arrastre.
- **CLAUDE.md**: el ciclo de versiones (borrador → publicada → sustituida), las validaciones duras y blandas y el registro de auditoría.

#### Estado de F3 (hecha el 01/10/2026)

Verificado con `next build` + `next start` sobre una COPIA de la SQLite real (usuarios de prueba de cada
rol) y RDBv2 real, con Chrome headless por CDP; la SQLite real no se ha tocado (sigue con el borrador
v1 de octubre).

- **Edición en el tablero** (octubre, semana del 05/10): arrastrar UGR 11-14 de 0851 a 0973; soltar
  UGR sobre 1008, que no tiene usuario de UGR, avisa bajo el bloque («No se puede: … no podría
  logarse») y no se aplica; estirar GH 16-18 de 0940 hasta las 19 recorta su CEFF; dividir GH 9-14 a
  las 12 y pasar 12-14 a UGR por el menú (sus submenús); y con el teclado ←, Mayús+←, Alt+←, Ctrl+Z,
  Ctrl+Y e Intro (abre el menú). Al guardar: «6 operaciones, 6 tramos cambiados», justo los
  esperados, con autor y hora en cada bloque manual y la entrada en `audit_log`. También «Mover a…»
  y «Añadir bloque» (validan en el propio diálogo), doble clic en un hueco, unir, fijar, descartar y
  la vista de día. Cada edición con teclado tarda 33 ms de mediana (máx. 39) con 115 bloques a la
  vista; guardar, 172 ms con la página repintada (el guardado en sí, 36-56 ms).
- **Dos supervisores a la vez** (dos navegadores): el segundo en guardar recibe el aviso, no se
  escribe nada y la barra de edición desaparece; «Recargar» le enseña lo del primero.
- **El servidor no se fía del navegador**: repitiendo a mano el POST capturado, operaciones,
  dirección, cliente, cookie inventada y sin cookie salen redirigidos; supervisión con una operación
  que crea una incidencia dura, una operación inventada, bloques en vez de operaciones, un agente que
  no está en el plan, una fecha de otro mes, un lote con la 2.ª operación mala (todo o nada) o una
  revisión vieja recibe el error, y la BBDD queda idéntica (misma huella); los rechazos de
  supervisión quedan en `audit_log`. Igual con publicar (otros roles, sin motivo, motivo corto,
  recuento de avisos distinto, revisión vieja) y con las acciones de ausencias, bolsas y objetivos.
- **Publicar**: con 6 avisos blandos el botón no se activa hasta marcar «Publicar con 6 avisos» y
  escribir un motivo de 10 caracteres o más; queda en `motivo_publicacion` y en `audit_log` con los
  avisos aceptados por código (`fuera_turno×3, semana_sobre_contrato×1, franja_bajo_minimo×2`). Al
  publicar la v2, la v1 pasa a «sustituida».
- **Borrador desde la publicada**: la v2 sale como `copia` basada en la v1, con los mismos bloques.
- **Diff**: tras mover un UGR y borrar otro en la v2, `/versiones` muestra exactamente 3 tramos
  (0925 08/10 10-11 GH → UGR y 13-14 UGR → GH; 1067 08/10 11-14 UGR → libre), lo mismo que una
  comparación independiente minuto a minuto (300 min).
- **Ausencias**: VAC de 0985 el 14/10 «quitando lo que pisa»: capacidad 1.596 → 1.587 h, GH+BD+LX
  1.433 → 1.424 h y la celda vacía con la banda de VAC, sin regenerar; su saldo no cambia (VAC cuenta
  como trabajada). Una AUS sin quitar da 1 incidencia dura, bloquea publicar y «Quitar lo que pisa
  ausencias (1)» la resuelve.
- **Bolsa**: GH de octubre = 1.324 h (septiembre) × 21/22 = 1.263,82 h; confirmarla así la guarda
  como `prorrateo`.
- **Modo demo** (`RDB_MOCK=1`, SQLite nueva): semilla, agregados, generar y las seis pantallas del
  mes, con formularios solo para supervisión.
- El cargador usa ahora `bolsas.ts` (lo comparte con la página de bolsas): la entrada del motor de
  octubre, noviembre y diciembre sale idéntica byte a byte.

Diferencias con lo previsto (y por qué):

- **Soltar encima recorta**: lo que se suelta, estira o crea encima de otros bloques del mismo
  agente y día los recorta, así que el solape (dura) no se puede producir desde el tablero (sigue
  validándose en el servidor). Al mover o encoger un bloque de otro cliente, su hueco dentro del
  turno (sin ausencias ni festivos) vuelve a GH, como hace el motor; si el bloque es de GH, el hueco
  queda libre. Eliminar deja el hueco libre; «Devolver a GH» es cambiar de cliente. Un bloque
  fijado no se pisa.
- **Duras nuevas**: una edición se rechaza si crea una incidencia dura que no estaba; las que ya
  había (p. ej. una ausencia dada de alta después) no bloquean otras ediciones del mismo día.
  Publicar sí exige cero duras.
- **Guardado por operaciones**: el navegador manda la lista de operaciones (zod) y el servidor las
  repite con las mismas funciones puras (`lib/planificacion/edicion.ts`) sobre los bloques de la
  BBDD; los ids nuevos son negativos y deterministas («el menor − 1»). Operaciones: mover,
  redimensionar, dividir, unir, cambiar de cliente, eliminar, fijar, crear y quitar ausencias.
- **El diff es por tramos**, no por bloques: dividir o unir no es un cambio y mover un bloque de una
  agente a otra son dos (`motor/diff.ts`, con test).
- **Saldo previsto** en la fila del agente: plan + justificadas − contrato, con el contrato de cada
  semana prorrateado por sus laborables dentro del mes (como el contrato del mes del motor);
  justificadas = horas de turno cubiertas por ausencias de tipos que cuentan como trabajadas, fuera
  de festivos. Sin contrato, sin saldo. El contrato pasa al tooltip de la fila.
- **Capacidad viva**: la cabecera la recalcula con las ausencias de hoy (antes era la de generar).
- **Ausencias, bolsas y versiones** las ven también operaciones y dirección (sin formularios). Dar
  de alta una ausencia puede recortar los bloques que pisa en los BORRADORES de los meses que toca
  (casilla marcada por defecto); las publicadas no se tocan. Borrar una ausencia no devuelve sus
  horas.
- **Al guardar** se ponen al día los avisos (validaciones) y las horas del resumen de la versión: la
  columna de `/planificacion` pasa a ser «Incidencias» de ahora.
- **Arreglado de F2**: el tablero escribía la URL con `history.replaceState(null, …)` en el primer
  montaje, antes de que Next instale su versión parcheada, y borraba su estado del historial: «Atrás»
  desde otra página no volvía al tablero. Ahora va en un `setTimeout`. Y guardar, publicar, copiar y
  las acciones de ausencias y bolsas invalidan la caché del router (`revalidatePath`), para que
  «Atrás» no enseñe el plan de antes del cambio.
- **Base UI**: el menú del bloque es uno solo para todo el tablero, anclado al bloque; necesita un
  `Menu.Trigger` oculto, porque sin él los submenús se tienen por «hermanos» y cierran el menú.

### F4 · Seguimiento: Hoy, adherencia, saldo real, alertas y cierre de mes

- **Archivos**:
  - `planificacion/{adherencia,saldo,alertas}.ts` (puros, con tests);
  - `api/planificacion/hoy/route.ts`;
  - `panel-hoy.tsx`;
  - la ampliación de `api/supervision/datos` y de `panel-supervision.tsx` con la tarjeta «Alertas de planificación»;
  - las páginas `adherencia`, `saldos` y `cierre` (XLSX con `FORMATO_2_DECIMALES`);
  - la migración `0004` del saldo.
- **Adherencia**: por turno (logado con cualquier usuario dentro de lo planificado) y por cliente (logado con el usuario correcto). El tiempo en `Av_` cuenta como «a demanda», no como desvío.
- **Alertas** (la mejora nº 4 pendiente de CLAUDE.md):
  - Ávolo: «N entrantes sin atender desde las HH:MM: que alguien con `Av_` se logue»;
  - GH por debajo del mínimo en la franja actual (logados ahora con GH/BD/LX frente al mínimo);
  - agente planificado sin conectar a los 15 min (`plan.minutosAlertaConexion`);
  - campaña saliente retrasada: horas de la semana frente al objetivo prorrateado a hoy, por debajo del 80 %.
- **Aceptación**:
  - la adherencia de septiembre recalculada con el plan real de septiembre, cargado a mano o importado una vez, da ~97 % (1.364 de 1.411 h);
  - las alertas coinciden con lo que se ve en el panel de agentes en 5 instantes comprobados;
  - el cierre de mes cuadra al céntimo con la suma de las filas (redondeo solo al final).
- **Riesgos**: el ruido de las alertas (umbrales como parámetros); el coste de las islas de hoy cada 60 s (cache compartida y medir).
- **CLAUDE.md**: definiciones de adherencia y saldo; alertas implementadas (se tacha la mejora 4).

### F5 · Automatización programada

- **Archivos**: `scripts/planificacion-nocturno.ts` (`npm run planificacion:nocturno`), `docs/despliegue-windows.md` (tarea a las 02:15, entre los agregados y el backup) y la frescura de los agregados de planificación en `/admin`.
- **La tarea nocturna es una sola, diaria e idempotente**, y decide por fecha:
  1. agregados de ayer, sincronización y foto de listas;
  2. el día `plan.diaGeneracion` (20), borrador del mes siguiente si no existe;
  3. los lunes, recálculo de las semanas que aún no han empezado, respetando los bloques fijados y los ya publicados. Si hay una versión publicada, el resultado queda como borrador con su diff y un aviso en `/planificacion` y en Supervisión.
- **Aceptación**:
  - ejecutarla dos veces seguidas no duplica nada;
  - simulando «hoy = día 20» (`--hoy`) crea el borrador;
  - si una lista se queda sin contactos en la foto, sus horas futuras vuelven a GH en el recálculo;
  - el comando `schtasks` queda documentado.
- **Riesgos**: que el recálculo pise decisiones humanas (mitigado: nunca toca publicado ni fijado sin pasar por un borrador).
- **CLAUDE.md**: la tarea nueva, dentro de «Programar tareas nocturnas» (mejora 2).

### F6 · Opcionales

- **Simulaciones «¿y si?»**: versiones `simulacion` que no se pueden publicar, con comparación de resúmenes.
- **Exportación**: Excel con el formato de la plantilla (colores, bloques semanales, totales), con `exceljs` y la estructura de `build_xlsx.py`; y PDF de la semana con CSS de impresión, sin librería.
- **«Mi horario» (.ics)**: un token aleatorio de 32 bytes por agente (en la BBDD solo su hash SHA-256, como las sesiones), revocable, en `/api/ics/[token]` (se añade a `RUTAS_PUBLICAS` del proxy). Solo muestra los bloques de ese agente (cliente y horas), nunca otros nombres. Límite de peticiones. Hoy los agentes no son usuarios del dashboard: con la exposición a internet (Caddy + 2FA, mejora 10 de CLAUDE.md, que no es la F5 de este plan) un token filtrado es el riesgo, así que se revisa antes de abrir.

## Pasos inmediatos al aprobar

1. `git switch -c feature/planificacion` desde `master`.
2. Guardar este plan en `docs/plan-planificacion.md`, con la fecha de aprobación, y hacer el commit «Plan del módulo de planificación de turnos».
3. Añadir en `CLAUDE.md` una línea que apunte al plan, en «Mejoras recomendadas pendientes».

## Verificación general

- **En cada fase**: `npm run lint`, `npm test`, `npm run build` y, cuando aplique, `npm run verificar` antes y después.
- **Contra RDBv2 real**: las comprobaciones de cada fase, con tiempos de consulta anotados en el commit.
- **Modo mock** (`RDB_MOCK=1`): todas las pantallas cargan sin credenciales.
- **Seguridad**: por cada ruta nueva, un usuario de cada rol y una cookie inventada, como en la auditoría del 23/09.
