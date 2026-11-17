// NOTA: solo servidor. Junta los datos del panel de RRHH (docs/plan-rrhh.md):
// personas y su horario, sesiones (user_log, la misma fuente que
// Planificación → Horas), pausas (ag_in_cp_log) y ausencias (las de
// Planificación). Las cuentas son las de los módulos puros dia.ts, horario.ts
// y motivos.ts.
import { format } from "date-fns";
import type { PlanVersionRow } from "@/lib/db/schema";
import { ayerISO, hoyISO } from "@/lib/fechas";
import { leerCalendarioLaboral } from "@/lib/planificacion/calendarios";
import { leerEquipo, nombresAgentes } from "@/lib/planificacion/equipo";
import { sumarDias } from "@/lib/planificacion/motor";
import type { EntradaMotor } from "@/lib/planificacion/motor/tipos";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as planRepo from "@/lib/planificacion/repositorio";
import { logadoRango } from "@/lib/planificacion/seguimiento";
import { parsearUsuario } from "@/lib/planificacion/usuarios";
import { compararTexto } from "@/lib/orden";
import { pausasUsuarios } from "@/lib/rdb/queries/rrhh";
import {
  calcularDiaPersona,
  resumenEquipo,
  unirTramos,
  type AusenciaPersona,
  type DiaPersona,
  type PausaPersona,
  type ResumenEquipo,
  type Tramo,
} from "./dia";
import { aprenderHorario, contratosDistintos, diaSemanaDe, horasSemana, SEMANAS_APRENDER, type DiaConectada, type HorarioSemana } from "./horario";
import { acumularPeriodo, resumenApuntadas, totalesPeriodo, type ApuntadaPeriodo, type ResumenPeriodoPersona } from "./periodo";
import { esGrupo, grupoAutomatico, type GrupoRrhh } from "./grupos";
import * as repo from "./repositorio";

export type FuenteHorario = "planificacion" | "confirmado" | "aprendido";

export const NOMBRE_FUENTE: Record<FuenteHorario, string> = {
  planificacion: "Planificación",
  confirmado: "Confirmado por RRHH",
  aprendido: "Aprendido",
};

export interface PersonaRrhh {
  numero: string;
  /** Su usuario de Altitude principal (sin sufijo, el último usado): «GH_0851», «Bol_0260». */
  codigo: string;
  nombre: string | null;
  usuarios: string[];
  enPlanificacion: boolean;
  contratoPlan: number | null;
  contratoRrhh: number | null;
  /** El contrato de RRHH no es el de Planificación. */
  avisoContrato: boolean;
  horarioConfirmado: HorarioSemana | null;
  horarioAprendido: HorarioSemana;
  /** Horas a la semana del horario que se usa (confirmado o aprendido). */
  horasHorario: number;
  excluida: boolean;
  /** Grupo para filtrar: el puesto a mano por RRHH o, si no, el automático. */
  grupo: GrupoRrhh;
  grupoAutomatico: GrupoRrhh;
  /** true = RRHH lo ha puesto a mano. */
  grupoManual: boolean;
  notas: string | null;
  ultimaSesion: string | null;
}

const minutoDelDia = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const DIAS_ACTIVA = 60;

/** nº de agente de un usuario: el de Planificación o, si aún no se ha sincronizado, el de su nombre. */
function numeroDe(usrName: string, agenteDeUsuario: ReadonlyMap<string, string>): string | null {
  return agenteDeUsuario.get(usrName) ?? parsearUsuario(usrName)?.numero ?? null;
}

/**
 * Personas del panel: las de Planificación (todas las que tienen usuario con
 * nº) que han trabajado en los últimos 60 días, están en la plantilla o
 * tienen algo apuntado en RRHH, con su horario aprendido de las últimas
 * semanas (de los agregados de user_log de Planificación: no va a RDBv2 si
 * la tarea de la noche ha corrido).
 */
export async function personasRrhh(hoy = hoyISO()): Promise<PersonaRrhh[]> {
  const ayer = sumarDias(hoy, -1);
  const eq = leerEquipo(leerParametrosPlan().equipo, ayer);
  const nombres = nombresAgentes(eq);
  const rrhh = repo.leerPersonas();
  const confirmados = repo.leerHorariosConfirmados();

  // Días conectados de las últimas semanas, por persona
  const logado = await logadoRango(sumarDias(hoy, -7 * SEMANAS_APRENDER), ayer);
  const dias = new Map<string, DiaConectada[]>();
  for (const u of logado.porUsuario) {
    const n = u.agenteNumero ?? parsearUsuario(u.usrName)?.numero;
    if (!n) continue;
    dias.set(n, [...(dias.get(n) ?? []), { fecha: u.fecha, inicioMin: u.inicioMin, finMin: u.finMin }]);
  }

  const desdeActiva = sumarDias(hoy, -DIAS_ACTIVA);
  const numeros = new Set<string>([...eq.agentes.map((a) => a.numero), ...dias.keys()]);
  const personas: PersonaRrhh[] = [];
  for (const numero of numeros) {
    const agente = eq.agentes.find((a) => a.numero === numero);
    const usuarios = eq.usuarios.filter((u) => u.agenteNumero === numero);
    const ultimaSesion =
      usuarios
        .map((u) => eq.ultimas.get(u.usrName))
        .filter((f): f is string => !!f)
        .sort()
        .at(-1) ?? null;
    const enPlanificacion = eq.numerosPlantilla.has(numero);
    const fila = rrhh.get(numero);
    if (!enPlanificacion && !fila && !dias.has(numero) && (ultimaSesion == null || ultimaSesion < desdeActiva)) continue;
    const principal =
      [...usuarios].sort(
        (a, b) =>
          Number(a.sufijo !== "") - Number(b.sufijo !== "") ||
          (eq.ultimas.get(b.usrName) ?? "").localeCompare(eq.ultimas.get(a.usrName) ?? "") ||
          compararTexto(a.usrName, b.usrName),
      )[0]?.usrName ?? numero;
    const horarioConfirmado = confirmados.get(numero) ?? null;
    const horarioAprendido = aprenderHorario(dias.get(numero) ?? []);
    const contratoPlan = agente?.contratoSemanalH ?? null;
    const contratoRrhh = fila?.contratoSemanalH ?? null;
    personas.push({
      numero,
      codigo: principal,
      nombre: nombres.get(numero) ?? null,
      usuarios: usuarios.map((u) => u.usrName).sort(compararTexto),
      enPlanificacion,
      contratoPlan,
      contratoRrhh,
      avisoContrato: enPlanificacion && contratosDistintos(contratoRrhh, contratoPlan),
      horarioConfirmado,
      horarioAprendido,
      horasHorario: horasSemana(horarioConfirmado ?? horarioAprendido),
      excluida: fila?.excluida ?? false,
      ...(() => {
        const auto = grupoAutomatico({ enPlanificacion, codigo: principal });
        const manual = esGrupo(fila?.grupo) ? fila.grupo : null;
        return { grupo: manual ?? auto, grupoAutomatico: auto, grupoManual: manual != null };
      })(),
      notas: fila?.notas ?? null,
      ultimaSesion,
    });
  }
  return personas.sort((a, b) => compararTexto(a.codigo, b.codigo));
}

// ---------- El día ----------

export interface FilaDia {
  persona: PersonaRrhh;
  fuente: FuenteHorario;
  horario: Tramo[];
  dia: DiaPersona;
  /** Ausencias apuntadas que tocan ese día (las de Planificación). */
  ausencias: AusenciaPersona[];
  /** Sesiones de cada usuario (para el detalle: con qué usuario se conectó). */
  sesiones: { usrName: string; inicioMin: number; finMin: number }[];
  /** Cuántas notas de RRHH tiene ese día. */
  notas: number;
}

export interface DatosDia {
  fecha: string;
  esHoy: boolean;
  ahoraMin: number | null;
  /** Festivo o cierre del calendario laboral de la plantilla (nombre), si lo es. */
  festivo: string | null;
  filas: FilaDia[];
  resumen: ResumenEquipo;
  /** Mes sin plan PUBLICADO (las personas de la plantilla usan su horario de RRHH). */
  sinPlan: boolean;
}

/** Horario de cada persona de la plantilla ese día, desde la versión PUBLICADA del mes. */
function horariosPlan(fecha: string, version: PlanVersionRow | null): { bloques: Map<string, Tramo[]>; turnos: Map<string, Tramo[]> } | null {
  if (!version) return null;
  const bloques = new Map<string, Tramo[]>();
  for (const b of planRepo.bloquesVersion(version.id)) {
    if (b.fecha !== fecha) continue;
    bloques.set(b.agenteNumero, [...(bloques.get(b.agenteNumero) ?? []), { inicioMin: b.inicioMin, finMin: b.finMin }]);
  }
  // El turno de su patrón (la foto de la versión, con las semanas A↔B): para
  // dibujar una ausencia de jornada completa, que no deja bloques ese día
  const foto = version.entradas as EntradaMotor | null;
  const turnos = new Map<string, Tramo[]>();
  for (const a of foto?.agentes ?? []) {
    const t = a.turnos?.[fecha];
    if (t?.length) turnos.set(a.numero, t);
  }
  return { bloques, turnos };
}

/** El día de todas las personas (hoy, en vivo: caché de 60 s en RDBv2). */
export async function datosDia(fecha: string, ahora = new Date()): Promise<DatosDia> {
  const hoy = format(ahora, "yyyy-MM-dd");
  const esHoy = fecha === hoy;
  const ahoraMin = esHoy ? minutoDelDia(ahora) : null;

  const [personas, logado, pausas] = await Promise.all([personasRrhh(hoy), logadoRango(fecha, fecha), pausasUsuarios(fecha, fecha)]);
  const eq = leerEquipo(leerParametrosPlan().equipo, ayerISO());
  const config = repo.leerConfigMotivosRrhh();
  const laboral = leerCalendarioLaboral(fecha, fecha)[0] ?? null;
  // Solo el plan PUBLICADO (decidido el 17/11/2026: lo mismo que la pestaña
  // «Turnos» y que reciben las agentes); sin publicada, horario de RRHH
  const plan = horariosPlan(
    fecha,
    planRepo.versionesMes(fecha.slice(0, 7)).find((v) => v.estado === "publicada") ?? null,
  )

  // Sesiones y pausas por persona
  const sesiones = new Map<string, FilaDia["sesiones"]>();
  for (const u of logado.porUsuario) {
    if (u.fecha !== fecha) continue;
    const n = u.agenteNumero ?? numeroDe(u.usrName, eq.agenteDeUsuario);
    if (!n) continue;
    sesiones.set(n, [...(sesiones.get(n) ?? []), { usrName: u.usrName, inicioMin: u.inicioMin, finMin: u.finMin }]);
  }
  const pausasPorPersona = new Map<string, PausaPersona[]>();
  for (const p of pausas) {
    if (p.fecha !== fecha) continue;
    const n = numeroDe(p.usrName, eq.agenteDeUsuario);
    if (!n) continue;
    pausasPorPersona.set(n, [
      ...(pausasPorPersona.get(n) ?? []),
      { inicioMin: p.inicioSeg / 60, finMin: Math.min(p.finSeg / 60, 1440), motivoCodigo: p.motivoCodigo, motivo: p.motivo, abierta: p.abierta },
    ]);
  }

  // Ausencias apuntadas (las de Planificación)
  const tipos = new Map(repo.leerTiposAusencia().map((t) => [t.codigo, t]));
  const ausencias = new Map<string, AusenciaPersona[]>();
  for (const a of planRepo.leerAusencias(fecha, fecha)) {
    const tipo = tipos.get(a.tipoCodigo);
    ausencias.set(a.agenteNumero, [
      ...(ausencias.get(a.agenteNumero) ?? []),
      {
        id: a.id,
        tipoCodigo: a.tipoCodigo,
        tipoNombre: tipo?.nombre ?? a.tipoCodigo,
        color: tipo?.color ?? "#BFBFBF",
        computaComoTrabajada: tipo?.computaComoTrabajada ?? false,
        inicioMin: a.inicioMin,
        finMin: a.finMin,
        notas: a.notas,
      },
    ]);
  }

  const notas = repo.leerNotas(fecha);
  const ds = diaSemanaDe(fecha);
  const filas: FilaDia[] = [];
  for (const persona of personas) {
    if (persona.excluida) continue;
    const suyas = ausencias.get(persona.numero) ?? [];
    let fuente: FuenteHorario;
    let horario: Tramo[];
    if (persona.enPlanificacion && plan) {
      fuente = "planificacion";
      horario = unirTramos(plan.bloques.get(persona.numero) ?? []);
      if (horario.length === 0 && suyas.some((a) => a.inicioMin == null)) horario = plan.turnos.get(persona.numero) ?? [];
    } else {
      fuente = persona.horarioConfirmado ? "confirmado" : "aprendido";
      const tramos = (persona.horarioConfirmado ?? persona.horarioAprendido)[ds] ?? [];
      // En un festivo o cierre de la plantilla no se espera a nadie (la plantilla de Planificación ya lo lleva en su plan)
      horario = laboral ? [] : tramos;
    }
    const suyasSesiones = sesiones.get(persona.numero) ?? [];
    if (horario.length === 0 && suyasSesiones.length === 0 && suyas.length === 0) continue;
    const dia = calcularDiaPersona({
      horario,
      sesiones: suyasSesiones,
      pausas: pausasPorPersona.get(persona.numero) ?? [],
      ausencias: suyas,
      ahoraMin,
      configMotivos: config,
    });
    filas.push({
      persona,
      fuente,
      horario,
      dia,
      ausencias: suyas,
      sesiones: suyasSesiones.sort((a, b) => a.inicioMin - b.inicioMin),
      notas: notas.filter((n) => n.agenteNumero === persona.numero).length,
    });
  }

  return {
    fecha,
    esHoy,
    ahoraMin,
    festivo: laboral ? (laboral.nombre ?? (laboral.tipo === "cierre" ? "Cierre de empresa" : "Festivo")) : null,
    filas,
    resumen: resumenEquipo(filas.map((f) => f.dia)),
    sinPlan: plan == null,
  };
}

// ---------- Un periodo, por persona (vista «Por agente») ----------

/** Como mucho, 3 meses: las pausas salen de ag_in_cp_log en vivo. */
export const MAX_DIAS_PERIODO = 93;

export interface FilaPeriodo {
  persona: PersonaRrhh;
  resumen: ResumenPeriodoPersona;
  apuntadas: ApuntadaPeriodo[];
}

export interface DatosPeriodo {
  desde: string;
  hasta: string;
  /** El periodo llega a hoy (se refresca cada minuto). */
  enCurso: boolean;
  filas: FilaPeriodo[];
  total: ResumenPeriodoPersona;
}

/**
 * De un periodo, por persona: tiempo conectado y pausas que son ausencia por
 * motivo (el mismo cálculo del día, día a día, sin horario: en esta vista
 * no entra el tiempo sin conectar) y las ausencias apuntadas, aparte.
 */
export async function datosPeriodo(desde: string, hasta: string, ahora = new Date()): Promise<DatosPeriodo> {
  const hoy = format(ahora, "yyyy-MM-dd");
  const hastaDatos = hasta < hoy ? hasta : hoy;
  const ahoraMin = minutoDelDia(ahora);
  const [personas, logado, pausas] = await Promise.all([
    personasRrhh(hoy),
    logadoRango(desde, hastaDatos),
    pausasUsuarios(desde, hastaDatos),
  ]);
  const eq = leerEquipo(leerParametrosPlan().equipo, ayerISO());
  const config = repo.leerConfigMotivosRrhh();

  // persona → fecha → sesiones / pausas
  const sesiones = new Map<string, Map<string, Tramo[]>>();
  const pausasDe = new Map<string, Map<string, PausaPersona[]>>();
  const meter = <T>(mapa: Map<string, Map<string, T[]>>, n: string, fecha: string, x: T) => {
    const porFecha = mapa.get(n) ?? new Map<string, T[]>();
    porFecha.set(fecha, [...(porFecha.get(fecha) ?? []), x]);
    mapa.set(n, porFecha);
  };
  for (const u of logado.porUsuario) {
    const n = u.agenteNumero ?? numeroDe(u.usrName, eq.agenteDeUsuario);
    if (n) meter(sesiones, n, u.fecha, { inicioMin: u.inicioMin, finMin: u.finMin });
  }
  for (const p of pausas) {
    const n = numeroDe(p.usrName, eq.agenteDeUsuario);
    if (!n) continue;
    meter(pausasDe, n, p.fecha, {
      inicioMin: p.inicioSeg / 60,
      finMin: Math.min(p.finSeg / 60, 1440),
      motivoCodigo: p.motivoCodigo,
      motivo: p.motivo,
      abierta: p.abierta,
    });
  }

  const tipos = new Map(repo.leerTiposAusencia().map((t) => [t.codigo, t]));
  const ausencias = new Map<string, Parameters<typeof resumenApuntadas>[0][number][]>();
  for (const a of planRepo.leerAusencias(desde, hasta)) {
    const tipo = tipos.get(a.tipoCodigo);
    ausencias.set(a.agenteNumero, [
      ...(ausencias.get(a.agenteNumero) ?? []),
      {
        id: a.id,
        tipoCodigo: a.tipoCodigo,
        tipoNombre: tipo?.nombre ?? a.tipoCodigo,
        color: tipo?.color ?? "#BFBFBF",
        computaComoTrabajada: tipo?.computaComoTrabajada ?? false,
        inicioMin: a.inicioMin,
        finMin: a.finMin,
        desde: a.desde,
        hasta: a.hasta,
      },
    ]);
  }

  const filas: FilaPeriodo[] = [];
  for (const persona of personas) {
    if (persona.excluida) continue;
    const susSesiones = sesiones.get(persona.numero) ?? new Map<string, Tramo[]>();
    const susPausas = pausasDe.get(persona.numero) ?? new Map<string, PausaPersona[]>();
    const fechas = new Set([...susSesiones.keys(), ...susPausas.keys()]);
    const dias = [...fechas].map((fecha) =>
      calcularDiaPersona({
        horario: [],
        sesiones: susSesiones.get(fecha) ?? [],
        pausas: susPausas.get(fecha) ?? [],
        ausencias: [],
        ahoraMin: fecha === hoy ? ahoraMin : null,
        configMotivos: config,
      }),
    );
    const resumen = acumularPeriodo(dias);
    const apuntadas = resumenApuntadas(ausencias.get(persona.numero) ?? [], desde, hasta);
    if (resumen.conectadaMin === 0 && apuntadas.length === 0) continue;
    filas.push({ persona, resumen, apuntadas });
  }

  return { desde, hasta, enCurso: hasta >= hoy, filas, total: totalesPeriodo(filas.map((f) => f.resumen)) };
}

// ---------- Filtro por grupo (Bolsas · Socios · GH) ----------

/** El día solo de un grupo (null = todos), con las cajas recalculadas. */
export function filtrarDia(datos: DatosDia, grupo: GrupoRrhh | null): DatosDia {
  if (!grupo) return datos;
  const filas = datos.filas.filter((f) => f.persona.grupo === grupo);
  return { ...datos, filas, resumen: resumenEquipo(filas.map((f) => f.dia)) };
}

/** El periodo solo de un grupo (null = todos), con el total recalculado. */
export function filtrarPeriodo(datos: DatosPeriodo, grupo: GrupoRrhh | null): DatosPeriodo {
  if (!grupo) return datos;
  const filas = datos.filas.filter((f) => f.persona.grupo === grupo);
  return { ...datos, filas, total: totalesPeriodo(filas.map((f) => f.resumen)) };
}
