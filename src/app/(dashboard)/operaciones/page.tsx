import type { Metadata } from "next";
import { Fragment } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { requireRol } from "@/lib/auth/rbac";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import {
  NOMBRE_UNIDAD,
  calcularFacturacion,
  facturacionHorasLogadas,
} from "@/lib/facturacion";
import {
  esquemaRango,
  horasDesdeSegundos,
  horasLegibles,
  motivoRangoInvalido,
  presetsRango,
} from "@/lib/fechas";
import { horasAgenteReales, razonesNotReady } from "@/lib/rdb/queries/agentes";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import { penetracionListas } from "@/lib/rdb/queries/outbound";
import {
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";

export const metadata: Metadata = { title: "Operaciones" };
export const dynamic = "force-dynamic";

function euros(importe: number | null): string {
  if (importe == null) return "—";
  return importe.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/**
 * Reparto ESTIMADO de las horas logadas de un cliente por campaña: por
 * usuario y día, según su tiempo productivo en cada una
 * (repartirHorasLogadas). Suma exactamente el total del cliente; se factura
 * el total, el reparto es para ver dónde se trabajó.
 */
function RepartoCampanias({ cliente }: { cliente: FacturacionHorasLogadas }) {
  const filas = cliente.campanias;
  const totalProd = filas.reduce((a, f) => a + f.horasProductivas, 0);
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">
        Reparto por campaña ({filas.filter((f) => f.campania != null).length} campañas) · estimado según el
        tiempo productivo
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        Altitude no registra en qué campaña está un usuario mientras espera: los de este cliente tienen casi
        siempre todas abiertas a la vez. Por eso, cada día, las horas logadas de cada usuario se reparten en
        proporción a su tiempo productivo (gestión de las atendidas) en cada campaña. Los días logados sin
        ninguna llamada atendida van aparte. Suma exactamente las horas del cliente; se factura el total.
      </p>
      <Table className="mt-2">
        <TableHeader>
          <TableRow>
            <TableHead>Campaña</TableHead>
            <TableHead className="text-right">H. productivas ({cliente.prefijo}_nnnn)</TableHead>
            <TableHead className="text-right">% tiempo productivo</TableHead>
            <TableHead className="text-right">Horas logadas repartidas</TableHead>
            <TableHead className="text-right">Importe repartido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.campania ?? "(sin actividad)"}>
              <TableCell className={f.campania == null ? "text-muted-foreground italic" : "font-medium"}>
                {f.campania ?? "Logado sin actividad en campaña"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(f.horasProductivas)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {f.pctProductivo == null
                  ? "—"
                  : `${f.pctProductivo.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(f.horasLogadas)}</TableCell>
              <TableCell className="text-right tabular-nums">{euros(f.importe)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-medium">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{horasLegibles(Math.round(totalProd * 100) / 100)}</TableCell>
            <TableCell className="text-right tabular-nums">100,00 %</TableCell>
            <TableCell className="text-right tabular-nums">{horasLegibles(cliente.horas)}</TableCell>
            <TableCell className="text-right tabular-nums">{euros(cliente.importe)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </details>
  );
}

export default async function PaginaOperaciones({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    servicio?: string;
    ivr?: string;
  }>;
}) {
  await requireRol("operaciones");
  const presets = presetsRango();
  const mesActual = presets.find((p) => p.etiqueta === "Mes actual")!;
  const params = await searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.desde ?? mesActual.desde,
    hasta: params.hasta ?? mesActual.hasta,
  });
  const { desde, hasta } = rango.success ? rango.data : mesActual;

  // Scoping por cliente/servicio; IVR excluido salvo que se marque el check
  const incluirIvr = params.ivr === "1";
  const servicios = await listaServicios();
  const camp = await campaniasEfectivas(params.servicio, incluirIvr);

  const [unidades, horasReales, razones, listas, porCliente] = await Promise.all([
    unidadesPorCampania(desde, hasta, camp),
    horasAgenteReales(desde, hasta, camp),
    razonesNotReady(desde, hasta, camp),
    penetracionListas(desde, hasta, camp),
    // Horas logadas de los usuarios del cliente: no dependen de campañas ni del check IVR
    facturacionHorasLogadas(desde, hasta, params.servicio),
  ]);
  const facturacion = calcularFacturacion(unidades, mapaCampaniaServicio(servicios));

  // Horas logadas: cifra REAL global (unión de intervalos por agente). NO se
  // suma por campaña porque los agentes blended duplican el tiempo (~×13).
  const totales = unidades.reduce(
    (acc, u) => ({
      interacciones: acc.interacciones + u.interacciones,
      atendidas: acc.atendidas + u.atendidas,
      exitos: acc.exitos + u.exitos,
      leads: acc.leads + u.leadsFinalizados,
    }),
    { interacciones: 0, atendidas: 0, exitos: 0, leads: 0 },
  );
  const importeTotal =
    facturacion.reduce((acc, f) => acc + (f.importeTotal ?? 0), 0) +
    porCliente.reduce((acc, c) => acc + (c.importe ?? 0), 0);
  const hayImportes =
    facturacion.some((f) => f.importeTotal != null) || porCliente.some((c) => c.importe != null);

  const urlExport = (formato: string) =>
    `/api/export/operaciones?desde=${desde}&hasta=${hasta}&formato=${formato}` +
    (params.servicio ? `&servicio=${encodeURIComponent(params.servicio)}` : "") +
    (incluirIvr ? "&ivr=1" : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Operaciones · Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Unidades facturables por campaña según la configuración de cada cliente
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href={urlExport("csv")} />}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" render={<a href={urlExport("xlsx")} />}>
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicio servicios={servicios.map((s) => s.servicio)} valor={params.servicio} />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TarjetaKpi
          titulo="Horas logadas (reales)"
          valor={horasLegibles(horasReales.horasLogadas)}
          sub="Global, sin duplicar por campaña"
        />
        <TarjetaKpi
          titulo="Interacciones"
          valor={totales.interacciones.toLocaleString("es-ES")}
        />
        <TarjetaKpi titulo="Atendidas" valor={totales.atendidas.toLocaleString("es-ES")} />
        <TarjetaKpi titulo="Éxitos" valor={totales.exitos.toLocaleString("es-ES")} />
        <TarjetaKpi titulo="Leads finalizados" valor={totales.leads.toLocaleString("es-ES")} />
        <TarjetaKpi
          titulo="Importe estimado"
          valor={hayImportes ? euros(importeTotal) : "—"}
          sub={hayImportes ? "Líneas con precio configurado" : "Sin precios configurados"}
        />
      </div>

      <Tabs defaultValue="facturacion">
        <TabsList>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="listas">Listas outbound</TabsTrigger>
          <TabsTrigger value="pausas">Pausas (Not Ready)</TabsTrigger>
        </TabsList>

        <TabsContent value="facturacion" className="space-y-4">
          {porCliente.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horas logadas por cliente</CardTitle>
                <CardDescription>
                  Tiempo logado (de login a logout, haya o no campaña abierta) de los
                  usuarios del cliente, <code>PREFIJO_nnnn</code>. No cuentan los usuarios
                  sin el prefijo ni los de bbdd (<code>_BD</code>, <code>_BD_LX</code>), que se
                  facturan por sus campañas. Las sesiones se asignan al día en que
                  empiezan. Debajo de cada cliente, el reparto estimado por campaña según
                  el tiempo productivo. Período: {desde} a {hasta}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente (servicio)</TableHead>
                      <TableHead>Usuarios</TableHead>
                      <TableHead className="text-right">Horas logadas</TableHead>
                      <TableHead className="text-right">€/hora</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porCliente.map((c) => (
                      <Fragment key={`${c.servicio}|${c.prefijo}`}>
                      <TableRow>
                        <TableCell className="font-medium">{c.servicio}</TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-sm">
                              {c.prefijo}_nnnn · {c.usuarios.length} usuarios
                            </summary>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {c.usuarios.map((u) => (
                                <li key={u.usuario} className="flex justify-between gap-6">
                                  <span>{u.usuario}</span>
                                  <span className="tabular-nums">{horasLegibles(u.horas)}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horasLegibles(c.horas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {euros(c.precioUnitario)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {euros(c.importe)}
                        </TableCell>
                      </TableRow>
                      {c.campanias.length > 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="pt-0 pb-3 whitespace-normal">
                            <RepartoCampanias cliente={c} />
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unidades por campaña</CardTitle>
              <CardDescription>
                La columna «Facturable» marca las unidades configuradas en Administración →
                Facturación. Las horas por campaña son las <strong>productivas</strong>{" "}
                (en llamada). Las logadas no salen aquí: si el cliente factura por ellas, van en
                «Horas logadas por cliente», con su reparto estimado por campaña. Período:{" "}
                {desde} a {hasta}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-right">H. productivas</TableHead>
                    <TableHead className="text-right">Interacc.</TableHead>
                    <TableHead className="text-right">Atendidas</TableHead>
                    <TableHead className="text-right">Éxitos</TableHead>
                    <TableHead className="text-right">Leads fin.</TableHead>
                    <TableHead>Facturable</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturacion.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Sin actividad en el período seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    facturacion.map((f) => (
                      <TableRow key={f.campania}>
                        <TableCell className="font-medium">{f.campania}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horasLegibles(f.medidas.horasProductivas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.interacciones.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.atendidas.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.exitos.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.leadsFinalizados.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell>
                          {f.lineas.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {f.porHorasLogadas ? "Horas logadas (cliente)" : "Sin configurar"}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {f.lineas.map((l, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">
                                  {NOMBRE_UNIDAD[l.unidad]}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {euros(f.importeTotal)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Penetración de listas outbound</CardTitle>
              <CardDescription>
                Contactos según fecha programada (activity.moment) dentro del período
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Lista</TableHead>
                    <TableHead className="text-right">Contactos</TableHead>
                    <TableHead className="text-right">Finalizados</TableHead>
                    <TableHead className="text-right">Éxitos</TableHead>
                    <TableHead className="text-right">Sin éxito</TableHead>
                    <TableHead className="text-right">Sin contactar</TableHead>
                    <TableHead className="text-right">Intentos medios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Sin listas con actividad en el período
                      </TableCell>
                    </TableRow>
                  ) : (
                    listas.map((l) => (
                      <TableRow key={`${l.campania}-${l.lista}`}>
                        <TableCell className="font-medium">{l.campania}</TableCell>
                        <TableCell>{l.lista}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.totalContactos.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.done.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {l.exitos.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.sinExito.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.sinContacto.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.intentosAutoMedio ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pausas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tiempo en No Disponible por agente y razón</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Razón</TableHead>
                    <TableHead className="text-right">Veces</TableHead>
                    <TableHead className="text-right">Tiempo total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {razones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sin pausas registradas en el período
                      </TableCell>
                    </TableRow>
                  ) : (
                    razones.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.agente}</TableCell>
                        <TableCell>{r.razon}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.veces}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horasDesdeSegundos(r.segundosTotal)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Glosario
        titulo="Operaciones"
        claves={[
          "servicio",
          "horasLogadas",
          "horasLogadasCliente",
          "repartoHorasLogadas",
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
