// ============================================================
// Panel de RRHH: grupos de personas para filtrar (17/11/2026, decidido con
// Christian): «Bolsas», «Socios» y «GH», donde GH junta a todas las
// multicliente. Puro: sin I/O.
//
// Regla automática (cuadra con producción el 17/11/2026: 13 GH, 10 Bolsas, 5
// Socios):
// - En la plantilla de Planificación → GH (las multicliente: GH_, Av_, CR_,
//   UGR_...).
// - Si no, por el prefijo de su usuario principal: Bol_ → Bolsas, Soc_ →
//   Socios. No vale mirar todos sus usuarios: Bol_0927 tiene también GH_,
//   UGR_, AL_... y saldría en varios.
// - Lo demás, GH.
// RRHH puede ponerlo a mano en Configuración (`rrhh_personas.grupo`).
// ============================================================

export type GrupoRrhh = "bolsas" | "socios" | "gh";

export const GRUPOS_RRHH: readonly GrupoRrhh[] = ["bolsas", "socios", "gh"];

export const NOMBRE_GRUPO: Record<GrupoRrhh, string> = {
  bolsas: "Bolsas",
  socios: "Socios",
  gh: "GH",
};

export function esGrupo(v: unknown): v is GrupoRrhh {
  return typeof v === "string" && (GRUPOS_RRHH as readonly string[]).includes(v);
}

/** El grupo que le toca a una persona si nadie lo ha cambiado. */
export function grupoAutomatico(p: { enPlanificacion: boolean; codigo: string }): GrupoRrhh {
  if (p.enPlanificacion) return "gh";
  const prefijo = p.codigo.trim().split("_")[0]?.toLowerCase() ?? "";
  if (prefijo === "bol") return "bolsas";
  if (prefijo === "soc") return "socios";
  return "gh";
}

/** Lee el filtro de la URL (`?grupo=`): null = todos. */
export function leerGrupo(v: string | null | undefined): GrupoRrhh | null {
  return esGrupo(v) ? v : null;
}
