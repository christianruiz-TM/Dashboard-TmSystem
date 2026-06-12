import type { Metadata } from "next";
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
import { SelectorRango } from "@/components/filtros/selector-rango";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { requireRol } from "@/lib/auth/rbac";
import { NOMBRE_UNIDAD, calcularFacturacion } from "@/lib/facturacion";
import { duracionLegible, esquemaRango, horasLegibles, presetsRango } from "@/lib/fechas";
import { razonesNotReady } from "@/lib/rdb/queries/agentes";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import { penetracionListas } from "@/lib/rdb/queries/outbound";

export const metadata: Metadata = { title: "Operaciones" };
export const dynamic = "force-dynamic";

function euros(importe: number | null): string {
  if (importe == null) return "—";
  return importe.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default async function PaginaOperaciones({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
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

  const [unidades, razones, listas] = await Promise.all([
    unidadesPorCampania(desde, hasta),
    razonesNotReady(desde, hasta),
    penetracionListas(desde, hasta),
  ]);
  const facturacion = calcularFacturacion(unidades);

  const totales = unidades.reduce(
    (acc, u) => ({
      horasLogadas: acc.horasLogadas + u.horasLogadas,
      interacciones: acc.interacciones + u.interacciones,
      atendidas: acc.atendidas + u.atendidas,
      exitos: acc.exitos + u.exitos,
      leads: acc.leads + u.leadsFinalizados,
    }),
    { horasLogadas: 0, interacciones: 0, atendidas: 0, exitos: 0, leads: 0 },
  );
  const importeTotal = facturacion.reduce((acc, f) => acc + (f.importeTotal ?? 0), 0);
  const hayImportes = facturacion.some((f) => f.importeTotal != null);

  const urlExport = (formato: string) =>
    `/api/export/operaciones?desde=${desde}&hasta=${hasta}&formato=${formato}`;

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

      <SelectorRango desde={desde} hasta={hasta} presets={presets} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TarjetaKpi titulo="Horas logadas" valor={horasLegibles(totales.horasLogadas)} />
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
          sub={hayImportes ? "Campañas con precio configurado" : "Sin precios configurados"}
        />
      </div>

      <Tabs defaultValue="facturacion">
        <TabsList>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="listas">Listas outbound</TabsTrigger>
          <TabsTrigger value="pausas">Pausas (Not Ready)</TabsTrigger>
        </TabsList>

        <TabsContent value="facturacion">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unidades por campaña</CardTitle>
              <CardDescription>
                La columna «Facturable» marca las unidades configuradas en Administración →
                Facturación. Período: {desde} a {hasta}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-right">H. logadas</TableHead>
                    <TableHead className="text-right">H. ready</TableHead>
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
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        Sin actividad en el período seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    facturacion.map((f) => (
                      <TableRow key={f.campania}>
                        <TableCell className="font-medium">{f.campania}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.horasLogadas.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.horasReady.toLocaleString("es-ES")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.medidas.horasProductivas.toLocaleString("es-ES")}
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
                            <span className="text-xs text-muted-foreground">Sin configurar</span>
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
                          {duracionLegible(r.segundosTotal)}
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
    </div>
  );
}
