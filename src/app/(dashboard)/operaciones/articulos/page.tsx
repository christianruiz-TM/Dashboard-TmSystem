import type { Metadata } from "next";
import { Fragment } from "react";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLES_OPERACIONES, puedeEditarFacturacion, requireRol } from "@/lib/auth/rbac";
import { db } from "@/lib/db/sqlite";
import { billingConfig, type BillingConfigRow } from "@/lib/db/schema";
import {
  ARTICULO_GS,
  CALCULO_UNIDAD,
  NOMBRE_UNIDAD,
  ORDEN_UNIDADES,
  esCargoPuntual,
} from "@/lib/facturacion-campania";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { listaServicios, mapaCampaniaServicio } from "@/lib/rdb/queries/servicios";
import { borrarLineaTarifa, crearLineaTarifa, editarLineaTarifa } from "../acciones";

export const metadata: Metadata = { title: "Artículos y tarifas" };
export const dynamic = "force-dynamic";

// ============================================================
// Operaciones → Artículos y tarifas (19/10/2026): qué artículos de GS
// factura cada cliente y a qué precio. Antes estaba en Administración →
// Facturación; ahora lo mantiene Operaciones (y admin) y Dirección lo ve.
// ============================================================

const euros = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });

/** Artículo de una línea: el de GS y, si hace falta, el detalle de la unidad. */
function Articulo({ l }: { l: BillingConfigRow }) {
  return (
    <div>
      <div className="font-medium">{ARTICULO_GS[l.unidad] ?? NOMBRE_UNIDAD[l.unidad]}</div>
      <div className="text-xs text-muted-foreground">
        {NOMBRE_UNIDAD[l.unidad]}
        {l.unidad === "horas_logadas" && ` · ${l.prefijoUsuario ? `${l.prefijoUsuario}_nnnn` : "falta el prefijo"}`}
        {(l.unidad === "ddi" || l.unidad === "ddi_movil") &&
          ` · ${l.soloConActividad ? "solo los meses con llamadas" : "todos los meses"}`}
      </div>
    </div>
  );
}

export default async function PaginaArticulos({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  const usuario = await requireRol(...ROLES_OPERACIONES);
  const puedeEditar = puedeEditarFacturacion(usuario.rol);
  const params = await searchParams;
  const [campanias, servicios] = await Promise.all([listadoCampanias(), listaServicios()]);
  const lineas = db
    .select()
    .from(billingConfig)
    .orderBy(asc(billingConfig.serviceName), asc(billingConfig.campaignShortname), asc(billingConfig.id))
    .all();
  const servicioDe = mapaCampaniaServicio(servicios);
  const orden = (l: BillingConfigRow) => ORDEN_UNIDADES.indexOf(l.unidad);

  // Tarifas por cliente: las de servicio y, debajo, las de sus campañas (excepciones)
  const porCliente = new Map<string, BillingConfigRow[]>();
  for (const l of lineas) {
    const cliente = l.serviceName ?? servicioDe.get(l.campaignShortname ?? "") ?? "Sin cliente";
    porCliente.set(cliente, [...(porCliente.get(cliente) ?? []), l]);
  }
  const clientes = [...porCliente].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Artículos y tarifas</h1>
          <p className="text-sm text-muted-foreground">
            Qué artículos de GS factura cada cliente y a qué precio. Es lo que sale en «Factura por campaña», en el
            cierre de mes y en el fichero de albaranes de GS.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<a href="/operaciones" />}>
          <ArrowLeft className="h-4 w-4" /> Operaciones
        </Button>
      </div>
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Artículos de GS</CardTitle>
          <CardDescription>
            Cómo calcula el panel cada artículo. Los de cadencia «U» son cargos puntuales: no se miden, los apunta
            Operaciones en la factura del mes. Un artículo solo se cobra a los clientes que lo tienen en su tarifa
            (salvo los cargos puntuales, que se cobran aunque no estén: la tarifa solo pone el precio).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo de GS</TableHead>
                <TableHead>Cadencia</TableHead>
                <TableHead>Cómo se calcula</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ORDEN_UNIDADES.map((u) => (
                <TableRow key={u}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{ARTICULO_GS[u] ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{NOMBRE_UNIDAD[u]}</div>
                  </TableCell>
                  <TableCell>{esCargoPuntual(u) ? <Badge variant="secondary">U</Badge> : null}</TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">{CALCULO_UNIDAD[u]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Añadir un artículo a una tarifa</CardTitle>
            <CardDescription>
              Lo normal es por <strong>cliente</strong>: vale para todas sus campañas. Para un caso particular, elige
              una campaña: su tarifa sustituye entera a la del cliente (a una bbdd hay que darle también su DDI). El
              precio es opcional: sin precio solo se ven las cantidades. HORA AGENTE por horas logadas necesita el
              prefijo de los usuarios del cliente (GH → GH_0851…).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={crearLineaTarifa}
              className="grid items-end gap-3 md:grid-cols-[1.3fr_1.5fr_110px_110px_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor="objetivo">Cliente o campaña</Label>
                <SelectNativo id="objetivo" name="objetivo" required>
                  <optgroup label="Clientes: todas sus campañas">
                    {servicios.map((s) => (
                      <option key={`svc:${s.servicio}`} value={`svc:${s.servicio}`}>
                        {s.servicio} ({s.campanias.length} campañas)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Una campaña (excepción)">
                    {campanias.map((c) => (
                      <option key={`camp:${c.shortname}`} value={`camp:${c.shortname}`}>
                        {c.shortname}
                      </option>
                    ))}
                  </optgroup>
                </SelectNativo>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unidad">Artículo</Label>
                <SelectNativo id="unidad" name="unidad" required>
                  {ORDEN_UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {ARTICULO_GS[u] ? `${ARTICULO_GS[u]} — ${NOMBRE_UNIDAD[u]}` : `${NOMBRE_UNIDAD[u]} (no es de GS)`}
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prefijo">Prefijo usuarios</Label>
                <Input
                  id="prefijo"
                  name="prefijo"
                  placeholder="ej. GH"
                  maxLength={30}
                  pattern="[A-Za-z0-9]+(_[A-Za-z0-9]+)*"
                  title="Solo para horas logadas: letras y números (GH, Av, Soc_Fed)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="precio">€/unidad</Label>
                <Input id="precio" name="precio" type="number" step="0.0001" min="0" placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Input id="notas" name="notas" placeholder="ej. presupuesto 2026" maxLength={300} />
              </div>
              <Button type="submit">Añadir</Button>
              <label className="flex items-center gap-2 text-sm md:col-span-6">
                <input type="checkbox" name="soloConActividad" className="h-4 w-4" />
                Solo para DDIs: cobrarlos solo los meses en que la campaña tuvo llamadas (según el presupuesto del
                cliente; p. ej. las bbdd entre tandas no los pagan)
              </label>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarifas por cliente ({lineas.length} líneas)</CardTitle>
          <CardDescription>
            Cambiar un precio vale desde ya para los meses sin cerrar; los meses cerrados guardan el suyo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún cliente tiene tarifa todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-right">€/unidad</TableHead>
                  <TableHead>Notas</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map(([cliente, suyas]) => (
                  <Fragment key={cliente}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={puedeEditar ? 5 : 4} className="font-semibold">
                        {cliente}
                      </TableCell>
                    </TableRow>
                    {[...suyas]
                      .sort(
                        (a, b) =>
                          Number(a.serviceName == null) - Number(b.serviceName == null) ||
                          (a.campaignShortname ?? "").localeCompare(b.campaignShortname ?? "") ||
                          orden(a) - orden(b),
                      )
                      .map((l) => (
                        <TableRow key={l.id} className={l.activo ? undefined : "opacity-50"}>
                          <TableCell className="pl-4">
                            {l.serviceName ? (
                              <Badge className="text-[10px]">Todo el cliente</Badge>
                            ) : (
                              <span className="text-sm">
                                <Badge variant="secondary" className="mr-1 text-[10px]">
                                  Campaña
                                </Badge>
                                {l.campaignShortname}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <Articulo l={l} />
                          </TableCell>
                          {puedeEditar ? (
                            <TableCell colSpan={2}>
                              <form action={editarLineaTarifa} className="flex items-center justify-end gap-2">
                                <input type="hidden" name="id" value={l.id} />
                                <Input
                                  name="precio"
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  defaultValue={l.precioUnitario ?? ""}
                                  placeholder="—"
                                  className="h-8 w-28 text-right"
                                  aria-label="Precio por unidad"
                                />
                                <Input
                                  name="notas"
                                  defaultValue={l.notas ?? ""}
                                  placeholder="Notas"
                                  maxLength={300}
                                  className="h-8 w-48"
                                  aria-label="Notas"
                                />
                                <Button type="submit" size="xs" variant="outline">
                                  Guardar
                                </Button>
                              </form>
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className="text-right tabular-nums">{euros(l.precioUnitario)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{l.notas ?? "—"}</TableCell>
                            </>
                          )}
                          {puedeEditar && (
                            <TableCell className="text-right">
                              <form action={borrarLineaTarifa} className="inline">
                                <input type="hidden" name="id" value={l.id} />
                                <Button variant="destructive" size="xs" type="submit">
                                  Quitar
                                </Button>
                              </form>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
