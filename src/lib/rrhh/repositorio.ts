// NOTA: solo servidor (SQLite). Acceso a los datos propios del panel de
// RRHH (docs/plan-rrhh.md). Las ausencias son las de Planificación
// (planificacion/repositorio.ts): aquí no se duplican.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { guardarAjuste, obtenerAjuste } from "@/lib/db/settings";
import { planTiposAusencia, rrhhHorarios, rrhhNotas, rrhhPersonas, type RrhhNotaRow, type RrhhPersonaRow } from "@/lib/db/schema";
import { DIAS_SEMANA, type DiaSemana, type HorarioSemana } from "./horario";
import { leerConfigMotivos, type ConfigMotivos } from "./motivos";

const CLAVE_MOTIVOS = "rrhh.motivos";

// ---------- Personas ----------

export function leerPersonas(): Map<string, RrhhPersonaRow> {
  return new Map(db.select().from(rrhhPersonas).all().map((p) => [p.agenteNumero, p]));
}

/** Contrato, exclusión y notas de una persona (crea la fila si no existe). Devuelve cómo estaba. */
export function guardarPersona(valores: {
  agenteNumero: string;
  contratoSemanalH: number | null;
  excluida: boolean;
  notas: string | null;
  /** null = automático. */
  grupo: string | null;
  autor: string;
}): RrhhPersonaRow | null {
  const antes = db.select().from(rrhhPersonas).where(eq(rrhhPersonas.agenteNumero, valores.agenteNumero)).get() ?? null;
  const cambios = {
    contratoSemanalH: valores.contratoSemanalH,
    excluida: valores.excluida,
    notas: valores.notas,
    grupo: valores.grupo,
    actualizadoPor: valores.autor,
    actualizadoAt: new Date(),
  };
  db.insert(rrhhPersonas)
    .values({ agenteNumero: valores.agenteNumero, ...cambios })
    .onConflictDoUpdate({ target: rrhhPersonas.agenteNumero, set: cambios })
    .run();
  return antes;
}

// ---------- Horarios confirmados ----------

/** Horario confirmado de cada persona (solo de las que lo tienen confirmado). */
export function leerHorariosConfirmados(): Map<string, HorarioSemana> {
  const confirmadas = new Set(
    db
      .select()
      .from(rrhhPersonas)
      .all()
      .filter((p) => p.horarioConfirmado)
      .map((p) => p.agenteNumero),
  );
  const salida = new Map<string, HorarioSemana>([...confirmadas].map((n) => [n, {}]));
  for (const f of db.select().from(rrhhHorarios).orderBy(asc(rrhhHorarios.tramo)).all()) {
    const h = salida.get(f.agenteNumero);
    if (!h || !DIAS_SEMANA.includes(f.diaSemana as DiaSemana)) continue;
    const d = f.diaSemana as DiaSemana;
    h[d] = [...(h[d] ?? []), { inicioMin: f.inicioMin, finMin: f.finMin }];
  }
  return salida;
}

/** Confirma (o cambia) el horario de una persona: sustituye sus días enteros (uno o dos tramos cada uno). */
export function guardarHorario(agenteNumero: string, horario: HorarioSemana, autor: string): void {
  db.transaction((tx) => {
    tx.delete(rrhhHorarios).where(eq(rrhhHorarios.agenteNumero, agenteNumero)).run();
    for (const d of DIAS_SEMANA) {
      (horario[d] ?? []).forEach((t, i) =>
        tx.insert(rrhhHorarios).values({ agenteNumero, diaSemana: d, tramo: i + 1, inicioMin: t.inicioMin, finMin: t.finMin }).run(),
      );
    }
    const cambios = { horarioConfirmado: true, actualizadoPor: autor, actualizadoAt: new Date() };
    tx.insert(rrhhPersonas)
      .values({ agenteNumero, ...cambios })
      .onConflictDoUpdate({ target: rrhhPersonas.agenteNumero, set: cambios })
      .run();
  });
}

/** Vuelve al horario aprendido: borra el confirmado. */
export function volverAAprendido(agenteNumero: string, autor: string): void {
  db.transaction((tx) => {
    tx.delete(rrhhHorarios).where(eq(rrhhHorarios.agenteNumero, agenteNumero)).run();
    tx.update(rrhhPersonas)
      .set({ horarioConfirmado: false, actualizadoPor: autor, actualizadoAt: new Date() })
      .where(eq(rrhhPersonas.agenteNumero, agenteNumero))
      .run();
  });
}

// ---------- Notas ----------

export function leerNotas(fecha: string, agenteNumero?: string): RrhhNotaRow[] {
  const filtro = agenteNumero
    ? and(eq(rrhhNotas.fecha, fecha), eq(rrhhNotas.agenteNumero, agenteNumero))
    : eq(rrhhNotas.fecha, fecha);
  return db.select().from(rrhhNotas).where(filtro).orderBy(asc(rrhhNotas.inicioMin), asc(rrhhNotas.id)).all();
}

export function crearNota(valores: { agenteNumero: string; fecha: string; inicioMin: number | null; texto: string; autor: string }): number {
  const r = db
    .insert(rrhhNotas)
    .values({ agenteNumero: valores.agenteNumero, fecha: valores.fecha, inicioMin: valores.inicioMin, texto: valores.texto, creadoPor: valores.autor })
    .returning({ id: rrhhNotas.id })
    .get();
  return r.id;
}

export function borrarNota(id: number): RrhhNotaRow | null {
  return db.delete(rrhhNotas).where(eq(rrhhNotas.id, id)).returning().get() ?? null;
}

// ---------- Motivos de pausa ----------

export function leerConfigMotivosRrhh(): ConfigMotivos {
  return leerConfigMotivos(obtenerAjuste(CLAVE_MOTIVOS, "{}"));
}

export function guardarConfigMotivosRrhh(config: ConfigMotivos): void {
  guardarAjuste(CLAVE_MOTIVOS, JSON.stringify(config));
}

// ---------- Tipos de ausencia (los de Planificación) ----------

export function leerTiposAusencia() {
  return db.select().from(planTiposAusencia).orderBy(asc(planTiposAusencia.codigo)).all();
}

/** Alta o cambio de un tipo de ausencia. Devuelve cómo estaba (null = nuevo). */
export function guardarTipoAusencia(valores: {
  codigo: string;
  nombre: string;
  color: string;
  computaComoTrabajada: boolean;
  activo: boolean;
}): typeof planTiposAusencia.$inferSelect | null {
  const antes = db.select().from(planTiposAusencia).where(eq(planTiposAusencia.codigo, valores.codigo)).get() ?? null;
  const { codigo, ...cambios } = valores;
  db.insert(planTiposAusencia)
    .values({ codigo, ...cambios })
    .onConflictDoUpdate({ target: planTiposAusencia.codigo, set: cambios })
    .run();
  return antes;
}
