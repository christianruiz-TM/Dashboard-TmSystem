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
  /**
   * Borrador que se espera encontrar (id, o null = ninguno). Si al guardar
   * hay otro (alguien generó mientras tanto), error en vez de descartarlo.
   */
  esperado?: number | null;
}): { id: number; numero: number } {
  return db.transaction((tx) => {
    const existente = tx
      .select()
      .from(planVersiones)
      .where(and(eq(planVersiones.mes, opciones.mes), eq(planVersiones.estado, "borrador")))
      .get();
    if (opciones.esperado !== undefined && (existente?.id ?? null) !== opciones.esperado) {
      throw new Error(
        `El borrador de ${opciones.mes} ha cambiado mientras se generaba (otra persona lo ha regenerado); vuelve a intentarlo`,
      );
    }
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

/** Todas las versiones sin la foto de la entrada (la lista de meses no la necesita). */
export function listarVersiones() {
  return db
    .select({
      id: planVersiones.id,
      mes: planVersiones.mes,
      numero: planVersiones.numero,
      estado: planVersiones.estado,
      origen: planVersiones.origen,
      avisos: planVersiones.avisos,
      resumen: planVersiones.resumen,
      creadaPor: planVersiones.creadaPor,
      creadaAt: planVersiones.creadaAt,
      publicadaPor: planVersiones.publicadaPor,
      publicadaAt: planVersiones.publicadaAt,
    })
    .from(planVersiones)
    .orderBy(desc(planVersiones.mes), desc(planVersiones.numero))
    .all();
}

export function borradorMes(mes: string) {
  return db
    .select()
    .from(planVersiones)
    .where(and(eq(planVersiones.mes, mes), eq(planVersiones.estado, "borrador")))
    .get();
}

export function bloquesVersion(versionId: number) {
  return db
    .select()
    .from(planBloques)
    .where(eq(planBloques.versionId, versionId))
    .orderBy(asc(planBloques.agenteNumero), asc(planBloques.fecha), asc(planBloques.inicioMin))
    .all();
}

/** Bloques que «regenerar respetando mis cambios» conserva: fijados o editados a mano. */
export function bloquesConservables(versionId: number) {
  return bloquesVersion(versionId).filter((b) => b.fijado || b.origen === "manual");
}

// ---------- Configuración: escritura (supervisión, desde /planificacion/configuracion) ----------

type NuevoCliente = Omit<typeof planClientes.$inferInsert, "id">;
/** Transacción de drizzle (mismas consultas que db). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function crearCliente(valores: NuevoCliente): void {
  db.insert(planClientes).values(valores).run();
}

/** El código no cambia: lo usan los bloques, los prefijos y las bolsas. */
export function actualizarCliente(id: number, cambios: Omit<NuevoCliente, "codigo">): void {
  db.update(planClientes).set(cambios).where(eq(planClientes.id, id)).run();
}

export function leerClientesTodos() {
  return db.select().from(planClientes).orderBy(asc(planClientes.orden), asc(planClientes.codigo)).all();
}

/**
 * Tras cambiar los prefijos, rehace el cliente guardado de cada usuario
 * (el cargador ya lo resuelve en vivo; esto mantiene la tabla coherente).
 */
function recalcularClientesUsuarios(tx: Tx): void {
  const prefijos = tx.select().from(planPrefijos).all();
  for (const u of tx.select().from(planAgenteUsuarios).all()) {
    const cliente = resolverCliente(u.prefijo, u.sufijo, prefijos);
    if (cliente !== u.clienteCodigo) {
      tx.update(planAgenteUsuarios).set({ clienteCodigo: cliente }).where(eq(planAgenteUsuarios.usrName, u.usrName)).run();
    }
  }
}

export function guardarPrefijo(valores: { prefijo: string; sufijo: string; clienteCodigo: string }): void {
  db.transaction((tx) => {
    tx.insert(planPrefijos)
      .values(valores)
      .onConflictDoUpdate({ target: [planPrefijos.prefijo, planPrefijos.sufijo], set: { clienteCodigo: valores.clienteCodigo } })
      .run();
    recalcularClientesUsuarios(tx);
  });
}

export function borrarPrefijo(id: number) {
  return db.transaction((tx) => {
    const fila = tx.select().from(planPrefijos).where(eq(planPrefijos.id, id)).get();
    if (fila) {
      tx.delete(planPrefijos).where(eq(planPrefijos.id, id)).run();
      recalcularClientesUsuarios(tx);
    }
    return fila ?? null;
  });
}

export function guardarAgente(
  numero: string,
  valores: Pick<
    typeof planAgentes.$inferInsert,
    "alias" | "contratoSemanalH" | "enPlantilla" | "equipo" | "forzarActivo" | "notas"
  >,
): boolean {
  const r = db
    .update(planAgentes)
    .set({ ...valores, actualizadoAt: new Date() })
    .where(eq(planAgentes.numero, numero))
    .run();
  return r.changes > 0;
}

/** Crea o actualiza un patrón con sus tramos (los reemplaza enteros). Devuelve el id. */
export function guardarPatron(valores: {
  id?: number;
  nombre: string;
  activo: boolean;
  tramos: readonly { diaSemana: number; inicioMin: number; finMin: number }[];
}): number {
  return db.transaction((tx) => {
    let id = valores.id;
    if (id == null) {
      id = tx.insert(planPatrones).values({ nombre: valores.nombre, activo: valores.activo }).returning({ id: planPatrones.id }).get().id;
    } else {
      tx.update(planPatrones).set({ nombre: valores.nombre, activo: valores.activo }).where(eq(planPatrones.id, id)).run();
      tx.delete(planPatronTramos).where(eq(planPatronTramos.patronId, id)).run();
    }
    for (const t of valores.tramos) tx.insert(planPatronTramos).values({ patronId: id, ...t }).run();
    return id;
  });
}

/**
 * Asigna el turno A/B de un agente desde una fecha. Si ya hay una asignación
 * que empieza ese mismo día, se sustituye; si no, se añade (gana la de
 * `desde` más reciente, ver expandirTurnos).
 */
export function asignarTurno(valores: {
  agenteNumero: string;
  patronAId: number | null;
  patronBId: number | null;
  desde: string;
  hasta: string | null;
}): void {
  db.transaction((tx) => {
    const existente = tx
      .select()
      .from(planAgenteTurnos)
      .where(and(eq(planAgenteTurnos.agenteNumero, valores.agenteNumero), eq(planAgenteTurnos.desde, valores.desde)))
      .get();
    if (existente) tx.update(planAgenteTurnos).set(valores).where(eq(planAgenteTurnos.id, existente.id)).run();
    else tx.insert(planAgenteTurnos).values(valores).run();
  });
}

export function guardarTipoAusencia(valores: typeof planTiposAusencia.$inferInsert, crear: boolean): void {
  if (crear) db.insert(planTiposAusencia).values(valores).run();
  else {
    const { codigo, ...cambios } = valores;
    db.update(planTiposAusencia).set(cambios).where(eq(planTiposAusencia.codigo, codigo)).run();
  }
}

/** Islas de sesión de todos los usuarios en el rango (para «Aprender patrones»). */
export function sesionesRango(desde: string, hasta: string) {
  return db
    .select({
      usrName: aggSesionUsuario.usrName,
      fecha: aggSesionUsuario.fecha,
      inicioSeg: aggSesionUsuario.inicioSeg,
      finSeg: aggSesionUsuario.finSeg,
    })
    .from(aggSesionUsuario)
    .where(and(gte(aggSesionUsuario.fecha, desde), lte(aggSesionUsuario.fecha, hasta)))
    .all();
}
