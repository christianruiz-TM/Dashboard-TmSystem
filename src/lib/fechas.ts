import { addDays, format, startOfMonth, subDays, subMonths } from "date-fns";
import { z } from "zod";

// ============================================================
// Utilidades de fechas. Convención del proyecto: strings
// 'YYYY-MM-DD' en hora local del servidor (hora de España,
// la misma que usa la centralita Altitude).
// ============================================================

export const esquemaFechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, formato YYYY-MM-DD");

/** Rango de fechas validado: ambos inclusive a nivel de día. */
export const esquemaRango = z
  .object({ desde: esquemaFechaISO, hasta: esquemaFechaISO })
  .refine((r) => r.desde <= r.hasta, { message: "El rango de fechas está invertido" });

export type RangoFechas = z.infer<typeof esquemaRango>;

export function hoyISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function ayerISO(): string {
  return format(subDays(new Date(), 1), "yyyy-MM-dd");
}

/** Día siguiente (para el límite superior EXCLUSIVO de los filtros SQL). */
export function diaSiguienteISO(fechaISO: string): string {
  return format(addDays(new Date(`${fechaISO}T00:00:00`), 1), "yyyy-MM-dd");
}

/** Presets de rango para los selectores de las vistas. */
export function presetsRango(): { etiqueta: string; desde: string; hasta: string }[] {
  const hoy = new Date();
  const inicioMes = startOfMonth(hoy);
  const mesAnterior = subMonths(inicioMes, 1);
  const finMesAnterior = subDays(inicioMes, 1);
  return [
    { etiqueta: "Hoy", desde: hoyISO(), hasta: hoyISO() },
    { etiqueta: "Ayer", desde: ayerISO(), hasta: ayerISO() },
    {
      etiqueta: "Últimos 7 días",
      desde: format(subDays(hoy, 6), "yyyy-MM-dd"),
      hasta: hoyISO(),
    },
    {
      etiqueta: "Mes actual",
      desde: format(inicioMes, "yyyy-MM-dd"),
      hasta: hoyISO(),
    },
    {
      etiqueta: "Mes anterior",
      desde: format(mesAnterior, "yyyy-MM-dd"),
      hasta: format(finMesAnterior, "yyyy-MM-dd"),
    },
  ];
}

/** Formato corto para mostrar en UI: 12/06/2026. */
export function fechaCorta(fechaISO: string): string {
  const [a, m, d] = fechaISO.split("-");
  return `${d}/${m}/${a}`;
}

// ------------------------------------------------------------
// Formato de TIEMPOS. Convención del proyecto (decidida 18/09/2026):
//   - Tiempos POR INTERACCIÓN (AHT, conversación, ACW, cola) → segundos.
//   - Tiempos ACUMULADOS (logadas, productivo, pausas)        → horas.
//   - Siempre con 2 decimales FIJOS (192,30 s, no 192,3 s): así las columnas
//     se alinean y cualquier cifra se puede cuadrar con SSMS (duration/10.0
//     son segundos, /36000.0 son horas).
// Antes los tiempos cortos salían como "3m 12s" y, pasada la hora, se
// descartaban los segundos ("1h 30m"), lo que hacía imposible cuadrar totales.
// ------------------------------------------------------------

const DOS_DECIMALES: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/** Segundos → "192,35 s". Para tiempos medios por interacción. */
export function segundosLegibles(segundos: number | null | undefined): string {
  if (segundos == null || Number.isNaN(segundos)) return "—";
  return `${segundos.toLocaleString("es-ES", DOS_DECIMALES)} s`;
}

/** Horas decimales → "1.234,56 h". Para tiempos acumulados. */
export function horasLegibles(horas: number | null | undefined): string {
  if (horas == null || Number.isNaN(horas)) return "—";
  return `${horas.toLocaleString("es-ES", DOS_DECIMALES)} h`;
}

/**
 * Total acumulado que llega en SEGUNDOS (p. ej. pausas o tiempo productivo
 * por agente) → "8,53 h". Se muestra en horas para que esté en la misma
 * unidad que las horas logadas y se puedan comparar y sumar entre sí.
 */
export function horasDesdeSegundos(segundos: number | null | undefined): string {
  if (segundos == null || Number.isNaN(segundos)) return "—";
  return horasLegibles(segundos / 3600);
}
