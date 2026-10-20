import type { UnidadFacturacion } from "@/lib/db/schema";
import { ARTICULO_GS, ORDEN_UNIDADES, type FilaFactura } from "@/lib/facturacion-campania";

// ============================================================
// Fichero de albaranes para GS (puro, sin I/O). Mismo formato que el que
// operaciones sacaba del Excel de facturación («guardar como texto
// tabulado»), según los ejemplos de septiembre 2026 que pasó Christian:
//
//   Cod Camp<TAB>Horas Logadas<TAB>Tarif Fija<TAB>Tarif Movil<TAB>Ddis
//   0002330<TAB>34,47<TAB>0,00<TAB>360,17<TAB>24
//
// Dos ficheros por cliente y mes: «ventas» (horas logadas) y «promociones»
// (las bbdd: contactos finalizados). Cantidades, no importes: los precios
// los pone GS. Horas y minutos con coma y 2 decimales fijos, sin separador
// de miles; contactos y DDIs, enteros. Sin BOM y con CRLF, como un .txt de
// Excel en Windows (las cabeceras van sin tildes).
//
// Artículos nuevos (19/10/2026): si el cliente tiene en su tarifa otro
// artículo de GS (o hay cantidad en el cierre), va en una columna más,
// detrás de las de siempre (CABECERA_EXTRA_GS). Sin ninguno, el fichero es
// el mismo de antes, byte a byte.
// ============================================================

export type TipoFicheroGs = "ventas" | "promociones";

export const CABECERA_GS: Record<TipoFicheroGs, string[]> = {
  ventas: ["Cod Camp", "Horas Logadas", "Tarif Fija", "Tarif Movil", "Ddis"],
  promociones: ["Cod Camp", "Contactos Finalizados", "Tarif Fija", "Tarif Movil", "Ddis"],
};

export interface FilaGs {
  codigoGs: string;
  /** Horas logadas (ventas) o contactos finalizados (promociones). */
  principal: number;
  minutosFijo: number;
  minutosMovil: number;
  ddis: number;
  /** Cantidades de los artículos de las columnas añadidas (unidadesExtraGs). */
  extras: Partial<Record<UnidadFacturacion, number>>;
}

/** Unidades de las columnas de siempre de cada fichero. */
const UNIDADES_BASE_GS: Record<TipoFicheroGs, readonly UnidadFacturacion[]> = {
  ventas: ["horas_logadas", "minutos_fijo", "minutos_movil", "ddi"],
  promociones: ["leads", "minutos_fijo", "minutos_movil", "ddi"],
};

/**
 * Cabecera de la columna de cada artículo que no está en las de siempre, en
 * el estilo de las de GS (sin tildes). Comprobar con GS antes del primer
 * fichero que las lleve: las de siempre salen de sus ejemplos; estas, no.
 */
export const CABECERA_EXTRA_GS: Partial<Record<UnidadFacturacion, string>> = {
  base_datos: "Base Datos",
  encuestas: "Encuestas",
  horas_logadas: "Horas Logadas",
  horas: "Horas Productivas",
  preparacion: "Preparacion Campana",
  minutos_especial: "Tarif 90X",
  ddi_movil: "Ddis Movil",
  leads_recibidos: "Leads Externas",
  exitos_finalizados: "Contactos Exito",
  leads: "Contactos Finalizados",
};

/** Unidades que se escriben con 2 decimales; el resto, enteras. */
const DECIMALES_GS: ReadonlySet<UnidadFacturacion> = new Set<UnidadFacturacion>([
  "horas_logadas",
  "horas",
  "minutos_fijo",
  "minutos_movil",
  "minutos_especial",
  "base_datos",
  "preparacion",
]);

/**
 * Columnas añadidas de un fichero: los artículos de GS que no van en las de
 * siempre y que el cliente tiene en su tarifa (`configuradas`) o que tienen
 * cantidad en alguna fila del fichero. En el orden de los artículos.
 */
export function unidadesExtraGs(
  filas: readonly FilaFactura[],
  tipo: TipoFicheroGs,
  configuradas: Iterable<UnidadFacturacion> = [],
): UnidadFacturacion[] {
  const presentes = new Set<UnidadFacturacion>([...configuradas, ...filas.flatMap((f) => f.lineas.map((l) => l.unidad))]);
  return ORDEN_UNIDADES.filter(
    (u) => presentes.has(u) && ARTICULO_GS[u] != null && !UNIDADES_BASE_GS[tipo].includes(u) && CABECERA_EXTRA_GS[u] != null,
  );
}

/** Tipo de fichero de una fila: promociones si cobra contactos (bbdd). */
export function tipoFicheroGs(fila: Pick<FilaFactura, "lineas">, esPromocion = false): TipoFicheroGs {
  return esPromocion || fila.lineas.some((l) => l.unidad === "leads") ? "promociones" : "ventas";
}

/**
 * Filas de la factura → filas del fichero de un tipo. `esPromocion` dice si
 * una campaña es de bbdd aunque este mes no tenga contactos (por su config).
 * Las que no tienen código de GS se devuelven aparte: sin código no hay
 * albarán.
 */
export function filasFicheroGs(
  filas: readonly FilaFactura[],
  tipo: TipoFicheroGs,
  esPromocion: (campania: string | null) => boolean = () => false,
): { filas: FilaGs[]; sinCodigo: string[] } {
  const cantidad = (f: FilaFactura, unidad: string) => f.lineas.find((l) => l.unidad === unidad)?.cantidad ?? 0;
  const delTipo = filas.filter((f) => tipoFicheroGs(f, esPromocion(f.campania)) === tipo);
  return {
    filas: delTipo
      .filter((f) => f.codigoGs)
      .map((f) => ({
        codigoGs: f.codigoGs!,
        principal: cantidad(f, tipo === "ventas" ? "horas_logadas" : "leads"),
        minutosFijo: cantidad(f, "minutos_fijo"),
        minutosMovil: cantidad(f, "minutos_movil"),
        ddis: cantidad(f, "ddi"),
        extras: Object.fromEntries(
          f.lineas.filter((l) => !UNIDADES_BASE_GS[tipo].includes(l.unidad)).map((l) => [l.unidad, l.cantidad]),
        ),
      }))
      .sort((a, b) => a.codigoGs.localeCompare(b.codigoGs)),
    sinCodigo: delTipo.filter((f) => !f.codigoGs).map((f) => f.campania ?? `(sin campaña) ${f.servicio ?? ""}`),
  };
}

const decimal2 = (v: number) =>
  v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const entero = (v: number) => String(Math.round(v));

/**
 * Contenido del fichero de texto tabulado para GS. `extra`: las columnas
 * añadidas (unidadesExtraGs), con 0 en las filas que no tienen ese artículo.
 */
export function generarFicheroGs(
  filas: readonly FilaGs[],
  tipo: TipoFicheroGs,
  extra: readonly UnidadFacturacion[] = [],
): string {
  const lineas = [
    [...CABECERA_GS[tipo], ...extra.map((u) => CABECERA_EXTRA_GS[u])].join("\t"),
    ...filas.map((f) =>
      [
        f.codigoGs,
        tipo === "ventas" ? decimal2(f.principal) : entero(f.principal),
        decimal2(f.minutosFijo),
        decimal2(f.minutosMovil),
        entero(f.ddis),
        ...extra.map((u) => (DECIMALES_GS.has(u) ? decimal2(f.extras[u] ?? 0) : entero(f.extras[u] ?? 0))),
      ].join("\t"),
    ),
  ];
  return `${lineas.join("\r\n")}\r\n`;
}
