// ============================================================
// Orden del selector de clientes (pedido el 21/10/2026): arriba los que
// tienen llamadas en los últimos días, de la más reciente a la más antigua;
// abajo, en otro grupo, los que llevan más tiempo parados. Puro, con tests
// (corre también en el navegador: lo usa SelectorServicio).
// ============================================================

/** Días sin llamadas a partir de los cuales un cliente se da por parado. */
export const DIAS_SIN_ACTIVIDAD = 7;

export interface ServicioOrdenado {
  servicio: string;
  /** 'YYYY-MM-DD HH:mm' de la última llamada (90 días), o null. */
  ultima: string | null;
}

/** Fecha 'YYYY-MM-DD' local de hace `dias` días. */
function haceDias(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ordenarPorActividad(
  servicios: readonly string[],
  actividad: Readonly<Record<string, string | null>>,
  hoy: string,
): { activos: ServicioOrdenado[]; parados: ServicioOrdenado[] } {
  const limite = haceDias(hoy, DIAS_SIN_ACTIVIDAD);
  const filas = servicios.map((servicio) => ({ servicio, ultima: actividad[servicio] ?? null }));
  const reciente = (a: ServicioOrdenado, b: ServicioOrdenado) =>
    (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.servicio.localeCompare(b.servicio);
  return {
    activos: filas.filter((f) => f.ultima != null && f.ultima.slice(0, 10) >= limite).sort(reciente),
    parados: filas.filter((f) => f.ultima == null || f.ultima.slice(0, 10) < limite).sort(reciente),
  };
}

/** «12/10» de 'YYYY-MM-DD HH:mm'. */
export function fechaCortaActividad(ultima: string): string {
  return `${ultima.slice(8, 10)}/${ultima.slice(5, 7)}`;
}
