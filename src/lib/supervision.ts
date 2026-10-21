import type { SeccionComparable } from "@/lib/comparador";
import type { RatiosCampania } from "@/lib/ratios-exito";
import { agruparPorTipoCampania, type TipoCampania } from "@/lib/resultados-actividad";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";

// ============================================================
// Supervisión (19/10/2026, pedido por Christian): la tabla de campañas de
// Tiempo real e Histórico agrupada por los tipos de campaña del cliente
// (Bolsas: cartera y resto; GH: BBDD y resto) con un total por grupo, y el
// comparador de dos campañas. Lógica PURA, con tests: corre también en el
// navegador (Tiempo real se refresca cada 60 s).
// ============================================================

function cociente(numerador: number, denominador: number, factor = 1): number | null {
  return denominador > 0 ? (numerador / denominador) * factor : null;
}

/**
 * Suma de varias campañas como si fueran una. SLA, cola y espera salen de
 * los RECUENTOS y las sumas exactas, nunca promediando los % o las medias ya
 * redondeados de cada campaña (regla 6.b y cola media de la auditoría del
 * 23/09). AHT y ACW, ponderados por las atendidas. Sin redondear.
 */
export function sumarKpis(kpis: KpiCampaniaHoy[], nombre: string): KpiCampaniaHoy {
  const s = (f: (k: KpiCampaniaHoy) => number) => kpis.reduce((acc, k) => acc + f(k), 0);
  const atendidasInbound = s((k) => k.atendidasInbound);
  const abandonadasInbound = s((k) => k.abandonadasInbound);
  const colaAtendidasTotalSeg = s((k) => k.colaAtendidasTotalSeg);
  const esperaAbandonadasTotalSeg = s((k) => k.esperaAbandonadasTotalSeg);
  const atendidasFueraSla = s((k) => k.atendidasFueraSla);
  const ponderada = (f: (k: KpiCampaniaHoy) => number | null) => {
    const con = kpis.filter((k) => f(k) != null);
    return cociente(
      con.reduce((acc, k) => acc + f(k)! * k.atendidas, 0),
      con.reduce((acc, k) => acc + k.atendidas, 0),
    );
  };
  return {
    campania: nombre,
    tipo: "",
    recibidas: s((k) => k.recibidas),
    atendidas: s((k) => k.atendidas),
    conversaciones: s((k) => k.conversaciones),
    contactos: s((k) => k.contactos),
    abandonadas: s((k) => k.abandonadas),
    atendidasInbound,
    abandonadasInbound,
    exitos: s((k) => k.exitos),
    ahtSeg: ponderada((k) => k.ahtSeg),
    acwSeg: ponderada((k) => k.acwSeg),
    colaMediaSeg: cociente(colaAtendidasTotalSeg, atendidasInbound),
    esperaAbandonadasSeg: cociente(esperaAbandonadasTotalSeg, abandonadasInbound),
    colaAtendidasTotalSeg,
    esperaAbandonadasTotalSeg,
    slaPct: cociente(atendidasInbound - atendidasFueraSla, atendidasInbound, 100),
    atendidasFueraSla,
  };
}

export interface GrupoKpis {
  /** Nombre del tipo, «Resto» o null si el cliente no tiene tipos. */
  nombre: string | null;
  kpis: KpiCampaniaHoy[];
  total: KpiCampaniaHoy;
}

/** Campañas por tipo de campaña del cliente, con el total de cada grupo. */
export function agruparKpisPorTipo(kpis: KpiCampaniaHoy[], tipos: TipoCampania[]): GrupoKpis[] {
  return agruparPorTipoCampania(kpis, tipos).map((g) => ({
    nombre: g.nombre,
    kpis: g.filas,
    total: sumarKpis(g.filas, `Total ${g.nombre ?? ""}`.trim()),
  }));
}

// ------------------------------------------------------------
// Comparador de dos campañas
// ------------------------------------------------------------

export type FilaCampaniaSupervision = {
  campania: string;
  servicio: string | null;
  tipo: string | null;
  recibidas: number;
  atendidas: number;
  atendidasInbound: number;
  abandonadasInbound: number;
  /** abandonadasInbound ÷ recibidas × 100 (regla 6.b). */
  pctAbandono: number | null;
  /** Desde los recuentos, sin el redondeo del slaPct de la campaña. */
  slaPct: number | null;
  colaMediaSeg: number | null;
  esperaAbandonadasSeg: number | null;
  ahtSeg: number | null;
  acwSeg: number | null;
  exitos: number;
  // De los ratios de éxito (regla 17)
  contactos: number;
  convContactosPct: number | null;
  convAtendidasPct: number | null;
  efectividadPct: number | null;
  /** Por hora con el script abierto: por campaña no hay horas logadas (regla 11). */
  llamadasHoraGuion: number | null;
  exitosHoraGuion: number | null;
  conversacionPorExitoSeg: number | null;
  gestionPorExitoSeg: number | null;
  gestionPorNoExitoSeg: number | null;
};

/**
 * Una fila por campaña con las cifras de la tabla y las de los ratios. Entran
 * las campañas de cualquiera de las dos fuentes. Orden: recibidas + atendidas.
 */
export function filasCampaniaSupervision(
  kpis: KpiCampaniaHoy[],
  ratios: RatiosCampania[],
  servicioDe: Record<string, string>,
): FilaCampaniaSupervision[] {
  const porKpi = new Map(kpis.map((k) => [k.campania, k]));
  const porRatio = new Map(ratios.map((r) => [r.campania, r]));
  return [...new Set([...porKpi.keys(), ...porRatio.keys()])]
    .map((campania) => {
      const k = porKpi.get(campania);
      const r = porRatio.get(campania);
      const recibidas = k?.recibidas ?? 0;
      const atendidasInbound = k?.atendidasInbound ?? 0;
      return {
        campania,
        servicio: servicioDe[campania] ?? null,
        tipo: k?.tipo || null,
        recibidas,
        atendidas: k?.atendidas ?? 0,
        atendidasInbound,
        abandonadasInbound: k?.abandonadasInbound ?? 0,
        pctAbandono: cociente(k?.abandonadasInbound ?? 0, recibidas, 100),
        slaPct: cociente(atendidasInbound - (k?.atendidasFueraSla ?? 0), atendidasInbound, 100),
        colaMediaSeg: k?.colaMediaSeg ?? null,
        esperaAbandonadasSeg: k?.esperaAbandonadasSeg ?? null,
        ahtSeg: k?.ahtSeg ?? null,
        acwSeg: k?.acwSeg ?? null,
        exitos: k?.exitos ?? r?.exitos ?? 0,
        contactos: r?.contactos ?? 0,
        convContactosPct: r?.convContactosPct ?? null,
        convAtendidasPct: r?.convAtendidasPct ?? null,
        efectividadPct: r?.efectividadPct ?? null,
        llamadasHoraGuion: r?.llamadasHoraGuion ?? null,
        exitosHoraGuion: r?.exitosHoraGuion ?? null,
        conversacionPorExitoSeg: r?.conversacionPorExitoSeg ?? null,
        gestionPorExitoSeg: r?.gestionPorExitoSeg ?? null,
        gestionPorNoExitoSeg: r?.gestionPorNoExitoSeg ?? null,
      };
    })
    .sort(
      (a, b) => b.recibidas + b.atendidas - (a.recibidas + a.atendidas) || a.campania.localeCompare(b.campania),
    );
}

export const METRICAS_SUPERVISION: SeccionComparable[] = [
  {
    seccion: "Volumen",
    metricas: [
      { clave: "recibidas", titulo: "Recibidas (entrantes)", formato: "entero", mejor: null },
      { clave: "atendidas", titulo: "Llamadas gestionadas", formato: "entero", mejor: null },
      { clave: "atendidasInbound", titulo: "Atendidas entrantes", formato: "entero", mejor: null },
      { clave: "abandonadasInbound", titulo: "Abandonadas (entrantes)", formato: "entero", mejor: null },
    ],
  },
  {
    seccion: "Servicio",
    metricas: [
      { clave: "slaPct", titulo: "SLA", formato: "pct", mejor: "alto" },
      { clave: "pctAbandono", titulo: "% abandono", formato: "pct", mejor: "bajo" },
      { clave: "colaMediaSeg", titulo: "Cola media (atendidas)", formato: "seg", mejor: "bajo" },
      { clave: "esperaAbandonadasSeg", titulo: "Espera de las abandonadas", formato: "seg", mejor: null },
      { clave: "ahtSeg", titulo: "AHT", formato: "seg", mejor: "bajo" },
      { clave: "acwSeg", titulo: "ACW", formato: "seg", mejor: "bajo" },
    ],
  },
  {
    seccion: "Éxitos",
    metricas: [
      { clave: "exitos", titulo: "Éxitos", formato: "entero", mejor: "alto" },
      { clave: "contactos", titulo: "Contactos trabajados", formato: "entero", mejor: null },
      { clave: "convContactosPct", titulo: "Conversión (contactos)", formato: "pct", mejor: "alto" },
      { clave: "convAtendidasPct", titulo: "% éxito por llamada", formato: "pct", mejor: "alto" },
      { clave: "efectividadPct", titulo: "Efectividad de cierre", formato: "pct", mejor: "alto" },
      { clave: "llamadasHoraGuion", titulo: "Llamadas por hora (script abierto)", formato: "decimal", mejor: null },
      { clave: "exitosHoraGuion", titulo: "Éxitos por hora (script abierto)", formato: "decimal", mejor: "alto" },
      { clave: "conversacionPorExitoSeg", titulo: "Conversación por éxito", formato: "seg", mejor: null },
      { clave: "gestionPorExitoSeg", titulo: "Gestión por éxito", formato: "seg", mejor: null },
      { clave: "gestionPorNoExitoSeg", titulo: "Gestión sin éxito", formato: "seg", mejor: null },
    ],
  },
];
