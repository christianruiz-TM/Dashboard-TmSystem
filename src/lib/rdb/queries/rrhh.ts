import { conCache, TTL, ttlSegunRango } from "../cache";
import { esMock, obtenerPool, sql } from "../pool";
import { hoyISO } from "@/lib/fechas";
import { limitesRango } from "./util";

// ============================================================
// Panel de RRHH (16/11/2026, docs/plan-rrhh.md): las pausas (Not Ready) de
// cada usuario con su HORA, no solo sus totales como `razonesNotReady`.
// ============================================================

/** Una pausa real de un usuario (sin los duplicados por campaña, regla 10). */
export interface PausaUsuario {
  usrName: string;
  /** Día en que empieza (YYYY-MM-DD, hora local). */
  fecha: string;
  /** Segundos desde las 00:00 de `fecha`. El fin puede pasar de 86.400 (sigue al día siguiente). */
  inicioSeg: number;
  finSeg: number;
  /** `not_ready_reason.code` (null = sin motivo). */
  motivoCodigo: number | null;
  /** Nombre del motivo en Altitude, sin espacios al final ('Sin razón' si no tiene). */
  motivo: string;
  /** true = la pausa sigue abierta (se ha cerrado en «ahora»). */
  abierta: boolean;
}

/** Motivo de No Disponible de Altitude (`not_ready_reason`). */
export interface MotivoNoDisponible {
  codigo: number;
  nombre: string;
  /** Columna `type` de Altitude: 1 en los de trabajo (Formacion, Llamada manual...) y 0 en los de descanso. */
  tipo: number;
}

/**
 * Pausas de todos los agentes humanos en el rango, una fila por pausa REAL
 * de cada usuario.
 *
 * Altitude graba cada Not Ready una vez POR CAMPAÑA abierta (regla 10), con
 * el mismo motivo y, a veces, `start_time` algo distintos y el mismo fin.
 * Igual que `razonesNotReady`: por usuario y motivo, las filas que se solapan
 * forman un clúster y gana la de MENOR duración. Aquí no se parte por
 * servicio: el mismo usuario en dos servicios a la vez es la misma pausa.
 * Una pausa abierta (`duration` NULL, regla 10.b) se cierra en «ahora»
 * acotado al rango.
 */
export async function pausasUsuarios(desdeISO: string, hastaISO: string): Promise<PausaUsuario[]> {
  if (esMock()) return [];
  const ttl = hastaISO >= hoyISO() ? TTL.supervision : ttlSegunRango(hastaISO);
  return conCache(`rdb:rrhh:pausas:${desdeISO}:${hastaISO}`, ttl, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const r = await request.query(`
      -- RRHH: pausas (Not Ready) de cada usuario con su hora, sin duplicados
      -- por campaña (regla 10). duration en DÉCIMAS de segundo.
      WITH base AS (
          SELECT l.agent AS usuario, l.reason AS motivo, l.start_time,
                 CASE
                     WHEN l.duration IS NOT NULL THEN CAST(l.duration AS BIGINT)
                     ELSE CAST(DATEDIFF(SECOND, l.start_time,
                              CASE WHEN GETDATE() < @hastaExcl THEN GETDATE() ELSE @hastaExcl END
                          ) AS BIGINT) * 10
                 END AS duracion,
                 CASE
                     WHEN l.duration IS NOT NULL THEN DATEADD(SECOND, l.duration / 10, l.start_time)
                     WHEN GETDATE() < @hastaExcl THEN GETDATE()
                     ELSE @hastaExcl
                 END AS fin,
                 CASE WHEN l.duration IS NULL THEN 1 ELSE 0 END AS abierta
          FROM ag_in_cp_log l
          INNER JOIN ph_e_user u ON u.code = l.agent AND u.type = 1
          WHERE l.op_type = 2
            AND l.start_time >= @desde AND l.start_time < @hastaExcl
      ),
      con_max_fin_previo AS (
          SELECT *,
              MAX(fin) OVER (
                  PARTITION BY usuario, motivo
                  ORDER BY start_time
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ) AS max_fin_previo
          FROM base
      ),
      con_grupo AS (
          SELECT *,
              SUM(CASE WHEN max_fin_previo IS NULL OR start_time >= max_fin_previo THEN 1 ELSE 0 END) OVER (
                  PARTITION BY usuario, motivo
                  ORDER BY start_time
                  ROWS UNBOUNDED PRECEDING
              ) AS grupo_id
          FROM con_max_fin_previo
      ),
      ganador AS (
          -- Por clúster de solapamiento gana la fila de MENOR duración
          SELECT *,
              ROW_NUMBER() OVER (
                  PARTITION BY usuario, motivo, grupo_id
                  ORDER BY duracion ASC, start_time ASC
              ) AS rn
          FROM con_grupo
      )
      SELECT RTRIM(u.usr_name)                                                         AS usrName,
             CONVERT(varchar(10), g.start_time, 23)                                    AS fecha,
             DATEDIFF(SECOND, CAST(CAST(g.start_time AS date) AS datetime), g.start_time) AS inicioSeg,
             DATEDIFF(SECOND, CAST(CAST(g.start_time AS date) AS datetime), g.start_time)
                 + g.duracion / 10                                                     AS finSeg,
             g.motivo                                                                  AS motivoCodigo,
             ISNULL(RTRIM(rr.name), 'Sin razón')                                       AS motivo,
             g.abierta                                                                 AS abierta
      FROM ganador g
      INNER JOIN ph_e_user u ON u.code = g.usuario
      LEFT  JOIN not_ready_reason rr ON rr.code = g.motivo
      WHERE g.rn = 1
      ORDER BY usrName, g.start_time
      OPTION (RECOMPILE);
    `);
    return (r.recordset as (Omit<PausaUsuario, "abierta"> & { abierta: number })[]).map((f) => ({
      ...f,
      inicioSeg: Number(f.inicioSeg),
      finSeg: Number(f.finSeg),
      motivoCodigo: f.motivoCodigo == null ? null : Number(f.motivoCodigo),
      abierta: Number(f.abierta) === 1,
    }));
  });
}

/** Catálogo de motivos de No Disponible (cambia muy poco: caché de 24 h). */
export async function motivosNoDisponible(): Promise<MotivoNoDisponible[]> {
  if (esMock()) return [];
  return conCache("rdb:rrhh:motivos", 24 * 60 * 60_000, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- RRHH: catálogo de motivos de No Disponible
      SELECT code AS codigo, RTRIM(name) AS nombre, type AS tipo
      FROM not_ready_reason
      ORDER BY code;
    `);
    return (r.recordset as MotivoNoDisponible[]).map((m) => ({ ...m, codigo: Number(m.codigo), tipo: Number(m.tipo) }));
  });
}
