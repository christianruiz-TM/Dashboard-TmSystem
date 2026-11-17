"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ipPeticion, registrarAuditoria, type AccionAuditoria } from "@/lib/auth/audit";
import { requireRol, ROLES_RRHH_EDICION } from "@/lib/auth/rbac";
import type { User } from "@/lib/db/schema";
import { esquemaFechaISO, MAX_DIAS_RANGO } from "@/lib/fechas";
import { solapan } from "@/lib/planificacion/motor";
import * as planRepo from "@/lib/planificacion/repositorio";
import { hora } from "@/lib/rrhh/dia";
import { DIAS_SEMANA, MAX_TRAMOS_DIA, type HorarioSemana } from "@/lib/rrhh/horario";
import { esGrupo } from "@/lib/rrhh/grupos";
import { CATEGORIAS_MOTIVO, type CategoriaMotivo, type ConfigMotivos } from "@/lib/rrhh/motivos";
import * as repo from "@/lib/rrhh/repositorio";

// ============================================================
// Server Actions del panel de RRHH (docs/plan-rrhh.md). Se pueden invocar
// con un POST a mano: CADA una comprueba el rol (rrhh; admin siempre pasa)
// y valida con zod. Todo cambio queda en audit_log. Las ausencias son las de
// Planificación: se auditan como `plan_ausencia` con el mes delante, para
// que salgan también en el historial del mes de Planificación.
// ============================================================

async function autorizar(): Promise<User> {
  return requireRol(...ROLES_RRHH_EDICION);
}

async function auditar(usuario: User, accion: AccionAuditoria, detalle: string): Promise<void> {
  registrarAuditoria({ accion, userId: usuario.id, username: usuario.username, detalle: detalle.slice(0, 2000), ip: await ipPeticion() });
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const esquemaNumero = z.string().regex(/^\d{4}$/, "agente");

/** «09:30» → 570 (null si está vacío; error si no es una hora). */
function minutosDeHora(v: string): number | null | "error" {
  if (v === "") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return "error";
  const min = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && min <= 1440 ? min : "error";
}

/** Vuelve al día (y a la persona) con un mensaje. */
function volverDia(fecha: string, persona: string | null, msg: string, detalle?: string): never {
  revalidatePath("/rrhh", "layout");
  revalidatePath("/planificacion", "layout");
  const p = new URLSearchParams({ fecha });
  if (persona) p.set("persona", persona);
  p.set("msg", msg);
  if (detalle) p.set("detalle", detalle);
  redirect(`/rrhh?${p.toString()}${persona ? "#detalle" : ""}`);
}

function volverConfig(msg: string, detalle?: string, ancla?: string): never {
  revalidatePath("/rrhh", "layout");
  revalidatePath("/planificacion", "layout");
  const p = new URLSearchParams({ msg });
  if (detalle) p.set("detalle", detalle);
  redirect(`/rrhh/configuracion?${p.toString()}${ancla ? `#${ancla}` : ""}`);
}

// ---------- Notas ----------

export async function guardarNotaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const fecha = esquemaFechaISO.safeParse(texto(formData, "fecha"));
  const numero = esquemaNumero.safeParse(texto(formData, "persona"));
  if (!fecha.success || !numero.success) redirect("/rrhh");
  const nota = texto(formData, "texto").slice(0, 500);
  const inicio = minutosDeHora(texto(formData, "hora"));
  if (nota === "") volverDia(fecha.data, numero.data, "error_datos", "Escribe la nota.");
  if (inicio === "error") volverDia(fecha.data, numero.data, "error_datos", "La hora tiene que ser HH:MM.");
  const id = repo.crearNota({ agenteNumero: numero.data, fecha: fecha.data, inicioMin: inicio, texto: nota, autor: usuario.username });
  await auditar(usuario, "rrhh_nota", `alta #${id} ${numero.data} ${fecha.data}${inicio != null ? ` ${hora(inicio)}` : ""} · ${nota}`);
  volverDia(fecha.data, numero.data, "guardado", "Nota guardada.");
}

export async function borrarNotaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const id = Number(formData.get("id"));
  const fecha = esquemaFechaISO.safeParse(texto(formData, "fecha"));
  if (!fecha.success || !Number.isInteger(id) || id <= 0) redirect("/rrhh");
  const fila = repo.borrarNota(id);
  if (fila) await auditar(usuario, "rrhh_nota", `baja #${id} ${fila.agenteNumero} ${fila.fecha} · ${fila.texto}`);
  volverDia(fecha.data, fila?.agenteNumero ?? null, "borrado", "Nota borrada.");
}

// ---------- Ausencias (las de Planificación) ----------

export async function guardarAusenciaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const volverA = esquemaFechaISO.safeParse(texto(formData, "volver"));
  const numero = esquemaNumero.safeParse(texto(formData, "persona"));
  if (!volverA.success || !numero.success) redirect("/rrhh");
  // Con el tipo escrito en la constante: así TypeScript sabe que no vuelve
  const error: (detalle: string) => never = (detalle) => volverDia(volverA.data, numero.data, "error_datos", detalle);

  const desde = esquemaFechaISO.safeParse(texto(formData, "desde"));
  const hasta = esquemaFechaISO.safeParse(texto(formData, "hasta"));
  if (!desde.success || !hasta.success) error("Indica las fechas de la ausencia.");
  if (hasta.data < desde.data) error("La fecha «hasta» es anterior a «desde».");
  const dias = Math.round((Date.parse(hasta.data) - Date.parse(desde.data)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_RANGO) error(`Como mucho ${MAX_DIAS_RANGO} días seguidos.`);

  let inicioMin: number | null = null;
  let finMin: number | null = null;
  if (texto(formData, "jornada") === "horas") {
    const i = minutosDeHora(texto(formData, "inicio"));
    const f = minutosDeHora(texto(formData, "fin"));
    if (i == null || f == null || i === "error" || f === "error" || f <= i) error("Indica las horas (inicio antes del fin) o marca jornada completa.");
    inicioMin = i;
    finMin = f;
  }
  if (!planRepo.leerAgentes().some((a) => a.numero === numero.data)) error(`No existe el agente ${numero.data}.`);
  const tipoCodigo = texto(formData, "tipo");
  const tipo = planRepo.leerTiposAusencia().find((t) => t.codigo === tipoCodigo && t.activo);
  if (!tipo) error(`El tipo ${tipoCodigo} no existe o no está activo.`);

  const nueva = { inicioMin: inicioMin ?? 0, finMin: finMin ?? 1440 };
  const choca = planRepo
    .leerAusencias(desde.data, hasta.data)
    .find((x) => x.agenteNumero === numero.data && solapan(nueva, { inicioMin: x.inicioMin ?? 0, finMin: x.finMin ?? 1440 }));
  if (choca) error(`Se solapa con ${choca.tipoCodigo} del ${choca.desde} al ${choca.hasta}.`);

  const notas = texto(formData, "notas").slice(0, 300) || null;
  const id = planRepo.crearAusencia({
    agenteNumero: numero.data,
    tipoCodigo,
    desde: desde.data,
    hasta: hasta.data,
    inicioMin,
    finMin,
    notas,
    creadoPor: usuario.username,
  });
  const horas = inicioMin == null ? "jornada completa" : `${hora(inicioMin)}-${hora(finMin ?? 1440)}`;
  await auditar(
    usuario,
    "plan_ausencia",
    `mes=${desde.data.slice(0, 7)} alta #${id} ${numero.data} ${tipoCodigo} ${desde.data}..${hasta.data} ${horas}${notas ? ` · ${notas}` : ""} (desde RRHH)`,
  );
  volverDia(volverA.data, numero.data, "creado", `${tipo.nombre} apuntada del ${desde.data} al ${hasta.data}.`);
}

export async function borrarAusenciaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const volverA = esquemaFechaISO.safeParse(texto(formData, "volver"));
  const id = Number(formData.get("id"));
  if (!volverA.success || !Number.isInteger(id) || id <= 0) redirect("/rrhh");
  const fila = planRepo.borrarAusencia(id);
  if (fila) {
    const horas = fila.inicioMin == null ? "jornada completa" : `${fila.inicioMin}-${fila.finMin} min`;
    await auditar(
      usuario,
      "plan_ausencia",
      `mes=${fila.desde.slice(0, 7)} baja #${id} ${fila.agenteNumero} ${fila.tipoCodigo} ${fila.desde}..${fila.hasta} ${horas} (desde RRHH)`,
    );
  }
  volverDia(volverA.data, fila?.agenteNumero ?? null, "borrado", "Ausencia borrada.");
}

// ---------- Configuración: personas ----------

/** «38», «37,5» → número (null si vacío; NaN si no es un número). */
function horasContrato(v: string): number | null {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.round(n * 100) / 100 : Number.NaN;
}

export async function guardarPersonaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const numero = esquemaNumero.safeParse(texto(formData, "persona"));
  if (!numero.success) volverConfig("error_datos", "Persona no válida.");
  const ancla = `p-${numero.data}`;
  const contrato = horasContrato(texto(formData, "contrato"));
  if (Number.isNaN(contrato)) volverConfig("error_datos", "El contrato son horas a la semana (por ejemplo 38 o 37,5).", ancla);
  const excluida = formData.get("excluida") === "on";
  // Grupo: vacío = automático
  const grupoTexto = texto(formData, "grupo");
  if (grupoTexto !== "" && !esGrupo(grupoTexto)) volverConfig("error_datos", "Grupo no válido.", ancla);
  const grupo = grupoTexto === "" ? null : grupoTexto;
  const notas = texto(formData, "notas").slice(0, 300) || null;

  // Horario: un tramo por día; vacío = libre
  const horario: HorarioSemana = {};
  let cambiaHorario = false;
  if (formData.get("conHorario") === "1") {
    cambiaHorario = true;
    for (const d of DIAS_SEMANA) {
      const tramos: { inicioMin: number; finMin: number }[] = [];
      for (let t = 1; t <= MAX_TRAMOS_DIA; t++) {
        const i = minutosDeHora(texto(formData, `ini${d}_${t}`));
        const f = minutosDeHora(texto(formData, `fin${d}_${t}`));
        if (i == null && f == null) continue;
        if (i == null || f == null || i === "error" || f === "error" || f <= i) {
          volverConfig("error_datos", "Cada tramo lleva hora de entrada y de salida (HH:MM), o las dos vacías.", ancla);
        }
        tramos.push({ inicioMin: i, finMin: f });
      }
      tramos.sort((a, b) => a.inicioMin - b.inicioMin);
      if (tramos.length === 2 && tramos[1].inicioMin < tramos[0].finMin) {
        volverConfig("error_datos", "Los dos tramos de un día no pueden pisarse: la tarde empieza después de acabar la mañana.", ancla);
      }
      if (tramos.length > 0) horario[d] = tramos;
    }
  }

  const antes = repo.guardarPersona({ agenteNumero: numero.data, contratoSemanalH: contrato, excluida, notas, grupo, autor: usuario.username });
  if (cambiaHorario) repo.guardarHorario(numero.data, horario, usuario.username);
  const textoHorario = cambiaHorario
    ? ` horario ${
        DIAS_SEMANA.flatMap((d) => {
          const tramos = horario[d] ?? [];
          return tramos.length ? [`${d}:${tramos.map((t) => `${hora(t.inicioMin)}-${hora(t.finMin)}`).join("+")}`] : [];
        }).join(" ") || "ninguno"
      }`
    : "";
  await auditar(
    usuario,
    "rrhh_config",
    `persona ${numero.data}: contrato ${antes?.contratoSemanalH ?? "—"} → ${contrato ?? "—"}, excluida ${antes?.excluida ?? false} → ${excluida}, grupo ${antes?.grupo ?? "automático"} → ${grupo ?? "automático"}${textoHorario}`,
  );
  volverConfig("guardado", `Persona ${numero.data} guardada.`, ancla);
}

export async function volverAprendidoAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const numero = esquemaNumero.safeParse(texto(formData, "persona"));
  if (!numero.success) volverConfig("error_datos", "Persona no válida.");
  repo.volverAAprendido(numero.data, usuario.username);
  await auditar(usuario, "rrhh_config", `persona ${numero.data}: vuelve al horario aprendido`);
  volverConfig("guardado", `La persona ${numero.data} vuelve a su horario aprendido.`, `p-${numero.data}`);
}

// ---------- Configuración: motivos de pausa ----------

export async function guardarMotivosAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const config: ConfigMotivos = {};
  for (const [clave, valor] of formData.entries()) {
    const m = /^motivo-(-?\d+)$/.exec(clave);
    if (!m || !CATEGORIAS_MOTIVO.includes(String(valor) as CategoriaMotivo)) continue;
    // Solo lo que cambia respecto a lo de por defecto (si cambia el defecto en el código, se nota)
    if (formData.get(`defecto-${m[1]}`) === String(valor)) continue;
    config[m[1]] = String(valor) as CategoriaMotivo;
  }
  const antes = repo.leerConfigMotivosRrhh();
  repo.guardarConfigMotivosRrhh(config);
  const cambios = Object.keys({ ...antes, ...config })
    .filter((k) => antes[k] !== config[k])
    .map((k) => `${k}: ${antes[k] ?? "por defecto"} → ${config[k] ?? "por defecto"}`);
  await auditar(usuario, "rrhh_config", `motivos de pausa: ${cambios.join(", ") || "sin cambios"}`);
  volverConfig("guardado", "Motivos de pausa guardados.", "motivos");
}

// ---------- Configuración: tipos de ausencia (los de Planificación) ----------

const esquemaTipo = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, "el código son letras o números, sin espacios (hasta 10)"),
  nombre: z.string().trim().min(1, "falta el nombre").max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color no válido"),
});

export async function guardarTipoAusenciaAccion(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const datos = esquemaTipo.safeParse({ codigo: texto(formData, "codigo"), nombre: texto(formData, "nombre"), color: texto(formData, "color") || "#BFBFBF" });
  if (!datos.success) volverConfig("error_datos", datos.error.issues[0]?.message ?? "Datos no válidos.", "tipos");
  if (formData.get("nuevo") === "1" && repo.leerTiposAusencia().some((t) => t.codigo === datos.data.codigo)) {
    volverConfig("error_datos", `Ya hay un tipo con el código ${datos.data.codigo}: cámbialo en su fila.`, "tipos");
  }
  const valores = {
    ...datos.data,
    computaComoTrabajada: formData.get("trabajada") === "on",
    activo: formData.get("activo") === "on",
  };
  const antes = repo.guardarTipoAusencia(valores);
  const desc = (t: { nombre: string; computaComoTrabajada: boolean; activo: boolean }) =>
    `«${t.nombre}» ${t.computaComoTrabajada ? "trabajada" : "no trabajada"}${t.activo ? "" : " (inactivo)"}`;
  await auditar(usuario, "plan_config", `tipo de ausencia ${valores.codigo}: ${antes ? `${desc(antes)} → ` : "alta "}${desc(valores)} (desde RRHH)`);
  volverConfig("guardado", `Tipo ${valores.codigo} guardado.`, "tipos");
}
