// ============================================================
// Alertas de planificación para Supervisión (cada minuto). PURO: recibe la
// foto de AHORA (lo planificado hoy, quién está logado y con qué usuario,
// las entrantes de los clientes a demanda y las horas de la semana) y
// devuelve qué avisar. Umbrales en los parámetros plan.*.
//
//   1. A demanda (Ávolo): entrantes sin atender después de la última atendida
//      y nadie logado con su usuario.
//   2. Cliente base (GH) por debajo del mínimo en la franja actual, contando
//      a los logados con GH o con los que cuentan como GH (BD, LX). Si la
//      franja sube el mínimo, se esperan los mismos N minutos que para
//      «sin conectar» (a las 09:01 aún se está entrando).
//   3. Agente planificado ahora sin conectar tras N minutos del inicio de su
//      bloque (o desde que se desconectó). Si son más de 3, una sola alerta
//      con la lista (un fallo general o un día sin servicio no debe llenar
//      la tarjeta).
//   4. Campaña saliente retrasada: horas reales de la semana por debajo del
//      X % de lo planificado hasta ahora.
// ============================================================

export type TipoAlerta = "a_demanda" | "bajo_minimo" | "sin_conectar" | "retraso";

export interface Alerta {
  tipo: TipoAlerta;
  gravedad: "alta" | "media";
  mensaje: string;
  cliente?: string;
  agente?: string;
}

export interface ClienteAlertas {
  codigo: string;
  nombre: string;
  modo: string;
  cuentaComo: string | null;
  /** Prefijos de sus usuarios («Av_», «GH_»...), para el texto. */
  prefijos: string[];
}

export interface DatosAlertas {
  /** Minuto actual del día (desde las 00:00). */
  ahoraMin: number;
  pasoMin: number;
  inicioDiaMin: number;
  finDiaMin: number;
  clienteBase: string;
  clientes: readonly ClienteAlertas[];
  /** Bloques planificados HOY en la versión vigente. */
  bloquesHoy: readonly { agenteNumero: string; inicioMin: number; finMin: number; clienteCodigo: string }[];
  /** Mínimo del cliente base por franja de hoy (índice de franja), o null si no hay. */
  minimosBase: readonly number[] | null;
  /** Tiempo logado HOY por agente (minutos), con el cliente del usuario. */
  logadoHoy: readonly { agenteNumero: string; inicioMin: number; finMin: number; clienteCodigo: string | null }[];
  /** Entrantes de hoy de cada cliente a demanda (horas «HH:MM»). */
  aDemanda: readonly { cliente: string; noAtendidas: number; ultima: string | null; ultimaAtendida: string | null }[];
  /** Por cliente objetivo: horas planificadas y reales de la semana hasta ahora. */
  semana: readonly { cliente: string; planificadoH: number; realH: number }[];
  nombres: Readonly<Record<string, string>>;
  parametros: { minutosConexion: number; pctRetraso: number; horasMinRetraso: number };
}

/** Margen para dar por abierta una sesión: el tiempo logado de hoy llega con hasta 1 min de retraso. */
const MARGEN_ABIERTA_MIN = 2;
/** Por encima de tantos agentes sin conectar, una sola alerta con la lista. */
const MAX_SIN_CONECTAR_SUELTAS = 3;

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
const h2 = (h: number) => h.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function evaluarAlertas(d: DatosAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const cliente = new Map(d.clientes.map((c) => [c.codigo, c]));
  const nombre = (a: string) => `${a}${d.nombres[a] ? ` ${d.nombres[a]}` : ""}`;
  // Logados AHORA: sesión que llega hasta este minuto (con un pequeño margen)
  const ahora = d.logadoHoy.filter((t) => t.inicioMin <= d.ahoraMin && t.finMin >= d.ahoraMin - MARGEN_ABIERTA_MIN);
  const agentesAhora = new Set(ahora.map((t) => t.agenteNumero));

  // 1. Clientes a demanda con entrantes pendientes y nadie con su usuario
  for (const x of d.aDemanda) {
    const pendiente = x.noAtendidas > 0 && x.ultima != null && (x.ultimaAtendida == null || x.ultima > x.ultimaAtendida);
    if (!pendiente || ahora.some((t) => t.clienteCodigo === x.cliente)) continue;
    const c = cliente.get(x.cliente);
    const usuario = c?.prefijos.length ? c.prefijos.join(" o ") : "su usuario";
    alertas.push({
      tipo: "a_demanda",
      gravedad: "alta",
      cliente: x.cliente,
      mensaje: `${c?.nombre ?? x.cliente}: ${x.noAtendidas} ${x.noAtendidas === 1 ? "entrante sin atender" : "entrantes sin atender"} hoy (la última a las ${x.ultima}) y nadie conectado con ${usuario}: que alguien con ese usuario se conecte.`,
    });
  }

  // 2. Cliente base por debajo del mínimo en la franja actual
  const franja = Math.floor((d.ahoraMin - d.inicioDiaMin) / d.pasoMin);
  const minimo = d.ahoraMin >= d.inicioDiaMin && d.ahoraMin < d.finDiaMin ? (d.minimosBase?.[franja] ?? 0) : 0;
  const minimoAnterior = franja > 0 ? (d.minimosBase?.[franja - 1] ?? 0) : 0;
  const entrando = minimo > minimoAnterior && d.ahoraMin - (d.inicioDiaMin + franja * d.pasoMin) < d.parametros.minutosConexion;
  if (minimo > 0 && !entrando) {
    const cuenta = (c: string | null) => c === d.clienteBase || (c != null && cliente.get(c)?.cuentaComo === d.clienteBase);
    const hay = new Set(ahora.filter((t) => cuenta(t.clienteCodigo)).map((t) => t.agenteNumero)).size;
    if (hay < minimo) {
      const inicio = d.inicioDiaMin + franja * d.pasoMin;
      const grupo = [d.clienteBase, ...d.clientes.filter((c) => c.cuentaComo === d.clienteBase).map((c) => c.codigo)].join("/");
      alertas.push({
        tipo: "bajo_minimo",
        gravedad: "alta",
        cliente: d.clienteBase,
        mensaje: `${d.clienteBase} por debajo del mínimo: ${hay} ${hay === 1 ? "agente conectado" : "agentes conectados"} con ${grupo} para un mínimo de ${minimo} (franja ${hhmm(inicio)}-${hhmm(inicio + d.pasoMin)}).`,
      });
    }
  }

  // 3. Planificado ahora y sin conectar tras N minutos
  const sinConectar: Alerta[] = [];
  const resumenSin: string[] = [];
  const vistos = new Set<string>();
  for (const b of [...d.bloquesHoy].sort((x, y) => x.agenteNumero.localeCompare(y.agenteNumero) || x.inicioMin - y.inicioMin)) {
    if (!(b.inicioMin <= d.ahoraMin && d.ahoraMin < b.finMin) || agentesAhora.has(b.agenteNumero) || vistos.has(b.agenteNumero)) continue;
    // Desde cuándo falta: el inicio del bloque, o la última desconexión si fue después
    const ultimaSalida = Math.max(
      -1,
      ...d.logadoHoy.filter((t) => t.agenteNumero === b.agenteNumero && t.finMin <= d.ahoraMin).map((t) => t.finMin),
    );
    const desde = Math.max(b.inicioMin, ultimaSalida);
    if (d.ahoraMin - desde < d.parametros.minutosConexion) continue;
    vistos.add(b.agenteNumero);
    const c = cliente.get(b.clienteCodigo)?.nombre ?? b.clienteCodigo;
    resumenSin.push(`${nombre(b.agenteNumero)} (${b.clienteCodigo} desde las ${hhmm(ultimaSalida > b.inicioMin ? ultimaSalida : b.inicioMin)})`);
    sinConectar.push({
      tipo: "sin_conectar",
      gravedad: "media",
      agente: b.agenteNumero,
      cliente: b.clienteCodigo,
      mensaje:
        ultimaSalida > b.inicioMin
          ? `${nombre(b.agenteNumero)}: planificado en ${c} y desconectado desde las ${hhmm(ultimaSalida)}.`
          : `${nombre(b.agenteNumero)}: planificado en ${c} desde las ${hhmm(b.inicioMin)} y sin conectar.`,
    });
  }

  if (sinConectar.length > MAX_SIN_CONECTAR_SUELTAS) {
    alertas.push({
      tipo: "sin_conectar",
      gravedad: "media",
      mensaje: `${sinConectar.length} agentes planificados y sin conectar: ${resumenSin.join(", ")}.`,
    });
  } else {
    alertas.push(...sinConectar);
  }

  // 4. Campañas salientes retrasadas en la semana
  for (const s of d.semana) {
    if (s.planificadoH < d.parametros.horasMinRetraso) continue;
    const pct = (s.realH / s.planificadoH) * 100;
    if (pct >= d.parametros.pctRetraso) continue;
    alertas.push({
      tipo: "retraso",
      gravedad: "media",
      cliente: s.cliente,
      mensaje: `La campaña de ${s.cliente} va retrasada: ${h2(s.realH)} h trabajadas esta semana de ${h2(s.planificadoH)} h planificadas hasta ahora (${Math.round(pct)} %).`,
    });
  }

  const peso = { alta: 0, media: 1 } as const;
  return alertas.sort((a, b) => peso[a.gravedad] - peso[b.gravedad]);
}
