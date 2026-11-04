import { lunesDe } from "./calendario";
import type { Tramo } from "./tipos";

// ============================================================
// Contrato de cada día (04/11/2026, decidido con Christian). Puro.
//
// El contrato semanal se reparte entre los días según el TURNO de la persona:
//   contrato del día = semanal × horas de turno ese día ÷ horas de turno de la
//   semana entera.
// Antes era el semanal ÷ 5 cada día de lunes a viernes. Como los lunes son
// de 9 h (partido) y los viernes de 4-5 h, una semana partida entre dos meses
// daba saldos que no eran: el lunes 30/11/2026, +3 h con 30 h de contrato; y
// el jueves y viernes 01-02/10/2026 (el saldo empieza ese jueves) dejaron
// entre −2 y −5,20 h de arrastre que nada compensaba. En una semana entera
// suma lo mismo que antes y mantiene el +1/−1 de las semanas A/B (39/37 h con
// 38 h de contrato). Si no se conoce el turno de la semana entera, o no
// tiene, se sigue con el ÷ 5.
// ============================================================

/** Horas de unos tramos de turno. */
export function horasTurno(tramos: readonly Tramo[] | undefined): number {
  return (tramos ?? []).reduce((h, t) => h + (t.finMin - t.inicioMin) / 60, 0);
}

/**
 * Horas de turno de cada semana (lunes → horas), solo de las semanas que se
 * conocen ENTERAS: con sus 7 días en `fechas` o, si llega `turnosFuera` (el
 * turno de los días de otro mes en las semanas partidas; sin fecha = sin
 * turno ese día), todas las de `fechas`.
 */
export function horasTurnoSemanas(
  fechas: readonly string[],
  turnos: Readonly<Record<string, readonly Tramo[]>>,
  turnosFuera?: Readonly<Record<string, readonly Tramo[]>>,
): Map<string, number> {
  const dias = new Map<string, number>();
  const horas = new Map<string, number>();
  for (const f of fechas) {
    const lunes = lunesDe(f);
    dias.set(lunes, (dias.get(lunes) ?? 0) + 1);
    horas.set(lunes, (horas.get(lunes) ?? 0) + horasTurno(turnos[f]));
  }
  if (!turnosFuera) {
    for (const [lunes, n] of dias) if (n < 7) horas.delete(lunes);
    return horas;
  }
  const delMes = new Set(fechas);
  for (const [f, tramos] of Object.entries(turnosFuera)) {
    const lunes = lunesDe(f);
    if (!delMes.has(f) && horas.has(lunes)) horas.set(lunes, horas.get(lunes)! + horasTurno(tramos));
  }
  return horas;
}

/**
 * Contrato de un día: su parte del semanal según el turno. Sin el turno de
 * la semana entera (o si la semana no tiene turno), el semanal ÷ 5 de lunes
 * a viernes.
 */
export function contratoDelDia(
  contratoSemanalH: number,
  entreSemana: boolean,
  turnoDiaH: number,
  turnoSemanaH: number | undefined,
): number {
  if (turnoSemanaH != null && turnoSemanaH > 0) return (contratoSemanalH * turnoDiaH) / turnoSemanaH;
  return entreSemana ? contratoSemanalH / 5 : 0;
}
