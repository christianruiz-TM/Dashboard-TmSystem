import { NextResponse, type NextRequest } from "next/server";
import { ROLES_SUPERVISION } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { campoContactoDe, configsResultados, tiposCampaniaDe } from "@/lib/db/resultados";
import { FORMATO_FECHA_HORA, generarXlsx, respuestaXlsx } from "@/lib/export/xlsx";
import {
  definicionExportContactos,
  filasExportContactos,
  nombreArchivoExport,
} from "@/lib/export-contactos";
import { esquemaRango, motivoRangoInvalido } from "@/lib/fechas";
import { filtrarPorTipo, leerFiltroCampo, seleccionTipo } from "@/lib/resultados-actividad";
import { contactosFinalizadosExport } from "@/lib/rdb/queries/resultados-actividad";
import { campaniasEfectivas, listaServicios } from "@/lib/rdb/queries/servicios";

/**
 * Excel de contactos finalizados de Supervisión → Resultados (solo los clientes
 * con columnas definidas en lib/export-contactos.ts: GrupoHuertas). Mismos
 * filtros que la pestaña: ?servicio=&desde=&hasta=&tipo=&campo=&modo=&ivr=,
 * así que salen exactamente los finalizados que se están viendo.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_SUPERVISION.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const params = peticion.nextUrl.searchParams;
  const rango = esquemaRango.safeParse({ desde: params.get("desde"), hasta: params.get("hasta") });
  if (!rango.success) {
    return NextResponse.json({ error: motivoRangoInvalido(rango) }, { status: 400 });
  }
  const { desde, hasta } = rango.data;
  const servicio = params.get("servicio") ?? "";
  const columnas = definicionExportContactos(servicio);
  if (!columnas || !(await listaServicios()).some((s) => s.servicio === servicio)) {
    return NextResponse.json({ error: "Este cliente no tiene el Excel de contactos" }, { status: 404 });
  }

  // Las campañas y el dato del contacto, como en la página (supervision/page.tsx)
  const incluirIvr = params.get("ivr") === "1";
  const tipos = tiposCampaniaDe(servicio);
  const tipo = seleccionTipo(params.get("tipo") ?? undefined, tipos);
  const campanias = filtrarPorTipo((await campaniasEfectivas(servicio, incluirIvr)) ?? [], tipos, tipo);
  const campo = campoContactoDe(servicio);
  const filtro = campo ? leerFiltroCampo(params.get("campo") ?? undefined, params.get("modo") ?? undefined) : null;

  const { contactos, textos } = await contactosFinalizadosExport(
    desde,
    hasta,
    servicio,
    campanias,
    configsResultados(),
    campo ? { servicio, campo, filtro } : null,
    columnas,
  );

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle:
      `contactos finalizados ${servicio} ${desde}..${hasta} (${contactos.length} filas` +
      `${tipo !== "todas" ? `, ${tipo}` : ""}${filtro ? `, ${campo?.etiqueta} ${filtro.modo} «${filtro.valor}»` : ""})`,
    ip: await ipPeticion(),
  });
  // XLSX y no CSV (11/11/2026): textos como texto (nada se lee como fórmula,
  // los teléfonos conservan el + y el 0) y la fecha como fecha
  const filas = filasExportContactos(columnas, contactos, textos).map((f) =>
    Object.fromEntries(f.map((v, i) => [`c${i}`, v])),
  );
  return respuestaXlsx(
    nombreArchivoExport(servicio, desde, hasta, filtro != null || tipo !== "todas"),
    await generarXlsx(
      "Contactos",
      columnas.map((c, i) => ({
        cabecera: c.titulo,
        clave: `c${i}`,
        ancho: c.origen.tipo === "fecha" ? 20 : 18,
        formato: c.origen.tipo === "fecha" ? FORMATO_FECHA_HORA : undefined,
      })),
      filas,
    ),
  );
}
