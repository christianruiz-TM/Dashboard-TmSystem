import { LRUCache } from "lru-cache";
import { hoyISO } from "@/lib/fechas";
import { guardarConsulta, leerConsultaGuardada, vaciarConsultasGuardadas } from "@/lib/db/cache-consultas";

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
  /** Rangos cerrados que acaban en los últimos 3 días (aún pueden llegar datos): 12 h */
  historico: 12 * 60 * 60_000,
  /**
   * Rangos que acabaron hace más de 3 días (el mes anterior, el periodo con el
   * que compara Dirección): 30 días. Ya no cambian; un despliegue los invalida
   * igual (la versión va en la caché persistente).
   */
  archivo: 30 * 24 * 60 * 60_000,
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
 * Lo más que dura algo en la caché PERSISTENTE: 23 h. Así lo de un día caduca
 * antes de la tarea de las 02:45, que lo vuelve a calcular, y la tabla se
 * queda en lo de un día (~11 MB medido el 13/11/2026). Con los 30 días del
 * archivo se acumulaba: la comparación del mes en curso cambia cada día y la
 * SQLite (y cada backup) crecía ~100 MB.
 */
const MAX_PERSISTENTE_MS = 23 * 60 * 60_000;

/**
 * ¿Se guarda también en la SQLite (`cache_consultas`)? Solo en el servidor del
 * panel (Next pone NEXT_RUNTIME) y en `npm run precalentar` (CACHE_PERSISTENTE=1):
 * los scripts de agregados recorren meses enteros y llenarían la tabla.
 */
function persistente(ttlMs: number): boolean {
  return (ttlMs === TTL.historico || ttlMs === TTL.archivo) && (Boolean(process.env.NEXT_RUNTIME) || process.env.CACHE_PERSISTENTE === "1");
}

/**
 * Ejecuta `fn` con cache por clave. La clave debe incluir todo lo que
 * cambia el resultado: vista + rango + campañas permitidas.
 * Si falla, no se cachea nada y la siguiente llamada reintenta.
 * Con un rango ya cerrado (TTL de histórico o de archivo, 13/11/2026) mira y
 * guarda también la caché persistente de la SQLite, que sobrevive a los
 * reinicios y la llena de madrugada `npm run precalentar`.
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

  const guardar = persistente(ttlMs);
  if (guardar) {
    const guardado = leerConsultaGuardada<T>(clave);
    if (guardado !== undefined) {
      cache.set(clave, guardado, { ttl: ttlMs });
      return guardado;
    }
  }

  const promesa = fn()
    .then((valor) => {
      cache.set(clave, valor, { ttl: ttlMs });
      if (guardar) guardarConsulta(clave, valor, Math.min(ttlMs, MAX_PERSISTENTE_MS));
      return valor;
    })
    .finally(() => enCurso.delete(clave));
  enCurso.set(clave, promesa);
  return promesa;
}

/** Días de `desdeISO` a `hastaISO` (YYYY-MM-DD), sin líos de horario de verano. */
function diasEntre(desdeISO: string, hastaISO: string): number {
  const utc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((utc(hastaISO) - utc(desdeISO)) / 86_400_000);
}

/**
 * TTL adecuado para un rango de fechas: si incluye el día de hoy es dato
 * vivo (5 min); si acabó en los 3 últimos días, histórico (12 h); si acabó
 * antes, archivo (30 días). Los dos últimos se guardan también en la SQLite.
 */
export function ttlSegunRango(hastaISO: string): number {
  // hoyISO() usa la hora LOCAL del servidor, que es la convención del proyecto.
  // Con toISOString() se comparaba contra la fecha UTC y, de madrugada, un
  // rango ya cerrado se cacheaba como si fuese día en curso (5 min en vez de 12 h).
  const hoy = hoyISO();
  if (hastaISO >= hoy) return TTL.diaEnCurso;
  return diasEntre(hastaISO, hoy) > 3 ? TTL.archivo : TTL.historico;
}

/** Vacía la cache, también la persistente (uso en admin/diagnóstico). */
export function vaciarCache(): void {
  cache.clear();
  vaciarConsultasGuardadas();
}
