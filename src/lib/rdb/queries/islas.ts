// ============================================================
// Generador común de «islas» (gaps & islands) sobre ag_in_cp_log.
//
// Altitude graba cada estado (op_type 0 = sesión, 1 = ready...) UNA FILA POR
// CADA CAMPAÑA abierta a la vez, así que el tiempo real de un agente es la
// UNIÓN de sus intervalos, no la suma (regla 11 de CLAUDE.md). La técnica:
// por partición, se ordena por inicio, se compara con el mayor fin previo y
// cada vez que un intervalo no solapa se abre una isla nueva.
//
// Lo usan horasAgenteReales (agentes.ts, partición agente+op) y
// islasSesionUsuario (planificacion.ts, partición usuario). Cambiar aquí
// cambia las dos: antes y después, `npm run verificar` debe dar lo mismo.
// ============================================================

/**
 * Fin de un intervalo de ag_in_cp_log (alias de tabla `alias`).
 * duration en DÉCIMAS de segundo → DATEADD(SECOND, duration / 10, ...).
 * duration NULL = evento AÚN ABIERTO (regla 10.b): se cierra en el instante
 * actual, sin salirse nunca del rango pedido (@hastaExcl).
 */
export function sqlFinIntervalo(alias: string): string {
  return `CASE
                     WHEN ${alias}.duration IS NOT NULL
                          THEN DATEADD(SECOND, ${alias}.duration / 10, ${alias}.start_time)
                     WHEN GETDATE() < @hastaExcl THEN GETDATE()
                     ELSE @hastaExcl
                 END`;
}

/**
 * CTEs que convierten un CTE `base` con columnas (<particion>, ini, fin) en
 * un CTE `islas` con (<particion>, gid, ini, fin): una fila por isla.
 * `particion` es la lista de columnas de base que separan las islas
 * (p. ej. "agente, op"). Se concatena detrás de `WITH base AS (...),`.
 */
export function sqlCtesIslas(particion: string): string {
  return `max_fin_previo AS (
          SELECT *,
              MAX(fin) OVER (
                  PARTITION BY ${particion} ORDER BY ini
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ) AS maxfin
          FROM base
      ),
      marca AS (
          SELECT *,
              CASE WHEN maxfin IS NULL OR ini >= maxfin THEN 1 ELSE 0 END AS abre
          FROM max_fin_previo
      ),
      grupo AS (
          SELECT *,
              SUM(abre) OVER (
                  PARTITION BY ${particion} ORDER BY ini ROWS UNBOUNDED PRECEDING
              ) AS gid
          FROM marca
      ),
      islas AS (
          SELECT ${particion}, gid, MIN(ini) AS ini,
                 -- Guarda anti-desfase de reloj: el fin nunca antes del inicio
                 CASE WHEN MAX(fin) < MIN(ini) THEN MIN(ini) ELSE MAX(fin) END AS fin
          FROM grupo
          GROUP BY ${particion}, gid
      )`;
}
