import type { Tramo } from "./tipos";

// ============================================================
// Utilidades de franjas y formato. Sin dependencias: las usan el motor,
// las validaciones y (en F2) el tablero en el navegador.
// ============================================================

/** inicioMin de cada franja del día: [inicioDia, finDia) en pasos de pasoMin. */
export function generarFranjas(inicioDiaMin: number, finDiaMin: number, pasoMin: number): number[] {
  if (pasoMin <= 0 || 1440 % pasoMin !== 0) throw new Error(`Paso no válido: ${pasoMin} min`);
  const franjas: number[] = [];
  for (let m = inicioDiaMin; m + pasoMin <= finDiaMin; m += pasoMin) franjas.push(m);
  return franjas;
}

/** ¿La franja [inicio, inicio + paso) cae ENTERA dentro de alguno de los tramos? */
export function franjaDentro(inicioMin: number, pasoMin: number, tramos: readonly Tramo[]): boolean {
  const fin = inicioMin + pasoMin;
  return tramos.some((t) => t.inicioMin <= inicioMin && fin <= t.finMin);
}

/** ¿Se solapan dos intervalos [a, b) y [c, d)? */
export function solapan(a: Tramo, b: Tramo): boolean {
  return a.inicioMin < b.finMin && b.inicioMin < a.finMin;
}

/** Minutos de [inicio, fin) que caen fuera de los tramos (tramos sin solapes entre sí). */
export function minutosFuera(inicioMin: number, finMin: number, tramos: readonly Tramo[]): number {
  let dentro = 0;
  for (const t of tramos) {
    const i = Math.max(inicioMin, t.inicioMin);
    const f = Math.min(finMin, t.finMin);
    if (f > i) dentro += f - i;
  }
  return finMin - inicioMin - dentro;
}

/** 540 → "9", 570 → "9:30". Como en la plantilla de supervisión («GH 9-14»). */
export function horaCorta(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
}

/** 660, 840 → "11-14". */
export function rangoCorto(inicioMin: number, finMin: number): string {
  return `${horaCorta(inicioMin)}-${horaCorta(finMin)}`;
}

/** 540 → "09:00". */
export function horaLarga(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Horas con 2 decimales fijos y coma decimal: «70,00 h». Misma convención que
 * horasLegibles() de lib/fechas.ts, que el motor no puede importar.
 */
export function horasTexto(horas: number): string {
  return `${horas.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

/** Redondeo a 2 decimales. Solo para el valor FINAL que se muestra. */
export function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
