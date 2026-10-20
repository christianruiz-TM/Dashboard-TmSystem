import { NextResponse, type NextRequest } from "next/server";
import { ROLES_OPERACIONES } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { filasFicheroGs, generarFicheroGs, unidadesExtraGs, type TipoFicheroGs } from "@/lib/albaranes-gs";
import { cierreVigente, lineasAjustadas } from "@/lib/db/facturacion";
import { configuracionFacturacion } from "@/lib/facturacion";
import { filasDeCierre } from "@/lib/facturacion-campania";
import { cabeceraAdjunto } from "@/lib/export/adjunto";

/**
 * Fichero de albaranes para GS de un mes CERRADO de un cliente
 * (?servicio=&mes=YYYY-MM&tipo=ventas|promociones): sale de lo guardado al
 * cerrar, con sus ajustes manuales, así que coincide con lo facturado aunque
 * luego cambien los datos.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_OPERACIONES.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const params = peticion.nextUrl.searchParams;
  const servicio = params.get("servicio") ?? "";
  const mes = params.get("mes") ?? "";
  const tipo: TipoFicheroGs = params.get("tipo") === "promociones" ? "promociones" : "ventas";
  if (!servicio || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: "Falta el cliente o el mes (YYYY-MM)" }, { status: 400 });
  }
  const cierre = cierreVigente(mes, servicio);
  if (!cierre) {
    return NextResponse.json({ error: `${mes} de ${servicio} no está cerrado: ciérralo antes de sacar los albaranes` }, { status: 409 });
  }

  // Una campaña con config propia que cobra contactos es de bbdd (promociones)
  // aunque ese mes no tenga ninguno
  const { porCampania, porServicio } = configuracionFacturacion();
  const esPromocion = (c: string | null) => !!c && (porCampania.get(c) ?? []).some((l) => l.unidad === "leads");
  // Con los ajustes manuales: lo quitado no va al albarán
  const vigentes = lineasAjustadas([cierre.id]).filter((l) => !l.quitada);
  const filasCierre = filasDeCierre(vigentes, servicio);
  const { filas, sinCodigo } = filasFicheroGs(filasCierre, tipo, esPromocion);
  // Columnas añadidas: los artículos de la tarifa del cliente (y de sus
  // campañas con tarifa propia del tipo de fichero) o con cantidad en el cierre
  const delTipo = filasCierre.filter((f) => filas.some((g) => g.codigoGs === f.codigoGs));
  const configuradas = [
    ...(porServicio.get(servicio) ?? []),
    ...delTipo.flatMap((f) => (f.campania ? (porCampania.get(f.campania) ?? []) : [])),
  ].map((l) => l.unidad);
  const extra = unidadesExtraGs(delTipo, tipo, configuradas);
  if (sinCodigo.length > 0) {
    return NextResponse.json(
      {
        error:
          `Hay campañas sin código de GS en el cierre: ${sinCodigo.join(", ")}. ` +
          "Dales código en Operaciones → Códigos GS y vuelve a cerrar el mes (reabrir: administrador).",
      },
      { status: 409 },
    );
  }

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `albaranes GS ${tipo} ${mes} ${servicio} (cierre ${cierre.id}, ${filas.length} filas)`,
    ip: await ipPeticion(),
  });
  return new Response(generarFicheroGs(filas, tipo, extra), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": cabeceraAdjunto(`albaranes GS ${servicio} ${mes} ${tipo}.txt`),
      "Cache-Control": "no-store",
    },
  });
}
