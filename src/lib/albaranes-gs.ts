import type { FilaFactura } from "@/lib/facturacion-campania";

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
      }))
      .sort((a, b) => a.codigoGs.localeCompare(b.codigoGs)),
    sinCodigo: delTipo.filter((f) => !f.codigoGs).map((f) => f.campania ?? `(sin campaña) ${f.servicio ?? ""}`),
  };
}

const decimal2 = (v: number) =>
  v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const entero = (v: number) => String(Math.round(v));

/** Contenido del fichero de texto tabulado para GS. */
export function generarFicheroGs(filas: readonly FilaGs[], tipo: TipoFicheroGs): string {
  const lineas = [
    CABECERA_GS[tipo].join("\t"),
    ...filas.map((f) =>
      [
        f.codigoGs,
        tipo === "ventas" ? decimal2(f.principal) : entero(f.principal),
        decimal2(f.minutosFijo),
        decimal2(f.minutosMovil),
        entero(f.ddis),
      ].join("\t"),
    ),
  ];
  return `${lineas.join("\r\n")}\r\n`;
}
