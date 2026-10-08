import {
  franjaDentro,
  generarFranjas,
  horasTexto,
  solapan,
  type AgenteMotor,
  type Aviso,
  type BolsaMotor,
  type ClienteMotor,
  type EntradaMotor,
  type Gravedad,
  type ObjetivoSemana,
} from "./motor";
import { horasCubiertas, saldoAgente } from "./saldo";

// ============================================================
// Modelo de vista del tablero de planificación. PURO (como el motor, y lo
// vigila la misma regla de ESLint): corre en el navegador sobre los datos
// que carga la página, así que las barras, el mapa y las incidencias se
// recalculan sin volver al servidor. Solo guardar llama al servidor,
// que vuelve a validar.
// ============================================================

export const VISTAS_TABLERO = ["agente", "cliente", "dia"] as const;
export type VistaTablero = (typeof VISTAS_TABLERO)[number];

export interface BloqueTablero {
  id: number;
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  clienteCodigo: string;
  regla: string;
  datos: Record<string, unknown>;
  fijado: boolean;
  origen: "motor" | "manual";
  editadoPor: string | null;
  editadoAt: string | null;
}

export interface VersionTablero {
  id: number;
  mes: string;
  numero: number;
  estado: "borrador" | "publicada" | "sustituida" | "descartada" | "simulacion";
  origen: string;
  revision: number;
  creadaPor: string | null;
  creadaAt: string;
  publicadaPor: string | null;
  publicadaAt: string | null;
}

/** Todo lo que el tablero necesita. Serializable: viaja del servidor al navegador. */
export interface DatosTablero {
  version: VersionTablero;
  /** Las demás versiones del mes, para cambiar de una a otra. */
  versiones: { id: number; numero: number; estado: VersionTablero["estado"] }[];
  /**
   * Foto de la entrada con que se generó la versión, con lo VIVO encima:
   * nombre, color y orden de los clientes, contrato de los agentes y
   * ausencias. Así un color o un contrato cambiado en configuración se ve sin
   * regenerar, y una ausencia nueva cuenta en las validaciones.
   */
  entrada: EntradaMotor;
  /** nº de agente → nombre visible (alias o el de sus usuarios de Altitude). */
  nombres: Record<string, string>;
  /** Agentes que el motor planificó (el resto, inactivos o sin cliente base). */
  activos: string[];
  /** Capacidad del mes al generar (turno − ausencias − festivos), en horas. */
  capacidadH: number | null;
  bloques: BloqueTablero[];
  /** Avisos del momento de generar que no son validaciones (datos caducados, objetivos...). */
  avisosGeneracion: Aviso[];
  tiposAusencia: Record<string, TipoAusenciaTablero>;
}

export interface TipoAusenciaTablero {
  nombre: string;
  color: string;
  /** Justifica horas en el saldo (vacaciones, libranza por festivo...). */
  computaComoTrabajada: boolean;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** '2026-11' → 'Noviembre 2026'. */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombre = MESES[m - 1] ?? mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

/** 0 → 'Lun'. */
export function diaCorto(diaSemana: number): string {
  return DIAS_CORTOS[diaSemana] ?? "";
}

/** '2026-11-03' → '03/11'. */
export function fechaDiaMes(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/**
 * Negro o blanco, el que más contraste dé sobre el color del cliente
 * (luminancia relativa de WCAG). Los colores de la plantilla son claros:
 * casi siempre sale negro.
 */
export function colorTexto(hex: string): "#000000" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000000";
  const canal = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

/** Posición horizontal en % dentro del día [inicioDia, finDia). Se recorta a los bordes. */
export function posicionPct(
  inicioMin: number,
  finMin: number,
  inicioDiaMin: number,
  finDiaMin: number,
): { left: number; width: number } {
  const total = finDiaMin - inicioDiaMin;
  const a = Math.max(inicioMin, inicioDiaMin);
  const b = Math.min(finMin, finDiaMin);
  if (b <= a || total <= 0) return { left: 0, width: 0 };
  return { left: ((a - inicioDiaMin) / total) * 100, width: ((b - a) / total) * 100 };
}

/** Bloques por `${agente}|${fecha}`, ordenados por hora. */
export function bloquesPorAgenteDia<B extends Pick<BloqueTablero, "agenteNumero" | "fecha" | "inicioMin">>(
  bloques: readonly B[],
): Map<string, B[]> {
  const mapa = new Map<string, B[]>();
  for (const b of bloques) {
    const k = `${b.agenteNumero}|${b.fecha}`;
    const lista = mapa.get(k) ?? [];
    lista.push(b);
    mapa.set(k, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.inicioMin - b.inicioMin);
  return mapa;
}

/**
 * Agentes con fila en el tablero, y por tanto a los que se les puede poner
 * bloques al editar: los que el motor planificó y cualquiera con bloques en
 * la versión guardada (p. ej. un fijado de alguien que ya no está activo).
 * El servidor usa la misma lista al repetir las operaciones.
 */
export function agentesConFila(
  activos: readonly string[],
  bloquesGuardados: readonly Pick<BloqueTablero, "agenteNumero">[],
): string[] {
  return [...new Set([...activos, ...bloquesGuardados.map((b) => b.agenteNumero)])].sort();
}

type BloqueHoras = Pick<BloqueTablero, "agenteNumero" | "fecha" | "inicioMin" | "finMin" | "clienteCodigo">;
const horasBloque = (b: BloqueHoras) => (b.finMin - b.inicioMin) / 60;

/** Horas planificadas por cliente: total del mes y por semana (lunes). */
export function horasPorCliente(
  bloques: readonly BloqueHoras[],
  semanaDe: Readonly<Record<string, string>>,
): Map<string, { total: number; porSemana: Record<string, number> }> {
  const mapa = new Map<string, { total: number; porSemana: Record<string, number> }>();
  for (const b of bloques) {
    const r = mapa.get(b.clienteCodigo) ?? { total: 0, porSemana: {} };
    const lunes = semanaDe[b.fecha] ?? b.fecha;
    r.total += horasBloque(b);
    r.porSemana[lunes] = (r.porSemana[lunes] ?? 0) + horasBloque(b);
    mapa.set(b.clienteCodigo, r);
  }
  return mapa;
}

/** Horas planificadas por `${agente}|${lunes}` y por agente en el mes. */
export function horasPorAgente(
  bloques: readonly BloqueHoras[],
  semanaDe: Readonly<Record<string, string>>,
): { semana: Map<string, number>; mes: Map<string, number> } {
  const semana = new Map<string, number>();
  const mes = new Map<string, number>();
  for (const b of bloques) {
    const k = `${b.agenteNumero}|${semanaDe[b.fecha] ?? b.fecha}`;
    semana.set(k, (semana.get(k) ?? 0) + horasBloque(b));
    mes.set(b.agenteNumero, (mes.get(b.agenteNumero) ?? 0) + horasBloque(b));
  }
  return { semana, mes };
}

export interface BarraBolsa {
  /** Cliente de la barra (cabeza del grupo o cliente con objetivo propio). */
  cliente: string;
  tipo: "grupo" | "objetivo" | "a_demanda";
  /** Grupo: él y los que cuentan como él (GH + BD + LX comparten bolsa). */
  segmentos: { cliente: string; horas: number }[];
  horas: number;
  /** Bolsa (grupo, a demanda) u objetivo del mes; null = sin referencia. */
  referencia: number | null;
  tipoReferencia: "bolsa" | "objetivo" | null;
  origenBolsa: BolsaMotor["origen"] | null;
  /** BD y LX: su barra de objetivo va dentro del grupo GH. */
  miembroDe: string | null;
}

/**
 * Barras de bolsa y objetivos del mes. Los clientes que «cuentan como» otro
 * comparten su bolsa (en la plantilla, GH y GH BBDD van contra las «Horas
 * iniciales» de GH), así que el grupo se compara entero con la bolsa de la
 * cabeza; si además tienen objetivo propio, llevan su barra debajo.
 */
export function barrasBolsa(
  clientes: readonly Pick<ClienteMotor, "codigo" | "modo" | "cuentaComo">[],
  horas: ReadonlyMap<string, { total: number }>,
  objetivos: readonly Pick<ObjetivoSemana, "cliente" | "horas">[],
  bolsas: readonly Pick<BolsaMotor, "cliente" | "horas" | "origen">[],
): BarraBolsa[] {
  const h = (c: string) => horas.get(c)?.total ?? 0;
  const objetivo = (c: string) => {
    const suyos = objetivos.filter((o) => o.cliente === c);
    return suyos.length > 0 ? suyos.reduce((a, o) => a + o.horas, 0) : null;
  };
  const bolsa = (c: string) => bolsas.find((b) => b.cliente === c) ?? null;
  const barras: BarraBolsa[] = [];

  for (const c of clientes.filter((x) => x.cuentaComo == null)) {
    const miembros = clientes.filter((x) => x.cuentaComo === c.codigo);
    const b = bolsa(c.codigo);
    if (c.modo === "a_demanda") {
      barras.push({
        cliente: c.codigo, tipo: "a_demanda", segmentos: [{ cliente: c.codigo, horas: h(c.codigo) }],
        horas: h(c.codigo), referencia: b?.horas ?? null, tipoReferencia: b ? "bolsa" : null,
        origenBolsa: b?.origen ?? null, miembroDe: null,
      });
    } else if (c.modo === "objetivo" && miembros.length === 0) {
      barras.push({
        cliente: c.codigo, tipo: "objetivo", segmentos: [{ cliente: c.codigo, horas: h(c.codigo) }],
        horas: h(c.codigo), referencia: objetivo(c.codigo), tipoReferencia: "objetivo",
        origenBolsa: null, miembroDe: null,
      });
    } else {
      const segmentos = [c, ...miembros].map((x) => ({ cliente: x.codigo, horas: h(x.codigo) }));
      barras.push({
        cliente: c.codigo, tipo: "grupo", segmentos,
        horas: segmentos.reduce((a, s) => a + s.horas, 0), referencia: b?.horas ?? null,
        tipoReferencia: b ? "bolsa" : null, origenBolsa: b?.origen ?? null, miembroDe: null,
      });
    }
    for (const m of miembros.filter((x) => x.modo === "objetivo")) {
      barras.push({
        cliente: m.codigo, tipo: "objetivo", segmentos: [{ cliente: m.codigo, horas: h(m.codigo) }],
        horas: h(m.codigo), referencia: objetivo(m.codigo), tipoReferencia: "objetivo",
        origenBolsa: null, miembroDe: c.codigo,
      });
    }
  }
  return barras;
}

type AgenteCapacidad = Pick<AgenteMotor, "numero" | "contratoSemanalH" | "turnos" | "ausencias">;

/** Festivos del calendario del equipo (en ellos no se trabaja ni cuenta el contrato). */
function festivosEquipo(entrada: Pick<EntradaMotor, "dias" | "servicioCalendario">): Set<string> {
  return new Set(entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario)).map((d) => d.fecha));
}

/**
 * Capacidad del mes en horas: turno − ausencias − festivos de los agentes
 * indicados, franja a franja, con el mismo criterio que el motor (franja
 * entera dentro del turno y sin tocar ninguna ausencia). Con las ausencias
 * VIVAS: una ausencia nueva la baja al momento, sin regenerar.
 */
export function capacidadPlan(
  entrada: Pick<EntradaMotor, "dias" | "servicioCalendario" | "inicioDiaMin" | "finDiaMin" | "pasoMin">,
  agentes: readonly AgenteCapacidad[],
): number {
  const festivos = festivosEquipo(entrada);
  const franjas = generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, entrada.pasoMin);
  let n = 0;
  for (const a of agentes) {
    for (const d of entrada.dias) {
      const turno = a.turnos[d.fecha] ?? [];
      if (turno.length === 0 || festivos.has(d.fecha)) continue;
      const ausencias = a.ausencias.filter((x) => x.fecha === d.fecha);
      for (const f of franjas) {
        const franja = { inicioMin: f, finMin: f + entrada.pasoMin };
        if (franjaDentro(f, entrada.pasoMin, turno) && !ausencias.some((x) => solapan(x, franja))) n++;
      }
    }
  }
  return (n * entrada.pasoMin) / 60;
}

export interface SaldoPrevisto {
  /** Horas planificadas. */
  plan: number;
  /** Horas justificadas: ausencias que cuentan como trabajadas y el turno de los festivos. */
  justificadas: number;
  /** Contrato semanal ÷ 5 por cada día de lunes a viernes del mes (festivos incluidos). */
  contrato: number;
  /** plan + justificadas − contrato. */
  saldo: number;
}

/**
 * Saldo PREVISTO por agente: plan + justificadas − contrato, por semana
 * (`${agente}|${lunes}`) y del mes (`${agente}|mes`), con la MISMA regla que
 * la página de Saldos (saldo.ts, todo previsto): el contrato es el semanal ÷ 5
 * cada día de lunes a viernes y un festivo justifica las horas de su turno de
 * ese día (si no se planifica trabajo). Una semana partida entre dos meses
 * lleva en cada uno la parte de sus días. Sin contrato, sin saldo.
 */
export function saldosPrevistos(
  entrada: Pick<EntradaMotor, "dias" | "servicioCalendario">,
  agentes: readonly AgenteCapacidad[],
  bloques: readonly BloqueHoras[],
  computaComoTrabajada: (tipo: string) => boolean,
): Map<string, SaldoPrevisto> {
  const festivos = festivosEquipo(entrada);
  const dias = entrada.dias.map((d) => ({ fecha: d.fecha, entreSemana: d.diaSemana < 5, festivo: festivos.has(d.fecha) }));
  const semanaDe = new Map(entrada.dias.map((d) => [d.fecha, d.lunes]));
  const plan = new Map<string, Record<string, number>>();
  for (const b of bloques) {
    const p = plan.get(b.agenteNumero) ?? {};
    p[b.fecha] = (p[b.fecha] ?? 0) + horasBloque(b);
    plan.set(b.agenteNumero, p);
  }

  const saldos = new Map<string, SaldoPrevisto>();
  for (const a of agentes) {
    const justificadasH: Record<string, number> = {};
    const turnoH: Record<string, number> = {};
    for (const d of entrada.dias) {
      const turno = a.turnos[d.fecha] ?? [];
      turnoH[d.fecha] = turno.reduce((h, t) => h + (t.finMin - t.inicioMin) / 60, 0);
      const h = horasCubiertas(
        turno,
        a.ausencias.filter((x) => x.fecha === d.fecha && computaComoTrabajada(x.tipo)),
      );
      if (h > 0) justificadasH[d.fecha] = h;
    }
    const r = saldoAgente({
      contratoSemanalH: a.contratoSemanalH,
      fechaDatos: "", // todo previsto
      dias,
      planH: plan.get(a.numero) ?? {},
      realH: {},
      justificadasH,
      turnoH,
      ajustesH: {},
    });
    if (!r) continue;
    const mes: SaldoPrevisto = { plan: 0, justificadas: 0, contrato: 0, saldo: 0 };
    for (const d of r.dias) {
      const k = `${a.numero}|${semanaDe.get(d.fecha)}`;
      const s = saldos.get(k) ?? { plan: 0, justificadas: 0, contrato: 0, saldo: 0 };
      for (const x of [s, mes]) {
        x.plan += d.trabajadas;
        x.justificadas += d.justificadas;
        x.contrato += d.contrato;
        x.saldo += d.saldo;
      }
      saldos.set(k, s);
    }
    saldos.set(`${a.numero}|mes`, mes);
  }
  return saldos;
}

/** «+1,00 h» / «−2,50 h» / «0,00 h». */
export function saldoTexto(horas: number): string {
  const r = Math.round(horas * 100) / 100;
  if (r === 0) return horasTexto(0);
  return `${r > 0 ? "+" : "−"}${horasTexto(Math.abs(r))}`;
}

export type EstadoFranja = "sin_minimo" | "bajo" | "justo" | "holgado";

/** Semáforo del mapa de cobertura: rojo por debajo del mínimo, ámbar justo, verde con holgura. */
export function estadoFranja(hay: number, minimo: number): EstadoFranja {
  if (minimo <= 0) return "sin_minimo";
  if (hay < minimo) return "bajo";
  return hay === minimo ? "justo" : "holgado";
}

/** Agentes en `cliente` (y, si se pide, en los que cuentan como él) durante la franja. */
export function agentesEnFranja(
  bloques: readonly BloqueHoras[],
  clientes: ReadonlySet<string>,
  fecha: string,
  inicioMin: number,
  pasoMin: number,
): string[] {
  const agentes = new Set<string>();
  for (const b of bloques) {
    if (b.fecha === fecha && clientes.has(b.clienteCodigo) && b.inicioMin <= inicioMin && inicioMin + pasoMin <= b.finMin) {
      agentes.add(b.agenteNumero);
    }
  }
  return [...agentes].sort();
}

/** Recuento de avisos por gravedad. */
export function contarGravedades(avisos: readonly Pick<Aviso, "gravedad">[]): Record<Gravedad, number> {
  const r: Record<Gravedad, number> = { dura: 0, blanda: 0, info: 0 };
  for (const a of avisos) r[a.gravedad]++;
  return r;
}

/** Título legible de cada código de aviso (agrupación del panel de incidencias). */
export const TITULOS_AVISO: Record<string, string> = {
  solapado: "Bloques solapados",
  sin_usuario: "Agente sin usuario de ese cliente",
  sobre_ausencia: "Bloque sobre una ausencia",
  fuera_horario_servicio: "Fuera del horario del servicio",
  fuera_turno: "Fuera del turno del agente",
  trabajo_festivo: "Trabajo en festivo",
  semana_sobre_contrato: "Semana por encima del contrato",
  horas_seguidas: "Demasiadas horas seguidas del mismo cliente",
  franja_bajo_minimo: "Cliente base por debajo del mínimo",
  objetivo_no_alcanzado: "Objetivo no alcanzado",
  agente_inactivo: "Agentes inactivos (no se planifican)",
  agente_sin_cliente_base: "Agentes sin usuario del cliente base",
  agente_sin_turno: "Agentes sin turno",
  cliente_sin_bloques: "Cliente con objetivo y sin bloques candidatos",
  datos_caducados: "Datos caducados",
  prefijo_sin_cliente: "Prefijos de usuario sin cliente",
  fuera_de_plantilla: "Agentes fuera de plantilla con horas recientes",
  festivos_sin_vigencia: "Festivos u horarios sin vigencia",
  estacionalidad: "Estacionalidad",
  demanda_sin_datos: "Demanda sin datos",
  lista_sin_datos: "Lista sin datos",
  listas_reconstruidas: "Listas reconstruidas",
  ritmo_desconocido: "Ritmo de cierre desconocido",
  contrato_limita: "Horas de contrato que limitan el objetivo",
  contrato_sin_inicio: "Horas contratadas sin fecha de inicio",
};
