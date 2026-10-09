import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/auth/session";
import { umbralSlaSeg } from "@/lib/db/settings";
import { hoyISO } from "@/lib/fechas";
import {
  agentesHoy,
  estadoAgentes,
  kpisCampaniasHoy,
  metricasIvr,
} from "@/lib/rdb/queries/supervision";
import { campaniasDeServicio, campaniasEfectivas } from "@/lib/rdb/queries/servicios";
import { ratiosExitoHoy } from "@/lib/rdb/queries/ratios-exito";
import { alertasPlanificacion } from "@/lib/planificacion/seguimiento";

/**
 * Datos de supervisión intradía (polling cada 60 s desde el panel).
 * La capa rdb ya cachea 60 s, así que aunque haya varios supervisores
 * mirando, RDBv2 recibe como mucho una tanda de queries por minuto.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "supervision")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const umbral = umbralSlaSeg();
    const servicio = peticion.nextUrl.searchParams.get("servicio") ?? undefined;
    const incluirIvr = peticion.nextUrl.searchParams.get("ivr") === "1";
    const camp = await campaniasEfectivas(servicio, incluirIvr);
    const campServicio = await campaniasDeServicio(servicio);
    const [agentes, kpis, top, ivr, plan, ratios] = await Promise.all([
      estadoAgentes(camp),
      kpisCampaniasHoy(umbral, camp),
      agentesHoy(camp),
      metricasIvr(hoyISO(), hoyISO(), campServicio),
      alertasPlanificacion(),
      ratiosExitoHoy(camp),
    ]);
    return NextResponse.json({
      agentes,
      kpis,
      top,
      ivr,
      plan,
      ratios,
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
