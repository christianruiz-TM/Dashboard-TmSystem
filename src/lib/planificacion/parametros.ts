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
