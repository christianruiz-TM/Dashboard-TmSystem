import { NextResponse, type NextRequest } from "next/server";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { ROLES_SUPERVISION } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { fechaParaExcel } from "@/lib/export-contactos";
import { FORMATO_FECHA_HORA, generarXlsx, respuestaXlsx } from "@/lib/export/xlsx";
import { infoEstado } from "@/lib/fallidos";
import { hoyISO } from "@/lib/fechas";
import { compararTexto } from "@/lib/orden";
import { contactosFallidos } from "@/lib/rdb/queries/fallidos";
import { alcanceTipo } from "@/lib/tipo-panel-servidor";

/**
 * Excel de los contactos fallidos de ahora (19/11/2026, Supervisión →
 * Fallidos). Mismos filtros que la pestaña: ?servicio=&tipo=&ivr=; sin
 * cliente, de todos. Para buscarlos y corregirlos en la herramienta de
 * supervisor de Altitude.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_SUPERVISION.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const q = peticion.nextUrl.searchParams;
  const servicio = q.get("servicio") || undefined;
  // Las campañas, como en el panel (cliente, tipo de campaña e IVR)
  const alcance = await alcanceTipo(servicio, q.get("ivr") === "1", q.get("tipo"));
  const lista = [...(await contactosFallidos(alcance.campanias))].sort(
    (a, b) => compararTexto(a.campania, b.campania) || b.fecha.getTime() - a.fecha.getTime(),
  );

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `contactos fallidos ${servicio ?? "todos"}${alcance.filtro.tipo !== "todas" ? ` (${alcance.filtro.tipo})` : ""}: ${lista.length} filas`,
    ip: await ipPeticion(),
  });

  const filas = lista.map((c) => {
    const info = infoEstado(c.estado);
    return {
      campania: c.campania,
      contacto: c.contacto,
      idUnico: c.idUnico ?? "",
      nombre: c.nombre ?? "",
      telefono: c.telefono ?? "",
      quePasa: info.texto,
      estado: c.estado,
      queHacer: info.queHacer,
      fecha: fechaParaExcel(c.fecha),
      agente: c.agente ?? "",
    };
  });
  return respuestaXlsx(
    `contactos-fallidos_${servicio ?? "todos"}_${hoyISO()}.xlsx`,
    await generarXlsx(
      "Fallidos",
      [
        { cabecera: "Campaña", clave: "campania", ancho: 22 },
        { cabecera: "Contacto (código Altitude)", clave: "contacto", ancho: 14 },
        { cabecera: "ID único", clave: "idUnico", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 26 },
        { cabecera: "Teléfono", clave: "telefono", ancho: 15 },
        { cabecera: "Qué le pasa", clave: "quePasa", ancho: 40 },
        { cabecera: "Estado en Altitude", clave: "estado", ancho: 22 },
        { cabecera: "Qué hacer", clave: "queHacer", ancho: 60 },
        { cabecera: "Último movimiento", clave: "fecha", ancho: 20, formato: FORMATO_FECHA_HORA },
        { cabecera: "Última agente", clave: "agente", ancho: 16 },
      ],
      filas,
    ),
  );
}
