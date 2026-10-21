import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getISODay,
  parseISO,
  startOfISOWeek,
} from "date-fns";
import { rangoCorto } from "./franjas";
import type { AusenciaMotor, ClienteMotor, DiaMotor, EntradaMotor, SemanaResumen, Tramo } from "./tipos";

// ============================================================
// Calendario del mes: días, semanas, rotación A/B, festivos, turnos y
// horarios de servicio ya expandidos por fecha. Puro (date-fns en hora
// local; las fechas son siempre cadenas YYYY-MM-DD).
// ============================================================

const FMT = "yyyy-MM-dd";

/** 0 = lunes … 6 = domingo. */
export function diaSemana(fecha: string): number {
  return getISODay(parseISO(fecha)) - 1;
}

export function sumarDias(fecha: string, dias: number): string {
  return format(addDays(parseISO(fecha), dias), FMT);
}

/** Lunes de la semana de `fecha`. */
export function lunesDe(fecha: string): string {
  return format(startOfISOWeek(parseISO(fecha)), FMT);
}

/**
 * Rotación de la semana de `fecha`: A si las semanas transcurridas desde el
 * lunes de referencia `semanaA` son pares (hacia atrás también).
 */
export function rotacionDe(fecha: string, semanaA: string): "A" | "B" {
  const semanas = Math.round(differenceInCalendarDays(parseISO(lunesDe(fecha)), parseISO(lunesDe(semanaA))) / 7);
  return ((semanas % 2) + 2) % 2 === 0 ? "A" : "B";
}

/** Todas las fechas de un mes 'YYYY-MM'. */
export function fechasDelMes(mes: string): string[] {
  const inicio = parseISO(`${mes}-01`);
  const ultimo = endOfMonth(inicio).getDate();
  return Array.from({ length: ultimo }, (_, i) => format(addDays(inicio, i), FMT));
}

/** Mes siguiente / anterior de 'YYYY-MM'. */
export function desplazarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export interface FestivoLike {
  fecha: string;
  servicio: string;
}

/**
 * Nombre del calendario laboral de la plantilla en `DiaMotor.festivos` y en
 * `EntradaMotor.servicioCalendario` (21/10/2026). Antes era el de GH
 * («GrupoHuertas»): las fotos de versiones viejas lo siguen llevando.
 */
export const CALENDARIO_PLANTILLA = "Plantilla";

export interface ExcepcionCalendarioLike {
  calendario: string;
  fecha: string;
  tipo: "abre" | "cierra" | "horario";
  tramos: readonly Tramo[] | null;
}

export interface DiaLaboralLike {
  fecha: string;
  tipo: "festivo" | "cierre";
}

export interface CalendarioEfectivo {
  /** Festivos de cada calendario de cliente y los días sin trabajo de la plantilla. */
  festivos: FestivoLike[];
  /** Días de cierre de empresa de la plantilla (también están en `festivos`). */
  cierresPlantilla: string[];
  /** calendario → fecha → tramos del horario especial de ese día. */
  especiales: Record<string, Record<string, Tramo[]>>;
}

/**
 * Calendario con el que se planifica: la copia de festivos_servicio de
 * Altitude con los cambios a mano encima, y el calendario laboral de la
 * plantilla como un calendario más (CALENDARIO_PLANTILLA). Un día que «abre»
 * o lleva horario especial deja de ser festivo de su cliente; uno que
 * «cierra» pasa a serlo.
 */
export function calendarioEfectivo(opciones: {
  festivosAltitude: readonly FestivoLike[];
  excepciones: readonly ExcepcionCalendarioLike[];
  laboral: readonly DiaLaboralLike[];
}): CalendarioEfectivo {
  const clave = (c: string, f: string) => `${c}|${f}`;
  const excepcion = new Map(opciones.excepciones.map((e) => [clave(e.calendario, e.fecha), e]));
  const festivos = new Map<string, FestivoLike>();
  for (const f of opciones.festivosAltitude) {
    if (excepcion.has(clave(f.servicio, f.fecha))) continue;
    festivos.set(clave(f.servicio, f.fecha), { fecha: f.fecha, servicio: f.servicio });
  }
  const especiales: Record<string, Record<string, Tramo[]>> = {};
  for (const e of opciones.excepciones) {
    if (e.tipo === "cierra") festivos.set(clave(e.calendario, e.fecha), { fecha: e.fecha, servicio: e.calendario });
    if (e.tipo === "horario") (especiales[e.calendario] ??= {})[e.fecha] = normalizarTramos(e.tramos ?? []);
  }
  for (const d of opciones.laboral) {
    festivos.set(clave(CALENDARIO_PLANTILLA, d.fecha), { fecha: d.fecha, servicio: CALENDARIO_PLANTILLA });
  }
  return {
    festivos: [...festivos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.servicio.localeCompare(b.servicio)),
    cierresPlantilla: opciones.laboral.filter((d) => d.tipo === "cierre").map((d) => d.fecha).sort(),
    especiales,
  };
}

/**
 * Días del mes con su semana, rotación y festivos. `festivos` puede traer
 * fechas fuera del mes (hace falta el día anterior al 1 para el «día
 * equivalente»). Laborable = de lunes a viernes y no festivo en el
 * calendario del equipo. El día siguiente a un festivo entre semana se
 * dimensiona como lunes (recibe la carga acumulada: medido en el prototipo
 * con el martes 13/10/2026). `cierresEquipo`: días de cierre de empresa (no
 * se trabaja, pero quien trabaje no genera FEST).
 */
export function construirDias(opciones: {
  mes: string;
  semanaA: string;
  servicioCalendario: string;
  festivos: readonly FestivoLike[];
  cierresEquipo?: readonly string[];
}): DiaMotor[] {
  const cierres = new Set(opciones.cierresEquipo ?? []);
  const porFecha = new Map<string, string[]>();
  for (const f of opciones.festivos) {
    const lista = porFecha.get(f.fecha) ?? [];
    if (!lista.includes(f.servicio)) lista.push(f.servicio);
    porFecha.set(f.fecha, lista);
  }
  const esFestivoEquipo = (fecha: string) =>
    (porFecha.get(fecha) ?? []).includes(opciones.servicioCalendario);

  return fechasDelMes(opciones.mes).map((fecha) => {
    const ds = diaSemana(fecha);
    const anterior = sumarDias(fecha, -1);
    const anteriorFestivoEntreSemana = diaSemana(anterior) < 5 && esFestivoEquipo(anterior);
    const laborable = ds < 5 && !esFestivoEquipo(fecha);
    const dia: DiaMotor = {
      fecha,
      diaSemana: ds,
      lunes: lunesDe(fecha),
      rotacion: rotacionDe(fecha, opciones.semanaA),
      laborable,
      festivos: [...(porFecha.get(fecha) ?? [])].sort(),
      diaEquivalente: laborable && anteriorFestivoEntreSemana ? 0 : ds,
    };
    // Solo cuando lo es: las fotos guardadas y el fixture del motor no lo llevan
    if (cierres.has(fecha) && esFestivoEquipo(fecha)) dia.cierreEmpresa = true;
    return dia;
  });
}

/**
 * Días del mes SIN trabajo de la plantilla (festivos laborales y cierres de
 * empresa): no se planifican, justifican el turno en el saldo y no cuentan
 * en la capacidad.
 */
export function diasSinTrabajoEquipo(entrada: { dias: readonly DiaMotor[]; servicioCalendario: string }): Set<string> {
  return new Set(entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario)).map((d) => d.fecha));
}

/**
 * Festivos LABORALES de la plantilla: trabajarlos se compensa con FEST (art.
 * 49.1 del convenio). Los cierres de empresa no (art. 30 ET).
 */
export function festivosLaboralesEquipo(entrada: { dias: readonly DiaMotor[]; servicioCalendario: string }): Set<string> {
  return new Set(
    entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario) && !d.cierreEmpresa).map((d) => d.fecha),
  );
}

/**
 * Días de un rango cualquiera con su día de la semana y si fueron
 * laborables (ventanas de datos: demanda, ritmo...).
 */
export function diasRango(
  desde: string,
  hasta: string,
  servicioCalendario: string,
  festivos: readonly FestivoLike[],
): { fecha: string; diaSemana: number; laborable: boolean }[] {
  const festivosEquipo = new Set(festivos.filter((f) => f.servicio === servicioCalendario).map((f) => f.fecha));
  const dias: { fecha: string; diaSemana: number; laborable: boolean }[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const ds = diaSemana(f);
    dias.push({ fecha: f, diaSemana: ds, laborable: ds < 5 && !festivosEquipo.has(f) });
  }
  return dias;
}

/** Último domingo ≤ fecha: fin de la última semana completa con datos. */
export function ultimoDomingo(fecha: string): string {
  return diaSemana(fecha) === 6 ? fecha : sumarDias(lunesDe(fecha), -1);
}

/** Semanas (lunes) del mes con sus fechas y laborables, en orden. */
export function semanasDelMes(dias: readonly DiaMotor[]): SemanaResumen[] {
  const semanas: SemanaResumen[] = [];
  for (const d of dias) {
    let s = semanas.find((x) => x.lunes === d.lunes);
    if (!s) {
      s = { lunes: d.lunes, rotacion: d.rotacion, fechas: [], laborables: 0 };
      semanas.push(s);
    }
    s.fechas.push(d.fecha);
    if (d.laborable) s.laborables++;
  }
  return semanas;
}

export function laborablesDelMes(dias: readonly DiaMotor[]): number {
  return dias.filter((d) => d.laborable).length;
}

/** Tramos ordenados y fundidos (sin solapes). */
export function normalizarTramos(tramos: readonly Tramo[]): Tramo[] {
  const orden = [...tramos].sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  const salida: Tramo[] = [];
  for (const t of orden) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && t.inicioMin <= ultimo.finMin) ultimo.finMin = Math.max(ultimo.finMin, t.finMin);
    else salida.push({ inicioMin: t.inicioMin, finMin: t.finMin });
  }
  return salida;
}

/** «9», «9:30», «09:30» → minutos desde las 00:00 (null si no es una hora). */
function minutosDeHora(texto: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59 || h * 60 + min > 1440) return null;
  return h * 60 + min;
}

/**
 * Tramos escritos como en la plantilla de supervisión: «9-14, 16-20» o
 * «9:30-14». Vacío = sin tramos. null si algo no se entiende o un tramo acaba
 * antes de empezar. Salen ordenados y fundidos.
 */
export function parsearTramos(texto: string): Tramo[] | null {
  const limpio = texto.trim();
  if (limpio === "") return [];
  const tramos: Tramo[] = [];
  for (const parte of limpio.split(/[,;]|\s+y\s+/)) {
    if (parte.trim() === "") continue;
    const [a, b, ...resto] = parte.split("-");
    if (b === undefined || resto.length > 0) return null;
    const inicioMin = minutosDeHora(a);
    const finMin = minutosDeHora(b);
    if (inicioMin == null || finMin == null || finMin <= inicioMin) return null;
    tramos.push({ inicioMin, finMin });
  }
  return normalizarTramos(tramos);
}

/** [{540,840},{960,1200}] → «9-14, 16-20» (vacío si no hay tramos). */
export function textoTramos(tramos: readonly Tramo[]): string {
  return normalizarTramos(tramos)
    .map((t) => rangoCorto(t.inicioMin, t.finMin))
    .join(", ");
}

export interface PatronLike {
  id: number;
  tramos: readonly { diaSemana: number; inicioMin: number; finMin: number }[];
}

export interface AsignacionTurnoLike {
  agenteNumero: string;
  patronAId: number | null;
  patronBId: number | null;
  desde: string;
  hasta: string | null;
}

/**
 * Turno de cada agente por fecha: el patrón A o B según la rotación de la
 * semana. Si varias asignaciones cubren la fecha, gana la de `desde` más
 * reciente.
 */
export function expandirTurnos(
  asignaciones: readonly AsignacionTurnoLike[],
  patrones: readonly PatronLike[],
  dias: readonly DiaMotor[],
): Record<string, Record<string, Tramo[]>> {
  const patronPorId = new Map(patrones.map((p) => [p.id, p]));
  const porAgente = new Map<string, AsignacionTurnoLike[]>();
  for (const a of asignaciones) {
    const lista = porAgente.get(a.agenteNumero) ?? [];
    lista.push(a);
    porAgente.set(a.agenteNumero, lista);
  }
  const resultado: Record<string, Record<string, Tramo[]>> = {};
  for (const [agente, lista] of [...porAgente.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const orden = [...lista].sort((a, b) => b.desde.localeCompare(a.desde));
    const turnos: Record<string, Tramo[]> = {};
    for (const d of dias) {
      const asig = orden.find((a) => a.desde <= d.fecha && (a.hasta == null || d.fecha <= a.hasta));
      if (!asig) continue;
      const patronId = d.rotacion === "A" ? asig.patronAId : asig.patronBId;
      const patron = patronId != null ? patronPorId.get(patronId) : undefined;
      if (!patron) continue;
      const tramos = normalizarTramos(patron.tramos.filter((t) => t.diaSemana === d.diaSemana));
      if (tramos.length > 0) turnos[d.fecha] = tramos;
    }
    resultado[agente] = turnos;
  }
  return resultado;
}

export interface AusenciaLike {
  agenteNumero: string;
  tipoCodigo: string;
  desde: string;
  hasta: string;
  inicioMin: number | null;
  finMin: number | null;
}

/** Ausencias por agente y fecha del mes. Sin horas = el día entero. */
export function expandirAusencias(
  ausencias: readonly AusenciaLike[],
  dias: readonly DiaMotor[],
): Record<string, AusenciaMotor[]> {
  const resultado: Record<string, AusenciaMotor[]> = {};
  for (const a of ausencias) {
    for (const d of dias) {
      if (d.fecha < a.desde || d.fecha > a.hasta) continue;
      (resultado[a.agenteNumero] ??= []).push({
        fecha: d.fecha,
        inicioMin: a.inicioMin ?? 0,
        finMin: a.finMin ?? 1440,
        tipo: a.tipoCodigo,
      });
    }
  }
  for (const lista of Object.values(resultado)) {
    lista.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.inicioMin - y.inicioMin);
  }
  return resultado;
}

export interface HorarioLike {
  servicio: string;
  dias: readonly boolean[];
  entradaMin: number;
  salidaMin: number;
  desde: string;
  hasta: string;
}

/**
 * Horario de un calendario por fecha. null si el cliente no tiene
 * calendario o la tabla no tiene filas para él (sin restricción). En los
 * festivos de ese calendario, cerrado ([]). Si el mes se sale de la vigencia
 * de la tabla se usa el último horario conocido (el motor avisa aparte con
 * `festivos_sin_vigencia`): mejor eso que dejar todo fuera de horario.
 */
export function horarioPorFecha(
  horarios: readonly HorarioLike[],
  calendario: string | null,
  dias: readonly DiaMotor[],
  /** fecha → horario especial de ese día (cambios a mano del calendario). */
  especiales: Readonly<Record<string, readonly Tramo[]>> = {},
): Record<string, Tramo[]> | null {
  if (!calendario) return null;
  const filas = horarios.filter((h) => h.servicio === calendario);
  if (filas.length === 0) return null;
  const ultimoHasta = filas.reduce((m, h) => (h.hasta > m ? h.hasta : m), filas[0].hasta);
  const primerDesde = filas.reduce((m, h) => (h.desde < m ? h.desde : m), filas[0].desde);
  const resultado: Record<string, Tramo[]> = {};
  for (const d of dias) {
    if (especiales[d.fecha]) {
      resultado[d.fecha] = normalizarTramos(especiales[d.fecha]);
      continue;
    }
    if (d.festivos.includes(calendario)) {
      resultado[d.fecha] = [];
      continue;
    }
    let vigentes = filas.filter((h) => h.desde <= d.fecha && d.fecha <= h.hasta);
    if (vigentes.length === 0 && d.fecha > ultimoHasta) vigentes = filas.filter((h) => h.hasta === ultimoHasta);
    if (vigentes.length === 0 && d.fecha < primerDesde) vigentes = filas.filter((h) => h.desde === primerDesde);
    resultado[d.fecha] = normalizarTramos(
      vigentes
        .filter((h) => h.dias[d.diaSemana])
        .map((h) => ({ inicioMin: h.entradaMin, finMin: h.salidaMin })),
    );
  }
  return resultado;
}

/**
 * La foto de una versión con el calendario de AHORA (tablero, guardar y
 * seguimiento): días sin trabajo de la plantilla, cierres, festivos y horario
 * de cada cliente. La semana, el día y la rotación se quedan los de la foto.
 * `cambiadas`: días en que el calendario ya no es el del momento de generar
 * (las validaciones lo tienen en cuenta al momento; recolocar bloques pide
 * regenerar). Las fotos anteriores al 21/10/2026 usan el calendario de GH
 * como el de la plantilla; aquí pasan al de la plantilla.
 */
export function aplicarCalendario(
  foto: Pick<EntradaMotor, "dias" | "servicioCalendario" | "clientes">,
  cal: Pick<CalendarioEfectivo, "festivos" | "cierresPlantilla" | "especiales"> & { horarios: readonly HorarioLike[] },
): { dias: DiaMotor[]; servicioCalendario: string; clientes: ClienteMotor[]; cambiadas: string[] } {
  if (foto.dias.length === 0) return { dias: [], servicioCalendario: CALENDARIO_PLANTILLA, clientes: [...foto.clientes], cambiadas: [] };
  const mes = foto.dias[0].fecha.slice(0, 7);
  const rotacion = new Map(foto.dias.map((d) => [d.fecha, d.rotacion]));
  const dias = construirDias({
    mes,
    semanaA: lunesDe(foto.dias[0].fecha),
    servicioCalendario: CALENDARIO_PLANTILLA,
    festivos: cal.festivos,
    cierresEquipo: cal.cierresPlantilla,
  }).map((d) => ({ ...d, rotacion: rotacion.get(d.fecha) ?? d.rotacion }));
  const clientes = foto.clientes.map((c) => {
    const calendario = c.parametros.calendario;
    return { ...c, horario: horarioPorFecha(cal.horarios, calendario, dias, calendario ? cal.especiales[calendario] : {}) };
  });

  const antes = new Map(foto.dias.map((d) => [d.fecha, d]));
  const cambiadas = dias
    .filter((d) => {
      const a = antes.get(d.fecha);
      if (!a) return false;
      const sinTrabajoAntes = a.festivos.includes(foto.servicioCalendario);
      const sinTrabajoAhora = d.festivos.includes(CALENDARIO_PLANTILLA);
      if (sinTrabajoAntes !== sinTrabajoAhora || (sinTrabajoAhora && !!a.cierreEmpresa !== !!d.cierreEmpresa)) return true;
      return foto.clientes.some((c, i) => {
        const viejo = c.horario?.[d.fecha] ?? null;
        const nuevo = clientes[i].horario?.[d.fecha] ?? null;
        return JSON.stringify(viejo) !== JSON.stringify(nuevo);
      });
    })
    .map((d) => d.fecha);
  return { dias, servicioCalendario: CALENDARIO_PLANTILLA, clientes, cambiadas };
}
