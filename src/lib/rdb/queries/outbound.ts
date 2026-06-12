import { conCache, ttlSegunRango } from "../cache";
import { mockPenetracionListas } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { PenetracionLista } from "../types";
import { claveCampanias, filtroCampanias, limitesRango, redondear1 } from "./util";

/**
 * Penetración de listas outbound por campaña (query 7.7 del doc de
 * referencia): contactos totales, terminados, éxitos y pendientes.
 * business_status: 9/10 = Success · 11/12 = Unsuccessful · 1/2/3 = sin contacto útil
 */
export async function penetracionListas(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<PenetracionLista[]> {
  if (esMock()) return mockPenetracionListas(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:listas:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- Penetración de listas outbound por campaña y lista
      SELECT
          RTRIM(c.shortname)                                              AS campania,
          RTRIM(al.name)                                                  AS lista,
          COUNT(a.code)                                                   AS totalContactos,
          SUM(CASE WHEN a.status = 3                  THEN 1 ELSE 0 END)  AS done,
          SUM(CASE WHEN a.business_status IN (9, 10)  THEN 1 ELSE 0 END)  AS exitos,
          SUM(CASE WHEN a.business_status IN (11, 12) THEN 1 ELSE 0 END)  AS sinExito,
          SUM(CASE WHEN a.business_status IN (1, 2, 3) THEN 1 ELSE 0 END) AS sinContacto,
          AVG(CAST(a.ntries_auto AS FLOAT))                               AS intentosAutoMedio
      FROM activity a
      INNER JOIN ph_campaign      c  ON a.campaign = c.code
      INNER JOIN ph_activity_list al ON a.act_list = al.code
      WHERE a.moment >= @desde AND a.moment < @hastaExcl${filtro}
      GROUP BY RTRIM(c.shortname), RTRIM(al.name)
      ORDER BY campania, lista;
    `);
    return (r.recordset as PenetracionLista[]).map((f) => ({
      ...f,
      intentosAutoMedio: redondear1(f.intentosAutoMedio),
    }));
  });
}
