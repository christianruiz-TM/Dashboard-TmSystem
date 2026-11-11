import { LRUCache } from "lru-cache";
import { hoyISO } from "@/lib/fechas";

// ============================================================
// Cache en memoria con TTL para resultados de RDBv2.
// Evita repetir queries analíticas idénticas mientras varios
// usuarios miran el mismo rango/vista.
// ============================================================

/** TTLs estándar según frescura del dato (en ms). */
export const TTL = {
  /** Supervisión intradía: 60 s */
  supervision: 60_000,
  /** KPIs del día en curso: 5 min */
  diaEnCurso: 5 * 60_000,
  /** Rangos de días ya cerrados: 12 h */
  historico: 12 * 60 * 60_000,
  /** Maestros que casi no cambian (enums, tablas de resultados): 24 h */
  maestros: 24 * 60 * 60_000,
  /**
   * Servicios y campañas: 10 min. Todos los paneles filtran con esa lista,
   * así que con 24 h una campaña creada por la mañana (una tanda nueva de
   * bbdd) no salía en ningún panel hasta el día siguiente (auditoría
   * 11/11/2026). Las dos consultas tardan menos de 0,3 s.
   */
  campanias: 10 * 60_000,
} as const;

const cache = new LRUCache<string, object>({ max: 500, ttl: TTL.diaEnCurso });

/**
 * Consultas EN VUELO por clave. Sin esto, cuando caducaba una entrada y varios
 * supervisores refrescaban a la vez, cada uno lanzaba su propia query idéntica
 * contra RDBv2. Ahora todos esperan a la misma promesa.
 */
const enCurso = new Map<string, Promise<object>>();

/**
 * Ejecuta `fn` con cache por clave. La clave debe incluir todo lo que
 * cambia el resultado: vista + rango + campañas permitidas.
 * Si falla, no se cachea nada y la siguiente llamada reintenta.
 */
export async function conCache<T extends object>(
  clave: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(clave);
  if (hit !== undefined) return hit as T;
  const pendiente = enCurso.get(clave);
  if (pendiente) return pendiente as Promise<T>;

  const promesa = fn()
    .then((valor) => {
      cache.set(clave, valor, { ttl: ttlMs });
      return valor;
    })
    .finally(() => enCurso.delete(clave));
  enCurso.set(clave, promesa);
  return promesa;
}

/**
 * TTL adecuado para un rango de fechas: si incluye el día de hoy es dato
 * vivo (5 min); si todo el rango está cerrado, histórico (12 h).
 */
export function ttlSegunRango(hastaISO: string): number {
  // hoyISO() usa la hora LOCAL del servidor, que es la convención del proyecto.
  // Con toISOString() se comparaba contra la fecha UTC y, de madrugada, un
  // rango ya cerrado se cacheaba como si fuese día en curso (5 min en vez de 12 h).
  return hastaISO >= hoyISO() ? TTL.diaEnCurso : TTL.historico;
}

/** Vacía la cache (uso en admin/diagnóstico). */
export function vaciarCache(): void {
  cache.clear();
}
