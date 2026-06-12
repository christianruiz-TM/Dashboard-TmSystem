import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { billingConfig, type BillingConfigRow, type UnidadFacturacion } from "@/lib/db/schema";
import type { UnidadesCampania } from "@/lib/rdb/types";

// ============================================================
// Lógica de facturación: cruza las unidades medidas en RDBv2
// con la configuración por campaña (billing_config de SQLite).
// ============================================================

export const NOMBRE_UNIDAD: Record<UnidadFacturacion, string> = {
  horas: "Horas de agente (logadas)",
  interacciones: "Interacciones gestionadas",
  exitos: "Éxitos / ventas",
  leads: "Leads finalizados",
};

export interface LineaFacturable {
  unidad: UnidadFacturacion;
  cantidad: number;
  precioUnitario: number | null;
  importe: number | null; // null si no hay precio configurado
  notas: string | null;
}

export interface FacturacionCampania {
  campania: string;
  medidas: UnidadesCampania;
  /** Líneas según billing_config (vacío si la campaña no está configurada). */
  lineas: LineaFacturable[];
  importeTotal: number | null;
}

/** Configuración de facturación activa, agrupada por campaña. */
export function configuracionFacturacion(): Map<string, BillingConfigRow[]> {
  const filas = db
    .select()
    .from(billingConfig)
    .where(eq(billingConfig.activo, true))
    .orderBy(asc(billingConfig.campaignShortname))
    .all();
  const mapa = new Map<string, BillingConfigRow[]>();
  for (const fila of filas) {
    const lista = mapa.get(fila.campaignShortname) ?? [];
    lista.push(fila);
    mapa.set(fila.campaignShortname, lista);
  }
  return mapa;
}

function cantidadPara(unidad: UnidadFacturacion, medidas: UnidadesCampania): number {
  switch (unidad) {
    case "horas":
      return medidas.horasLogadas;
    case "interacciones":
      return medidas.interacciones;
    case "exitos":
      return medidas.exitos;
    case "leads":
      return medidas.leadsFinalizados;
  }
}

/** Combina medidas del rango con la configuración por campaña. */
export function calcularFacturacion(unidades: UnidadesCampania[]): FacturacionCampania[] {
  const config = configuracionFacturacion();
  return unidades.map((medidas) => {
    const lineas: LineaFacturable[] = (config.get(medidas.campania) ?? []).map((c) => {
      const cantidad = cantidadPara(c.unidad, medidas);
      const importe =
        c.precioUnitario == null ? null : Math.round(cantidad * c.precioUnitario * 100) / 100;
      return {
        unidad: c.unidad,
        cantidad,
        precioUnitario: c.precioUnitario,
        importe,
        notas: c.notas,
      };
    });
    const conImporte = lineas.filter((l) => l.importe != null);
    return {
      campania: medidas.campania,
      medidas,
      lineas,
      importeTotal:
        conImporte.length > 0
          ? Math.round(conImporte.reduce((acc, l) => acc + (l.importe ?? 0), 0) * 100) / 100
          : null,
    };
  });
}
