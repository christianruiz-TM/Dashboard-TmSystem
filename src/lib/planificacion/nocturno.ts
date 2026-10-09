import { desplazarMes, diaSemana, fechasDelMes, lunesDe, sumarDias } from "./motor/calendario";
import type { BloqueBasico, ObjetivoSemana } from "./motor/tipos";

// ============================================================
// Tarea nocturna de planificación (F5): QUÉ toca hacer cada noche según la
// fecha. PURO (misma regla de ESLint que el motor): recibe «hoy» y el estado
// guardado y devuelve las decisiones; tarea-nocturna.ts las ejecuta. Si una
// noche no se ejecuta, la siguiente se pone al día sola.
//
//   1. Agregados: desde el día siguiente al último agregado (como mucho
//      MAX_DIAS_AGREGADOS atrás) hasta ayer. Ayer se repite siempre: cada
//      lote reemplaza sus días, así que repetir no duplica nada.
//   2. A partir del día plan.diaGeneracion (20), borrador del mes siguiente
//      si no tiene ni borrador ni publicada.
//   3. Una vez por semana (el lunes; si esa noche no se ejecutó, la primera
//      de la semana que lo haga), recálculo de las semanas que aún no han
//      empezado: desde el lunes que viene, del mes actual y del siguiente.
//      Los días anteriores se conservan tal cual; en los siguientes se
//      respetan los bloques fijados y los cambiados a mano. El resultado es
//      siempre un BORRADOR: lo publicado no se toca.
// ============================================================

/** Autor de las versiones y de la auditoría de la tarea nocturna. */
export const AUTOR_NOCTURNO = "tarea nocturna";

export type NombrePaso = "agregados" | "generar" | "recalcular";

export interface PasoNocturno {
  paso: NombrePaso;
  ok: boolean;
  texto: string;
}

/** Lo que queda guardado de cada ejecución (para /admin y /planificacion). */
export interface EjecucionNocturna {
  /** Instantes de inicio y fin (ISO). */
  inicio: string;
  fin: string;
  /** Fecha para la que se ejecutó (YYYY-MM-DD local). */
  hoy: string;
  ok: boolean;
  pasos: PasoNocturno[];
}

/** Días hacia atrás que se ponen al día como mucho si la tarea dejó de ejecutarse. */
export const MAX_DIAS_AGREGADOS = 31;

export interface VersionNocturno {
  mes: string;
  estado: string;
}

export interface EstadoNocturno {
  /** Fecha de hoy (YYYY-MM-DD, hora local). */
  hoy: string;
  diaGeneracion: number;
  /** Último día con agregados de planificación (null = ninguno). */
  ultimoAgregado: string | null;
  /** Lunes de la última semana ya recalculada (null = nunca). */
  ultimoRecalculo: string | null;
  versiones: readonly VersionNocturno[];
  /** Recalcular aunque esta semana ya se haya hecho o no sea lunes (a mano, con --forzar-recalculo). */
  forzarRecalculo?: boolean;
}

export interface DecisionNocturno {
  agregados: { desde: string; hasta: string };
  /** Mes del que crear el borrador (null = nada). */
  generar: string | null;
  /** Meses que recalcular y primer día de cada uno. */
  recalcular: { mes: string; desde: string }[];
  /** ¿Toca el recálculo de esta semana? (aunque no haya meses con plan) */
  tocaRecalculo: boolean;
  /** Lunes de esta semana: se apunta como recalculada al acabar. */
  semana: string;
}

const tienePlan = (versiones: readonly VersionNocturno[], mes: string) =>
  versiones.some((v) => v.mes === mes && (v.estado === "borrador" || v.estado === "publicada"));
// Fechas YYYY-MM-DD: el orden de texto es el de calendario
const minFecha = (a: string, b: string) => (a < b ? a : b);
const maxFecha = (a: string, b: string) => (a > b ? a : b);

export function decidirNocturno(e: EstadoNocturno): DecisionNocturno {
  const ayer = sumarDias(e.hoy, -1);
  const siguienteAlUltimo = e.ultimoAgregado ? sumarDias(e.ultimoAgregado, 1) : ayer;
  const desdeAgregados = maxFecha(minFecha(siguienteAlUltimo, ayer), sumarDias(e.hoy, -MAX_DIAS_AGREGADOS));

  const mesActual = e.hoy.slice(0, 7);
  const mesSiguiente = desplazarMes(mesActual, 1);
  const generar =
    Number(e.hoy.slice(8, 10)) >= e.diaGeneracion && !tienePlan(e.versiones, mesSiguiente) ? mesSiguiente : null;

  const semana = lunesDe(e.hoy);
  const pendiente = e.ultimoRecalculo == null || e.ultimoRecalculo < semana;
  // Sin recálculo anterior, solo el lunes: la primera vez no se adelanta a mitad de semana
  const tocaRecalculo = e.forzarRecalculo === true || (pendiente && (diaSemana(e.hoy) === 0 || e.ultimoRecalculo != null));
  const corte = sumarDias(semana, 7);
  const recalcular: DecisionNocturno["recalcular"] = [];
  if (tocaRecalculo) {
    for (const mes of [mesActual, mesSiguiente]) {
      // El mes recién generado ya sale con los datos de hoy
      if (mes === generar || !tienePlan(e.versiones, mes)) continue;
      const fechas = fechasDelMes(mes);
      const desde = maxFecha(corte, fechas[0]);
      if (desde <= fechas[fechas.length - 1]) recalcular.push({ mes, desde });
    }
  }

  return { agregados: { desde: desdeAgregados, hasta: ayer }, generar, recalcular, tocaRecalculo, semana };
}

/**
 * Recálculo: los días anteriores a `desde` se conservan de la versión de
 * partida; desde ahí, lo que da el motor.
 */
export function componerRecalculo<B extends BloqueBasico, M extends BloqueBasico>(
  base: readonly B[],
  motor: readonly M[],
  desde: string,
): { conservados: B[]; nuevos: M[] } {
  return { conservados: base.filter((b) => b.fecha < desde), nuevos: motor.filter((b) => b.fecha >= desde) };
}

/** Bloques de la versión de partida que el motor respeta en el recálculo: fijados o cambiados a mano, desde `desde`. */
export function conservablesDesde<B extends BloqueBasico & { fijado: boolean; origen: string }>(
  base: readonly B[],
  desde: string,
): B[] {
  return base.filter((b) => b.fecha >= desde && (b.fijado || b.origen === "manual"));
}

/**
 * Objetivos que se guardan con el recálculo: los de las semanas ya empezadas,
 * los de la versión de partida (con ellos se planificaron sus bloques); los
 * demás, los nuevos.
 */
export function objetivosRecalculo(
  base: readonly ObjetivoSemana[],
  nuevos: readonly ObjetivoSemana[],
  desde: string,
): ObjetivoSemana[] {
  const primera = lunesDe(desde);
  return [...base.filter((o) => o.semanaLunes < primera), ...nuevos.filter((o) => o.semanaLunes >= primera)];
}
