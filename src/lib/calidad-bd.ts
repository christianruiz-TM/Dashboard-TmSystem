import { agruparPorTipoCampania, type TipoCampania } from "./resultados-actividad";

// ============================================================
// Calidad de la base de datos (decidido con Christian el 21/10/2026): cómo
// acaban los intentos SALIENTES (origin = 2) por su resultado
// (itr_thread.termination_state), como el gráfico «Vista general de los
// intentos» del supervisor de Altitude. Socios el 20/10/2026 cuadra con él
// al número: 825 gestionadas, 64 ocupado, 55 sin respuesta, 45 números
// inválidos.
// Fuera (no son intentos de la base de datos): sin resultado (NULL o -1),
// abandonadas (6), redirigidas (11), canceladas (17) y reencoladas (18). Lo
// filtra el SQL; aquí se ignora cualquier resto de esos estados.
// Puro, con tests.
// ============================================================

export type GrupoResultado = "contacto" | "reintentable" | "no_util" | "rechazo" | "red" | "otro";

export interface DefResultado {
  nombre: string;
  grupo: GrupoResultado;
}

/** termination_state → nombre como en el supervisor de Altitude. */
export const RESULTADOS: Record<number, DefResultado> = {
  1: { nombre: "Gestionadas", grupo: "contacto" },
  4: { nombre: "Sin respuesta", grupo: "reintentable" },
  2: { nombre: "Ocupado", grupo: "reintentable" },
  3: { nombre: "Contestador", grupo: "reintentable" },
  8: { nombre: "Números inválidos", grupo: "no_util" },
  13: { nombre: "Fax", grupo: "no_util" },
  12: { nombre: "Módem", grupo: "no_util" },
  7: { nombre: "Rechazadas", grupo: "rechazo" },
  5: { nombre: "Molestia", grupo: "rechazo" },
  10: { nombre: "Sin líneas troncales disponibles", grupo: "red" },
  9: { nombre: "Desbordadas", grupo: "red" },
  14: { nombre: "Descartadas", grupo: "otro" },
};

/** Orden en pantalla (las claves numéricas de un objeto se recorren de menor a mayor). */
const ORDEN = [1, 4, 2, 3, 8, 13, 12, 7, 5, 10, 9, 14];

/** Estados que no cuentan como intento (los quita también el SQL). */
export const ESTADOS_EXCLUIDOS = [6, 11, 17, 18] as const;

export function nombreResultado(estado: number): string {
  return RESULTADOS[estado]?.nombre ?? "Otros";
}

/** Una fila del SQL: intentos de una campaña, un día y un resultado. */
export interface FilaIntentos {
  campania: string;
  dia: string; // YYYY-MM-DD
  estado: number;
  intentos: number;
}

/** Contactos distintos a los que se llamó, por campaña (para intentos por contacto). */
export interface FilaContactos {
  campania: string;
  contactos: number;
}

export interface CalidadBd {
  intentos: number;
  contactos: number;
  /** Intentos por resultado («Gestionadas», «Ocupado»…). */
  porResultado: { nombre: string; intentos: number; pct: number }[];
  /** Gestionadas ÷ intentos. */
  pctContactable: number | null;
  /** Ocupado + sin respuesta + contestador ÷ intentos: se pueden reintentar. */
  pctReintentable: number | null;
  /** Números inválidos + fax + módem ÷ intentos: números que no sirven. */
  pctNoUtil: number | null;
  /** Rechazadas + molestia ÷ intentos. */
  pctRechazo: number | null;
  /** Sin líneas + desbordadas ÷ intentos: problema de red, no de la base de datos. */
  pctRed: number | null;
  intentosPorContacto: number | null;
}

export interface CalidadCampania extends CalidadBd {
  campania: string;
}

export interface GrupoCalidad {
  nombre: string | null;
  campanias: CalidadCampania[];
  total: CalidadBd;
}

export interface DiaCalidad {
  dia: string;
  intentos: number;
  pctContactable: number | null;
  pctReintentable: number | null;
  pctNoUtil: number | null;
}

export interface ResultadoCalidadBd {
  total: CalidadBd;
  grupos: GrupoCalidad[];
  dias: DiaCalidad[];
}

const excluido = (estado: number) => (ESTADOS_EXCLUIDOS as readonly number[]).includes(estado) || estado < 0;
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);

/** Calidad de un conjunto de filas (sin redondear: el redondeo es de la vista). */
export function calcularCalidad(filas: readonly FilaIntentos[], contactos: number): CalidadBd {
  const porEstado = new Map<number, number>();
  for (const f of filas) {
    if (excluido(f.estado)) continue;
    porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + f.intentos);
  }
  const intentos = [...porEstado.values()].reduce((a, n) => a + n, 0);
  const grupo = (g: GrupoResultado) =>
    [...porEstado.entries()].filter(([e]) => (RESULTADOS[e]?.grupo ?? "otro") === g).reduce((a, [, n]) => a + n, 0);

  // Por nombre (estados sin nombre propio se juntan en «Otros»), en el orden de la leyenda
  const porNombre = new Map<string, number>();
  for (const [e, n] of porEstado) porNombre.set(nombreResultado(e), (porNombre.get(nombreResultado(e)) ?? 0) + n);
  const orden = [...ORDEN.map((e) => RESULTADOS[e].nombre), "Otros"];
  const porResultado = orden
    .filter((nombre) => (porNombre.get(nombre) ?? 0) > 0)
    .map((nombre) => ({ nombre, intentos: porNombre.get(nombre)!, pct: pct(porNombre.get(nombre)!, intentos) ?? 0 }));

  return {
    intentos,
    contactos,
    porResultado,
    pctContactable: pct(grupo("contacto"), intentos),
    pctReintentable: pct(grupo("reintentable"), intentos),
    pctNoUtil: pct(grupo("no_util"), intentos),
    pctRechazo: pct(grupo("rechazo"), intentos),
    pctRed: pct(grupo("red"), intentos),
    intentosPorContacto: contactos > 0 ? intentos / contactos : null,
  };
}

/**
 * Total, campañas agrupadas por tipo (con su total) y evolución por día.
 * Los contactos del total son la SUMA de los de cada campaña: un contacto es
 * de una lista y una lista de una campaña.
 */
export function calidadBaseDatos(
  filas: readonly FilaIntentos[],
  contactos: readonly FilaContactos[],
  tipos: TipoCampania[] = [],
): ResultadoCalidadBd {
  const contactosDe = new Map(contactos.map((c) => [c.campania, c.contactos]));
  const porCampania = new Map<string, FilaIntentos[]>();
  for (const f of filas) porCampania.set(f.campania, [...(porCampania.get(f.campania) ?? []), f]);

  const campanias: CalidadCampania[] = [...porCampania.entries()]
    .map(([campania, fs]) => ({ campania, ...calcularCalidad(fs, contactosDe.get(campania) ?? 0) }))
    .filter((c) => c.intentos > 0)
    .sort((a, b) => b.intentos - a.intentos || a.campania.localeCompare(b.campania));

  const sumaContactos = (cs: readonly CalidadCampania[]) => cs.reduce((a, c) => a + c.contactos, 0);
  const filasDe = (cs: readonly CalidadCampania[]) => {
    const nombres = new Set(cs.map((c) => c.campania));
    return filas.filter((f) => nombres.has(f.campania));
  };

  const grupos = agruparPorTipoCampania(campanias, tipos).map((g) => ({
    nombre: g.nombre,
    campanias: g.filas,
    total: calcularCalidad(filasDe(g.filas), sumaContactos(g.filas)),
  }));

  const porDia = new Map<string, FilaIntentos[]>();
  for (const f of filas) porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), f]);
  const dias = [...porDia.keys()]
    .sort()
    .map((dia) => {
      const c = calcularCalidad(porDia.get(dia)!, 0);
      return { dia, intentos: c.intentos, pctContactable: c.pctContactable, pctReintentable: c.pctReintentable, pctNoUtil: c.pctNoUtil };
    })
    .filter((d) => d.intentos > 0);

  return { total: calcularCalidad(filasDe(campanias), sumaContactos(campanias)), grupos, dias };
}
