"use server";

import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import type { User } from "@/lib/db/schema";
import { esquemaFechaISO, MAX_DIAS_RANGO } from "@/lib/fechas";
import { bolsasDelMes } from "@/lib/planificacion/bolsas";
import { esquemaOperacion, MAX_OPERACIONES_LOTE } from "@/lib/planificacion/edicion";
import { guardarCambiosVersion, publicarBorrador, quitarAusenciaDeBorradores, resumenCambios } from "@/lib/planificacion/guardar";
import { fechasDelMes, lunesDe, solapan } from "@/lib/planificacion/motor";
import * as repo from "@/lib/planificacion/repositorio";
import type { BloqueTablero } from "@/lib/planificacion/tablero";

// ============================================================
// Server Actions de un mes del plan: guardar la edición del tablero,
// publicar, copiar la publicada en un borrador nuevo, ausencias, bolsas y
// objetivos. Se pueden invocar con un POST a mano, así que CADA una
// comprueba el rol (supervisión; admin siempre pasa) y valida lo que llega
// con zod: el navegador nunca manda bloques, solo operaciones, y el servidor
// las repite y vuelve a validar. Todo cambio queda en audit_log con el mes
// al principio del detalle («mes=2026-10 …»), que es como lo lista la
// página de versiones.
// ============================================================

const esquemaMes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

async function autorizar(): Promise<User> {
  return requireRol(...ROLES_PLAN_EDICION);
}

async function auditar(
  usuario: User,
  accion: "plan_editar" | "plan_publicar" | "plan_ausencia" | "plan_bolsa" | "plan_saldo_ajuste",
  detalle: string,
): Promise<void> {
  registrarAuditoria({
    accion,
    userId: usuario.id,
    username: usuario.username,
    detalle: detalle.slice(0, 2000),
    ip: await ipPeticion(),
  });
}

/**
 * Lo guardado tiene que verse también al volver atrás: sin esto, la caché del
 * router del navegador seguiría sirviendo el tablero (o las otras páginas del
 * mes) de antes del cambio.
 */
function invalidarPlanificacion(): void {
  revalidatePath("/planificacion", "layout");
}

/** Vuelve a una página del mes con ?msg= (y ?detalle=) como las de configuración. */
function volver(mes: string, pagina: "ausencias" | "bolsas" | "versiones" | "saldos", msg: string, detalle?: string): never {
  invalidarPlanificacion();
  const p = new URLSearchParams({ msg });
  if (detalle) p.set("detalle", detalle);
  redirect(`/planificacion/${mes}/${pagina}?${p.toString()}`);
}

const primerError = (e: z.ZodError) => {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "valor"}: ${i.message}` : "datos no válidos";
};
const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
/** «1.263,82» o «1263.82» → 1263.82 (null si no es un número). */
function numeroEs(v: string): number | null {
  const limpio = v.trim().replace(/\s/g, "");
  if (limpio === "") return null;
  const normal = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

// ---------- Guardar la edición del tablero ----------

const esquemaGuardar = z.object({
  versionId: z.number().int().positive(),
  revision: z.number().int().min(0),
  operaciones: z.array(esquemaOperacion).min(1).max(MAX_OPERACIONES_LOTE),
});

export type RespuestaGuardar =
  | { ok: true; revision: number; bloques: BloqueTablero[]; tramos: number }
  | { ok: false; error: string; conflicto: boolean };

/**
 * Guarda un lote de operaciones del tablero. Revisión optimista: si otra
 * persona guardó antes, conflicto (el tablero avisa y recarga).
 */
export async function guardarCambiosAccion(peticion: unknown): Promise<RespuestaGuardar> {
  const usuario = await autorizar();
  const datos = esquemaGuardar.safeParse(peticion);
  if (!datos.success) return { ok: false, error: `Petición no válida (${primerError(datos.error)}).`, conflicto: false };
  const { versionId, revision, operaciones } = datos.data;
  const version = repo.leerVersion(versionId);
  const inicio = Date.now();
  const r = guardarCambiosVersion({ versionId, revision, operaciones, autor: usuario.username });
  if (!r.ok) {
    if (version) {
      await auditar(usuario, "plan_editar", `mes=${version.mes} v${version.numero} RECHAZADO rev ${revision}: ${r.error}`);
    }
    return r;
  }
  const tipos = new Map<string, number>();
  for (const op of operaciones) tipos.set(op.tipo, (tipos.get(op.tipo) ?? 0) + 1);
  await auditar(
    usuario,
    "plan_editar",
    `mes=${version!.mes} v${version!.numero} rev ${revision}→${r.revision}: ${operaciones.length} operaciones ` +
      `(${[...tipos].map(([t, n]) => `${t}×${n}`).join(", ")}); filas +${r.filas.insertados} ~${r.filas.actualizados} ` +
      `−${r.filas.borrados}; ${resumenCambios(r.cambios)} · ${Date.now() - inicio} ms`,
  );
  // La respuesta lleva además la página repintada: así la caché del router (y
  // «Atrás» desde otra página) tiene el plan guardado, no el de antes
  invalidarPlanificacion();
  return { ok: true, revision: r.revision, bloques: r.bloques, tramos: r.cambios.length };
}

// ---------- Publicar ----------

export interface EstadoFormulario {
  error: string | null;
}

const esquemaPublicar = z.object({
  versionId: z.coerce.number().int().positive(),
  revision: z.coerce.number().int().min(0),
  blandas: z.coerce.number().int().min(0),
  motivo: z.string().max(1000),
});

/**
 * Publica el borrador. Sin incidencias duras; con avisos blandos, solo
 * escribiendo un motivo (queda en la versión y en audit_log). La publicada
 * anterior del mes pasa a «sustituida».
 */
export async function publicarAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await autorizar();
  const datos = esquemaPublicar.safeParse({
    versionId: formData.get("versionId"),
    revision: formData.get("revision"),
    blandas: formData.get("blandas"),
    motivo: texto(formData, "motivo"),
  });
  if (!datos.success) return { error: "Petición no válida." };
  const r = publicarBorrador({ ...datos.data, blandasVistas: datos.data.blandas, autor: usuario.username });
  if (!r.ok) return { error: r.error };
  const codigos = new Map<string, number>();
  for (const a of r.avisos) codigos.set(a.codigo, (codigos.get(a.codigo) ?? 0) + 1);
  await auditar(
    usuario,
    "plan_publicar",
    `mes=${r.mes} v${r.numero} publicada${r.sustituida != null ? ` (sustituye a la v${r.sustituida})` : ""}; ` +
      (r.blandas > 0
        ? `${r.blandas} avisos blandos aceptados (${[...codigos].map(([c, n]) => `${c}×${n}`).join(", ")}); motivo: «${datos.data.motivo.trim()}»`
        : "sin avisos blandos"),
  );
  // La página se vuelve a pintar con la versión ya publicada (sin edición)
  invalidarPlanificacion();
  refresh();
  return { error: null };
}

// ---------- Borrador desde la publicada ----------

export async function crearBorradorDesdePublicadaAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await autorizar();
  const versionId = Number(formData.get("versionId"));
  if (!Number.isInteger(versionId) || versionId <= 0) return { error: "Petición no válida." };
  let r;
  try {
    r = repo.copiarPublicada(versionId, usuario.username);
  } catch (e) {
    if (e instanceof repo.ConflictoVersion) return { error: e.message };
    throw e;
  }
  const v = repo.leerVersion(r.id)!;
  await auditar(usuario, "plan_editar", `mes=${v.mes} v${r.numero} borrador creado copiando la publicada v${r.publicada}`);
  invalidarPlanificacion();
  redirect(`/planificacion/${v.mes}?version=${r.id}`);
}

// ---------- Descartar un borrador ----------

const esquemaDescartar = z.object({
  versionId: z.coerce.number().int().positive(),
  revision: z.coerce.number().int().min(0),
});

/**
 * Descarta el borrador sin crear otro (no se quieren sus cambios, p. ej. los
 * del recálculo de los lunes). Con la revisión leída: si otra persona lo ha
 * cambiado, se avisa en vez de descartar lo que no se ha visto.
 */
export async function descartarBorradorAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await autorizar();
  const datos = esquemaDescartar.safeParse({ versionId: formData.get("versionId"), revision: formData.get("revision") });
  if (!datos.success) return { error: "Petición no válida." };
  let v;
  try {
    v = repo.descartarBorrador(datos.data.versionId, datos.data.revision);
  } catch (e) {
    if (e instanceof repo.ConflictoVersion) return { error: e.message };
    throw e;
  }
  await auditar(usuario, "plan_editar", `mes=${v.mes} v${v.numero} borrador descartado (creado por ${v.creadaPor ?? "—"})`);
  const hayPublicada = repo.versionesMes(v.mes).some((x) => x.estado === "publicada");
  volver(v.mes, "versiones", "guardado", `Borrador v${v.numero} descartado${hayPublicada ? ": el plan publicado sigue igual" : ""}.`);
}

// ---------- Ausencias ----------

const esquemaHora = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, "hora HH:MM")
  .transform((v) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  })
  .refine((m) => m >= 0 && m <= 1440 && m % 1 === 0, "hora fuera del día");

const esquemaAusencia = z
  .object({
    agenteNumero: z.string().regex(/^\d{4}$/, "agente"),
    tipoCodigo: z.string().min(1).max(10),
    desde: esquemaFechaISO,
    hasta: esquemaFechaISO,
    jornada: z.enum(["completa", "horas"]),
    inicio: z.string(),
    fin: z.string(),
    notas: z.string().trim().max(300).transform((v) => v || null),
    quitar: z.boolean(),
  })
  .refine((a) => a.hasta >= a.desde, { message: "«hasta» anterior a «desde»", path: ["hasta"] });

export async function guardarAusenciaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const m = mes.data;
  const datos = esquemaAusencia.safeParse({
    agenteNumero: texto(formData, "agenteNumero"),
    tipoCodigo: texto(formData, "tipoCodigo"),
    desde: texto(formData, "desde"),
    hasta: texto(formData, "hasta"),
    jornada: texto(formData, "jornada") || "completa",
    inicio: texto(formData, "inicio"),
    fin: texto(formData, "fin"),
    notas: texto(formData, "notas"),
    quitar: formData.get("quitar") === "on",
  });
  if (!datos.success) volver(m, "ausencias", "error_datos", primerError(datos.error));
  const a = datos.data;
  const dias = Math.round((Date.parse(a.hasta) - Date.parse(a.desde)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_RANGO) volver(m, "ausencias", "error_datos", `Como mucho ${MAX_DIAS_RANGO} días seguidos.`);

  let inicioMin: number | null = null;
  let finMin: number | null = null;
  if (a.jornada === "horas") {
    const i = esquemaHora.safeParse(a.inicio);
    const f = esquemaHora.safeParse(a.fin);
    if (!i.success || !f.success || f.data <= i.data) {
      volver(m, "ausencias", "error_datos", "Indica las horas de la ausencia (inicio anterior al fin) o marca jornada completa.");
    }
    inicioMin = i.data;
    finMin = f.data;
  }
  if (!repo.leerAgentes().some((x) => x.numero === a.agenteNumero)) {
    volver(m, "ausencias", "error_datos", `No existe el agente ${a.agenteNumero}.`);
  }
  const tipo = repo.leerTiposAusencia().find((t) => t.codigo === a.tipoCodigo);
  if (!tipo || !tipo.activo) volver(m, "ausencias", "error_datos", `El tipo ${a.tipoCodigo} no existe o no está activo.`);

  // Sin duplicados: misma persona, días que se cruzan y horas que se pisan
  const nueva = { inicioMin: inicioMin ?? 0, finMin: finMin ?? 1440 };
  const choca = repo
    .leerAusencias(a.desde, a.hasta)
    .find((x) => x.agenteNumero === a.agenteNumero && solapan(nueva, { inicioMin: x.inicioMin ?? 0, finMin: x.finMin ?? 1440 }));
  if (choca) {
    volver(m, "ausencias", "error_datos", `Se solapa con ${choca.tipoCodigo} del ${choca.desde} al ${choca.hasta}.`);
  }

  const id = repo.crearAusencia({
    agenteNumero: a.agenteNumero,
    tipoCodigo: a.tipoCodigo,
    desde: a.desde,
    hasta: a.hasta,
    inicioMin,
    finMin,
    notas: a.notas,
    creadoPor: usuario.username,
  });
  const horas = inicioMin == null ? "jornada completa" : `${a.inicio}-${a.fin}`;
  await auditar(usuario, "plan_ausencia", `mes=${m} alta #${id} ${a.agenteNumero} ${a.tipoCodigo} ${a.desde}..${a.hasta} ${horas}${a.notas ? ` · ${a.notas}` : ""}`);

  let detalle = `${a.agenteNumero} ${a.tipoCodigo} del ${a.desde} al ${a.hasta}.`;
  if (a.quitar) {
    for (const r of quitarAusenciaDeBorradores({ agenteNumero: a.agenteNumero, desde: a.desde, hasta: a.hasta, autor: usuario.username })) {
      if (r.error) {
        detalle += ` No se pudo recortar el borrador v${r.numero} de ${r.mes}: ${r.error}`;
        continue;
      }
      const horasQuitadas = r.cambios.reduce((s, c) => s + (c.finMin - c.inicioMin) / 60, 0);
      detalle += ` Borrador v${r.numero} de ${r.mes}: ${horasQuitadas.toLocaleString("es-ES")} h de bloques quitadas.`;
      await auditar(usuario, "plan_editar", `mes=${r.mes} v${r.numero} ausencia #${id}: ${resumenCambios(r.cambios)}`);
    }
  }
  volver(m, "ausencias", "creado", detalle);
}

export async function borrarAusenciaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) volver(mes.data, "ausencias", "error_datos");
  const fila = repo.borrarAusencia(id);
  if (fila) {
    const horas = fila.inicioMin == null ? "jornada completa" : `${fila.inicioMin}-${fila.finMin} min`;
    await auditar(usuario, "plan_ausencia", `mes=${mes.data} baja #${id} ${fila.agenteNumero} ${fila.tipoCodigo} ${fila.desde}..${fila.hasta} ${horas}`);
  }
  volver(mes.data, "ausencias", "borrado");
}

// ---------- Bolsas y objetivos ----------

export async function confirmarBolsaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const m = mes.data;
  const cliente = texto(formData, "clienteCodigo");
  const { filas } = await bolsasDelMes(m);
  const fila = filas.find((f) => f.cliente === cliente);
  if (!fila) volver(m, "bolsas", "error_datos", `${cliente} no es un cliente activo del equipo.`);

  if (texto(formData, "accion") === "quitar") {
    const borrada = repo.borrarBolsa(m, cliente);
    if (borrada) {
      await auditar(usuario, "plan_bolsa", `mes=${m} bolsa ${cliente}: quitada la confirmada (${borrada.horas} h); vuelve al prorrateo`);
    }
    volver(m, "bolsas", "borrado", `${cliente} vuelve a la bolsa por defecto.`);
  }

  const horas = numeroEs(texto(formData, "horas"));
  if (horas == null || horas < 0 || horas > 100_000) volver(m, "bolsas", "error_datos", "Horas de la bolsa no válidas.");
  const redondeadas = Math.round(horas * 100) / 100;
  // Si confirma justo el prorrateo, queda como prorrateo (confirmado)
  const origen = fila.prorrateo && Math.abs(fila.prorrateo.horas - redondeadas) < 0.005 ? "prorrateo" : "manual";
  repo.confirmarBolsa({
    mes: m,
    clienteCodigo: cliente,
    horas: redondeadas,
    origen,
    confirmadaPor: usuario.username,
    confirmadaAt: new Date(),
  });
  await auditar(
    usuario,
    "plan_bolsa",
    `mes=${m} bolsa ${cliente}: ${fila.confirmada ? `${fila.confirmada.horas} → ` : ""}${redondeadas} h (${origen})` +
      (fila.prorrateo ? `; prorrateo ${fila.prorrateo.horas} h` : ""),
  );
  volver(m, "bolsas", "guardado", `Bolsa de ${cliente}: ${redondeadas.toLocaleString("es-ES")} h.`);
}

export async function guardarObjetivosAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const m = mes.data;
  const cliente = texto(formData, "clienteCodigo");
  const c = repo.leerClientesTodos().find((x) => x.codigo === cliente);
  if (!c || c.modo !== "objetivo") volver(m, "bolsas", "error_datos", `${cliente} no es un cliente con objetivo.`);
  const semanas = [...new Set(fechasDelMes(m).map(lunesDe))];
  const actuales = new Map(repo.leerObjetivosManuales(m).filter((o) => o.clienteCodigo === cliente).map((o) => [o.semanaLunes, o.horas]));
  const cambios: string[] = [];
  for (const lunes of semanas) {
    const bruto = texto(formData, `s_${lunes}`);
    const horas = bruto.trim() === "" ? null : numeroEs(bruto);
    if (bruto.trim() !== "" && (horas == null || horas < 0 || horas > 1000)) {
      volver(m, "bolsas", "error_datos", `Semana del ${lunes}: horas no válidas.`);
    }
    const nuevas = horas == null ? null : Math.round(horas * 100) / 100;
    if ((actuales.get(lunes) ?? null) === nuevas) continue;
    repo.guardarObjetivoManual({ mes: m, clienteCodigo: cliente, semanaLunes: lunes, horas: nuevas });
    cambios.push(`${lunes} ${actuales.get(lunes) ?? "calculado"}→${nuevas ?? "calculado"}`);
  }
  if (cambios.length > 0) await auditar(usuario, "plan_bolsa", `mes=${m} objetivos ${cliente}: ${cambios.join(", ")}`);
  volver(m, "bolsas", "guardado", cambios.length > 0 ? `Objetivos de ${cliente}: ${cambios.length} semanas cambiadas.` : "Sin cambios.");
}

// ---------- Saldo: ajustes manuales (F4) ----------

const esquemaAjuste = z.object({
  agenteNumero: z.string().regex(/^\d{4}$/, "agente no válido"),
  fecha: esquemaFechaISO,
  horas: z
    .number({ message: "indica las horas (p. ej. 1,5 o -2)" })
    .refine((h) => h !== 0 && Math.abs(h) <= 200, "entre -200 y 200 horas, distinto de 0"),
  motivo: z.string().trim().min(10, "explica el motivo (al menos 10 caracteres)").max(300),
});

/**
 * Ajuste manual del saldo de un agente (horas que no salen de user_log:
 * una formación fuera del sistema, una corrección acordada...). Se imputa a
 * un día del mes y queda en la auditoría con su motivo.
 */
export async function guardarAjusteSaldoAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const m = mes.data;
  const datos = esquemaAjuste.safeParse({
    agenteNumero: texto(formData, "agenteNumero"),
    fecha: texto(formData, "fecha"),
    horas: numeroEs(texto(formData, "horas")) ?? undefined,
    motivo: texto(formData, "motivo"),
  });
  if (!datos.success) volver(m, "saldos", "error_datos", primerError(datos.error));
  const a = datos.data;
  if (!a.fecha.startsWith(m)) volver(m, "saldos", "error_datos", `El ajuste tiene que ser de un día de ${m}.`);
  if (!repo.leerAgentes().some((x) => x.numero === a.agenteNumero)) {
    volver(m, "saldos", "error_datos", `No existe el agente ${a.agenteNumero}.`);
  }
  const horas = Math.round(a.horas * 100) / 100;
  const id = repo.crearAjusteSaldo({ agenteNumero: a.agenteNumero, fecha: a.fecha, horas, motivo: a.motivo, autor: usuario.username });
  const signo = `${horas > 0 ? "+" : ""}${horas.toLocaleString("es-ES")} h`;
  await auditar(usuario, "plan_saldo_ajuste", `mes=${m} alta #${id} ${a.agenteNumero} ${a.fecha} ${signo} · ${a.motivo}`);
  volver(m, "saldos", "creado", `${a.agenteNumero}: ${signo} el ${a.fecha}.`);
}

export async function borrarAjusteSaldoAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const mes = esquemaMes.safeParse(texto(formData, "mes"));
  if (!mes.success) redirect("/planificacion");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) volver(mes.data, "saldos", "error_datos");
  const fila = repo.borrarAjusteSaldo(id);
  if (fila) {
    await auditar(usuario, "plan_saldo_ajuste", `mes=${mes.data} baja #${id} ${fila.agenteNumero} ${fila.fecha} ${fila.horas} h · ${fila.motivo}`);
  }
  volver(mes.data, "saldos", "borrado");
}
