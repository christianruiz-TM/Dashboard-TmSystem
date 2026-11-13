import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronDown, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvisoRango, AvisoServicio } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicioActividad } from "@/components/filtros/selector-servicio-actividad";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { BarraPanel } from "@/components/layout/barra-panel";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { HistoricoCierres } from "@/components/operaciones/historico-cierres";
import { ROLES_OPERACIONES, puedeEditarFacturacion, requireRol } from "@/lib/auth/rbac";
import { lineasAjustadas, listarCierresVigentes } from "@/lib/db/facturacion";
import { facturacionCompleta } from "@/lib/facturacion";
import { esquemaRango, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import { horasAgenteReales, razonesNotReady } from "@/lib/rdb/queries/agentes";
import { penetracionListas } from "@/lib/rdb/queries/outbound";
import { campaniasEfectivas, listaServicios } from "@/lib/rdb/queries/servicios";
import { TODOS_SERVICIOS } from "@/lib/servicio-todos";
import {
  Cargando,
  CargandoKpis,
  KpisOperaciones,
  SeccionFacturacion,
  SeccionListas,
  SeccionPausas,
  type ContextoFacturacion,
} from "./secciones";
import {
  GLOSARIO_OPERACIONES,
  NOMBRE_VISTA_OPERACIONES,
  VISTAS_FACTURACION,
  leerVistaOperaciones,
  pestanasOperaciones,
} from "@/lib/operaciones-secciones";

export const metadata: Metadata = { title: "Operaciones" };
export const dynamic = "force-dynamic";

/**
 * Operaciones. Desde el 13/11/2026 en secciones con la barra fija común
 * (lib/operaciones-secciones.ts): Factura, Horas logadas, Unidades por
 * campaña, Meses cerrados, Listas y Pausas. Para que abra rápido (15/10/2026):
 *  - Empieza SIN cliente y sin consultar nada: «Todos los clientes» es una
 *    opción del selector (`?servicio=todos`), no lo de por defecto.
 *  - Pestañas como enlaces (`?vista=`): cada una consulta solo lo suyo; las
 *    pausas (Not Ready deduplicado) y las listas eran lo más pesado.
 *  - Cada sección va en <Suspense>: cabecera, filtros y pestañas salen al
 *    momento y las cifras van apareciendo según acaban sus consultas.
 */
export default async function PaginaOperaciones({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    servicio?: string;
    ivr?: string;
    vivo?: string;
    vista?: string;
    msg?: string;
    detalle?: string;
  }>;
}) {
  const usuario = await requireRol(...ROLES_OPERACIONES);
  const presets = presetsRango();
  const mesActual = presets.find((p) => p.etiqueta === "Mes actual")!;
  const params = await searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.desde ?? mesActual.desde,
    hasta: params.hasta ?? mesActual.hasta,
  });
  const { desde, hasta } = rango.success ? rango.data : mesActual;
  const vista = leerVistaOperaciones(params.vista);
  const esFacturacion = VISTAS_FACTURACION.includes(vista);

  // Cliente: vacío = ninguno (no se consulta nada); «todos» = todos los clientes
  const servicios = await listaServicios();
  const elegido = params.servicio ?? "";
  const todos = elegido === TODOS_SERVICIOS;
  const servicio = todos || !servicios.some((s) => s.servicio === elegido) ? undefined : elegido;
  const hayCliente = todos || servicio != null;
  const servicioInexistente = elegido && !todos && !servicio ? elegido : null;
  const incluirIvr = params.ivr === "1";

  const urlExport = (formato: string) =>
    `/api/export/operaciones?desde=${desde}&hasta=${hasta}&formato=${formato}` +
    (servicio ? `&servicio=${encodeURIComponent(servicio)}` : "") +
    (incluirIvr ? "&ivr=1" : "") +
    (params.vivo === "1" ? "&vivo=1" : "");

  const ctx: ContextoFacturacion = {
    desde,
    hasta,
    servicio,
    incluirIvr,
    vivo: params.vivo === "1",
    puedeEditar: puedeEditarFacturacion(usuario.rol),
    esAdmin: usuario.rol === "admin",
  };

  // Solo se lanza lo de la pestaña abierta, y solo con cliente elegido. Las
  // promesas se pasan a las secciones (Suspense) sin esperarlas aquí.
  const campanias = hayCliente && vista !== "cerrados" ? campaniasEfectivas(servicio, incluirIvr) : null;
  // Factura, horas logadas y unidades salen de la misma cadena de facturación
  const datosFacturacion = hayCliente && esFacturacion ? facturacionCompleta(desde, hasta, servicio, incluirIvr) : null;
  const datosHorasReales =
    campanias && vista === "facturacion" ? campanias.then((c) => horasAgenteReales(desde, hasta, c)) : null;
  const datosListas = campanias && vista === "listas" ? campanias.then((c) => penetracionListas(desde, hasta, c)) : null;
  const datosPausas = campanias && vista === "pausas" ? campanias.then((c) => razonesNotReady(desde, hasta, c)) : null;

  // Meses cerrados: solo SQLite (rápido), con o sin cliente
  const cierres =
    vista === "cerrados" ? listarCierresVigentes().filter((c) => !servicio || c.servicio === servicio) : [];
  const lineasHistorico =
    vista === "cerrados" ? lineasAjustadas(cierres.map((c) => c.id)).filter((l) => !l.quitada) : [];

  const servicioUrl = todos ? TODOS_SERVICIOS : servicio;
  return (
    <div className="space-y-6">
      <BarraPanel
        pestanas={<SelectorRango desde={desde} hasta={hasta} presets={presets} />}
        filtros={
          <>
            <SelectorServicioActividad
              servicios={servicios.map((s) => s.servicio)}
              valor={todos ? TODOS_SERVICIOS : (servicio ?? "")}
              todosExplicito
            />
            <SelectorIvr incluir={incluirIvr} />
          </>
        }
        secciones={pestanasOperaciones({ servicio: servicioUrl, desde, hasta, incluirIvr })}
        actual={vista}
        estado={
          <>
            {/* Los maestros, en un menú (sin JavaScript): antes eran cuatro botones junto a las descargas */}
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-muted">
                Maestros <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="absolute right-0 z-30 mt-1 flex w-48 flex-col rounded-md border bg-popover p-1 text-sm shadow-md">
                {[
                  ["/operaciones/articulos", "Artículos y tarifas"],
                  ["/operaciones/ddis", "DDIs"],
                  ["/operaciones/campanias-gs", "Códigos GS"],
                  ["/operaciones/reparto", "Reparto de horas"],
                ].map(([href, texto]) => (
                  <a key={href} href={href} className="rounded px-2 py-1.5 text-foreground hover:bg-muted">
                    {texto}
                  </a>
                ))}
              </div>
            </details>
            {hayCliente && esFacturacion && (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2" render={<a href={urlExport("csv")} />}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" render={<a href={urlExport("xlsx")} />}>
                  <Download className="h-3.5 w-3.5" /> Excel
                </Button>
              </>
            )}
          </>
        }
      />
      <AvisoServicio pedido={servicioInexistente} alternativa="la lista de clientes para elegir uno" />
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      {!hayCliente && vista !== "cerrados" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Elige un cliente
            </CardTitle>
            <CardDescription>
              Elige un cliente en «Cliente / Servicio» para ver su facturación. «Todos los clientes» también
              está en la lista, pero tarda más: calcula todos a la vez.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {datosFacturacion && datosHorasReales && (
        <Suspense fallback={<CargandoKpis />}>
          <KpisOperaciones ctx={ctx} datos={datosFacturacion} horasReales={datosHorasReales} />
        </Suspense>
      )}
      {datosFacturacion && (
        <Suspense fallback={<Cargando texto={`Calculando: ${NOMBRE_VISTA_OPERACIONES[vista].toLowerCase()}…`} alto="h-72" />}>
          <SeccionFacturacion
            ctx={ctx}
            datos={datosFacturacion}
            parte={vista === "horas" ? "horas" : vista === "unidades" ? "unidades" : "factura"}
          />
        </Suspense>
      )}

      {vista === "cerrados" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meses cerrados</CardTitle>
            <CardDescription>
              Lo que se facturó cada mes, tal como se cerró{servicio ? ` (${servicio})` : ""}. Incluye el
              histórico de «facturacion cerrada» del Excel de operaciones. Pulsa un mes para ver su detalle por
              campaña.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HistoricoCierres cierres={cierres} lineas={lineasHistorico} />
          </CardContent>
        </Card>
      )}

      {datosListas && (
        <Suspense fallback={<Cargando texto="Cargando las listas…" />}>
          <SeccionListas datos={datosListas} />
        </Suspense>
      )}

      {datosPausas && (
        <Suspense fallback={<Cargando texto="Cargando las pausas…" />}>
          <SeccionPausas datos={datosPausas} />
        </Suspense>
      )}

      <Glosario
        titulo={`Operaciones · ${NOMBRE_VISTA_OPERACIONES[vista]}`}
        claves={GLOSARIO_OPERACIONES[vista]}
      />
    </div>
  );
}
