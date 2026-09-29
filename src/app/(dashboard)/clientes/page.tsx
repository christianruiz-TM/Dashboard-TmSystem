import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { GraficaLineas } from "@/components/graficas/grafica-lineas";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { requireRol } from "@/lib/auth/rbac";
import { campaniasDeCliente, listarClientes, obtenerCliente } from "@/lib/db/clientes";
import { segundosLegibles, esquemaRango, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import { penetracionListas } from "@/lib/rdb/queries/outbound";
import { volumenPorCampania, volumenPorDia } from "@/lib/rdb/queries/interacciones";
import { esIvr } from "@/lib/rdb/queries/servicios";

export const metadata: Metadata = { title: "Mi servicio" };
export const dynamic = "force-dynamic";

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; cliente?: string; ivr?: string }>;
}) {
  const usuario = await requireRol("cliente");
  const params = await searchParams;

  // Resolución del cliente: los usuarios `cliente` SOLO ven el suyo;
  // el admin puede elegir cliente con ?cliente=ID para revisar su portal.
  let clientId: number | null = usuario.clientId;
  if (usuario.rol === "admin") {
    clientId = params.cliente ? Number(params.cliente) : (listarClientes()[0]?.id ?? null);
  }
  const cliente = clientId != null ? obtenerCliente(clientId) : undefined;

  if (!cliente || !cliente.activo) {
    return (
      <Alert>
        <AlertTitle>Cuenta sin servicio asignado</AlertTitle>
        <AlertDescription>
          Tu usuario no tiene ningún servicio asociado todavía. Contacta con TmSystem
          para activar el acceso a tus campañas.
        </AlertDescription>
      </Alert>
    );
  }

  const campanias = campaniasDeCliente(cliente.id);
  if (campanias.length === 0) {
    return (
      <Alert>
        <AlertTitle>{cliente.nombre}: sin campañas asignadas</AlertTitle>
        <AlertDescription>
          Aún no hay campañas mapeadas a este cliente. Un administrador puede
          asignarlas en Administración → Clientes.
        </AlertDescription>
      </Alert>
    );
  }

  const presets = presetsRango().filter((p) => p.etiqueta !== "Hoy");
  const mesActual = presets.find((p) => p.etiqueta === "Mes actual")!;
  const rango = esquemaRango.safeParse({
    desde: params.desde ?? mesActual.desde,
    hasta: params.hasta ?? mesActual.hasta,
  });
  const { desde, hasta } = rango.success ? rango.data : mesActual;

  // IVR excluido salvo que se marque el check (las campañas IVR son automáticas)
  const incluirIvr = params.ivr === "1";
  const campaniasEf = incluirIvr ? campanias : campanias.filter((c) => !esIvr(c));

  // ⚠ Scoping: las campañas del cliente viajan como parámetros del SQL
  const [porDia, porCampania, listas] = await Promise.all([
    volumenPorDia(desde, hasta, campaniasEf),
    volumenPorCampania(desde, hasta, campaniasEf),
    penetracionListas(desde, hasta, campaniasEf),
  ]);

  const total = porCampania.reduce((acc, c) => acc + c.total, 0);
  const atendidas = porCampania.reduce((acc, c) => acc + c.atendidas, 0);
  // Abandonadas = solo entrantes (glosario y regla 6.b): el % va sobre el inbound
  const abandonadas = porCampania.reduce((acc, c) => acc + c.abandonadasInbound, 0);
  const inbound = porCampania.reduce((acc, c) => acc + c.inbound, 0);
  const ahtMedio =
    atendidas > 0
      ? porCampania.reduce((acc, c) => acc + (c.ahtSeg ?? 0) * c.atendidas, 0) / atendidas
      : null;

  const urlExport = `/api/export/cliente?desde=${desde}&hasta=${hasta}${
    usuario.rol === "admin" ? `&cliente=${cliente.id}` : ""
  }${incluirIvr ? "&ivr=1" : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Mi servicio · {cliente.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Actividad de tus campañas con TmSystem
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {campanias.map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {usuario.rol === "admin" ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Ver como:</span>
              {listarClientes().map((c) => (
                <Link
                  key={c.id}
                  href={`/clientes?cliente=${c.id}&desde=${desde}&hasta=${hasta}`}
                  className={
                    c.id === cliente.id
                      ? "rounded bg-primary px-2 py-1 font-medium text-primary-foreground"
                      : "rounded border px-2 py-1 hover:bg-accent"
                  }
                >
                  {c.nombre}
                </Link>
              ))}
            </div>
          ) : null}
          <Button variant="outline" size="sm" render={<a href={urlExport} />}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <SelectorIvr incluir={incluirIvr} />
      </div>
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <TarjetaKpi titulo="Interacciones" valor={total.toLocaleString("es-ES")} />
        <TarjetaKpi
          titulo="Atendidas"
          valor={atendidas.toLocaleString("es-ES")}
          sub={total > 0 ? `${((atendidas / total) * 100).toFixed(1)} % del total` : undefined}
        />
        <TarjetaKpi
          titulo="Abandonadas"
          valor={abandonadas.toLocaleString("es-ES")}
          sub={
            inbound > 0 ? `${((abandonadas / inbound) * 100).toFixed(1)} % del inbound` : undefined
          }
        />
        <TarjetaKpi titulo="AHT medio" valor={segundosLegibles(ahtMedio)} />
        <TarjetaKpi
          titulo="Campañas activas"
          valor={String(porCampania.length)}
          sub={`de ${campanias.length} contratadas`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolución diaria</CardTitle>
          <CardDescription>
            Interacciones de tus campañas entre {desde} y {hasta}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficaLineas
            datos={porDia.map((d) => ({ ...d }))}
            ejeX="fecha"
            series={[
              { clave: "total", nombre: "Interacciones", color: "var(--chart-1)" },
              { clave: "atendidas", nombre: "Atendidas", color: "var(--chart-3)" },
              { clave: "abandonadasInbound", nombre: "Abandonadas", color: "var(--chart-4)" },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen por campaña</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="text-right">Interacciones</TableHead>
                  <TableHead className="text-right">Atendidas</TableHead>
                  <TableHead className="text-right">Abandonadas</TableHead>
                  <TableHead className="text-right">AHT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porCampania.map((c) => (
                  <TableRow key={c.campania}>
                    <TableCell className="font-medium">{c.campania}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.total.toLocaleString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.atendidas.toLocaleString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.abandonadasInbound.toLocaleString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {segundosLegibles(c.ahtSeg)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listas outbound</CardTitle>
            <CardDescription>Penetración y resultados de tus listas</CardDescription>
          </CardHeader>
          <CardContent>
            {listas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin campañas outbound con actividad en el período
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lista</TableHead>
                    <TableHead className="text-right">Contactos</TableHead>
                    <TableHead className="text-right">Finalizados</TableHead>
                    <TableHead className="text-right">Éxitos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listas.map((l) => (
                    <TableRow key={`${l.campania}-${l.lista}`}>
                      <TableCell>
                        <div className="font-medium">{l.lista}</div>
                        <div className="text-xs text-muted-foreground">{l.campania}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.totalContactos.toLocaleString("es-ES")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.done.toLocaleString("es-ES")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">
                        {l.exitos.toLocaleString("es-ES")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Glosario
        titulo="Mi servicio"
        claves={[
          "interacciones",
          "atendidas",
          "abandonadas",
          "abandono",
          "aht",
          "exitos",
          "leads",
          "penetracion",
          "inboundOutbound",
        ]}
      />
    </div>
  );
}
