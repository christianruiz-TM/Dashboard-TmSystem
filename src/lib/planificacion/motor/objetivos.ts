import { redondear2 } from "./franjas";
import type { ObjetivoSemana, ParametrosCliente } from "./tipos";

// ============================================================
// Horas objetivo de los clientes salientes (modo `objetivo`). Puro.
//
//   cierresNecesarios = vivos − %objetivo × total
//   horas             = cierres ÷ ritmo (cierres por hora de sesión)
//
// y se reparten por semanas: según la curva del mismo periodo del año
// anterior (si no hay, a partes iguales), a partes iguales, o todo al
// principio. Si el cliente tiene horas fijas por semana (CEFF), ese es el
// tope de cada semana, prorrateado en las semanas incompletas.
// ============================================================

/** Contactos que hay que cerrar para dejar la lista con `pct` % de vivos. */
export function cierresNecesarios(total: number, vivos: number, pctVivosObjetivo: number): number {
  return Math.max(0, vivos - (pctVivosObjetivo / 100) * total);
}

/** Horas para `cierres` al ritmo dado, redondeadas HACIA ARRIBA a la franja. */
export function horasParaCierres(cierres: number, ritmo: number, pasoMin: number): number {
  if (!(ritmo > 0) || !(cierres > 0)) return 0;
  const pasoH = pasoMin / 60;
  return Math.ceil(cierres / ritmo / pasoH - 1e-9) * pasoH;
}

/** Cierres por hora de sesión. null si no hubo horas. */
export function calcularRitmo(cierres: number, horas: number): number | null {
  return horas > 0 ? cierres / horas : null;
}

/**
 * Bolsa por defecto: la del mes anterior prorrateada por días laborables.
 * 1.324 h × 21 / 22 = 1.263,82 h.
 */
export function prorratearBolsa(horasBase: number, laborablesBase: number, laborablesMes: number): number {
  if (!(laborablesBase > 0)) return horasBase;
  return redondear2((horasBase * laborablesMes) / laborablesBase);
}

/**
 * Reparte `total` horas en múltiplos de la franja proporcionalmente a
 * `pesos`, por el método del mayor resto: la suma cuadra exactamente con el
 * total. A igualdad de resto, gana la semana anterior.
 */
export function repartirHoras(total: number, pesos: readonly number[], pasoMin: number): number[] {
  const pasoH = pasoMin / 60;
  const unidades = Math.round(total / pasoH);
  const suma = pesos.reduce((a, p) => a + Math.max(0, p), 0);
  if (unidades <= 0 || suma <= 0) return pesos.map(() => 0);
  const cuotas = pesos.map((p) => (unidades * Math.max(0, p)) / suma);
  const base = cuotas.map((c) => Math.floor(c + 1e-9));
  let resto = unidades - base.reduce((a, b) => a + b, 0);
  const orden = cuotas
    .map((c, i) => ({ i, r: c - base[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    base[i]++;
    resto--;
  }
  return base.map((u) => u * pasoH);
}

export interface SemanaObjetivo {
  lunes: string;
  /** Laborables de la semana dentro del mes y hasta la fecha de fin del cliente. */
  laborables: number;
  /** Días de lunes a viernes de la semana dentro del mes (y hasta el fin). */
  diasEntreSemana: number;
}

export interface DatosObjetivo {
  cliente: string;
  parametros: Pick<ParametrosCliente, "pctVivosObjetivo" | "horasSemanaFijas" | "curva">;
  /** Estado de sus listas (suma de sus campañas). null = sin foto. */
  total: number | null;
  vivos: number | null;
  /** Cierres por hora (medido o manual). null = desconocido. */
  ritmo: number | null;
  ritmoOrigen: "medido" | "manual" | null;
  /** Horas de sus usuarios en la misma semana del año anterior, por lunes del mes. */
  curvaAnterior: Record<string, number> | null;
}

/**
 * Objetivos semanales de un cliente `objetivo`. Devuelve una fila por semana
 * del mes, con el detalle del cálculo (se muestra en /bolsas y en el tooltip).
 */
export function calcularObjetivos(
  datos: DatosObjetivo,
  semanas: readonly SemanaObjetivo[],
  pasoMin: number,
): ObjetivoSemana[] {
  const { pctVivosObjetivo, horasSemanaFijas, curva } = datos.parametros;
  const cierres =
    datos.total != null && datos.vivos != null
      ? cierresNecesarios(datos.total, datos.vivos, pctVivosObjetivo)
      : null;
  const horasLista =
    cierres != null && datos.ritmo != null ? horasParaCierres(cierres, datos.ritmo, pasoMin) : null;

  const comun = {
    total: datos.total,
    vivos: datos.vivos,
    pctVivosObjetivo,
    cierresNecesarios: cierres != null ? redondear2(cierres) : null,
    ritmo: datos.ritmo != null ? redondear2(datos.ritmo) : null,
    ritmoOrigen: datos.ritmoOrigen,
    horasLista,
  };

  let horas: number[];
  let criterio: string;
  if (horasSemanaFijas != null) {
    // Tope semanal prorrateado (hacia arriba a la franja) y, si se conoce, sin
    // pasar de lo que necesita la lista
    const pasoH = pasoMin / 60;
    let quedan = horasLista ?? Infinity;
    horas = semanas.map((s) => {
      const tope = Math.ceil((horasSemanaFijas * s.laborables) / 5 / pasoH - 1e-9) * pasoH;
      const h = Math.max(0, Math.min(tope, quedan));
      quedan -= h;
      return h;
    });
    criterio = `fijas: ${horasSemanaFijas} h/semana`;
  } else if (horasLista == null) {
    horas = semanas.map(() => 0);
    criterio = "sin datos de la lista o del ritmo";
  } else {
    let pesos: number[];
    criterio = curva;
    if (curva === "inicio") {
      const primera = semanas.findIndex((s) => s.laborables > 0);
      pesos = semanas.map((_, i) => (i === primera ? 1 : 0));
    } else {
      const uniformes = semanas.map((s) => s.laborables);
      if (curva === "anio_anterior" && datos.curvaAnterior) {
        // Horas del año anterior en esa semana × la parte de la semana que cae
        // en el mes (1-2/10 son 2 de 5 días)
        pesos = semanas.map((s) =>
          s.laborables > 0 ? (datos.curvaAnterior![s.lunes] ?? 0) * (s.diasEntreSemana / 5) : 0,
        );
        if (pesos.every((p) => p <= 0)) {
          pesos = uniformes;
          criterio = "uniforme (sin curva del año anterior)";
        }
      } else {
        pesos = uniformes;
        criterio = curva === "anio_anterior" ? "uniforme (sin curva del año anterior)" : "uniforme";
      }
    }
    horas = repartirHoras(horasLista, pesos, pasoMin);
  }

  return semanas.map((s, i) => ({
    cliente: datos.cliente,
    semanaLunes: s.lunes,
    horas: horas[i],
    origen: "calculado" as const,
    detalle: { ...comun, criterio, laborables: s.laborables },
  }));
}
