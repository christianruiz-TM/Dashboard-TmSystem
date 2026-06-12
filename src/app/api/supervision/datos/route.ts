import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/auth/session";
import { umbralSlaSeg } from "@/lib/db/settings";
import { agentesHoy, estadoAgentes, kpisCampaniasHoy } from "@/lib/rdb/queries/supervision";

/**
 * Datos de supervisión intradía (polling cada 60 s desde el panel).
 * La capa rdb ya cachea 60 s, así que aunque haya varios supervisores
 * mirando, RDBv2 recibe como mucho una tanda de queries por minuto.
 */
export async function GET() {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "supervision")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const umbral = umbralSlaSeg();
    const [agentes, kpis, top] = await Promise.all([
      estadoAgentes(),
      kpisCampaniasHoy(umbral),
      agentesHoy(),
    ]);
    return NextResponse.json({
      agentes,
      kpis,
      top,
      umbral,
      actualizado: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error consultando RDBv2" },
      { status: 502 },
    );
  }
}
