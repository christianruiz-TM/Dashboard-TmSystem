import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { NOMBRE_UNIDAD, calcularFacturacion } from "@/lib/facturacion";
import { esquemaRango, motivoRangoInvalido } from "@/lib/fechas";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import {
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";
import { generarCsv, respuestaCsv } from "@/lib/export/csv";
import { FORMATO_2_DECIMALES, generarXlsx, respuestaXlsx } from "@/lib/export/xlsx";

/** Export del módulo de facturación (CSV para Excel ES o XLSX). */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "operaciones")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = peticion.nextUrl.searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.get("desde"),
    hasta: params.get("hasta"),
  });
  if (!rango.success) {
    return NextResponse.json({ error: motivoRangoInvalido(rango) }, { status: 400 });
  }
  const { desde, hasta } = rango.data;
  const formato = params.get("formato") === "xlsx" ? "xlsx" : "csv";
  const servicios = await listaServicios();
  const camp = await campaniasEfectivas(
    params.get("servicio") ?? undefined,
    params.get("ivr") === "1",
  );

  const facturacion = calcularFacturacion(
    await unidadesPorCampania(desde, hasta, camp),
    mapaCampaniaServicio(servicios),
  );

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `operaciones ${formato} ${desde}..${hasta}`,
    ip: await ipPeticion(),
  });

  const nombreArchivo = `facturacion_${desde}_${hasta}.${formato}`;
  // Horas logadas/ready NO se exportan por campaña: los agentes blended las
  // duplican (~×13). La hora real es global (ver KPI de Operaciones). Por
  // campaña se usan las productivas (gestión real, sin duplicar).
  const columnas = [
    { cabecera: "Campaña", clave: "campania", ancho: 22 },
    { cabecera: "Horas productivas", clave: "horasProductivas", formato: FORMATO_2_DECIMALES },
    { cabecera: "Interacciones", clave: "interacciones" },
    { cabecera: "Atendidas", clave: "atendidas" },
    { cabecera: "Éxitos", clave: "exitos" },
    { cabecera: "Leads finalizados", clave: "leadsFinalizados" },
    { cabecera: "Unidades facturables", clave: "unidades", ancho: 34 },
    { cabecera: "Importe (EUR)", clave: "importe" },
  ];
  const filas = facturacion.map((f) => ({
    campania: f.campania,
    horasProductivas: f.medidas.horasProductivas,
    interacciones: f.medidas.interacciones,
    atendidas: f.medidas.atendidas,
    exitos: f.medidas.exitos,
    leadsFinalizados: f.medidas.leadsFinalizados,
    unidades: f.lineas.map((l) => NOMBRE_UNIDAD[l.unidad]).join(" + ") || "Sin configurar",
    importe: f.importeTotal,
  }));

  if (formato === "xlsx") {
    const contenido = await generarXlsx("Facturación", columnas, filas);
    return respuestaXlsx(nombreArchivo, contenido);
  }
  const csv = generarCsv(
    columnas.map((c) => c.cabecera),
    filas.map((f) => columnas.map((c) => f[c.clave as keyof typeof f] ?? "")),
  );
  return respuestaCsv(nombreArchivo, csv);
}
