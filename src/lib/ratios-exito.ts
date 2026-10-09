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
// - Éxitos por hora LOGADA solo por agente (user_log de su usuario, regla
//   16): por campaña no existe (regla 11). Por campaña, por hora PRODUCTIVA.
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
  exitosHoraProductiva: number | null;
  /** Gestión de las atendidas ÷ éxitos, en segundos. */
  segPorExito: number | null;
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
  exitosHoraLogada: number | null;
  exitosEsperados: number;
  indice: number | null;
  campanias: RatiosAgenteCampania[];
}

export interface ResultadoRatios {
  agentes: RatiosAgente[];
  campanias: RatiosCampania[];
  total: RatiosBasicos & { horasLogadas: number; exitosHoraLogada: number | null };
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
  productivoSeg: number;
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
    productivoSeg: 0,
    exitosCalificables: 0,
    sinExitoCalificables: 0,
    hayCalificables: false,
  };
}

function acumular(a: Acumulado, f: FilaBaseRatios, marcaSinExito: boolean): void {
  a.contactos += f.sesiones;
  a.atendidas += f.atendidas;
  a.exitos += f.exitos;
  a.productivoSeg += f.productivoSeg;
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
    exitosHoraProductiva: r2(cociente(a.exitos, a.productivoSeg / 3600)),
    segPorExito: r2(cociente(a.productivoSeg, a.exitos)),
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
      exitosHoraLogada: r2(cociente(total.exitos, horasTotal)),
    },
  };
}
