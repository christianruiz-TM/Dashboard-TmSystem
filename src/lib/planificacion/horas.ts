// ============================================================
// Pestaña «Horas» del mes (04/11/2026, pedida por supervisión): horas de
// contrato frente a horas logadas por día, por semana y por mes. Puro: agrupa
// los días que calcula seguimiento.ts::horasMes.
// ============================================================

import { diaCorto, fechaDiaMes } from "./tablero";
import { diaSemana } from "./motor";

export const VISTAS_HORAS = ["dia", "semana", "mes"] as const;
export type VistaHoras = (typeof VISTAS_HORAS)[number];

export interface PeriodoHoras {
  clave: string;
  /** «Lun 03/11», «Sem. 03/11». */
  etiqueta: string;
  /** «5 días», o «1 día» en una semana partida. */
  detalle: string | null;
  fechas: string[];
}

/** Columnas de la tabla: un día, una semana (sus días del mes) o el mes entero. */
export function periodosHoras(
  vista: VistaHoras,
  fechas: readonly string[],
  semanas: readonly { lunes: string; fechas: string[] }[],
): PeriodoHoras[] {
  if (vista === "dia") {
    return fechas.map((f) => ({ clave: f, etiqueta: `${diaCorto(diaSemana(f))} ${fechaDiaMes(f)}`, detalle: null, fechas: [f] }));
  }
  if (vista === "semana") {
    return semanas.map((s) => ({
      clave: s.lunes,
      etiqueta: `Sem. ${fechaDiaMes(s.lunes)}`,
      detalle: s.fechas.length < 7 ? `${s.fechas.length} ${s.fechas.length === 1 ? "día" : "días"} del mes` : null,
      fechas: s.fechas,
    }));
  }
  return [{ clave: "mes", etiqueta: "Mes", detalle: null, fechas: [...fechas] }];
}

export interface DiaHorasLike {
  fecha: string;
  cerrado: boolean;
  contrato: number;
  logadas: number;
}

export interface SumaHoras {
  contrato: number;
  logadas: number;
  /** logadas − contrato. */
  diferencia: number;
  /** Algún día aún no ha pasado: lleva horas planificadas (se pinta en cursiva). */
  previsto: boolean;
  /** Algún día del periodo lleva contrato o tiene horas (si no, la celda va vacía). */
  conDatos: boolean;
}

/** Suma de los días de un periodo. */
export function sumaPeriodo(dias: readonly DiaHorasLike[], fechas: readonly string[]): SumaHoras {
  const delPeriodo = new Set(fechas);
  let contrato = 0;
  let logadas = 0;
  let previsto = false;
  let conDatos = false;
  for (const d of dias) {
    if (!delPeriodo.has(d.fecha)) continue;
    contrato += d.contrato;
    logadas += d.logadas;
    if (d.contrato !== 0 || d.logadas !== 0) {
      conDatos = true;
      if (!d.cerrado) previsto = true;
    }
  }
  return { contrato, logadas, diferencia: logadas - contrato, previsto, conDatos };
}

/** El mes en dos partes: lo que ya ha pasado (hasta ayer) y el mes completo previsto. */
export function resumenMesHoras(dias: readonly DiaHorasLike[]): { real: SumaHoras; previsto: SumaHoras } {
  return {
    real: sumaPeriodo(
      dias.filter((d) => d.cerrado),
      dias.map((d) => d.fecha),
    ),
    previsto: sumaPeriodo(
      dias,
      dias.map((d) => d.fecha),
    ),
  };
}

/** Suma por fecha de varias filas (la fila de total del equipo). */
export function sumarFilas(filas: readonly (readonly DiaHorasLike[])[]): DiaHorasLike[] {
  const porFecha = new Map<string, DiaHorasLike>();
  for (const dias of filas) {
    for (const d of dias) {
      const t = porFecha.get(d.fecha) ?? { fecha: d.fecha, cerrado: d.cerrado, contrato: 0, logadas: 0 };
      t.contrato += d.contrato;
      t.logadas += d.logadas;
      porFecha.set(d.fecha, t);
    }
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
