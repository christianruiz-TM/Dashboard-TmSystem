import { rangoCorto } from "./franjas";
import type { BloqueBasico } from "./tipos";

// ============================================================
// Diferencias entre dos versiones del plan, por TRAMOS de tiempo y no por
// bloques: dividir un bloque o unir dos no es un cambio (las celdas siguen
// igual), y mover UGR 11-14 de una agente a otra son dos cambios, uno en
// cada fila. Se compara agente y día a agente y día sobre los puntos de
// corte de las dos versiones, así que vale para cualquier paso (1 h o
// 30 min) y para bloques de minutos sueltos.
//
//   «0851 07/10 11-14: UGR → GH»
// ============================================================

export interface CambioPlan {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  /** Cliente antes y después; null = sin bloque (hueco). */
  antes: string | null;
  despues: string | null;
}

/** Cliente de cada tramo elemental [puntos[i], puntos[i+1]). Si dos bloques se solapan, el primero por hora. */
function clientePorTramo(bloques: readonly BloqueBasico[], puntos: readonly number[]): (string | null)[] {
  const orden = [...bloques].sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  return puntos.slice(0, -1).map((p) => orden.find((b) => b.inicioMin <= p && p < b.finMin)?.clienteCodigo ?? null);
}

/**
 * Cambios de `antes` a `despues`, agrupados en tramos contiguos con el mismo
 * par (antes → después). Ordenados por fecha, agente y hora.
 */
export function diffPlanes(antes: readonly BloqueBasico[], despues: readonly BloqueBasico[]): CambioPlan[] {
  const grupos = new Map<string, { antes: BloqueBasico[]; despues: BloqueBasico[] }>();
  const grupo = (b: BloqueBasico) => {
    const k = `${b.fecha}|${b.agenteNumero}`;
    let g = grupos.get(k);
    if (!g) {
      g = { antes: [], despues: [] };
      grupos.set(k, g);
    }
    return g;
  };
  for (const b of antes) grupo(b).antes.push(b);
  for (const b of despues) grupo(b).despues.push(b);

  const cambios: CambioPlan[] = [];
  for (const k of [...grupos.keys()].sort()) {
    const [fecha, agenteNumero] = k.split("|");
    const g = grupos.get(k)!;
    const puntos = [
      ...new Set([...g.antes, ...g.despues].flatMap((b) => [b.inicioMin, b.finMin])),
    ].sort((a, b) => a - b);
    const ca = clientePorTramo(g.antes, puntos);
    const cd = clientePorTramo(g.despues, puntos);
    let actual: CambioPlan | null = null;
    for (let i = 0; i < puntos.length - 1; i++) {
      if (ca[i] === cd[i]) {
        actual = null;
        continue;
      }
      if (actual && actual.antes === ca[i] && actual.despues === cd[i] && actual.finMin === puntos[i]) {
        actual.finMin = puntos[i + 1];
        continue;
      }
      actual = { agenteNumero, fecha, inicioMin: puntos[i], finMin: puntos[i + 1], antes: ca[i], despues: cd[i] };
      cambios.push(actual);
    }
  }
  return cambios;
}

/** Horas que gana (+) o pierde (−) cada cliente con los cambios. Sin los que quedan a 0. */
export function balanceCambios(cambios: readonly CambioPlan[]): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const c of cambios) {
    const h = (c.finMin - c.inicioMin) / 60;
    if (c.antes) balance[c.antes] = (balance[c.antes] ?? 0) - h;
    if (c.despues) balance[c.despues] = (balance[c.despues] ?? 0) + h;
  }
  for (const [k, v] of Object.entries(balance)) if (Math.abs(v) < 1e-9) delete balance[k];
  return balance;
}

/** «0851 Lourdes 07/10 11-14: UGR → GH» («libre» = sin bloque). */
export function textoCambio(c: CambioPlan, nombre?: string): string {
  const quien = nombre ? `${c.agenteNumero} ${nombre}` : c.agenteNumero;
  const dia = `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`;
  return `${quien} ${dia} ${rangoCorto(c.inicioMin, c.finMin)}: ${c.antes ?? "libre"} → ${c.despues ?? "libre"}`;
}
