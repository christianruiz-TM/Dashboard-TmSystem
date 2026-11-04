// ============================================================
// Orden alfabético común de las vistas (04/11/2026, decidido con Christian):
// agentes por su usuario de Altitude y campañas por su nombre, sin
// distinguir mayúsculas ni tildes y con los números en su orden
// («Bol_0365» antes que «Bol_1200», «gh_bbdd» junto a «GH_…»). Puro.
// ============================================================

const COLACION = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Compara dos textos como un listado en español. */
export function compararTexto(a: string, b: string): number {
  return COLACION.compare(a, b);
}

/** Copia de `lista` ordenada por el texto que da `clave`. */
export function ordenarPorTexto<T>(lista: readonly T[], clave: (x: T) => string): T[] {
  return [...lista].sort((a, b) => compararTexto(clave(a), clave(b)));
}

export type ValorOrden = string | number | null | undefined;

/**
 * Compara dos valores de una columna: textos como un listado, números de
 * menor a mayor; los vacíos (null, «—») siempre al final, se ordene como se
 * ordene (lo decide quien llama con `desc`).
 */
export function compararValores(a: ValorOrden, b: ValorOrden, desc = false): number {
  const vacioA = a == null || (typeof a === "number" && Number.isNaN(a));
  const vacioB = b == null || (typeof b === "number" && Number.isNaN(b));
  if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1;
  const c = typeof a === "number" && typeof b === "number" ? a - b : compararTexto(String(a), String(b));
  return desc ? -c : c;
}

/**
 * Valores de una fila para `data-orden` (components/tabla-ordenable.tsx), en
 * el orden de sus columnas. Aquí y no en el componente: lo llaman también los
 * componentes de servidor.
 */
export function valoresOrden(...valores: ValorOrden[]): string {
  return JSON.stringify(valores.map((v) => (v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? null : v)));
}
