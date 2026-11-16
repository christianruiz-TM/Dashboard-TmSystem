# Sesión 10/11/2026 (Opus 5.5): contrato del día con las horas de su turno

Petición de supervisión, a través de Christian. Commit `c55a58d`, desplegado
el 10/11/2026 a las 13:28 (imagen `3fe774ce5355`, sin migraciones, backup
`dashboard_20261110_1326.db`, vuelta atrás `dashboard-app:anterior` =
`2a728e7c5062`; `despliegue-linux.md` §9). La regla, en CLAUDE.md
(«Planificación de turnos» → Seguimiento → Saldo).

## 1. «¿Por qué María sale con −3 h la primera semana de noviembre?»

Agente 0985, borrador v21 de noviembre (id 26), semana del 02/11:

- **−1 h**: es una semana B (turno de 37 h) con un contrato de 38 h. Las
  semanas A (39 h) dan +1; a lo largo del mes se compensan.
- **−2 h**: los recortes del borrador del 03 y el 04/11 (menos horas
  planificadas que su turno esos días).
- El lunes 02/11 es festivo en el calendario laboral y María lo trabaja: es
  neutro (las horas trabajadas cuentan; el festivo trabajado se compensa con
  una ausencia FEST, que aún no está apuntada).
- La RTO del jueves 05/11 de 16:00 a 19:00 cae FUERA de su turno: no
  justifica nada. Que supervisión la revise.

## 2. «¿Por qué el contrato tiene decimales?»

«Horas» de noviembre decía 1.781,17 h de contrato. Desde el 04/11, en la
semana partida del lunes 30/11 el contrato del día era semanal × turno del
día ÷ turno de la semana entera: 38 × 9 ÷ 37 = 9,24 h, y de ahí los decimales.

Christian propuso que el 30/11 cuente las horas de su turno de los lunes.
Se generalizó así (aprobado: «sí, hazlo así, y pon una leyenda»):

- **Cada día cuenta las horas de su turno.**
- **El ÚLTIMO día con turno de la semana lleva además la diferencia**
  contrato semanal − turno de la semana entera (+1 en las semanas B de 37 h,
  −1 en las A de 39 h con 38 h de contrato).
- Si ese último día es del mes siguiente, la diferencia se cuenta allí (la
  semana del 30/11 la lleva diciembre; la del 28/09, octubre).
- Sin el turno de la semana entera (o con 0 h), como antes: semanal ÷ 5 de
  lunes a viernes.
- Una semana entera suma lo mismo que antes; solo cambia en qué día cae la
  diferencia.

Consecuencia que ven las supervisoras: quien cumple su turno sale a cero de
lunes a jueves, y el viernes aparece el +1 o el −1 de la semana.

## 3. Qué se cambió

- `motor/contrato.ts`: `horasTurnoSemanas` devuelve por semana las horas y
  el último día con turno (`SemanaTurno`); `contratoDelDia` aplica la regla.
  La usan igual el motor (`contratoMesH`), `saldo.ts` (Saldos, cierre,
  Horas) y el saldo previsto del tablero.
- **Leyenda** `NotaContratoDia` en «Horas» y «Saldos»: cómo se cuenta y,
  si el mes las tiene, las semanas partidas y en qué mes va su diferencia
  (`notasSemanaPartida`, puro, en `tablero.ts`).
- Textos de la ayuda (`ayuda-contenido.ts`): Saldos, «¿Cuántas horas de
  contrato tiene un día?» en Horas, «Contrato del día» y «Semana partida» en
  las palabras, y el «?» del contrato.
- 329 tests, `tsc` y ESLint en verde. El snapshot del motor no cambia (su
  fixture no lleva el turno de la semana partida).
- 11/11: guía de Claude Docs al día (Saldos y Horas en «5 · Fin de mes»,
  «Contrato del día» y «Semana partida» en «Palabras», y Saldo previsto,
  Saldos y Horas en la «Guía detallada») y guía HTML regenerada
  (`npm run guia:html`, 1.433 KB). Las capturas no cambian: el recuadro
  nuevo no sale en ninguna.

## 4. Cifras (producción, comprobadas antes y después de desplegar)

- Contrato de noviembre: 1.781,17 h → **1.780 h**; hasta el 09/11,
  524,72 h → **524 h**.
- María, lunes 30/11: 9,24 h → **9 h**.
- Arrastre de octubre (cambia porque la semana del 28/09 lleva su
  diferencia el 02/10): 1048 −16,29 → −17,68; 1067 −41,32 → −42,72; 0851
  −29,86 → −30,52; 0973 −4,85 → −5,58; 0892, 0925, 0940 y 0985 +0,69.
- A mitad de semana el saldo real se mueve unas décimas (María, el lunes
  09/11: −0,23) y se compensa el viernes.

La prueba antes de desplegar se hizo en el contenedor `tareas` con una copia
de `/app/src` en `/tmp` y el código nuevo encima, con `SQLITE_PATH` ABSOLUTO
(con la ruta relativa abría una SQLite vacía; la de producción no se tocó).
La copia se borró después.

## 5. Pendiente

- Avisar a supervisión: recargar las pestañas abiertas y que los saldos se
  mueven (arrastre de octubre y el +1/−1 del viernes).
- María: apuntar la FEST del festivo trabajado del 02/11; revisar la RTO del
  05/11 fuera de turno.
- Que RR. HH. confirme la regla de los festivos (pendiente desde el 08/10).
