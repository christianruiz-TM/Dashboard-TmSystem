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
 * Devuelve el fragmento SQL a concatenar:
 * - `undefined` = sin filtro (todas las campañas): cadena vacía.
 * - `[]` = NINGUNA campaña: `AND 1 = 0`. Antes una lista vacía significaba
 *   «todas» y un cliente con solo campañas IVR (o filtrado a nada) enseñaba
 *   las cifras de TODOS los clientes con su nombre encima (auditoría 11/11/2026).
 * Los valores SIEMPRE van parametrizados: nunca concatenar nombres.
 * Nota: ph_campaign.shortname es char(20); la comparación con CHAR ignora
 * los espacios de relleno, no hace falta RTRIM en el WHERE.
 */
export function filtroCampanias(
  request: Request,
  campanias: string[] | undefined,
  columna: string,
): string {
  if (!campanias) return "";
  if (campanias.length === 0) return " AND 1 = 0";
  const marcadores = campanias.map((nombre, i) => {
    request.input(`camp${i}`, sql.VarChar(20), nombre);
    return `@camp${i}`;
  });
  return ` AND ${columna} IN (${marcadores.join(", ")})`;
}

/** Clave de cache estable para un conjunto de campañas («todas» o «ninguna»). */
export function claveCampanias(campanias?: string[]): string {
  if (!campanias) return "todas";
  if (campanias.length === 0) return "ninguna";
  return [...campanias].sort().join(",");
}

/** Redondeo a 1 decimal conservando null. Solo para magnitudes que no son tiempo. */
export function redondear1(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 10) / 10;
}

/**
 * Redondeo a 2 decimales conservando null. Es la precisión de TODAS las
 * métricas de tiempo (segundos y horas).
 *
 * REGLA: redondear solo el valor FINAL que se entrega, nunca un parcial que
 * luego se vaya a sumar. Redondear cada día o cada campaña y después sumar
 * acumula el error y es justo lo que hace que los totales no cuadren.
 */
export function redondear2(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 100) / 100;
}

// ------------------------------------------------------------
// Preparación de una llamada manual (decidido 22/10/2026 con Christian).
// Cuando el agente llama a mano, Altitude graba DOS hilos salientes en dos
// itr_global seguidos: el del agente cogiendo el contacto y abriendo la
// ficha (sin número de destino, ~36 s, «gestionado», sin conversación ni
// ACW) y la llamada de verdad al número. Socios 21/10/2026: 1.180 hilos
// salientes = 577 con número (el informe «Socios_General» de Altitude, uno
// a uno) + 603 sin número; 873 «gestionadas» = 334 llamadas + 539
// preparaciones. Bolsas, ese día: 1.822 de 2.834. La preparación NO es una
// llamada: fuera de interacciones, llamadas gestionadas, intentos y
// medias por llamada (AHT, Talk, ACW). Su tiempo SÍ es trabajo del agente:
// sigue en el tiempo y las horas productivas.
//
// Tampoco son llamadas (decidido 05/11/2026 con Christian, al cuadrar CEFF
// del 04/11 con el informe «CEFF_General» de Altitude):
// - Los EMAILS (`media_type` 2): las agentes los envían desde el guion y
//   Altitude los graba como hilos salientes «gestionados» con la dirección
//   de correo de destino. CEFF 04/11: 55 «llamadas gestionadas» = 47
//   llamadas + 8 emails; Ávolo, 818 emails del 01/09 al 04/11. Van aparte
//   («Emails» en las tablas de Supervisión).
// - Las ENTRANTES RECHAZADAS (`origin = 1`, estado 7): el tramo de una
//   llamada del IVR que pasa a una campaña sin agentes y esta rechaza. La
//   llamada cuenta UNA vez, en la campaña de IVR (como en el informe). Desde
//   el 01/09 todas (Ávolo 938, GH 952, TMSYSTEM 50, CEFF 33) tenían el hilo
//   del IVR en la misma itr_global. Contaban como recibidas sin ser ni
//   gestionadas ni abandonadas, y bajaban el % de abandono.
// - Las ENTRANTES DESBORDADAS (`origin = 1`, estado 9, Overflow), por lo
//   mismo: también son el tramo de una llamada del IVR (desde el 01/09, todas
//   con su hilo del IVR: GH 1.361, Ávolo 19, TMSYSTEM 2).
// Planificación no usa esta condición para las entrantes: allí las
// rechazadas van aparte a propósito (demanda de Ávolo sin nadie conectado).
// ------------------------------------------------------------

/** JOIN de itr_global para las condiciones de abajo (LEFT: un hilo sin global sigue contando). */
export function sqlJoinGlobal(t = "t", g = "g"): string {
  return `LEFT JOIN itr_global ${g} ON ${g}.code = ${t}.itr_global`;
}

/** El hilo es la PREPARACIÓN de una llamada manual: saliente de telefonía sin número de destino. */
export function sqlPreparacion(t = "t", g = "g"): string {
  return `(${t}.origin = 2 AND ISNULL(${t}.media_type, 1) = 1 AND NULLIF(LTRIM(RTRIM(${g}.to_address)), '') IS NULL)`;
}

/** El hilo es un EMAIL (o cualquier medio que no sea telefonía): no es una llamada. */
export function sqlEmail(t = "t"): string {
  return `(ISNULL(${t}.media_type, 1) <> 1)`;
}

/**
 * El hilo es una LLAMADA: de telefonía, no es una preparación (saliente sin
 * número) ni el tramo rechazado o desbordado de una entrante del IVR
 * (estados 7 y 9).
 */
export function sqlLlamada(t = "t", g = "g"): string {
  return (
    `(ISNULL(${t}.media_type, 1) = 1` +
    ` AND (ISNULL(${t}.origin, 0) <> 1 OR ISNULL(${t}.termination_state, -1) NOT IN (7, 9))` +
    ` AND (ISNULL(${t}.origin, 0) <> 2 OR NULLIF(LTRIM(RTRIM(${g}.to_address)), '') IS NOT NULL))`
  );
}
