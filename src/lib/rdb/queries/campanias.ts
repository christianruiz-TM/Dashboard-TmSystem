import { conCache, TTL } from "../cache";
import { obtenerEnums } from "../enums";
import { mockListadoCampanias } from "../mock";
import { esMock, obtenerPool } from "../pool";
import type { CampaniaInfo } from "../types";

/**
 * Maestro de campañas (ph_campaign) con su tipo traducido vía rdb_enums.
 * Cacheado 24 h: cambia poquísimo. Es la fuente del mapeo cliente↔campaña
 * del admin y de los selectores de campaña.
 */
export async function listadoCampanias(): Promise<CampaniaInfo[]> {
  if (esMock()) return mockListadoCampanias();
  return conCache("rdb:campanias", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- Maestro de campañas con tipo (el nombre del tipo se traduce en TS via rdb_enums)
      SELECT
          c.code              AS codigo,
          RTRIM(c.shortname)  AS shortname,
          RTRIM(c.fullname)   AS descripcion,
          c.campaigntype      AS tipoCodigo
      FROM ph_campaign c
      ORDER BY c.shortname;
    `);
    const enums = await obtenerEnums();
    return (r.recordset as { codigo: number; shortname: string; descripcion: string | null; tipoCodigo: number }[]).map(
      (fila) => ({
        codigo: fila.codigo,
        shortname: fila.shortname,
        descripcion: fila.descripcion,
        tipo: enums.CampaignType?.[fila.tipoCodigo] ?? `#${fila.tipoCodigo}`,
      }),
    );
  });
}
