import { eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { billingConfig, type BillingConfigRow, type UnidadFacturacion } from "@/lib/db/schema";
import {
  facturarHorasLogadas,
  type FacturacionHorasLogadas,
  type LineaHorasLogadas,
} from "@/lib/facturacion-horas-logadas";
import { baseRepartoHorasLogadas, horasLogadasUsuarios } from "@/lib/rdb/queries/facturacion";
import type { UnidadesCampania } from "@/lib/rdb/types";

// ============================================================
// Lógica de facturación: cruza las unidades medidas en RDBv2
// con la configuración por campaña (billing_config de SQLite).
//
// Dos niveles:
//  - Por CAMPAÑA: horas productivas, atendidas, éxitos y leads.
//  - Por CLIENTE (servicio): horas logadas de sus usuarios. user_log no sabe
//    de campañas, así que esa línea no se reparte entre ellas.
// ============================================================

export const NOMBRE_UNIDAD: Record<UnidadFacturacion, string> = {
  horas: "Horas productivas (en llamada)",
  horas_logadas: "Horas logadas (usuarios del cliente)",
  interacciones: "Interacciones gestionadas (atendidas)",
  exitos: "Éxitos / ventas",
  leads: "Leads finalizados",
};

/** Unidades que se miden por campaña (todas menos las horas logadas). */
type UnidadPorCampania = Exclude<UnidadFacturacion, "horas_logadas">;

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
  /**
   * La config aplicada (la del servicio) factura por horas logadas: esas
   * horas van en la línea del cliente, no en la campaña.
   */
  porHorasLogadas: boolean;
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

function cantidadPara(unidad: UnidadPorCampania, medidas: UnidadesCampania): number {
  switch (unidad) {
    case "horas":
      // Horas PRODUCTIVAS por campaña (gestión real). Las logadas no se
      // pueden repartir por campaña (ag_in_cp_log las duplica ~×13 y
      // user_log no sabe de campañas): van por cliente, unidad horas_logadas.
      return medidas.horasProductivas;
    case "interacciones":
      // Gestionadas = ATENDIDAS (termination_state = 1), decidido 29/09/2026.
      // `medidas.interacciones` es COUNT(*) de hilos: incluye ocupado, no
      // contesta, número inválido... (+33 % el 22/09: 6.609 frente a 4.954).
      return medidas.atendidas;
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

    const lineas: LineaFacturable[] = config.flatMap((c) => {
      // Las horas logadas se facturan por cliente (facturacionHorasLogadas)
      if (c.unidad === "horas_logadas") return [];
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
      porHorasLogadas: config.some((c) => c.unidad === "horas_logadas"),
      importeTotal:
        conImporte.length > 0
          ? Math.round(conImporte.reduce((acc, l) => acc + (l.importe ?? 0), 0) * 100) / 100
          : null,
    };
  });
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
  // El total facturado sale de horasLogadasUsuarios; la base del reparto
  // estimado por campaña, de la misma user_log día a día más la gestión
  const [horas, base] = await Promise.all([
    horasLogadasUsuarios(desdeISO, hastaISO, prefijos),
    baseRepartoHorasLogadas(desdeISO, hastaISO, prefijos),
  ]);
  return facturarHorasLogadas(lineas, horas, base);
}
