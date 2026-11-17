// ============================================================
// Panel de RRHH: el día de una persona en una sola línea de tiempo (docs/
// plan-rrhh.md). Puro: sin I/O ni Date.now() (el «ahora» llega de fuera).
//
// Entran su horario de ese día, sus sesiones (user_log de TODOS sus
// usuarios), sus pausas (ag_in_cp_log op 2, ya sin duplicados por campaña) y
// las ausencias apuntadas (las de Planificación). Sale una lista de tramos
// sin solapes, en orden, y los totales:
//
// - conectada / pausa / «hasta ponerse disponible»: mientras está conectada.
// - ausencia: lo apuntado (vacaciones, médico...), dentro de su horario o en
//   las horas apuntadas.
// - sin conectar: dentro de su horario, sin conexión ni ausencia apuntada.
//   Tarde (antes de su primera conexión en ese tramo del horario), salida
//   antes (después de la última), hueco (entre medias) o sin entrar (no se
//   conectó en todo el tramo). Cuenta desde el primer minuto: lo que dura
//   menos de 1 min no sale. Las pausas de menos de 1 min, tampoco (salvo la
//   que sigue abierta ahora).
//
// Lo que se solapa se resuelve así: conectada (con su pausa, si la hay) >
// ausencia apuntada > sin conectar. Todo en minutos desde las 00:00, con
// decimales.
// ============================================================

import {
  categoriaMotivo,
  etiquetaMotivo,
  ETIQUETA_ARRANQUE,
  MOTIVO_NOT_WORKING,
  type CategoriaMotivo,
  type ConfigMotivos,
} from "./motivos";

export interface Tramo {
  inicioMin: number;
  finMin: number;
}

export interface PausaPersona extends Tramo {
  motivoCodigo: number | null;
  /** Nombre del motivo en Altitude. */
  motivo: string;
  abierta: boolean;
}

export interface AusenciaPersona {
  id: number;
  tipoCodigo: string;
  tipoNombre: string;
  color: string;
  computaComoTrabajada: boolean;
  /** null = jornada completa. */
  inicioMin: number | null;
  finMin: number | null;
  notas: string | null;
}

export interface EntradaDiaPersona {
  horario: readonly Tramo[];
  sesiones: readonly Tramo[];
  pausas: readonly PausaPersona[];
  ausencias: readonly AusenciaPersona[];
  /** Minuto actual si el día es HOY (lo de después aún no ha pasado); null si el día ya acabó. */
  ahoraMin: number | null;
  configMotivos: ConfigMotivos;
}

export type PorQueSinConectar = "tarde" | "salida_antes" | "hueco" | "sin_entrar";

export type TramoDia =
  | (Tramo & { tipo: "conectada" })
  | (Tramo & { tipo: "pausa"; categoria: Exclude<CategoriaMotivo, "oculto">; motivo: string; motivoCodigo: number | null; abierta: boolean })
  | (Tramo & { tipo: "arranque" })
  | (Tramo & { tipo: "sin_conectar"; porQue: PorQueSinConectar })
  | (Tramo & { tipo: "ausencia"; ausencia: AusenciaPersona });

export interface ResumenMotivo {
  motivo: string;
  categoria: Exclude<CategoriaMotivo, "oculto"> | "arranque";
  veces: number;
  minutos: number;
}

export interface DiaPersona {
  tramos: TramoDia[];
  /** Primera conexión del día (null = no se ha conectado). */
  entradaMin: number | null;
  /** Última desconexión (null = no se ha conectado, o sigue conectada ahora). */
  salidaMin: number | null;
  conectadaAhora: boolean;
  horarioMin: number;
  conectadaMin: number;
  tardeMin: number;
  salidaAntesMin: number;
  huecosMin: number;
  sinEntrarMin: number;
  /** tarde + salida antes + huecos + sin entrar. */
  sinConectarMin: number;
  pausasAusenciaMin: number;
  pausasTrabajoMin: number;
  arranqueMin: number;
  ausenciaApuntadaMin: number;
  /** Tiempo ausente sin justificar: sin conectar en su horario + pausas que son ausencia. */
  tiempoAusenteMin: number;
  llegoTarde: boolean;
  /** Ausencia de jornada completa apuntada ese día. */
  ausenciaCompleta: AusenciaPersona | null;
  /** Tenía horario, ya empezó y no se conectó nada (con o sin ausencia apuntada). */
  ausenteTodoElDia: boolean;
  porMotivo: ResumenMotivo[];
}

/** Margen para dar una NOT_WORKING por «la del principio»: empieza a ±2 min de un login. */
export const MARGEN_ARRANQUE_MIN = 2;
/** Lo que no llega a 1 min sin conectar no cuenta (decidido: «desde el primer minuto»). */
export const MINIMO_SIN_CONECTAR_MIN = 1;
/**
 * Las pausas de menos de 1 min no cuentan, ni en tiempo ni en veces
 * (decidido con Christian el 16/11/2026): «Fin de Jornada» se pone también
 * al cambiar de usuario de Altitude, unos segundos cada vez (01-15/11: 488
 * de 542 por debajo del minuto). Ese rato queda como conectada. Una pausa
 * ABIERTA ahora sí sale aunque aún no llegue al minuto.
 */
export const MINIMO_PAUSA_MIN = 1;
const EPS = 1e-9;

/** Une tramos que se solapan o se tocan. Devuelve una lista nueva, ordenada. */
export function unirTramos(tramos: readonly Tramo[]): Tramo[] {
  const orden = tramos.filter((t) => t.finMin > t.inicioMin).sort((a, b) => a.inicioMin - b.inicioMin);
  const salida: Tramo[] = [];
  for (const t of orden) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && t.inicioMin <= ultimo.finMin + EPS) ultimo.finMin = Math.max(ultimo.finMin, t.finMin);
    else salida.push({ inicioMin: t.inicioMin, finMin: t.finMin });
  }
  return salida;
}

/** Recorta tramos a [desde, hasta]. */
export function recortar<T extends Tramo>(tramos: readonly T[], desde: number, hasta: number): T[] {
  return tramos
    .map((t) => ({ ...t, inicioMin: Math.max(t.inicioMin, desde), finMin: Math.min(t.finMin, hasta) }))
    .filter((t) => t.finMin > t.inicioMin + EPS);
}

export const minutosDe = (tramos: readonly Tramo[]) => tramos.reduce((s, t) => s + (t.finMin - t.inicioMin), 0);

const dentro = (tramos: readonly Tramo[], m: number) => tramos.some((t) => t.inicioMin <= m && m < t.finMin);
const haySolape = (tramos: readonly Tramo[], desde: number, hasta: number) =>
  tramos.some((t) => t.inicioMin < hasta - EPS && t.finMin > desde + EPS);

type PausaClasificada = PausaPersona & { clase: "trabajo" | "ausencia" | "arranque"; etiqueta: string };

/** Prioridad cuando dos pausas (de dos usuarios) se pisan: la que dice qué hacía. */
const PRIORIDAD: Record<PausaClasificada["clase"], number> = { trabajo: 0, ausencia: 1, arranque: 2 };

function clasificarPausas(e: EntradaDiaPersona, conectada: readonly Tramo[], finDia: number): PausaClasificada[] {
  const logins = e.sesiones.map((s) => s.inicioMin);
  const salida: PausaClasificada[] = [];
  for (const p of e.pausas) {
    if (!p.abierta && p.finMin - p.inicioMin < MINIMO_PAUSA_MIN - EPS) continue;
    const categoria = categoriaMotivo(p.motivoCodigo, p.motivo, e.configMotivos);
    if (categoria === "oculto") continue;
    const login =
      p.motivo.trim() === MOTIVO_NOT_WORKING ? logins.find((l) => Math.abs(l - p.inicioMin) <= MARGEN_ARRANQUE_MIN + EPS) : undefined;
    const arranque = login != null;
    const clase = arranque ? "arranque" : categoria;
    const etiqueta = arranque ? ETIQUETA_ARRANQUE : etiquetaMotivo(p.motivo);
    // La del principio empieza en el login: Altitude la abre unos segundos
    // después y quedaba un tramo «conectada» de segundos delante
    const inicio = login != null ? Math.min(login, p.inicioMin) : p.inicioMin;
    // Solo mientras está conectada (una pausa fuera de sesión no es del día de nadie)
    for (const c of conectada) {
      const ini = Math.max(inicio, c.inicioMin, 0);
      const fin = Math.min(p.finMin, c.finMin, finDia);
      if (fin > ini + EPS) salida.push({ ...p, inicioMin: ini, finMin: fin, clase, etiqueta });
    }
  }
  return salida;
}

/** Tramos de las ausencias apuntadas (la de jornada completa ocupa el día entero). */
function tramosAusencia(ausencias: readonly AusenciaPersona[]): (Tramo & { ausencia: AusenciaPersona })[] {
  return ausencias.map((a) => ({
    inicioMin: a.inicioMin ?? 0,
    finMin: a.finMin ?? 1440,
    ausencia: a,
  }));
}

type Elemento = TramoDia;

/** Clave para juntar elementos seguidos iguales. */
function clave(t: Elemento): string {
  switch (t.tipo) {
    case "pausa":
      return `p|${t.categoria}|${t.motivo}|${t.abierta}`;
    case "ausencia":
      return `a|${t.ausencia.id}`;
    case "sin_conectar":
      return "s";
    default:
      return t.tipo;
  }
}

/** Por qué no estaba conectada en un tramo de su horario. */
function porQue(t: Tramo, horario: readonly Tramo[], conectada: readonly Tramo[], finDia: number): PorQueSinConectar {
  const h = horario.find((x) => x.inicioMin <= t.inicioMin + EPS && t.finMin <= x.finMin + EPS);
  if (!h) return "hueco";
  const antes = haySolape(conectada, h.inicioMin, t.inicioMin);
  const despues = haySolape(conectada, t.finMin, h.finMin);
  if (!antes && !despues) return "sin_entrar";
  if (!antes) return "tarde";
  if (despues) return "hueco";
  // Se fue y no ha vuelto: salida antes si el tramo del horario ya acabó; si no, de momento es un hueco
  return h.finMin <= finDia + EPS ? "salida_antes" : "hueco";
}

/** El día de una persona. */
export function calcularDiaPersona(e: EntradaDiaPersona): DiaPersona {
  const finDia = e.ahoraMin ?? 1440;
  const horario = unirTramos(recortar(e.horario, 0, 1440));
  const conectada = unirTramos(recortar(e.sesiones, 0, finDia));
  const pausas = clasificarPausas(e, conectada, finDia);
  const ausencias = tramosAusencia(e.ausencias);
  const horarioPasado = recortar(horario, 0, finDia);

  // Cortes: cada cambio de cualquiera de las capas
  const cortes = new Set<number>([0, finDia]);
  for (const t of [...horarioPasado, ...conectada, ...pausas, ...recortar(ausencias, 0, finDia)]) {
    cortes.add(t.inicioMin);
    cortes.add(t.finMin);
  }
  const puntos = [...cortes].filter((m) => m >= 0 && m <= finDia).sort((a, b) => a - b);

  const elementos: Elemento[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    if (b - a <= EPS) continue;
    const medio = (a + b) / 2;
    let el: Elemento | null = null;
    if (dentro(conectada, medio)) {
      const activas = pausas
        .filter((p) => p.inicioMin <= medio && medio < p.finMin)
        .sort((x, y) => PRIORIDAD[x.clase] - PRIORIDAD[y.clase] || x.inicioMin - y.inicioMin);
      const p = activas[0];
      if (!p) el = { tipo: "conectada", inicioMin: a, finMin: b };
      else if (p.clase === "arranque") el = { tipo: "arranque", inicioMin: a, finMin: b };
      else el = { tipo: "pausa", inicioMin: a, finMin: b, categoria: p.clase, motivo: p.etiqueta, motivoCodigo: p.motivoCodigo, abierta: p.abierta };
    } else {
      const enHorario = dentro(horarioPasado, medio);
      const aus = ausencias.find((x) => x.inicioMin <= medio && medio < x.finMin);
      // La de jornada completa se dibuja sobre su horario; la de unas horas, en sus horas
      if (aus && (enHorario || aus.ausencia.inicioMin != null)) el = { tipo: "ausencia", inicioMin: a, finMin: b, ausencia: aus.ausencia };
      else if (enHorario) el = { tipo: "sin_conectar", inicioMin: a, finMin: b, porQue: "hueco" };
    }
    if (!el) continue;
    const ultimo = elementos[elementos.length - 1];
    if (ultimo && Math.abs(ultimo.finMin - a) <= EPS && clave(ultimo) === clave(el)) ultimo.finMin = b;
    else elementos.push(el);
  }

  // Por qué no estaba conectada, y fuera lo de menos de 1 min
  const tramos: TramoDia[] = [];
  for (const t of elementos) {
    if (t.tipo !== "sin_conectar") {
      tramos.push(t);
      continue;
    }
    if (t.finMin - t.inicioMin < MINIMO_SIN_CONECTAR_MIN - EPS) continue;
    tramos.push({ ...t, porQue: porQue(t, horario, conectada, finDia) });
  }

  const suma = (f: (t: TramoDia) => boolean) => tramos.filter(f).reduce((s, t) => s + (t.finMin - t.inicioMin), 0);
  const sinConectar = (p: PorQueSinConectar) => suma((t) => t.tipo === "sin_conectar" && t.porQue === p);
  const tardeMin = sinConectar("tarde");
  const salidaAntesMin = sinConectar("salida_antes");
  const huecosMin = sinConectar("hueco");
  const sinEntrarMin = sinConectar("sin_entrar");
  const sinConectarMin = tardeMin + salidaAntesMin + huecosMin + sinEntrarMin;
  const pausasAusenciaMin = suma((t) => t.tipo === "pausa" && t.categoria === "ausencia");

  const porMotivo = new Map<string, ResumenMotivo>();
  for (const t of tramos) {
    if (t.tipo !== "pausa" && t.tipo !== "arranque") continue;
    const motivo = t.tipo === "arranque" ? ETIQUETA_ARRANQUE : t.motivo;
    const r = porMotivo.get(motivo) ?? { motivo, categoria: t.tipo === "arranque" ? "arranque" : t.categoria, veces: 0, minutos: 0 };
    r.veces += 1;
    r.minutos += t.finMin - t.inicioMin;
    porMotivo.set(motivo, r);
  }

  const conectadaMin = minutosDe(conectada);
  const ultimaConexion = conectada[conectada.length - 1];
  const conectadaAhora = e.ahoraMin != null && ultimaConexion != null && ultimaConexion.finMin >= e.ahoraMin - EPS;
  const ausenciaCompleta = e.ausencias.find((a) => a.inicioMin == null) ?? null;
  const horarioMin = minutosDe(horario);

  return {
    tramos,
    entradaMin: conectada[0]?.inicioMin ?? null,
    salidaMin: ultimaConexion && !conectadaAhora ? ultimaConexion.finMin : null,
    conectadaAhora,
    horarioMin,
    conectadaMin,
    tardeMin,
    salidaAntesMin,
    huecosMin,
    sinEntrarMin,
    sinConectarMin,
    pausasAusenciaMin,
    pausasTrabajoMin: suma((t) => t.tipo === "pausa" && t.categoria === "trabajo"),
    arranqueMin: suma((t) => t.tipo === "arranque"),
    ausenciaApuntadaMin: suma((t) => t.tipo === "ausencia"),
    tiempoAusenteMin: sinConectarMin + pausasAusenciaMin,
    llegoTarde: tardeMin > 0,
    ausenciaCompleta,
    // Solo si ese día le tocaba trabajar: una VAC de lunes a domingo no la hace ausente el sábado
    ausenteTodoElDia: conectadaMin === 0 && horarioMin > 0 && (ausenciaCompleta != null || horarioPasado.length > 0),
    porMotivo: [...porMotivo.values()].sort((x, y) => y.minutos - x.minutos),
  };
}

export interface ResumenEquipo {
  conHorario: number;
  ausentesTodoElDia: number;
  /** De los ausentes todo el día, por tipo de ausencia apuntada («Sin apuntar» si no hay). */
  ausentesPorTipo: { tipo: string; personas: number }[];
  llegadasTarde: number;
  tardeMin: number;
  sinConectarMin: number;
  pausasAusenciaMin: number;
  pausasTrabajoMin: number;
}

export const SIN_APUNTAR = "Sin apuntar";

/** Las cajas de arriba del panel. */
export function resumenEquipo(dias: readonly DiaPersona[]): ResumenEquipo {
  const ausentes = dias.filter((d) => d.ausenteTodoElDia);
  const porTipo = new Map<string, number>();
  for (const d of ausentes) {
    const tipo = d.ausenciaCompleta?.tipoCodigo ?? SIN_APUNTAR;
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }
  const suma = (f: (d: DiaPersona) => number) => dias.reduce((s, d) => s + f(d), 0);
  return {
    conHorario: dias.filter((d) => d.horarioMin > 0).length,
    ausentesTodoElDia: ausentes.length,
    ausentesPorTipo: [...porTipo.entries()].map(([tipo, personas]) => ({ tipo, personas })).sort((a, b) => b.personas - a.personas),
    llegadasTarde: dias.filter((d) => d.llegoTarde).length,
    tardeMin: suma((d) => d.tardeMin),
    sinConectarMin: suma((d) => d.sinConectarMin),
    pausasAusenciaMin: suma((d) => d.pausasAusenciaMin),
    pausasTrabajoMin: suma((d) => d.pausasTrabajoMin),
  };
}

/** Minutos del día → «09:05». */
export function hora(min: number): string {
  const m = Math.floor(min + EPS);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
