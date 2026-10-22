import { NextResponse, type NextRequest } from "next/server";
import { ROLES_SUPERVISION } from "@/lib/auth/rbac";
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
import { calidadBaseDatosRango } from "@/lib/rdb/queries/calidad-bd";
import { calidadBaseDatos } from "@/lib/calidad-bd";
import { tiposCampaniaDe } from "@/lib/db/resultados";
import { totalResultados } from "@/lib/resultados-cabecera";

/**
 * Datos de supervisión intradía (polling cada 60 s desde el panel).
 * La capa rdb ya cachea 60 s, así que aunque haya varios supervisores
 * mirando, RDBv2 recibe como mucho una tanda de queries por minuto.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_SUPERVISION.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const umbral = umbralSlaSeg();
    const servicio = peticion.nextUrl.searchParams.get("servicio") ?? undefined;
    const incluirIvr = peticion.nextUrl.searchParams.get("ivr") === "1";
    const camp = await campaniasEfectivas(servicio, incluirIvr);
    const campServicio = await campaniasDeServicio(servicio);
    const [agentes, kpis, top, ivr, plan, ratios, intentos, resultados] = await Promise.all([
      estadoAgentes(camp),
      kpisCampaniasHoy(umbral, camp),
      agentesHoy(camp),
      metricasIvr(hoyISO(), hoyISO(), campServicio),
      alertasPlanificacion(),
      ratiosExitoHoy(camp),
      calidadBaseDatosRango(hoyISO(), hoyISO(), camp),
      totalResultados(hoyISO(), hoyISO(), camp),
    ]);
    // Los tipos de campaña del cliente agrupan la tabla, igual que en la página
    const tipos = servicio ? tiposCampaniaDe(servicio) : [];
    return NextResponse.json({
      agentes,
      kpis,
      top,
      ivr,
      plan,
      ratios,
      resultados,
      calidad: calidadBaseDatos(intentos.filas, intentos.contactos, tipos),
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
