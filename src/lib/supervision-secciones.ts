// ============================================================
// Secciones de Supervisión (Tiempo real e Histórico), 12/11/2026: pedido por
// Christian porque había mucho scroll y la gente se perdía entre secciones.
// En vez de apilar los 13 bloques en una página, cada pestaña (`?seccion=`)
// enseña y CONSULTA solo lo suyo: el Histórico de un mes ya no espera a la
// tarjeta del IVR (`metricasIvr`, ~42 s el mes de GH) para abrir el resumen,
// y el refresco de Tiempo real pide solo la pestaña abierta.
// Puro (sin I/O): lo usan la página, la API de refresco y los paneles.
// ============================================================

export const SECCIONES_SUPERVISION = ["resumen", "agentes", "campanias", "exitos", "salientes", "entrantes"] as const;
export type SeccionSupervision = (typeof SECCIONES_SUPERVISION)[number];

export const NOMBRE_SECCION: Record<SeccionSupervision, string> = {
  resumen: "Resumen",
  agentes: "Agentes",
  campanias: "Campañas",
  exitos: "Éxitos",
  salientes: "Salientes",
  entrantes: "Entrantes e IVR",
};

/** La sección de la URL; cualquier otra cosa (o nada) es el resumen. */
export function leerSeccion(valor: string | null | undefined): SeccionSupervision {
  return SECCIONES_SUPERVISION.find((s) => s === valor) ?? "resumen";
}

/** Cada consulta de Supervisión, para pedir solo las de la sección abierta. */
export type DatoSupervision =
  | "kpis" // KPIs por campaña (cola, SLA, gestionadas…)
  | "ratios" // ratios de éxito (regla 17): las 12 cajas, éxitos y comparador
  | "resultados" // totales de Resultados (regla 18): cajas de finalizados
  | "agentes" // productividad de agentes
  | "salientes"
  | "calidad" // calidad de la base de datos
  | "ivr"
  | "callback";

const DATOS: Record<SeccionSupervision, DatoSupervision[]> = {
  resumen: ["kpis", "ratios", "resultados"],
  agentes: ["agentes"],
  campanias: ["kpis", "ratios"],
  exitos: ["ratios"],
  salientes: ["salientes", "calidad"],
  entrantes: ["ivr", "callback"],
};

/**
 * Las consultas que necesita una sección. En Tiempo real los KPIs por campaña
 * van siempre: alimentan la franja «Ahora» (SLA, abandono) que se ve en todas
 * las pestañas, igual que el estado de agentes y las alertas (fuera de esta
 * lista: son solo de Tiempo real).
 */
export function datosDeSeccion(seccion: SeccionSupervision, enVivo: boolean): Set<DatoSupervision> {
  const datos = new Set(DATOS[seccion]);
  if (enVivo) datos.add("kpis");
  return datos;
}

/** El glosario de cada pestaña: solo los términos que salen en ella. */
export const GLOSARIO_SECCION: Record<SeccionSupervision, string[]> = {
  resumen: [
    "kpiHorasLogadas",
    "kpiLlamadas",
    "kpiFinalizados",
    "kpiExitos",
    "kpiLlamadasHora",
    "kpiLlamadasPorExito",
    "kpiFinalizadosHora",
    "kpiFinalizadosPorExito",
    "ratioBruto",
    "ratioNeto",
    "kpiDuracionNoExito",
    "kpiDuracionExito",
    "equipoAhora",
    "recibidas",
    "abandono",
    "sla",
    "cola",
    "esperaAbandonadas",
    "tiempoReloj",
    "servicio",
  ],
  agentes: [
    "equipoAhora",
    "estado",
    "pausas",
    "atendidas",
    "conversaciones",
    "contactosGestionados",
    "preparacion",
    "talk",
    "acw",
    "aht",
    "productivo",
    "tiempoReloj",
  ],
  campanias: [
    "gruposCampania",
    "recibidas",
    "atendidas",
    "conversaciones",
    "contactosGestionados",
    "exitos",
    "abandonadas",
    "abandono",
    "cola",
    "esperaAbandonadas",
    "aht",
    "sla",
    "comparadorCampanias",
  ],
  exitos: [
    "exitos",
    "contactosGestionados",
    "conversion",
    "efectividadCierre",
    "exitosHora",
    "tiempoPorExito",
    "indiceExito",
  ],
  salientes: [
    "ocupacion",
    "contactabilidadFranja",
    "contactosAlcanzados",
    "rellamadas",
    "conversionIntento",
    "tiempoEsperando",
    "preparacion",
    "calidadBd",
  ],
  entrantes: ["ivr", "ivrAtendidas", "ivrNoAtendidas", "ivrNoAtendidasHorario"],
};

/**
 * Enlace a una sección de Supervisión conservando la vista, el cliente, el
 * IVR y (en Histórico) el rango. El resumen no lleva `seccion`.
 */
export function hrefSeccion(
  seccion: SeccionSupervision,
  filtros: { vista: "tiempo-real" | "historico"; servicio?: string; incluirIvr?: boolean; desde?: string; hasta?: string },
): string {
  const p = new URLSearchParams();
  if (filtros.vista === "historico") p.set("vista", "historico");
  if (seccion !== "resumen") p.set("seccion", seccion);
  if (filtros.servicio) p.set("servicio", filtros.servicio);
  if (filtros.incluirIvr) p.set("ivr", "1");
  if (filtros.vista === "historico" && filtros.desde && filtros.hasta) {
    p.set("desde", filtros.desde);
    p.set("hasta", filtros.hasta);
  }
  const qs = p.toString();
  return qs ? `/supervision?${qs}` : "/supervision";
}

/** Las pestañas ya montadas para la barra (etiqueta y enlace de cada una). */
export function pestanasSeccion(filtros: Parameters<typeof hrefSeccion>[1]) {
  return SECCIONES_SUPERVISION.map((s) => ({ valor: s, etiqueta: NOMBRE_SECCION[s], href: hrefSeccion(s, filtros) }));
}
