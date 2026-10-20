import { format } from "date-fns";

// ============================================================
// CSV de contactos finalizados de Supervisión → Resultados (pedido por
// Christian el 19/10/2026, solo para GrupoHuertas): una fila por contacto
// finalizado del período con los filtros de la pestaña (fechas, tipo de
// campaña y dato del contacto), con las columnas de su listado de siempre.
// «idcall» (ao_GrupoHuertas) se quitó a petición suya: solo está relleno en
// 2 de 126.305 tipificaciones. Lógica PURA; el SQL, en
// queries/resultados-actividad.ts (contactosFinalizadosExport).
// ============================================================

/** Columnas de ph_contact_profile que se pueden exportar (fijas, no vienen de fuera). */
export const COLUMNAS_PERFIL = ["unique_id", "phone_01_value", "phone_02_value"] as const;

export type OrigenColumna =
  | { tipo: "campania" }
  /** Fecha y hora de cierre del contacto (la que usa el filtro de fechas). */
  | { tipo: "fecha" }
  /** Nivel del resultado configurado en /admin/resultados (0 = resultado, 1 = subresultado). */
  | { tipo: "nivel"; indice: number }
  | { tipo: "perfil"; columna: (typeof COLUMNAS_PERFIL)[number] }
  /** Columna del directorio de contactos del cliente (dir_*). */
  | { tipo: "directorio"; columna: string }
  /** Columna de los atributos de actividad del cliente (act_*). */
  | { tipo: "actividad"; columna: string };

export interface ColumnaExport {
  titulo: string;
  origen: OrigenColumna;
}

/** Columnas del CSV por cliente. Solo los clientes de aquí tienen el botón. */
export const EXPORT_CONTACTOS: Readonly<Record<string, readonly ColumnaExport[]>> = {
  GrupoHuertas: [
    { titulo: "Campaña", origen: { tipo: "campania" } },
    { titulo: "Perfil del Directorio.ID Único", origen: { tipo: "perfil", columna: "unique_id" } },
    { titulo: "dir_fdlt_nombre", origen: { tipo: "directorio", columna: "dir_fdlt_nombre" } },
    { titulo: "resultado", origen: { tipo: "nivel", indice: 0 } },
    { titulo: "subresultado", origen: { tipo: "nivel", indice: 1 } },
    { titulo: "Fecha", origen: { tipo: "fecha" } },
    { titulo: "nombre_campdig", origen: { tipo: "actividad", columna: "nombre_campdig" } },
    { titulo: "dir_fdlt_idllamada", origen: { tipo: "directorio", columna: "dir_fdlt_idllamada" } },
    { titulo: "Contacto.Telefono01", origen: { tipo: "perfil", columna: "phone_01_value" } },
    { titulo: "Contacto.Telefono02", origen: { tipo: "perfil", columna: "phone_02_value" } },
  ],
};

export function definicionExportContactos(servicio: string | undefined): readonly ColumnaExport[] | null {
  return servicio ? (EXPORT_CONTACTOS[servicio] ?? null) : null;
}

/** Un contacto finalizado tal como sale del SQL: las columnas por su clave. */
export interface ContactoExport {
  campania: string;
  cierre: Date;
  /** Códigos de los niveles del resultado (ph_table_schema_enum_value.code). */
  niveles: (number | null)[];
  perfil: Record<string, string | null>;
  directorio: Record<string, string | number | null>;
  actividad: Record<string, string | number | null>;
}

/** Texto de una celda: sin espacios de relleno (las columnas char de Altitude). */
function texto(valor: string | number | null | undefined): string | number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return valor;
  const t = valor.trim();
  return t === "" ? null : t;
}

/**
 * Filas del CSV en el orden de las columnas. Los resultados salen como
 * texto (el código si no hay texto, como «#123»); la fecha, en hora local
 * de la centralita (regla 14) y con segundos: dd/MM/yyyy HH:mm:ss.
 */
export function filasExportContactos(
  columnas: readonly ColumnaExport[],
  contactos: readonly ContactoExport[],
  textos: Readonly<Record<number, string>>,
): (string | number | null)[][] {
  return contactos.map((c) =>
    columnas.map(({ origen }) => {
      switch (origen.tipo) {
        case "campania":
          return c.campania;
        case "fecha":
          return format(c.cierre, "dd/MM/yyyy HH:mm:ss");
        case "nivel": {
          const codigo = c.niveles[origen.indice] ?? null;
          return codigo == null ? null : (textos[codigo] ?? `#${codigo}`);
        }
        case "perfil":
          return texto(c.perfil[origen.columna]);
        case "directorio":
          return texto(c.directorio[origen.columna]);
        case "actividad":
          return texto(c.actividad[origen.columna]);
      }
    }),
  );
}

/** «contactos_GrupoHuertas_2026-09-01_2026-09-30.csv» (con «_origen» si hay filtro). */
export function nombreArchivoExport(servicio: string, desde: string, hasta: string, filtrado: boolean): string {
  return `contactos_${servicio}_${desde}_${hasta}${filtrado ? "_filtrado" : ""}.csv`;
}
