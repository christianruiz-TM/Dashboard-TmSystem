// ============================================================
// Secciones de Operaciones (13/11/2026, el mismo patrón que Supervisión y
// Dirección: lib/supervision-secciones.ts). La pestaña «Facturación» apilaba
// la factura con el cierre, los cargos, las horas logadas con su reparto y
// una tabla de unidades de 15 columnas; ahora cada parte es una sección.
// Sigue en `?vista=` (como desde el 15/10/2026): los enlaces de antes siguen
// valiendo y las acciones (cerrar el mes, cargos, ajustes) vuelven a la
// factura, que es donde están sus formularios. Puro, sin I/O.
// ============================================================

export const VISTAS_OPERACIONES = ["facturacion", "horas", "unidades", "cerrados", "listas", "pausas"] as const;
export type VistaOperaciones = (typeof VISTAS_OPERACIONES)[number];

export const NOMBRE_VISTA_OPERACIONES: Record<VistaOperaciones, string> = {
  facturacion: "Factura",
  horas: "Horas logadas",
  unidades: "Unidades por campaña",
  cerrados: "Meses cerrados",
  listas: "Listas outbound",
  pausas: "Pausas (Not Ready)",
};

/** Las secciones que salen de la misma cadena de facturación (`facturacionCompleta`). */
export const VISTAS_FACTURACION: readonly VistaOperaciones[] = ["facturacion", "horas", "unidades"];

/** La vista de la URL; cualquier otra cosa (o nada) es la factura. */
export function leerVistaOperaciones(valor: string | null | undefined): VistaOperaciones {
  return VISTAS_OPERACIONES.find((v) => v === valor) ?? "facturacion";
}

/**
 * Las secciones con filtro por tipo de campaña (17/11/2026, lib/tipo-panel.ts).
 * La factura, los meses cerrados y las descargas son siempre del cliente
 * entero (decidido con Christian).
 */
export const VISTAS_CON_TIPO: readonly VistaOperaciones[] = ["horas", "unidades", "listas", "pausas"];

/**
 * Enlace a una sección conservando cliente, rango, IVR y tipo de campaña (este,
 * solo si no es el de por defecto; la factura lo ignora pero no lo pierde).
 * La factura no lleva `vista`.
 */
export function hrefVistaOperaciones(
  vista: VistaOperaciones,
  filtros: { servicio?: string; desde: string; hasta: string; incluirIvr?: boolean; tipo?: string },
): string {
  const p = new URLSearchParams();
  if (vista !== "facturacion") p.set("vista", vista);
  if (filtros.servicio) p.set("servicio", filtros.servicio);
  p.set("desde", filtros.desde);
  p.set("hasta", filtros.hasta);
  if (filtros.incluirIvr) p.set("ivr", "1");
  if (filtros.servicio && filtros.tipo) p.set("tipo", filtros.tipo);
  return `/operaciones?${p.toString()}`;
}

/** Las pestañas ya montadas para la barra. */
export function pestanasOperaciones(filtros: Parameters<typeof hrefVistaOperaciones>[1]) {
  return VISTAS_OPERACIONES.map((v) => ({
    valor: v,
    etiqueta: NOMBRE_VISTA_OPERACIONES[v],
    href: hrefVistaOperaciones(v, filtros),
  }));
}

/** El glosario de cada sección: solo los términos que salen en ella. */
export const GLOSARIO_OPERACIONES: Record<VistaOperaciones, string[]> = {
  facturacion: [
    "servicio",
    "horasLogadas",
    "interacciones",
    "atendidas",
    "exitos",
    "leads",
    "importe",
    "facturaCampania",
    "cierreMes",
    "articulosGs",
    "escandallo",
    "cargosPuntuales",
  ],
  horas: ["horasLogadasCliente", "repartoHorasLogadas", "importe"],
  unidades: ["horasProductivas", "interacciones", "atendidas", "exitos", "leads", "minutosLinea", "ddis", "importe"],
  cerrados: ["cierreMes", "facturaCampania", "importe"],
  listas: ["penetracion"],
  pausas: ["pausas"],
};
