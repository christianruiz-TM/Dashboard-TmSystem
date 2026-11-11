import { addDays, format, parseISO } from "date-fns";

// ============================================================
// Qué días agrega `npm run agregados` cuando se lanza sin argumentos (la
// tarea de las 02:00). Puro, con tests.
//
// Antes agregaba solo AYER: si una noche fallaba (RDBv2 o el servidor sin
// responder), ese día se quedaba sin agregar para siempre y las gráficas de
// 12 meses de Dirección salían con un día menos sin avisar. Además, los
// «finalizados» de un día cambian después (un contacto que se reabre y se
// cierra otro día cambia de fecha). Por eso (auditoría 11/11/2026):
// - empieza en el día siguiente al último agregado, para rellenar huecos, y
// - rehace SIEMPRE, como mínimo, los últimos `DIAS_REHACER` días.
// Cada lote reemplaza sus días enteros, así que repetir días no duplica nada.
// ============================================================

/** Días que se rehacen cada noche aunque ya estén agregados. */
export const DIAS_REHACER = 7;

function sumarDias(fechaISO: string, dias: number): string {
  return format(addDays(parseISO(fechaISO), dias), "yyyy-MM-dd");
}

/**
 * Rango [desde, hasta] a agregar sin argumentos. `ultimaFecha` es la última
 * fecha con agregados (null si la tabla está vacía) y `ayer`, el día de ayer
 * en hora local. Hasta es siempre ayer: hoy no ha terminado.
 */
export function rangoAutomaticoAgregados(
  ultimaFecha: string | null,
  ayer: string,
): { desde: string; hasta: string } {
  const ventana = sumarDias(ayer, -(DIAS_REHACER - 1));
  const siguiente = ultimaFecha ? sumarDias(ultimaFecha, 1) : ventana;
  return { desde: siguiente < ventana ? siguiente : ventana, hasta: ayer };
}
