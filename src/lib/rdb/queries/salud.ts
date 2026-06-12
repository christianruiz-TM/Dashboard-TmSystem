import { mockSalud } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { SaludRdb } from "../types";

/**
 * Diagnóstico de la conexión a RDBv2 para el panel de admin:
 * latencia, frescura de la replicación (itr_thread) y de las flats.
 * Sin cache: cada visita al panel comprueba el estado real.
 */
export async function saludRdb(): Promise<SaludRdb> {
  if (esMock()) return mockSalud();
  const inicio = Date.now();
  try {
    const pool = await obtenerPool();
    const request = pool.request();
    // Frescura limitada a los últimos 7 días para no escanear la tabla entera
    request.input("desde", sql.DateTime, new Date(Date.now() - 7 * 24 * 3600_000));
    const r = await request.query(`
      -- Frescura de replicación y flats (acotado a 7 días por rendimiento)
      SELECT
          (SELECT MAX(t.start_time) FROM itr_thread t WHERE t.start_time >= @desde)        AS ultimaInteraccion,
          (SELECT MAX(f.StartMoment) FROM flat_agent_login f WHERE f.StartMoment >= @desde) AS ultimaFlat;
    `);
    const fila = r.recordset[0] as { ultimaInteraccion: Date | null; ultimaFlat: Date | null };
    return {
      conectado: true,
      mock: false,
      latenciaMs: Date.now() - inicio,
      ultimaInteraccion: fila.ultimaInteraccion?.toISOString() ?? null,
      ultimaFlat: fila.ultimaFlat?.toISOString() ?? null,
      error: null,
    };
  } catch (err) {
    return {
      conectado: false,
      mock: false,
      latenciaMs: null,
      ultimaInteraccion: null,
      ultimaFlat: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
