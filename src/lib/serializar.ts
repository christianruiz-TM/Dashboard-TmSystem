// ============================================================
// JSON que conserva Map, Set y Date (13/11/2026), para guardar resultados de
// consultas en la caché persistente (`cache_consultas`): algunas devuelven
// Map (horas por servicio) o fechas, que JSON.stringify perdería. Puro, sin
// imports. Un objeto con la clave `__tipo` se marca también, para no
// confundirlo al leer.
// ============================================================

const MARCA = "__tipo";

function reemplazar(this: unknown, clave: string, valor: unknown): unknown {
  // JSON.stringify ya llama a toJSON de las fechas antes de llegar aquí:
  // se mira el valor original en el objeto padre
  const original = (this as Record<string, unknown>)[clave];
  if (original instanceof Date) return { [MARCA]: "Date", v: original.getTime() };
  if (valor instanceof Map) return { [MARCA]: "Map", v: [...valor.entries()] };
  if (valor instanceof Set) return { [MARCA]: "Set", v: [...valor.values()] };
  if (valor && typeof valor === "object" && !Array.isArray(valor) && MARCA in valor) {
    // Como lista de pares: un objeto con la marca dentro volvería a pasar por aquí
    return { [MARCA]: "Objeto", v: Object.entries(valor) };
  }
  return valor;
}

function revivir(_clave: string, valor: unknown): unknown {
  if (valor && typeof valor === "object" && !Array.isArray(valor) && MARCA in valor) {
    const { [MARCA]: tipo, v } = valor as { [MARCA]: string; v: unknown };
    if (tipo === "Date") return new Date(v as number);
    if (tipo === "Map") return new Map(v as [unknown, unknown][]);
    if (tipo === "Set") return new Set(v as unknown[]);
    if (tipo === "Objeto") return Object.fromEntries(v as [string, unknown][]);
  }
  return valor;
}

/** A texto, conservando Map, Set y Date. */
export function serializar(valor: unknown): string {
  return JSON.stringify(valor, reemplazar);
}

/** De vuelta desde `serializar`. */
export function deserializar<T>(texto: string): T {
  return JSON.parse(texto, revivir) as T;
}
