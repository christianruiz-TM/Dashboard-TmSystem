"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { configCallback, guardarConfigCallback } from "@/lib/callback-servidor";
import { leerConfigCallback, type ConfigCallbackServicio } from "@/lib/callback";
import { enviarCorreo } from "@/lib/correo";
import { nombresCalendarios } from "@/lib/planificacion/calendarios";
import { esIvr, listaServicios } from "@/lib/rdb/queries/servicios";

// ============================================================
// Administración → Callback (12/11/2026): qué clientes y campañas tienen
// callback, con qué calendario se mide el tiempo hasta devolver, y la alerta
// «callback sin funcionar» (umbral y correo de la herramienta de tickets).
// Solo admin; cada cambio queda en audit_log (config_callback).
// ============================================================

const RUTA = "/admin/callback";

async function requireAdmin() {
  const usuario = await obtenerSesion();
  if (!usuario || usuario.rol !== "admin") redirect("/login");
  return usuario;
}

function volverCon(resultado: string, detalle?: string): never {
  revalidatePath(RUTA);
  redirect(`${RUTA}?msg=${resultado}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ""}`);
}

async function auditar(detalle: string) {
  const admin = await requireAdmin();
  registrarAuditoria({ accion: "config_callback", userId: admin.id, username: admin.username, detalle, ip: await ipPeticion() });
}

/** Alta o cambio de un cliente con callback. */
export async function guardarServicioCallback(formData: FormData): Promise<void> {
  await requireAdmin();
  const servicio = String(formData.get("servicio") ?? "").trim();
  const servicios = await listaServicios();
  const datos = servicios.find((s) => s.servicio === servicio);
  if (!datos) volverCon("error_datos", "Ese servicio no existe en la centralita.");
  const calendario = String(formData.get("calendario") ?? "").trim() || null;
  if (calendario && !nombresCalendarios().includes(calendario)) volverCon("error_datos", "Ese calendario no existe.");
  const deAgentes = datos.campanias.filter((c) => !esIvr(c));
  const todas = formData.get("todas") === "1";
  const elegidas = formData.getAll("campania").map(String).filter((c) => deAgentes.includes(c));
  if (!todas && elegidas.length === 0) volverCon("error_datos", "Elige al menos una campaña o marca «Todas».");
  const nuevo: ConfigCallbackServicio = { servicio, calendario, campanias: todas ? null : elegidas.sort() };
  const config = configCallback();
  const servicios2 = config.servicios.filter((s) => s.servicio !== servicio).concat([nuevo]);
  guardarConfigCallback({ ...config, servicios: servicios2.sort((a, b) => a.servicio.localeCompare(b.servicio, "es")) });
  await auditar(
    `${servicio}: calendario ${calendario ?? "(reloj)"}, campañas ${todas ? "todas" : elegidas.join(", ")}`,
  );
  volverCon("guardado");
}

export async function quitarServicioCallback(formData: FormData): Promise<void> {
  await requireAdmin();
  const servicio = String(formData.get("servicio") ?? "");
  const config = configCallback();
  guardarConfigCallback({ ...config, servicios: config.servicios.filter((s) => s.servicio !== servicio) });
  await auditar(`${servicio}: quitado`);
  volverCon("borrado");
}

/** Umbral de la alerta y correo de la herramienta de tickets. */
export async function guardarAlertaCallback(formData: FormData): Promise<void> {
  await requireAdmin();
  const umbral = Number(formData.get("umbral"));
  const destinatario = String(formData.get("destinatario") ?? "").trim();
  const config = configCallback();
  // leerConfigCallback valida (y descarta lo que no vale): se comprueba que lo pedido sobrevive
  const nueva = leerConfigCallback(JSON.stringify({ ...config, umbralAlerta: umbral, destinatario }));
  if (nueva.umbralAlerta !== umbral || nueva.destinatario !== destinatario) {
    volverCon("error_datos", "El umbral va de 1 a 500 y el correo tiene que ser una dirección válida.");
  }
  guardarConfigCallback(nueva);
  await auditar(`alerta: umbral ${umbral}, correo ${destinatario}`);
  volverCon("guardado");
}

/** Correo de prueba al destinatario de los tickets (para comprobar el SMTP). */
export async function correoPruebaCallback(): Promise<void> {
  await requireAdmin();
  const config = configCallback();
  try {
    await enviarCorreo({
      para: config.destinatario,
      asunto: "[Dashboard] Prueba del aviso de callback",
      texto:
        "Correo de prueba del dashboard de TmSystem (Administración → Callback).\n\n" +
        "Si llega a la herramienta de tickets, el aviso «callback sin funcionar» podrá abrir tickets solo. " +
        "Este se puede cerrar sin más.",
    });
  } catch (e) {
    volverCon("error_correo", e instanceof Error ? e.message : String(e));
  }
  await auditar(`correo de prueba a ${config.destinatario}`);
  volverCon("correo_enviado");
}
