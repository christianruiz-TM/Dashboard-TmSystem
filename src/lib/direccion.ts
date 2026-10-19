import type { RatiosCampania } from "@/lib/ratios-exito";
import { tipoDeCampania, type TipoCampania } from "@/lib/resultados-actividad";
import type { UnidadesCampania, VolumenCampania } from "@/lib/rdb/types";

// ============================================================
// Panel de Dirección (19/10/2026, pedido por Christian): una fila por
// campaña con todo lo que se enseña de ella, el resumen por cliente (vista
// sin cliente elegido), los grupos de campañas con subtotales (Bolsas:
// cartera y resto, con los «tipos de campaña» del cliente) y las métricas
// del comparador de dos campañas. Lógica PURA, con tests: la usan la página
// (servidor) y el comparador (navegador).
// ============================================================

export interface FilaCampaniaDireccion {
  campania: string;
  /** Cliente (servicio) de la campaña; null si no tiene. */
  servicio: string | null;
  /** Tipo de campaña de Altitude (Inbound, Outbound, Blended…). */
  tipo: string | null;
  interacciones: number;
  inbound: number;
  outbound: number;
  atendidas: number;
  abandonadasInbound: number;
  /** abandonadasInbound ÷ inbound × 100 (regla 6.b). */
  pctAbandono: number | null;
  ahtSeg: number | null;
  horasProductivas: number;
  /** Contactos cerrados (activity.status = 3), los «finalizados» de facturación. */
  finalizados: number;
  // De los ratios de éxito (sesiones de script de agentes, regla 17)
  contactos: number;
  exitos: number;
  convContactosPct: number | null;
  convAtendidasPct: number | null;
  efectividadPct: number | null;
  exitosHoraProductiva: number | null;
  conversacionPorExitoSeg: number | null;
  gestionPorExitoSeg: number | null;
}

/** Sumas de un conjunto de campañas (cliente, grupo o total). Sin redondear. */
export interface TotalesCampanias {
  campanias: number;
  interacciones: number;
  inbound: number;
  outbound: number;
  atendidas: number;
  abandonadasInbound: number;
  pctAbandono: number | null;
  /** Media de los AHT de cada campaña ponderada por sus atendidas. */
  ahtSeg: number | null;
  horasProductivas: number;
  finalizados: number;
  contactos: number;
  exitos: number;
  convContactosPct: number | null;
}

function cociente(numerador: number, denominador: number, factor = 1): number | null {
  return denominador > 0 ? (numerador / denominador) * factor : null;
}

/**
 * Junta las tres fuentes de la página por campaña. Entran TODAS las campañas
 * de cualquiera de ellas: una lista que solo cierra contactos en el período
 * (sin llamadas) también tiene finalizados. Orden: interacciones, de más a menos.
 */
export function filasCampaniaDireccion(
  volumen: VolumenCampania[],
  unidades: UnidadesCampania[],
  ratios: RatiosCampania[],
  servicioDe: Map<string, string>,
): FilaCampaniaDireccion[] {
  const vol = new Map(volumen.map((v) => [v.campania, v]));
  const uni = new Map(unidades.map((u) => [u.campania, u]));
  const rat = new Map(ratios.map((r) => [r.campania, r]));
  const nombres = new Set([...vol.keys(), ...uni.keys(), ...rat.keys()]);
  return [...nombres]
    .map((campania) => {
      const v = vol.get(campania);
      const u = uni.get(campania);
      const r = rat.get(campania);
      const inbound = v?.inbound ?? 0;
      const abandonadasInbound = v?.abandonadasInbound ?? 0;
      return {
        campania,
        servicio: servicioDe.get(campania) ?? null,
        tipo: v?.tipo ?? null,
        interacciones: v?.total ?? 0,
        inbound,
        outbound: v?.outbound ?? 0,
        atendidas: v?.atendidas ?? 0,
        abandonadasInbound,
        pctAbandono: cociente(abandonadasInbound, inbound, 100),
        ahtSeg: v?.ahtSeg ?? null,
        horasProductivas: u?.horasProductivas ?? 0,
        finalizados: u?.leadsFinalizados ?? 0,
        contactos: r?.contactos ?? 0,
        exitos: r?.exitos ?? 0,
        convContactosPct: r?.convContactosPct ?? null,
        convAtendidasPct: r?.convAtendidasPct ?? null,
        efectividadPct: r?.efectividadPct ?? null,
        exitosHoraProductiva: r?.exitosHoraProductiva ?? null,
        conversacionPorExitoSeg: r?.conversacionPorExitoSeg ?? null,
        gestionPorExitoSeg: r?.gestionPorExitoSeg ?? null,
      };
    })
    .sort((a, b) => b.interacciones - a.interacciones || a.campania.localeCompare(b.campania));
}

export function sumarCampanias(filas: FilaCampaniaDireccion[]): TotalesCampanias {
  const s = (f: (x: FilaCampaniaDireccion) => number) => filas.reduce((acc, x) => acc + f(x), 0);
  const inbound = s((x) => x.inbound);
  const abandonadasInbound = s((x) => x.abandonadasInbound);
  const conAht = filas.filter((x) => x.ahtSeg != null);
  const atendidasAht = conAht.reduce((acc, x) => acc + x.atendidas, 0);
  const contactos = s((x) => x.contactos);
  const exitos = s((x) => x.exitos);
  return {
    campanias: filas.length,
    interacciones: s((x) => x.interacciones),
    inbound,
    outbound: s((x) => x.outbound),
    atendidas: s((x) => x.atendidas),
    abandonadasInbound,
    pctAbandono: cociente(abandonadasInbound, inbound, 100),
    ahtSeg: cociente(conAht.reduce((acc, x) => acc + x.ahtSeg! * x.atendidas, 0), atendidasAht),
    horasProductivas: s((x) => x.horasProductivas),
    finalizados: s((x) => x.finalizados),
    contactos,
    exitos,
    convContactosPct: cociente(exitos, contactos, 100),
  };
}

export interface FilaCliente extends TotalesCampanias {
  /** null = campañas sin cliente. */
  servicio: string | null;
  /** Unión de las sesiones en sus campañas (horasLogadasPorServicio). */
  horasLogadas: number | null;
}

/**
 * Una fila por cliente (vista de Dirección sin cliente elegido). Las campañas
 * sin cliente van al final, en su propia fila. Las horas logadas no se suman
 * por campaña (regla 11): llegan ya por cliente.
 */
export function resumenPorCliente(
  filas: FilaCampaniaDireccion[],
  horasPorServicio: Map<string, number>,
): FilaCliente[] {
  const grupos = new Map<string | null, FilaCampaniaDireccion[]>();
  for (const f of filas) grupos.set(f.servicio, [...(grupos.get(f.servicio) ?? []), f]);
  return [...grupos]
    .map(([servicio, suyas]) => ({
      servicio,
      ...sumarCampanias(suyas),
      horasLogadas: servicio != null ? (horasPorServicio.get(servicio) ?? 0) : null,
    }))
    .sort((a, b) => {
      if ((a.servicio == null) !== (b.servicio == null)) return a.servicio == null ? 1 : -1;
      return b.interacciones - a.interacciones || (a.servicio ?? "").localeCompare(b.servicio ?? "");
    });
}

export interface GrupoCampanias {
  /** Nombre del tipo, «Resto» o null si el cliente no tiene tipos. */
  nombre: string | null;
  filas: FilaCampaniaDireccion[];
  total: TotalesCampanias;
}

/**
 * Agrupa las campañas por los tipos de campaña del cliente (los mismos de
 * Resultados, en /admin/resultados; Bolsas: «Cartera» = Bol_ + 3-4 cifras),
 * en el orden configurado y con el «Resto» al final. Sin tipos, un solo
 * grupo sin nombre. Los grupos sin campañas no salen.
 */
export function agruparPorTipo(filas: FilaCampaniaDireccion[], tipos: TipoCampania[]): GrupoCampanias[] {
  if (tipos.length === 0) return [{ nombre: null, filas, total: sumarCampanias(filas) }];
  const porTipo = new Map<string, FilaCampaniaDireccion[]>();
  for (const f of filas) {
    const t = tipoDeCampania(f.campania, tipos) ?? "";
    porTipo.set(t, [...(porTipo.get(t) ?? []), f]);
  }
  return [...tipos.map((t) => t.nombre), ""]
    .filter((n) => (porTipo.get(n)?.length ?? 0) > 0)
    .map((n) => {
      const suyas = porTipo.get(n)!;
      return { nombre: n || "Resto", filas: suyas, total: sumarCampanias(suyas) };
    });
}

// ------------------------------------------------------------
// Comparador de dos campañas
// ------------------------------------------------------------

export type FormatoMetrica = "entero" | "pct" | "seg" | "horas" | "decimal";

type ClaveNumerica = {
  [K in keyof FilaCampaniaDireccion]: FilaCampaniaDireccion[K] extends number | null ? K : never;
}[keyof FilaCampaniaDireccion];

export interface MetricaComparable {
  clave: ClaveNumerica;
  titulo: string;
  formato: FormatoMetrica;
  /** Qué es mejor, para resaltar; null = es volumen, no hay mejor ni peor. */
  mejor: "alto" | "bajo" | null;
}

export const METRICAS_COMPARACION: { seccion: string; metricas: MetricaComparable[] }[] = [
  {
    seccion: "Volumen",
    metricas: [
      { clave: "interacciones", titulo: "Interacciones", formato: "entero", mejor: null },
      { clave: "inbound", titulo: "Entrantes", formato: "entero", mejor: null },
      { clave: "outbound", titulo: "Salientes", formato: "entero", mejor: null },
      { clave: "atendidas", titulo: "Atendidas", formato: "entero", mejor: null },
      { clave: "abandonadasInbound", titulo: "Abandonadas (entrantes)", formato: "entero", mejor: null },
      { clave: "pctAbandono", titulo: "% abandono (entrantes)", formato: "pct", mejor: "bajo" },
      { clave: "finalizados", titulo: "Finalizados", formato: "entero", mejor: null },
    ],
  },
  {
    seccion: "Tiempos",
    metricas: [
      { clave: "ahtSeg", titulo: "AHT", formato: "seg", mejor: "bajo" },
      { clave: "horasProductivas", titulo: "Horas productivas", formato: "horas", mejor: null },
      { clave: "conversacionPorExitoSeg", titulo: "Conversación por éxito", formato: "seg", mejor: null },
      { clave: "gestionPorExitoSeg", titulo: "Gestión por éxito", formato: "seg", mejor: null },
    ],
  },
  {
    seccion: "Éxitos",
    metricas: [
      { clave: "contactos", titulo: "Contactos gestionados", formato: "entero", mejor: null },
      { clave: "exitos", titulo: "Éxitos", formato: "entero", mejor: "alto" },
      { clave: "convContactosPct", titulo: "Conversión (contactos)", formato: "pct", mejor: "alto" },
      { clave: "convAtendidasPct", titulo: "Conversión (atendidas)", formato: "pct", mejor: "alto" },
      { clave: "efectividadPct", titulo: "Efectividad de cierre", formato: "pct", mejor: "alto" },
      { clave: "exitosHoraProductiva", titulo: "Éxitos por hora productiva", formato: "decimal", mejor: "alto" },
    ],
  },
];

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Formato de una métrica; con `signo`, para una diferencia (+/−). */
export function formatearMetrica(valor: number | null, formato: FormatoMetrica, signo = false): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  const pre = signo && valor > 0 ? "+" : "";
  if (formato === "entero") return pre + Math.round(valor).toLocaleString("es-ES");
  const num = pre + valor.toLocaleString("es-ES", DOS);
  if (formato === "pct") return signo ? `${num} p.p.` : `${num} %`;
  if (formato === "seg") return `${num} s`;
  if (formato === "horas") return `${num} h`;
  return num;
}

/**
 * Cuál de las dos es mejor en una métrica: «a», «b» o null (sin criterio,
 * empate o sin datos).
 */
export function mejorDeDos(a: number | null, b: number | null, mejor: MetricaComparable["mejor"]): "a" | "b" | null {
  if (mejor == null || a == null || b == null || a === b) return null;
  return (mejor === "alto") === a > b ? "a" : "b";
}
