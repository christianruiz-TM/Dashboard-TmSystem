// ============================================================
// Comparador de dos campañas (Dirección y Supervisión, 19/10/2026). Lógica
// PURA: la usan las páginas (servidor) y el componente (navegador). Cada
// panel define sus filas y sus métricas; aquí solo el formato y el criterio.
// ============================================================

export type FormatoMetrica = "entero" | "pct" | "seg" | "horas" | "decimal";

/** Fila de una campaña con sus cifras numéricas (null = sin dato). */
export type FilaComparable = {
  campania: string;
  /** Cliente (servicio) de la campaña; null si no tiene. */
  servicio: string | null;
  /** Tipo de campaña de Altitude (Inbound, Outbound, Blended…). */
  tipo: string | null;
  [clave: string]: string | number | null;
};

export interface MetricaComparable {
  clave: string;
  titulo: string;
  formato: FormatoMetrica;
  /** Qué es mejor, para resaltar; null = es volumen, no hay mejor ni peor. */
  mejor: "alto" | "bajo" | null;
}

export interface SeccionComparable {
  seccion: string;
  metricas: MetricaComparable[];
}

/** Valor numérico de una métrica de la fila (null si no es un número). */
export function valorMetrica(fila: FilaComparable, clave: string): number | null {
  const v = fila[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Formato de una métrica; con `signo`, para una diferencia (+/−). */
export function formatearMetrica(valor: number | null, formato: FormatoMetrica, signo = false): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  const pre = signo && valor > 0 ? "+" : "";
  if (formato === "entero") return pre + Math.round(valor).toLocaleString("es-ES");
  const num = pre + valor.toLocaleString("es-ES", DOS);
  if (formato === "pct") return signo ? `${num} p.p.` : `${num} %`;
  if (formato === "seg") return `${num} s`;
  if (formato === "horas") return `${num} h`;
  return num;
}

/**
 * Cuál de las dos es mejor en una métrica: «a», «b» o null (sin criterio,
 * empate o sin datos).
 */
export function mejorDeDos(a: number | null, b: number | null, mejor: MetricaComparable["mejor"]): "a" | "b" | null {
  if (mejor == null || a == null || b == null || a === b) return null;
  return (mejor === "alto") === a > b ? "a" : "b";
}
