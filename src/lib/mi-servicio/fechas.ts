import { addDays, format, parseISO } from "date-fns";

/** Días de un rango (YYYY-MM-DD), ambos incluidos. */
export function listaFechasRango(desdeISO: string, hastaISO: string): string[] {
  const dias: string[] = [];
  const fin = parseISO(hastaISO);
  for (let d = parseISO(desdeISO); d <= fin; d = addDays(d, 1)) dias.push(format(d, "yyyy-MM-dd"));
  return dias;
}
