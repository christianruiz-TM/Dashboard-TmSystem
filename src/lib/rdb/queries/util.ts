import type { Request } from "mssql";
import { sql } from "../pool";

// ============================================================
// Utilidades compartidas por las queries de RDBv2.
// ============================================================

/**
 * Límites de fecha para SQL: desde (incluido) y hasta (EXCLUSIVO, día
 * siguiente al solicitado). Patrón obligatorio del proyecto:
 *   WHERE x.start_time >= @desde AND x.start_time < @hastaExcl
 */
export function limitesRango(desdeISO: string, hastaISO: string): { desde: Date; hastaExcl: Date } {
  const desde = new Date(`${desdeISO}T00:00:00`);
  const hastaExcl = new Date(`${hastaISO}T00:00:00`);
  hastaExcl.setDate(hastaExcl.getDate() + 1);
  return { desde, hastaExcl };
}

/**
 * Añade el filtro opcional de campañas como parámetros (@camp0, @camp1...).
 * Devuelve el fragmento SQL a concatenar (cadena vacía si no hay filtro).
 * Los valores SIEMPRE van parametrizados: nunca concatenar nombres.
 * Nota: ph_campaign.shortname es char(20); la comparación con CHAR ignora
 * los espacios de relleno, no hace falta RTRIM en el WHERE.
 */
export function filtroCampanias(
  request: Request,
  campanias: string[] | undefined,
  columna: string,
): string {
  if (!campanias || campanias.length === 0) return "";
  const marcadores = campanias.map((nombre, i) => {
    request.input(`camp${i}`, sql.VarChar(20), nombre);
    return `@camp${i}`;
  });
  return ` AND ${columna} IN (${marcadores.join(", ")})`;
}

/** Clave de cache estable para un conjunto de campañas (o "todas"). */
export function claveCampanias(campanias?: string[]): string {
  if (!campanias || campanias.length === 0) return "todas";
  return [...campanias].sort().join(",");
}

/** Redondeo a 1 decimal conservando null. */
export function redondear1(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 10) / 10;
}
