import { diaSemana, sumarDias } from "./calendario";

// ============================================================
// Estimación de cuándo acaba una campaña saliente: cuando su lista llega al
// objetivo (los contactos «se agotan») o cuando se acaban las horas
// contratadas, lo que llegue antes. Nadie sabe la fecha exacta, así que se
// dan varias referencias y se dice con qué se calcula cada una:
//   - al ritmo de cierres de los últimos días laborables;
//   - con las horas planificadas en la versión × el ritmo de cierre por hora;
//   - con el ritmo de las campañas parecidas ya terminadas (UGR_EGRE de 2025
//     para UGR_EGRE26, las otras listas de Caja Rural...).
// Puro (como el motor). Días laborables = de lunes a viernes sin los
// festivos que se conozcan; es una estimación, no un calendario.
// ============================================================

export interface CierresDiaCampania {
  fecha: string;
  campania: string;
  cierres: number;
}

export interface CampaniaHistorica {
  campania: string;
  /** Primer y último día con cierres. */
  inicio: string;
  fin: string;
  cierres: number;
  /** Laborables entre el primer y el último día con cierres, ambos incluidos. */
  laborables: number;
}

/** Días sin cierres para dar una campaña por terminada. */
export const DIAS_CAMPANIA_TERMINADA = 14;
/**
 * Solo sirven de referencia campañas PUNTUALES: con al menos 50 cierres y de
 * 3 meses como mucho. Las listas de goteo que duran más de un año (0,7
 * cierres al día) darían fechas absurdas.
 */
export const CIERRES_MINIMOS_REFERENCIA = 50;
export const LABORABLES_MAXIMOS_REFERENCIA = 65;

const esLaborable = (fecha: string, festivos: ReadonlySet<string>) => diaSemana(fecha) < 5 && !festivos.has(fecha);

/** Laborables de `desde` a `hasta`, ambos incluidos. */
export function laborablesEntre(desde: string, hasta: string, festivos: ReadonlySet<string> = new Set()): number {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (esLaborable(f, festivos)) n++;
  return n;
}

/**
 * Fecha en que se completan `cantidad` unidades a `porDia` por laborable,
 * empezando el día SIGUIENTE a `desde`. null si no hay ritmo.
 */
export function fechaAlRitmo(desde: string, cantidad: number, porDia: number, festivos: ReadonlySet<string> = new Set()): string | null {
  if (cantidad <= 0) return desde;
  if (!(porDia > 0)) return null;
  let quedan = cantidad;
  let f = desde;
  // Tope de seguridad: dos años de laborables
  for (let i = 0; i < 730; i++) {
    f = sumarDias(f, 1);
    if (!esLaborable(f, festivos)) continue;
    quedan -= porDia;
    if (quedan <= 1e-9) return f;
  }
  return null;
}

/**
 * Campañas a partir de sus cierres diarios: primer y último día, total y
 * laborables. `terminada` = sin cierres en los DIAS_CAMPANIA_TERMINADA días
 * anteriores a `hasta`.
 */
export function campaniasDesdeCierres(
  cierres: readonly CierresDiaCampania[],
  hasta: string,
  festivos: ReadonlySet<string> = new Set(),
): (CampaniaHistorica & { terminada: boolean })[] {
  const porCampania = new Map<string, CierresDiaCampania[]>();
  for (const c of cierres) {
    if (c.fecha > hasta || c.cierres <= 0) continue;
    porCampania.set(c.campania, [...(porCampania.get(c.campania) ?? []), c]);
  }
  const limite = sumarDias(hasta, -DIAS_CAMPANIA_TERMINADA);
  return [...porCampania.entries()]
    .map(([campania, filas]) => {
      const fechas = filas.map((f) => f.fecha).sort();
      const inicio = fechas[0];
      const fin = fechas[fechas.length - 1];
      return {
        campania,
        inicio,
        fin,
        cierres: filas.reduce((a, f) => a + f.cierres, 0),
        laborables: Math.max(1, laborablesEntre(inicio, fin, festivos)),
        terminada: fin < limite,
      };
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.campania.localeCompare(b.campania));
}

const mediana = (xs: readonly number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * Patrones de campañas parecidas por defecto: los del cliente sin el año del
 * final («UGR[_]EGRE26» → «UGR[_]EGRE%») y, por si con eso no sale ninguna
 * terminada, el primer tramo del nombre («CajaR[_]Autonomos[_]26» →
 * «CajaR[_]%»). Se pueden fijar a mano (parámetro campaniasSimilares).
 */
export function patronesSimilares(patrones: readonly string[]): { principales: string[]; amplios: string[] } {
  const principales = new Set<string>();
  const amplios = new Set<string>();
  for (const p of patrones) {
    const sinAnio = p.replace(/(\[_\]|_)?\d{2,4}%?$/, "");
    principales.add(sinAnio.endsWith("%") ? sinAnio : `${sinAnio}%`);
    const primer = /^(.+?)(\[_\]|_)/.exec(p);
    if (primer) amplios.add(`${primer[1]}[_]%`);
  }
  return { principales: [...principales], amplios: [...amplios].filter((a) => !principales.has(a)) };
}

export interface DatosEstimacion {
  /** Último día con datos (las estimaciones cuentan desde el siguiente). */
  fechaDatos: string;
  festivos?: ReadonlySet<string>;
  /** Cierres que faltan para dejar la lista en su % de vivos objetivo (null = sin lista). */
  cierresPendientes: number | null;
  /** Cierres por hora de trabajo del cliente (el del objetivo). */
  ritmoHora: number | null;
  /** Cierres por día de las campañas en curso en los últimos laborables (`cierresRecientes` ÷ `laborablesRecientes`). */
  cierresRecientes: number;
  laborablesRecientes: number;
  /** Campañas parecidas ya terminadas. */
  similares: readonly CampaniaHistorica[];
  /** Horas planificadas del cliente por fecha, después de fechaDatos (versión vigente). */
  horasPlan: Readonly<Record<string, number>>;
  /** Horas contratadas (null = no se conocen) y las ya trabajadas desde el inicio del contrato. */
  contrato: { horas: number; consumidas: number } | null;
}

export interface EstimacionFin {
  cierresPendientes: number | null;
  /** Al ritmo de cierres de los últimos laborables (con cuántos laborables se mide). */
  ritmoReciente: { cierresDia: number; laborables: number; fecha: string | null } | null;
  /** Con las horas planificadas × el ritmo por hora: fecha, o null si lo planificado no llega (y cuántas horas faltan). */
  plan: { horasNecesarias: number; horasPlanificadas: number; fecha: string | null; faltanHoras: number } | null;
  /** Con el ritmo (mediana de cierres por laborable) de las campañas parecidas terminadas. */
  similares: { cierresDia: number; fecha: string | null; referencias: CampaniaHistorica[] } | null;
  /** Horas de contrato: restantes y cuándo se agotan con lo planificado. */
  contrato: { restantes: number; fecha: string | null } | null;
}

/** Primer día en que lo acumulado de `porFecha` (en orden de fecha) llega a `objetivo`. */
function diaQueSeAlcanza(porFecha: Readonly<Record<string, number>>, objetivo: number): string | null {
  if (objetivo <= 0) return null;
  let acumulado = 0;
  for (const f of Object.keys(porFecha).sort()) {
    acumulado += porFecha[f];
    if (acumulado + 1e-9 >= objetivo) return f;
  }
  return null;
}

export function estimarFinCampania(d: DatosEstimacion): EstimacionFin {
  const festivos = d.festivos ?? new Set<string>();
  const pendientes = d.cierresPendientes != null ? Math.max(0, d.cierresPendientes) : null;
  const totalPlan = Object.values(d.horasPlan).reduce((a, h) => a + h, 0);

  let ritmoReciente: EstimacionFin["ritmoReciente"] = null;
  if (pendientes != null && d.laborablesRecientes > 0 && d.cierresRecientes > 0) {
    const cierresDia = d.cierresRecientes / d.laborablesRecientes;
    ritmoReciente = {
      cierresDia,
      laborables: d.laborablesRecientes,
      fecha: fechaAlRitmo(d.fechaDatos, pendientes, cierresDia, festivos),
    };
  }

  let plan: EstimacionFin["plan"] = null;
  if (pendientes != null && d.ritmoHora != null && d.ritmoHora > 0) {
    const horasNecesarias = pendientes / d.ritmoHora;
    const fecha = pendientes <= 0 ? d.fechaDatos : diaQueSeAlcanza(d.horasPlan, horasNecesarias);
    plan = { horasNecesarias, horasPlanificadas: totalPlan, fecha, faltanHoras: fecha ? 0 : Math.max(0, horasNecesarias - totalPlan) };
  }

  let similares: EstimacionFin["similares"] = null;
  const referencias = d.similares.filter(
    (c) => c.cierres >= CIERRES_MINIMOS_REFERENCIA && c.laborables <= LABORABLES_MAXIMOS_REFERENCIA,
  );
  if (pendientes != null && referencias.length > 0) {
    const cierresDia = mediana(referencias.map((c) => c.cierres / c.laborables));
    similares = { cierresDia, fecha: fechaAlRitmo(d.fechaDatos, pendientes, cierresDia, festivos), referencias };
  }

  let contrato: EstimacionFin["contrato"] = null;
  if (d.contrato) {
    const restantes = Math.max(0, d.contrato.horas - d.contrato.consumidas);
    contrato = { restantes, fecha: restantes <= 0 ? d.fechaDatos : diaQueSeAlcanza(d.horasPlan, restantes) };
  }

  return { cierresPendientes: pendientes, ritmoReciente, plan, similares, contrato };
}

/**
 * Horquilla de fin por la lista (la más temprana y la más tardía de las
 * estimaciones que se han podido hacer) y si el contrato se agota antes.
 */
export function horquillaFin(e: EstimacionFin): { desde: string; hasta: string; contratoAntes: boolean } | null {
  const fechas = [e.ritmoReciente?.fecha, e.plan?.fecha, e.similares?.fecha].filter((f): f is string => !!f).sort();
  if (fechas.length === 0) return null;
  const desde = fechas[0];
  return { desde, hasta: fechas[fechas.length - 1], contratoAntes: !!e.contrato?.fecha && e.contrato.fecha < desde };
}
