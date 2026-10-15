import type { MinutosLineaFila } from "@/lib/rdb/types";

// ============================================================
// Tarificación telefónica (puro, sin I/O): clasifica los minutos de línea de
// queries/tarificacion.ts por tipo de número, como el Excel de facturación de
// operaciones («Tarif_Tipo»), con el plan de numeración español.
//
// Decidido 14/10/2026 con Christian:
//  - móvil y fijo se cobran (unidades minutos_movil y minutos_fijo);
//  - especiales (901-909, 803-807, 70x): se presupuestan desde comercial, así
//    que se enseñan pero no se cobran solos (hace años que no se llaman);
//  - sin coste (800, 900): ni se cobran ni cuentan;
//  - entrantes (hunt group), extensiones internas e internacionales/raros: se
//    enseñan aparte, no se cobran.
// ============================================================

export const TIPOS_LINEA = ["movil", "fijo", "especial", "sin_coste", "sin_numero", "otro"] as const;
export type TipoLinea = (typeof TIPOS_LINEA)[number];

export const NOMBRE_TIPO_LINEA: Record<TipoLinea, string> = {
  movil: "Móvil",
  fijo: "Fijo",
  especial: "Especial (901, 902, 80x, 70x)",
  sin_coste: "Sin coste (800, 900)",
  sin_numero: "Entrante o extensión interna",
  otro: "Internacional u otro formato",
};

/** Tipo de un número nacional por sus 3 primeras cifras. */
export function clasificarPrefijo(prefijo: string): TipoLinea {
  if (!/^\d{3}$/.test(prefijo)) return "otro";
  if (prefijo === "800" || prefijo === "900") return "sin_coste";
  if (/^90[1-9]$/.test(prefijo) || /^80[3-9]$/.test(prefijo) || /^70\d$/.test(prefijo)) return "especial";
  if (/^6\d\d$/.test(prefijo) || /^7[1-4]\d$/.test(prefijo)) return "movil";
  if (/^[89]\d\d$/.test(prefijo)) return "fijo";
  return "otro";
}

/** Tipo de una fila de minutos de línea según su formato y prefijo. */
export function tipoDeFila(fila: Pick<MinutosLineaFila, "formato" | "prefijo">): TipoLinea {
  if (fila.formato === "corto") return "sin_numero";
  if (fila.formato === "largo" || fila.prefijo == null) return "otro";
  return clasificarPrefijo(fila.prefijo);
}

export interface TarificacionCampania {
  campania: string;
  /** Minutos por tipo de línea, SIN redondear (se redondea al facturar). */
  minutos: Record<TipoLinea, number>;
  llamadas: Record<TipoLinea, number>;
  /** De los minutos de móvil y fijo, los de IVR tras el agente (encuesta NFS). */
  minutosEncuesta: number;
}

function porTipo(): Record<TipoLinea, number> {
  return { movil: 0, fijo: 0, especial: 0, sin_coste: 0, sin_numero: 0, otro: 0 };
}

/** Suma las filas por campaña y tipo de línea. */
export function tarificacionPorCampania(filas: readonly MinutosLineaFila[]): Map<string, TarificacionCampania> {
  const mapa = new Map<string, TarificacionCampania>();
  for (const f of filas) {
    let t = mapa.get(f.campania);
    if (!t) {
      t = { campania: f.campania, minutos: porTipo(), llamadas: porTipo(), minutosEncuesta: 0 };
      mapa.set(f.campania, t);
    }
    const tipo = tipoDeFila(f);
    t.minutos[tipo] += f.minutos;
    t.llamadas[tipo] += f.llamadas;
    if (f.fuente === "ivr" && (tipo === "movil" || tipo === "fijo")) t.minutosEncuesta += f.minutos;
  }
  return mapa;
}
