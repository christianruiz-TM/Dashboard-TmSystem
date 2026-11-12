// NOTA: solo servidor. Envío de correos (12/11/2026): el aviso «callback sin
// funcionar» abre un ticket en la herramienta de tickets mandando un correo a
// su buzón (dtecnico@tmsystem.es por defecto, Administración → Callback).
// SMTP por variables de entorno (.env.example): sin SMTP_HOST no se envía nada.
// Mismos nombres y valores que la herramienta de tickets (/opt/tmsystem/app/.env:
// SMTP_PASSWORD, SMTP_SECURE=true|false), para poder copiar sus líneas tal cual.
// OJO con SMTP_FROM: la herramienta IGNORA los correos de su propio remitente
// (soporte@tmsystem.es, anti-bucle) y los de remitentes «noreply»; el
// dashboard tiene que enviar con otro (dtecnico@tmsystem.es, la cuenta SMTP).
import nodemailer from "nodemailer";

export interface EstadoCorreo {
  configurado: boolean;
  /** «smtp.ejemplo.es:587 como usuario@…» (sin la contraseña), para el admin. */
  descripcion: string;
}

export function estadoCorreo(): EstadoCorreo {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return { configurado: false, descripcion: "Sin servidor de correo (SMTP_HOST vacío en el .env)" };
  const puerto = Number(process.env.SMTP_PORT) || 587;
  const usuario = process.env.SMTP_USER?.trim();
  return { configurado: true, descripcion: `${host}:${puerto}${usuario ? ` como ${usuario}` : " sin usuario"}` };
}

/** Envía un correo de texto. Lanza un error si no hay SMTP o el servidor lo rechaza. */
export async function enviarCorreo(c: { para: string; asunto: string; texto: string }): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) throw new Error("No hay servidor de correo configurado (SMTP_HOST)");
  const usuario = process.env.SMTP_USER?.trim() || undefined;
  const transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: ["1", "true"].includes((process.env.SMTP_SECURE ?? "").trim().toLowerCase()),
    auth: usuario ? { user: usuario, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  await transporte.sendMail({
    from: process.env.SMTP_FROM?.trim() || usuario,
    to: c.para,
    subject: c.asunto,
    text: c.texto,
  });
}
