// ============================================================
// Tipos de resultado de la capa RDBv2.
// Los comparten las queries reales (queries/*.ts) y el modo
// mock (mock.ts). Todas las duraciones YA están en segundos
// (la conversión desde décimas se hace en el SQL).
// ============================================================

/** Una fila por día con el volumen global de interacciones. */
export interface VolumenDia {
  fecha: string; // YYYY-MM-DD
  total: number;
  inbound: number;
  outbound: number;
  atendidas: number;
  abandonadas: number; // TODAS las abandonadas, cualquier origen
  /** Abandonadas de ENTRADA (origin = 1): la única base del % de abandono. */
  abandonadasInbound: number;
  ahtSeg: number | null;
  acwSeg: number | null;
  talkSeg: number | null;
}

/** Volumen agregado por campaña en un rango. */
export interface VolumenCampania {
  campania: string;
  tipo: string;
  total: number;
  inbound: number;
  outbound: number;
  atendidas: number;
  abandonadas: number; // TODAS las abandonadas, cualquier origen
  /**
   * Abandonadas de ENTRADA (origin = 1). El % de abandono es
   * abandonadasInbound / inbound, igual que en Supervisión. Dividir las
   * abandonadas de todos los orígenes entre las entrantes lo inflaba
   * (medido 22/09/2026: 14,89 % en vez de 8,51 %).
   */
  abandonadasInbound: number;
  ahtSeg: number | null;
}

/** Campaña del maestro ph_campaign. */
export interface CampaniaInfo {
  codigo: number;
  shortname: string;
  descripcion: string | null;
  tipo: string;
}

/** Último estado conocido de un agente en una campaña (hoy). */
export interface AgenteEstado {
  agente: string;
  nombre: string;
  campania: string;
  estado: string; // Ready | NotReady | Logado (sesión sin estado) | Deslogado
  motivo: string | null; // razón de NotReady si aplica
  desdeMin: number; // minutos en ese estado (Deslogado: desde su última actividad)
}

/** KPIs intradía de una campaña (vista supervisión). */
export interface KpiCampaniaHoy {
  campania: string;
  tipo: string;
  recibidas: number; // entrantes (origin = 1)
  atendidas: number; // TODAS las atendidas, cualquier origen
  abandonadas: number; // TODAS las abandonadas, cualquier origen
  /**
   * Atendidas y abandonadas SOLO de entrada (origin = 1). Son el único
   * denominador válido para SLA y % de abandono: las salientes no hacen cola
   * y, mezcladas, disparaban el SLA (medido: 4.894 atendidas totales frente a
   * 572 entrantes en un día real, ×8,6 de denominador).
   */
  atendidasInbound: number;
  abandonadasInbound: number;
  exitos: number; // sesiones de script con business_status = 3 (Success)
  ahtSeg: number | null;
  acwSeg: number | null;
  /**
   * Cola media de las entrantes ATENDIDAS: lo que esperaron hasta que las
   * cogió un agente; las que no esperaron cuentan 0 s (igual que en el SLA).
   * Antes promediaba todas las entrantes, abandonadas incluidas: 17,93 s en
   * vez de 12,06 s el 22/09/2026.
   */
  colaMediaSeg: number | null;
  /** Espera media de las entrantes ABANDONADAS antes de colgar (aparte). */
  esperaAbandonadasSeg: number | null;
  /**
   * Sumas SIN redondear de esas esperas, en segundos. La media global de
   * varias campañas es suma / atendidasInbound (o abandonadasInbound):
   * nunca promediar las medias ya redondeadas de cada campaña.
   */
  colaAtendidasTotalSeg: number;
  esperaAbandonadasTotalSeg: number;
  slaPct: number | null; // % atendidas con cola <= umbral
}

/**
 * Métrica de campañas IVR. De las llamadas entrantes que pasan por un IVR
 * (distinct itr_global con origin=1):
 *  - atendidasAgente: acaban atendidas por un agente humano.
 *  - noAtendidas: el resto (llamadas − atendidasAgente).
 *  - noAtendidasEnHorario: de las no atendidas, las que entraron mientras HABÍA
 *    al menos un agente logado en las campañas del servicio (horario de
 *    producción dinámico). Las de fuera de horario es normal que no se atiendan.
 */
export interface MetricasIvr {
  llamadas: number;
  atendidasAgente: number;
  noAtendidas: number;
  noAtendidasEnHorario: number;
}

/** Productividad de un agente en el día actual. */
export interface AgenteHoy {
  agente: string;
  nombre: string;
  atendidas: number;
  talkMedioSeg: number | null;
  acwMedioSeg: number | null;
  ahtMedioSeg: number | null;
  productivoSeg: number;
}

/** Unidades facturables de una campaña en un rango. */
export interface UnidadesCampania {
  campania: string;
  /**
   * Horas de gestión real (suma de duration de las atendidas). Es la ÚNICA
   * hora atribuible a una campaña. Las logadas/ready NO están aquí a
   * propósito: ag_in_cp_log las graba una vez por campaña abierta y sumarlas
   * multiplica el tiempo (medido en un día real: 2.602 h sumadas por campaña
   * frente a 189 h reales, ×13,8). La cifra global vive en horasAgenteReales().
   */
  horasProductivas: number;
  interacciones: number;
  atendidas: number;
  exitos: number;
  leadsFinalizados: number;
}

/** Métricas de un día y campaña (para agregados nocturnos). */
export interface MetricaDiariaCampania {
  fecha: string;
  campania: string;
  tipo: string | null;
  interacciones: number;
  inbound: number;
  outbound: number;
  atendidas: number;
  abandonadas: number;
  ahtSeg: number | null;
  acwSeg: number | null;
  talkSeg: number | null;
  /** Horas de gestión real del día (ver nota en UnidadesCampania). */
  horasProductivas: number;
  exitos: number;
  leadsFinalizados: number;
}

/** Penetración de listas outbound (query 7.7 del doc de referencia). */
export interface PenetracionLista {
  campania: string;
  lista: string;
  totalContactos: number;
  done: number;
  exitos: number;
  sinExito: number;
  sinContacto: number;
  intentosAutoMedio: number | null;
}

/** Tiempo en No Disponible por agente y razón. */
export interface RazonNotReady {
  agente: string;
  razon: string;
  veces: number;
  segundosTotal: number;
}

/**
 * Horas reales de agente (unión de intervalos, GLOBAL). No es atribuible a
 * campaña: ver horasAgenteReales en queries/agentes.ts.
 */
export interface HorasAgenteReales {
  horasLogadas: number;
  horasReady: number;
}

/** Servicio (cliente) con sus campañas reales asociadas. */
export interface ServicioConCampanias {
  servicio: string;
  campanias: string[];
}

/** Estado de salud de la conexión a RDBv2. */
export interface SaludRdb {
  conectado: boolean;
  mock: boolean;
  latenciaMs: number | null;
  ultimaInteraccion: string | null; // MAX(itr_thread.start_time) → frescura replicación
  ultimaFlat: string | null; // MAX(flat_agent_login.StartMoment) → frescura flats
  error: string | null;
}
