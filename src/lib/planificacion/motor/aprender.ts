import { normalizarTramos, rotacionDe, sumarDias } from "./calendario";
import type { Tramo } from "./tipos";

// ============================================================
// «Aprender patrones»: propone el turno A/B de un agente a partir de sus
// sesiones reales (agg_sesion_usuario) de las últimas semanas completas, para
// compararlo con el configurado. Puro: la página de configuración le pasa
// las sesiones y los festivos.
//
// Las sesiones son las de TODOS los usuarios de la persona (GH_0851,
// UGR_0851...) unidas por día: es la hora real del agente (regla 15), no la
// suma por cliente. Una franja cuenta como trabajada un día si tuvo sesión
// al menos `minPresencia` de ella, y entra en el patrón si se trabajó en MÁS
// de `minFrecuencia` de los días válidos de esa rotación. Semanas sin ninguna
// sesión (vacaciones, baja) y festivos del equipo no cuentan.
// ============================================================

export interface SesionDia {
  fecha: string;
  /** Segundos desde las 00:00 de `fecha`. */
  inicioSeg: number;
  finSeg: number;
}

export interface TramoDia extends Tramo {
  /** 0 = lunes … 6 = domingo. */
  diaSemana: number;
}

export interface OpcionesAprender {
  /** Lunes de las semanas completas de la ventana. */
  semanas: readonly string[];
  semanaA: string;
  /** Festivos del calendario del equipo. */
  festivos: ReadonlySet<string>;
  franjas: readonly number[];
  pasoMin: number;
  /** Parte de la franja con sesión para darla por trabajada (por defecto, la mitad). */
  minPresencia?: number;
  /** Entra si se trabajó en MÁS de esta parte de los días válidos (por defecto, la mitad). */
  minFrecuencia?: number;
}

export interface PatronAprendido {
  rotacion: "A" | "B";
  /** Semanas de esa rotación con alguna sesión (las que cuentan). */
  semanas: number;
  tramos: TramoDia[];
  horas: number;
}

/** Une los intervalos de sesión de cada día (dos usuarios logados a la vez cuentan una vez). */
function unirPorDia(sesiones: readonly SesionDia[]): Map<string, [number, number][]> {
  const porDia = new Map<string, [number, number][]>();
  for (const s of sesiones) {
    if (s.finSeg <= s.inicioSeg) continue;
    const lista = porDia.get(s.fecha) ?? [];
    lista.push([s.inicioSeg, s.finSeg]);
    porDia.set(s.fecha, lista);
  }
  for (const [fecha, lista] of porDia) {
    lista.sort((a, b) => a[0] - b[0]);
    const unidos: [number, number][] = [];
    for (const [ini, fin] of lista) {
      const ultimo = unidos[unidos.length - 1];
      if (ultimo && ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin);
      else unidos.push([ini, fin]);
    }
    porDia.set(fecha, unidos);
  }
  return porDia;
}

function segundosDentro(intervalos: readonly [number, number][], desde: number, hasta: number): number {
  let total = 0;
  for (const [ini, fin] of intervalos) {
    const a = Math.max(ini, desde);
    const b = Math.min(fin, hasta);
    if (b > a) total += b - a;
  }
  return total;
}

export function aprenderPatrones(
  sesiones: readonly SesionDia[],
  op: OpcionesAprender,
): Record<"A" | "B", PatronAprendido | null> {
  const minPresencia = op.minPresencia ?? 0.5;
  const minFrecuencia = op.minFrecuencia ?? 0.5;
  const porDia = unirPorDia(sesiones);
  const nF = op.franjas.length;
  const acumulado = {
    A: { semanas: 0, dias: new Array(7).fill(0), presentes: Array.from({ length: 7 }, () => new Array(nF).fill(0)) },
    B: { semanas: 0, dias: new Array(7).fill(0), presentes: Array.from({ length: 7 }, () => new Array(nF).fill(0)) },
  };

  for (const lunes of [...op.semanas].sort()) {
    const fechas = Array.from({ length: 7 }, (_, d) => sumarDias(lunes, d));
    if (!fechas.some((f) => porDia.has(f))) continue; // sin ninguna sesión: vacaciones o baja
    const acc = acumulado[rotacionDe(lunes, op.semanaA)];
    acc.semanas++;
    fechas.forEach((fecha, d) => {
      if (op.festivos.has(fecha)) return;
      acc.dias[d]++;
      const intervalos = porDia.get(fecha) ?? [];
      op.franjas.forEach((f, i) => {
        const dentro = segundosDentro(intervalos, f * 60, (f + op.pasoMin) * 60);
        if (dentro >= minPresencia * op.pasoMin * 60) acc.presentes[d][i]++;
      });
    });
  }

  const construir = (rotacion: "A" | "B"): PatronAprendido | null => {
    const acc = acumulado[rotacion];
    if (acc.semanas === 0) return null;
    const tramos: TramoDia[] = [];
    for (let d = 0; d < 7; d++) {
      if (acc.dias[d] === 0) continue;
      let actual: TramoDia | null = null;
      op.franjas.forEach((f, i) => {
        if (acc.presentes[d][i] / acc.dias[d] <= minFrecuencia) {
          actual = null;
          return;
        }
        if (actual && actual.finMin === f) actual.finMin = f + op.pasoMin;
        else {
          actual = { diaSemana: d, inicioMin: f, finMin: f + op.pasoMin };
          tramos.push(actual);
        }
      });
    }
    const horas = tramos.reduce((a, t) => a + (t.finMin - t.inicioMin), 0) / 60;
    return { rotacion, semanas: acc.semanas, tramos, horas };
  };
  return { A: construir("A"), B: construir("B") };
}

/** Minutos que están en uno de los dos conjuntos de tramos y no en el otro. */
export function minutosDistintos(a: readonly Tramo[], b: readonly Tramo[]): number {
  const na = normalizarTramos(a);
  const nb = normalizarTramos(b);
  const puntos = [...new Set([...na, ...nb].flatMap((t) => [t.inicioMin, t.finMin]))].sort((x, y) => x - y);
  const cubre = (lista: readonly Tramo[], m: number) => lista.some((t) => t.inicioMin <= m && m < t.finMin);
  let total = 0;
  for (let i = 0; i + 1 < puntos.length; i++) {
    if (cubre(na, puntos[i]) !== cubre(nb, puntos[i])) total += puntos[i + 1] - puntos[i];
  }
  return total;
}

export interface ComparacionDia {
  diaSemana: number;
  configurado: Tramo[];
  aprendido: Tramo[];
  /** Minutos distintos ese día. */
  distintos: number;
}

/** Compara día a día un patrón configurado con el aprendido. */
export function compararPatrones(
  configurado: readonly TramoDia[],
  aprendido: readonly TramoDia[],
): { dias: ComparacionDia[]; distintos: number } {
  const dias: ComparacionDia[] = [];
  for (let d = 0; d < 7; d++) {
    const c = normalizarTramos(configurado.filter((t) => t.diaSemana === d));
    const a = normalizarTramos(aprendido.filter((t) => t.diaSemana === d));
    if (c.length === 0 && a.length === 0) continue;
    dias.push({ diaSemana: d, configurado: c, aprendido: a, distintos: minutosDistintos(c, a) });
  }
  return { dias, distintos: dias.reduce((acc, d) => acc + d.distintos, 0) };
}
