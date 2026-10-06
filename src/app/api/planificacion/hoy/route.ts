import { NextResponse } from "next/server";
import { ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { datosHoy } from "@/lib/planificacion/seguimiento";

/**
 * Vista «Hoy» de planificación (polling cada 60 s): el plan del día frente a
 * quién está conectado y con qué usuario, y las alertas. Lleva nombres de
 * agentes: solo roles internos que leen la planificación (y admin). Las
 * consultas a RDBv2 van cacheadas 60 s y compartidas entre quienes miran.
 */
export async function GET() {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_PLAN_LECTURA.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await datosHoy());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error consultando los datos de hoy" }, { status: 502 });
  }
}
