import { UNIDADES_CARGO, type BillingConfigRow, type UnidadCargo, type UnidadFacturacion } from "@/lib/db/schema";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import type { UnidadesCampania } from "@/lib/rdb/types";
import type { TarificacionCampania } from "@/lib/tarificacion";

// ============================================================
// Facturación por campaña (puro, sin I/O): cruza lo medido en RDBv2 con
// billing_config. Cada unidad es un artículo de GS (ARTICULO_GS). Dos pasos:
//  1. facturarCampanias: las líneas de cada campaña según su config
//     (campaña > servicio > ninguna): productivas, atendidas, éxitos, leads,
//     minutos a fijo y a móvil y DDIs.
//  2. consolidarFactura: une esas líneas con el reparto de las horas logadas
//     de cada cliente y el código de GS. Una fila por campaña con todo lo que
//     se le cobra: es la hoja «FACTURACION» del Excel de operaciones y lo que
//     se guarda al cerrar el mes.
// ============================================================

/**
 * Orden de las unidades en tablas, exportaciones y cierres: el de los
 * artículos de GS (lista de Operaciones del 19/10/2026), con las dos que no
 * son artículo de GS (atendidas y éxitos por sesión) al final.
 */
export const ORDEN_UNIDADES: readonly UnidadFacturacion[] = [
  "base_datos",
  "encuestas",
  "horas_logadas",
  "horas",
  "preparacion",
  "minutos_fijo",
  "minutos_movil",
  "minutos_especial",
  "ddi",
  "ddi_movil",
  "leads_recibidos",
  "exitos_finalizados",
  "leads",
  "interacciones",
  "exitos",
];

/**
 * Artículo de GS de cada unidad (nombre tal cual en GS). Las dos horas son el
 * mismo artículo: cada cliente factura una u otra. null = no es artículo de GS.
 */
export const ARTICULO_GS: Record<UnidadFacturacion, string | null> = {
  base_datos: "BASE DE DATOS (CAMP. EXTERNAS)",
  encuestas: "ENCUESTAS REALIZADAS",
  horas_logadas: "HORA AGENTE/TELEOPERADOR/A",
  horas: "HORA AGENTE/TELEOPERADOR/A",
  preparacion: "PREPARACION DE CAMPAÑA",
  minutos_fijo: "TARIFICACION MINUTOS A FIJOS",
  minutos_movil: "TARIFICACION MINUTOS A MOVILES",
  minutos_especial: "TARIFICACION 901,2,X",
  ddi: "ALQUILER DDI (NUMERO GEOGRAFICO)",
  ddi_movil: "ALQUILER DDI (NUMERO MOVIL)",
  leads_recibidos: "LEADS A GESTIONAR EXTERNAS",
  exitos_finalizados: 'CONTACTOS FINALIZADOS EN "EXITO"',
  leads: "Nº CONTACTOS FINALIZADOS",
  interacciones: null,
  exitos: null,
};

/** Cómo se calcula cada unidad, en llano (formularios y tablas). */
export const NOMBRE_UNIDAD: Record<UnidadFacturacion, string> = {
  base_datos: "Base de datos (cargo puntual)",
  encuestas: "Encuestas realizadas (contactos gestionados)",
  horas_logadas: "Horas logadas (usuarios del cliente)",
  horas: "Horas productivas (en llamada)",
  preparacion: "Preparación de campaña (cargo puntual)",
  minutos_fijo: "Minutos de línea a fijos",
  minutos_movil: "Minutos de línea a móviles",
  minutos_especial: "Minutos a números especiales (901, 902, 80x, 70x)",
  ddi: "DDIs geográficos (cuota mensual)",
  ddi_movil: "DDIs móviles (cuota mensual)",
  leads_recibidos: "Leads recibidos (contactos que entran)",
  exitos_finalizados: "Contactos finalizados en éxito",
  leads: "Contactos finalizados",
  interacciones: "Interacciones gestionadas (atendidas)",
  exitos: "Éxitos / ventas (sesiones de éxito)",
};

/** Cabecera corta para columnas de tabla. */
export const NOMBRE_CORTO_UNIDAD: Record<UnidadFacturacion, string> = {
  base_datos: "Base datos",
  encuestas: "Encuestas",
  horas_logadas: "H. logadas",
  horas: "H. productivas",
  preparacion: "Preparación",
  minutos_fijo: "Min. fijo",
  minutos_movil: "Min. móvil",
  minutos_especial: "Min. 90X",
  ddi: "DDIs",
  ddi_movil: "DDIs móvil",
  leads_recibidos: "Leads recib.",
  exitos_finalizados: "Fin. éxito",
  leads: "Contactos fin.",
  interacciones: "Atendidas",
  exitos: "Éxitos",
};

/** Cómo se mide cada unidad, en llano (catálogo de Operaciones → Artículos). */
export const CALCULO_UNIDAD: Record<UnidadFacturacion, string> = {
  base_datos:
    "Cargo puntual: Operaciones lo apunta a mano en el mes y la campaña que toca (Facturación → Cargos puntuales).",
  encuestas:
    "Contactos gestionados (sesiones de script) de las campañas de la línea. Pensado para las campañas de encuestas.",
  horas_logadas:
    "Tiempo logado de los usuarios PREFIJO_nnnn del cliente (de login a logout), repartido por campaña según el tiempo de agente.",
  horas: "Tiempo de gestión de las llamadas atendidas de la campaña (en llamada y cierre).",
  preparacion:
    "Cargo puntual: Operaciones lo apunta a mano en el mes y la campaña que toca (Facturación → Cargos puntuales).",
  minutos_fijo: "Minutos de las salientes atendidas a números fijos (8xx, 9xx), más la encuesta tras la gestión.",
  minutos_movil: "Minutos de las salientes atendidas a móviles (6xx, 71x-74x), más la encuesta tras la gestión.",
  minutos_especial: "Minutos de las salientes atendidas a números especiales (901-909, 803-807, 70x).",
  ddi: "Cuota del mes entero por cada DDI geográfico activo algún día del mes (Operaciones → DDIs).",
  ddi_movil: "Cuota del mes entero por cada DDI móvil (6xx, 71x-74x) activo algún día del mes.",
  leads_recibidos:
    "Contactos que entran en la campaña en el mes (cargados, creados por un agente o un supervisor, o movidos de otra), se gestionen o no.",
  exitos_finalizados: "Contactos cerrados en el mes con estado de éxito.",
  leads: "Contactos cerrados en el mes, fechados por su último intento.",
  interacciones: "Llamadas atendidas por un agente. No es artículo de GS.",
  exitos: "Sesiones de script marcadas como éxito. No es artículo de GS.",
};

/** Unidades que no se miden: las apunta Operaciones (cargos puntuales, «U» en GS). */
export function esCargoPuntual(unidad: UnidadFacturacion): unidad is UnidadCargo {
  return (UNIDADES_CARGO as readonly string[]).includes(unidad);
}

/** Un cargo puntual de un mes y campaña (tabla facturacion_cargos). */
export interface CargoPuntual {
  campania: string;
  unidad: UnidadCargo;
  cantidad: number;
  /** null = el precio de la tarifa de esa unidad. */
  precioUnitario: number | null;
  concepto: string;
}

export interface LineaFacturable {
  unidad: UnidadFacturacion;
  cantidad: number;
  precioUnitario: number | null;
  importe: number | null; // null si no hay precio configurado
  notas: string | null;
}

export interface ConfigFacturacion {
  /** Líneas de ámbito campaña (excepción), por shortname. */
  porCampania: Map<string, BillingConfigRow[]>;
  /** Líneas de ámbito servicio (lo normal), por nombre de servicio. */
  porServicio: Map<string, BillingConfigRow[]>;
}

/** Medidas que no salen de itr_thread: tarificación, DDIs, leads recibidos y cargos, por campaña. */
export interface ExtrasFacturacion {
  tarificacion?: ReadonlyMap<string, TarificacionCampania>;
  /** DDIs GEOGRÁFICOS de cada mes del rango (lib/ddis.ts → ddisPorMes). */
  ddisPorMes?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** DDIs MÓVILES de cada mes del rango. */
  ddisMovilPorMes?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Meses (YYYY-MM) con alguna llamada de cada campaña. */
  mesesConLlamadas?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Contactos que entran en cada campaña (leadsRecibidosPorCampania). */
  leadsRecibidos?: ReadonlyMap<string, number>;
  /** Cargos puntuales de los meses del rango (facturacion_cargos). */
  cargos?: readonly CargoPuntual[];
}

export interface FacturacionCampania {
  campania: string;
  /** Cliente (servicio) de la campaña; null si no tiene. */
  servicio: string | null;
  medidas: UnidadesCampania;
  tarificacion: TarificacionCampania | null;
  /** DDI-meses activos en el rango (lo que se cobra si la línea no pide llamadas). */
  ddis: number;
  /** DDI-meses de los meses con llamadas (opción «solo los meses con llamadas»). */
  ddisConLlamadas: number;
  /** Lo mismo con los DDIs móviles (`ddis` son los geográficos). */
  ddisMovil: number;
  ddisMovilConLlamadas: number;
  /** Contactos que entraron en la campaña en el rango. */
  leadsRecibidos: number;
  /** Cargos puntuales apuntados por Operaciones. */
  cargos: CargoPuntual[];
  /** Líneas según billing_config (vacío si la campaña no está configurada). */
  lineas: LineaFacturable[];
  /** Origen de la configuración aplicada: del servicio, de la campaña o ninguna. */
  ambito: "servicio" | "campania" | null;
  /**
   * La config aplicada (la del servicio) factura por horas logadas: esas
   * horas van en la línea del cliente, repartidas por campaña aparte.
   */
  porHorasLogadas: boolean;
  importeTotal: number | null;
}

const redondear2 = (v: number) => Math.round(v * 100) / 100;

function importeDe(cantidad: number, precio: number | null): number | null {
  return precio == null ? null : redondear2(cantidad * precio);
}

function sumaImportes(lineas: readonly { importe: number | null }[]): number | null {
  const con = lineas.filter((l) => l.importe != null);
  return con.length > 0 ? redondear2(con.reduce((a, l) => a + (l.importe ?? 0), 0)) : null;
}

function medidasVacias(campania: string): UnidadesCampania {
  return {
    campania,
    horasProductivas: 0,
    interacciones: 0,
    atendidas: 0,
    exitos: 0,
    leadsFinalizados: 0,
    sesiones: 0,
    exitosFinalizados: 0,
  };
}

type MedidasLinea = Pick<
  FacturacionCampania,
  "medidas" | "tarificacion" | "ddis" | "ddisConLlamadas" | "ddisMovil" | "ddisMovilConLlamadas" | "leadsRecibidos"
>;

function cantidadPara(
  linea: Pick<BillingConfigRow, "soloConActividad"> & {
    unidad: Exclude<UnidadFacturacion, "horas_logadas" | UnidadCargo>;
  },
  f: MedidasLinea,
): number {
  switch (linea.unidad) {
    case "horas":
      // Horas PRODUCTIVAS por campaña (gestión real). Las logadas van por
      // cliente (unidad horas_logadas) y se reparten aparte.
      return f.medidas.horasProductivas;
    case "interacciones":
      // Gestionadas = ATENDIDAS (termination_state = 1), decidido 29/09/2026.
      // `medidas.interacciones` es COUNT(*) de hilos: incluye ocupado, no
      // contesta, número inválido... (+33 % el 22/09: 6.609 frente a 4.954).
      return f.medidas.atendidas;
    case "exitos":
      return f.medidas.exitos;
    case "leads":
      return f.medidas.leadsFinalizados;
    case "minutos_fijo":
      // Se redondea la cantidad que se cobra (como el Excel: ROUND(…, 2))
      return redondear2(f.tarificacion?.minutos.fijo ?? 0);
    case "minutos_movil":
      return redondear2(f.tarificacion?.minutos.movil ?? 0);
    case "minutos_especial":
      // 901, 902, 80x, 70x: hasta el 19/10/2026 se presupuestaban aparte;
      // ahora es el artículo «TARIFICACION 901,2,X» para quien lo tenga
      return redondear2(f.tarificacion?.minutos.especial ?? 0);
    case "ddi":
      // Según el presupuesto del cliente, los DDIs se cobran todos los meses
      // o solo los meses en que la campaña tuvo llamadas (bbdd entre tandas).
      // Desde el 19/10/2026, solo los GEOGRÁFICOS (los móviles, en ddi_movil)
      return linea.soloConActividad ? f.ddisConLlamadas : f.ddis;
    case "ddi_movil":
      return linea.soloConActividad ? f.ddisMovilConLlamadas : f.ddisMovil;
    case "encuestas":
      // Contactos gestionados (sesiones de script) de las campañas de la línea
      return f.medidas.sesiones;
    case "leads_recibidos":
      return f.leadsRecibidos;
    case "exitos_finalizados":
      return f.medidas.exitosFinalizados;
  }
}

/**
 * Líneas de los cargos puntuales de una campaña: una por unidad, con la suma
 * de sus cargos. Precio: el del cargo o, si no lo lleva, el de la tarifa de
 * esa unidad. Con precios distintos, el importe es la suma de cada cargo y
 * el precio, la media (importe ÷ cantidad).
 */
function lineasDeCargos(
  cargos: readonly CargoPuntual[],
  precioTarifa: (u: UnidadCargo) => number | null,
): LineaFacturable[] {
  return UNIDADES_CARGO.flatMap((unidad) => {
    const suyos = cargos.filter((c) => c.unidad === unidad);
    if (suyos.length === 0) return [];
    const precios = suyos.map((c) => c.precioUnitario ?? precioTarifa(unidad));
    const cantidad = redondear2(suyos.reduce((a, c) => a + c.cantidad, 0));
    const sinPrecio = precios.some((p) => p == null);
    const importe = sinPrecio ? null : redondear2(suyos.reduce((a, c, i) => a + c.cantidad * precios[i]!, 0));
    const iguales = precios.every((p) => p === precios[0]);
    return [
      {
        unidad,
        cantidad,
        precioUnitario: iguales ? precios[0] : importe != null && cantidad ? Math.round((importe / cantidad) * 10000) / 10000 : null,
        importe,
        notas: suyos.map((c) => c.concepto).join(" · "),
      },
    ];
  });
}

/**
 * Líneas de cada campaña. Por campaña aplica, por este orden: su config de
 * campaña (excepción) → la de su servicio (lo normal) → nada. Salen las
 * campañas con actividad y también las que solo tienen minutos o DDIs (una
 * campaña parada sigue pagando sus DDIs).
 */
export function facturarCampanias(
  config: ConfigFacturacion,
  unidades: readonly UnidadesCampania[],
  campaniaServicio: ReadonlyMap<string, string>,
  extras: ExtrasFacturacion = {},
): FacturacionCampania[] {
  const medidas = new Map(unidades.map((u) => [u.campania, u]));
  const cargosPorCampania = new Map<string, CargoPuntual[]>();
  for (const c of extras.cargos ?? []) {
    cargosPorCampania.set(c.campania, [...(cargosPorCampania.get(c.campania) ?? []), c]);
  }
  const otras = [
    ...new Set([
      ...(extras.tarificacion?.keys() ?? []),
      ...(extras.ddisPorMes?.keys() ?? []),
      ...(extras.ddisMovilPorMes?.keys() ?? []),
      ...(extras.leadsRecibidos?.keys() ?? []),
      ...cargosPorCampania.keys(),
    ]),
  ]
    .filter((c) => !medidas.has(c))
    .sort();
  const campanias = [...unidades.map((u) => u.campania), ...otras];

  return campanias.map((campania) => {
    const servicio = campaniaServicio.get(campania);
    const propias = config.porCampania.get(campania);
    const delServicio = servicio ? config.porServicio.get(servicio) : undefined;
    const lineasConfig = propias ?? delServicio ?? [];
    const conLlamadas = extras.mesesConLlamadas?.get(campania);
    // DDI-meses de la campaña: todos y los de los meses con llamadas
    const ddiMeses = (porMes: ExtrasFacturacion["ddisPorMes"]) => {
      const meses = [...(porMes?.get(campania) ?? new Map<string, number>())];
      return {
        todos: meses.reduce((a, [, n]) => a + n, 0),
        conLlamadas: meses.filter(([mes]) => conLlamadas?.has(mes)).reduce((a, [, n]) => a + n, 0),
      };
    };
    const geo = ddiMeses(extras.ddisPorMes);
    const movil = ddiMeses(extras.ddisMovilPorMes);
    const cargos = cargosPorCampania.get(campania) ?? [];
    const base = {
      medidas: medidas.get(campania) ?? medidasVacias(campania),
      tarificacion: extras.tarificacion?.get(campania) ?? null,
      ddis: geo.todos,
      ddisConLlamadas: geo.conLlamadas,
      ddisMovil: movil.todos,
      ddisMovilConLlamadas: movil.conLlamadas,
      leadsRecibidos: extras.leadsRecibidos?.get(campania) ?? 0,
      cargos,
    };
    const lineas: LineaFacturable[] = lineasConfig.flatMap((c) => {
      // Las horas logadas se facturan por cliente (facturacionHorasLogadas);
      // los cargos puntuales, con lo que apunta Operaciones (abajo)
      if (c.unidad === "horas_logadas" || esCargoPuntual(c.unidad)) return [];
      const cantidad = cantidadPara({ unidad: c.unidad, soloConActividad: c.soloConActividad }, base);
      return [{ unidad: c.unidad, cantidad, precioUnitario: c.precioUnitario, importe: importeDe(cantidad, c.precioUnitario), notas: c.notas }];
    });
    // Los cargos se cobran aunque la unidad no esté en la tarifa del cliente:
    // los apunta Operaciones a propósito. La tarifa solo pone el precio.
    lineas.push(...lineasDeCargos(cargos, (u) => lineasConfig.find((c) => c.unidad === u)?.precioUnitario ?? null));
    return {
      campania,
      servicio: servicio ?? null,
      ...base,
      lineas,
      ambito: propias ? "campania" : delServicio ? "servicio" : null,
      porHorasLogadas: lineasConfig.some((c) => c.unidad === "horas_logadas"),
      importeTotal: sumaImportes(lineas),
    };
  });
}

/** Una fila de la factura: todo lo que se cobra a una campaña. */
export interface FilaFactura {
  /** null = horas logadas de un cliente sin tiempo de agente en sus campañas. */
  campania: string | null;
  servicio: string | null;
  codigoGs: string | null;
  /** Líneas con cantidad distinta de cero, en ORDEN_UNIDADES. */
  lineas: LineaFacturable[];
  importeTotal: number | null;
}

/**
 * Une las líneas de cada campaña con su parte de las horas logadas del
 * cliente y su código de GS. Solo quedan las filas con algo que cobrar.
 */
export function consolidarFactura(
  facturacion: readonly FacturacionCampania[],
  porCliente: readonly FacturacionHorasLogadas[],
  campaniaServicio: ReadonlyMap<string, string>,
  codigosGs: ReadonlyMap<string, string>,
): FilaFactura[] {
  // Clave: el shortname, o «\0<servicio>» para la fila sin campaña de un cliente
  const lineas = new Map<string, { servicio: string | null; lineas: LineaFacturable[] }>();
  const de = (campania: string | null, servicio: string | null) => {
    const clave = campania ?? `\0${servicio}`;
    let fila = lineas.get(clave);
    if (!fila) {
      fila = { servicio, lineas: [] };
      lineas.set(clave, fila);
    }
    return fila;
  };
  for (const f of facturacion) {
    de(f.campania, campaniaServicio.get(f.campania) ?? null).lineas.push(...f.lineas);
  }
  for (const cliente of porCliente) {
    for (const r of cliente.campanias) {
      de(r.campania, cliente.servicio).lineas.push({
        unidad: "horas_logadas",
        cantidad: r.horasLogadas,
        precioUnitario: cliente.precioUnitario,
        importe: r.importe,
        notas: cliente.notas,
      });
    }
  }

  const orden = (u: UnidadFacturacion) => ORDEN_UNIDADES.indexOf(u);
  const filas: FilaFactura[] = [];
  for (const [clave, { servicio, lineas: todas }] of lineas) {
    const utiles = todas.filter((l) => l.cantidad !== 0).sort((a, b) => orden(a.unidad) - orden(b.unidad));
    if (utiles.length === 0) continue;
    const campania = clave.startsWith("\0") ? null : clave;
    filas.push({
      campania,
      servicio,
      codigoGs: campania ? (codigosGs.get(campania) ?? null) : null,
      lineas: utiles,
      importeTotal: sumaImportes(utiles),
    });
  }
  return filas.sort(
    (a, b) =>
      (a.servicio ?? "").localeCompare(b.servicio ?? "") ||
      Number(a.campania == null) - Number(b.campania == null) ||
      (a.campania ?? "").localeCompare(b.campania ?? ""),
  );
}

export interface TotalUnidad {
  unidad: UnidadFacturacion;
  cantidad: number;
  importe: number | null;
}

/** Totales por unidad (en ORDEN_UNIDADES) y total general de la factura. */
export function totalesFactura(filas: readonly FilaFactura[]): { porUnidad: TotalUnidad[]; importe: number | null } {
  const porUnidad: TotalUnidad[] = [];
  for (const unidad of ORDEN_UNIDADES) {
    const lineas = filas.flatMap((f) => f.lineas.filter((l) => l.unidad === unidad));
    if (lineas.length === 0) continue;
    porUnidad.push({
      unidad,
      cantidad: redondear2(lineas.reduce((a, l) => a + l.cantidad, 0)),
      importe: sumaImportes(lineas),
    });
  }
  return { porUnidad, importe: sumaImportes(filas.map((f) => ({ importe: f.importeTotal }))) };
}

/**
 * Agrupa filas por cliente (servicio), en el orden en que aparece cada uno y
 * sin cambiar el orden de las filas dentro de cada grupo. Para los subtotales
 * de las tablas de Operaciones con «Todos los clientes».
 */
export function agruparPorServicio<T extends { servicio: string | null }>(
  filas: readonly T[],
): { servicio: string | null; filas: T[] }[] {
  const grupos = new Map<string | null, T[]>();
  for (const f of filas) {
    const g = grupos.get(f.servicio) ?? [];
    g.push(f);
    grupos.set(f.servicio, g);
  }
  return [...grupos].map(([servicio, g]) => ({ servicio, filas: g }));
}

/** Sumas de la tabla «Unidades por campaña». Minutos SIN redondear (se redondea al enseñarlos). */
export interface TotalesUnidades {
  horasProductivas: number;
  interacciones: number;
  atendidas: number;
  exitos: number;
  leadsFinalizados: number;
  sesiones: number;
  exitosFinalizados: number;
  leadsRecibidos: number;
  minutosMovil: number;
  minutosFijo: number;
  minutosEspecial: number;
  ddis: number;
  ddisMovil: number;
  /** Suma de los importes por campaña (sin las horas logadas, que van por cliente). */
  importe: number | null;
}

export function totalesUnidades(filas: readonly FacturacionCampania[]): TotalesUnidades {
  const suma = (fn: (f: FacturacionCampania) => number) => filas.reduce((a, f) => a + fn(f), 0);
  return {
    // Cada campaña trae sus horas ya redondeadas: la suma es la de la columna
    horasProductivas: redondear2(suma((f) => f.medidas.horasProductivas)),
    interacciones: suma((f) => f.medidas.interacciones),
    atendidas: suma((f) => f.medidas.atendidas),
    exitos: suma((f) => f.medidas.exitos),
    leadsFinalizados: suma((f) => f.medidas.leadsFinalizados),
    sesiones: suma((f) => f.medidas.sesiones),
    exitosFinalizados: suma((f) => f.medidas.exitosFinalizados),
    leadsRecibidos: suma((f) => f.leadsRecibidos),
    minutosMovil: suma((f) => f.tarificacion?.minutos.movil ?? 0),
    minutosFijo: suma((f) => f.tarificacion?.minutos.fijo ?? 0),
    minutosEspecial: suma((f) => f.tarificacion?.minutos.especial ?? 0),
    ddis: suma((f) => f.ddis),
    ddisMovil: suma((f) => f.ddisMovil),
    importe: sumaImportes(filas.map((f) => ({ importe: f.importeTotal }))),
  };
}

/** Etiqueta de la fila sin campaña (horas logadas sin tiempo de agente). */
export function etiquetaCampania(fila: Pick<FilaFactura, "campania" | "servicio">): string {
  return fila.campania ?? `(sin campaña) ${fila.servicio ?? ""}`.trim();
}

/** Una línea guardada al cerrar un mes (tabla facturacion_cierre_lineas). */
export interface LineaCierre {
  /** shortname; la etiqueta si es la fila sin campaña o viene del histórico del Excel. */
  campania: string;
  codigoGs: string | null;
  unidad: UnidadFacturacion;
  cantidad: number;
  precioUnitario: number | null;
  importe: number | null;
}

/** Ajuste manual de una línea de un mes cerrado (tabla facturacion_cierre_ajustes). */
export interface AjusteLinea {
  id: number;
  lineaId: number;
  tipo: "quitar" | "precio";
  /** Solo con tipo «precio». */
  precioNuevo: number | null;
  motivo: string;
  autor: string;
}

/** Línea guardada de un cierre, con su id. */
export interface LineaCierreGuardada extends LineaCierre {
  id: number;
  cierreId: number;
}

export interface LineaCierreAjustada extends LineaCierreGuardada {
  /** El ajuste aplicado y lo que había antes; null si no se tocó. */
  ajuste: (AjusteLinea & { precioOriginal: number | null; importeOriginal: number | null }) | null;
  /** Quitada por un ajuste: no se cobra ni sale en el fichero de GS. */
  quitada: boolean;
}

/**
 * Aplica los ajustes manuales a las líneas de un cierre. Cambiar el precio
 * recalcula el importe con la cantidad guardada; quitar deja la línea
 * marcada (para enseñarla) pero fuera de lo que se cobra.
 */
export function aplicarAjustes(
  lineas: readonly LineaCierreGuardada[],
  ajustes: readonly AjusteLinea[],
): LineaCierreAjustada[] {
  const porLinea = new Map(ajustes.map((a) => [a.lineaId, a]));
  return lineas.map((l) => {
    const a = porLinea.get(l.id);
    if (!a) return { ...l, ajuste: null, quitada: false };
    const ajuste = { ...a, precioOriginal: l.precioUnitario, importeOriginal: l.importe };
    if (a.tipo === "quitar") return { ...l, ajuste, quitada: true };
    return {
      ...l,
      precioUnitario: a.precioNuevo,
      importe: importeDe(l.cantidad, a.precioNuevo),
      ajuste,
      quitada: false,
    };
  });
}

/** Total de lo que se cobra de unas líneas ya ajustadas. */
export function importeVigente(lineas: readonly LineaCierreAjustada[]): number {
  return redondear2(lineas.filter((l) => !l.quitada).reduce((a, l) => a + (l.importe ?? 0), 0));
}

/** La factura, aplanada para guardarla al cerrar el mes. */
export function lineasDeCierre(filas: readonly FilaFactura[]): LineaCierre[] {
  return filas.flatMap((f) =>
    f.lineas.map((l) => ({
      campania: etiquetaCampania(f),
      codigoGs: f.codigoGs,
      unidad: l.unidad,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      importe: l.importe,
    })),
  );
}

/** Un cierre guardado, de vuelta a filas de factura (para enseñarlo igual). */
export function filasDeCierre(lineas: readonly LineaCierre[], servicio: string): FilaFactura[] {
  const porCampania = new Map<string, FilaFactura>();
  for (const l of lineas) {
    let fila = porCampania.get(l.campania);
    if (!fila) {
      fila = { campania: l.campania, servicio, codigoGs: l.codigoGs, lineas: [], importeTotal: null };
      porCampania.set(l.campania, fila);
    }
    fila.lineas.push({ unidad: l.unidad, cantidad: l.cantidad, precioUnitario: l.precioUnitario, importe: l.importe, notas: null });
  }
  const orden = (u: UnidadFacturacion) => ORDEN_UNIDADES.indexOf(u);
  return [...porCampania.values()]
    .map((f) => ({ ...f, lineas: f.lineas.sort((a, b) => orden(a.unidad) - orden(b.unidad)), importeTotal: sumaImportes(f.lineas) }))
    .sort((a, b) => (a.campania ?? "").localeCompare(b.campania ?? ""));
}
