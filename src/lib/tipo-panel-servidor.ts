import { filtraPanelesPorTipo, tiposCampaniaDe } from "@/lib/db/resultados";
import { configuracionFacturacion } from "@/lib/facturacion";
import { facturaPorHoras } from "@/lib/facturacion-campania";
import { campaniasEfectivas } from "@/lib/rdb/queries/servicios";
import type { TipoCampania } from "@/lib/resultados-actividad";
import {
  SIN_FILTRO_TIPO,
  campaniasDelTipo,
  leerFiltroTipo,
  sinHorasDelTipo,
  type FiltroTipo,
} from "@/lib/tipo-panel";

// ============================================================
// Alcance de un panel con el filtro de tipo de campaña (17/11/2026, ver
// lib/tipo-panel.ts): la misma resolución en Supervisión (página y refresco),
// Dirección, Operaciones y el precalentado, para que todos pidan las MISMAS
// campañas (y así compartan caché).
// ============================================================

export interface AlcanceTipo {
  /** Campañas a consultar, ya del tipo elegido (undefined = todos los clientes). */
  campanias: string[] | undefined;
  /** Campañas del cliente entero (sin el filtro de tipo), para lo que es del cliente entero. */
  campaniasCliente: string[] | undefined;
  /** Tipos de campaña del cliente (agrupan las tablas aunque el panel no filtre). */
  tipos: TipoCampania[];
  /** El selector (sin opciones si este cliente no filtra los paneles por tipo). */
  filtro: FiltroTipo;
  /** Con «Solo BBDD» en GH: ni horas logadas ni «por hora». */
  sinHoras: boolean;
  /** ¿Salen los usuarios del cliente logados sin actividad? Solo con el cliente entero («Todas»). */
  sinActividad: boolean;
}

/** El filtro de tipo de un cliente en los paneles (sin cliente, ninguno). */
export function filtroTipoPanel(servicio: string | undefined, valor: string | null | undefined): FiltroTipo {
  if (!servicio || !filtraPanelesPorTipo(servicio)) return SIN_FILTRO_TIPO;
  return leerFiltroTipo(valor, tiposCampaniaDe(servicio), true);
}

/** ¿Sin horas? (todas las campañas del tipo se facturan sin horas). */
export function sinHorasPanel(servicio: string | undefined, campanias: string[] | undefined, filtro: FiltroTipo): boolean {
  if (!servicio) return false;
  const config = configuracionFacturacion();
  return sinHorasDelTipo(campanias, filtro.tipo, (c) => facturaPorHoras(config, c, servicio));
}

export async function alcanceTipo(
  servicio: string | undefined,
  incluirIvr: boolean,
  valorTipo: string | null | undefined,
): Promise<AlcanceTipo> {
  const campaniasCliente = await campaniasEfectivas(servicio, incluirIvr);
  const tipos = servicio ? tiposCampaniaDe(servicio) : [];
  const filtro = filtroTipoPanel(servicio, valorTipo);
  const campanias = campaniasDelTipo(campaniasCliente, tipos, filtro.tipo);
  return {
    campanias,
    campaniasCliente,
    tipos,
    filtro,
    sinHoras: sinHorasPanel(servicio, campanias, filtro),
    sinActividad: filtro.tipo === "todas",
  };
}
