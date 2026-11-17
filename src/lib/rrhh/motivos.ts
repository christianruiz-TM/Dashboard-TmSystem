// ============================================================
// Panel de RRHH: qué es cada motivo de pausa de Altitude (decidido con
// Christian el 16/11/2026, docs/plan-rrhh.md). Puro: sin I/O.
//
// - «ausencia»: cuenta como tiempo ausente (Descanso, Servicio = el aseo,
//   Fin de Jornada, la pausa sin motivo a mitad de jornada...).
// - «trabajo»: pausa de la cola para trabajar en otra cosa (Formacion,
//   Llamada manual...). Se ve, pero no es ausencia.
// - «oculto»: lo pone el sistema y no aporta (dura 0 s).
//
// La pausa NOT_WORKING justo después de conectarse no es un motivo
// configurable: es «Hasta ponerse disponible» (lib/rrhh/dia.ts).
// ============================================================

export type CategoriaMotivo = "ausencia" | "trabajo" | "oculto";

export const CATEGORIAS_MOTIVO: readonly CategoriaMotivo[] = ["ausencia", "trabajo", "oculto"];

export const NOMBRE_CATEGORIA: Record<CategoriaMotivo, string> = {
  ausencia: "Ausencia",
  trabajo: "Trabajo sin cola",
  oculto: "No se enseña",
};

/** Motivo que pone Altitude desde que la agente se conecta hasta su primer «Disponible». */
export const MOTIVO_NOT_WORKING = "NREADY_REASON_NOT_WORKING";

/** Lo que se enseña en pantalla para la NOT_WORKING del principio de la conexión. */
export const ETIQUETA_ARRANQUE = "Hasta ponerse disponible";

/** Nombres de pantalla de los motivos de sistema (los demás, tal cual los escribió supervisión en Altitude). */
const ETIQUETAS_SISTEMA: Record<string, string> = {
  [MOTIVO_NOT_WORKING]: "Pausa sin motivo",
  EL_FINREADY_REASON_RONA: "No cogió una llamada",
  EL_FINREADY_REASON_WRAPUP: "Tras la llamada",
  EL_FINREADY_REASON_ROE: "Error al pasar la llamada",
  EL_FINREADY_REASON_FORCED: "Forzada por el sistema",
  EL_FINREADY_REASON_UNKNOWN: "Motivo desconocido",
  NREADY_REASON_SIGNOFF: "Desconexión",
  NREADY_REASON_CLEANUP: "Limpieza del sistema",
  NREADY_REASON_CP_ABANDON: "Salida de campaña",
};

/** Clasificación por defecto, por el nombre del motivo en Altitude. */
const POR_DEFECTO: Record<string, CategoriaMotivo> = {
  Descanso: "ausencia",
  Servicio: "ausencia",
  "Fin de Jornada": "ausencia",
  [MOTIVO_NOT_WORKING]: "ausencia",
  EL_FINREADY_REASON_RONA: "ausencia",
  "Sin razón": "ausencia",
  Formacion: "trabajo",
  "Llamada Supervisora": "trabajo",
  "Tiempo administrativo": "trabajo",
  "Llamada manual": "trabajo",
  Exito: "trabajo",
  EL_FINREADY_REASON_WRAPUP: "trabajo",
  NREADY_REASON_SIGNOFF: "oculto",
  NREADY_REASON_CLEANUP: "oculto",
  NREADY_REASON_CP_ABANDON: "oculto",
};

/** Nombre de pantalla de un motivo. */
export function etiquetaMotivo(nombre: string): string {
  const n = nombre.trim();
  return ETIQUETAS_SISTEMA[n] ?? n;
}

/** Categoría por defecto: la de la tabla o, si es un motivo que no conocemos, ausencia (que se vea). */
export function categoriaPorDefecto(nombre: string): CategoriaMotivo {
  return POR_DEFECTO[nombre.trim()] ?? "ausencia";
}

/**
 * Configuración de RRHH: código del motivo → categoría (`app_settings`
 * `rrhh.motivos`). Lo que no está, por defecto.
 */
export type ConfigMotivos = Record<string, CategoriaMotivo>;

/** Lee la configuración guardada; descarta lo que no sea válido. */
export function leerConfigMotivos(json: string | null | undefined): ConfigMotivos {
  if (!json) return {};
  try {
    const crudo: unknown = JSON.parse(json);
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const config: ConfigMotivos = {};
    for (const [codigo, categoria] of Object.entries(crudo)) {
      if (/^-?\d+$/.test(codigo) && CATEGORIAS_MOTIVO.includes(categoria as CategoriaMotivo)) {
        config[codigo] = categoria as CategoriaMotivo;
      }
    }
    return config;
  } catch {
    return {};
  }
}

/** Categoría de un motivo: la que ha elegido RRHH o la de por defecto. */
export function categoriaMotivo(codigo: number | null, nombre: string, config: ConfigMotivos): CategoriaMotivo {
  return (codigo != null ? config[String(codigo)] : undefined) ?? categoriaPorDefecto(nombre);
}
