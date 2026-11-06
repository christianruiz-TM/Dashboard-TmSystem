import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { obtenerSesion } from "@/lib/auth/session";
import { cabeceraAdjunto } from "@/lib/export/adjunto";
import { esquemaRango, motivoRangoInvalido } from "@/lib/fechas";
import { servicioDeMiServicio } from "@/lib/mi-servicio/acceso";
import { informeHtml, nombreFicheroInforme } from "@/lib/mi-servicio/informe";
import { cargarMiServicio } from "@/lib/mi-servicio/servidor";

/** Comentarios del informe: texto libre, con un tope razonable. */
const MAX_COMENTARIOS = 4000;

const esquemaPeticion = z.object({
  servicio: z.string().max(200).optional(),
  desde: z.string(),
  hasta: z.string(),
  tipo: z.string().max(200).optional(),
  campania: z.string().max(200).optional(),
  comentarios: z.string().max(MAX_COMENTARIOS).optional(),
});

/**
 * Informe de «Mi servicio» (06/11/2026): un HTML único, con lo que hay en
 * pantalla (cliente, periodo y filtros) y los comentarios de quien lo
 * descarga. POST con JSON: un formulario de otra web no puede mandar
 * application/json sin permiso del navegador, así que nadie descarga (ni
 * deja en la auditoría) un informe en nombre de otro. El alcance lo decide
 * servicioDeMiServicio, como en la página. Cada descarga queda en audit_log.
 */
export async function POST(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || usuario.mustChangePassword) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!(peticion.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Formato no admitido" }, { status: 415 });
  }
  const cuerpo = esquemaPeticion.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const rango = esquemaRango.safeParse({ desde: cuerpo.data.desde, hasta: cuerpo.data.hasta });
  if (!rango.success) {
    return NextResponse.json({ error: motivoRangoInvalido(rango) }, { status: 400 });
  }
  const acceso = await servicioDeMiServicio(usuario, cuerpo.data.servicio);
  if (!acceso.servicio) {
    return NextResponse.json({ error: "Sin acceso a ese cliente" }, { status: 403 });
  }

  const { desde, hasta } = rango.data;
  const carga = await cargarMiServicio({
    servicio: acceso.servicio,
    desde,
    hasta,
    tipo: cuerpo.data.tipo,
    campania: cuerpo.data.campania,
  });
  const comentarios = cuerpo.data.comentarios?.trim() || null;
  const html = informeHtml(carga.datos, { comentarios });

  const filtros = [
    carga.datos.filtro.tipo ? `tipo=${carga.datos.filtro.tipo}` : "",
    carga.datos.filtro.campania ? `campaña=${carga.datos.filtro.campania}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  registrarAuditoria({
    accion: "informe_mi_servicio",
    userId: usuario.id,
    username: usuario.username,
    detalle: `servicio=${acceso.servicio} ${desde}..${hasta}${filtros ? ` ${filtros}` : ""}${comentarios ? ` comentarios=«${comentarios}»` : ""}`,
    ip: await ipPeticion(),
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": cabeceraAdjunto(nombreFicheroInforme(carga.datos)),
      "Cache-Control": "no-store",
    },
  });
}
