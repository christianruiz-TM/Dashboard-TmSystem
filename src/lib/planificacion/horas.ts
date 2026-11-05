// ============================================================
// Pestaña «Horas» del mes (pedida por supervisión el 04/11/2026; panel con
// planificadas, efectivas y contrato desde el 05/11). Puro: agrupa por día,
// semana o mes los días que calcula seguimiento.ts::horasMes.
//
//   - Contrato: su parte del contrato semanal cada día (motor/contrato.ts).
//   - Planificadas: las del plan vigente, todo el periodo.
//   - Efectivas: las logadas de verdad, solo de los días que ya han pasado.
// Mientras el periodo no ha acabado, las efectivas se comparan con lo
// planificado HASTA AYER (si no, todo el mundo «iría corto»).
// ============================================================

import { fechaDiaMes } from "./tablero";
import { diaSemana } from "./motor";

export const VISTAS_HORAS = ["dia", "semana", "mes"] as const;
export type VistaHoras = (typeof VISTAS_HORAS)[number];

export interface PeriodoHoras {
  /** La fecha (día), el lunes (semana) o «mes». Va en la URL (`?p=`). */
  clave: string;
  /** «Lunes 03/11», «Semana 02/11–08/11», «Mes». */
  etiqueta: string;
  fechas: string[];
}

const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Los periodos del mes: cada día, cada semana (sus días del mes) o el mes entero. */
export function periodosHoras(
  vista: VistaHoras,
  fechas: readonly string[],
  semanas: readonly { lunes: string; fechas: string[] }[],
): PeriodoHoras[] {
  if (vista === "dia") {
    return fechas.map((f) => ({ clave: f, etiqueta: `${DIAS_LARGOS[diaSemana(f)]} ${fechaDiaMes(f)}`, fechas: [f] }));
  }
  if (vista === "semana") {
    return semanas.map((s) => ({
      clave: s.lunes,
      etiqueta: `Semana ${fechaDiaMes(s.fechas[0])}–${fechaDiaMes(s.fechas[s.fechas.length - 1])}`,
      fechas: s.fechas,
    }));
  }
  return [{ clave: "mes", etiqueta: "Mes", fechas: [...fechas] }];
}

/** El que se abre si la URL no dice otro: el que contiene hoy; si el mes ya pasó, el último; si no ha empezado, el primero. */
export function periodoInicial(periodos: readonly PeriodoHoras[], hoy: string): PeriodoHoras {
  return (
    periodos.find((p) => p.fechas.includes(hoy)) ??
    (periodos.length > 0 && periodos[periodos.length - 1].fechas.at(-1)! < hoy ? periodos[periodos.length - 1] : periodos[0])
  );
}

export interface DiaHorasLike {
  fecha: string;
  cerrado: boolean;
  contrato: number;
  planificadas: number;
  /** null = el día no ha pasado. */
  efectivas: number | null;
}

export interface ResumenHoras {
  contrato: number;
  planificadas: number;
  /** Solo de los días que ya han pasado. */
  efectivas: number;
  /** Lo planificado de los días que ya han pasado: con lo que se comparan las efectivas. */
  planificadasHastaAyer: number;
  contratoHastaAyer: number;
  /** efectivas − planificadas hasta ayer. */
  diferencia: number;
  /** Todos sus días han pasado. */
  terminado: boolean;
  /** Algún día ya ha pasado (si no, aún no hay efectivas). */
  empezado: boolean;
  /** Hay contrato, plan o horas (si no, la fila no dice nada). */
  conDatos: boolean;
}

/** Las tres cifras de un periodo. */
export function resumenHoras(dias: readonly DiaHorasLike[], fechas: readonly string[]): ResumenHoras {
  const delPeriodo = new Set(fechas);
  const r: ResumenHoras = {
    contrato: 0,
    planificadas: 0,
    efectivas: 0,
    planificadasHastaAyer: 0,
    contratoHastaAyer: 0,
    diferencia: 0,
    terminado: true,
    empezado: false,
    conDatos: false,
  };
  for (const d of dias) {
    if (!delPeriodo.has(d.fecha)) continue;
    r.contrato += d.contrato;
    r.planificadas += d.planificadas;
    if (d.cerrado) {
      r.empezado = true;
      r.efectivas += d.efectivas ?? 0;
      r.planificadasHastaAyer += d.planificadas;
      r.contratoHastaAyer += d.contrato;
    } else {
      r.terminado = false;
    }
    if (d.contrato !== 0 || d.planificadas !== 0 || (d.efectivas ?? 0) !== 0) r.conDatos = true;
  }
  r.diferencia = r.efectivas - r.planificadasHastaAyer;
  return r;
}

/** Fondo común de las barras: la cifra más alta de todas las filas (así se comparan entre sí). */
export function escalaHoras(resumenes: readonly Pick<ResumenHoras, "contrato" | "planificadas" | "efectivas">[]): number {
  return Math.max(1, ...resumenes.map((r) => Math.max(r.contrato, r.planificadas, r.efectivas)));
}

/** Suma por fecha de varias filas (el total del equipo). */
export function sumarFilas(filas: readonly (readonly DiaHorasLike[])[]): DiaHorasLike[] {
  const porFecha = new Map<string, DiaHorasLike>();
  for (const dias of filas) {
    for (const d of dias) {
      const t = porFecha.get(d.fecha) ?? { fecha: d.fecha, cerrado: d.cerrado, contrato: 0, planificadas: 0, efectivas: d.cerrado ? 0 : null };
      t.contrato += d.contrato;
      t.planificadas += d.planificadas;
      if (t.efectivas != null) t.efectivas += d.efectivas ?? 0;
      porFecha.set(d.fecha, t);
    }
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

