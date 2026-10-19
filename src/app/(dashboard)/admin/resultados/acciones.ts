"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRol } from "@/lib/auth/rbac";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { db } from "@/lib/db/sqlite";
import { objetivosResultados, resultadosConfig } from "@/lib/db/schema";
import { esquemaFechaISO } from "@/lib/fechas";
import { guardarCampoContacto, guardarTiposCampania } from "@/lib/db/resultados";
import {
  MAX_NIVELES,
  esquemaCampoContacto,
  escribirTiposCampania,
  leerTiposCampania,
} from "@/lib/resultados-actividad";
import {
  campoContactoValido,
  directoriosServicio,
  tablasResultados,
} from "@/lib/rdb/queries/resultados-actividad";

// ============================================================
// Server Actions de Administración → Resultados (regla 18). Solo admin;
// todo cambio queda en audit_log (config_resultados). Las tablas y
// columnas se validan contra RDBv2 (lista blanca de tablasResultados).
// ============================================================

function volver(servicio: string | null, msg: string): never {
  revalidatePath("/admin/resultados");
  revalidatePath("/supervision");
  const p = new URLSearchParams({ msg });
  if (servicio) p.set("servicio", servicio);
  redirect(`/admin/resultados?${p.toString()}`);
}

async function auditar(usuario: { id: number; username: string }, detalle: string) {
  registrarAuditoria({
    accion: "config_resultados",
    userId: usuario.id,
    username: usuario.username,
    detalle,
    ip: await ipPeticion(),
  });
}

/** Tabla y columnas (niveles del desglose, en orden) de un servicio. */
export async function guardarColumnasResultados(formData: FormData): Promise<void> {
  const admin = await requireRol(); // solo admin
  const servicio = String(formData.get("servicio") ?? "");
  const tabla = String(formData.get("tabla") ?? "");
  const niveles = Array.from({ length: MAX_NIVELES }, (_, i) => String(formData.get(`nivel${i + 1}`) ?? ""));
  // Sin huecos: el nivel 2 solo con el 1, el 3 solo con el 2
  const hueco = niveles.findIndex((n) => !n);
  const columnas = hueco === -1 ? niveles : niveles.slice(0, hueco);
  if (hueco !== -1 && niveles.slice(hueco).some(Boolean)) volver(servicio, "error_resultados");

  const t = (await tablasResultados()).find((x) => x.servicio === servicio && x.tabla === tabla);
  if (!t || columnas.length === 0 || new Set(columnas).size !== columnas.length) {
    volver(servicio, "error_resultados");
  }
  if (!columnas.every((c) => t!.columnas.includes(c))) volver(servicio, "error_resultados");

  const actual = db.select().from(resultadosConfig).where(eq(resultadosConfig.serviceName, servicio)).get();
  if (actual) {
    db.update(resultadosConfig)
      .set({
        tablaAo: tabla,
        columnas,
        // Los códigos son de la tabla: si cambia, los no válidos empiezan de cero
        codigosNoValidos: actual.tablaAo === tabla ? actual.codigosNoValidos : [],
        actualizadoAt: new Date(),
      })
      .where(eq(resultadosConfig.id, actual.id))
      .run();
  } else {
    db.insert(resultadosConfig).values({ serviceName: servicio, tablaAo: tabla, columnas }).run();
  }
  await auditar(admin, `${servicio}: ${tabla} [${columnas.join(" → ")}]`);
  volver(servicio, "guardado");
}

/** Valores que cuentan como «no válido» (códigos de ph_table_schema_enum_value). */
export async function guardarNoValidos(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const servicio = String(formData.get("servicio") ?? "");
  const codigos = z
    .array(z.coerce.number().int())
    .safeParse(formData.getAll("nv").map(String));
  const actual = db.select().from(resultadosConfig).where(eq(resultadosConfig.serviceName, servicio)).get();
  if (!codigos.success || !actual) volver(servicio, "error_datos");
  const unicos = [...new Set(codigos.data)].sort((a, b) => a - b);
  db.update(resultadosConfig)
    .set({ codigosNoValidos: unicos, actualizadoAt: new Date() })
    .where(eq(resultadosConfig.id, actual!.id))
    .run();
  await auditar(admin, `${servicio}: no válidos [${unicos.join(", ")}]`);
  volver(servicio, "guardado");
}

/**
 * Tipos de campaña de un servicio («BBDD: gh[_]bbdd[_]%», uno por línea), para
 * separar los resultados en Supervisión. Vacío = sin tipos.
 */
export async function guardarTiposCampaniaAccion(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const servicio = String(formData.get("servicio") ?? "");
  const tipos = leerTiposCampania(String(formData.get("tipos") ?? ""));
  if (!servicio || !tipos) volver(servicio || null, "error_tipos");
  guardarTiposCampania(servicio, tipos!);
  await auditar(admin, `${servicio}: tipos de campaña [${escribirTiposCampania(tipos!).replace(/\n/g, " | ")}]`);
  volver(servicio, "guardado");
}

/**
 * Campo del contacto por el que se filtra Resultados (GH: dir_fdlt_origen).
 * `campo` = «tabla|columna» de la lista blanca (directoriosServicio) o vacío
 * para quitarlo.
 */
export async function guardarCampoContactoAccion(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const servicio = String(formData.get("servicio") ?? "");
  const [tabla, columna] = String(formData.get("campo") ?? "").split("|");
  if (!servicio) volver(null, "error_campo");
  if (!tabla) {
    guardarCampoContacto(servicio, null);
    await auditar(admin, `${servicio}: sin campo de filtro del contacto`);
    volver(servicio, "guardado");
  }
  // Sin nombre, el de la columna sin el prefijo del directorio («dir_fdlt_origen» → «Origen»)
  const porDefecto = (columna ?? "").replace(/^dir_(fdlt_)?/i, "").replace(/_/g, " ");
  const etiqueta =
    String(formData.get("etiqueta") ?? "").trim() || porDefecto.charAt(0).toUpperCase() + porDefecto.slice(1);
  const r = esquemaCampoContacto.safeParse({ tabla, columna, etiqueta });
  if (!r.success || !campoContactoValido(servicio, r.data, await directoriosServicio())) {
    volver(servicio, "error_campo");
  }
  guardarCampoContacto(servicio, r.data!);
  await auditar(admin, `${servicio}: campo de filtro del contacto ${tabla}.${columna} («${r.data!.etiqueta}»)`);
  volver(servicio, "guardado");
}

export async function borrarConfigResultados(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const servicio = String(formData.get("servicio") ?? "");
  db.delete(resultadosConfig).where(eq(resultadosConfig.serviceName, servicio)).run();
  await auditar(admin, `-${servicio}`);
  volver(null, "borrado");
}

const porcentaje = z.coerce.number().min(0).max(100).nullable().catch(null);

const esquemaObjetivo = z
  .object({
    objetivo: z.string().regex(/^(svc|camp):.+$/),
    brutoMin: porcentaje,
    netoMin: porcentaje,
    maxPctNoValidos: porcentaje,
    desde: esquemaFechaISO,
    hasta: esquemaFechaISO.nullable(),
    notas: z.string().trim().max(300).nullable().catch(null),
  })
  .refine((o) => o.brutoMin != null || o.netoMin != null || o.maxPctNoValidos != null)
  .refine((o) => o.hasta == null || o.hasta >= o.desde);

export async function crearObjetivoResultados(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const vacioANull = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const datos = esquemaObjetivo.safeParse({
    objetivo: formData.get("objetivo"),
    brutoMin: vacioANull("brutoMin"),
    netoMin: vacioANull("netoMin"),
    maxPctNoValidos: vacioANull("maxPctNoValidos"),
    desde: vacioANull("desde"),
    hasta: vacioANull("hasta"),
    notas: vacioANull("notas"),
  });
  if (!datos.success) volver(null, "error_objetivo");
  const o = datos.data;
  const esServicio = o.objetivo.startsWith("svc:");
  const nombre = o.objetivo.slice(o.objetivo.indexOf(":") + 1);
  db.insert(objetivosResultados)
    .values({
      serviceName: esServicio ? nombre : null,
      campaignShortname: esServicio ? null : nombre,
      brutoMin: o.brutoMin,
      netoMin: o.netoMin,
      maxPctNoValidos: o.maxPctNoValidos,
      desde: o.desde,
      hasta: o.hasta,
      notas: o.notas,
    })
    .run();
  await auditar(
    admin,
    `+objetivo ${esServicio ? "servicio" : "campaña"} ${nombre}: bruto ≥ ${o.brutoMin ?? "—"}, ` +
      `neto ≥ ${o.netoMin ?? "—"}, no válidos ≤ ${o.maxPctNoValidos ?? "—"} (${o.desde} a ${o.hasta ?? "∞"})`,
  );
  volver(null, "creado");
}

export async function borrarObjetivoResultados(formData: FormData): Promise<void> {
  const admin = await requireRol();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) volver(null, "error_datos");
  db.delete(objetivosResultados).where(eq(objetivosResultados.id, id)).run();
  await auditar(admin, `-objetivo ${id}`);
  volver(null, "borrado");
}
