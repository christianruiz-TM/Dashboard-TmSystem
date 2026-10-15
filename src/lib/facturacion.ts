import { eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { billingConfig, type BillingConfigRow } from "@/lib/db/schema";
import { ddisParaFacturar, mapaCodigosGs, prefijosExcluidosReparto } from "@/lib/db/facturacion";
import { ddisPorMes } from "@/lib/ddis";
import {
  consolidarFactura,
  facturarCampanias,
  type ConfigFacturacion,
  type ExtrasFacturacion,
  type FacturacionCampania,
  type FilaFactura,
} from "@/lib/facturacion-campania";
import {
  facturarHorasLogadas,
  type FacturacionHorasLogadas,
  type LineaHorasLogadas,
} from "@/lib/facturacion-horas-logadas";
import { tarificacionPorCampania, type TarificacionCampania } from "@/lib/tarificacion";
import {
  baseRepartoHorasLogadas,
  horasLogadasUsuarios,
  metricasDiariasPorCampania,
  unidadesPorCampania,
} from "@/lib/rdb/queries/facturacion";
import {
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";
import { minutosLineaPorCampania } from "@/lib/rdb/queries/tarificacion";
import type { ServicioConCampanias, UnidadesCampania } from "@/lib/rdb/types";

// ============================================================
// Lógica de facturación: cruza las unidades medidas en RDBv2
// con la configuración por campaña (billing_config de SQLite).
// Lo puro (líneas por campaña y factura consolidada) está en
// lib/facturacion-campania.ts; aquí, la lectura de la config y las consultas.
//
// Dos niveles:
//  - Por CAMPAÑA: horas productivas, atendidas, éxitos, leads, minutos de
//    línea a fijo y a móvil y DDIs.
//  - Por CLIENTE (servicio): horas logadas de sus usuarios. user_log no sabe
//    de campañas: el total se reparte por campaña con el método del Excel de
//    operaciones (tiempo de agente).
// ============================================================

export {
  NOMBRE_CORTO_UNIDAD,
  NOMBRE_UNIDAD,
  ORDEN_UNIDADES,
  etiquetaCampania,
  totalesFactura,
  type ConfigFacturacion,
  type FacturacionCampania,
  type FilaFactura,
  type LineaFacturable,
} from "@/lib/facturacion-campania";

/** Configuración de facturación activa, separada por ámbito. */
export function configuracionFacturacion(): ConfigFacturacion {
  const filas = db.select().from(billingConfig).where(eq(billingConfig.activo, true)).all();
  const porCampania = new Map<string, BillingConfigRow[]>();
  const porServicio = new Map<string, BillingConfigRow[]>();
  for (const fila of filas) {
    if (fila.campaignShortname) {
      const lista = porCampania.get(fila.campaignShortname) ?? [];
      lista.push(fila);
      porCampania.set(fila.campaignShortname, lista);
    } else if (fila.serviceName) {
      const lista = porServicio.get(fila.serviceName) ?? [];
      lista.push(fila);
      porServicio.set(fila.serviceName, lista);
    }
  }
  return { porCampania, porServicio };
}

/**
 * Combina medidas del rango con la configuración activa (facturarCampanias).
 * `campaniaServicio` mapea campaña→servicio (cliente).
 */
export function calcularFacturacion(
  unidades: UnidadesCampania[],
  campaniaServicio: Map<string, string>,
  extras: ExtrasFacturacion = {},
): FacturacionCampania[] {
  return facturarCampanias(configuracionFacturacion(), unidades, campaniaServicio, extras);
}

/**
 * Líneas `horas_logadas` activas (ámbito servicio, con prefijo), de un
 * servicio o de todos. Una línea sin prefijo no puede saber qué usuarios
 * cuentan: el formulario de admin la rechaza y aquí se ignora.
 */
export function lineasHorasLogadas(servicio?: string): LineaHorasLogadas[] {
  const { porServicio } = configuracionFacturacion();
  const lineas: LineaHorasLogadas[] = [];
  for (const [nombre, filas] of porServicio) {
    if (servicio && nombre !== servicio) continue;
    for (const f of filas) {
      if (f.unidad !== "horas_logadas" || !f.prefijoUsuario) continue;
      lineas.push({
        servicio: nombre,
        prefijo: f.prefijoUsuario,
        precioUnitario: f.precioUnitario,
        notas: f.notas,
      });
    }
  }
  return lineas.sort((a, b) => a.servicio.localeCompare(b.servicio));
}

/**
 * Facturación por horas logadas de los clientes del alcance (`servicio`
 * vacío = todos los que tengan esa línea). Una consulta a user_log para todos
 * los prefijos a la vez.
 */
export async function facturacionHorasLogadas(
  desdeISO: string,
  hastaISO: string,
  servicio?: string,
): Promise<FacturacionHorasLogadas[]> {
  const lineas = lineasHorasLogadas(servicio);
  if (lineas.length === 0) return [];
  const prefijos = lineas.map((l) => l.prefijo);
  // El total facturado sale de horasLogadasUsuarios; el reparto por campaña,
  // del tiempo de agente de esos usuarios (método del Excel de operaciones)
  const [horas, base, servicios] = await Promise.all([
    horasLogadasUsuarios(desdeISO, hastaISO, prefijos),
    baseRepartoHorasLogadas(desdeISO, hastaISO, prefijos),
    listaServicios(),
  ]);
  const excluidos = new Map(lineas.map((l) => [l.servicio, new Set(prefijosExcluidosReparto(l.servicio))]));
  return facturarHorasLogadas(lineas, horas, base, campaniasRepartoPorServicio(servicios), excluidos);
}

/**
 * Campañas que reciben el reparto de horas logadas de cada cliente: las de su
 * servicio, menos las que tienen config de campaña propia (las bbdd de GH se
 * facturan por contactos: es el «Tipo_Camp = VENTA» del Excel de operaciones).
 */
function campaniasRepartoPorServicio(
  servicios: ServicioConCampanias[],
): Map<string, Set<string>> {
  const { porCampania } = configuracionFacturacion();
  return new Map(
    servicios.map((s) => [s.servicio, new Set(s.campanias.filter((c) => !porCampania.has(c)))]),
  );
}

export interface FacturacionCompleta {
  unidades: UnidadesCampania[];
  /** Tarificación por campaña (minutos SIN redondear, incluidos los que no se cobran). */
  tarificacion: Map<string, TarificacionCampania>;
  /** Líneas por campaña según billing_config. */
  facturacion: FacturacionCampania[];
  /** Horas logadas por cliente con su reparto por campaña. */
  porCliente: FacturacionHorasLogadas[];
  /** La factura: una fila por campaña con todo lo que se le cobra. */
  factura: FilaFactura[];
}

/**
 * Toda la facturación de un rango y alcance: lo que enseña Operaciones, lo
 * que exporta y lo que se guarda al cerrar el mes (la misma función para los
 * tres, así no pueden discrepar).
 */
export async function facturacionCompleta(
  desdeISO: string,
  hastaISO: string,
  servicio: string | undefined,
  incluirIvr: boolean,
): Promise<FacturacionCompleta> {
  const [servicios, camp] = await Promise.all([listaServicios(), campaniasEfectivas(servicio, incluirIvr)]);
  const [unidades, diarias, minutos, porCliente] = await Promise.all([
    unidadesPorCampania(desdeISO, hastaISO, camp),
    // La misma consulta que la anterior (caché compartida): de aquí salen los
    // meses con llamadas de cada campaña, para los DDIs que solo se cobran así
    metricasDiariasPorCampania(desdeISO, hastaISO, camp),
    minutosLineaPorCampania(desdeISO, hastaISO, camp),
    // Horas logadas de los usuarios del cliente: no dependen de campañas ni del check IVR
    facturacionHorasLogadas(desdeISO, hastaISO, servicio),
  ]);
  const mesesConLlamadas = new Map<string, Set<string>>();
  for (const d of diarias) {
    if (d.interacciones <= 0) continue;
    const meses = mesesConLlamadas.get(d.campania) ?? new Set<string>();
    meses.add(d.fecha.slice(0, 7));
    mesesConLlamadas.set(d.campania, meses);
  }
  const mapa = mapaCampaniaServicio(servicios);
  const tarificacion = tarificacionPorCampania(minutos);
  const facturacion = calcularFacturacion(unidades, mapa, {
    tarificacion,
    ddisPorMes: ddisPorMes(ddisParaFacturar(camp), desdeISO, hastaISO),
    mesesConLlamadas,
  });
  const factura = consolidarFactura(facturacion, porCliente, mapa, mapaCodigosGs());
  return { unidades, tarificacion, facturacion, porCliente, factura };
}
