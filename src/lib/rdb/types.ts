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
  abandonadas: number;
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
  abandonadas: number;
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
  estado: string; // Logado | Ready | NotReady (desde rdb_enums)
  motivo: string | null; // razón de NotReady si aplica
  desdeMin: number; // minutos desde que entró en ese estado
}

/** KPIs intradía de una campaña (vista supervisión). */
export interface KpiCampaniaHoy {
  campania: string;
  tipo: string;
  recibidas: number;
  atendidas: number;
  abandonadas: number;
  ahtSeg: number | null;
  acwSeg: number | null;
  colaMediaSeg: number | null;
  slaPct: number | null; // % atendidas con cola <= umbral
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
  horasLogadas: number;
  horasReady: number;
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
  horasLogadas: number;
  horasReady: number;
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

/** Estado de salud de la conexión a RDBv2. */
export interface SaludRdb {
  conectado: boolean;
  mock: boolean;
  latenciaMs: number | null;
  ultimaInteraccion: string | null; // MAX(itr_thread.start_time) → frescura replicación
  ultimaFlat: string | null; // MAX(flat_agent_login.StartMoment) → frescura flats
  error: string | null;
}
