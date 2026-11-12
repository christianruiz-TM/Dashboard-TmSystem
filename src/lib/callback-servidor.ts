// NOTA: solo servidor. Callback (12/11/2026): configuración en app_settings
// (`callback.config`, sin migración), horarios de atención desde los
// calendarios de planificación (copia de horarios_servicio de Altitude + los
// cambios a mano) e indicadores de un periodo. Lógica en lib/callback.ts.
import { format } from "date-fns";
import { registrarAuditoria } from "@/lib/auth/audit";
import { enviarCorreo, estadoCorreo } from "@/lib/correo";
import { crearTicket, estadoTickets } from "@/lib/tickets";
import { guardarAjuste, obtenerAjuste } from "@/lib/db/settings";
import { hoyISO } from "@/lib/fechas";
import { calendarioPlan } from "@/lib/planificacion/calendarios";
import { baseCallbackHoy, baseCallbackRango } from "@/lib/rdb/queries/callback";
import {
  alertasCallback,
  calcularCallback,
  correoAlertaCallback,
  horarioDeCalendario,
  leerConfigCallback,
  type AlertaCallback,
  type ConfigCallback,
  type HorarioDe,
  type ResultadoCallback,
} from "./callback";

const CLAVE_CONFIG = "callback.config";

export function configCallback(): ConfigCallback {
  return leerConfigCallback(obtenerAjuste(CLAVE_CONFIG, ""));
}

export function guardarConfigCallback(config: ConfigCallback): void {
  guardarAjuste(CLAVE_CONFIG, JSON.stringify(config));
}

/** Horario de atención de cada cliente con callback y calendario (los demás, reloj). */
export function horariosCallback(config: ConfigCallback): Record<string, HorarioDe> {
  const conCalendario = config.servicios.filter((s) => s.calendario);
  if (conCalendario.length === 0) return {};
  const cal = calendarioPlan();
  const horarios: Record<string, HorarioDe> = {};
  for (const s of conCalendario) {
    const festivos = new Set(cal.festivos.filter((f) => f.servicio === s.calendario).map((f) => f.fecha));
    const h = horarioDeCalendario(cal.horarios, s.calendario, festivos, cal.especiales[s.calendario!] ?? {});
    if (h) horarios[s.servicio] = h;
  }
  return horarios;
}

/** «YYYY-MM-DD HH:MM:SS» de ahora, en hora local (la de RDBv2, regla 14). */
export function ahoraLocal(): string {
  return format(new Date(), "yyyy-MM-dd HH:mm:ss");
}

/**
 * Indicadores de callback del periodo. `servicio`: solo ese cliente (si no
 * tiene callback, null); sin él, todos los configurados. Hoy (`desde` y
 * `hasta` = hoy) trae además los pendientes de los 7 días anteriores.
 */
export async function callbackPeriodo(
  desde: string,
  hasta: string,
  servicio?: string | null,
): Promise<ResultadoCallback | null> {
  const todo = configCallback();
  const config: ConfigCallback = servicio ? { ...todo, servicios: todo.servicios.filter((s) => s.servicio === servicio) } : todo;
  if (config.servicios.length === 0) return null;
  const nombres = config.servicios.map((s) => s.servicio);
  const hoy = hoyISO();
  const base = desde === hoy && hasta === hoy ? await baseCallbackHoy(nombres) : await baseCallbackRango(desde, hasta, nombres);
  return calcularCallback(base, config, horariosCallback(config), desde, ahoraLocal());
}

/** Clientes con el callback aparentemente roto ahora (campana y ticket). */
export async function alertasCallbackHoy(): Promise<AlertaCallback[]> {
  const config = configCallback();
  if (config.servicios.length === 0) return [];
  const base = await baseCallbackHoy(config.servicios.map((s) => s.servicio));
  return alertasCallback(base, config, horariosCallback(config), hoyISO(), ahoraLocal());
}

const claveTicket = (servicio: string) => `callback.ticket.${servicio}`;

export interface ResultadoTickets {
  alertas: AlertaCallback[];
  /** «GrupoHuertas: ticket TCK-0123» o «GrupoHuertas: correo (la API falló)». */
  enviados: string[];
  yaEnviados: string[];
  errores: string[];
}

/**
 * Abre un ticket por cada cliente con el callback sin funcionar, como mucho
 * uno por cliente y día (`callback.ticket.<servicio>` = fecha del último).
 * Por la API de la herramienta de tickets (lib/tickets.ts); si no está
 * configurada o falla, un correo de aviso al destinatario de la
 * configuración (el correo NO abre ticket: 12/11/2026). Lo lanza la tarea
 * programada (`npm run alertas:callback`, cada 10 minutos en horario), no
 * la pantalla: así sale aunque nadie tenga el panel abierto.
 */
export async function enviarTicketsCallback(opciones: { simular?: boolean } = {}): Promise<ResultadoTickets> {
  const config = configCallback();
  const hoy = hoyISO();
  const alertas = await alertasCallbackHoy();
  const res: ResultadoTickets = { alertas, enviados: [], yaEnviados: [], errores: [] };
  const url = process.env.URL_PANEL?.trim();
  for (const a of alertas) {
    if (obtenerAjuste(claveTicket(a.servicio), "") === hoy) {
      res.yaEnviados.push(a.servicio);
      continue;
    }
    const panel = url ? `${url.replace(/\/+$/, "")}/supervision?servicio=${encodeURIComponent(a.servicio)}` : null;
    const correo = correoAlertaCallback(a, panel);
    if (opciones.simular) {
      res.enviados.push(`${a.servicio}: ${estadoTickets().configurado ? "ticket por la API" : "correo"}`);
      continue;
    }
    const resumen = `${a.servicio}: ${a.rechazadas} rechazadas desde ${a.desde} sin ficha`;
    let fallo: string | null = null;
    if (estadoTickets().configurado) {
      try {
        const codigo = await crearTicket({ asunto: correo.asunto, descripcion: correo.texto, prioridad: "high" });
        guardarAjuste(claveTicket(a.servicio), hoy);
        res.enviados.push(`${a.servicio}: ticket ${codigo}`);
        registrarAuditoria({ accion: "ticket_callback", username: "tarea programada", detalle: `${resumen} → ticket ${codigo}` });
        continue;
      } catch (e) {
        fallo = e instanceof Error ? e.message : String(e);
        res.errores.push(`${a.servicio}: ${fallo}`);
      }
    }
    // Sin API o si ha fallado: al menos un correo de aviso
    if (!estadoCorreo().configurado) {
      if (!fallo) res.errores.push(`${a.servicio}: no hay API de tickets ni servidor de correo configurados`);
      continue;
    }
    try {
      await enviarCorreo({
        para: config.destinatario,
        asunto: correo.asunto,
        texto: fallo ? `${correo.texto}\n\n(No se pudo abrir el ticket por la API: ${fallo})` : correo.texto,
      });
      guardarAjuste(claveTicket(a.servicio), hoy);
      res.enviados.push(`${a.servicio}: correo a ${config.destinatario}${fallo ? " (la API falló)" : ""}`);
      registrarAuditoria({ accion: "ticket_callback", username: "tarea programada", detalle: `${resumen} → correo a ${config.destinatario}` });
    } catch (e) {
      res.errores.push(`${a.servicio}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return res;
}

/** Último ticket enviado de cada cliente configurado (para el admin). */
export function ultimosTicketsCallback(config: ConfigCallback = configCallback()): Record<string, string | null> {
  return Object.fromEntries(config.servicios.map((s) => [s.servicio, obtenerAjuste(claveTicket(s.servicio), "") || null]));
}
