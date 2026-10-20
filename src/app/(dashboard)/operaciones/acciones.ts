"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/sqlite";
import {
  billingConfig,
  campaniasGs,
  ddis,
  ESTADOS_DDI,
  UNIDADES_CARGO,
  UNIDADES_FACTURACION,
} from "@/lib/db/schema";
import { ROLES_OPERACIONES_EDICION, requireRol } from "@/lib/auth/rbac";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import {
  ajustarLineas,
  borrarCargo,
  cierreVigente,
  crearCargo,
  obtenerCargo,
  deshacerAjuste,
  guardarCierre,
  guardarPrefijosExcluidosReparto,
  lineasAjustadas,
  prefijosExcluidosReparto,
  reabrirCierre,
} from "@/lib/db/facturacion";
import { PATRON_PREFIJO_USUARIO, leerPrefijosExcluidos } from "@/lib/facturacion-horas-logadas";
import { mesesDelRango, seSolapan } from "@/lib/ddis";
import { facturacionCompleta } from "@/lib/facturacion";
import { ARTICULO_GS, NOMBRE_UNIDAD, lineasDeCierre, totalesFactura } from "@/lib/facturacion-campania";
import { esquemaFechaISO, hoyISO } from "@/lib/fechas";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { listaServicios } from "@/lib/rdb/queries/servicios";

// ============================================================
// Server Actions de facturación de Operaciones: maestros (DDIs, códigos de
// campaña en GS y prefijos que no cuentan para el reparto de horas), la
// tarifa de cada cliente (artículos de GS y precios, antes en Administración,
// decidido 19/10/2026), los cargos puntuales y el cierre de mes. Solo
// operaciones y admin (Dirección los ve pero no los toca); reabrir un mes,
// solo admin. Todo queda en audit_log («facturacion_maestros»,
// «config_facturacion» y «facturacion_cierre»).
// ============================================================

function volverCon(ruta: string, msg: string, detalle?: string): never {
  revalidatePath(ruta);
  revalidatePath("/operaciones");
  redirect(`${ruta}?msg=${msg}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
}

/** Texto opcional de un formulario: vacío → null. */
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null), z.string().max(max).nullable());

const fechaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  esquemaFechaISO.nullable(),
);

/** ¿Existe la campaña en Altitude? (maestro cacheado 24 h) */
async function campaniaExiste(shortname: string): Promise<boolean> {
  const campanias = await listadoCampanias();
  return campanias.some((c) => c.shortname === shortname);
}

// ---------- DDIs ----------

const esquemaDdi = z
  .object({
    id: z.coerce.number().int().positive().nullable().catch(null),
    numero: z.string().trim().regex(/^\d{3,15}$/, "El número solo lleva cifras"),
    campania: textoOpcional(20),
    estado: z.enum(ESTADOS_DDI),
    fechaAlta: fechaOpcional,
    fechaBaja: fechaOpcional,
    fechaSolicitud: fechaOpcional,
    versionAltitude: textoOpcional(20),
    huntGroup: textoOpcional(20),
    accountCode: textoOpcional(40),
    lineaIntermedia: textoOpcional(30),
    departamento: textoOpcional(60),
    tipoUso: textoOpcional(60),
    uso: textoOpcional(120),
    clienteGs: textoOpcional(30),
    empresa: textoOpcional(120),
    nombreCampania: textoOpcional(120),
    centro: textoOpcional(120),
    campaniaGs: textoOpcional(30),
    sentido: textoOpcional(30),
    unidadNegocio: textoOpcional(30),
    marca: textoOpcional(60),
    notas: textoOpcional(500),
  })
  .refine((d) => d.estado !== "en_produccion" || d.fechaAlta != null, {
    message: "Un DDI en producción necesita la fecha de puesta en producción",
  })
  .refine((d) => d.estado === "en_produccion" || d.fechaBaja != null, {
    message: "Para darlo de baja o deshabilitarlo, pon la fecha de baja",
  })
  .refine((d) => !d.fechaAlta || !d.fechaBaja || d.fechaBaja >= d.fechaAlta, {
    message: "La fecha de baja es anterior a la de alta",
  });

export async function guardarDdi(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const ruta = "/operaciones/ddis";
  const datos = esquemaDdi.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(ruta, "error_datos", datos.error.issues[0]?.message);
  const { id, campania, ...resto } = datos.data;
  if (campania && !(await campaniaExiste(campania))) {
    volverCon(ruta, "error_datos", `La campaña ${campania} no existe en la centralita.`);
  }
  const valores = {
    ...resto,
    campaignShortname: campania,
    actualizadoPor: usuario.username,
    actualizadoAt: new Date(),
  };
  // Un número se reasigna (otra fila), pero no puede estar activo dos veces a la vez
  const choca = db
    .select()
    .from(ddis)
    .where(eq(ddis.numero, resto.numero))
    .all()
    .find((d) => d.id !== id && seSolapan(d, resto));
  if (choca) {
    volverCon(
      ruta,
      "error_existe",
      `El ${resto.numero} ya está activo en ${choca.campaignShortname ?? "otra fila"} ` +
        `desde el ${choca.fechaAlta}${choca.fechaBaja ? ` hasta el ${choca.fechaBaja}` : ""}: dale de baja esa asignación antes.`,
    );
  }
  if (id) {
    db.update(ddis).set(valores).where(eq(ddis.id, id)).run();
  } else {
    db.insert(ddis).values(valores).run();
  }
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle:
      `${id ? "ddi editado" : "ddi alta"} ${resto.numero} → ${campania ?? "sin campaña"} ` +
      `${resto.estado} ${resto.fechaAlta ?? "-"}..${resto.fechaBaja ?? ""}`,
    ip: await ipPeticion(),
  });
  volverCon(ruta, id ? "guardado" : "creado");
}

// ---------- Códigos de campaña en GS ----------

const esquemaCampaniaGs = z.object({
  id: z.coerce.number().int().positive().nullable().catch(null),
  campania: z.string().trim().min(1).max(20),
  codigoGs: z.string().trim().regex(/^\d{1,12}$/, "El código de GS solo lleva cifras (con sus ceros)"),
  denominacion: textoOpcional(160),
  clienteGs: textoOpcional(30),
  presupuestoGs: textoOpcional(30),
  fechaInicio: fechaOpcional,
  fechaFin: fechaOpcional,
  notas: textoOpcional(500),
});

export async function guardarCampaniaGs(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const ruta = "/operaciones/campanias-gs";
  const datos = esquemaCampaniaGs.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(ruta, "error_datos", datos.error.issues[0]?.message);
  const { id, campania, ...resto } = datos.data;
  if (!(await campaniaExiste(campania))) {
    volverCon(ruta, "error_datos", `La campaña ${campania} no existe en la centralita.`);
  }
  const repetida = db
    .select({ id: campaniasGs.id })
    .from(campaniasGs)
    .where(eq(campaniasGs.campaignShortname, campania))
    .get();
  if (repetida && repetida.id !== id) volverCon(ruta, "error_existe", `${campania} ya tiene código de GS.`);
  const valores = { ...resto, campaignShortname: campania, actualizadoPor: usuario.username, actualizadoAt: new Date() };
  if (id) {
    db.update(campaniasGs).set(valores).where(eq(campaniasGs.id, id)).run();
  } else {
    db.insert(campaniasGs).values(valores).run();
  }
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle: `${id ? "código GS editado" : "código GS alta"} ${campania} = ${resto.codigoGs}`,
    ip: await ipPeticion(),
  });
  volverCon(ruta, id ? "guardado" : "creado");
}

// ---------- Prefijos que no cuentan para el reparto de horas ----------

/**
 * Guarda la lista de prefijos excluidos del reparto de un cliente (el
 * segmentador del Excel de operaciones). Vacía = cuenta todo.
 */
export async function guardarPrefijosReparto(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const ruta = "/operaciones/reparto";
  const servicio = String(formData.get("servicio") ?? "").trim();
  const servicios = await listaServicios();
  if (!servicios.some((s) => s.servicio === servicio)) volverCon(ruta, "error_datos", "Cliente desconocido.");
  const prefijos = leerPrefijosExcluidos(String(formData.get("prefijos") ?? ""));
  if (!prefijos) {
    volverCon(ruta, "error_datos", "Escribe solo números de hasta 4 cifras, separados por comas o espacios.");
  }
  const antes = prefijosExcluidosReparto(servicio);
  guardarPrefijosExcluidosReparto(servicio, prefijos);
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle: `prefijos excluidos del reparto ${servicio}: [${antes.join(",")}] → [${prefijos.join(",")}]`,
    ip: await ipPeticion(),
  });
  volverCon(ruta, "guardado");
}

// ---------- Cierre de mes ----------

const esquemaCierre = z.object({
  servicio: z.string().trim().min(1).max(80),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  notas: textoOpcional(300),
});

/** URL de Operaciones con el mes completo de un servicio. */
function rutaMes(servicio: string, mes: string): string {
  const { inicio, fin } = mesesDelRango(`${mes}-01`, `${mes}-01`)[0];
  return `/operaciones?servicio=${encodeURIComponent(servicio)}&desde=${inicio}&hasta=${fin}`;
}

/**
 * Cierra la facturación de un mes PASADO y completo de un servicio: guarda
 * lo que calcula facturacionCompleta en ese momento (la misma función que
 * enseña la pantalla; nunca lo que mande el navegador).
 */
export async function cerrarMes(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const datos = esquemaCierre.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon("/operaciones", "error_datos", "Mes o servicio no válidos.");
  const { servicio, mes, notas } = datos.data;
  const ruta = rutaMes(servicio, mes);
  const volver = (msg: string, detalle?: string): never => {
    revalidatePath("/operaciones");
    redirect(`${ruta}&msg=${msg}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
  };
  if (mes >= hoyISO().slice(0, 7)) volver("error_datos", "Solo se cierran meses ya terminados.");
  const servicios = await listaServicios();
  if (!servicios.some((s) => s.servicio === servicio)) volver("error_datos", `No existe el servicio ${servicio}.`);
  if (cierreVigente(mes, servicio)) volver("error_existe", `${mes} de ${servicio} ya está cerrado.`);

  const { inicio, fin } = mesesDelRango(`${mes}-01`, `${mes}-01`)[0];
  const { factura } = await facturacionCompleta(inicio, fin, servicio, false);
  const lineas = lineasDeCierre(factura);
  if (lineas.length === 0) volver("error_datos", "No hay nada que facturar en ese mes.");
  try {
    guardarCierre({ mes, servicio, origen: "dashboard", cerradoPor: usuario.username, notas, lineas });
  } catch {
    // Índice único parcial: otro usuario lo cerró a la vez
    volver("error_existe", `${mes} de ${servicio} ya está cerrado.`);
  }
  const total = totalesFactura(factura).importe;
  registrarAuditoria({
    accion: "facturacion_cierre",
    userId: usuario.id,
    username: usuario.username,
    detalle: `cierre ${mes} ${servicio}: ${lineas.length} líneas, ${total ?? 0} €`,
    ip: await ipPeticion(),
  });
  volver("guardado");
}

/** Reabre un cierre (solo admin): queda como «reabierto» y se puede volver a cerrar. */
export async function reabrirMes(formData: FormData): Promise<void> {
  const usuario = await requireRol(); // solo admin
  const id = Number(formData.get("id"));
  const servicio = String(formData.get("servicio") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const ruta = /^\d{4}-\d{2}$/.test(mes) && servicio ? rutaMes(servicio, mes) : "/operaciones?";
  if (!Number.isInteger(id) || id <= 0 || !reabrirCierre(id, usuario.username)) {
    revalidatePath("/operaciones");
    redirect(`${ruta}&msg=error_datos&detalle=${encodeURIComponent("Ese cierre no existe o ya estaba reabierto.")}`);
  }
  registrarAuditoria({
    accion: "facturacion_cierre",
    userId: usuario.id,
    username: usuario.username,
    detalle: `reabierto cierre ${id} (${mes} ${servicio})`,
    ip: await ipPeticion(),
  });
  revalidatePath("/operaciones");
  redirect(`${ruta}&msg=guardado`);
}

// ---------- Ajustes manuales de un mes cerrado ----------

const esquemaAjuste = z
  .object({
    cierreId: z.coerce.number().int().positive(),
    servicio: z.string().trim().min(1).max(80),
    mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    // «linea:<id>» o «campania:<nombre>» (todas sus líneas)
    objetivo: z.string().regex(/^(linea:\d+|campania:.+)$/, "Elige qué línea ajustar"),
    tipo: z.enum(["quitar", "precio"]),
    precio: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : null),
      z.number().nonnegative().nullable(),
    ),
    motivo: z.string().trim().min(5, "El motivo es obligatorio (al menos 5 letras)").max(300),
  })
  .refine((d) => d.tipo !== "precio" || d.precio != null, { message: "Falta el precio nuevo" });

/**
 * Quita una línea de un mes cerrado o le cambia el precio, con motivo: las
 * decisiones puntuales de dirección (p. ej. no facturar las bbdd en agosto).
 * La línea original se conserva; el ajuste se puede deshacer.
 */
export async function ajustarCierre(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const datos = esquemaAjuste.safeParse(Object.fromEntries(formData));
  const servicio = String(formData.get("servicio") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const ruta = /^\d{4}-\d{2}$/.test(mes) && servicio ? rutaMes(servicio, mes) : "/operaciones?";
  const volver = (msg: string, detalle?: string): never => {
    revalidatePath("/operaciones");
    redirect(`${ruta}&msg=${msg}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
  };
  if (!datos.success) volver("error_datos", datos.error.issues[0]?.message);
  const { cierreId, objetivo, tipo, precio, motivo } = datos.data!;
  const lineas = lineasAjustadas([cierreId]);
  const elegidas = objetivo.startsWith("linea:")
    ? lineas.filter((l) => l.id === Number(objetivo.slice(6)))
    : lineas.filter((l) => l.campania === objetivo.slice(9));
  if (elegidas.length === 0) volver("error_datos", "Esa línea no es de este cierre.");
  const total = ajustarLineas(cierreId, elegidas.map((l) => l.id), { tipo, precioNuevo: precio, motivo }, usuario.username);
  if (total == null) volver("error_datos", "El mes no está cerrado o la línea no es suya.");
  registrarAuditoria({
    accion: "facturacion_cierre",
    userId: usuario.id,
    username: usuario.username,
    detalle:
      `ajuste cierre ${cierreId} (${mes} ${servicio}): ` +
      elegidas.map((l) => `${l.campania}/${l.unidad}`).join(", ") +
      ` → ${tipo === "quitar" ? "quitar" : `precio ${precio}`} · «${motivo}» · total ${total} €`,
    ip: await ipPeticion(),
  });
  volver("guardado");
}

export async function deshacerAjusteCierre(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const servicio = String(formData.get("servicio") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const ruta = /^\d{4}-\d{2}$/.test(mes) && servicio ? rutaMes(servicio, mes) : "/operaciones?";
  const r = deshacerAjuste(Number(formData.get("ajusteId")));
  revalidatePath("/operaciones");
  if (!r) redirect(`${ruta}&msg=error_datos&detalle=${encodeURIComponent("Ese ajuste ya no existe o el mes no está cerrado.")}`);
  registrarAuditoria({
    accion: "facturacion_cierre",
    userId: usuario.id,
    username: usuario.username,
    detalle: `ajuste deshecho en cierre ${r.cierreId} (${mes} ${servicio}) · total ${r.total} €`,
    ip: await ipPeticion(),
  });
  redirect(`${ruta}&msg=guardado`);
}

export async function borrarCampaniaGs(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const ruta = "/operaciones/campanias-gs";
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) volverCon(ruta, "error_datos");
  const fila = db.select().from(campaniasGs).where(eq(campaniasGs.id, id)).get();
  if (!fila) volverCon(ruta, "error_datos");
  db.delete(campaniasGs).where(eq(campaniasGs.id, id)).run();
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle: `código GS borrado ${fila.campaignShortname} = ${fila.codigoGs}`,
    ip: await ipPeticion(),
  });
  volverCon(ruta, "borrado");
}

// ---------- Tarifas: artículos de GS de cada cliente (19/10/2026) ----------

const RUTA_ARTICULOS = "/operaciones/articulos";

const esquemaLineaTarifa = z.object({
  // Ámbito codificado por el formulario: "svc:<servicio>" o "camp:<campaña>"
  objetivo: z.string().trim().regex(/^(svc|camp):.+/, "Ámbito inválido"),
  unidad: z.enum(UNIDADES_FACTURACION),
  // Solo para horas logadas: GH, Av, Soc_Fed... (sin el «_nnnn»)
  prefijo: z.string().trim().max(30).regex(PATRON_PREFIJO_USUARIO).nullable(),
  precio: z.coerce.number().nonnegative().nullable().catch(null),
  notas: z.string().trim().max(300).nullable().catch(null),
  // Solo para DDIs: cobrarlos solo los meses en que la campaña tuvo llamadas
  soloConActividad: z.boolean(),
});

export async function crearLineaTarifa(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const datos = esquemaLineaTarifa.safeParse({
    objetivo: formData.get("objetivo"),
    unidad: formData.get("unidad"),
    prefijo: String(formData.get("prefijo") ?? "").trim() || null,
    precio: formData.get("precio") || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
    soloConActividad: formData.get("soloConActividad") === "on",
  });
  if (!datos.success) volverCon(RUTA_ARTICULOS, "error_datos", datos.error.issues[0]?.message);
  const { objetivo, unidad, precio, notas } = datos.data;
  const esServicio = objetivo.startsWith("svc:");
  const nombre = objetivo.slice(objetivo.indexOf(":") + 1);
  if (esServicio ? !(await listaServicios()).some((s) => s.servicio === nombre) : !(await campaniaExiste(nombre))) {
    volverCon(RUTA_ARTICULOS, "error_datos", `${nombre} no existe en la centralita.`);
  }
  // Las horas logadas son del cliente (user_log no sabe de campañas) y
  // necesitan el prefijo para saber qué usuarios cuentan
  const horasLogadas = unidad === "horas_logadas";
  if (horasLogadas && (!esServicio || !datos.data.prefijo)) volverCon(RUTA_ARTICULOS, "error_horas_logadas");
  const prefijo = horasLogadas ? datos.data.prefijo : null;
  const soloConActividad = (unidad === "ddi" || unidad === "ddi_movil") && datos.data.soloConActividad;

  db.insert(billingConfig)
    .values({
      campaignShortname: esServicio ? null : nombre,
      serviceName: esServicio ? nombre : null,
      unidad,
      prefijoUsuario: prefijo,
      precioUnitario: precio,
      notas,
      soloConActividad,
    })
    .run();
  registrarAuditoria({
    accion: "config_facturacion",
    userId: usuario.id,
    username: usuario.username,
    detalle:
      `+${esServicio ? "servicio" : "campaña"} ${nombre} ${unidad} (${ARTICULO_GS[unidad] ?? NOMBRE_UNIDAD[unidad]})` +
      `${prefijo ? ` usuarios ${prefijo}_nnnn` : ""}${soloConActividad ? " solo meses con llamadas" : ""}` +
      ` @${precio ?? "s/p"}`,
    ip: await ipPeticion(),
  });
  volverCon(RUTA_ARTICULOS, "creado");
}

const esquemaEdicionTarifa = z.object({
  id: z.coerce.number().int().positive(),
  precio: z.coerce.number().nonnegative().nullable().catch(null),
  notas: z.string().trim().max(300).nullable().catch(null),
});

/** Cambia el precio o las notas de una línea de tarifa (el ámbito y el artículo, no). */
export async function editarLineaTarifa(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const datos = esquemaEdicionTarifa.safeParse({
    id: formData.get("id"),
    precio: formData.get("precio") || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  });
  if (!datos.success) volverCon(RUTA_ARTICULOS, "error_datos");
  const { id, precio, notas } = datos.data;
  const antes = db.select().from(billingConfig).where(eq(billingConfig.id, id)).get();
  if (!antes) volverCon(RUTA_ARTICULOS, "error_datos", "Esa línea ya no existe.");
  db.update(billingConfig).set({ precioUnitario: precio, notas }).where(eq(billingConfig.id, id)).run();
  registrarAuditoria({
    accion: "config_facturacion",
    userId: usuario.id,
    username: usuario.username,
    detalle: `~linea ${id} ${antes.serviceName ?? antes.campaignShortname} ${antes.unidad}: ${antes.precioUnitario ?? "s/p"} → ${precio ?? "s/p"}`,
    ip: await ipPeticion(),
  });
  volverCon(RUTA_ARTICULOS, "guardado");
}

export async function borrarLineaTarifa(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const id = Number(formData.get("id"));
  const antes = id ? db.select().from(billingConfig).where(eq(billingConfig.id, id)).get() : undefined;
  if (!antes) volverCon(RUTA_ARTICULOS, "error_datos", "Esa línea ya no existe.");
  db.delete(billingConfig).where(eq(billingConfig.id, id)).run();
  registrarAuditoria({
    accion: "config_facturacion",
    userId: usuario.id,
    username: usuario.username,
    detalle: `-linea ${id} ${antes.serviceName ?? antes.campaignShortname} ${antes.unidad} @${antes.precioUnitario ?? "s/p"}`,
    ip: await ipPeticion(),
  });
  volverCon(RUTA_ARTICULOS, "borrado");
}

// ---------- Cargos puntuales: base de datos y preparación (19/10/2026) ----------

const esquemaCargo = z.object({
  servicio: z.string().trim().min(1),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido"),
  campania: z.string().trim().min(1, "Elige la campaña"),
  unidad: z.enum(UNIDADES_CARGO),
  cantidad: z.coerce.number().positive("La cantidad tiene que ser mayor que cero").max(1_000_000),
  precio: z.coerce.number().nonnegative().nullable().catch(null),
  concepto: z.string().trim().min(3, "Pon un concepto (qué se cobra)").max(200),
});

/** Apunta un cargo puntual en una campaña y un mes (no cerrado) de un cliente. */
export async function crearCargoPuntual(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const datos = esquemaCargo.safeParse({ ...Object.fromEntries(formData), precio: formData.get("precio") || null });
  const servicio = String(formData.get("servicio") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const ruta = /^\d{4}-\d{2}$/.test(mes) && servicio ? rutaMes(servicio, mes) : "/operaciones";
  const volver = (msg: string, detalle?: string): never => {
    revalidatePath("/operaciones");
    redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}msg=${msg}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
  };
  if (!datos.success) return volver("error_datos", datos.error.issues[0]?.message);
  const d = datos.data;
  const delCliente = (await listaServicios()).find((s) => s.servicio === d.servicio)?.campanias ?? [];
  if (!delCliente.includes(d.campania)) volver("error_datos", `${d.campania} no es una campaña de ${d.servicio}.`);
  if (cierreVigente(d.mes, d.servicio)) {
    volver("error_existe", `${d.mes} de ${d.servicio} está cerrado: para añadir un cargo hay que reabrirlo (administrador).`);
  }
  crearCargo({
    mes: d.mes,
    servicio: d.servicio,
    campania: d.campania,
    unidad: d.unidad,
    cantidad: d.cantidad,
    precioUnitario: d.precio,
    concepto: d.concepto,
    autor: usuario.username,
  });
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle: `cargo ${d.mes} ${d.campania} ${d.unidad} ×${d.cantidad} @${d.precio ?? "tarifa"} «${d.concepto}»`,
    ip: await ipPeticion(),
  });
  volver("creado");
}

export async function borrarCargoPuntual(formData: FormData): Promise<void> {
  const usuario = await requireRol(...ROLES_OPERACIONES_EDICION);
  const cargo = obtenerCargo(Number(formData.get("id")));
  if (!cargo) volverCon("/operaciones", "error_datos", "Ese cargo ya no existe.");
  const ruta = rutaMes(cargo.servicio, cargo.mes);
  const volver = (msg: string, detalle?: string): never => {
    revalidatePath("/operaciones");
    redirect(`${ruta}&msg=${msg}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
  };
  if (cierreVigente(cargo.mes, cargo.servicio)) {
    volver("error_existe", `${cargo.mes} de ${cargo.servicio} está cerrado: el cargo ya está facturado.`);
  }
  borrarCargo(cargo.id);
  registrarAuditoria({
    accion: "facturacion_maestros",
    userId: usuario.id,
    username: usuario.username,
    detalle: `-cargo ${cargo.mes} ${cargo.campaignShortname} ${cargo.unidad} ×${cargo.cantidad} «${cargo.concepto}»`,
    ip: await ipPeticion(),
  });
  volver("borrado");
}

