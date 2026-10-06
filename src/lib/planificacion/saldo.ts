// ============================================================
// Saldo de horas de cada agente (el «+1 / −1» de la plantilla). PURO.
//
// Por día:  saldo = trabajadas + justificadas − contrato del día
//   - trabajadas: en los días CERRADOS, lo logado de verdad (user_log, todos
//     sus usuarios: la persona); en los que quedan, lo planificado (saldo
//     previsto, como el del tablero);
//   - justificadas: horas de su turno que cubre una ausencia que cuenta como
//     trabajada (VAC, FEST, RTO...), fuera de festivos;
//   - contrato del día: contrato semanal ÷ 5 cada laborable (de lunes a
//     viernes sin festivos del equipo), igual que el prorrateo del tablero.
// Los ajustes manuales (con motivo) se suman el día al que se imputan.
// ============================================================

export interface DiaParaSaldo {
  fecha: string;
  laborable: boolean;
  festivo: boolean;
}

export interface DatosSaldoAgente {
  contratoSemanalH: number | null;
  /** Último día cerrado: hasta él cuenta lo logado; después, lo planificado. */
  fechaDatos: string;
  dias: readonly DiaParaSaldo[];
  /** fecha → horas planificadas. */
  planH: Readonly<Record<string, number>>;
  /** fecha → horas logadas (solo días cerrados). */
  realH: Readonly<Record<string, number>>;
  /** fecha → horas justificadas por ausencias que cuentan como trabajadas. */
  justificadasH: Readonly<Record<string, number>>;
  /** fecha → suma de ajustes manuales (±). */
  ajustesH: Readonly<Record<string, number>>;
}

export interface DiaSaldo {
  fecha: string;
  cerrado: boolean;
  trabajadas: number;
  justificadas: number;
  contrato: number;
  ajustes: number;
  saldo: number;
}

export interface TotalesSaldo {
  /** Hasta el último día cerrado: lo que de verdad lleva. */
  real: { trabajadas: number; justificadas: number; contrato: number; ajustes: number; saldo: number };
  /** Hasta el último día del rango: lo real más lo previsto de lo que queda. */
  previsto: { trabajadas: number; justificadas: number; contrato: number; ajustes: number; saldo: number };
}

const vacio = () => ({ trabajadas: 0, justificadas: 0, contrato: 0, ajustes: 0, saldo: 0 });

/** Saldo de un agente día a día en el rango de `dias`. null sin contrato. */
export function saldoAgente(d: DatosSaldoAgente): { dias: DiaSaldo[]; totales: TotalesSaldo } | null {
  if (d.contratoSemanalH == null) return null;
  const totales: TotalesSaldo = { real: vacio(), previsto: vacio() };
  const dias = d.dias.map((dia): DiaSaldo => {
    const cerrado = dia.fecha <= d.fechaDatos;
    const trabajadas = cerrado ? (d.realH[dia.fecha] ?? 0) : (d.planH[dia.fecha] ?? 0);
    const justificadas = dia.festivo ? 0 : (d.justificadasH[dia.fecha] ?? 0);
    const contrato = dia.laborable ? d.contratoSemanalH! / 5 : 0;
    const ajustes = d.ajustesH[dia.fecha] ?? 0;
    const fila = { fecha: dia.fecha, cerrado, trabajadas, justificadas, contrato, ajustes, saldo: trabajadas + justificadas - contrato + ajustes };
    for (const t of cerrado ? [totales.real, totales.previsto] : [totales.previsto]) {
      t.trabajadas += trabajadas;
      t.justificadas += justificadas;
      t.contrato += contrato;
      t.ajustes += ajustes;
      t.saldo += fila.saldo;
    }
    return fila;
  });
  return { dias, totales };
}

/**
 * Horas de `turno` que cubren unas ausencias (minutos desde las 00:00), sin
 * contar dos veces lo que se solapa.
 */
export function horasCubiertas(
  turno: readonly { inicioMin: number; finMin: number }[],
  ausencias: readonly { inicioMin: number; finMin: number }[],
): number {
  let min = 0;
  for (const t of turno) {
    const trozos = ausencias
      .map((a) => ({ i: Math.max(t.inicioMin, a.inicioMin), f: Math.min(t.finMin, a.finMin) }))
      .filter((x) => x.f > x.i)
      .sort((a, b) => a.i - b.i);
    let hasta = -1;
    for (const x of trozos) {
      const i = Math.max(x.i, hasta);
      if (x.f > i) min += x.f - i;
      hasta = Math.max(hasta, x.f);
    }
  }
  return min / 60;
}
