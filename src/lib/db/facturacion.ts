import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "./sqlite";
import {
  auditLog,
  campaniasGs,
  ddis,
  facturacionCargos,
  facturacionCierreAjustes,
  facturacionCierreLineas,
  facturacionCierres,
  type TipoAjusteCierre,
  type UnidadCargo,
} from "./schema";
import type { DdiFechas } from "@/lib/ddis";
import { guardarAjuste, obtenerAjuste } from "./settings";
import {
  aplicarAjustes,
  importeVigente,
  type AjusteLinea,
  type CargoPuntual,
  type LineaCierre,
  type LineaCierreAjustada,
} from "@/lib/facturacion-campania";

// ============================================================
// Acceso a SQLite de los maestros y cierres de facturación (14/10/2026):
// inventario de DDIs, códigos de campaña en GS y cierres de mes. Los edita
// el rol operaciones (Server Actions de /operaciones) y se auditan allí;
// la importación del Excel deja su propia entrada en audit_log.
// ============================================================

export type DdiRow = typeof ddis.$inferSelect;
export type CargoRow = typeof facturacionCargos.$inferSelect;
export type CampaniaGsRow = typeof campaniasGs.$inferSelect;
export type CierreRow = typeof facturacionCierres.$inferSelect;
export type CierreLineaRow = typeof facturacionCierreLineas.$inferSelect;

/** Todo el inventario de DDIs, por campaña y número. */
export function listarDdis(): DdiRow[] {
  return db.select().from(ddis).orderBy(asc(ddis.campaignShortname), asc(ddis.numero)).all();
}

/** Fechas de los DDIs de unas campañas (todas si no se indican), para la cuota. */
export function ddisParaFacturar(campanias?: string[]): DdiFechas[] {
  const q = db
    .select({
      numero: ddis.numero,
      campaignShortname: ddis.campaignShortname,
      fechaAlta: ddis.fechaAlta,
      fechaBaja: ddis.fechaBaja,
    })
    .from(ddis);
  if (!campanias) return q.all();
  if (campanias.length === 0) return [];
  return q.where(inArray(ddis.campaignShortname, campanias)).all();
}

// ------------------------------------------------------------
// Cargos puntuales (base de datos, preparación de campaña; 19/10/2026)
// ------------------------------------------------------------

/** Cargos de los meses [desdeMes, hastaMes] (YYYY-MM), de un cliente o de todos. */
export function listarCargos(desdeMes: string, hastaMes: string, servicio?: string): CargoRow[] {
  const condiciones = [gte(facturacionCargos.mes, desdeMes), lte(facturacionCargos.mes, hastaMes)];
  if (servicio) condiciones.push(eq(facturacionCargos.servicio, servicio));
  return db
    .select()
    .from(facturacionCargos)
    .where(and(...condiciones))
    .orderBy(asc(facturacionCargos.mes), asc(facturacionCargos.campaignShortname), asc(facturacionCargos.id))
    .all();
}

/** Cargos de los meses que toca el rango, para la factura (campañas del alcance o todas). */
export function cargosParaFacturar(desdeISO: string, hastaISO: string, campanias?: string[]): CargoPuntual[] {
  const filas = listarCargos(desdeISO.slice(0, 7), hastaISO.slice(0, 7));
  const dentro = campanias ? new Set(campanias) : null;
  return filas
    .filter((c) => !dentro || dentro.has(c.campaignShortname))
    .map((c) => ({
      campania: c.campaignShortname,
      unidad: c.unidad,
      cantidad: c.cantidad,
      precioUnitario: c.precioUnitario,
      concepto: c.concepto,
    }));
}

export function crearCargo(datos: {
  mes: string;
  servicio: string;
  campania: string;
  unidad: UnidadCargo;
  cantidad: number;
  precioUnitario: number | null;
  concepto: string;
  autor: string;
}): number {
  const r = db
    .insert(facturacionCargos)
    .values({
      mes: datos.mes,
      servicio: datos.servicio,
      campaignShortname: datos.campania,
      unidad: datos.unidad,
      cantidad: datos.cantidad,
      precioUnitario: datos.precioUnitario,
      concepto: datos.concepto,
      creadoPor: datos.autor,
    })
    .returning({ id: facturacionCargos.id })
    .get();
  return r.id;
}

export function obtenerCargo(id: number): CargoRow | undefined {
  return db.select().from(facturacionCargos).where(eq(facturacionCargos.id, id)).get();
}

export function borrarCargo(id: number): void {
  db.delete(facturacionCargos).where(eq(facturacionCargos.id, id)).run();
}

export function listarCampaniasGs(): CampaniaGsRow[] {
  return db.select().from(campaniasGs).orderBy(asc(campaniasGs.campaignShortname)).all();
}

/** shortname → código de GS. */
export function mapaCodigosGs(): Map<string, string> {
  return new Map(listarCampaniasGs().map((c) => [c.campaignShortname, c.codigoGs]));
}

// ---------- Prefijos que no cuentan para el reparto de horas ----------

/** Clave en app_settings de la lista de un cliente (sin migración: es una lista corta). */
const clavePrefijos = (servicio: string) => `facturacion.prefijosExcluidosReparto.${servicio}`;

/**
 * Prefijos (4 primeros caracteres del número marcado) cuyo tiempo de agente
 * no cuenta para repartir las horas logadas del cliente por campaña: el
 * segmentador del Excel de operaciones, replicado el 15/10/2026.
 */
export function prefijosExcluidosReparto(servicio: string): string[] {
  try {
    const lista = JSON.parse(obtenerAjuste(clavePrefijos(servicio), "[]"));
    return Array.isArray(lista) ? lista.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function guardarPrefijosExcluidosReparto(servicio: string, prefijos: string[]): void {
  guardarAjuste(clavePrefijos(servicio), JSON.stringify(prefijos));
}

// ---------- Cierres de mes ----------

/** El cierre vigente («cerrado») de un mes y servicio, si lo hay. */
export function cierreVigente(mes: string, servicio: string): CierreRow | undefined {
  return db
    .select()
    .from(facturacionCierres)
    .where(
      and(
        eq(facturacionCierres.mes, mes),
        eq(facturacionCierres.servicio, servicio),
        eq(facturacionCierres.estado, "cerrado"),
      ),
    )
    .get();
}

/** Cierres vigentes, del más reciente al más antiguo (para el histórico). */
export function listarCierresVigentes(): CierreRow[] {
  return db
    .select()
    .from(facturacionCierres)
    .where(eq(facturacionCierres.estado, "cerrado"))
    .orderBy(desc(facturacionCierres.mes), asc(facturacionCierres.servicio))
    .all();
}

export function lineasDeCierres(ids: number[]): CierreLineaRow[] {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(facturacionCierreLineas)
    .where(inArray(facturacionCierreLineas.cierreId, ids))
    .orderBy(asc(facturacionCierreLineas.campania), asc(facturacionCierreLineas.unidad))
    .all();
}

/**
 * Guarda un cierre con sus líneas en una transacción. Falla (índice único
 * parcial) si ya hay uno «cerrado» de ese mes y servicio.
 */
export function guardarCierre(datos: {
  mes: string;
  servicio: string;
  origen: "dashboard" | "importado";
  cerradoPor: string;
  notas?: string | null;
  lineas: LineaCierre[];
}): number {
  return db.transaction((tx) => {
    const importeTotal =
      Math.round(datos.lineas.reduce((a, l) => a + (l.importe ?? 0), 0) * 100) / 100;
    const { id } = tx
      .insert(facturacionCierres)
      .values({
        mes: datos.mes,
        servicio: datos.servicio,
        estado: "cerrado",
        origen: datos.origen,
        importeTotal,
        cerradoPor: datos.cerradoPor,
        notas: datos.notas ?? null,
      })
      .returning({ id: facturacionCierres.id })
      .get();
    for (const l of datos.lineas) {
      tx.insert(facturacionCierreLineas).values({ cierreId: id, ...l }).run();
    }
    return id;
  });
}

/** Reabre (solo admin): el cierre queda como histórico «reabierto». */
export function reabrirCierre(id: number, usuario: string): boolean {
  const r = db
    .update(facturacionCierres)
    .set({ estado: "reabierto", reabiertoPor: usuario, reabiertoAt: new Date() })
    .where(and(eq(facturacionCierres.id, id), eq(facturacionCierres.estado, "cerrado")))
    .run();
  return r.changes > 0;
}

// ---------- Ajustes manuales de un mes cerrado ----------

function ajustesDe(ids: number[]): AjusteLinea[] {
  if (ids.length === 0) return [];
  return db
    .select({
      id: facturacionCierreAjustes.id,
      lineaId: facturacionCierreAjustes.lineaId,
      tipo: facturacionCierreAjustes.tipo,
      precioNuevo: facturacionCierreAjustes.precioNuevo,
      motivo: facturacionCierreAjustes.motivo,
      autor: facturacionCierreAjustes.autor,
    })
    .from(facturacionCierreAjustes)
    .where(inArray(facturacionCierreAjustes.cierreId, ids))
    .all();
}

/**
 * Líneas de unos cierres con sus ajustes manuales aplicados. Es lo que se
 * enseña, se exporta y va al fichero de GS (las quitadas, marcadas).
 */
export function lineasAjustadas(ids: number[]): LineaCierreAjustada[] {
  return aplicarAjustes(lineasDeCierres(ids), ajustesDe(ids));
}

/** Vuelve a calcular el total de un cierre con sus ajustes. */
function recalcularTotal(tx: Pick<typeof db, "select" | "update">, cierreId: number): number {
  const lineas = tx.select().from(facturacionCierreLineas).where(eq(facturacionCierreLineas.cierreId, cierreId)).all();
  const ajustes = tx
    .select()
    .from(facturacionCierreAjustes)
    .where(eq(facturacionCierreAjustes.cierreId, cierreId))
    .all();
  const total = importeVigente(aplicarAjustes(lineas, ajustes));
  tx.update(facturacionCierres).set({ importeTotal: total }).where(eq(facturacionCierres.id, cierreId)).run();
  return total;
}

/**
 * Ajusta líneas de un cierre VIGENTE (quitar o cambiar el precio), con
 * motivo. Si una línea ya tenía ajuste, lo sustituye. Devuelve el total
 * nuevo del cierre, o null si el cierre no está cerrado o alguna línea no es
 * suya.
 */
export function ajustarLineas(
  cierreId: number,
  lineaIds: number[],
  ajuste: { tipo: TipoAjusteCierre; precioNuevo: number | null; motivo: string },
  autor: string,
): number | null {
  return db.transaction((tx) => {
    const cierre = tx.select().from(facturacionCierres).where(eq(facturacionCierres.id, cierreId)).get();
    if (!cierre || cierre.estado !== "cerrado" || lineaIds.length === 0) return null;
    const propias = tx
      .select({ id: facturacionCierreLineas.id })
      .from(facturacionCierreLineas)
      .where(and(eq(facturacionCierreLineas.cierreId, cierreId), inArray(facturacionCierreLineas.id, lineaIds)))
      .all();
    if (propias.length !== new Set(lineaIds).size) return null;
    tx.delete(facturacionCierreAjustes).where(inArray(facturacionCierreAjustes.lineaId, lineaIds)).run();
    for (const lineaId of new Set(lineaIds)) {
      tx.insert(facturacionCierreAjustes)
        .values({
          cierreId,
          lineaId,
          tipo: ajuste.tipo,
          precioNuevo: ajuste.tipo === "precio" ? ajuste.precioNuevo : null,
          motivo: ajuste.motivo,
          autor,
        })
        .run();
    }
    return recalcularTotal(tx, cierreId);
  });
}

/** Deshace un ajuste de un cierre vigente. Devuelve el cierre afectado, o null. */
export function deshacerAjuste(ajusteId: number): { cierreId: number; total: number } | null {
  return db.transaction((tx) => {
    const ajuste = tx.select().from(facturacionCierreAjustes).where(eq(facturacionCierreAjustes.id, ajusteId)).get();
    if (!ajuste) return null;
    const cierre = tx.select().from(facturacionCierres).where(eq(facturacionCierres.id, ajuste.cierreId)).get();
    if (cierre?.estado !== "cerrado") return null;
    tx.delete(facturacionCierreAjustes).where(eq(facturacionCierreAjustes.id, ajusteId)).run();
    return { cierreId: ajuste.cierreId, total: recalcularTotal(tx, ajuste.cierreId) };
  });
}

// ---------- Importación del Excel de operaciones (scripts/facturacion-importar-excel.ts) ----------

type NuevaDdi = Omit<typeof ddis.$inferInsert, "id" | "actualizadoPor" | "actualizadoAt">;
type NuevaCampaniaGs = Omit<typeof campaniasGs.$inferInsert, "id" | "actualizadoPor" | "actualizadoAt">;

/**
 * Carga el inventario de DDIs. Con `reemplazar`, borra antes el que haya; sin
 * él, se niega si ya hay alguno (para no duplicar). Queda en audit_log.
 */
export function importarDdis(filas: readonly NuevaDdi[], reemplazar: boolean, autor: string): number {
  return db.transaction((tx) => {
    const previos = tx.select({ id: ddis.id }).from(ddis).all().length;
    if (previos > 0 && !reemplazar) {
      throw new Error(`Ya hay ${previos} DDIs dados de alta: usa --reemplazar para sustituirlos`);
    }
    if (reemplazar) tx.delete(ddis).run();
    for (const f of filas) tx.insert(ddis).values({ ...f, actualizadoPor: autor }).run();
    tx.insert(auditLog)
      .values({ accion: "facturacion_maestros", username: autor, detalle: `ddis importados: ${filas.length} (antes ${previos})` })
      .run();
    return previos;
  });
}

/** Lo mismo con los códigos de GS. */
export function importarCampaniasGs(filas: readonly NuevaCampaniaGs[], reemplazar: boolean, autor: string): number {
  return db.transaction((tx) => {
    const previos = tx.select({ id: campaniasGs.id }).from(campaniasGs).all().length;
    if (previos > 0 && !reemplazar) {
      throw new Error(`Ya hay ${previos} códigos de GS: usa --reemplazar para sustituirlos`);
    }
    if (reemplazar) tx.delete(campaniasGs).run();
    for (const f of filas) tx.insert(campaniasGs).values({ ...f, actualizadoPor: autor }).run();
    tx.insert(auditLog)
      .values({ accion: "facturacion_maestros", username: autor, detalle: `códigos GS importados: ${filas.length} (antes ${previos})` })
      .run();
    return previos;
  });
}

/**
 * Guarda un mes del histórico del Excel como cierre «importado». Nunca toca
 * un mes que se cerró desde el dashboard; uno ya importado solo se sustituye
 * con `reemplazar`.
 */
export function importarCierreExcel(
  mes: string,
  servicio: string,
  lineas: readonly LineaCierre[],
  reemplazar: boolean,
): "creado" | "reemplazado" | "ya_importado" | "cerrado_en_dashboard" {
  return db.transaction((tx) => {
    const previo = tx
      .select()
      .from(facturacionCierres)
      .where(
        and(
          eq(facturacionCierres.mes, mes),
          eq(facturacionCierres.servicio, servicio),
          eq(facturacionCierres.estado, "cerrado"),
        ),
      )
      .get();
    if (previo?.origen === "dashboard") return "cerrado_en_dashboard";
    if (previo && !reemplazar) return "ya_importado";
    if (previo) tx.delete(facturacionCierres).where(eq(facturacionCierres.id, previo.id)).run();
    const importeTotal = Math.round(lineas.reduce((a, l) => a + (l.importe ?? 0), 0) * 100) / 100;
    const { id } = tx
      .insert(facturacionCierres)
      .values({
        mes,
        servicio,
        estado: "cerrado",
        origen: "importado",
        importeTotal,
        cerradoPor: "Excel de operaciones",
        notas: "Importado de «facturacion cerrada»",
      })
      .returning({ id: facturacionCierres.id })
      .get();
    for (const l of lineas) tx.insert(facturacionCierreLineas).values({ cierreId: id, ...l }).run();
    tx.insert(auditLog)
      .values({ accion: "facturacion_cierre", username: "Excel de operaciones", detalle: `cierre importado ${mes} ${servicio}: ${lineas.length} líneas, ${importeTotal} €` })
      .run();
    return previo ? "reemplazado" : "creado";
  });
}
