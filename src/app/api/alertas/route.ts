import { NextResponse } from "next/server";
import { veAlertas } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { campanaDeUsuario, versionPanel } from "@/lib/alertas-servidor";

/**
 * Campana de alertas (polling cada 60 s desde cualquier página): las alertas
 * de ahora, las preferencias del usuario y la versión del panel (para pedir
 * que se recargue tras un despliegue). Lleva nombres de agentes: solo roles
 * internos (y admin).
 */
export async function GET() {
  const usuario = await obtenerSesion();
  if (!usuario || !veAlertas(usuario.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(
      { ...(await campanaDeUsuario(usuario.id)), version: versionPanel() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error consultando las alertas" }, { status: 502 });
  }
}
