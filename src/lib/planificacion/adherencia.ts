// ============================================================
// Adherencia: el plan frente a lo que pasó. PURO (misma regla de ESLint que
// el motor): se le da lo planificado y el tiempo LOGADO de cada usuario
// (user_log, la misma fuente que factura operaciones) y lo compara minuto a
// minuto, agente y día a agente y día.
//
// Dentro de lo planificado, cada minuto es:
//   - correcto:    logado con un usuario del cliente que tocaba, o de uno que
//                  «cuenta como» él (GH_nnnn_BD en un bloque de GH: BD cubre
//                  GH), o, en un bloque de un cliente a demanda, con el
//                  cliente base (en Ávolo se espera en GH y se entra con Av_
//                  cuando llega la llamada: 81 h de 133 en septiembre);
//   - a demanda:   logado con un usuario de un cliente «a demanda» (Ávolo),
//                  que se atiende cuando entra una llamada: no es un desvío;
//   - otro:        logado, pero con el usuario de otro cliente;
//   - sin conectar.
// Adherencia POR TURNO = (correcto + a demanda + otro) ÷ planificado: estaba
// trabajando cuando le tocaba. POR CLIENTE = (correcto + a demanda) ÷
// planificado: además, donde le tocaba. Lo logado fuera de lo planificado se
// cuenta aparte (horas extra o cambios sin reflejar en el plan).
// ============================================================

export interface BloquePlanAdh {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  clienteCodigo: string;
}

/** Un trozo de tiempo logado con un usuario (minutos desde las 00:00, pueden tener decimales). */
export interface TramoLogado {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  /** Cliente del usuario (null = prefijo sin cliente de planificación). */
  clienteCodigo: string | null;
}

export interface FilaAdherencia {
  agenteNumero: string;
  fecha: string;
  /** Cliente PLANIFICADO. */
  clienteCodigo: string;
  planificadoMin: number;
  correctoMin: number;
  aDemandaMin: number;
  otroMin: number;
  sinConectarMin: number;
}

export interface DiaAdherencia {
  agenteNumero: string;
  fecha: string;
  planificadoMin: number;
  /** Logado con cualquier usuario (unión: dos usuarios a la vez cuentan una vez). */
  logadoMin: number;
  /** Logado fuera de lo planificado. */
  fueraPlanMin: number;
}

const clave = (a: string, f: string) => `${a}|${f}`;

/** Lo que hace falta saber de los clientes para clasificar los minutos. */
export interface ReglasAdherencia {
  clienteBase: string;
  /** Códigos de los clientes «a demanda» (Ávolo). */
  aDemanda: ReadonlySet<string>;
  /** cliente → cliente en cuya cobertura cuenta (BD y LX → GH). */
  cuentaComo: Readonly<Record<string, string | null>>;
}

export const SIN_REGLAS: ReglasAdherencia = { clienteBase: "", aDemanda: new Set(), cuentaComo: {} };

/** ¿Logado con `logado` cumple un bloque de `planificado`? */
export function cubre(reglas: ReglasAdherencia, planificado: string, logado: string): boolean {
  if (logado === planificado || reglas.cuentaComo[logado] === planificado) return true;
  const base = reglas.clienteBase;
  return reglas.aDemanda.has(planificado) && base !== "" && (logado === base || reglas.cuentaComo[logado] === base);
}

/**
 * Compara el plan con lo logado. Devuelve una fila por agente, día y cliente
 * planificado y una por agente y día con lo logado y lo que cae fuera del
 * plan.
 */
export function calcularAdherencia(
  bloques: readonly BloquePlanAdh[],
  logado: readonly TramoLogado[],
  reglas: ReglasAdherencia,
): { filas: FilaAdherencia[]; dias: DiaAdherencia[] } {
  const planPor = new Map<string, BloquePlanAdh[]>();
  for (const b of bloques) planPor.set(clave(b.agenteNumero, b.fecha), [...(planPor.get(clave(b.agenteNumero, b.fecha)) ?? []), b]);
  const realPor = new Map<string, TramoLogado[]>();
  for (const t of logado) {
    if (t.finMin <= t.inicioMin) continue;
    realPor.set(clave(t.agenteNumero, t.fecha), [...(realPor.get(clave(t.agenteNumero, t.fecha)) ?? []), t]);
  }

  const filas = new Map<string, FilaAdherencia>();
  const dias: DiaAdherencia[] = [];
  for (const k of [...new Set([...planPor.keys(), ...realPor.keys()])].sort()) {
    const [agenteNumero, fecha] = k.split("|");
    const plan = planPor.get(k) ?? [];
    const real = realPor.get(k) ?? [];
    // Tramos elementales entre todos los puntos de corte del día
    const puntos = [...new Set([...plan, ...real].flatMap((x) => [x.inicioMin, x.finMin]))].sort((a, b) => a - b);
    const dia: DiaAdherencia = { agenteNumero, fecha, planificadoMin: 0, logadoMin: 0, fueraPlanMin: 0 };
    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i];
      const b = puntos[i + 1];
      const dur = b - a;
      const enPlan = plan.find((x) => x.inicioMin <= a && b <= x.finMin);
      const clientes = new Set(real.filter((x) => x.inicioMin <= a && b <= x.finMin).map((x) => x.clienteCodigo ?? "?"));
      const logadoAqui = clientes.size > 0;
      if (logadoAqui) dia.logadoMin += dur;
      if (!enPlan) {
        if (logadoAqui) dia.fueraPlanMin += dur;
        continue;
      }
      dia.planificadoMin += dur;
      const kf = `${k}|${enPlan.clienteCodigo}`;
      const fila = filas.get(kf) ?? {
        agenteNumero,
        fecha,
        clienteCodigo: enPlan.clienteCodigo,
        planificadoMin: 0,
        correctoMin: 0,
        aDemandaMin: 0,
        otroMin: 0,
        sinConectarMin: 0,
      };
      fila.planificadoMin += dur;
      if ([...clientes].some((c) => cubre(reglas, enPlan.clienteCodigo, c))) fila.correctoMin += dur;
      else if ([...clientes].some((c) => reglas.aDemanda.has(c))) fila.aDemandaMin += dur;
      else if (logadoAqui) fila.otroMin += dur;
      else fila.sinConectarMin += dur;
      filas.set(kf, fila);
    }
    dias.push(dia);
  }
  return {
    filas: [...filas.values()].sort(
      (x, y) => x.fecha.localeCompare(y.fecha) || x.agenteNumero.localeCompare(y.agenteNumero) || x.clienteCodigo.localeCompare(y.clienteCodigo),
    ),
    dias,
  };
}

export interface ResumenAdherencia {
  planificadoH: number;
  correctoH: number;
  aDemandaH: number;
  otroH: number;
  sinConectarH: number;
  /** null si no hay nada planificado. */
  porTurno: number | null;
  porCliente: number | null;
}

/** Suma filas de adherencia (en horas) y calcula los dos porcentajes (0..1). */
export function resumirAdherencia(filas: readonly FilaAdherencia[]): ResumenAdherencia {
  const s = { planificadoH: 0, correctoH: 0, aDemandaH: 0, otroH: 0, sinConectarH: 0 };
  for (const f of filas) {
    s.planificadoH += f.planificadoMin / 60;
    s.correctoH += f.correctoMin / 60;
    s.aDemandaH += f.aDemandaMin / 60;
    s.otroH += f.otroMin / 60;
    s.sinConectarH += f.sinConectarMin / 60;
  }
  return {
    ...s,
    porTurno: s.planificadoH > 0 ? (s.correctoH + s.aDemandaH + s.otroH) / s.planificadoH : null,
    porCliente: s.planificadoH > 0 ? (s.correctoH + s.aDemandaH) / s.planificadoH : null,
  };
}

/** Agrupa filas por una clave (agente, cliente, fecha...) y resume cada grupo. */
export function resumirPor<K extends string>(
  filas: readonly FilaAdherencia[],
  claveDe: (f: FilaAdherencia) => K,
): Map<K, ResumenAdherencia> {
  const grupos = new Map<K, FilaAdherencia[]>();
  for (const f of filas) grupos.set(claveDe(f), [...(grupos.get(claveDe(f)) ?? []), f]);
  return new Map([...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => [k, resumirAdherencia(g)]));
}
