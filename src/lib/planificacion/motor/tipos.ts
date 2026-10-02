import { z } from "zod";

// ============================================================
// Tipos del motor de planificación. El motor es PURO: sin I/O, sin
// Date.now() ni azar, y solo importa date-fns y zod (lo vigila una regla
// de ESLint), así que también corre en el navegador. Todo lo que entra y
// sale es JSON serializable: la entrada se guarda como foto en la versión
// y el fixture de los tests es una entrada real sin nombres.
//
// Tiempos en MINUTOS desde las 00:00. Una franja es [inicioMin, inicioMin +
// pasoMin). Días de la semana: 0 = lunes … 6 = domingo.
// ============================================================

export const MODOS_CLIENTE = ["erlang", "objetivo", "a_demanda", "resto"] as const;
export type ModoCliente = (typeof MODOS_CLIENTE)[number];

const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

export const esquemaTramo = z
  .object({
    inicioMin: z.number().int().min(0).max(1440),
    finMin: z.number().int().min(0).max(1440),
  })
  .refine((t) => t.finMin > t.inicioMin, { message: "El tramo termina antes de empezar" });
export type Tramo = z.infer<typeof esquemaTramo>;

/** Dimensionado por Erlang C de un cliente entrante. */
export const esquemaParametrosErlang = z.object({
  /** AHT en segundos. null = el medido en la ventana de demanda. */
  ahtSeg: z.number().positive().nullable().default(null),
  slaPct: z.number().min(1).max(100).default(80),
  umbralSeg: z.number().positive().default(20),
  /** Agentes que se suman al resultado de Erlang (también hacen salientes). */
  margen: z.number().int().min(0).default(1),
});
export type ParametrosErlang = z.infer<typeof esquemaParametrosErlang>;

export const esquemaBloqueCandidato = z
  .object({
    inicioMin: z.number().int().min(0).max(1440),
    finMin: z.number().int().min(0).max(1440),
    /** Se suma a la puntuación: preferencia por esta franja. */
    bonus: z.number().default(0),
  })
  .refine((t) => t.finMin > t.inicioMin, { message: "El bloque termina antes de empezar" });

/**
 * Parámetros de un cliente de planificación (plan_clientes.parametros). Todo
 * con valor por defecto: un JSON vacío es válido.
 */
export const esquemaParametrosCliente = z.object({
  /** Nombre en festivos_servicio / horarios_servicio (null = sin horario propio). */
  calendario: z.string().nullable().default(null),
  /** Si está, se calcula su mínimo por franja con Erlang C. */
  erlang: esquemaParametrosErlang.nullable().default(null),
  /** Bloques candidatos donde el motor puede colocar al cliente. */
  bloques: z.array(esquemaBloqueCandidato).default([]),
  /** Franjas donde nunca se coloca. */
  evitar: z.array(esquemaTramo).default([]),
  maxHorasDiaAgente: z.number().positive().nullable().default(null),
  maxHorasSeguidas: z.number().positive().nullable().default(null),
  maxBloquesDiaAgente: z.number().int().positive().nullable().default(null),
  /** % de la lista que se acepta dejar vivo al acabar (UGR: 28). */
  pctVivosObjetivo: z.number().min(0).max(100).default(0),
  /** Cierres por hora fijados a mano (null = medido). */
  ritmoManual: z.number().positive().nullable().default(null),
  /** Tope semanal de horas (CEFF: 4). Se prorratea en semanas incompletas. */
  horasSemanaFijas: z.number().min(0).nullable().default(null),
  /** Último día en que se planifica (fin de campaña). */
  fechaFin: esquemaFecha.nullable().default(null),
  /**
   * Horas contratadas con el cliente para la campaña y desde cuándo cuentan.
   * Con las dos, el objetivo nunca pasa de lo que queda (contratadas −
   * trabajadas − ya planificadas en meses anteriores) y la página de bolsas
   * estima cuándo se agotan.
   */
  horasContratadas: z.number().positive().nullable().default(null),
  inicioContrato: esquemaFecha.nullable().default(null),
  /**
   * Patrones LIKE de campañas parecidas ya terminadas, para estimar el fin
   * (vacío = los del cliente sin el año: «UGR[_]EGRE26» → «UGR[_]EGRE%»).
   */
  campaniasSimilares: z.array(z.string().min(1).max(80)).default([]),
  /**
   * Reparto de las horas entre semanas: la curva del mismo periodo del año
   * anterior (si no hay, a partes iguales), a partes iguales, o todo al
   * principio (listas casi agotadas).
   */
  curva: z.enum(["anio_anterior", "uniforme", "inicio"]).default("anio_anterior"),
  /** Peso de la tasa de contacto (0..1) en la puntuación. */
  pesoContacto: z.number().min(0).default(1),
  /** Penalización por horas ya puestas ese día: horas / kDia. */
  kDia: z.number().positive().default(6),
});
export type ParametrosCliente = z.infer<typeof esquemaParametrosCliente>;

// ------------------------------------------------------------
// Entrada
// ------------------------------------------------------------

export interface DiaMotor {
  fecha: string;
  diaSemana: number;
  /** Lunes de su semana (clave de semana). */
  lunes: string;
  rotacion: "A" | "B";
  /** De lunes a viernes y no festivo en el calendario del equipo. */
  laborable: boolean;
  /** Calendarios (ServicioDirectorio) con festivo ese día. */
  festivos: string[];
  /** Día de la semana con que se dimensiona: el siguiente a un festivo, como lunes. */
  diaEquivalente: number;
}

export interface AusenciaMotor {
  fecha: string;
  inicioMin: number;
  finMin: number;
  tipo: string;
}

export interface AgenteMotor {
  numero: string;
  contratoSemanalH: number | null;
  /** Códigos de cliente de sus usuarios de Altitude. */
  habilidades: string[];
  /** fecha → tramos del turno, ya expandidos con la rotación A/B. */
  turnos: Record<string, Tramo[]>;
  ausencias: AusenciaMotor[];
  ultimaSesion: string | null;
  forzarActivo: boolean;
}

export interface ClienteMotor {
  codigo: string;
  nombre: string;
  color: string;
  modo: ModoCliente;
  prioridad: number;
  cuentaComo: string | null;
  parametros: ParametrosCliente;
  /** fecha → tramos de horarios_servicio; null = el cliente no tiene horario propio. */
  horario: Record<string, Tramo[]> | null;
}

export interface LambdaFranja {
  diaSemana: number;
  inicioMin: number;
  /** Llamadas por hora (media de la ventana). */
  llamadasHora: number;
}

export interface DemandaMotor {
  cliente: string;
  lambda: LambdaFranja[];
  ahtSeg: number;
  slaPct: number;
  umbralSeg: number;
  margen: number;
  /** Entrantes del mismo mes del año anterior ÷ las del mes previo a ese. */
  factorEstacional: number | null;
  aplicarEstacionalidad: boolean;
}

export interface ObjetivoSemana {
  cliente: string;
  semanaLunes: string;
  horas: number;
  origen: "calculado" | "manual";
  detalle?: Record<string, unknown>;
}

export interface BolsaMotor {
  cliente: string;
  horas: number;
  origen: "prorrateo" | "manual";
  /** Si es un prorrateo: la bolsa de partida (mes y horas). */
  base?: { mes: string; horas: number };
}

/** Bloque ya decidido (fijado o manual) que el motor respeta tal cual. */
export interface BloqueEntrada {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  clienteCodigo: string;
  regla?: string;
  datos?: Record<string, unknown>;
}

export interface MetaEntrada {
  /** Usuarios con actividad reciente cuyo prefijo no casa con ningún cliente. */
  prefijosSinCliente: {
    usrName: string;
    agenteNumero: string;
    prefijo: string;
    sufijo: string;
    ultimaSesion: string | null;
  }[];
  /** Agentes con sesiones recientes en clientes del equipo que no están en plantilla. */
  fueraDePlantilla: { agenteNumero: string; horas: number; clientes: string[] }[];
  /** Último día presente en los agregados de planificación. */
  ultimoAgregado: string | null;
  /** Última fecha cargada en festivos_servicio / horarios_servicio por calendario. */
  vigenciaFestivos: Record<string, string>;
  vigenciaHorarios: Record<string, string>;
  /** Avisos detectados al cargar (ritmo sin datos, foto de listas antigua...). */
  avisosCarga: Aviso[];
}

export interface EntradaMotor {
  version: 1;
  mes: string; // YYYY-MM
  pasoMin: number;
  inicioDiaMin: number;
  finDiaMin: number;
  /** Último día cerrado con datos (referencia para inactividad y caducidad). */
  fechaDatos: string;
  /** Código del cliente de modo `resto` (GH): se queda las horas sobrantes. */
  clienteBase: string;
  /** Calendario de festivos del equipo (plan.servicioCalendario). */
  servicioCalendario: string;
  diasInactividad: number;
  dias: DiaMotor[];
  agentes: AgenteMotor[];
  clientes: ClienteMotor[];
  demanda: DemandaMotor[];
  objetivos: ObjetivoSemana[];
  bolsas: BolsaMotor[];
  /** Horas reales de los últimos días por agente y cliente (desempates). */
  experiencia: { agente: string; cliente: string; horas: number }[];
  /** Salientes atendidas ÷ intentos, por cliente y franja. */
  tasaContacto: { cliente: string; inicioMin: number; tasa: number }[];
  fijados: BloqueEntrada[];
  meta: MetaEntrada;
}

// ------------------------------------------------------------
// Salida
// ------------------------------------------------------------

export const REGLAS = [
  "base_turno",
  "minimo_erlang",
  "objetivo",
  "fijado",
  "manual",
  "devuelto_a_base",
] as const;
export type Regla = (typeof REGLAS)[number];

export interface BloqueMotor {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  clienteCodigo: string;
  regla: Regla;
  /** Explicación: con qué datos se decidió (explicaciones.ts la convierte en texto). */
  datos: Record<string, unknown>;
  fijado: boolean;
}

/** Lo mínimo que necesitan las validaciones de un bloque. */
export type BloqueBasico = Pick<
  BloqueMotor,
  "agenteNumero" | "fecha" | "inicioMin" | "finMin" | "clienteCodigo"
>;

export type Gravedad = "dura" | "blanda" | "info";

export interface Aviso {
  codigo: string;
  gravedad: Gravedad;
  mensaje: string;
  fecha?: string;
  agente?: string;
  cliente?: string;
  inicioMin?: number;
  finMin?: number;
  datos?: Record<string, unknown>;
}

export interface ResumenCliente {
  codigo: string;
  horas: number;
  porSemana: Record<string, number>;
  /** Suma de objetivos semanales (clientes `objetivo`). */
  objetivo: number | null;
  bolsa: number | null;
}

export interface ResumenAgente {
  numero: string;
  activo: boolean;
  /** Horas de turno disponibles en el mes (turno − ausencias − festivos). */
  capacidadH: number;
  horas: number;
  /** Contrato semanal × laborables del mes ÷ 5. */
  contratoMesH: number | null;
  porCliente: Record<string, number>;
  porSemana: Record<string, number>;
}

export interface SemanaResumen {
  lunes: string;
  rotacion: "A" | "B";
  fechas: string[];
  laborables: number;
}

export interface ResumenMotor {
  capacidadH: number;
  planificadoH: number;
  semanas: SemanaResumen[];
  clientes: ResumenCliente[];
  agentes: ResumenAgente[];
}

export interface MinimosDia {
  fecha: string;
  cliente: string;
  /** Mínimo por franja (índice de `franjas`). 0 = sin mínimo. */
  porFranja: number[];
}

export interface SalidaMotor {
  /** inicioMin de cada franja del día. */
  franjas: number[];
  bloques: BloqueMotor[];
  avisos: Aviso[];
  resumen: ResumenMotor;
  minimos: MinimosDia[];
}
