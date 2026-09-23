import { eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { billingConfig, type BillingConfigRow, type UnidadFacturacion } from "@/lib/db/schema";
import type { UnidadesCampania } from "@/lib/rdb/types";

// ============================================================
// Lógica de facturación: cruza las unidades medidas en RDBv2
// con la configuración por campaña (billing_config de SQLite).
// ============================================================

export const NOMBRE_UNIDAD: Record<UnidadFacturacion, string> = {
  horas: "Horas de agente (productivas)",
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
  /** Origen de la configuración aplicada: del servicio, de la campaña o ninguna. */
  ambito: "servicio" | "campania" | null;
  importeTotal: number | null;
}

export interface ConfigFacturacion {
  /** Líneas de ámbito campaña (excepción), por shortname. */
  porCampania: Map<string, BillingConfigRow[]>;
  /** Líneas de ámbito servicio (lo normal), por nombre de servicio. */
  porServicio: Map<string, BillingConfigRow[]>;
}

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

function cantidadPara(unidad: UnidadFacturacion, medidas: UnidadesCampania): number {
  switch (unidad) {
    case "horas":
      // Horas PRODUCTIVAS por campaña (gestión real). NO horas logadas: los
      // agentes blended las duplican entre campañas simultáneas (~×13). Las
      // horas logadas reales solo se reportan como cifra global.
      return medidas.horasProductivas;
    case "interacciones":
      return medidas.interacciones;
    case "exitos":
      return medidas.exitos;
    case "leads":
      return medidas.leadsFinalizados;
  }
}

/**
 * Combina medidas del rango con la configuración. Para cada campaña aplica,
 * por este orden: su config de campaña (excepción) → la de su servicio
 * (lo normal) → nada. `campaniaServicio` mapea campaña→servicio (cliente).
 */
export function calcularFacturacion(
  unidades: UnidadesCampania[],
  campaniaServicio: Map<string, string>,
): FacturacionCampania[] {
  const { porCampania, porServicio } = configuracionFacturacion();
  return unidades.map((medidas) => {
    const servicio = campaniaServicio.get(medidas.campania);
    const propias = porCampania.get(medidas.campania);
    const delServicio = servicio ? porServicio.get(servicio) : undefined;
    const config = propias ?? delServicio ?? [];
    const ambito: FacturacionCampania["ambito"] = propias
      ? "campania"
      : delServicio
        ? "servicio"
        : null;

    const lineas: LineaFacturable[] = config.map((c) => {
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
      ambito,
      importeTotal:
        conImporte.length > 0
          ? Math.round(conImporte.reduce((acc, l) => acc + (l.importe ?? 0), 0) * 100) / 100
          : null,
    };
  });
}
