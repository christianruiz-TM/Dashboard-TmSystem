// NOTA: solo servidor. Calendarios de la planificación (21/10/2026, decidido
// con Christian):
// - Calendario de cada CLIENTE (cuándo atiende): festivos_servicio y
//   horarios_servicio de RDBv2, que mantiene supervisión y lee también un
//   Power BI. El dashboard NO escribe en ellas: las COPIA a SQLite al generar
//   un borrador (a mano o en la tarea nocturna) o con «Copiar ahora de
//   Altitude», y los cambios a mano (abre / cierra / horario especial) van en
//   otra tabla, para que la copia no los pise.
// - Calendario LABORAL de la plantilla (cuándo no trabajan los agentes, sea
//   cual sea su cliente): solo en SQLite. Festivo laboral = art. 37.2 ET (si
//   se trabaja, FEST: art. 49.1 del III Convenio de Contact Center); cierre de
//   empresa = art. 30 ET (justifica el turno, sin FEST). El 24 y el 31 de
//   diciembre NO son festivos laborales (art. 49.2: festivo especial solo
//   desde las 20:00, sin descanso compensatorio).
import { format } from "date-fns";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import {
  planCalendarioExcepciones,
  planCalendarioFestivosRdb,
  planCalendarioHorariosRdb,
  planCalendarioLaboral,
} from "@/lib/db/schema";
import { guardarAjuste, obtenerAjuste } from "@/lib/db/settings";
import { calendariosAltitude } from "@/lib/rdb/queries/planificacion";
import {
  CALENDARIO_PLANTILLA,
  calendarioEfectivo,
  construirDias,
  laborablesDelMes,
  normalizarTramos,
  type CalendarioEfectivo,
  type HorarioLike,
  type Tramo,
} from "./motor";
import { leerParametrosPlan } from "./parametros";

const CLAVE_COPIA = "planificacion.calendario.copia";
/** Calendario del que salía el de la plantilla antes del 21/10/2026 (para la primera carga). */
const CLAVE_CALENDARIO_ANTIGUO = "plan.servicioCalendario";

/** Días que la ley o el convenio NO hacen festivos laborales aunque un cliente cierre. */
const NO_FESTIVO_LABORAL = new Set(["12-24", "12-31"]);

export interface EstadoCopia {
  /** Fecha y hora LOCALES de la última copia (dd/MM/yyyy HH:mm). */
  at: string;
  festivos: number;
  horarios: number;
  /** Días del calendario laboral rellenados en la primera copia (solo esa vez). */
  laboralInicial?: number;
}

export function estadoCopia(): EstadoCopia | null {
  try {
    const v = JSON.parse(obtenerAjuste(CLAVE_COPIA, "null")) as EstadoCopia | null;
    return v && typeof v.at === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Copia festivos_servicio y horarios_servicio de RDBv2 a SQLite (sustituye la
 * copia anterior entera; los cambios a mano no se tocan). Si el calendario
 * laboral está vacío (la primera vez), lo rellena con los festivos del que
 * se usaba antes (`plan.servicioCalendario`, GrupoHuertas) sin el 24 ni el 31
 * de diciembre.
 */
export async function copiarCalendariosAltitude(): Promise<EstadoCopia> {
  const { festivos, horarios } = await calendariosAltitude();
  const vistos = new Set<string>();
  const filasFestivos = festivos
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) && f.servicio)
    .filter((f) => {
      const k = `${f.servicio}|${f.fecha}`;
      if (vistos.has(k)) return false; // la tabla de RDBv2 no tiene clave
      vistos.add(k);
      return true;
    })
    .map((f) => ({ calendario: f.servicio, fecha: f.fecha, tipo: f.tipo || "FESTIVO" }));
  const filasHorarios = horarios.map((h) => ({
    calendario: h.servicio,
    dias: h.dias.map((d) => (d ? "1" : "0")).join(""),
    entradaMin: h.entradaMin,
    salidaMin: h.salidaMin,
    desde: h.desde,
    hasta: h.hasta,
  }));

  let laboralInicial: number | undefined;
  db.transaction((tx) => {
    tx.delete(planCalendarioFestivosRdb).run();
    tx.delete(planCalendarioHorariosRdb).run();
    if (filasFestivos.length > 0) tx.insert(planCalendarioFestivosRdb).values(filasFestivos).run();
    if (filasHorarios.length > 0) tx.insert(planCalendarioHorariosRdb).values(filasHorarios).run();
    const hayLaboral = tx.select({ f: planCalendarioLaboral.fecha }).from(planCalendarioLaboral).limit(1).all().length > 0;
    if (!hayLaboral) {
      let origen = "GrupoHuertas";
      try {
        origen = String(JSON.parse(obtenerAjuste(CLAVE_CALENDARIO_ANTIGUO, '"GrupoHuertas"')));
      } catch {
        // valor guardado sin comillas
        origen = obtenerAjuste(CLAVE_CALENDARIO_ANTIGUO, "GrupoHuertas");
      }
      const filas = filasFestivos
        .filter((f) => f.calendario === origen && !NO_FESTIVO_LABORAL.has(f.fecha.slice(5)))
        .map((f) => ({ fecha: f.fecha, tipo: "festivo" as const, nombre: null, autor: `copia de ${origen}` }));
      if (filas.length > 0) tx.insert(planCalendarioLaboral).values(filas).onConflictDoNothing().run();
      laboralInicial = filas.length;
    }
  });

  const estado: EstadoCopia = {
    at: format(new Date(), "dd/MM/yyyy HH:mm"),
    festivos: filasFestivos.length,
    horarios: filasHorarios.length,
    ...(laboralInicial !== undefined ? { laboralInicial } : {}),
  };
  guardarAjuste(CLAVE_COPIA, JSON.stringify(estado));
  return estado;
}

/**
 * Antes de planificar. `siempre`: copia de Altitude (generar un borrador, a
 * mano o en la tarea nocturna); `si-falta`: solo si nunca se ha copiado;
 * `nunca`: no escribe (simulaciones). Si RDBv2 no responde y ya hay una
 * copia, sigue con ella y devuelve el aviso; si no hay ninguna, lanza.
 */
export async function asegurarCalendarios(modo: "siempre" | "si-falta" | "nunca"): Promise<string | null> {
  const previa = estadoCopia();
  if (modo === "nunca" || (modo === "si-falta" && previa)) {
    return previa ? null : "No hay copia de los calendarios de Altitude: se planifica sin festivos ni horarios de los clientes";
  }
  try {
    await copiarCalendariosAltitude();
    return null;
  } catch (e) {
    if (!previa) throw new Error(`No se han podido copiar los calendarios de Altitude (RDBv2): ${e instanceof Error ? e.message : e}`);
    console.error("[planificacion] copia de calendarios:", e);
    return `No se han podido actualizar los calendarios desde Altitude: se usa la copia del ${previa.at}`;
  }
}

// ---------- Lectura ----------

export interface ExcepcionCalendario {
  calendario: string;
  fecha: string;
  tipo: "abre" | "cierra" | "horario";
  tramos: Tramo[] | null;
  motivo: string | null;
  autor: string;
  actualizadoAt: string;
}

export interface DiaLaboral {
  fecha: string;
  tipo: "festivo" | "cierre";
  nombre: string | null;
  autor: string;
  actualizadoAt: string;
}

const fechaHora = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

export function leerExcepciones(desde?: string, hasta?: string): ExcepcionCalendario[] {
  const filtros = [
    ...(desde ? [gte(planCalendarioExcepciones.fecha, desde)] : []),
    ...(hasta ? [lte(planCalendarioExcepciones.fecha, hasta)] : []),
  ];
  return db
    .select()
    .from(planCalendarioExcepciones)
    .where(filtros.length > 0 ? and(...filtros) : undefined)
    .orderBy(asc(planCalendarioExcepciones.fecha))
    .all()
    .map((e) => ({
      calendario: e.calendario,
      fecha: e.fecha,
      tipo: e.tipo,
      tramos: e.tramos ?? null,
      motivo: e.motivo,
      autor: e.autor,
      actualizadoAt: fechaHora(e.actualizadoAt),
    }));
}

export function leerCalendarioLaboral(desde?: string, hasta?: string): DiaLaboral[] {
  const filtros = [
    ...(desde ? [gte(planCalendarioLaboral.fecha, desde)] : []),
    ...(hasta ? [lte(planCalendarioLaboral.fecha, hasta)] : []),
  ];
  return db
    .select()
    .from(planCalendarioLaboral)
    .where(filtros.length > 0 ? and(...filtros) : undefined)
    .orderBy(asc(planCalendarioLaboral.fecha))
    .all()
    .map((d) => ({ ...d, actualizadoAt: fechaHora(d.actualizadoAt) }));
}

/** Festivos de la copia de Altitude (todos los calendarios). */
export function leerFestivosAltitude(desde?: string, hasta?: string): { fecha: string; servicio: string }[] {
  const filtros = [
    ...(desde ? [gte(planCalendarioFestivosRdb.fecha, desde)] : []),
    ...(hasta ? [lte(planCalendarioFestivosRdb.fecha, hasta)] : []),
  ];
  return db
    .select({ fecha: planCalendarioFestivosRdb.fecha, servicio: planCalendarioFestivosRdb.calendario })
    .from(planCalendarioFestivosRdb)
    .where(filtros.length > 0 ? and(...filtros) : undefined)
    .orderBy(asc(planCalendarioFestivosRdb.fecha))
    .all();
}

/** Horarios semanales de la copia de Altitude. */
export function leerHorariosAltitude(): HorarioLike[] {
  return db
    .select()
    .from(planCalendarioHorariosRdb)
    .orderBy(asc(planCalendarioHorariosRdb.calendario), asc(planCalendarioHorariosRdb.desde), asc(planCalendarioHorariosRdb.entradaMin))
    .all()
    .map((h) => ({
      servicio: h.calendario,
      dias: [...h.dias.padEnd(7, "0")].slice(0, 7).map((c) => c === "1"),
      entradaMin: h.entradaMin,
      salidaMin: h.salidaMin,
      desde: h.desde,
      hasta: h.hasta,
    }));
}

export interface CalendarioPlan extends CalendarioEfectivo {
  horarios: HorarioLike[];
  /** Último día cargado por calendario (festivos de Altitude; la plantilla, su calendario laboral). */
  vigenciaFestivos: Record<string, string>;
  vigenciaHorarios: Record<string, string>;
}

/** El calendario con el que se planifica: copia de Altitude + cambios a mano + calendario laboral. */
export function calendarioPlan(): CalendarioPlan {
  const festivosAltitude = leerFestivosAltitude();
  const laboral = leerCalendarioLaboral();
  const horarios = leerHorariosAltitude();
  const efectivo = calendarioEfectivo({ festivosAltitude, excepciones: leerExcepciones(), laboral });
  const vigenciaFestivos: Record<string, string> = {};
  for (const f of festivosAltitude) {
    if (!vigenciaFestivos[f.servicio] || f.fecha > vigenciaFestivos[f.servicio]) vigenciaFestivos[f.servicio] = f.fecha;
  }
  // El calendario laboral se carga por años: vale hasta el 31/12 del último con algún día
  if (laboral.length > 0) vigenciaFestivos[CALENDARIO_PLANTILLA] = `${laboral[laboral.length - 1].fecha.slice(0, 4)}-12-31`;
  const vigenciaHorarios: Record<string, string> = {};
  for (const h of horarios) {
    if (!vigenciaHorarios[h.servicio] || h.hasta > vigenciaHorarios[h.servicio]) vigenciaHorarios[h.servicio] = h.hasta;
  }
  return { ...efectivo, horarios, vigenciaFestivos, vigenciaHorarios };
}

/**
 * Calendario con el que se reparte el cupo de un cliente: el suyo (si tiene
 * y `plan.cupoLaborablesCliente`, decidido el 21/10/2026) o el laboral de la
 * plantilla.
 */
export function calendarioDelCupo(calendarioCliente: string | null | undefined, cupoConCliente: boolean): string {
  return cupoConCliente && calendarioCliente ? calendarioCliente : CALENDARIO_PLANTILLA;
}

/** Laborables (lunes a viernes sin festivo) de un mes en un calendario. */
export function laborablesEnCalendario(mes: string, calendario: string, cal: CalendarioEfectivo = calendarioPlan()): number {
  const p = leerParametrosPlan();
  return laborablesDelMes(
    construirDias({ mes, semanaA: p.semanaA, servicioCalendario: calendario, festivos: cal.festivos }),
  );
}

/** Calendarios de cliente conocidos: los de la copia de Altitude y los que tienen cambios a mano. */
export function nombresCalendarios(): string[] {
  const nombres = new Set<string>();
  for (const f of db.selectDistinct({ c: planCalendarioFestivosRdb.calendario }).from(planCalendarioFestivosRdb).all()) nombres.add(f.c);
  for (const h of db.selectDistinct({ c: planCalendarioHorariosRdb.calendario }).from(planCalendarioHorariosRdb).all()) nombres.add(h.c);
  for (const e of db.selectDistinct({ c: planCalendarioExcepciones.calendario }).from(planCalendarioExcepciones).all()) nombres.add(e.c);
  nombres.delete(CALENDARIO_PLANTILLA);
  return [...nombres].sort();
}

// ---------- Cambios a mano (supervisión) ----------

export function guardarExcepcion(e: {
  calendario: string;
  fecha: string;
  tipo: "abre" | "cierra" | "horario";
  tramos: Tramo[] | null;
  motivo: string | null;
  autor: string;
}): void {
  const valores = {
    tipo: e.tipo,
    tramos: e.tipo === "horario" ? normalizarTramos(e.tramos ?? []) : null,
    motivo: e.motivo,
    autor: e.autor,
    actualizadoAt: new Date(),
  };
  db.insert(planCalendarioExcepciones)
    .values({ calendario: e.calendario, fecha: e.fecha, ...valores })
    .onConflictDoUpdate({ target: [planCalendarioExcepciones.calendario, planCalendarioExcepciones.fecha], set: valores })
    .run();
}

/** Quita el cambio a mano: el día vuelve a lo que dice Altitude. Devuelve si había. */
export function quitarExcepcion(calendario: string, fecha: string): boolean {
  const r = db
    .delete(planCalendarioExcepciones)
    .where(and(eq(planCalendarioExcepciones.calendario, calendario), eq(planCalendarioExcepciones.fecha, fecha)))
    .run();
  return r.changes > 0;
}

export function guardarDiaLaboral(d: { fecha: string; tipo: "festivo" | "cierre"; nombre: string | null; autor: string }): void {
  const valores = { tipo: d.tipo, nombre: d.nombre, autor: d.autor, actualizadoAt: new Date() };
  db.insert(planCalendarioLaboral)
    .values({ fecha: d.fecha, ...valores })
    .onConflictDoUpdate({ target: planCalendarioLaboral.fecha, set: valores })
    .run();
}

export function quitarDiaLaboral(fecha: string): boolean {
  return db.delete(planCalendarioLaboral).where(eq(planCalendarioLaboral.fecha, fecha)).run().changes > 0;
}

/**
 * Copia al calendario laboral los festivos de un año de un calendario de
 * cliente (copia de Altitude, con sus cambios a mano), sin el 24 ni el 31 de
 * diciembre y sin tocar los días que ya tiene. Devuelve los días añadidos.
 */
export function copiarFestivosALaboral(calendario: string, anio: number, autor: string): string[] {
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const efectivo = calendarioEfectivo({
    festivosAltitude: leerFestivosAltitude(desde, hasta),
    excepciones: leerExcepciones(desde, hasta),
    laboral: [],
  });
  const fechas = efectivo.festivos
    .filter((f) => f.servicio === calendario && !NO_FESTIVO_LABORAL.has(f.fecha.slice(5)))
    .map((f) => f.fecha);
  if (fechas.length === 0) return [];
  const r = db
    .insert(planCalendarioLaboral)
    .values(fechas.map((fecha) => ({ fecha, tipo: "festivo" as const, nombre: null, autor })))
    .onConflictDoNothing()
    .returning({ fecha: planCalendarioLaboral.fecha })
    .all();
  return r.map((x) => x.fecha).sort();
}
