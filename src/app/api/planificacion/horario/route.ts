import { format } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { cabeceraAdjunto } from "@/lib/export/adjunto";
import { horarioHtml } from "@/lib/planificacion/horario-html";
import { horarioPdf } from "@/lib/planificacion/horario-pdf";
import { horarioPublicado } from "@/lib/planificacion/vistas";

/**
 * Copia del plan PUBLICADO del mes para enviar a las agentes, sin cliente:
 * `formato=pdf` (una página A4 apaisada con todas) o `formato=html` (un solo
 * fichero interactivo: cada una elige su nombre y puede pasar sus turnos al
 * calendario del móvil). Siempre la publicada, aunque haya un borrador.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_PLAN_LECTURA.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const mes = peticion.nextUrl.searchParams.get("mes") ?? "";
  const formato = peticion.nextUrl.searchParams.get("formato") ?? "pdf";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: "Mes no válido (YYYY-MM)" }, { status: 400 });
  }
  if (formato !== "pdf" && formato !== "html") {
    return NextResponse.json({ error: "Formato no válido (pdf o html)" }, { status: 400 });
  }
  const horario = horarioPublicado(mes);
  if (!horario) {
    return NextResponse.json({ error: `${mes} no tiene ningún plan publicado` }, { status: 404 });
  }
  // Hora local del servidor (TZ=Europe/Madrid en Docker), nunca toISOString
  const generado = format(new Date(), "dd/MM/yyyy HH:mm");
  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `planificacion horario agentes ${formato} ${mes} v${horario.version.numero} (${horario.filas.length} agentes)`,
    ip: await ipPeticion(),
  });
  const nombre = `horario_${mes}_v${horario.version.numero}`;
  if (formato === "pdf") {
    const contenido = await horarioPdf(horario, { generado });
    return new Response(new Uint8Array(contenido), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": cabeceraAdjunto(`${nombre}.pdf`),
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(horarioHtml(horario, { generado }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": cabeceraAdjunto(`${nombre}.html`),
      "Cache-Control": "no-store",
    },
  });
}
