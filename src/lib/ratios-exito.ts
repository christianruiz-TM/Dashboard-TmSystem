import type { BaseRatiosExito, FilaBaseRatios } from "@/lib/rdb/types";

// ============================================================
// Ratios de rendimiento sobre los éxitos (decidido 09/10/2026 con
// Christian). Lógica PURA: sin I/O, la comparten la página, la API de
// polling y los tests. Recibe la base de queries/ratios-exito.ts.
//
// - Éxito = sesión de script con business_status 3 (Success), en todas
//   las campañas (los casos especiales se tratarán cuando salgan).
// - Conversión, con DOS denominadores:
//     · contactos = sesiones de script (contactos gestionados). Es la que
//       vale para todas las campañas: en Bolsas una sesión agrupa ~1,9
//       llamadas atendidas y dividir entre atendidas la dejaba a la mitad
//       (Bol_0365, septiembre 2026: 1,17 % frente a 2,03 %).
//     · atendidas. En campañas como las de GH (una llamada por sesión) es
//       el ratio de siempre y sale prácticamente igual.
// - Efectividad de cierre = éxitos ÷ (éxitos + sin éxito), SOLO con las
//   campañas que usan la calificación «sin éxito».
// - Índice frente a la campaña: éxitos reales ÷ éxitos esperados × 100,
//   donde esperados = Σ contactos del agente en cada campaña × conversión
//   (por contactos) de esa campaña. 100 = la media; corrige que unas
//   campañas conviertan mucho más que otras.
// - Llamadas y éxitos por hora (21/10/2026, decidido con Christian): en lo
//   AGRUPADO (cada agente y el total) por hora LOGADA (user_log de su
//   usuario, regla 16); en lo separado por campaña (la campaña y el detalle
//   del agente en cada una), por hora con el SCRIPT ABIERTO
//   (script_session.duration): por campaña no hay horas logadas (regla 11).
//   «Llamadas» = llamadas gestionadas (atendidas, termination_state = 1).
// - Duración media de los éxitos y de los NO éxitos = tiempo con el script
//   abierto de cada sesión, de media (familia «actividad»: sesiones fechadas
//   por la llamada, no contactos cerrados; esos van en Resultados).
// - Tiempos de los éxitos (19/10/2026, sustituyen al «tiempo por éxito» =
//   gestión de TODAS las atendidas ÷ éxitos): conversación de las llamadas
//   atendidas de cada éxito y tiempo con el script abierto, de media por
//   éxito. Cada media divide entre los éxitos que tienen ese tiempo.
// ============================================================

/** Por debajo de estos contactos el ratio se enseña atenuado («muestra pequeña»). */
export const MIN_CONTACTOS_RATIO = 30;

/** Índice a partir del cual se colorea (por encima y por debajo de 100). */
export const MARGEN_INDICE = 10;

export interface RatiosBasicos {
  /** Sesiones de script: contactos gestionados. */
  contactos: number;
  atendidas: number;
  exitos: number;
  convContactosPct: number | null;
  convAtendidasPct: number | null;
  /** null si ninguna de sus campañas usa la calificación «sin éxito». */
  efectividadPct: number | null;
  /** Horas con el script abierto (sesiones de menos de 2 h ya cerradas). */
  horasGuion: number;
  /** Llamadas gestionadas y éxitos por hora con el script abierto (por campaña). */
  llamadasHoraGuion: number | null;
  exitosHoraGuion: number | null;
  /** Conversación media de las llamadas atendidas de cada éxito, en segundos. */
  conversacionPorExitoSeg: number | null;
  /** Tiempo medio con el script abierto de cada éxito, en segundos. */
  gestionPorExitoSeg: number | null;
  /** Tiempo medio con el script abierto de cada sesión SIN éxito, en segundos. */
  gestionPorNoExitoSeg: number | null;
  muestraPequenia: boolean;
}

export interface RatiosCampania extends RatiosBasicos {
  campania: string;
  marcaSinExito: boolean;
}

export interface RatiosAgenteCampania extends RatiosBasicos {
  campania: string;
  marcaSinExito: boolean;
  /** Conversión del agente en la campaña ÷ la de la campaña × 100. */
  indice: number | null;
}

export interface RatiosAgente extends RatiosBasicos {
  agente: string;
  nombre: string;
  /** Tiempo logado del usuario (user_log); null si no tiene sesión en el rango. */
  horasLogadas: number | null;
  llamadasHoraLogada: number | null;
  exitosHoraLogada: number | null;
  exitosEsperados: number;
  indice: number | null;
  campanias: RatiosAgenteCampania[];
}

export interface ResultadoRatios {
  agentes: RatiosAgente[];
  campanias: RatiosCampania[];
  total: RatiosBasicos & {
    horasLogadas: number;
    llamadasHoraLogada: number | null;
    exitosHoraLogada: number | null;
  };
}

/** Redondeo del valor FINAL (2 decimales); los parciales se suman sin redondear. */
function r2(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 100) / 100;
}

function cociente(numerador: number, denominador: number, factor = 1): number | null {
  return denominador > 0 ? (numerador / denominador) * factor : null;
}

interface Acumulado {
  contactos: number;
  atendidas: number;
  exitos: number;
  guionSeg: number;
  exitosConConversacion: number;
  conversacionExitosSeg: number;
  exitosConGestion: number;
  gestionExitosSeg: number;
  noExitosConGestion: number;
  gestionNoExitosSeg: number;
  /** Solo de las filas de campañas que marcan «sin éxito». */
  exitosCalificables: number;
  sinExitoCalificables: number;
  hayCalificables: boolean;
}

function vacio(): Acumulado {
  return {
    contactos: 0,
    atendidas: 0,
    exitos: 0,
    guionSeg: 0,
    exitosConConversacion: 0,
    conversacionExitosSeg: 0,
    exitosConGestion: 0,
    gestionExitosSeg: 0,
    noExitosConGestion: 0,
    gestionNoExitosSeg: 0,
    exitosCalificables: 0,
    sinExitoCalificables: 0,
    hayCalificables: false,
  };
}

function acumular(a: Acumulado, f: FilaBaseRatios, marcaSinExito: boolean): void {
  a.contactos += f.sesiones;
  a.atendidas += f.atendidas;
  a.exitos += f.exitos;
  a.guionSeg += f.guionSeg;
  a.exitosConConversacion += f.exitosConConversacion;
  a.conversacionExitosSeg += f.conversacionExitosSeg;
  a.exitosConGestion += f.exitosConGestion;
  a.gestionExitosSeg += f.gestionExitosSeg;
  a.noExitosConGestion += f.noExitosConGestion;
  a.gestionNoExitosSeg += f.gestionNoExitosSeg;
  if (marcaSinExito) {
    a.hayCalificables = true;
    a.exitosCalificables += f.exitos;
    a.sinExitoCalificables += f.sinExito;
  }
}

function ratios(a: Acumulado): RatiosBasicos {
  return {
    contactos: a.contactos,
    atendidas: a.atendidas,
    exitos: a.exitos,
    convContactosPct: r2(cociente(a.exitos, a.contactos, 100)),
    convAtendidasPct: r2(cociente(a.exitos, a.atendidas, 100)),
    efectividadPct: a.hayCalificables
      ? r2(cociente(a.exitosCalificables, a.exitosCalificables + a.sinExitoCalificables, 100))
      : null,
    horasGuion: r2(a.guionSeg / 3600) ?? 0,
    llamadasHoraGuion: r2(cociente(a.atendidas, a.guionSeg / 3600)),
    exitosHoraGuion: r2(cociente(a.exitos, a.guionSeg / 3600)),
    conversacionPorExitoSeg: r2(cociente(a.conversacionExitosSeg, a.exitosConConversacion)),
    gestionPorExitoSeg: r2(cociente(a.gestionExitosSeg, a.exitosConGestion)),
    gestionPorNoExitoSeg: r2(cociente(a.gestionNoExitosSeg, a.noExitosConGestion)),
    muestraPequenia: a.contactos < MIN_CONTACTOS_RATIO,
  };
}

/** Orden por defecto de los agentes: muestra suficiente, índice, éxitos. */
function compararAgentes(a: RatiosAgente, b: RatiosAgente): number {
  if (a.muestraPequenia !== b.muestraPequenia) return a.muestraPequenia ? 1 : -1;
  const ia = a.indice ?? -1;
  const ib = b.indice ?? -1;
  if (ia !== ib) return ib - ia;
  if (a.exitos !== b.exitos) return b.exitos - a.exitos;
  return a.agente.localeCompare(b.agente);
}

export function calcularRatiosExito(base: BaseRatiosExito): ResultadoRatios {
  const marcan = new Set(base.campaniasConSinExito);
  const horas = new Map(base.horasLogadas.map((h) => [h.agente, h.horas]));

  // 1) Campañas: su conversión por contactos es la referencia del índice
  const porCampania = new Map<string, Acumulado>();
  const total = vacio();
  for (const f of base.filas) {
    const a = porCampania.get(f.campania) ?? vacio();
    acumular(a, f, marcan.has(f.campania));
    porCampania.set(f.campania, a);
    acumular(total, f, marcan.has(f.campania));
  }
  // Sin redondear: entra en los éxitos esperados de cada agente
  const convCampania = new Map(
    [...porCampania].map(([c, a]) => [c, cociente(a.exitos, a.contactos)]),
  );

  // 2) Agentes, con su desglose por campaña
  const filasPorAgente = new Map<string, FilaBaseRatios[]>();
  for (const f of base.filas) {
    const lista = filasPorAgente.get(f.agente) ?? [];
    lista.push(f);
    filasPorAgente.set(f.agente, lista);
  }

  const agentes: RatiosAgente[] = [...filasPorAgente].map(([agente, filas]) => {
    const acum = vacio();
    let esperados = 0;
    const campanias: RatiosAgenteCampania[] = filas.map((f) => {
      const marca = marcan.has(f.campania);
      const a = vacio();
      acumular(a, f, marca);
      acumular(acum, f, marca);
      const conv = convCampania.get(f.campania) ?? null;
      esperados += conv != null ? f.sesiones * conv : 0;
      const convAgente = cociente(f.exitos, f.sesiones);
      return {
        campania: f.campania,
        marcaSinExito: marca,
        ...ratios(a),
        indice: convAgente != null && conv ? r2((convAgente / conv) * 100) : null,
      };
    });
    campanias.sort((x, y) => y.contactos - x.contactos || x.campania.localeCompare(y.campania));
    const horasLogadas = horas.get(agente) ?? null;
    return {
      agente,
      nombre: filas[0].nombre,
      ...ratios(acum),
      horasLogadas: r2(horasLogadas),
      llamadasHoraLogada: horasLogadas != null ? r2(cociente(acum.atendidas, horasLogadas)) : null,
      exitosHoraLogada: horasLogadas != null ? r2(cociente(acum.exitos, horasLogadas)) : null,
      exitosEsperados: r2(esperados) ?? 0,
      indice: esperados > 0 ? r2((acum.exitos / esperados) * 100) : null,
      campanias,
    };
  });
  agentes.sort(compararAgentes);

  const campanias: RatiosCampania[] = [...porCampania]
    .map(([campania, a]) => ({ campania, marcaSinExito: marcan.has(campania), ...ratios(a) }))
    .sort((x, y) => y.exitos - x.exitos || y.contactos - x.contactos);

  // Horas logadas del total: las de los agentes que trabajaron en el alcance
  const horasTotal = [...filasPorAgente.keys()].reduce((s, ag) => s + (horas.get(ag) ?? 0), 0);
  return {
    agentes,
    campanias,
    total: {
      ...ratios(total),
      horasLogadas: r2(horasTotal) ?? 0,
      llamadasHoraLogada: r2(cociente(total.atendidas, horasTotal)),
      exitosHoraLogada: r2(cociente(total.exitos, horasTotal)),
    },
  };
}
