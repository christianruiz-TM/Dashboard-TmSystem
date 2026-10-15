import { Fragment } from "react";
import { Download, Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { AjustesCierre } from "@/components/operaciones/ajustes-cierre";
import { TablaFactura, euros } from "@/components/operaciones/tabla-factura";
import { tipoFicheroGs } from "@/lib/albaranes-gs";
import { cierreVigente, lineasAjustadas, prefijosExcluidosReparto } from "@/lib/db/facturacion";
import { mesCompleto } from "@/lib/ddis";
import { NOMBRE_UNIDAD, totalesFactura, type FacturacionCompleta } from "@/lib/facturacion";
import { etiquetaCampania, filasDeCierre } from "@/lib/facturacion-campania";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import { horasDesdeSegundos, horasLegibles, hoyISO } from "@/lib/fechas";
import type { HorasAgenteReales, PenetracionLista, RazonNotReady } from "@/lib/rdb/types";
import { ajustarCierre, cerrarMes, deshacerAjusteCierre, reabrirMes } from "./acciones";

// ============================================================
// Secciones de Operaciones (server components asíncronos). La página las
// envuelve en <Suspense>: se enseña al momento la cabecera, los filtros y las
// pestañas, y cada sección aparece cuando acaban sus consultas, en vez de
// esperar a la más lenta.
// ============================================================

/** Lo que necesitan las secciones de la pestaña Facturación. */
export interface ContextoFacturacion {
  desde: string;
  hasta: string;
  /** Servicio elegido; undefined = todos los clientes. */
  servicio?: string;
  incluirIvr: boolean;
  /** ?vivo=1: con el mes cerrado, enseñar el cálculo de ahora. */
  vivo: boolean;
  puedeEditar: boolean;
  esAdmin: boolean;
}

/** Hueco mientras carga una sección. */
export function Cargando({ texto, alto = "h-40" }: { texto: string; alto?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">{texto}</CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${alto}`} />
      </CardContent>
    </Card>
  );
}

export function CargandoKpis() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

/** Mes cerrado del rango (si lo hay) y lo que se enseña: lo cerrado o lo calculado ahora. */
function estadoFactura(ctx: ContextoFacturacion, completa: FacturacionCompleta) {
  const mes = ctx.servicio ? mesCompleto(ctx.desde, ctx.hasta) : null;
  const cierre = mes && ctx.servicio ? cierreVigente(mes, ctx.servicio) : undefined;
  const verCierre = cierre != null && !ctx.vivo;
  // Lo cerrado, con los ajustes manuales aplicados (las líneas quitadas no se cobran)
  const lineasCierre = cierre ? lineasAjustadas([cierre.id]) : [];
  const facturaMostrada =
    verCierre && ctx.servicio ? filasDeCierre(lineasCierre.filter((l) => !l.quitada), ctx.servicio) : completa.factura;
  return { mes, cierre, verCierre, lineasCierre, facturaMostrada };
}

/** Minutos a 2 decimales («1.288,92»); guion si no hay. */
function minutos(valor: number | undefined): string {
  if (!valor) return "—";
  return (Math.round(valor * 100) / 100).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------- KPIs ----------

export async function KpisOperaciones({
  ctx,
  datos,
  horasReales,
}: {
  ctx: ContextoFacturacion;
  datos: Promise<FacturacionCompleta>;
  horasReales: Promise<HorasAgenteReales>;
}) {
  const [completa, reales] = await Promise.all([datos, horasReales]);
  const { verCierre, facturaMostrada } = estadoFactura(ctx, completa);
  // Horas logadas: cifra REAL global (unión de intervalos por agente). NO se
  // suma por campaña porque los agentes blended duplican el tiempo (~×13).
  const totales = completa.unidades.reduce(
    (acc, u) => ({
      interacciones: acc.interacciones + u.interacciones,
      atendidas: acc.atendidas + u.atendidas,
      exitos: acc.exitos + u.exitos,
      leads: acc.leads + u.leadsFinalizados,
    }),
    { interacciones: 0, atendidas: 0, exitos: 0, leads: 0 },
  );
  const importeTotal = totalesFactura(facturaMostrada).importe;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <TarjetaKpi
        titulo="Horas logadas (reales)"
        valor={horasLegibles(reales.horasLogadas)}
        sub="Global, sin duplicar por campaña"
      />
      <TarjetaKpi titulo="Interacciones" valor={totales.interacciones.toLocaleString("es-ES")} />
      <TarjetaKpi titulo="Atendidas" valor={totales.atendidas.toLocaleString("es-ES")} />
      <TarjetaKpi titulo="Éxitos" valor={totales.exitos.toLocaleString("es-ES")} />
      <TarjetaKpi titulo="Leads finalizados" valor={totales.leads.toLocaleString("es-ES")} />
      <TarjetaKpi
        titulo="Importe estimado"
        valor={importeTotal != null ? euros(importeTotal) : "—"}
        sub={
          verCierre
            ? "Mes cerrado: lo facturado"
            : importeTotal != null
              ? "Líneas con precio configurado"
              : "Sin precios configurados"
        }
      />
    </div>
  );
}

// ---------- Facturación ----------

/**
 * Reparto de las horas logadas de un cliente por campaña con el método del
 * Excel de operaciones: el total, en proporción al tiempo de agente de sus
 * usuarios en cada una (repartirHorasLogadas). Suma exactamente el total del
 * cliente y es lo que va al albarán de cada campaña.
 */
function RepartoCampanias({ cliente }: { cliente: FacturacionHorasLogadas }) {
  const filas = cliente.campanias;
  const excluidos = prefijosExcluidosReparto(cliente.servicio);
  const totalAgente = filas.reduce((a, f) => a + f.horasAgente, 0);
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">
        Reparto por campaña ({filas.filter((f) => f.campania != null).length} campañas) · según el tiempo
        de agente
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        Altitude no registra en qué campaña está un usuario mientras espera: los de este cliente tienen casi
        siempre todas abiertas a la vez. Por eso las horas logadas del período se reparten en proporción al
        tiempo de agente en cada campaña: marcar, hablar, retener y cerrar la llamada, sin la cola, en
        entrantes y salientes aunque no contesten. No cuentan las salientes sin número marcado
        {excluidos.length > 0 ? ` ni las llamadas con los prefijos ${excluidos.join(", ")}` : ""} (lista en
        «Reparto»). Es el método del Excel de facturación de operaciones. Suma exactamente las horas del
        cliente.
      </p>
      <Table className="mt-2">
        <TableHeader>
          <TableRow>
            <TableHead>Campaña</TableHead>
            <TableHead className="text-right">Tiempo de agente ({cliente.prefijo}_nnnn)</TableHead>
            <TableHead className="text-right">% tiempo de agente</TableHead>
            <TableHead className="text-right">Horas logadas repartidas</TableHead>
            <TableHead className="text-right">Importe repartido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.campania ?? "(sin campaña)"}>
              <TableCell className={f.campania == null ? "text-muted-foreground italic" : "font-medium"}>
                {f.campania ?? "Sin tiempo de agente en sus campañas"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(f.horasAgente)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {f.pctAgente == null
                  ? "—"
                  : `${f.pctAgente.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(f.horasLogadas)}</TableCell>
              <TableCell className="text-right tabular-nums">{euros(f.importe)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-medium">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{horasLegibles(Math.round(totalAgente * 100) / 100)}</TableCell>
            <TableCell className="text-right tabular-nums">100,00 %</TableCell>
            <TableCell className="text-right tabular-nums">{horasLegibles(cliente.horas)}</TableCell>
            <TableCell className="text-right tabular-nums">{euros(cliente.importe)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </details>
  );
}

export async function SeccionFacturacion({
  ctx,
  datos,
}: {
  ctx: ContextoFacturacion;
  datos: Promise<FacturacionCompleta>;
}) {
  const completa = await datos;
  const { facturacion, porCliente, factura } = completa;
  const { desde, hasta, servicio } = ctx;
  const { mes, cierre, verCierre, lineasCierre, facturaMostrada } = estadoFactura(ctx, completa);
  const ajustesCierre = lineasCierre.filter((l) => l.ajuste).length;
  const totalVivo = totalesFactura(factura).importe ?? 0;
  const diferenciaCierre = cierre ? Math.round((totalVivo - (cierre.importeTotal ?? 0)) * 100) / 100 : 0;
  const puedeCerrar = ctx.puedeEditar && mes != null && !cierre && mes < hoyISO().slice(0, 7);
  // Ficheros de albaranes de GS: solo de un mes cerrado, uno por tipo presente
  const tiposGs = verCierre ? [...new Set(facturaMostrada.map((f) => tipoFicheroGs(f)))].sort() : [];
  const sinCodigoGs = factura.filter((f) => !f.codigoGs).map(etiquetaCampania);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Factura por campaña
            {cierre && (
              <Badge variant={verCierre ? "default" : "secondary"} className="gap-1 text-[10px]">
                <Lock className="h-3 w-3" />
                {verCierre ? `${mes} cerrado` : "Viendo el cálculo de ahora"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Todo lo que se cobra a cada campaña: su parte de las horas logadas del cliente, los minutos de
            línea a fijos y a móviles (encuesta incluida), los contactos finalizados y la cuota de DDIs, con
            el código de la campaña en GS. Período: {desde} a {hasta}.
            {!servicio && " Para cerrar un mes, elige un cliente y el mes completo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cierre && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span>
                {servicio} · {mes} cerrado por {cierre.cerradoPor ?? "—"} el{" "}
                {cierre.cerradoAt.toLocaleDateString("es-ES")}
                {cierre.origen === "importado" && " (importado del Excel de operaciones)"}:{" "}
                <strong>{euros(cierre.importeTotal)}</strong>.
                {diferenciaCierre !== 0 && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">
                    Calculado ahora sale {euros(totalVivo)} ({diferenciaCierre > 0 ? "+" : ""}
                    {euros(diferenciaCierre)}):{" "}
                    {ajustesCierre > 0
                      ? `el cierre tiene ${ajustesCierre} ajustes manuales y pueden haber cambiado datos o precios.`
                      : "han cambiado datos o precios desde el cierre."}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={`/operaciones?servicio=${encodeURIComponent(servicio ?? "")}&desde=${desde}&hasta=${hasta}${verCierre ? "&vivo=1" : ""}`}
                    />
                  }
                >
                  {verCierre ? "Ver el cálculo de ahora" : "Ver lo cerrado"}
                </Button>
                {tiposGs.map((tipo) => (
                  <Button
                    key={tipo}
                    variant="outline"
                    size="sm"
                    render={
                      <a href={`/api/export/albaranes-gs?servicio=${encodeURIComponent(servicio ?? "")}&mes=${mes}&tipo=${tipo}`} />
                    }
                  >
                    <Download className="h-4 w-4" /> Albaranes GS ({tipo})
                  </Button>
                ))}
                {ctx.esAdmin && (
                  <form action={reabrirMes}>
                    <input type="hidden" name="id" value={cierre.id} />
                    <input type="hidden" name="mes" value={mes ?? ""} />
                    <input type="hidden" name="servicio" value={servicio ?? ""} />
                    <Button variant="destructive" size="sm" type="submit">
                      <LockOpen className="h-4 w-4" /> Reabrir
                    </Button>
                  </form>
                )}
              </span>
            </div>
          )}
          <TablaFactura filas={facturaMostrada} conServicio={!servicio} />
          {verCierre && cierre && servicio && mes && (
            <AjustesCierre
              cierreId={cierre.id}
              servicio={servicio}
              mes={mes}
              lineas={lineasCierre}
              puedeEditar={ctx.puedeEditar}
              ajustar={ajustarCierre}
              deshacer={deshacerAjusteCierre}
            />
          )}
          {puedeCerrar && factura.length > 0 && (
            <form action={cerrarMes} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed px-3 py-2">
              <input type="hidden" name="servicio" value={servicio ?? ""} />
              <input type="hidden" name="mes" value={mes ?? ""} />
              <div className="min-w-56 flex-1 space-y-1">
                <p className="text-sm">
                  Cerrar {mes} de {servicio}: guarda estas cifras tal cual ({euros(totalesFactura(factura).importe)})
                  para el histórico y los albaranes.
                </p>
                {sinCodigoGs.length > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Sin código de GS: {sinCodigoGs.join(", ")}. Dáselo antes en «Códigos GS»: el cierre guarda
                    el código que haya y sin él no salen en el fichero de albaranes.
                  </p>
                )}
                <Input name="notas" placeholder="Notas (opcional)" maxLength={300} />
              </div>
              <Button type="submit" size="sm">
                <Lock className="h-4 w-4" /> Cerrar el mes
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {porCliente.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horas logadas por cliente</CardTitle>
            <CardDescription>
              Tiempo logado (de login a logout, haya o no campaña abierta) de los usuarios del cliente,{" "}
              <code>PREFIJO_nnnn</code>. No cuentan los usuarios sin el prefijo ni los de bbdd (<code>_BD</code>,{" "}
              <code>_BD_LX</code>), que se facturan por sus campañas. Las sesiones se asignan al día en que
              empiezan. Debajo de cada cliente, el reparto por campaña según el tiempo de agente. Período:{" "}
              {desde} a {hasta}.
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
                      <TableCell className="text-right tabular-nums">{horasLegibles(c.horas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{euros(c.precioUnitario)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{euros(c.importe)}</TableCell>
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
            Todo lo medido por campaña. La columna «Facturable» marca las unidades configuradas en
            Administración → Facturación. Las horas por campaña son las <strong>productivas</strong> (en
            llamada); las logadas van en «Horas logadas por cliente». Minutos de línea: llamadas atendidas a
            móviles y a fijos, más la encuesta tras la gestión; los especiales (901, 902…) se presupuestan
            aparte y no se cobran aquí. DDIs: cuota del mes entero por cada uno activo algún día. Período:{" "}
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
                <TableHead className="text-right">Min. móvil</TableHead>
                <TableHead className="text-right">Min. fijo</TableHead>
                <TableHead className="text-right" title="Números especiales (901, 902, 80x, 70x): no se cobran aquí">
                  Min. especial
                </TableHead>
                <TableHead className="text-right">DDIs</TableHead>
                <TableHead>Facturable</TableHead>
                <TableHead className="text-right">Importe (sin h. logadas)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturacion.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground">
                    Sin actividad en el período seleccionado
                  </TableCell>
                </TableRow>
              ) : (
                facturacion.map((f) => (
                  <TableRow key={f.campania}>
                    <TableCell className="font-medium">{f.campania}</TableCell>
                    <TableCell className="text-right tabular-nums">{horasLegibles(f.medidas.horasProductivas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.medidas.interacciones.toLocaleString("es-ES")}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.medidas.atendidas.toLocaleString("es-ES")}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.medidas.exitos.toLocaleString("es-ES")}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.medidas.leadsFinalizados.toLocaleString("es-ES")}</TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={
                        f.tarificacion?.minutosEncuesta
                          ? `De ellos, ${minutos(f.tarificacion.minutosEncuesta)} min de encuesta (móvil y fijo)`
                          : undefined
                      }
                    >
                      {minutos(f.tarificacion?.minutos.movil)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{minutos(f.tarificacion?.minutos.fijo)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {minutos(f.tarificacion?.minutos.especial)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.ddis ? f.ddis.toLocaleString("es-ES") : "—"}</TableCell>
                    <TableCell>
                      {f.lineas.length === 0 && !f.porHorasLogadas ? (
                        <span className="text-xs text-muted-foreground">Sin configurar</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {f.porHorasLogadas && (
                            <Badge variant="secondary" className="text-[10px]">
                              Horas logadas (cliente)
                            </Badge>
                          )}
                          {f.lineas.map((l, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">
                              {NOMBRE_UNIDAD[l.unidad]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euros(f.importeTotal)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Listas outbound ----------

export async function SeccionListas({ datos }: { datos: Promise<PenetracionLista[]> }) {
  const listas = await datos;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Penetración de listas outbound</CardTitle>
        <CardDescription>Contactos según fecha programada (activity.moment) dentro del período</CardDescription>
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
                  <TableCell className="text-right tabular-nums">{l.totalContactos.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.done.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{l.exitos.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.sinExito.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.sinContacto.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.intentosAutoMedio ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Pausas ----------

export async function SeccionPausas({ datos }: { datos: Promise<RazonNotReady[]> }) {
  const razones = await datos;
  return (
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
                  <TableCell className="text-right tabular-nums">{horasDesdeSegundos(r.segundosTotal)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
