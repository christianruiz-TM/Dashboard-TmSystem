import { NextResponse, type NextRequest } from "next/server";
import { ROLES_SUPERVISION } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { datosSupervisionHoy } from "@/lib/supervision-servidor";
import { leerSeccion } from "@/lib/supervision-secciones";

/**
 * Datos de supervisión intradía (polling cada 60 s desde el panel). Solo los
 * de la pestaña abierta (`?seccion=`, 12/11/2026), más la franja «Ahora»
 * (plantilla, alertas y KPIs de campaña), que se ve en todas.
 * La capa rdb ya cachea 60 s, así que aunque haya varios supervisores
 * mirando, RDBv2 recibe como mucho una tanda de queries por minuto.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_SUPERVISION.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const q = peticion.nextUrl.searchParams;
    const servicio = q.get("servicio") ?? undefined;
    const datos = await datosSupervisionHoy(servicio, q.get("ivr") === "1", leerSeccion(q.get("seccion")));
    return NextResponse.json(datos);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error consultando RDBv2" },
      { status: 502 },
    );
  }
}
