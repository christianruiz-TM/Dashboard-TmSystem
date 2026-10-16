import { NextResponse, type NextRequest } from "next/server";
import { ROLES_OPERACIONES } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { cierreVigente, lineasAjustadas } from "@/lib/db/facturacion";
import { mesCompleto } from "@/lib/ddis";
import {
  NOMBRE_CORTO_UNIDAD,
  NOMBRE_UNIDAD,
  etiquetaCampania,
  facturacionCompleta,
  totalesFactura,
  type FilaFactura,
} from "@/lib/facturacion";
import { agruparPorServicio, filasDeCierre } from "@/lib/facturacion-campania";
import { esquemaRango, motivoRangoInvalido } from "@/lib/fechas";
import { TODOS_SERVICIOS } from "@/lib/servicio-todos";
import { generarCsv, respuestaCsv } from "@/lib/export/csv";
import { FORMATO_2_DECIMALES, generarXlsxHojas, respuestaXlsx, type HojaXlsx } from "@/lib/export/xlsx";

/** Minutos sin redondear → 2 decimales (o vacío). */
const min2 = (v: number | undefined) => (v ? Math.round(v * 100) / 100 : null);

/** Hoja «Factura por campaña»: lo mismo que la tabla de la pantalla. */
function hojaFactura(filas: FilaFactura[]): HojaXlsx {
  // Solo para las columnas: qué unidades aparecen
  const totales = totalesFactura(filas);
  const columnas: HojaXlsx["columnas"] = [
    { cabecera: "Cliente", clave: "servicio", ancho: 18 },
    { cabecera: "Campaña", clave: "campania", ancho: 26 },
    { cabecera: "Cód. GS", clave: "codigoGs", ancho: 12 },
  ];
  for (const t of totales.porUnidad) {
    const decimales =
      t.unidad === "horas" || t.unidad === "horas_logadas" || t.unidad.startsWith("minutos")
        ? FORMATO_2_DECIMALES
        : undefined;
    columnas.push({ cabecera: NOMBRE_CORTO_UNIDAD[t.unidad], clave: `c_${t.unidad}`, formato: decimales });
    columnas.push({ cabecera: `${NOMBRE_CORTO_UNIDAD[t.unidad]} (EUR)`, clave: `i_${t.unidad}`, formato: FORMATO_2_DECIMALES });
  }
  columnas.push({ cabecera: "Total (EUR)", clave: "total", formato: FORMATO_2_DECIMALES });

  const fila = (f: FilaFactura): Record<string, unknown> => {
    const r: Record<string, unknown> = {
      servicio: f.servicio,
      campania: etiquetaCampania(f),
      codigoGs: f.codigoGs,
      total: f.importeTotal,
    };
    for (const l of f.lineas) {
      r[`c_${l.unidad}`] = l.cantidad;
      r[`i_${l.unidad}`] = l.importe;
    }
    return r;
  };
  /** Fila de total con la suma de cada columna (de un cliente o de todos). */
  const filaTotal = (etiqueta: string, de: readonly FilaFactura[]): Record<string, unknown> => {
    const t = totalesFactura(de);
    const r: Record<string, unknown> = { campania: etiqueta, total: t.importe };
    for (const u of t.porUnidad) {
      r[`c_${u.unidad}`] = u.cantidad;
      r[`i_${u.unidad}`] = u.importe;
    }
    return r;
  };
  // Como en la pantalla: cada cliente con más de una campaña lleva su total
  // (con un solo cliente, el total final ya es el suyo)
  const grupos = agruparPorServicio(filas);
  const cuerpo = grupos.flatMap((g) => [
    ...g.filas.map(fila),
    ...(grupos.length > 1 && g.filas.length > 1 ? [filaTotal(`Total ${g.servicio ?? "sin cliente"}`, g.filas)] : []),
  ]);
  const final = filaTotal(grupos.length > 1 ? "Total general" : "Total", filas);
  return { nombre: "Factura por campaña", columnas, filas: [...cuerpo, final] };
}

/** Export del módulo de facturación (CSV para Excel ES o XLSX). */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_OPERACIONES.includes(usuario.rol))) {
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
  // «todos» es lo mismo que sin cliente, como en la página
  const elegido = params.get("servicio");
  const servicio = elegido && elegido !== TODOS_SERVICIOS ? elegido : undefined;

  const { facturacion, porCliente, factura } = await facturacionCompleta(
    desde,
    hasta,
    servicio,
    params.get("ivr") === "1",
  );
  // Mes cerrado: la factura es la guardada al cerrar (como en la pantalla)
  const mes = servicio ? mesCompleto(desde, hasta) : null;
  const cierre = mes && servicio ? cierreVigente(mes, servicio) : undefined;
  const facturaExport =
    cierre && servicio && params.get("vivo") !== "1"
      ? filasDeCierre(lineasAjustadas([cierre.id]).filter((l) => !l.quitada), servicio)
      : factura;

  registrarAuditoria({
    accion: "export",
    userId: usuario.id,
    username: usuario.username,
    detalle: `operaciones ${formato} ${desde}..${hasta}${cierre ? ` (cierre ${cierre.id})` : ""}`,
    ip: await ipPeticion(),
  });

  const nombreArchivo = `facturacion_${desde}_${hasta}.${formato}`;
  // Detalle: lo medido por campaña. Las horas logadas van en una fila propia
  // del cliente (usuarios PREFIJO_nnnn), seguida de su reparto por campaña
  // (tiempo de agente, método del Excel de operaciones) en columnas aparte,
  // para que las de arriba sigan sumando sin contar dos veces.
  const columnas = [
    { cabecera: "Campaña / cliente", clave: "campania", ancho: 30 },
    { cabecera: "Horas logadas (cliente)", clave: "horasLogadas", formato: FORMATO_2_DECIMALES },
    { cabecera: "Horas productivas", clave: "horasProductivas", formato: FORMATO_2_DECIMALES },
    { cabecera: "Interacciones", clave: "interacciones" },
    { cabecera: "Atendidas", clave: "atendidas" },
    { cabecera: "Éxitos", clave: "exitos" },
    { cabecera: "Leads finalizados", clave: "leadsFinalizados" },
    { cabecera: "Min. móvil", clave: "minMovil", formato: FORMATO_2_DECIMALES },
    { cabecera: "Min. fijo", clave: "minFijo", formato: FORMATO_2_DECIMALES },
    { cabecera: "Min. encuesta (incluidos)", clave: "minEncuesta", formato: FORMATO_2_DECIMALES },
    { cabecera: "Min. especial (no se cobran)", clave: "minEspecial", formato: FORMATO_2_DECIMALES },
    { cabecera: "Min. sin coste", clave: "minSinCoste", formato: FORMATO_2_DECIMALES },
    { cabecera: "DDIs", clave: "ddis" },
    { cabecera: "Unidades facturables", clave: "unidades", ancho: 34 },
    { cabecera: "Importe sin h. logadas (EUR)", clave: "importe", formato: FORMATO_2_DECIMALES },
    { cabecera: "Reparto: tiempo de agente usuarios del cliente", clave: "repartoAgente", formato: FORMATO_2_DECIMALES },
    { cabecera: "Reparto: % tiempo de agente", clave: "repartoPct", formato: FORMATO_2_DECIMALES },
    { cabecera: "Reparto: horas logadas", clave: "repartoHoras", formato: FORMATO_2_DECIMALES },
    { cabecera: "Reparto: importe (EUR)", clave: "repartoImporte", formato: FORMATO_2_DECIMALES },
  ];
  const vacias = Object.fromEntries(columnas.map((c) => [c.clave, null])) as Record<string, unknown>;
  const filasCliente = porCliente.flatMap((c) => [
    {
      ...vacias,
      campania: `${c.servicio} · usuarios ${c.prefijo}_nnnn`,
      horasLogadas: c.horas,
      unidades: NOMBRE_UNIDAD.horas_logadas,
      importe: c.importe,
    },
    ...c.campanias.map((r) => ({
      ...vacias,
      campania: `   ${c.servicio} → ${r.campania ?? "sin tiempo de agente en sus campañas"}`,
      unidades: "Reparto (tiempo de agente)",
      repartoAgente: r.horasAgente,
      repartoPct: r.pctAgente,
      repartoHoras: r.horasLogadas,
      repartoImporte: r.importe,
    })),
  ]);
  const filasCampania = facturacion.map((f) => ({
    ...vacias,
    campania: f.campania,
    horasProductivas: f.medidas.horasProductivas,
    interacciones: f.medidas.interacciones,
    atendidas: f.medidas.atendidas,
    exitos: f.medidas.exitos,
    leadsFinalizados: f.medidas.leadsFinalizados,
    minMovil: min2(f.tarificacion?.minutos.movil),
    minFijo: min2(f.tarificacion?.minutos.fijo),
    minEncuesta: min2(f.tarificacion?.minutosEncuesta),
    minEspecial: min2(f.tarificacion?.minutos.especial),
    minSinCoste: min2(f.tarificacion?.minutos.sin_coste),
    ddis: f.ddis || null,
    unidades:
      [f.porHorasLogadas ? "Horas logadas (cliente)" : null, ...f.lineas.map((l) => NOMBRE_UNIDAD[l.unidad])]
        .filter(Boolean)
        .join(" + ") || "Sin configurar",
    importe: f.importeTotal,
  }));
  const filas = [...filasCliente, ...filasCampania];

  if (formato === "xlsx") {
    const contenido = await generarXlsxHojas([
      hojaFactura(facturaExport),
      { nombre: "Detalle", columnas, filas },
    ]);
    return respuestaXlsx(nombreArchivo, contenido);
  }
  const csv = generarCsv(
    columnas.map((c) => c.cabecera),
    filas.map((f) => columnas.map((c) => f[c.clave as keyof typeof f] ?? "")),
  );
  return respuestaCsv(nombreArchivo, csv);
}
