import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicioActividad } from "@/components/filtros/selector-servicio-actividad";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
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
import { TabsOperaciones, VISTAS_OPERACIONES, type VistaOperaciones } from "./tabs-operaciones";

export const metadata: Metadata = { title: "Operaciones" };
export const dynamic = "force-dynamic";

/**
 * Operaciones · Facturación. Para que abra rápido (15/10/2026):
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
  const vista: VistaOperaciones = VISTAS_OPERACIONES.find((v) => v === params.vista) ?? "facturacion";

  // Cliente: vacío = ninguno (no se consulta nada); «todos» = todos los clientes
  const servicios = await listaServicios();
  const elegido = params.servicio ?? "";
  const todos = elegido === TODOS_SERVICIOS;
  const servicio = todos || !servicios.some((s) => s.servicio === elegido) ? undefined : elegido;
  const hayCliente = todos || servicio != null;
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
  const datosFacturacion =
    hayCliente && vista === "facturacion" ? facturacionCompleta(desde, hasta, servicio, incluirIvr) : null;
  const datosHorasReales =
    campanias && vista === "facturacion" ? campanias.then((c) => horasAgenteReales(desde, hasta, c)) : null;
  const datosListas = campanias && vista === "listas" ? campanias.then((c) => penetracionListas(desde, hasta, c)) : null;
  const datosPausas = campanias && vista === "pausas" ? campanias.then((c) => razonesNotReady(desde, hasta, c)) : null;

  // Meses cerrados: solo SQLite (rápido), con o sin cliente
  const cierres =
    vista === "cerrados" ? listarCierresVigentes().filter((c) => !servicio || c.servicio === servicio) : [];
  const lineasHistorico =
    vista === "cerrados" ? lineasAjustadas(cierres.map((c) => c.id)).filter((l) => !l.quitada) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Operaciones · Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Unidades facturables por campaña según la configuración de cada cliente
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" render={<a href="/operaciones/articulos" />}>
            Artículos y tarifas
          </Button>
          <Button variant="outline" size="sm" render={<a href="/operaciones/ddis" />}>
            DDIs
          </Button>
          <Button variant="outline" size="sm" render={<a href="/operaciones/campanias-gs" />}>
            Códigos GS
          </Button>
          <Button variant="outline" size="sm" render={<a href="/operaciones/reparto" />}>
            Reparto
          </Button>
          {hayCliente && (
            <>
              <Button variant="outline" size="sm" render={<a href={urlExport("csv")} />}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" render={<a href={urlExport("xlsx")} />}>
                <Download className="h-4 w-4" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicioActividad
            servicios={servicios.map((s) => s.servicio)}
            valor={todos ? TODOS_SERVICIOS : (servicio ?? "")}
            todosExplicito
          />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      <TabsOperaciones
        vista={vista}
        params={{ servicio: todos ? TODOS_SERVICIOS : servicio, desde, hasta, ivr: incluirIvr }}
      />

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
        <>
          <Suspense fallback={<CargandoKpis />}>
            <KpisOperaciones ctx={ctx} datos={datosFacturacion} horasReales={datosHorasReales} />
          </Suspense>
          <Suspense fallback={<Cargando texto="Calculando la factura…" alto="h-72" />}>
            <SeccionFacturacion ctx={ctx} datos={datosFacturacion} />
          </Suspense>
        </>
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
        titulo="Operaciones"
        claves={[
          "servicio",
          "horasLogadas",
          "facturaCampania",
          "cierreMes",
          "horasLogadasCliente",
          "repartoHorasLogadas",
          "articulosGs",
          "cargosPuntuales",
          "minutosLinea",
          "ddis",
          "horasProductivas",
          "interacciones",
          "atendidas",
          "exitos",
          "leads",
          "importe",
          "pausas",
          "penetracion",
        ]}
      />
    </div>
  );
}
