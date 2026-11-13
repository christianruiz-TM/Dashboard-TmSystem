import { conCache, ttlSegunRango } from "../cache";
import { mockBaseRatiosExito, mockMetricasDiarias } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import { listaFechasRango } from "@/lib/mi-servicio/fechas";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango, sqlLlamadasPorGlobal } from "./util";

// ============================================================
// Consultas propias de «Mi servicio» (06/11/2026). Las cifras salen de las
// MISMAS fuentes que las cajas de Supervisión y Dirección, solo que por día:
//  - llamadas: la Q4 de baseRatiosCore (caja «Llamadas»), por día y campaña;
//  - horas logadas: la Q3 (user_log, unión de sesiones por usuario), con
//    cada tramo en el día en que EMPIEZA, para que la suma de los días sea
//    exactamente la caja (un tramo que pasa de medianoche no se parte).
// `ttlMs`: caché propia (60 s cuando el rango llega a hoy).
// ============================================================

export interface LlamadasDiaCampania {
  fecha: string;
  campania: string;
  llamadas: number;
}

/**
 * TODAS las llamadas por día y campaña, una por itr_global en la campaña
 * de su último tramo (la condición de la caja «Llamadas»,
 * sqlLlamadasPorGlobal). Las del IVR nunca: «Mi servicio» no las incluye.
 * Suman la caja «Llamadas».
 */
export async function llamadasDiaCampania(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
  ttlMs?: number,
): Promise<LlamadasDiaCampania[]> {
  if (esMock()) {
    return mockMetricasDiarias(desdeISO, hastaISO, campanias).map((m) => ({
      fecha: m.fecha,
      campania: m.campania,
      llamadas: m.interacciones,
    }));
  }
  return conCache(
    `rdb:miServicio:llamadas:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}${ttlMs ? `:t${ttlMs}` : ""}`,
    ttlMs ?? ttlSegunRango(hastaISO),
    async () => {
      const pool = await obtenerPool();
      const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
      const request = pool.request();
      request.input("desde", sql.DateTime, desde);
      request.input("hastaExcl", sql.DateTime, hastaExcl);
      const filtro = filtroCampanias(request, campanias, "c.shortname");
      // Día en hora local de la centralita (regla 14)
      const r = await request.query(`-- Mi servicio: llamadas por día${sqlLlamadasPorGlobal(filtro, true)}`);
      return r.recordset as LlamadasDiaCampania[];
    },
  );
}

export interface HorasUsuarioDia {
  agente: string;
  fecha: string;
  horas: number;
}

/**
 * Horas logadas (user_log) por usuario y día, de TODOS los usuarios de
 * agente: la misma unión de sesiones que la caja «Horas logadas» (Q3 de
 * baseRatiosCore), con cada tramo en el día en que empieza. Quién cuenta
 * (los agentes del cliente) lo decide quien llama, igual que la caja.
 */
export async function horasLogadasDia(desdeISO: string, hastaISO: string, ttlMs?: number): Promise<HorasUsuarioDia[]> {
  if (esMock()) {
    return listaFechasRango(desdeISO, hastaISO).flatMap((fecha) =>
      mockBaseRatiosExito(fecha, fecha).horasLogadas.map((h) => ({ agente: h.agente, fecha, horas: h.horas })),
    );
  }
  return conCache(
    `rdb:miServicio:horasDia:${desdeISO}:${hastaISO}${ttlMs ? `:t${ttlMs}` : ""}`,
    ttlMs ?? ttlSegunRango(hastaISO),
    async () => {
      const pool = await obtenerPool();
      const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
      const request = pool.request();
      request.input("desde", sql.DateTime, desde);
      request.input("hastaExcl", sql.DateTime, hastaExcl);
      const r = await request.query(`
        WITH base AS (
            SELECT l.e_user AS usuario, l.start_time AS ini,
                   ${sqlFinIntervalo("l")} AS fin
            FROM user_log l
            INNER JOIN ph_e_user u ON u.code = l.e_user AND u.type = 1
            WHERE l.start_time >= @desde AND l.start_time < @hastaExcl
        ),
        ${sqlCtesIslas("usuario")}
        SELECT RTRIM(u.usr_name) AS agente,
               CONVERT(varchar(10), i.ini, 23) AS fecha,
               SUM(CAST(DATEDIFF(SECOND, i.ini, i.fin) AS BIGINT)) / 3600.0 AS horas
        FROM islas i
        INNER JOIN ph_e_user u ON u.code = i.usuario
        GROUP BY RTRIM(u.usr_name), CONVERT(varchar(10), i.ini, 23);
      `);
      return (r.recordset as HorasUsuarioDia[]).map((f) => ({ ...f, horas: Number(f.horas) }));
    },
  );
}
