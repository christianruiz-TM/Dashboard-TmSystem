// NOTA: solo servidor (SQLite). El motor NO importa este módulo.
import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import {
  aggCierresCampania,
  aggHoraServicio,
  aggSesionUsuario,
  planAgenteTurnos,
  planAgenteUsuarios,
  planAgentes,
  planAusencias,
  planBloques,
  planBolsas,
  planClientes,
  planListasEstado,
  planObjetivos,
  planPatronTramos,
  planPatrones,
  planPrefijos,
  planTiposAusencia,
  planVersiones,
} from "@/lib/db/schema";
import type { CierresDia, DemandaFranja, EstadoLista, IslaSesion, UsuarioAgenteRdb } from "@/lib/rdb/types";
import type { EntradaMotor, SalidaMotor } from "./motor/tipos";
import { parsearUsuario, resolverCliente } from "./usuarios";

// ============================================================
// Acceso a SQLite del módulo de planificación: configuración, agregados
// propios y versiones del plan. Las escrituras de agregados REEMPLAZAN
// días completos en una transacción (como agregados.ts): re-ejecutar un
// rango lo deja idéntico a RDBv2.
// ============================================================

// ---------- Configuración ----------

export function leerClientes(equipo?: string) {
  const filas = db.select().from(planClientes).orderBy(asc(planClientes.orden), asc(planClientes.codigo)).all();
  return filas.filter((c) => c.activo && (equipo == null || c.equipo === equipo));
}

export function leerPrefijos() {
  return db.select().from(planPrefijos).all();
}

export function leerTiposAusencia() {
  return db.select().from(planTiposAusencia).all();
}

export function leerAgentes() {
  return db.select().from(planAgentes).orderBy(asc(planAgentes.numero)).all();
}

export function leerUsuarios() {
  return db.select().from(planAgenteUsuarios).orderBy(asc(planAgenteUsuarios.usrName)).all();
}

export function leerPatrones() {
  const patrones = db.select().from(planPatrones).all();
  const tramos = db.select().from(planPatronTramos).all();
  return patrones.map((p) => ({
    ...p,
    tramos: tramos
      .filter((t) => t.patronId === p.id)
      .map((t) => ({ diaSemana: t.diaSemana, inicioMin: t.inicioMin, finMin: t.finMin })),
  }));
}

export function leerAsignacionesTurno() {
  return db.select().from(planAgenteTurnos).all();
}

/** Ausencias que tocan el rango [desde, hasta]. */
export function leerAusencias(desde: string, hasta: string) {
  return db
    .select()
    .from(planAusencias)
    .where(and(lte(planAusencias.desde, hasta), gte(planAusencias.hasta, desde)))
    .all();
}

export function leerBolsas(mes: string) {
  return db.select().from(planBolsas).where(eq(planBolsas.mes, mes)).all();
}

/**
 * Por cliente, la bolsa del mes más reciente ANTERIOR a `mes`: la base del
 * prorrateo cuando el mes aún no tiene la suya (aunque el mes anterior
 * tampoco la tenga confirmada todavía).
 */
export function ultimasBolsasAnteriores(mes: string) {
  const filas = db.select().from(planBolsas).where(lt(planBolsas.mes, mes)).orderBy(desc(planBolsas.mes)).all();
  const porCliente = new Map<string, (typeof filas)[number]>();
  for (const f of filas) if (!porCliente.has(f.clienteCodigo)) porCliente.set(f.clienteCodigo, f);
  return [...porCliente.values()];
}

export function leerObjetivosManuales(mes: string) {
  return db
    .select()
    .from(planObjetivos)
    .where(and(eq(planObjetivos.mes, mes), eq(planObjetivos.origen, "manual")))
    .all();
}

// ---------- Agregados: lectura ----------

export function demandaServicio(servicio: string, desde: string, hasta: string) {
  return db
    .select()
    .from(aggHoraServicio)
    .where(and(eq(aggHoraServicio.servicio, servicio), gte(aggHoraServicio.fecha, desde), lte(aggHoraServicio.fecha, hasta)))
    .all();
}

/** Entrantes de un servicio en un mes (YYYY-MM): estacionalidad. */
export function entrantesServicioMes(servicio: string, mes: string): number {
  const fila = db
    .select({ n: sql<number>`COALESCE(SUM(${aggHoraServicio.entrantes}), 0)` })
    .from(aggHoraServicio)
    .where(and(eq(aggHoraServicio.servicio, servicio), sql`substr(${aggHoraServicio.fecha}, 1, 7) = ${mes}`))
    .get();
  return fila?.n ?? 0;
}

/** ¿Hay algún día agregado de ese mes? (para no confundir «0 llamadas» con «sin datos»). */
export function hayDemandaMes(mes: string): boolean {
  return (
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(aggHoraServicio)
      .where(sql`substr(${aggHoraServicio.fecha}, 1, 7) = ${mes}`)
      .get()?.n ?? 0
  ) > 0;
}

/** Segundos de sesión por usuario y día en el rango. */
export function segundosSesionPorUsuarioDia(desde: string, hasta: string) {
  return db
    .select({
      usrName: aggSesionUsuario.usrName,
      fecha: aggSesionUsuario.fecha,
      segundos: sql<number>`SUM(${aggSesionUsuario.finSeg} - ${aggSesionUsuario.inicioSeg})`,
    })
    .from(aggSesionUsuario)
    .where(and(gte(aggSesionUsuario.fecha, desde), lte(aggSesionUsuario.fecha, hasta)))
    .groupBy(aggSesionUsuario.usrName, aggSesionUsuario.fecha)
    .all();
}

/** Último día con sesión de cada usuario, hasta una fecha. */
export function ultimaSesionPorUsuario(hasta: string): Map<string, string> {
  const filas = db
    .select({ usrName: aggSesionUsuario.usrName, ultima: sql<string>`MAX(${aggSesionUsuario.fecha})` })
    .from(aggSesionUsuario)
    .where(lte(aggSesionUsuario.fecha, hasta))
    .groupBy(aggSesionUsuario.usrName)
    .all();
  return new Map(filas.map((f) => [f.usrName, f.ultima]));
}

export function cierresRango(desde: string, hasta: string) {
  return db
    .select()
    .from(aggCierresCampania)
    .where(and(gte(aggCierresCampania.fecha, desde), lte(aggCierresCampania.fecha, hasta)))
    .all();
}

/** Foto de listas más reciente con fecha ≤ `hasta`; si no hay, la más antigua posterior. */
export function fotoListas(hasta: string): { fecha: string; filas: (typeof planListasEstado.$inferSelect)[] } | null {
  const anterior = db
    .select({ fecha: planListasEstado.fecha })
    .from(planListasEstado)
    .where(lte(planListasEstado.fecha, hasta))
    .orderBy(desc(planListasEstado.fecha))
    .limit(1)
    .get();
  const fecha =
    anterior?.fecha ??
    db.select({ fecha: planListasEstado.fecha }).from(planListasEstado).orderBy(asc(planListasEstado.fecha)).limit(1).get()?.fecha;
  if (!fecha) return null;
  return { fecha, filas: db.select().from(planListasEstado).where(eq(planListasEstado.fecha, fecha)).all() };
}

/** Todas las campañas que aparecen en listas o cierres (para repartir patrones). */
export function campaniasConocidas(): string[] {
  const listas = db.selectDistinct({ c: planListasEstado.campania }).from(planListasEstado).all();
  const cierres = db.selectDistinct({ c: aggCierresCampania.campania }).from(aggCierresCampania).all();
  return [...new Set([...listas, ...cierres].map((x) => x.c))].sort();
}

/** Último día agregado: el MÁS ANTIGUO de los máximos de las tres tablas. */
export function ultimoAgregado(): string | null {
  const maximo = (tabla: typeof aggHoraServicio | typeof aggSesionUsuario | typeof aggCierresCampania) =>
    db.select({ m: sql<string | null>`MAX(${tabla.fecha})` }).from(tabla).get()?.m ?? null;
  const fechas = [maximo(aggHoraServicio), maximo(aggSesionUsuario), maximo(aggCierresCampania)];
  if (fechas.some((f) => f == null)) return null;
  return (fechas as string[]).sort()[0];
}

// ---------- Agregados: escritura ----------

function fueraDeRango(fechas: readonly string[], desde: string, hasta: string) {
  const fuera = fechas.find((f) => f < desde || f > hasta);
  if (fuera) throw new Error(`Fila fuera del rango ${desde}..${hasta}: ${fuera}`);
}

export function reemplazarDemanda(desde: string, hasta: string, filas: readonly DemandaFranja[]): void {
  fueraDeRango(filas.map((f) => f.fecha), desde, hasta);
  db.transaction((tx) => {
    tx.delete(aggHoraServicio).where(and(gte(aggHoraServicio.fecha, desde), lte(aggHoraServicio.fecha, hasta))).run();
    for (const f of filas) tx.insert(aggHoraServicio).values(f).run();
  });
}

export function reemplazarSesiones(desde: string, hasta: string, filas: readonly IslaSesion[]): void {
  fueraDeRango(filas.map((f) => f.fecha), desde, hasta);
  db.transaction((tx) => {
    tx.delete(aggSesionUsuario).where(and(gte(aggSesionUsuario.fecha, desde), lte(aggSesionUsuario.fecha, hasta))).run();
    for (const f of filas) tx.insert(aggSesionUsuario).values(f).run();
  });
}

export function reemplazarCierres(desde: string, hasta: string, filas: readonly CierresDia[]): void {
  fueraDeRango(filas.map((f) => f.fecha), desde, hasta);
  db.transaction((tx) => {
    tx.delete(aggCierresCampania)
      .where(and(gte(aggCierresCampania.fecha, desde), lte(aggCierresCampania.fecha, hasta)))
      .run();
    for (const f of filas) tx.insert(aggCierresCampania).values(f).run();
  });
}

/** Guarda (reemplaza) la foto de listas de un día. */
export function guardarFotoListas(fecha: string, filas: readonly EstadoLista[]): void {
  db.transaction((tx) => {
    tx.delete(planListasEstado).where(eq(planListasEstado.fecha, fecha)).run();
    for (const f of filas) tx.insert(planListasEstado).values({ fecha, ...f }).run();
  });
}

/**
 * Sincroniza usuarios de Altitude con plan_agente_usuarios y crea los agentes
 * que falten (fuera de plantilla: supervisión decide si entran). El cliente
 * se resuelve con los prefijos actuales y la última sesión sale de los
 * agregados. No borra usuarios que ya no estén en Altitude.
 */
export function sincronizarUsuarios(usuarios: readonly UsuarioAgenteRdb[]): { usuarios: number; agentesNuevos: number } {
  const prefijos = leerPrefijos();
  const ultimas = ultimaSesionPorUsuario("9999-12-31");
  const ahora = new Date();
  let agentesNuevos = 0;
  let total = 0;
  db.transaction((tx) => {
    const existentes = new Set(tx.select({ n: planAgentes.numero }).from(planAgentes).all().map((a) => a.n));
    for (const u of usuarios) {
      const p = parsearUsuario(u.usrName);
      if (!p) continue;
      if (!existentes.has(p.numero)) {
        tx.insert(planAgentes).values({ numero: p.numero, enPlantilla: false }).run();
        existentes.add(p.numero);
        agentesNuevos++;
      }
      const valores = {
        agenteNumero: p.numero,
        altitudeCode: u.altitudeCode,
        prefijo: p.prefijo,
        sufijo: p.sufijo,
        clienteCodigo: resolverCliente(p.prefijo, p.sufijo, prefijos),
        fullname: u.fullname,
        ultimaSesion: ultimas.get(p.usrName) ?? null,
        sincronizadoAt: ahora,
      };
      tx.insert(planAgenteUsuarios)
        .values({ usrName: p.usrName, ...valores })
        .onConflictDoUpdate({ target: planAgenteUsuarios.usrName, set: valores })
        .run();
      total++;
    }
  });
  return { usuarios: total, agentesNuevos };
}

// ---------- Versiones ----------

/**
 * Crea el borrador de un mes con los bloques del motor. Como mucho hay un
 * borrador por mes: si ya existe, `reemplazar` lo descarta (queda como
 * «descartada») y si no, error. Todo en una transacción; el índice único
 * parcial de la tabla lo refuerza.
 */
export function crearBorrador(opciones: {
  mes: string;
  entrada: EntradaMotor;
  salida: SalidaMotor;
  autor: string;
  origen?: "motor" | "copia" | "recalculo";
  basadaEnId?: number | null;
  reemplazar?: boolean;
}): { id: number; numero: number } {
  return db.transaction((tx) => {
    const existente = tx
      .select()
      .from(planVersiones)
      .where(and(eq(planVersiones.mes, opciones.mes), eq(planVersiones.estado, "borrador")))
      .get();
    if (existente) {
      if (!opciones.reemplazar) throw new Error(`Ya hay un borrador de ${opciones.mes} (v${existente.numero})`);
      tx.update(planVersiones).set({ estado: "descartada" }).where(eq(planVersiones.id, existente.id)).run();
    }
    const ultimo = tx
      .select({ n: sql<number | null>`MAX(${planVersiones.numero})` })
      .from(planVersiones)
      .where(eq(planVersiones.mes, opciones.mes))
      .get();
    const numero = (ultimo?.n ?? 0) + 1;
    const { id } = tx
      .insert(planVersiones)
      .values({
        mes: opciones.mes,
        numero,
        estado: "borrador",
        origen: opciones.origen ?? "motor",
        basadaEnId: opciones.basadaEnId ?? null,
        entradas: opciones.entrada,
        avisos: opciones.salida.avisos,
        resumen: opciones.salida.resumen,
        creadaPor: opciones.autor,
      })
      .returning({ id: planVersiones.id })
      .get();
    for (const b of opciones.salida.bloques) {
      tx.insert(planBloques)
        .values({
          versionId: id,
          agenteNumero: b.agenteNumero,
          fecha: b.fecha,
          inicioMin: b.inicioMin,
          finMin: b.finMin,
          clienteCodigo: b.clienteCodigo,
          origen: b.regla === "manual" ? "manual" : "motor",
          fijado: b.fijado,
          regla: b.regla,
          datos: b.datos,
        })
        .run();
    }
    return { id, numero };
  });
}

export function versionesMes(mes: string) {
  return db.select().from(planVersiones).where(eq(planVersiones.mes, mes)).orderBy(desc(planVersiones.numero)).all();
}
