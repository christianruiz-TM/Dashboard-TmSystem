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
  /**
   * «Llamadas gestionadas» en pantalla (antes «Atendidas»): hilos con
   * termination_state = 1, de cualquier origen. En una saliente solo dice que
   * la llamada pasó por el puesto del agente, no que contestara alguien
   * (21/10/2026: Bol_0516 tuvo 651 un día, 239 con conversación). Sin las
   * preparaciones de llamada manual (salientes sin número, 22/10/2026).
   */
  atendidas: number;
  /** Llamadas gestionadas con conversación: algún segmento Connected (state 6). */
  conversaciones: number;
  /** Contactos trabajados: sesiones de script de agente humano (como los ratios). */
  contactos: number;
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
  /** Llamadas gestionadas (termination_state = 1); ver KpiCampaniaHoy.atendidas. */
  atendidas: number;
  /** Las que tuvieron conversación (segmento Connected). */
  conversaciones: number;
  /** Contactos trabajados: sesiones de script del agente. */
  contactos: number;
  talkMedioSeg: number | null;
  acwMedioSeg: number | null;
  ahtMedioSeg: number | null;
  /** Gestión de todo lo gestionado, preparaciones incluidas (es trabajo). */
  productivoSeg: number;
  /**
   * Preparaciones de llamada manual (salientes sin número, 22/10/2026): el
   * agente coge el contacto y abre la ficha antes de marcar. No son llamadas
   * (no están en `atendidas` ni en las medias); su tiempo va en productivoSeg.
   */
  preparaciones: number;
  preparacionSeg: number;
}

/**
 * Base de los ratios de éxito: una fila por usuario de agente y campaña.
 * Los éxitos salen SIEMPRE de script_session, nunca contando hilos: en
 * Bolsas, Socios y UGR una sesión agrupa 2-3 llamadas atendidas del mismo
 * agente al mismo contacto (otro teléfono, otro itr_global) y contar por
 * hilo duplicaba éxitos (septiembre 2026: 1.180 sesiones de éxito con 2+
 * hilos).
 */
export interface FilaConteosRatios {
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

/**
 * Fila de la base de ratios de un rango: los conteos y los tiempos de los
 * ÉXITOS (decidido 19/10/2026 con Christian, sustituyen al «tiempo por éxito»
 * de gestión de todas las atendidas ÷ éxitos). En segundos, sin redondear.
 * Cada tiempo lleva su propio número de éxitos: no todos los éxitos tienen
 * llamada atendida ligada y los de 2 h o más no cuentan (regla 15).
 */
export interface FilaBaseRatios extends FilaConteosRatios, TiemposSesionesRatios, TiemposLlamadasRatios {
  /** Éxitos con alguna llamada atendida y la conversación de esas llamadas. */
  exitosConConversacion: number;
  conversacionExitosSeg: number;
  /** Éxitos con su tiempo de script abierto (script_session.duration). */
  exitosConGestion: number;
  gestionExitosSeg: number;
}

/**
 * Tiempo con el script abierto (script_session.duration, en segundos y sin
 * redondear) de las sesiones del agente en la campaña (21/10/2026): es la
 * hora de la campaña en «llamadas por hora» y «éxitos por hora» (por campaña
 * no hay horas logadas, regla 11), y la de las sesiones SIN éxito da su
 * duración media. Fuera las sesiones de 2 h o más y las aún abiertas.
 */
export interface TiemposSesionesRatios {
  guionSeg: number;
  noExitosConGestion: number;
  gestionNoExitosSeg: number;
}

/**
 * Duración de las LLAMADAS gestionadas (sin preparaciones, regla 6) según
 * acabe en éxito su sesión de script (22/10/2026, cajas 11 y 12 de la
 * cabecera): `itr_thread.duration` (conversación + ACW), en segundos y sin
 * redondear. Una llamada sin sesión de script cuenta como «no éxito». Fuera
 * las de 2 h o más (regla 15).
 */
export interface TiemposLlamadasRatios {
  llamadasExito: number;
  duracionLlamadasExitoSeg: number;
  llamadasNoExito: number;
  duracionLlamadasNoExitoSeg: number;
}

/** Fila de ratios de un día (agg_daily_agent_campaign): solo los conteos. */
export interface FilaDiariaRatios extends FilaConteosRatios {
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
  /** Sesiones de script (contactos gestionados). */
  sesiones: number;
  /** Contactos cerrados en éxito (familia Success* de ContactBusinessStatus). */
  exitosFinalizados: number;
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
  /** Sesiones de script (contactos gestionados): artículo «Encuestas realizadas». */
  sesiones: number;
  /** De los finalizados, los cerrados en éxito (familia Success*). */
  exitosFinalizados: number;
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
  /**
   * Llamadas a los contactos de ÉXITO (21/10/2026): intentos de salida a cada
   * uno en los 90 días anteriores a su cierre, sin los estados que no cuentan
   * en la calidad de la base de datos. Y cuántos éxitos tienen alguna.
   */
  llamadasExitos: number;
  exitosConLlamadas: number;
}

/**
 * Horas de «finalizados por hora» en Resultados (21/10/2026), sin redondear:
 * las logadas (user_log) por usuario para lo agrupado (agente, total) y las
 * de script abierto por campaña y por `agente|campania` para lo separado por
 * campaña (por campaña no hay horas logadas, regla 11).
 */
export interface HorasResultados {
  logadas: Record<string, number>;
  guionCampania: Record<string, number>;
  guionAgenteCampania: Record<string, number>;
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
  /** Valores del campo del contacto configurado (antes del filtro), si lo hay. */
  valoresCampo?: { valor: string | null; finalizados: number }[];
  /** Horas del período para «finalizados por hora»; sin ellas, no se calcula. */
  horas?: HorasResultados;
}

/**
 * Directorio de contactos de un servicio (tabla dir_*, table_schema ts_type
 * 4) con sus columnas de texto: la lista blanca del filtro por campo del
 * contacto de Resultados.
 */
export interface DirectorioServicio {
  /** ph_service.name */
  servicio: string;
  /** ph_directory.name */
  directorio: string;
  tabla: string;
  columnas: string[];
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

// ------------------------------------------------------------
// KPIs de salida (22/10/2026): queries/salientes.ts y lib/salientes.ts
// ------------------------------------------------------------

/** Intentos de salida por agente, campaña y hora del día (agente null = sin agente). */
export interface FilaFranjaSalientes {
  agente: string | null;
  nombre: string | null;
  campania: string;
  /** Hora del día (0-23), hora local de la centralita. */
  hora: number;
  /** Intentos con número, sin los estados que no cuentan (NULL, -1, 6, 11, 17, 18). */
  intentos: number;
  /** De ellos, gestionados (alguien contestó y pasó por el agente). */
  contestados: number;
  /** Preparaciones de llamada manual (salientes sin número, regla 6) y su tiempo en segundos. */
  preparaciones: number;
  preparacionSeg: number;
}

/**
 * Contactos llamados y alcanzados en el rango (no son sumables entre agentes
 * o campañas: un contacto lo llaman varios, así que el SQL da cada nivel).
 */
export interface FilaAlcanceSalientes {
  nivel: "agente" | "campania" | "total";
  agente: string | null;
  nombre: string | null;
  campania: string | null;
  contactos: number;
  /** Con alguna llamada contestada en el rango. */
  alcanzados: number;
  /** Contactos cuya PRIMERA conversación cae en el rango, y la suma de sus intentos hasta ella. */
  primeras: number;
  intentosHastaHablar: number;
}

/** Éxitos según el número de intento en que llegaron (5 = cinco o más; 0 = sin llamada de salida). */
export interface FilaIntentoExito {
  agente: string;
  nombre: string;
  campania: string;
  intento: number;
  exitos: number;
  /** Suma de los intentos de esos éxitos (para la media). */
  intentosTotales: number;
}

/** Rellamadas por agente y campaña: agendadas en el rango y horas programadas vigentes. */
export interface FilaRellamadas {
  agente: string | null;
  nombre: string | null;
  campania: string;
  agendadas: number;
  hechas: number;
  /** Rellamadas vencidas (hora programada pasada) sin llamada ahora mismo (foto, no depende del rango). */
  vencidas: number;
  /** Horas programadas del rango con llamada después y la suma de minutos de retraso (aproximado). */
  conRetraso: number;
  retrasoMin: number;
}

export interface BaseSalientes {
  franjas: FilaFranjaSalientes[];
  alcance: FilaAlcanceSalientes[];
  intentos: FilaIntentoExito[];
  rellamadas: FilaRellamadas[];
  /**
   * Por usuario de agente: horas en Ready (unión de intervalos, regla 11) y,
   * de ellas, esperando llamada (sin ninguna ficha de script abierta).
   */
  ready: { agente: string; horas: number; esperando: number }[];
}
