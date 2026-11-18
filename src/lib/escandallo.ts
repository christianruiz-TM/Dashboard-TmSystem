import type { UnidadFacturacion } from "@/lib/db/schema";

// ============================================================
// Escandallo: precio por tramos de volumen (18/11/2026, decidido con
// Christian para Ávolo). Puro, sin I/O.
//
// Una línea de tarifa puede llevar, además de su precio, una lista de
// tramos «a partir de N unidades en el mes, X € cada una». Es un escalado
// POR VOLUMEN: TODAS las unidades del mes van al precio del tramo alcanzado
// (con 1.300 finalizados y el tramo de 1.200 a 3,49 €, 1.300 × 3,49), no
// cada tramo a su precio. Por debajo del primer tramo, el precio de la línea.
//
// El volumen es el de TODAS las campañas que facturan con esa línea (la de
// un cliente entero: todas sus campañas), mes natural a mes natural. Lo
// aplica facturarCampanias (lib/facturacion-campania.ts).
// ============================================================

export interface Tramo {
  /** A partir de cuántas unidades en el mes (incluida). */
  desde: number;
  /** € por unidad de TODAS las del mes. */
  precio: number;
}

/**
 * Unidades que admiten tramos: las que se miden día a día (para saber el
 * volumen de cada mes). Las horas logadas, los minutos, los DDIs, los leads
 * recibidos y los cargos puntuales no.
 */
export const UNIDADES_CON_TRAMOS = [
  "leads",
  "exitos_finalizados",
  "encuestas",
  "interacciones",
  "exitos",
] as const satisfies readonly UnidadFacturacion[];

export type UnidadConTramos = (typeof UNIDADES_CON_TRAMOS)[number];

/** Cuántos tramos admite como mucho una línea (filas del formulario de Artículos). */
export const MAX_TRAMOS = 12;

export function admiteTramos(unidad: UnidadFacturacion): unidad is UnidadConTramos {
  return (UNIDADES_CON_TRAMOS as readonly string[]).includes(unidad);
}

/**
 * Tramos válidos y ordenados de menor a mayor a partir de lo que haya en la
 * columna (JSON de SQLite o lo que llegue): descarta lo que no sea un tramo.
 */
export function normalizarTramos(valor: unknown): Tramo[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(
      (t): t is Tramo =>
        typeof t === "object" &&
        t !== null &&
        Number.isFinite((t as Tramo).desde) &&
        Number.isFinite((t as Tramo).precio) &&
        (t as Tramo).desde >= 0 &&
        (t as Tramo).precio >= 0,
    )
    .map((t) => ({ desde: t.desde, precio: t.precio }))
    .sort((a, b) => a.desde - b.desde);
}

/** Motivo por el que unos tramos no valen, o null si valen. */
export function errorTramos(tramos: readonly Tramo[]): string | null {
  for (const t of tramos) {
    if (!Number.isInteger(t.desde) || t.desde < 1) return "Cada tramo empieza en un número entero de unidades, de 1 en adelante.";
    if (!Number.isFinite(t.precio) || t.precio < 0) return "Cada tramo necesita un precio de 0 o más.";
  }
  const desdes = tramos.map((t) => t.desde);
  if (new Set(desdes).size !== desdes.length) return "Hay dos tramos que empiezan en el mismo número de unidades.";
  return null;
}

export interface TramoAplicado {
  /** € por unidad; null si cae por debajo del primer tramo y la línea no tiene precio. */
  precio: number | null;
  /** Desde dónde empieza el tramo aplicado; null = por debajo del primero (precio de la línea). */
  desde: number | null;
  /** El tramo siguiente que aún no se alcanza, o null si ya está en el último. */
  siguiente: Tramo | null;
}

/** Tramo que corresponde a un volumen del mes. */
export function tramoAplicado(volumen: number, precioBase: number | null, tramos: readonly Tramo[]): TramoAplicado {
  const ordenados = [...tramos].sort((a, b) => a.desde - b.desde);
  let aplicado: Tramo | null = null;
  for (const t of ordenados) if (volumen >= t.desde) aplicado = t;
  return {
    precio: aplicado ? aplicado.precio : precioBase,
    desde: aplicado ? aplicado.desde : null,
    siguiente: ordenados.find((t) => t.desde > volumen) ?? null,
  };
}

const num = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 0 });
const eur = (v: number | null) =>
  v == null ? "sin precio" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;

/**
 * Los tramos en llano, del volumen más alto al más bajo, como el escandallo
 * del cliente: «1500 o más: 3,00 € · 1200 a 1499: 3,49 € · … · menos de
 * 600: 4,00 €».
 */
export function textoTramos(precioBase: number | null, tramos: readonly Tramo[]): string[] {
  const ordenados = [...tramos].sort((a, b) => a.desde - b.desde);
  if (ordenados.length === 0) return [];
  const partes = ordenados.map((t, i) => {
    const sig = ordenados[i + 1];
    const rango = sig ? `${num(t.desde)} a ${num(sig.desde - 1)}` : `${num(t.desde)} o más`;
    return `${rango}: ${eur(t.precio)}`;
  });
  partes.unshift(`menos de ${num(ordenados[0].desde)}: ${eur(precioBase)}`);
  return partes.reverse();
}
