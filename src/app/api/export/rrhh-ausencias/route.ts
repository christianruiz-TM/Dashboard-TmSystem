import { NextResponse, type NextRequest } from "next/server";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { ROLES_RRHH_LECTURA } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { respuestaXlsx } from "@/lib/export/xlsx";
import { esquemaFechaISO, esquemaRango, hoyISO } from "@/lib/fechas";
import { excelAusenciasDia, excelAusenciasPeriodo } from "@/lib/rrhh/excel";
import { leerGrupo } from "@/lib/rrhh/grupos";
import { datosDia, datosPeriodo, filtrarDia, filtrarPeriodo, MAX_DIAS_PERIODO } from "@/lib/rrhh/servidor";

/**
 * Excel del panel de RRHH:
 * - ?fecha=YYYY-MM-DD → el día (una fila por persona y otra hoja con cada
 *   tramo, por orden de hora).
 * - ?desde=&hasta= → «Por agente» (una fila por persona, otra por persona y
 *   motivo, y las ausencias apuntadas).
 * Tiempos en horas con 2 decimales. Cada descarga queda en audit_log.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_RRHH_LECTURA.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const params = peticion.nextUrl.searchParams;
  const hoy = hoyISO();
  // Solo un grupo (Bolsas · Socios · GH), como en pantalla
  const grupo = leerGrupo(params.get("grupo"));
  const sufijo = grupo ? `_${grupo}` : "";

  let contenido: Buffer;
  let personas: number;
  let nombre: string;
  let detalle: string;
  if (params.has("desde") || params.has("hasta")) {
    const r = esquemaRango.safeParse({ desde: params.get("desde"), hasta: params.get("hasta") });
    if (!r.success || r.data.desde > hoy) return NextResponse.json({ error: "Periodo no válido" }, { status: 400 });
    const dias = Math.round((Date.parse(r.data.hasta) - Date.parse(r.data.desde)) / 86_400_000) + 1;
    if (dias > MAX_DIAS_PERIODO) return NextResponse.json({ error: `Como mucho ${MAX_DIAS_PERIODO} días` }, { status: 400 });
    ({ contenido, personas } = await excelAusenciasPeriodo(filtrarPeriodo(await datosPeriodo(r.data.desde, r.data.hasta), grupo)));
    nombre = `ausencias_por_agente_${r.data.desde}_${r.data.hasta}${sufijo}.xlsx`;
    detalle = `rrhh-ausencias por agente ${r.data.desde}..${r.data.hasta}${grupo ? ` grupo ${grupo}` : ""}`;
  } else {
    const pedida = esquemaFechaISO.safeParse(params.get("fecha") ?? hoy);
    if (!pedida.success || pedida.data > hoy) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
    ({ contenido, personas } = await excelAusenciasDia(filtrarDia(await datosDia(pedida.data), grupo)));
    nombre = `ausencias_${pedida.data}${sufijo}.xlsx`;
    detalle = `rrhh-ausencias ${pedida.data}${grupo ? ` grupo ${grupo}` : ""}`;
  }

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `${detalle} (${personas} personas)`,
    ip: await ipPeticion(),
  });
  return respuestaXlsx(nombre, contenido);
}
