import { format, subMonths } from "date-fns";

// ============================================================
// Secciones de Dirección (12/11/2026, el mismo patrón que Supervisión: ver
// lib/supervision-secciones.ts). La página medía 13.736 px de alto (unas 15
// pantallas) con los 12 bloques apilados; ahora cada pestaña (`?seccion=`)
// enseña y consulta solo lo suyo. Puro, sin I/O.
// ============================================================

export const SECCIONES_DIRECCION = ["resumen", "tendencias", "campanias", "exitos", "salientes", "callback"] as const;
export type SeccionDireccion = (typeof SECCIONES_DIRECCION)[number];

export const NOMBRE_SECCION_DIRECCION: Record<SeccionDireccion, string> = {
  resumen: "Resumen",
  tendencias: "Tendencias",
  campanias: "Campañas",
  exitos: "Éxitos",
  salientes: "Salientes",
  callback: "Callback",
};

/** La sección de la URL; cualquier otra cosa (o nada) es el resumen. */
export function leerSeccionDireccion(valor: string | null | undefined): SeccionDireccion {
  return SECCIONES_DIRECCION.find((s) => s === valor) ?? "resumen";
}

/** Enlace a una sección conservando el rango, el cliente y el IVR. El resumen no lleva `seccion`. */
export function hrefSeccionDireccion(
  seccion: SeccionDireccion,
  filtros: { desde: string; hasta: string; servicio?: string; incluirIvr?: boolean },
): string {
  const p = new URLSearchParams();
  if (seccion !== "resumen") p.set("seccion", seccion);
  p.set("desde", filtros.desde);
  p.set("hasta", filtros.hasta);
  if (filtros.servicio) p.set("servicio", filtros.servicio);
  if (filtros.incluirIvr) p.set("ivr", "1");
  return `/direccion?${p.toString()}`;
}

/** Las pestañas ya montadas para la barra (etiqueta y enlace de cada una). */
export function pestanasSeccionDireccion(filtros: Parameters<typeof hrefSeccionDireccion>[1]) {
  return SECCIONES_DIRECCION.map((s) => ({
    valor: s,
    etiqueta: NOMBRE_SECCION_DIRECCION[s],
    href: hrefSeccionDireccion(s, filtros),
  }));
}

/** El glosario de cada pestaña: solo los términos que salen en ella. */
export const GLOSARIO_DIRECCION: Record<SeccionDireccion, string[]> = {
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
    "interacciones",
    "abandono",
    "aht",
    "servicio",
    "visionPorCliente",
    "horasLogadas",
    "finalizados",
  ],
  tendencias: ["interacciones", "atendidas", "abandonadas", "conversion", "inboundOutbound"],
  campanias: [
    "gruposCampania",
    "interacciones",
    "atendidas",
    "abandono",
    "aht",
    "horasProductivas",
    "exitos",
    "finalizados",
    "contactosGestionados",
    "conversion",
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
  callback: [],
};

/**
 * El periodo con el que compara Dirección: el mismo rango un mes antes. Lo
 * usan la página y `npm run precalentar` (las mismas claves de caché).
 */
export function rangoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  return {
    desde: format(subMonths(new Date(`${desde}T12:00:00`), 1), "yyyy-MM-dd"),
    hasta: format(subMonths(new Date(`${hasta}T12:00:00`), 1), "yyyy-MM-dd"),
  };
}
