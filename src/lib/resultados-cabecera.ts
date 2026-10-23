import { configsResultados, objetivosDeResultados } from "@/lib/db/resultados";
import { resultadosActividadRango } from "@/lib/rdb/queries/resultados-actividad";
import type { ResultadoResultados } from "@/lib/resultados-actividad";

/**
 * Totales de Resultados (contactos cerrados, regla 18) de un alcance, para las
 * cajas principales de Supervisión y Dirección (22/10/2026): finalizados,
 * aprovechamiento bruto y neto, finalizados por hora y por éxito. La misma
 * consulta (y caché) que la pestaña Resultados. Un mes de todos los clientes
 * tarda 1,7-2,5 s; hoy, 0,7 s. Si falla, null: la página sale igual con «—».
 */
export async function totalResultados(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  /** Prefijo de los usuarios del cliente: solo sus horas van al total. */
  prefijo: string | null = null,
): Promise<ResultadoResultados["total"] | null> {
  try {
    const r = await resultadosActividadRango(
      desdeISO,
      hastaISO,
      campanias,
      configsResultados(),
      objetivosDeResultados(),
      null,
      prefijo,
    );
    return r.total;
  } catch (e) {
    console.error("[resultados] totales para las cajas principales:", e);
    return null;
  }
}
