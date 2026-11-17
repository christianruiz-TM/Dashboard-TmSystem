# Panel de RRHH: ausencias

Pedido por Christian el 16/11/2026. Lo usa una persona de RRHH (rol `rrhh`,
ve y apunta); dirección y admin lo ven. Supervisión, operaciones y el
cliente, no.

## Decisiones (16/11/2026, con Christian)

- **Una sección, «Ausencias»**, con tres tipos de tiempo ausente:
  1. **De día completo o de unas horas**: las ausencias de Planificación
     (`plan_ausencias`, la MISMA lista: supervisión ve lo que apunta RRHH y al
     revés). Tipos nuevos: IT (baja médica), PER (permiso retribuido) y AP
     (asuntos propios). RRHH marca en cada tipo si cuenta como trabajado (es el
     mismo `computa_como_trabajada` que usa el saldo de Planificación).
  2. **Sin conectar dentro de su horario**: llegar tarde, irse antes o un
     hueco a mitad. **Tarde desde el primer minuto.**
  3. **Pausas conectada** (`ag_in_cp_log`, op 2), cada una con su hora.
- **Entrada = primer login** (`user_log`). El fichaje de verdad está en
  GsBase (Gladonsoftware) y aún no hay conector.
- **Persona = nº de agente**, con todos sus usuarios de Altitude juntos
  (regla 15). Todas las agentes de todos los clientes. **Supervisoras fuera**
  (1010 y 1071 tienen nº: se excluyen en la configuración).
- **Hoy en vivo** (se refresca cada minuto) y días cerrados.
- **Horario de cada persona**:
  - En la plantilla de Planificación (`plan_agentes.en_plantilla`): los
    bloques de la versión vigente del mes (publicada; si no, borrador). Si el
    mes no tiene plan, como las demás.
  - Las demás: **horario aprendido** de sus logins de las últimas semanas
    (mediana de entrada y salida por día de la semana, redondeada a 15 min),
    que se usa en cuanto sale, marcado «aprendido», hasta que RRHH lo confirma
    o lo cambia en Configuración. Medido el 16/11/2026: las 15 personas sin
    planificar entran y salen casi al minuto cada día (0-2 min de desviación).
  - **Turno partido**: hasta dos tramos por día. Los jueves de Bolsas son
    08:00-15:00 y 17:00-20:00 (Bol_0516, 0745, 0927 y 0969, 05 y 12/11): con
    un solo tramo, las dos horas del mediodía salían como ausencia. Un día
    sale partido si en al menos la mitad de esos días hay un corte de 1 h o
    más sin conectar.
  - **Contrato**: RRHH lo apunta; si la persona está en Planificación y su
    contrato es otro, se avisa.
- **Motivos de pausa** (`not_ready_reason`), clasificables por RRHH:
  - Ausencia: Descanso, Servicio (el aseo), Fin de Jornada.
  - Trabajo sin cola: Formacion, Llamada Supervisora, Tiempo administrativo,
    Llamada manual, Exito.
  - `NREADY_REASON_NOT_WORKING` justo después de conectarse (2 min de margen)
    es **«Hasta ponerse disponible»**: se ve aparte y no cuenta como ausencia
    (03-14/11/2026: 1.399 de 1.575 casos, 3,53 min de media). A mitad de la
    jornada sale como «Pausa sin motivo» (ausencia, configurable).
  - `EL_FINREADY_REASON_RONA` («No cogió una llamada»): ausencia, configurable.
  - SIGNOFF, CLEANUP y CP_ABANDON (duran 0 s): no se enseñan.
- Cada consulta del detalle de una persona y cada cambio quedan en
  `audit_log` (son datos de control de la plantilla: art. 20.3 ET y art. 87
  LOPDGDD).

## F1 (hecha el 16/11/2026)

- Rol `rrhh` (el rol es texto: no hace falta migración para él), `/rrhh` y
  `/rrhh/configuracion`.
- **Día**: flechas de día, «Hoy», buscador, cajas (con horario, ausentes todo
  el día, llegadas tarde, sin conectar en su horario, pausas de ausencia) y una
  fila por persona con la barra del día. Excel con una fila por cada tramo.
- **Detalle de una persona** (`?persona=`): todo el día por orden de hora,
  totales por motivo, notas y alta de ausencias.
- **Configuración**: personas (horario, contrato, excluida), motivos de pausa
  y tipos de ausencia.
- Migración 0015: `rrhh_personas`, `rrhh_horarios`, `rrhh_notas`; tipos de
  ausencia nuevos; 1010 y 1071 excluidas.
- Lógica pura con tests en `src/lib/rrhh/`; SQL en `queries/rrhh.ts`.

## Pestaña «Por agente» (16/11/2026, pedida por Christian)

- Periodo con atajos (hoy, ayer, esta semana, semana pasada, mes actual, mes
  anterior) o intervalo; por defecto el mes en curso; como mucho 93 días.
- Por persona: días conectada, tiempo conectado, **tiempo ausente = solo las
  pausas con motivo de ausencia** (decidido: sin el tiempo sin conectar), %
  sobre lo conectado y número de ausencias. Al desplegar: por motivo, tiempo
  acumulado, veces, media por vez y % del ausente; y aparte las ausencias
  apuntadas (veces, días completos y horas sueltas).
- Fila de total, también desplegable. Excel con tres hojas (personas, por
  motivo y ausencias apuntadas).
- Noviembre (01-16) de todos: 28 personas en 2 s; 1.512,92 h conectadas y
  184,73 h ausentes (12,21 %) en 1.485 pausas.
- «Fin de Jornada» se pone también al cambiar de usuario de Altitude
  (GH_0940 → Av_0940 → CEFF_0940), unos segundos cada vez. Del 01 al 15/11,
  488 de 542 duraron menos de 1 min (1,62 h de 9,58 h) e inflaban el número
  de ausencias (Av_0940: 97 en 11 días). **Decidido (opción 1): las pausas
  de menos de 1 min no cuentan**, ni en tiempo ni en veces, en las dos
  pestañas (la abierta ahora, sí). 01-16/11: de 1.485 a 924 ausencias y de
  184,73 a 182,83 h; Av_0940, de 97 «Fin de Jornada» a 2.

## F2

Lo que quede de semana y mes (por ejemplo, la vista del día de varios días).

## Comprobaciones hechas (16/11/2026)

- 30 tests de la lógica pura (`npm test`: 415 en total, todos en verde),
  `tsc` y ESLint sin errores.
- Contra RDBv2 real con una copia de la SQLite de desarrollo: el día entero
  en 0,1-0,8 s (13/11: 28 personas, 635 tramos en el Excel).
- En un `next dev` aparte (copia del proyecto y de la SQLite): día, detalle,
  configuración, modo oscuro y 1.280 px; nota, ausencia de unas horas y
  horario con turno partido guardados y auditados.
- El `next dev` del puerto 3000 tenía el vigilante de ficheros parado (no
  recompilaba nada desde las 10:50): reiniciarlo para ver el panel en él.

## Comprobaciones pendientes

- Conectada de un día = «efectivas» de Planificación → Horas para las mismas
  personas (misma fuente, `user_log`).
- Pausas por motivo ≈ Operaciones → Pausas del mismo día (aquí además se
  juntan los usuarios de una persona).
