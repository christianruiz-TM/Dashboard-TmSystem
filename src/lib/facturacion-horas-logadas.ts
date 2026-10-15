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
  /** Reparto por campaña (repartirHorasLogadas); vacío sin base. */
  campanias: RepartoCampania[];
}

/**
 * Una fila del reparto de las horas logadas de un cliente. `campania` null
 * solo si hubo horas logadas y ningún tiempo de agente en sus campañas.
 */
export interface RepartoCampania {
  campania: string | null;
  /** Tiempo de agente de los usuarios del cliente en la campaña (el peso). */
  horasAgente: number;
  /** % sobre el tiempo de agente de esos usuarios (null en la fila sin campaña). */
  pctAgente: number | null;
  /** Horas logadas que le tocan. Suman exactamente el total del cliente. */
  horasLogadas: number;
  /** Su parte del importe: lo que va al albarán de la campaña. */
  importe: number | null;
}

/**
 * Reparte las horas logadas de un cliente entre sus campañas con el método
 * del Excel de facturación de operaciones (decidido 14/10/2026): el TOTAL del
 * rango, de una vez, en proporción al tiempo de agente de sus usuarios en
 * cada campaña (baseRepartoHorasLogadas). Todo va a alguna campaña, así que
 * cada hora tiene su albarán.
 *
 * `campaniasCliente`: las campañas que pueden recibir horas (las del servicio
 * de la línea que no tienen config propia, como las bbdd, que se facturan a
 * su manera). Sin ella, todas las del tiempo de agente.
 * `prefijosExcluidos`: números (4 primeros caracteres) cuyo tiempo no cuenta
 * para el reparto, como el segmentador del Excel (lista del cliente).
 *
 * Se suma sin redondear y al final se redondea a centésimas por el método
 * del mayor resto, para que las filas sumen EXACTAMENTE `totalHoras` (el
 * total que se factura, ya redondeado). El Excel redondeaba cada campaña y
 * corregía la diferencia a mano.
 */
export function repartirHorasLogadas(
  base: BaseRepartoHorasLogadas,
  prefijo: string,
  totalHoras: number,
  precioUnitario: number | null,
  campaniasCliente?: ReadonlySet<string>,
  prefijosExcluidos?: ReadonlySet<string>,
): RepartoCampania[] {
  const peso = new Map<string, number>();
  for (const f of base.tiempoAgente) {
    if (!esUsuarioDelCliente(f.usuario, prefijo) || f.horas <= 0) continue;
    if (campaniasCliente && !campaniasCliente.has(f.campania)) continue;
    if (prefijosExcluidos?.has(f.prefijo)) continue;
    peso.set(f.campania, (peso.get(f.campania) ?? 0) + f.horas);
  }
  const totalPeso = [...peso.values()].reduce((a, b) => a + b, 0);
  const objetivo = Math.round(totalHoras * 100);

  if (totalPeso <= 0) {
    // Horas logadas sin ninguna llamada en sus campañas: no se inventa el reparto
    if (objetivo <= 0) return [];
    return [{ campania: null, horasAgente: 0, pctAgente: null, horasLogadas: objetivo / 100, importe: importeDe(objetivo / 100, precioUnitario) }];
  }

  const claves = [...peso.keys()];
  const centesimas = mayorResto(
    claves.map((k) => ((peso.get(k) ?? 0) / totalPeso) * objetivo),
    objetivo,
  );
  return claves
    .map((k, i) => {
      const horasLogadas = centesimas[i] / 100;
      return {
        campania: k,
        horasAgente: redondear2(peso.get(k) ?? 0),
        pctAgente: redondear2((100 * (peso.get(k) ?? 0)) / totalPeso),
        horasLogadas,
        importe: importeDe(horasLogadas, precioUnitario),
      };
    })
    .sort((a, b) => b.horasLogadas - a.horasLogadas || a.campania.localeCompare(b.campania));
}

/**
 * Lista de prefijos excluidos escrita a mano («0673, 0716 8259…»): números de
 * 1 a 4 cifras separados por comas, espacios o saltos de línea. Sin
 * repetidos y ordenada; null si algo no es un número así.
 */
export function leerPrefijosExcluidos(texto: string): string[] | null {
  const trozos = texto.split(/[\s,;]+/).filter(Boolean);
  if (trozos.some((t) => !/^\d{1,4}$/.test(t))) return null;
  return [...new Set(trozos)].sort();
}

function importeDe(horas: number, precioUnitario: number | null): number | null {
  return precioUnitario == null ? null : redondear2(horas * precioUnitario);
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
 * `campaniasPorServicio` y `excluidosPorServicio`: las campañas que pueden
 * recibir el reparto de cada cliente y los prefijos que no cuentan (ver
 * repartirHorasLogadas).
 */
export function facturarHorasLogadas(
  lineas: LineaHorasLogadas[],
  horas: HorasLogadasUsuario[],
  base?: BaseRepartoHorasLogadas,
  campaniasPorServicio?: ReadonlyMap<string, ReadonlySet<string>>,
  excluidosPorServicio?: ReadonlyMap<string, ReadonlySet<string>>,
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
      campanias: base
        ? repartirHorasLogadas(
            base,
            linea.prefijo,
            total,
            linea.precioUnitario,
            campaniasPorServicio?.get(linea.servicio),
            excluidosPorServicio?.get(linea.servicio),
          )
        : [],
    };
  });
}
