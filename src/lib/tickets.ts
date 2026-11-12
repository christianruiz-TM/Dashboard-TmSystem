// NOTA: solo servidor. Tickets en la herramienta de tickets de TmSystem
// (http://192.168.151.38:8080, el mismo servidor) por su API (12/11/2026).
// El correo no sirve para abrirlos: la herramienta lee la carpeta «Tickets»
// del Gmail de dtecnico@, un correo de dtecnico@ a sí mismo no llega allí y
// uno desde soporte@ lo descarta como bucle (probado el 12/11/2026). La API
// entra con un usuario propio del dashboard en la herramienta:
//   POST {TICKETS_API_URL}/auth/login {email, password} → {accessToken}
//   POST {TICKETS_API_URL}/tickets {subject, description, priority, channel}
// Con un usuario final la prioridad se ignora (entra como «media»): la
// decide quien atiende. Variables en .env.example (TICKETS_*).

export interface EstadoTickets {
  configurado: boolean;
  /** «http://…/api como dashboard@…» (sin la contraseña), para el admin. */
  descripcion: string;
}

function config() {
  const url = process.env.TICKETS_API_URL?.trim().replace(/\/+$/, "");
  const usuario = process.env.TICKETS_USUARIO?.trim();
  const password = process.env.TICKETS_PASSWORD ?? "";
  return url && usuario && password ? { url, usuario, password } : null;
}

export function estadoTickets(): EstadoTickets {
  const c = config();
  if (!c) return { configurado: false, descripcion: "Sin API de tickets (TICKETS_API_URL, TICKETS_USUARIO y TICKETS_PASSWORD en el .env)" };
  return { configurado: true, descripcion: `${c.url} como ${c.usuario}` };
}

/** Respuesta de la API: el mensaje de error que dé, o el estado HTTP. */
async function errorDe(r: Response, que: string): Promise<Error> {
  let detalle = "";
  try {
    const cuerpo = (await r.json()) as { message?: string | string[] };
    detalle = Array.isArray(cuerpo.message) ? cuerpo.message.join("; ") : (cuerpo.message ?? "");
  } catch {
    /* sin JSON */
  }
  return new Error(`${que}: HTTP ${r.status}${detalle ? ` (${detalle})` : ""}`);
}

/**
 * Crea un ticket y devuelve su código («TCK-0123») o su id. Lanza un error si
 * no hay API configurada o la herramienta lo rechaza.
 */
export async function crearTicket(t: {
  asunto: string;
  descripcion: string;
  prioridad?: "low" | "medium" | "high" | "urgent";
}): Promise<string> {
  const c = config();
  if (!c) throw new Error("No hay API de tickets configurada (TICKETS_API_URL, TICKETS_USUARIO, TICKETS_PASSWORD)");
  const login = await fetch(`${c.url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.usuario, password: c.password }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!login.ok) throw await errorDe(login, "Login en la herramienta de tickets");
  const { accessToken } = (await login.json()) as { accessToken?: string };
  if (!accessToken) throw new Error("Login en la herramienta de tickets: sin token en la respuesta");
  const r = await fetch(`${c.url}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      subject: t.asunto.slice(0, 200),
      description: t.descripcion.slice(0, 10_000),
      priority: t.prioridad ?? "high",
      channel: "internal",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw await errorDe(r, "Alta del ticket");
  const ticket = (await r.json()) as { code?: string; id?: string };
  return ticket.code ?? ticket.id ?? "(sin código)";
}
