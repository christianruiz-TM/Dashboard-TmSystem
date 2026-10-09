import type { BaseRepartoHorasLogadas, HorasLogadasUsuario } from "@/lib/rdb/types";

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
  /** Reparto ESTIMADO por campaña (repartirHorasLogadas); vacío sin base. */
  campanias: RepartoCampania[];
}

/**
 * Una fila del reparto estimado de las horas logadas de un cliente.
 * `campania` null = tiempo logado en días sin ninguna llamada atendida.
 */
export interface RepartoCampania {
  campania: string | null;
  /** Gestión de las atendidas de los usuarios del cliente en la campaña. */
  horasProductivas: number;
  /** % sobre lo productivo de esos usuarios (null en la fila sin actividad). */
  pctProductivo: number | null;
  /** Horas logadas que le tocan. Suman exactamente el total del cliente. */
  horasLogadas: number;
  /** Su parte del importe (informativa: se factura el total del cliente). */
  importe: number | null;
}

/**
 * Reparte las horas logadas de un cliente entre sus campañas (decidido
 * 09/10/2026): por USUARIO y DÍA, lo logado se reparte en proporción a su
 * tiempo productivo en cada campaña ese día. Un día logado sin ninguna
 * atendida va a la fila «sin actividad» (campania null): no se inventa a qué
 * campaña asignarlo.
 *
 * Se suma sin redondear y al final se redondea a centésimas por el método
 * del mayor resto, para que las filas sumen EXACTAMENTE `totalHoras` (el
 * total que se factura, ya redondeado).
 */
export function repartirHorasLogadas(
  base: BaseRepartoHorasLogadas,
  prefijo: string,
  totalHoras: number,
  precioUnitario: number | null,
): RepartoCampania[] {
  const delCliente = (u: string) => esUsuarioDelCliente(u, prefijo);
  const prodDia = new Map<string, Map<string, number>>();
  const productivas = new Map<string, number>();
  for (const p of base.productivo) {
    if (!delCliente(p.usuario) || p.horas <= 0) continue;
    const k = `${p.usuario.toUpperCase()}|${p.fecha}`;
    const dia = prodDia.get(k) ?? new Map<string, number>();
    dia.set(p.campania, (dia.get(p.campania) ?? 0) + p.horas);
    prodDia.set(k, dia);
    productivas.set(p.campania, (productivas.get(p.campania) ?? 0) + p.horas);
  }

  // Clave de la fila sin actividad: con espacios y paréntesis, no puede ser un shortname
  const SIN = "(sin actividad en campaña)";
  const logadas = new Map<string, number>();
  for (const l of base.logado) {
    if (!delCliente(l.usuario) || l.horas <= 0) continue;
    const dia = prodDia.get(`${l.usuario.toUpperCase()}|${l.fecha}`);
    const totalDia = dia ? [...dia.values()].reduce((a, b) => a + b, 0) : 0;
    if (!dia || totalDia <= 0) {
      logadas.set(SIN, (logadas.get(SIN) ?? 0) + l.horas);
      continue;
    }
    for (const [camp, h] of dia) logadas.set(camp, (logadas.get(camp) ?? 0) + (l.horas * h) / totalDia);
  }

  const claves = [...new Set([...productivas.keys(), ...logadas.keys()])];
  if (claves.length === 0) return [];
  const centesimas = mayorResto(
    claves.map((k) => (logadas.get(k) ?? 0) * 100),
    Math.round(totalHoras * 100),
  );
  const totalProd = [...productivas.values()].reduce((a, b) => a + b, 0);
  return claves
    .map((k, i) => {
      const horasLogadas = centesimas[i] / 100;
      const esSin = k === SIN;
      return {
        campania: esSin ? null : k,
        horasProductivas: redondear2(productivas.get(k) ?? 0),
        pctProductivo: esSin || totalProd <= 0 ? null : redondear2((100 * (productivas.get(k) ?? 0)) / totalProd),
        horasLogadas,
        importe: precioUnitario == null ? null : redondear2(horasLogadas * precioUnitario),
      };
    })
    .sort(
      (a, b) =>
        Number(a.campania == null) - Number(b.campania == null) ||
        b.horasLogadas - a.horasLogadas ||
        (a.campania ?? "").localeCompare(b.campania ?? ""),
    );
}

/**
 * Enteros que suman `objetivo`, lo más cerca posible de `valores` (que
 * deberían sumar casi lo mismo): suelo de cada uno y el resto, de uno en uno,
 * a los de mayor parte decimal. Si la suma de valores se aleja del objetivo,
 * la diferencia se reparte igual (o se quita de los mayores restos).
 */
function mayorResto(valores: number[], objetivo: number): number[] {
  const suelos = valores.map((v) => Math.floor(v));
  let falta = objetivo - suelos.reduce((a, b) => a + b, 0);
  const orden = valores
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let j = 0; falta > 0; j = (j + 1) % orden.length, falta--) suelos[orden[j].i]++;
  for (let j = orden.length - 1; falta < 0; j = (j - 1 + orden.length) % orden.length) {
    if (suelos[orden[j].i] > 0) {
      suelos[orden[j].i]--;
      falta++;
    }
  }
  return suelos;
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
  base?: BaseRepartoHorasLogadas,
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
      campanias: base ? repartirHorasLogadas(base, linea.prefijo, total, linea.precioUnitario) : [],
    };
  });
}
