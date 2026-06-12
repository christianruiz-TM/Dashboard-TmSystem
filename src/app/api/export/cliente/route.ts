import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { campaniasDeCliente, obtenerCliente } from "@/lib/db/clientes";
import { esquemaRango } from "@/lib/fechas";
import { volumenPorDia } from "@/lib/rdb/queries/interacciones";
import { generarCsv, respuestaCsv } from "@/lib/export/csv";

/**
 * Export CSV del portal de clientes. El scoping NO depende de parámetros:
 * para usuarios `cliente` se usa siempre su client_id de sesión.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "cliente")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = peticion.nextUrl.searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.get("desde"),
    hasta: params.get("hasta"),
  });
  if (!rango.success) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  const { desde, hasta } = rango.data;

  // Cliente: solo el de la sesión. Admin: el indicado por parámetro.
  const clientId =
    usuario.rol === "cliente" ? usuario.clientId : Number(params.get("cliente") ?? NaN);
  const cliente = clientId != null && !Number.isNaN(clientId) ? obtenerCliente(clientId) : null;
  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  const campanias = campaniasDeCliente(cliente.id);
  if (campanias.length === 0) {
    return NextResponse.json({ error: "Cliente sin campañas asignadas" }, { status: 404 });
  }

  const porDia = await volumenPorDia(desde, hasta, campanias);

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `cliente ${cliente.nombre} ${desde}..${hasta}`,
    ip: await ipPeticion(),
  });

  const csv = generarCsv(
    ["Fecha", "Interacciones", "Inbound", "Outbound", "Atendidas", "Abandonadas", "AHT (s)", "ACW (s)"],
    porDia.map((d) => [
      d.fecha,
      d.total,
      d.inbound,
      d.outbound,
      d.atendidas,
      d.abandonadas,
      d.ahtSeg,
      d.acwSeg,
    ]),
  );
  return respuestaCsv(`actividad_${cliente.nombre}_${desde}_${hasta}.csv`, csv);
}
