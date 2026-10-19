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
  slaPct: number | null; // % atendidas con cola <= umbral (redondeado, por campaña)
  /**
   * Entrantes atendidas con cola > umbral. El SLA GLOBAL de varias campañas es
   * (Σ atendidasInbound − Σ atendidasFueraSla) / Σ atendidasInbound: no se
   * promedian los slaPct, que ya vienen redondeados a 1 decimal.
   */
  atendidasFueraSla: number;
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

/**
 * Base de los ratios de éxito: una fila por usuario de agente y campaña.
 * Los éxitos salen SIEMPRE de script_session, nunca contando hilos: en
 * Bolsas, Socios y UGR una sesión agrupa 2-3 llamadas atendidas del mismo
 * agente al mismo contacto (otro teléfono, otro itr_global) y contar por
 * hilo duplicaba éxitos (septiembre 2026: 1.180 sesiones de éxito con 2+
 * hilos).
 */
export interface FilaBaseRatios {
  agente: string; // usr_name (un usuario por agente y cliente, regla 15)
  nombre: string;
  campania: string;
  /** Sesiones de script = contactos gestionados (cualquier calificación). */
  sesiones: number;
  exitos: number; // business_status = 3 (Success)
  sinExito: number; // business_status = 4 (Unsuccessful)
  /** Hilos atendidos (termination_state = 1) del agente en la campaña. */
  atendidas: number;
  /** Gestión de esas atendidas, en segundos (sin redondear). */
  productivoSeg: number;
}

/** Fila de ratios de un día (agg_daily_agent_campaign). `fecha` = '' si no es diaria. */
export interface FilaDiariaRatios extends FilaBaseRatios {
  fecha: string;
}

export interface BaseRatiosExito {
  filas: FilaBaseRatios[];
  /** Tiempo logado (user_log, unión de sesiones) por usuario, sin redondear. */
  horasLogadas: { agente: string; horas: number }[];
  /**
   * Campañas que usan la calificación «sin éxito» (estado 4). Bolsas y
   * Soc_Avisos/Soc_Incidencias no la usan: cierran como «no cualificada», y
   * la efectividad de cierre saldría siempre al 100 %.
   */
  campaniasConSinExito: string[];
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

/**
 * Tiempo logado (user_log: login → logout, haya o no campaña abierta) de un
 * usuario de agente de un cliente en un rango. Es la unidad `horas_logadas`.
 */
export interface HorasLogadasUsuario {
  /** Prefijo de cliente con el que casa el usuario (GH para GH_0851). */
  prefijo: string;
  usuario: string;
  /** Unión de sus sesiones, SIN redondear (se suma por cliente). */
  horas: number;
  /** Sesiones tras fundir las que se solapan. */
  sesiones: number;
}

/**
 * Base del reparto de las horas logadas de un cliente entre sus campañas
 * (método del Excel de operaciones, decidido 14/10/2026): el tiempo de agente
 * de cada usuario en cada campaña del rango. Horas SIN redondear.
 */
export interface BaseRepartoHorasLogadas {
  /**
   * Segmentos del agente fuera de cola (`state NOT IN (2,3)`) de sus hilos
   * entrantes y salientes, atendidos o no, con número marcado. `prefijo` son
   * los 4 primeros caracteres del número (account code en las salientes, hunt
   * group en las entrantes): el Excel de operaciones excluye algunos a mano.
   */
  tiempoAgente: { usuario: string; campania: string; prefijo: string; horas: number }[];
}

/**
 * Minutos de línea con el cliente (tarificación) de una campaña, por fuente
 * y prefijo del número marcado. Ver queries/tarificacion.ts.
 */
export interface MinutosLineaFila {
  campania: string;
  /** saliente = agente con origin 2; ivr = IVR tras un agente (encuesta NFS). */
  fuente: "saliente" | "ivr";
  /** nacional = 9-13 caracteres; corto = hunt group o extensión; largo = internacional o raro. */
  formato: "nacional" | "corto" | "largo";
  /** 3 primeras cifras de los 9 últimos dígitos; null si no es nacional. */
  prefijo: string | null;
  llamadas: number;
  /** SIN redondear (se suma por campaña). */
  minutos: number;
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
  abandonadas: number; // todos los orígenes
  abandonadasInbound: number; // solo entrantes: la tendencia de abandono (regla 6.b)
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

// ------------------------------------------------------------
// Planificación de turnos (queries/planificacion.ts)
// ------------------------------------------------------------

/** Usuario de Altitude con nº de agente (<PREFIJO>_<nnnn>[_SUFIJO]). */
export interface UsuarioAgenteRdb {
  usrName: string;
  altitudeCode: number;
  fullname: string | null;
}

/**
 * Parte de una isla de sesión (unión de intervalos op_type 0) de un usuario,
 * recortada a un día. Segundos desde las 00:00 de `fecha` (0..86400).
 */
export interface IslaSesion {
  fecha: string;
  usrName: string;
  inicioSeg: number;
  finSeg: number;
}

/** Demanda de un servicio en una franja de 30 min de un día (sumas). */
export interface DemandaFranja {
  fecha: string;
  servicio: string;
  inicioMin: number;
  entrantes: number;
  entrantesAtendidas: number;
  entrantesAbandonadas: number;
  entrantesRechazadas: number;
  salientes: number;
  salientesAtendidas: number;
  /** Segundos de gestión de entrantes atendidas por humanos (hilos < umbral). */
  segGestionEntrantes: number;
}

/** Contactos que dejan de estar vivos un día, por campaña. */
export interface CierresDia {
  fecha: string;
  campania: string;
  cierres: number;
}

/** Estado actual de una lista saliente (tabla activity). */
export interface EstadoLista {
  campania: string;
  total: number;
  vivos: number;
  vivosSinTocar: number;
}

/** Día de festivos_servicio (tabla propia de la instalación). */
export interface FestivoServicio {
  fecha: string;
  servicio: string; // ServicioDirectorio: 'GrupoHuertas', 'GrupoAvolo'...
  tipo: string; // TipoDia: hoy solo 'FESTIVO'
}

export interface FestivosServicio {
  festivos: FestivoServicio[];
  /** Última fecha cargada por servicio: la vigencia de la tabla. */
  ultimaFechaPorServicio: Record<string, string>;
}

/** Tramo de horarios_servicio. dias[0] = lunes … dias[6] = domingo. */
export interface HorarioServicio {
  servicio: string;
  dias: boolean[];
  entradaMin: number;
  salidaMin: number;
  desde: string;
  hasta: string;
}

/** Entrantes perdidas de hoy que nadie ha devuelto (alerta de clientes «a demanda»). */
export interface LlamadasPorDevolver {
  /** Números distintos con alguna entrante perdida y sin devolver. */
  porDevolver: number;
  /** HH:MM de la primera y la última perdida sin devolver de hoy (null si ninguna). */
  primera: string | null;
  ultima: string | null;
}

// ------------------------------------------------------------
// Resultados de actividad (regla 18): tipificación del script de cada
// contacto cerrado, desde las tablas ao_<servicio>.
// ------------------------------------------------------------

/**
 * Qué pasó con un contacto cerrado (activity.status = 3) en el rango:
 *  - tipificado: lo cerró un agente; su última sesión de script (con
 *    resultado si lo hay) cae en los 90 días anteriores al cierre.
 *  - sinTocar: se cerró sin que ningún agente hablara con él (familias
 *    NotTouched*, AutomaticallyRescheduled, *BeforeConnection y Overflowed
 *    de ContactBusinessStatus).
 *  - administrativo: tiene calificación de agente, pero ninguna sesión
 *    en los 90 días anteriores al cierre: alguien cerró la lista en bloque
 *    (08/09/2026: 278 contactos de GH tipificados en marzo de 2025).
 * Solo los tipificados entran en los ratios.
 */
export type CategoriaCierre = "tipificado" | "sinTocar" | "administrativo";

export interface FilaBaseResultados {
  /** Día del cierre (último event_moment del contacto), YYYY-MM-DD. */
  fecha: string;
  campania: string;
  /** usr_name de la última sesión de agente; null si no es «tipificado». */
  agente: string | null;
  nombre: string | null;
  categoria: CategoriaCierre;
  /**
   * Códigos (ph_table_schema_enum_value.code) de las columnas configuradas
   * para el servicio, en su orden (nivel 1, 2, 3). null = sin valor.
   */
  codigos: (number | null)[];
  contactos: number;
  /** Contactos cerrados como éxito (familia Success de ContactBusinessStatus). */
  exitos: number;
  /** Contactos con algún código marcado como «no válido» en su servicio. */
  noValidos: number;
}

export interface BaseResultados {
  filas: FilaBaseResultados[];
  /** Texto de cada código que aparece en las filas. */
  textos: Record<number, string>;
  /** Servicio (cliente) de cada campaña del alcance. */
  servicioDeCampania: Record<string, string>;
  /** Etiquetas de los niveles (columnas) configurados de cada servicio. */
  niveles: Record<string, string[]>;
  /** Servicios con resultados configurados: solo en ellos hay ratio neto. */
  serviciosConfigurados: string[];
}

/** Tabla ao_<servicio> de RDBv2 con sus columnas candidatas (int). */
export interface TablaResultados {
  /** ph_service.name */
  servicio: string;
  tabla: string;
  columnas: string[];
}

/** Valor de una columna de resultados con su frecuencia (admin). */
export interface ValorColumnaResultado {
  codigo: number;
  nombre: string;
  contactos: number;
}
