import { Fragment } from "react";
import { Download, Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TablaFactura, euros, ordenarGrupos } from "@/components/operaciones/tabla-factura";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { tipoFicheroGs } from "@/lib/albaranes-gs";
import { cierreVigente, lineasAjustadas, listarCargos, prefijosExcluidosReparto } from "@/lib/db/facturacion";
import { UNIDADES_CARGO } from "@/lib/db/schema";
import { mesCompleto, mesesDelRango } from "@/lib/ddis";
import {
  ARTICULO_GS,
  NOMBRE_UNIDAD,
  configuracionFacturacion,
  totalesFactura,
  type FacturacionCompleta,
} from "@/lib/facturacion";
import {
  agruparPorServicio,
  etiquetaCampania,
  filasDeCierre,
  totalesUnidades,
  type FacturacionCampania,
} from "@/lib/facturacion-campania";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import { horasDesdeSegundos, horasLegibles, hoyISO } from "@/lib/fechas";
import { ordenarPorTexto, valoresOrden } from "@/lib/orden";
import { esIvr, listaServicios } from "@/lib/rdb/queries/servicios";
import type { HorasAgenteReales, PenetracionLista, RazonNotReady } from "@/lib/rdb/types";
import {
  ajustarCierre,
  borrarCargoPuntual,
  cerrarMes,
  crearCargoPuntual,
  deshacerAjusteCierre,
  reabrirMes,
} from "./acciones";
import { SeccionCargando } from "@/components/cargando";
import { ayudaDe } from "@/lib/glosario";

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

/** Hueco mientras carga una sección: la animación común del panel (components/cargando.tsx). */
export function Cargando({ texto, alto = "h-40" }: { texto: string; alto?: string }) {
  return <SeccionCargando texto={texto} alto={alto} />;
}

export function CargandoKpis() {
  return <SeccionCargando texto="Calculando los totales…" alto="h-24" />;
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

/** DDIs geográficos y, si los hay, los móviles entre paréntesis. */
function ddisTexto(geo: number, movil: number): string {
  if (!geo && !movil) return "—";
  return `${geo.toLocaleString("es-ES")}${movil ? ` (+${movil.toLocaleString("es-ES")} móv.)` : ""}`;
}

// ---------- Cargos puntuales ----------

/**
 * Cargos puntuales del cliente (BASE DE DATOS y PREPARACIÓN DE CAMPAÑA,
 * «U» en GS): los de los meses del rango y, con un mes completo sin cerrar,
 * el formulario para apuntar otro. Entran en la factura de su campaña.
 */
async function CargosPuntuales({
  ctx,
  mes,
  cerrado,
}: {
  ctx: ContextoFacturacion;
  mes: string | null;
  cerrado: boolean;
}) {
  const servicio = ctx.servicio!;
  const meses = mesesDelRango(ctx.desde, ctx.hasta);
  const cargos = listarCargos(meses[0].mes, meses[meses.length - 1].mes, servicio);
  const campanias = ((await listaServicios()).find((s) => s.servicio === servicio)?.campanias ?? [])
    .filter((c) => !esIvr(c))
    .sort();
  // Precio de tarifa del cliente para cada cargo (orientativo: una campaña con tarifa propia manda)
  const tarifa = configuracionFacturacion().porServicio.get(servicio) ?? [];
  const precioTarifa = (u: string) => tarifa.find((l) => l.unidad === u)?.precioUnitario ?? null;
  const puedeApuntar = ctx.puedeEditar && mes != null && !cerrado;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cargos puntuales</CardTitle>
        <CardDescription>
          BASE DE DATOS (CAMP. EXTERNAS) y PREPARACIÓN DE CAMPAÑA: no se miden, se apuntan aquí en el mes y la
          campaña que toca y entran en su factura. Sin precio, el de la tarifa del cliente.
          {mes == null && " Para apuntar uno, elige el mes completo."}
          {mes != null && cerrado && ` ${mes} está cerrado: sus cargos ya están facturados.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún cargo puntual en el período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Artículo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">€/unidad</TableHead>
                <TableHead>Apuntado por</TableHead>
                {puedeApuntar && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums">{c.mes}</TableCell>
                  <TableCell className="font-medium">{c.campaignShortname}</TableCell>
                  <TableCell>{ARTICULO_GS[c.unidad]}</TableCell>
                  <TableCell className="whitespace-normal text-sm">{c.concepto}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.cantidad.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.precioUnitario != null ? (
                      euros(c.precioUnitario)
                    ) : (
                      <span className="text-muted-foreground">tarifa ({euros(precioTarifa(c.unidad))})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.creadoPor} · {c.creadoAt.toLocaleDateString("es-ES")}
                  </TableCell>
                  {puedeApuntar && (
                    <TableCell className="text-right">
                      {c.mes === mes && (
                        <form action={borrarCargoPuntual}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button variant="destructive" size="xs" type="submit">
                            Quitar
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {puedeApuntar && (
          <form
            action={crearCargoPuntual}
            className="grid items-end gap-3 rounded-md border border-dashed p-3 md:grid-cols-[1fr_1.4fr_90px_110px_1.6fr_auto]"
          >
            <input type="hidden" name="servicio" value={servicio} />
            <input type="hidden" name="mes" value={mes ?? ""} />
            <div className="space-y-1">
              <label htmlFor="cargo-campania" className="text-xs font-medium">
                Campaña
              </label>
              <select
                id="cargo-campania"
                name="campania"
                required
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
              >
                {campanias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cargo-unidad" className="text-xs font-medium">
                Artículo
              </label>
              <select
                id="cargo-unidad"
                name="unidad"
                required
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
              >
                {UNIDADES_CARGO.map((u) => (
                  <option key={u} value={u}>
                    {ARTICULO_GS[u]}
                    {precioTarifa(u) != null ? ` (tarifa ${euros(precioTarifa(u))})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cargo-cantidad" className="text-xs font-medium">
                Cantidad
              </label>
              <Input id="cargo-cantidad" name="cantidad" type="number" step="0.01" min="0.01" defaultValue="1" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="cargo-precio" className="text-xs font-medium">
                €/unidad
              </label>
              <Input id="cargo-precio" name="precio" type="number" step="0.0001" min="0" placeholder="tarifa" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cargo-concepto" className="text-xs font-medium">
                Concepto
              </label>
              <Input
                id="cargo-concepto"
                name="concepto"
                required
                minLength={3}
                maxLength={200}
                placeholder="ej. carga de la lista de octubre"
              />
            </div>
            <Button type="submit" size="sm">
              Apuntar en {mes}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
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
      {/* Los mismos nombres que en el resto del panel (13/11/2026): antes «Atendidas» y «Leads finalizados» */}
      <TarjetaKpi titulo="Interacciones" valor={totales.interacciones.toLocaleString("es-ES")} ayuda={ayudaDe("interacciones")} />
      <TarjetaKpi titulo="Llamadas gestionadas" valor={totales.atendidas.toLocaleString("es-ES")} ayuda={ayudaDe("atendidas")} />
      <TarjetaKpi titulo="Éxitos" valor={totales.exitos.toLocaleString("es-ES")} ayuda={ayudaDe("exitos")} />
      <TarjetaKpi titulo="Contactos cerrados" valor={totales.leads.toLocaleString("es-ES")} ayuda={ayudaDe("leads")} />
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
      <TablaOrdenable>
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
              <CabeceraOrdenable col={1} numerica className="text-right">
                Tiempo de agente ({cliente.prefijo}_nnnn)
              </CabeceraOrdenable>
              <CabeceraOrdenable col={2} numerica className="text-right">
                % tiempo de agente
              </CabeceraOrdenable>
              <CabeceraOrdenable col={3} numerica className="text-right">
                Horas logadas repartidas
              </CabeceraOrdenable>
              <CabeceraOrdenable col={4} numerica className="text-right">
                Importe repartido
              </CabeceraOrdenable>
            </TableRow>
          </TableHeader>
          <TableBody>
            <FilasOrdenables>
              {filas.map((f) => (
                <TableRow
                  key={f.campania ?? "(sin campaña)"}
                  data-orden={valoresOrden(f.campania, f.horasAgente, f.pctAgente, f.horasLogadas, f.importe)}
                >
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
            </FilasOrdenables>
            <TableRow className="font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(Math.round(totalAgente * 100) / 100)}</TableCell>
              <TableCell className="text-right tabular-nums">100,00 %</TableCell>
              <TableCell className="text-right tabular-nums">{horasLegibles(cliente.horas)}</TableCell>
              <TableCell className="text-right tabular-nums">{euros(cliente.importe)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TablaOrdenable>
    </details>
  );
}

/**
 * Una parte de la facturación (13/11/2026, Operaciones en secciones): la
 * factura con el cierre y los cargos, las horas logadas por cliente o las
 * unidades por campaña. Las tres salen de la misma `facturacionCompleta`.
 */
export async function SeccionFacturacion({
  ctx,
  datos,
  parte,
}: {
  ctx: ContextoFacturacion;
  datos: Promise<FacturacionCompleta>;
  parte: "factura" | "horas" | "unidades";
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
  // «Unidades por campaña»: agrupada por cliente (de la A a la Z), con su total si tiene más de una campaña
  const gruposUnidades = ordenarGrupos(agruparPorServicio(facturacion));
  const filaTotalUnidades = (
    clave: string,
    etiqueta: string,
    de: readonly FacturacionCampania[],
    general: boolean,
  ) => {
    const t = totalesUnidades(de);
    return (
      <TableRow key={clave} className={general ? "font-semibold" : "bg-muted/40 font-medium"}>
        <TableCell colSpan={servicio ? 1 : 2}>{etiqueta}</TableCell>
        <TableCell className="text-right tabular-nums">{horasLegibles(t.horasProductivas)}</TableCell>
        <TableCell className="text-right tabular-nums">{t.interacciones.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.atendidas.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.exitos.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.leadsFinalizados.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.exitosFinalizados.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.leadsRecibidos.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{t.sesiones.toLocaleString("es-ES")}</TableCell>
        <TableCell className="text-right tabular-nums">{minutos(t.minutosMovil)}</TableCell>
        <TableCell className="text-right tabular-nums">{minutos(t.minutosFijo)}</TableCell>
        <TableCell className="text-right tabular-nums">{minutos(t.minutosEspecial)}</TableCell>
        <TableCell className="text-right tabular-nums">{ddisTexto(t.ddis, t.ddisMovil)}</TableCell>
        <TableCell />
        <TableCell className="text-right tabular-nums">{euros(t.importe)}</TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      {parte === "factura" && (
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
            Todo lo que se cobra a cada campaña, con el código de la campaña en GS: los artículos de GS que el
            cliente tiene en su tarifa (Artículos y tarifas) y los cargos puntuales del mes. Pasa el ratón por
            una columna para ver su artículo de GS. Período: {desde} a {hasta}.
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
      )}

      {parte === "factura" && servicio && <CargosPuntuales ctx={ctx} mes={mes} cerrado={cierre != null} />}

      {parte === "horas" && porCliente.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Ningún cliente de lo que estás viendo factura por horas logadas (se configura en «Artículos y tarifas»).
        </p>
      )}

      {parte === "horas" && porCliente.length > 0 && (
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
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Cliente (servicio)</CabeceraOrdenable>
                    <CabeceraOrdenable col={1}>Usuarios</CabeceraOrdenable>
                    <CabeceraOrdenable col={2} numerica className="text-right">
                      Horas logadas
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={3} numerica className="text-right">
                      €/hora
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={4} numerica className="text-right">
                      Importe
                    </CabeceraOrdenable>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {porCliente.map((c) => (
                      <Fragment key={`${c.servicio}|${c.prefijo}`}>
                        <TableRow data-orden={valoresOrden(c.servicio, c.prefijo, c.horas, c.precioUnitario, c.importe)}>
                          <TableCell className="font-medium">{c.servicio}</TableCell>
                          <TableCell>
                            <details>
                              <summary className="cursor-pointer text-sm">
                                {c.prefijo}_nnnn · {c.usuarios.length} usuarios
                              </summary>
                              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                {ordenarPorTexto(c.usuarios, (u) => u.usuario).map((u) => (
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
                  </FilasOrdenables>
                </TableBody>
              </Table>
            </TablaOrdenable>
          </CardContent>
        </Card>
      )}

      {parte === "unidades" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unidades por campaña</CardTitle>
          <CardDescription>
            Todo lo medido por campaña. La columna «Facturable» marca los artículos de su tarifa (Artículos y
            tarifas). Las horas por campaña son las <strong>productivas</strong> (en llamada); las logadas van en
            «Horas logadas por cliente». «Fin. éxito»: contactos cerrados en éxito; «Recibidos»: contactos que
            entran en la campaña; «Gestionados»: sesiones de script (el artículo «Encuestas realizadas»). Minutos
            de línea: llamadas atendidas a móviles, a fijos y a especiales (901, 902…), más la encuesta tras la
            gestión. DDIs: cuota del mes entero por cada uno activo algún día (geográficos y, entre paréntesis,
            móviles). Período: {desde} a {hasta}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Por campaña de la A a la Z dentro de cada cliente; pulsando una cabecera, por esa columna */}
          <TablaOrdenable inicial={{ col: 1, desc: false }}>
            <Table>
              <TableHeader>
                <TableRow>
                  {!servicio && <CabeceraOrdenable col={0}>Cliente</CabeceraOrdenable>}
                  <CabeceraOrdenable col={1}>Campaña</CabeceraOrdenable>
                  <CabeceraOrdenable col={2} numerica className="text-right">
                    H. productivas
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={3} numerica className="text-right">
                    Interacc.
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={4} numerica className="text-right">
                    Atendidas
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={5} numerica className="text-right">
                    Éxitos
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={6} numerica className="text-right">
                    Leads fin.
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={7} numerica className="text-right" title="Contactos cerrados en éxito">
                    Fin. éxito
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={8} numerica className="text-right" title="Contactos que entran en la campaña">
                    Recibidos
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={9} numerica className="text-right" title="Sesiones de script: contactos gestionados">
                    Gestionados
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={10} numerica className="text-right">
                    Min. móvil
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={11} numerica className="text-right">
                    Min. fijo
                  </CabeceraOrdenable>
                  <CabeceraOrdenable
                    col={12}
                    numerica
                    className="text-right"
                    title="Números especiales (901, 902, 80x, 70x): artículo «TARIFICACION 901,2,X»"
                  >
                    Min. 90X
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={13} numerica className="text-right">
                    DDIs
                  </CabeceraOrdenable>
                  <TableHead>Facturable</TableHead>
                  <CabeceraOrdenable col={14} numerica className="text-right">
                    Importe (sin h. logadas)
                  </CabeceraOrdenable>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturacion.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={servicio ? 15 : 16} className="text-center text-muted-foreground">
                      Sin actividad en el período seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  gruposUnidades.map((g) => (
                    <Fragment key={g.servicio ?? "(sin cliente)"}>
                      <FilasOrdenables>
                        {g.filas.map((f) => (
                          <TableRow
                            key={f.campania}
                            data-orden={valoresOrden(
                              f.servicio,
                              f.campania,
                              f.medidas.horasProductivas,
                              f.medidas.interacciones,
                              f.medidas.atendidas,
                              f.medidas.exitos,
                              f.medidas.leadsFinalizados,
                              f.medidas.exitosFinalizados,
                              f.leadsRecibidos,
                              f.medidas.sesiones,
                              f.tarificacion?.minutos.movil,
                              f.tarificacion?.minutos.fijo,
                              f.tarificacion?.minutos.especial,
                              f.ddis + f.ddisMovil,
                              f.importeTotal,
                            )}
                          >
                            {!servicio && <TableCell className="text-muted-foreground">{f.servicio ?? "—"}</TableCell>}
                            <TableCell className="font-medium">{f.campania}</TableCell>
                            <TableCell className="text-right tabular-nums">{horasLegibles(f.medidas.horasProductivas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.interacciones.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.atendidas.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.exitos.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.leadsFinalizados.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.exitosFinalizados.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.leadsRecibidos.toLocaleString("es-ES")}</TableCell>
                            <TableCell className="text-right tabular-nums">{f.medidas.sesiones.toLocaleString("es-ES")}</TableCell>
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
                            <TableCell className="text-right tabular-nums">{minutos(f.tarificacion?.minutos.especial)}</TableCell>
                            <TableCell className="text-right tabular-nums">{ddisTexto(f.ddis, f.ddisMovil)}</TableCell>
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
                                    <Badge key={i} variant="secondary" className="text-[10px]" title={NOMBRE_UNIDAD[l.unidad]}>
                                      {ARTICULO_GS[l.unidad] ?? NOMBRE_UNIDAD[l.unidad]}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euros(f.importeTotal)}</TableCell>
                          </TableRow>
                        ))}
                      </FilasOrdenables>
                      {g.filas.length > 1
                        ? filaTotalUnidades(
                            `total|${g.servicio}`,
                            `Total ${g.servicio ?? "sin cliente"}`,
                            g.filas,
                            gruposUnidades.length === 1,
                          )
                        : null}
                    </Fragment>
                  ))
                )}
                {gruposUnidades.length > 1 && filaTotalUnidades("total|general", "Total general", facturacion, true)}
              </TableBody>
            </Table>
          </TablaOrdenable>
        </CardContent>
      </Card>
      )}
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
        <TablaOrdenable>
          <Table>
            <TableHeader>
              <TableRow>
                <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
                <CabeceraOrdenable col={1}>Lista</CabeceraOrdenable>
                <CabeceraOrdenable col={2} numerica className="text-right">
                  Contactos
                </CabeceraOrdenable>
                <CabeceraOrdenable col={3} numerica className="text-right">
                  Finalizados
                </CabeceraOrdenable>
                <CabeceraOrdenable col={4} numerica className="text-right">
                  Éxitos
                </CabeceraOrdenable>
                <CabeceraOrdenable col={5} numerica className="text-right">
                  Sin éxito
                </CabeceraOrdenable>
                <CabeceraOrdenable col={6} numerica className="text-right">
                  Sin contactar
                </CabeceraOrdenable>
                <CabeceraOrdenable col={7} numerica className="text-right">
                  Intentos medios
                </CabeceraOrdenable>
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
                <FilasOrdenables>
                  {listas.map((l) => (
                    <TableRow
                      key={`${l.campania}-${l.lista}`}
                      // Campaña y, dentro, lista: así queda en orden con la misma campaña
                      data-orden={valoresOrden(`${l.campania}\u0000${l.lista}`, l.lista, l.totalContactos, l.done, l.exitos, l.sinExito, l.sinContacto, l.intentosAutoMedio)}
                    >
                      <TableCell className="font-medium">{l.campania}</TableCell>
                      <TableCell>{l.lista}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.totalContactos.toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.done.toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{l.exitos.toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.sinExito.toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.sinContacto.toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.intentosAutoMedio ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </FilasOrdenables>
              )}
            </TableBody>
          </Table>
        </TablaOrdenable>
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
        <TablaOrdenable>
          <Table>
            <TableHeader>
              <TableRow>
                <CabeceraOrdenable col={0}>Agente</CabeceraOrdenable>
                <CabeceraOrdenable col={1}>Razón</CabeceraOrdenable>
                <CabeceraOrdenable col={2} numerica className="text-right">
                  Veces
                </CabeceraOrdenable>
                <CabeceraOrdenable col={3} numerica className="text-right">
                  Tiempo total
                </CabeceraOrdenable>
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
                <FilasOrdenables>
                  {razones.map((r) => (
                    <TableRow
                      key={`${r.agente}|${r.razon}`}
                      // Agente y, dentro, razón
                      data-orden={valoresOrden(`${r.agente}\u0000${r.razon}`, r.razon, r.veces, r.segundosTotal)}
                    >
                      <TableCell className="font-medium">{r.agente}</TableCell>
                      <TableCell>{r.razon}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.veces}</TableCell>
                      <TableCell className="text-right tabular-nums">{horasDesdeSegundos(r.segundosTotal)}</TableCell>
                    </TableRow>
                  ))}
                </FilasOrdenables>
              )}
            </TableBody>
          </Table>
        </TablaOrdenable>
      </CardContent>
    </Card>
  );
}
