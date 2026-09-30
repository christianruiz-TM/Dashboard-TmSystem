import { generarFranjas, horasTexto, minutosFuera, rangoCorto, solapan } from "./franjas";
import type { Aviso, BloqueBasico, EntradaMotor, MinimosDia, Tramo } from "./tipos";

// ============================================================
// Validaciones del plan. Las MISMAS en el motor, en el tablero (navegador)
// y en las Server Actions (que vuelven a validar al guardar).
//
//   Duras (no se puede soltar ni guardar ni publicar):
//     solapado · sin_usuario · sobre_ausencia · fuera_horario_servicio (entrantes)
//   Blandas (se puede publicar aceptándolas con un motivo):
//     franja_bajo_minimo · fuera_turno · trabajo_festivo ·
//     semana_sobre_contrato · horas_seguidas · fuera_horario_servicio (salientes)
// ============================================================

export interface ClienteValidacion {
  codigo: string;
  cuentaComo: string | null;
  /** Entrante: sus llamadas no esperan (modo erlang / a_demanda, o con Erlang). */
  entrante: boolean;
  maxHorasSeguidas: number | null;
  horario: Record<string, Tramo[]> | null;
}

export interface AgenteValidacion {
  numero: string;
  contratoSemanalH: number | null;
  habilidades: readonly string[];
  turnos: Record<string, Tramo[]>;
  ausencias: readonly { fecha: string; inicioMin: number; finMin: number; tipo: string }[];
}

export interface ContextoValidacion {
  pasoMin: number;
  franjas: number[];
  clienteBase: string;
  clientes: Record<string, ClienteValidacion>;
  agentes: Record<string, AgenteValidacion>;
  /** Festivos del calendario del equipo. */
  festivos: ReadonlySet<string>;
  /** fecha → lunes de su semana. */
  semanaDe: Record<string, string>;
  /** Mínimos del cliente base por fecha (índice de franja). */
  minimos: Record<string, number[]>;
}

/** Contexto de validación a partir de la entrada del motor y sus mínimos. */
export function construirContexto(entrada: EntradaMotor, minimos: readonly MinimosDia[]): ContextoValidacion {
  const clientes: Record<string, ClienteValidacion> = {};
  for (const c of entrada.clientes) {
    clientes[c.codigo] = {
      codigo: c.codigo,
      cuentaComo: c.cuentaComo,
      entrante: c.modo === "erlang" || c.modo === "a_demanda" || c.parametros.erlang != null,
      maxHorasSeguidas: c.parametros.maxHorasSeguidas,
      horario: c.horario,
    };
  }
  const agentes: Record<string, AgenteValidacion> = {};
  for (const a of entrada.agentes) {
    agentes[a.numero] = {
      numero: a.numero,
      contratoSemanalH: a.contratoSemanalH,
      habilidades: a.habilidades,
      turnos: a.turnos,
      ausencias: a.ausencias,
    };
  }
  const minimosBase: Record<string, number[]> = {};
  for (const m of minimos) if (m.cliente === entrada.clienteBase) minimosBase[m.fecha] = m.porFranja;
  return {
    pasoMin: entrada.pasoMin,
    franjas: generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, entrada.pasoMin),
    clienteBase: entrada.clienteBase,
    clientes,
    agentes,
    festivos: new Set(
      entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario)).map((d) => d.fecha),
    ),
    semanaDe: Object.fromEntries(entrada.dias.map((d) => [d.fecha, d.lunes])),
    minimos: minimosBase,
  };
}

/** ¿El cliente cuenta en la cobertura de `base` (él mismo o «cuenta como»)? */
export function cuentaEnBase(ctx: Pick<ContextoValidacion, "clientes">, cliente: string, base: string): boolean {
  return cliente === base || ctx.clientes[cliente]?.cuentaComo === base;
}

/** Cobertura del cliente base por fecha y franja (agentes en él o en los que cuentan como él). */
export function coberturaBase(bloques: readonly BloqueBasico[], ctx: ContextoValidacion): Record<string, number[]> {
  const cobertura: Record<string, number[]> = {};
  for (const b of bloques) {
    if (!cuentaEnBase(ctx, b.clienteCodigo, ctx.clienteBase)) continue;
    const fila = (cobertura[b.fecha] ??= new Array(ctx.franjas.length).fill(0));
    ctx.franjas.forEach((f, i) => {
      if (b.inicioMin <= f && f + ctx.pasoMin <= b.finMin) fila[i]++;
    });
  }
  return cobertura;
}

function textoBloque(b: BloqueBasico): string {
  return `${b.agenteNumero} ${b.fecha} ${b.clienteCodigo} ${rangoCorto(b.inicioMin, b.finMin)}`;
}

/** Valida un plan completo. Devuelve las incidencias ordenadas (duras primero). */
export function validarPlan(bloques: readonly BloqueBasico[], ctx: ContextoValidacion): Aviso[] {
  const avisos: Aviso[] = [];
  const porAgenteDia = new Map<string, BloqueBasico[]>();
  for (const b of bloques) {
    const clave = `${b.agenteNumero}|${b.fecha}`;
    const lista = porAgenteDia.get(clave) ?? [];
    lista.push(b);
    porAgenteDia.set(clave, lista);
  }

  for (const [, lista] of [...porAgenteDia.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lista.sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
    const agente = ctx.agentes[lista[0].agenteNumero];

    // Solapes (dura): dos bloques del mismo agente a la vez
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].inicioMin < lista[i - 1].finMin) {
        avisos.push({
          codigo: "solapado",
          gravedad: "dura",
          mensaje: `Bloques solapados: ${textoBloque(lista[i - 1])} y ${rangoCorto(lista[i].inicioMin, lista[i].finMin)}`,
          fecha: lista[i].fecha,
          agente: lista[i].agenteNumero,
          inicioMin: lista[i].inicioMin,
          finMin: Math.min(lista[i].finMin, lista[i - 1].finMin),
        });
      }
    }

    for (const b of lista) {
      const cliente = ctx.clientes[b.clienteCodigo];
      const base = { fecha: b.fecha, agente: b.agenteNumero, cliente: b.clienteCodigo, inicioMin: b.inicioMin, finMin: b.finMin };

      if (!agente || !agente.habilidades.includes(b.clienteCodigo)) {
        avisos.push({
          ...base,
          codigo: "sin_usuario",
          gravedad: "dura",
          mensaje: `${textoBloque(b)}: el agente no tiene usuario de ${b.clienteCodigo}, no podría logarse`,
        });
      }

      const ausencia = agente?.ausencias.find((a) => a.fecha === b.fecha && solapan(a, b));
      if (ausencia) {
        avisos.push({
          ...base,
          codigo: "sobre_ausencia",
          gravedad: "dura",
          mensaje: `${textoBloque(b)}: coincide con una ausencia (${ausencia.tipo})`,
        });
      }

      if (cliente?.horario) {
        const tramos = cliente.horario[b.fecha] ?? [];
        if (minutosFuera(b.inicioMin, b.finMin, tramos) > 0) {
          avisos.push({
            ...base,
            codigo: "fuera_horario_servicio",
            gravedad: cliente.entrante ? "dura" : "blanda",
            mensaje: cliente.entrante
              ? `${textoBloque(b)}: fuera del horario del servicio, las llamadas no llegan`
              : `${textoBloque(b)}: fuera del horario del servicio`,
          });
        }
      }

      if (agente) {
        const fuera = minutosFuera(b.inicioMin, b.finMin, agente.turnos[b.fecha] ?? []);
        if (fuera > 0) {
          avisos.push({
            ...base,
            codigo: "fuera_turno",
            gravedad: "blanda",
            mensaje: `${textoBloque(b)}: ${horasTexto(fuera / 60)} fuera de su turno (horas extra o cambio puntual)`,
          });
        }
      }

      if (ctx.festivos.has(b.fecha)) {
        avisos.push({
          ...base,
          codigo: "trabajo_festivo",
          gravedad: "blanda",
          mensaje: `${textoBloque(b)}: trabajo en festivo, compensar con una libranza FEST`,
        });
      }
    }

    // Horas seguidas del mismo cliente (blanda), uniendo bloques contiguos
    let racha: { cliente: string; inicio: number; fin: number } | null = null;
    const cerrarRacha = () => {
      if (!racha) return;
      const max = ctx.clientes[racha.cliente]?.maxHorasSeguidas;
      if (max != null && (racha.fin - racha.inicio) / 60 > max) {
        avisos.push({
          codigo: "horas_seguidas",
          gravedad: "blanda",
          mensaje: `${lista[0].agenteNumero} ${lista[0].fecha}: ${horasTexto((racha.fin - racha.inicio) / 60)} seguidas de ${racha.cliente} (máximo ${max} h)`,
          fecha: lista[0].fecha,
          agente: lista[0].agenteNumero,
          cliente: racha.cliente,
          inicioMin: racha.inicio,
          finMin: racha.fin,
        });
      }
    };
    for (const b of lista) {
      if (racha && racha.cliente === b.clienteCodigo && racha.fin === b.inicioMin) racha.fin = b.finMin;
      else {
        cerrarRacha();
        racha = { cliente: b.clienteCodigo, inicio: b.inicioMin, fin: b.finMin };
      }
    }
    cerrarRacha();
  }

  // Semana por encima de max(contrato, horas del patrón) (blanda)
  const horasSemana = new Map<string, number>();
  for (const b of bloques) {
    const clave = `${b.agenteNumero}|${ctx.semanaDe[b.fecha] ?? b.fecha}`;
    horasSemana.set(clave, (horasSemana.get(clave) ?? 0) + (b.finMin - b.inicioMin) / 60);
  }
  for (const [clave, horas] of [...horasSemana.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [numero, lunes] = clave.split("|");
    const agente = ctx.agentes[numero];
    if (!agente) continue;
    let patron = 0;
    for (const [fecha, tramos] of Object.entries(agente.turnos)) {
      if (ctx.semanaDe[fecha] !== lunes) continue;
      for (const t of tramos) patron += (t.finMin - t.inicioMin) / 60;
    }
    const limite = Math.max(agente.contratoSemanalH ?? 0, patron);
    if (horas > limite + 1e-9) {
      avisos.push({
        codigo: "semana_sobre_contrato",
        gravedad: "blanda",
        mensaje: `${numero}, semana del ${lunes}: ${horasTexto(horas)} planificadas, por encima de ${horasTexto(limite)} (contrato o turno)`,
        agente: numero,
        fecha: lunes,
        datos: { horas, limite },
      });
    }
  }

  // Cliente base por debajo del mínimo (blanda: rojo en el mapa)
  const cobertura = coberturaBase(bloques, ctx);
  for (const fecha of Object.keys(ctx.minimos).sort()) {
    const minimos = ctx.minimos[fecha];
    ctx.franjas.forEach((f, i) => {
      const hay = cobertura[fecha]?.[i] ?? 0;
      if (minimos[i] > 0 && hay < minimos[i]) {
        avisos.push({
          codigo: "franja_bajo_minimo",
          gravedad: "blanda",
          mensaje: `${fecha} ${rangoCorto(f, f + ctx.pasoMin)}: ${hay} en ${ctx.clienteBase} para un mínimo de ${minimos[i]}`,
          fecha,
          cliente: ctx.clienteBase,
          inicioMin: f,
          finMin: f + ctx.pasoMin,
          datos: { hay, minimo: minimos[i] },
        });
      }
    });
  }

  const peso = { dura: 0, blanda: 1, info: 2 } as const;
  return avisos.sort(
    (a, b) =>
      peso[a.gravedad] - peso[b.gravedad] ||
      (a.fecha ?? "").localeCompare(b.fecha ?? "") ||
      (a.agente ?? "").localeCompare(b.agente ?? "") ||
      (a.inicioMin ?? 0) - (b.inicioMin ?? 0) ||
      a.codigo.localeCompare(b.codigo),
  );
}
