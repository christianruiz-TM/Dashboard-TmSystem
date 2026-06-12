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

/** Segundos → "1h 23m" o "45s" o "3m 12s". */
export function duracionLegible(segundos: number | null | undefined): string {
  if (segundos == null || Number.isNaN(segundos)) return "—";
  const s = Math.round(segundos);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Horas decimales → "123,5 h". */
export function horasLegibles(horas: number | null | undefined): string {
  if (horas == null || Number.isNaN(horas)) return "—";
  return `${horas.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h`;
}
