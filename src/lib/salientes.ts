import { esUsuarioDelCliente } from "@/lib/ratios-exito";
import type { BaseRatiosExito, BaseSalientes } from "@/lib/rdb/types";

// ============================================================
// KPIs de salida (pedidos por Christian el 22/10/2026), por agente, por
// campaña y global. Lógica PURA (sin I/O), con tests. Recibe la base de
// queries/salientes.ts y la de los ratios de éxito (horas logadas y
// tiempo con script abierto de cada agente y campaña).
//
// - Ocupación = horas con script abierto ÷ horas logadas. Por campaña no
//   hay horas logadas (regla 11): se da su peso en el tiempo con script.
// - Contactabilidad = intentos contestados ÷ intentos (con número, sin
//   preparaciones ni los estados que no cuentan), también por hora del día.
// - Contactos alcanzados = llamados en el período con alguna contestada;
//   intentos hasta hablar = media de intentos (90 días atrás) hasta la
//   primera conversación de los que la tuvieron en el período.
// - Rellamadas: agendadas por un agente, hechas (con una llamada después),
//   vencidas ahora (foto del momento) y retraso medio APROXIMADO (Altitude
//   solo guarda el último «Momento de la rellamada» de cada contacto).
// - Conversión por intento: en qué intento llega cada éxito.
// - Tiempo esperando llamada: en Ready sin ninguna ficha abierta (por
//   campaña no existe, como las horas logadas).
// - Preparación: el tiempo de las preparaciones de llamada manual (regla 6).
// ============================================================

/** Intentos mínimos de una franja para proponerla como «mejor franja». */
export const MIN_INTENTOS_FRANJA = 20;

export interface FranjaHora {
  hora: number;
  intentos: number;
  contestados: number;
  pct: number | null;
}

export interface FilaSalientes {
  /** usr_name del agente, nombre de la campaña o «total». */
  clave: string;
  nombre: string;
  horasLogadas: number | null;
  horasGuion: number;
  ocupacionPct: number | null;
  /** Solo campañas: su parte del tiempo con script abierto del alcance. */
  pesoGuionPct: number | null;
  horasReady: number | null;
  horasEsperando: number | null;
  /** Esperando ÷ horas logadas. */
  esperandoPct: number | null;
  intentos: number;
  contestados: number;
  contactabilidadPct: number | null;
  franjas: FranjaHora[];
  mejorFranja: FranjaHora | null;
  contactos: number;
  alcanzados: number;
  alcanzadosPct: number | null;
  intentosHastaHablar: number | null;
  agendadas: number;
  hechas: number;
  hechasPct: number | null;
  vencidas: number;
  retrasoMedioMin: number | null;
  /** Éxitos por intento: índice 0 = sin llamada de salida, 1-4, 5 = cinco o más. */
  exitosPorIntento: number[];
  /** % de los éxitos con llamada que llegan en el primer intento. */
  exitoPrimerIntentoPct: number | null;
  intentosMediosHastaExito: number | null;
  preparaciones: number;
  preparacionSeg: number;
  preparacionMediaSeg: number | null;
}

export interface ResultadoSalientes {
  total: FilaSalientes;
  campanias: FilaSalientes[];
  agentes: FilaSalientes[];
}

/** Redondeo del valor FINAL (2 decimales). */
function r2(v: number | null): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}

function cociente(n: number, d: number, factor = 1): number | null {
  return d > 0 ? (n / d) * factor : null;
}

interface Acum {
  nombre: string;
  horasLogadas: number | null;
  guionSeg: number;
  ready: number | null;
  esperando: number | null;
  franjas: Map<number, { intentos: number; contestados: number }>;
  contactos: number;
  alcanzados: number;
  primeras: number;
  intentosHastaHablar: number;
  agendadas: number;
  hechas: number;
  vencidas: number;
  conRetraso: number;
  retrasoMin: number;
  exitosPorIntento: number[];
  intentosExitos: number;
  preparaciones: number;
  preparacionSeg: number;
}

function vacio(nombre: string): Acum {
  return {
    nombre,
    horasLogadas: null,
    guionSeg: 0,
    ready: null,
    esperando: null,
    franjas: new Map(),
    contactos: 0,
    alcanzados: 0,
    primeras: 0,
    intentosHastaHablar: 0,
    agendadas: 0,
    hechas: 0,
    vencidas: 0,
    conRetraso: 0,
    retrasoMin: 0,
    exitosPorIntento: [0, 0, 0, 0, 0, 0],
    intentosExitos: 0,
    preparaciones: 0,
    preparacionSeg: 0,
  };
}

function cerrar(clave: string, a: Acum, guionTotalSeg: number | null): FilaSalientes {
  const franjas = [...a.franjas]
    .map(([hora, f]) => ({ hora, ...f, pct: r2(cociente(f.contestados, f.intentos, 100)) }))
    .filter((f) => f.intentos > 0)
    .sort((x, y) => x.hora - y.hora);
  const candidatas = franjas.filter((f) => f.intentos >= MIN_INTENTOS_FRANJA && f.pct != null);
  const mejorFranja = candidatas.reduce<FranjaHora | null>((m, f) => (!m || f.pct! > m.pct! ? f : m), null);
  const intentos = franjas.reduce((s, f) => s + f.intentos, 0);
  const contestados = franjas.reduce((s, f) => s + f.contestados, 0);
  const conLlamada = a.exitosPorIntento.slice(1).reduce((s, n) => s + n, 0);
  const horasGuion = a.guionSeg / 3600;
  return {
    clave,
    nombre: a.nombre,
    horasLogadas: r2(a.horasLogadas),
    horasGuion: r2(horasGuion) ?? 0,
    ocupacionPct: a.horasLogadas != null ? r2(cociente(horasGuion, a.horasLogadas, 100)) : null,
    pesoGuionPct: guionTotalSeg != null ? r2(cociente(a.guionSeg, guionTotalSeg, 100)) : null,
    horasReady: r2(a.ready),
    horasEsperando: r2(a.esperando),
    esperandoPct: a.esperando != null && a.horasLogadas != null ? r2(cociente(a.esperando, a.horasLogadas, 100)) : null,
    intentos,
    contestados,
    contactabilidadPct: r2(cociente(contestados, intentos, 100)),
    franjas,
    mejorFranja,
    contactos: a.contactos,
    alcanzados: a.alcanzados,
    alcanzadosPct: r2(cociente(a.alcanzados, a.contactos, 100)),
    intentosHastaHablar: r2(cociente(a.intentosHastaHablar, a.primeras)),
    agendadas: a.agendadas,
    hechas: a.hechas,
    hechasPct: r2(cociente(a.hechas, a.agendadas, 100)),
    vencidas: a.vencidas,
    retrasoMedioMin: r2(cociente(a.retrasoMin, a.conRetraso)),
    exitosPorIntento: a.exitosPorIntento,
    exitoPrimerIntentoPct: r2(cociente(a.exitosPorIntento[1], conLlamada, 100)),
    intentosMediosHastaExito: r2(cociente(a.intentosExitos, conLlamada)),
    preparaciones: a.preparaciones,
    preparacionSeg: r2(a.preparacionSeg) ?? 0,
    preparacionMediaSeg: r2(cociente(a.preparacionSeg, a.preparaciones)),
  };
}

export function calcularSalientes(
  base: BaseSalientes,
  ratios: BaseRatiosExito,
  /** Prefijo de los usuarios del cliente: solo sus horas van al total. */
  prefijo: string | null = null,
): ResultadoSalientes {
  const agentes = new Map<string, Acum>();
  const campanias = new Map<string, Acum>();
  const total = vacio("Total");
  const ag = (clave: string, nombre?: string | null) => {
    let a = agentes.get(clave);
    if (!a) {
      a = vacio(nombre || clave);
      agentes.set(clave, a);
    } else if (nombre && a.nombre === clave) a.nombre = nombre;
    return a;
  };
  const camp = (clave: string) => {
    let c = campanias.get(clave);
    if (!c) {
      c = vacio(clave);
      campanias.set(clave, c);
    }
    return c;
  };

  // Horas logadas y script abierto (base de los ratios de éxito)
  const horas = new Map(ratios.horasLogadas.map((h) => [h.agente, h.horas]));
  for (const f of ratios.filas) {
    const a = ag(f.agente, f.nombre);
    a.guionSeg += f.guionSeg;
    camp(f.campania).guionSeg += f.guionSeg;
    total.guionSeg += f.guionSeg;
  }
  for (const [clave, a] of agentes) a.horasLogadas = horas.get(clave) ?? null;
  const conHoras = [...agentes].filter(([c, a]) => a.horasLogadas != null && esUsuarioDelCliente(c, prefijo)).map(([, a]) => a);
  total.horasLogadas = conHoras.length > 0 ? conHoras.reduce((s, a) => s + a.horasLogadas!, 0) : null;

  // Franjas, intentos y preparaciones
  const sumarFranja = (a: Acum, hora: number, intentos: number, contestados: number) => {
    const f = a.franjas.get(hora) ?? { intentos: 0, contestados: 0 };
    f.intentos += intentos;
    f.contestados += contestados;
    a.franjas.set(hora, f);
  };
  for (const f of base.franjas) {
    const destinos = [camp(f.campania), total, ...(f.agente ? [ag(f.agente, f.nombre)] : [])];
    for (const a of destinos) {
      sumarFranja(a, f.hora, f.intentos, f.contestados);
      a.preparaciones += f.preparaciones;
      a.preparacionSeg += f.preparacionSeg;
    }
  }

  // Contactos alcanzados (cada nivel viene ya calculado: no son sumables)
  for (const f of base.alcance) {
    const a =
      f.nivel === "total" ? total : f.nivel === "campania" ? (f.campania ? camp(f.campania) : null) : f.agente ? ag(f.agente, f.nombre) : null;
    if (!a) continue;
    a.contactos += f.contactos;
    a.alcanzados += f.alcanzados;
    a.primeras += f.primeras;
    a.intentosHastaHablar += f.intentosHastaHablar;
  }

  // Éxitos por intento
  for (const f of base.intentos) {
    const i = Math.max(0, Math.min(5, f.intento));
    for (const a of [ag(f.agente, f.nombre), camp(f.campania), total]) {
      a.exitosPorIntento[i] += f.exitos;
      if (i > 0) a.intentosExitos += f.intentosTotales;
    }
  }

  // Rellamadas
  for (const f of base.rellamadas) {
    const destinos = [camp(f.campania), total, ...(f.agente ? [ag(f.agente, f.nombre)] : [])];
    for (const a of destinos) {
      a.agendadas += f.agendadas;
      a.hechas += f.hechas;
      a.vencidas += f.vencidas;
      a.conRetraso += f.conRetraso;
      a.retrasoMin += f.retrasoMin;
    }
  }

  // Ready y esperando (por agente y global; por campaña no existe)
  for (const f of base.ready) {
    const a = ag(f.agente);
    a.ready = (a.ready ?? 0) + f.horas;
    a.esperando = (a.esperando ?? 0) + f.esperando;
    total.ready = (total.ready ?? 0) + f.horas;
    total.esperando = (total.esperando ?? 0) + f.esperando;
  }

  const porIntentos = (x: FilaSalientes, y: FilaSalientes) => y.intentos - x.intentos || x.nombre.localeCompare(y.nombre);
  return {
    total: cerrar("total", total, null),
    campanias: [...campanias].map(([c, a]) => cerrar(c, a, total.guionSeg)).sort(porIntentos),
    agentes: [...agentes].map(([c, a]) => cerrar(c, a, null)).sort(porIntentos),
  };
}
