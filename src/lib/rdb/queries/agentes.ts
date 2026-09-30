import { conCache, ttlSegunRango } from "../cache";
import { mockHorasAgenteReales, mockRazonesNotReady } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { HorasAgenteReales, RazonNotReady } from "../types";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango, redondear2 } from "./util";

/**
 * Horas REALES de agente (logadas y ready) en un rango, GLOBAL.
 *
 * Por qué no se puede sumar por campaña: Altitude graba el estado Open
 * (op_type 0 = logado) y Ready (op_type 1) UNA FILA POR CADA CAMPAÑA en la
 * que el agente está abierto a la vez. Sumar por campaña multiplica las horas
 * (medido ~×13 en un día real). La hora real de un agente es la UNIÓN de sus
 * intervalos, no la suma. Esta cifra solo tiene sentido global / por agente,
 * nunca atribuida a una campaña concreta.
 *
 * Se calcula con la misma técnica de clústeres de solapamiento (gaps & islands)
 * que las pausas: por agente+op_type se funden los intervalos que se solapan y
 * se suma la duración de cada isla. El SQL de las islas es común con la
 * planificación (islas.ts).
 */
export async function horasAgenteReales(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<HorasAgenteReales> {
  if (esMock()) return mockHorasAgenteReales(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:horasReales:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    // Filtro opcional por servicio (sus campañas): la hora real pasa a ser la
    // de los intervalos abiertos en esas campañas.
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- Unión de intervalos por agente y op_type (0=logado, 1=ready).
      -- Funde solapes en "islas" y suma la duración real de cada isla.
      WITH base AS (
          SELECT l.agent AS agente, l.op_type AS op,
                 l.start_time AS ini,
                 -- duration NULL = evento AÚN ABIERTO (verificado contra la BBDD:
                 -- los días cerrados no tienen ningún NULL; hoy sí). Tratarlo como
                 -- 0 hacía que las sesiones en curso contasen CERO horas, así que
                 -- la cifra de "hoy" se quedaba corta. Se cierra el intervalo en
                 -- el instante actual, sin salirse nunca del rango pedido.
                 ${sqlFinIntervalo("l")} AS fin
          FROM ag_in_cp_log l
          INNER JOIN ph_e_user u ON l.agent = u.code AND u.type = 1
          INNER JOIN ph_campaign c ON l.campaign = c.code
          WHERE l.op_type IN (0, 1)
            AND l.start_time >= @desde AND l.start_time < @hastaExcl${filtro}
      ),
      ${sqlCtesIslas("agente, op")}
      SELECT op,
             SUM(CAST(DATEDIFF(SECOND, ini, fin) AS BIGINT)) / 3600.0 AS horas
      FROM islas
      GROUP BY op;
    `);

    const filas = r.recordset as { op: number; horas: number }[];
    // 2 decimales: con 1 se perdían hasta 3 minutos (0,05 h) por cifra
    const horaDe = (op: number) =>
      redondear2(filas.find((f) => f.op === op)?.horas ?? 0) ?? 0;
    return { horasLogadas: horaDe(0), horasReady: horaDe(1) };
  });
}

/**
 * Tiempo en No Disponible por agente y razón (query 7.8 del doc).
 * Útil en Operaciones para revisar pausas y en Supervisión (rango = hoy).
 */
export async function razonesNotReady(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<RazonNotReady[]> {
  if (esMock()) return mockRazonesNotReady(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:notReady:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- =====================================================================
      -- Tiempo No Disponible por agente y razón (op_type 2 = NotReady).
      -- duration en décimas → segundos = /10.0
      --
      -- PROBLEMA: Altitude registra cada Not Ready UNA VEZ POR CAMPAÑA en la
      -- que el agente está abierto dentro del servicio. Un SUM/COUNT crudo
      -- cuenta el MISMO evento N veces e infla los tiempos. Además hay
      -- solapamientos: el mismo periodo real aparece con start_time algo
      -- distintos (mismo fin) → hay que quedarse con la duración MÍNIMA.
      --
      -- REGLA DE NEGOCIO (validada en SSMS): ante filas solapadas o idénticas
      -- del mismo agente+servicio+motivo, una sola fila por evento real con la
      -- duración mínima. No se suman duraciones ni se cuentan repeticiones.
      --
      -- Solución O(n log n) con window functions (replica v_not_ready_detalle):
      --   base → max_fin_previo → marca de nuevo clúster → grupo_id acumulado
      --   → ganador (menor duración por clúster) → dedup por campaña.
      -- =====================================================================
      WITH
      -- Un único servicio por campaña: cp_general_cfg es 1:N, así el JOIN no
      -- vuelve a multiplicar filas. MIN(service) basta para agrupar.
      camp_serv AS (
          SELECT campaign, MIN(service) AS service
          FROM cp_general_cfg
          GROUP BY campaign
      ),
      base AS (
          SELECT
              RTRIM(u.usr_name)                      AS agente,
              ISNULL(RTRIM(rr.name), 'Sin razón')    AS razon,
              cs.service                             AS servicio,
              l.start_time,
              -- duration NULL = pausa AÚN ABIERTA (verificado: los días cerrados
              -- no tienen NULLs). Contarla como 0 dejaba las pausas en curso a
              -- cero en la vista de hoy; se mide hasta el instante actual.
              -- Se mantiene en DÉCIMAS de segundo (la unidad de la columna).
              CASE
                  WHEN l.duration IS NOT NULL THEN l.duration
                  ELSE CAST(DATEDIFF(SECOND, l.start_time,
                           CASE WHEN GETDATE() < @hastaExcl THEN GETDATE() ELSE @hastaExcl END
                       ) AS BIGINT) * 10
              END                                    AS duration,
              -- fin del intervalo: décimas → segundos = duration / 10
              -- (en segundos para no desbordar el int de DATEADD con durations enormes)
              CASE
                  WHEN l.duration IS NOT NULL
                       THEN DATEADD(SECOND, l.duration / 10, l.start_time)
                  WHEN GETDATE() < @hastaExcl THEN GETDATE()
                  ELSE @hastaExcl
              END AS fin
          FROM ag_in_cp_log l
          INNER JOIN ph_e_user        u  ON l.agent    = u.code AND u.type = 1
          INNER JOIN ph_campaign      c  ON l.campaign = c.code
          INNER JOIN camp_serv        cs ON l.campaign = cs.campaign
          LEFT  JOIN not_ready_reason rr ON l.reason   = rr.code
          WHERE l.op_type = 2
            AND l.start_time >= @desde AND l.start_time < @hastaExcl${filtro}
      ),
      con_max_fin_previo AS (
          SELECT *,
              MAX(fin) OVER (
                  PARTITION BY agente, servicio, razon
                  ORDER BY start_time
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ) AS max_fin_previo
          FROM base
      ),
      con_marca AS (
          SELECT *,
              -- Abre nuevo clúster si no solapa con el mayor fin previo del grupo
              CASE WHEN max_fin_previo IS NULL OR start_time >= max_fin_previo
                   THEN 1 ELSE 0 END AS abre_grupo
          FROM con_max_fin_previo
      ),
      con_grupo AS (
          SELECT *,
              SUM(abre_grupo) OVER (
                  PARTITION BY agente, servicio, razon
                  ORDER BY start_time
                  ROWS UNBOUNDED PRECEDING
              ) AS grupo_id
          FROM con_marca
      ),
      ganador AS (
          -- Por clúster de solapamiento gana la fila de MENOR duración
          SELECT agente, razon, servicio, start_time, duration,
              ROW_NUMBER() OVER (
                  PARTITION BY agente, servicio, razon, grupo_id
                  ORDER BY duration ASC, start_time ASC
              ) AS rn_grupo
          FROM con_grupo
      ),
      dedup AS (
          -- Colapsa duplicados que solo diferían en campaña (mismo servicio)
          SELECT agente, razon, duration,
              ROW_NUMBER() OVER (
                  PARTITION BY agente, servicio, razon, start_time, duration
                  ORDER BY (SELECT NULL)
              ) AS rn_dedup
          FROM ganador
          WHERE rn_grupo = 1
      )
      SELECT
          agente,
          razon,
          COUNT(*)             AS veces,
          SUM(duration) / 10.0 AS segundosTotal
      FROM dedup
      WHERE rn_dedup = 1
      GROUP BY agente, razon
      ORDER BY segundosTotal DESC;
    `);
    return (r.recordset as RazonNotReady[]).map((f) => ({
      ...f,
      segundosTotal: redondear2(f.segundosTotal) ?? 0,
    }));
  });
}
