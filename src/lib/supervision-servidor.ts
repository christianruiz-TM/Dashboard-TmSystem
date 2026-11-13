import { umbralSlaSeg } from "@/lib/db/settings";
import { tiposCampaniaDe } from "@/lib/db/resultados";
import { hoyISO } from "@/lib/fechas";
import { calidadBaseDatos, type ResultadoCalidadBd } from "@/lib/calidad-bd";
import { callbackPeriodo } from "@/lib/callback-servidor";
import type { ResultadoCallback } from "@/lib/callback";
import { prefijoUsuariosDe } from "@/lib/facturacion";
import { alertasPlanificacion } from "@/lib/planificacion/seguimiento";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import { totalResultados } from "@/lib/resultados-cabecera";
import type { ResultadoSalientes } from "@/lib/salientes";
import { datosDeSeccion, type SeccionSupervision } from "@/lib/supervision-secciones";
import { calidadBaseDatosRango } from "@/lib/rdb/queries/calidad-bd";
import { ratiosExitoHoy, ratiosExitoRango } from "@/lib/rdb/queries/ratios-exito";
import { resumenSalientes } from "@/lib/rdb/queries/salientes";
import { campaniasDeServicio, campaniasEfectivas } from "@/lib/rdb/queries/servicios";
import {
  agentesHoy,
  agentesProductividadRango,
  estadoAgentes,
  kpisCampaniasHoy,
  kpisCampaniasRango,
  metricasIvr,
} from "@/lib/rdb/queries/supervision";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy, MetricasIvr } from "@/lib/rdb/types";

// ============================================================
// Datos de Supervisión por sección (12/11/2026, ver lib/supervision-secciones.ts).
// Común a la página y a la API de refresco de Tiempo real: las dos piden
// SOLO las consultas de la pestaña abierta. Lo que no se pide llega a null.
// ============================================================

type TotalResultados = Awaited<ReturnType<typeof totalResultados>>;

/** Lo que enseñan Tiempo real e Histórico; null = no es de la sección abierta. */
export interface DatosSupervisionPeriodo {
  kpis: KpiCampaniaHoy[] | null;
  /** Productividad de agentes. */
  top: AgenteHoy[] | null;
  ivr: MetricasIvr | null;
  /** Callback de los clientes que lo tienen (null también si no hay ninguno o falla). */
  callback: ResultadoCallback | null;
  ratios: ResultadoRatios | null;
  /** Totales de Resultados (contactos cerrados), para las cajas principales. */
  resultados: TotalResultados;
  salientes: ResultadoSalientes | null;
  calidad: ResultadoCalidadBd | null;
  umbral: number;
}

/** Tiempo real: además, la plantilla ahora y las alertas (la franja «Ahora», en todas las pestañas). */
export interface DatosSupervisionHoy extends DatosSupervisionPeriodo {
  agentes: AgenteEstado[];
  kpis: KpiCampaniaHoy[];
  plan: Awaited<ReturnType<typeof alertasPlanificacion>>;
  actualizado: string;
}

/** La consulta solo si la sección la pide. */
function si<T>(pedir: boolean, consulta: () => Promise<T>): Promise<T | null> {
  return pedir ? consulta() : Promise.resolve(null);
}

async function datosPeriodo(
  desde: string,
  hasta: string,
  servicio: string | undefined,
  incluirIvr: boolean,
  seccion: SeccionSupervision,
  enVivo: boolean,
): Promise<DatosSupervisionPeriodo> {
  const pide = datosDeSeccion(seccion, enVivo);
  const umbral = umbralSlaSeg();
  const camp = await campaniasEfectivas(servicio, incluirIvr);
  // Usuarios del cliente (GH_…): solo sus horas van a los totales (23/10/2026)
  const prefijo = prefijoUsuariosDe(servicio);
  const [kpis, top, ivr, ratios, intentos, resultados, salientes, callback] = await Promise.all([
    si(pide.has("kpis"), () => (enVivo ? kpisCampaniasHoy(umbral, camp) : kpisCampaniasRango(desde, hasta, umbral, camp))),
    si(pide.has("agentes"), () => (enVivo ? agentesHoy(camp) : agentesProductividadRango(desde, hasta, camp))),
    // La tarjeta del IVR usa siempre las campañas del servicio (IVR incluidas)
    si(pide.has("ivr"), async () => metricasIvr(desde, hasta, await campaniasDeServicio(servicio))),
    si(pide.has("ratios"), () => (enVivo ? ratiosExitoHoy(camp, prefijo) : ratiosExitoRango(desde, hasta, camp, prefijo))),
    si(pide.has("calidad"), () => calidadBaseDatosRango(desde, hasta, camp)),
    si(pide.has("resultados"), () => totalResultados(desde, hasta, camp, prefijo)),
    si(pide.has("salientes"), () => resumenSalientes(desde, hasta, camp, prefijo)),
    // Callback (12/11/2026): si falla, el panel sigue sin la sección
    si(pide.has("callback"), () =>
      callbackPeriodo(desde, hasta, servicio).catch((e) => {
        console.error("[supervision] callback:", e);
        return null;
      }),
    ),
  ]);
  // Los tipos de campaña del cliente agrupan la calidad por tipo
  const tipos = servicio ? tiposCampaniaDe(servicio) : [];
  return {
    kpis,
    top,
    ivr,
    callback,
    ratios,
    resultados: resultados ?? null,
    salientes,
    calidad: intentos ? calidadBaseDatos(intentos.filas, intentos.contactos, tipos) : null,
    umbral,
  };
}

/** Supervisión → Tiempo real (hoy): la página y el refresco cada 60 s. */
export async function datosSupervisionHoy(
  servicio: string | undefined,
  incluirIvr: boolean,
  seccion: SeccionSupervision,
): Promise<DatosSupervisionHoy> {
  const hoy = hoyISO();
  const camp = await campaniasEfectivas(servicio, incluirIvr);
  const [periodo, agentes, plan] = await Promise.all([
    datosPeriodo(hoy, hoy, servicio, incluirIvr, seccion, true),
    estadoAgentes(camp),
    alertasPlanificacion(),
  ]);
  return { ...periodo, kpis: periodo.kpis ?? [], agentes, plan, actualizado: new Date().toISOString() };
}

/** Supervisión → Histórico (rango de fechas). */
export function datosSupervisionRango(
  desde: string,
  hasta: string,
  servicio: string | undefined,
  incluirIvr: boolean,
  seccion: SeccionSupervision,
): Promise<DatosSupervisionPeriodo> {
  return datosPeriodo(desde, hasta, servicio, incluirIvr, seccion, false);
}
