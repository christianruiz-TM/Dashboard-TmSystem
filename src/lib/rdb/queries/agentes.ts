import { conCache, ttlSegunRango } from "../cache";
import { mockRazonesNotReady } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { RazonNotReady } from "../types";
import { limitesRango } from "./util";

/**
 * Tiempo en No Disponible por agente y razón (query 7.8 del doc).
 * Útil en Operaciones para revisar pausas y en Supervisión (rango = hoy).
 */
export async function razonesNotReady(
  desdeISO: string,
  hastaISO: string,
): Promise<RazonNotReady[]> {
  if (esMock()) return mockRazonesNotReady(desdeISO, hastaISO);
  const claveCache = `rdb:notReady:${desdeISO}:${hastaISO}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);

    const r = await request.query(`
      -- Tiempo No Disponible por agente y razón (op_type 2 = NotReady)
      -- duration en décimas → segundos = /10.0
      SELECT
          RTRIM(u.usr_name)                       AS agente,
          ISNULL(RTRIM(r.name), 'Sin razón')      AS razon,
          COUNT(*)                                AS veces,
          SUM(ISNULL(l.duration, 0)) / 10.0       AS segundosTotal
      FROM ag_in_cp_log l
      INNER JOIN ph_e_user        u ON l.agent  = u.code AND u.type = 1
      LEFT  JOIN not_ready_reason r ON l.reason = r.code
      WHERE l.op_type = 2
        AND l.start_time >= @desde AND l.start_time < @hastaExcl
      GROUP BY RTRIM(u.usr_name), ISNULL(RTRIM(r.name), 'Sin razón')
      ORDER BY segundosTotal DESC;
    `);
    return (r.recordset as RazonNotReady[]).map((f) => ({
      ...f,
      segundosTotal: Math.round(f.segundosTotal),
    }));
  });
}
