import type { HorasLogadasUsuario } from "@/lib/rdb/types";

// ============================================================
// Facturación por HORAS LOGADAS de un cliente (unidad `horas_logadas`).
// Puro: sin I/O, para poder probarlo y reutilizarlo.
//
// Cuenta el tiempo efectivo logado (user_log: login → logout, haya o no
// campaña abierta) de los usuarios de Altitude DEL CLIENTE. Un usuario es del
// cliente si es exactamente <PREFIJO>_<nº 4 dígitos> (regla 15 de CLAUDE.md):
//  - GH_0851            → sí (cliente GH)
//  - GH_0851_BD, _BD_LX → no: con sufijo es otra línea (bbdd), que se factura
//                         por sus propias campañas
//  - GH_Cargador2       → no: no es un agente
//  - Angeles, TM_*      → no: no llevan el prefijo del cliente
// ============================================================

/** Prefijo válido: letras/dígitos en tramos separados por «_» (GH, Av, Soc_Fed). */
export const PATRON_PREFIJO_USUARIO = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$/;

/**
 * Patrón LIKE de SQL Server para los usuarios del cliente. El «_» del
 * prefijo se escapa (en LIKE es comodín). Solo admite prefijos validados.
 */
export function patronLikeUsuarios(prefijo: string): string {
  if (!PATRON_PREFIJO_USUARIO.test(prefijo)) {
    throw new Error(`Prefijo de usuario inválido: ${prefijo}`);
  }
  return `${prefijo.replaceAll("_", "[_]")}[_][0-9][0-9][0-9][0-9]`;
}

/**
 * Lo mismo que patronLikeUsuarios, en TypeScript. Sin distinguir mayúsculas,
 * como la intercalación de RDBv2.
 */
export function esUsuarioDelCliente(usuario: string, prefijo: string): boolean {
  if (!PATRON_PREFIJO_USUARIO.test(prefijo)) return false;
  return new RegExp(`^${prefijo}_\\d{4}$`, "i").test(usuario.trim());
}

/** Línea de configuración `horas_logadas` (ámbito servicio). */
export interface LineaHorasLogadas {
  servicio: string;
  prefijo: string;
  precioUnitario: number | null;
  notas: string | null;
}

export interface FacturacionHorasLogadas extends LineaHorasLogadas {
  /** Total del cliente, redondeado a 2 decimales (lo único que se redondea). */
  horas: number;
  importe: number | null;
  /** Detalle por usuario (horas a 2 decimales, solo para mostrar). */
  usuarios: { usuario: string; horas: number; sesiones: number }[];
}

const redondear2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Cruza las líneas de configuración con las horas por usuario. Suma SIN
 * redondear y redondea solo el total; el importe sale de la cantidad que se
 * muestra (horas a 2 decimales × precio), como el resto de líneas.
 */
export function facturarHorasLogadas(
  lineas: LineaHorasLogadas[],
  horas: HorasLogadasUsuario[],
): FacturacionHorasLogadas[] {
  return lineas.map((linea) => {
    const propias = horas
      .filter((h) => esUsuarioDelCliente(h.usuario, linea.prefijo))
      .sort((a, b) => a.usuario.localeCompare(b.usuario));
    const total = redondear2(propias.reduce((acc, h) => acc + h.horas, 0));
    return {
      ...linea,
      horas: total,
      importe: linea.precioUnitario == null ? null : redondear2(total * linea.precioUnitario),
      usuarios: propias.map((h) => ({
        usuario: h.usuario,
        horas: redondear2(h.horas),
        sesiones: h.sesiones,
      })),
    };
  });
}
