// NOTA: solo servidor (lee app_settings de SQLite).
import { like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/sqlite";
import { appSettings } from "@/lib/db/schema";
import { guardarAjuste } from "@/lib/db/settings";

// ============================================================
// Parámetros GLOBALES del módulo de planificación. No tienen tabla propia:
// van en app_settings con claves plan.* y el valor en JSON. Si una clave
// falta o no es válida se usa el valor por defecto (y se avisa por consola).
// Los parámetros de cada cliente van en plan_clientes.parametros.
// ============================================================

const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const esquemaParametrosPlan = z.object({
  /** Franja del plan en minutos. Pasar a 30 min es cambiar solo esto. */
  pasoMin: z
    .number()
    .int()
    .refine((m) => m > 0 && 1440 % m === 0 && m % 30 === 0, "Múltiplo de 30 que divida el día")
    .default(60),
  /** Primera y última hora del tablero (minutos desde las 00:00). */
  inicioDiaMin: z.number().int().min(0).max(1440).default(480),
  finDiaMin: z.number().int().min(0).max(1440).default(1200),
  /** Lunes de una semana A: la rotación alterna desde aquí. */
  semanaA: esquemaFecha.default("2026-08-31"),
  /** Calendario de festivos del equipo (ServicioDirectorio de festivos_servicio). */
  servicioCalendario: z.string().min(1).default("GrupoHuertas"),
  /** Equipo que se planifica (plan_clientes.equipo / plan_agentes.equipo). */
  equipo: z.string().min(1).default("multicliente"),
  /** Sin sesión en tantos días → inactivo (no se planifica salvo que se fuerce). */
  diasInactividad: z.number().int().positive().default(30),
  /** Hilos de esta duración o más se descartan de la gestión (s). */
  maxSegHilo: z.number().int().positive().default(7200),
  /** Semanas completas para la λ de Erlang y la tasa de contacto. */
  semanasDemanda: z.number().int().positive().default(12),
  /** Semanas completas para medir el ritmo de cierre... */
  semanasRitmo: z.number().int().positive().default(2),
  /** ...ampliables hasta aquí si no llegan a horasMinRitmo horas de sesión. */
  semanasRitmoMax: z.number().int().positive().default(8),
  horasMinRitmo: z.number().min(0).default(4),
  /** Días de horas reales para la experiencia (desempates). */
  diasExperiencia: z.number().int().positive().default(60),
  /** Aplicar el factor «mismo mes del año anterior» al mínimo (por defecto no). */
  estacionalidadAplicar: z.boolean().default(false),
  /** F4: minutos sin conectar tras el inicio del bloque para avisar. */
  minutosAlertaConexion: z.number().int().positive().default(15),
  /** F5: día del mes en que se genera el borrador del mes siguiente. */
  diaGeneracion: z.number().int().min(1).max(28).default(20),
});

export type ParametrosPlan = z.infer<typeof esquemaParametrosPlan>;
export type ClaveParametroPlan = keyof ParametrosPlan;

/** Clave en app_settings de cada parámetro. */
export const CLAVES_PARAMETROS: Record<ClaveParametroPlan, string> = {
  pasoMin: "plan.pasoMin",
  inicioDiaMin: "plan.inicioDiaMin",
  finDiaMin: "plan.finDiaMin",
  semanaA: "plan.semanaA",
  servicioCalendario: "plan.servicioCalendario",
  equipo: "plan.equipo",
  diasInactividad: "plan.diasInactividad",
  maxSegHilo: "plan.maxSegHilo",
  semanasDemanda: "plan.semanasDemanda",
  semanasRitmo: "plan.semanasRitmo",
  semanasRitmoMax: "plan.semanasRitmoMax",
  horasMinRitmo: "plan.horasMinRitmo",
  diasExperiencia: "plan.diasExperiencia",
  estacionalidadAplicar: "plan.estacionalidad.aplicar",
  minutosAlertaConexion: "plan.minutosAlertaConexion",
  diaGeneracion: "plan.diaGeneracion",
};

export type TipoCampoParametro = "entero" | "decimal" | "hora" | "fecha" | "texto" | "booleano";

/** Cómo se muestra y se edita cada parámetro en /planificacion/configuracion/parametros. */
export const DESCRIPCION_PARAMETROS: Record<
  ClaveParametroPlan,
  { grupo: string; etiqueta: string; ayuda: string; tipo: TipoCampoParametro }
> = {
  pasoMin: {
    grupo: "Tablero",
    etiqueta: "Franja (min)",
    ayuda: "Granularidad del plan. 60 = horas; 30 = medias horas (múltiplo de 30). Afecta a los borradores nuevos.",
    tipo: "entero",
  },
  inicioDiaMin: { grupo: "Tablero", etiqueta: "Primera hora", ayuda: "Inicio del día en el tablero y en el motor.", tipo: "hora" },
  finDiaMin: { grupo: "Tablero", etiqueta: "Última hora", ayuda: "Fin del día (posterior a la primera hora).", tipo: "hora" },
  semanaA: {
    grupo: "Calendario",
    etiqueta: "Lunes de una semana A",
    ayuda: "La rotación A/B de los turnos alterna desde esta semana. Tiene que ser lunes.",
    tipo: "fecha",
  },
  servicioCalendario: {
    grupo: "Calendario",
    etiqueta: "Calendario de festivos del equipo",
    ayuda: "ServicioDirectorio de festivos_servicio cuyos festivos no se trabajan.",
    tipo: "texto",
  },
  equipo: {
    grupo: "Calendario",
    etiqueta: "Equipo que se planifica",
    ayuda: "Clientes y agentes con este equipo entran en el plan.",
    tipo: "texto",
  },
  diasInactividad: {
    grupo: "Datos",
    etiqueta: "Días sin sesión para inactivo",
    ayuda: "Un agente sin sesiones en tantos días no se planifica (salvo «forzar activo»).",
    tipo: "entero",
  },
  maxSegHilo: {
    grupo: "Datos",
    etiqueta: "Hilo máximo (s)",
    ayuda: "Los hilos de esta duración o más se descartan de la gestión (CEFF tiene duraciones imposibles).",
    tipo: "entero",
  },
  semanasDemanda: {
    grupo: "Datos",
    etiqueta: "Semanas de demanda",
    ayuda: "Semanas completas para la λ de Erlang y la tasa de contacto.",
    tipo: "entero",
  },
  semanasRitmo: { grupo: "Datos", etiqueta: "Semanas de ritmo", ayuda: "Semanas completas para medir los cierres por hora.", tipo: "entero" },
  semanasRitmoMax: {
    grupo: "Datos",
    etiqueta: "Semanas de ritmo (máximo)",
    ayuda: "Si no hay bastantes horas, la ventana del ritmo se amplía hasta aquí.",
    tipo: "entero",
  },
  horasMinRitmo: {
    grupo: "Datos",
    etiqueta: "Horas mínimas para el ritmo",
    ayuda: "Horas de sesión que hacen falta para dar por bueno un ritmo medido.",
    tipo: "decimal",
  },
  diasExperiencia: {
    grupo: "Datos",
    etiqueta: "Días de experiencia",
    ayuda: "Horas reales recientes por agente y cliente para deshacer empates.",
    tipo: "entero",
  },
  estacionalidadAplicar: {
    grupo: "Datos",
    etiqueta: "Aplicar estacionalidad al mínimo",
    ayuda: "Multiplica la demanda por el factor «mismo mes del año anterior». Por defecto solo se avisa.",
    tipo: "booleano",
  },
  minutosAlertaConexion: {
    grupo: "Seguimiento (F4-F5)",
    etiqueta: "Minutos para alerta de conexión",
    ayuda: "Agente planificado sin conectar tras tantos minutos del inicio de su bloque.",
    tipo: "entero",
  },
  diaGeneracion: {
    grupo: "Seguimiento (F4-F5)",
    etiqueta: "Día de generación automática",
    ayuda: "Día del mes en que la tarea nocturna crea el borrador del mes siguiente.",
    tipo: "entero",
  },
};

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return texto; // cadenas guardadas sin comillas
  }
}

/** Parámetros vigentes: lo guardado en app_settings sobre los valores por defecto. */
export function leerParametrosPlan(): ParametrosPlan {
  const filas = db.select().from(appSettings).where(like(appSettings.clave, "plan.%")).all();
  const guardados = new Map(filas.map((f) => [f.clave, f.valor]));
  const valores: Record<string, unknown> = {};
  for (const [prop, clave] of Object.entries(CLAVES_PARAMETROS) as [ClaveParametroPlan, string][]) {
    const texto = guardados.get(clave);
    if (texto === undefined) continue;
    const campo = esquemaParametrosPlan.shape[prop].safeParse(leerJson(texto));
    if (campo.success) valores[prop] = campo.data;
    else console.warn(`[planificacion] ${clave} = ${texto} no es válido; se usa el valor por defecto`);
  }
  const p = esquemaParametrosPlan.parse(valores);
  if (p.finDiaMin <= p.inicioDiaMin) throw new Error("plan.finDiaMin debe ser posterior a plan.inicioDiaMin");
  return p;
}

/** Guarda un parámetro validado. Lanza si el valor no es válido. */
export function guardarParametroPlan<K extends ClaveParametroPlan>(prop: K, valor: ParametrosPlan[K]): void {
  const valido = esquemaParametrosPlan.shape[prop].parse(valor);
  guardarAjuste(CLAVES_PARAMETROS[prop], JSON.stringify(valido));
}
