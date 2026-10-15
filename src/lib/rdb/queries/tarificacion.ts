import { conCache, ttlSegunRango } from "../cache";
import { mockMinutosLinea } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { MinutosLineaFila } from "../types";
import { claveCampanias, filtroCampanias, limitesRango } from "./util";

// ============================================================
// Tarificación telefónica: minutos de línea con el cliente por campaña y
// prefijo del número marcado. Es lo que el Excel de facturación de
// operaciones cobra como «tarificación fija» y «móvil» (verificado contra
// «facturacion cerrada» de septiembre 2026: móvil 8.843,50 min frente a
// 8.842,38, 31 de 33 campañas exactas; fijo 39,06 min, exacto).
//
// Dos fuentes, siempre segmentos CONECTADOS (state 6) de hilos atendidos:
//  - saliente: hilo de agente humano (type 1) con origin = 2.
//  - ivr: hilo de un puerto IVR (type 3) que empieza DESPUÉS de un hilo de
//    agente en la misma llamada (itr_global): es la encuesta NFS tras la
//    gestión. La línea con el cliente sigue abierta, así que se cobra igual,
//    y va a la campaña de ese agente (el Excel usaba una tabla de hunt
//    groups a mano; con el hilo hermano sale lo mismo).
//
// El número es itr_global.to_address con el account code delante: 4 dígitos
// en GH (7101 + 600036838) y 2 en otros clientes. Se toman los 9 últimos
// dígitos y de ahí el prefijo de 3 (la clasificación móvil/fijo/especial es
// pura, en lib/tarificacion.ts). Un destino de menos de 9 caracteres es un
// hunt group (llamada entrante: la paga quien llama) o una extensión
// interna; uno de más de 13, internacional o raro: se enseñan, no se cobran.
// Duraciones en DÉCIMAS de segundo → / 600.0 = minutos.
// ============================================================

export async function minutosLineaPorCampania(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<MinutosLineaFila[]> {
  if (esMock()) return mockMinutosLinea(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:minutosLinea:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      WITH linea AS (
          -- Salientes atendidas de agente humano
          SELECT t.campaign, t.code AS hilo, g.to_address AS destino,
                 s.duration, 'saliente' AS fuente
          FROM itr_thread t
          INNER JOIN itr_global  g ON g.code = t.itr_global
          INNER JOIN itr_segment s ON s.itr_thread = t.code AND s.state = 6
          INNER JOIN ph_e_user   u ON u.code = t.e_user AND u.type = 1
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND t.origin = 2 AND t.termination_state = 1
          UNION ALL
          -- IVR tras un agente en la misma llamada (encuesta): campaña del agente
          SELECT ag.campaign, t.code, g.to_address, s.duration, 'ivr'
          FROM itr_thread t
          INNER JOIN itr_global  g ON g.code = t.itr_global
          INNER JOIN itr_segment s ON s.itr_thread = t.code AND s.state = 6
          INNER JOIN ph_e_user   u ON u.code = t.e_user AND u.type = 3
          CROSS APPLY (
              SELECT TOP 1 h.campaign
              FROM itr_thread h
              INNER JOIN ph_e_user uh ON uh.code = h.e_user AND uh.type = 1
              WHERE h.itr_global = t.itr_global AND h.start_time < t.start_time
              ORDER BY h.start_time DESC
          ) ag
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND t.termination_state = 1
      ),
      clasif AS (
          SELECT campaign, hilo, duration, fuente,
                 CASE WHEN LEN(destino) < 9  THEN 'corto'
                      WHEN LEN(destino) > 13 THEN 'largo'
                      ELSE 'nacional' END AS formato,
                 CASE WHEN LEN(destino) BETWEEN 9 AND 13
                      THEN LEFT(RIGHT(destino, 9), 3) END AS prefijo
          FROM (SELECT campaign, hilo, duration, fuente,
                       LTRIM(RTRIM(ISNULL(destino, ''))) AS destino
                FROM linea) l
      )
      SELECT RTRIM(c.shortname)                        AS campania,
             x.fuente,
             x.formato,
             x.prefijo,
             COUNT(DISTINCT x.hilo)                    AS llamadas,
             SUM(CAST(x.duration AS BIGINT)) / 600.0   AS minutos
      FROM clasif x
      INNER JOIN ph_campaign c ON c.code = x.campaign
      WHERE 1 = 1${filtro}
      GROUP BY RTRIM(c.shortname), x.fuente, x.formato, x.prefijo;
    `);
    return r.recordset as MinutosLineaFila[];
  });
}
