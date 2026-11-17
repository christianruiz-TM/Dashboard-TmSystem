// ============================================================
// Panel de RRHH, vista «Por agente» (16/11/2026, pedido por Christian): de
// un periodo (día, semana, mes o intervalo), por persona, el tiempo
// conectado y el tiempo ausente, desplegable por motivo con su tiempo
// acumulado y el número de veces. Puro: sin I/O.
//
// - Tiempo ausente = SOLO las pausas con motivo de ausencia (decidido con
//   Christian: aquí no entra lo que no estuvo conectada dentro de su
//   horario). Salen del mismo cálculo del día (dia.ts), así que cuadran con
//   la vista del día: sin duplicados por campaña ni por usuario, y sin
//   «Hasta ponerse disponible».
// - Aparte, sin sumar: las ausencias apuntadas (VAC, IT...), con sus días de
//   jornada completa y sus horas.
// ============================================================

import type { AusenciaPersona, DiaPersona } from "./dia";

export interface MotivoPeriodo {
  motivo: string;
  veces: number;
  minutos: number;
}

export interface ApuntadaPeriodo {
  tipoCodigo: string;
  tipoNombre: string;
  color: string;
  computaComoTrabajada: boolean;
  /** Ausencias distintas (filas) que tocan el periodo. */
  veces: number;
  /** Días de jornada completa dentro del periodo. */
  dias: number;
  /** Horas de las ausencias de unas horas dentro del periodo. */
  horas: number;
}

export interface ResumenPeriodoPersona {
  /** Días con alguna conexión. */
  diasConectada: number;
  conectadaMin: number;
  /** Pausas que son ausencia (la suma de `motivos`). */
  ausenteMin: number;
  /** Número de pausas que son ausencia. */
  ausencias: number;
  /** Por motivo, de más a menos tiempo. */
  motivos: MotivoPeriodo[];
}

/** Suma motivos (por nombre) y ordena de más a menos tiempo. */
function sumarMotivos(listas: Iterable<readonly MotivoPeriodo[]>): MotivoPeriodo[] {
  const motivos = new Map<string, MotivoPeriodo>();
  for (const lista of listas) {
    for (const m of lista) {
      const r = motivos.get(m.motivo) ?? { motivo: m.motivo, veces: 0, minutos: 0 };
      r.veces += m.veces;
      r.minutos += m.minutos;
      motivos.set(m.motivo, r);
    }
  }
  return [...motivos.values()].sort((a, b) => b.minutos - a.minutos || a.motivo.localeCompare(b.motivo, "es"));
}

function resumen(diasConectada: number, conectadaMin: number, motivos: MotivoPeriodo[]): ResumenPeriodoPersona {
  return {
    diasConectada,
    conectadaMin,
    ausenteMin: motivos.reduce((s, m) => s + m.minutos, 0),
    ausencias: motivos.reduce((s, m) => s + m.veces, 0),
    motivos,
  };
}

/** Junta los días de una persona en el periodo (solo los motivos que son ausencia). */
export function acumularPeriodo(dias: readonly DiaPersona[]): ResumenPeriodoPersona {
  return resumen(
    dias.filter((d) => d.conectadaMin > 0).length,
    dias.reduce((s, d) => s + d.conectadaMin, 0),
    sumarMotivos(dias.map((d) => d.porMotivo.filter((m) => m.categoria === "ausencia"))),
  );
}

/** Totales del equipo en el periodo (fila de total). */
export function totalesPeriodo(personas: readonly ResumenPeriodoPersona[]): ResumenPeriodoPersona {
  return resumen(
    personas.reduce((s, p) => s + p.diasConectada, 0),
    personas.reduce((s, p) => s + p.conectadaMin, 0),
    sumarMotivos(personas.map((p) => p.motivos)),
  );
}

/** Días naturales entre dos fechas YYYY-MM-DD, las dos incluidas (0 si no se cruzan). */
function diasEntre(desde: string, hasta: string): number {
  if (hasta < desde) return 0;
  const dia = (f: string) => {
    const [a, m, d] = f.split("-").map(Number);
    return Date.UTC(a, m - 1, d) / 86_400_000;
  };
  return dia(hasta) - dia(desde) + 1;
}

/** Ausencias apuntadas de una persona que tocan el periodo, por tipo. */
export function resumenApuntadas(
  ausencias: readonly (Omit<AusenciaPersona, "notas"> & { desde: string; hasta: string })[],
  desde: string,
  hasta: string,
): ApuntadaPeriodo[] {
  const porTipo = new Map<string, ApuntadaPeriodo>();
  for (const a of ausencias) {
    const ini = a.desde > desde ? a.desde : desde;
    const fin = a.hasta < hasta ? a.hasta : hasta;
    const dias = diasEntre(ini, fin);
    if (dias === 0) continue;
    const r = porTipo.get(a.tipoCodigo) ?? {
      tipoCodigo: a.tipoCodigo,
      tipoNombre: a.tipoNombre,
      color: a.color,
      computaComoTrabajada: a.computaComoTrabajada,
      veces: 0,
      dias: 0,
      horas: 0,
    };
    r.veces += 1;
    if (a.inicioMin == null) r.dias += dias;
    else r.horas += (dias * ((a.finMin ?? 1440) - a.inicioMin)) / 60;
    porTipo.set(a.tipoCodigo, r);
  }
  return [...porTipo.values()].sort((a, b) => a.tipoCodigo.localeCompare(b.tipoCodigo, "es"));
}
