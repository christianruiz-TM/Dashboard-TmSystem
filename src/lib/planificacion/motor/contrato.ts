import { lunesDe } from "./calendario";
import type { Tramo } from "./tipos";

// ============================================================
// Contrato de cada día. Puro.
//
// 10/11/2026 (decidido con Christian, a petición de supervisión):
//   contrato del día = las horas de su TURNO ese día; y el ÚLTIMO día con
//   turno de la semana lleva además la diferencia entre el contrato semanal y
//   el turno de la semana entera (el +1/−1 de las semanas A/B de 39/37 h con
//   38 h de contrato, o las 4 h de un turno de 26 h con 30 h de contrato).
// Así no salen decimales: el lunes 30/11/2026 de 9 h cuenta 9 h (antes
// 38 × 9 ÷ 37 = 9,24 h), y quien cumple su turno ve el saldo a cero hasta
// el último día de la semana. Si ese día es del mes siguiente (semana
// partida), la diferencia se cuenta allí. Una semana entera suma justo su
// contrato, igual que antes.
// Antes (04/11/2026): el semanal repartido en proporción al turno de cada
// día; y hasta entonces, el semanal ÷ 5 de lunes a viernes, que con lunes de
// 9 h y viernes de 4-5 h daba saldos falsos en las semanas partidas. Si no
// se conoce el turno de la semana entera, o no tiene, se sigue con el ÷ 5.
// ============================================================

/** Horas de unos tramos de turno. */
export function horasTurno(tramos: readonly Tramo[] | undefined): number {
  return (tramos ?? []).reduce((h, t) => h + (t.finMin - t.inicioMin) / 60, 0);
}

/** Turno de una semana entera: sus horas y su último día con turno (null si no tiene). */
export interface SemanaTurno {
  horas: number;
  ultimoDia: string | null;
}

/**
 * Turno de cada semana (lunes → horas y último día con turno), solo de las
 * semanas que se conocen ENTERAS: con sus 7 días en `fechas` o, si llega
 * `turnosFuera` (el turno de los días de otro mes en las semanas partidas;
 * sin fecha = sin turno ese día), todas las de `fechas`.
 */
export function horasTurnoSemanas(
  fechas: readonly string[],
  turnos: Readonly<Record<string, readonly Tramo[]>>,
  turnosFuera?: Readonly<Record<string, readonly Tramo[]>>,
): Map<string, SemanaTurno> {
  const dias = new Map<string, number>();
  const semanas = new Map<string, SemanaTurno>();
  const sumar = (f: string, tramos: readonly Tramo[] | undefined) => {
    const s = semanas.get(lunesDe(f))!;
    const h = horasTurno(tramos);
    s.horas += h;
    if (h > 0 && (s.ultimoDia == null || f > s.ultimoDia)) s.ultimoDia = f;
  };
  for (const f of fechas) {
    const lunes = lunesDe(f);
    dias.set(lunes, (dias.get(lunes) ?? 0) + 1);
    if (!semanas.has(lunes)) semanas.set(lunes, { horas: 0, ultimoDia: null });
    sumar(f, turnos[f]);
  }
  if (!turnosFuera) {
    for (const [lunes, n] of dias) if (n < 7) semanas.delete(lunes);
    return semanas;
  }
  const delMes = new Set(fechas);
  for (const [f, tramos] of Object.entries(turnosFuera)) {
    if (!delMes.has(f) && semanas.has(lunesDe(f))) sumar(f, tramos);
  }
  return semanas;
}

/**
 * Contrato de un día: las horas de su turno, y el último día con turno de
 * la semana, además, lo que le falta (o le sobra) al turno de la semana para
 * llegar al contrato. Sin el turno de la semana entera (o si la semana no
 * tiene turno), el semanal ÷ 5 de lunes a viernes.
 */
export function contratoDelDia(
  contratoSemanalH: number,
  entreSemana: boolean,
  fecha: string,
  turnoDiaH: number,
  semana: SemanaTurno | undefined,
): number {
  if (semana != null && semana.horas > 0) return turnoDiaH + (fecha === semana.ultimoDia ? contratoSemanalH - semana.horas : 0);
  return entreSemana ? contratoSemanalH / 5 : 0;
}
