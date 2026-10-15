import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
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
import { listarCampaniasGs, type CampaniaGsRow } from "@/lib/db/facturacion";
import { configuracionFacturacion } from "@/lib/facturacion";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { esIvr, listaServicios } from "@/lib/rdb/queries/servicios";
import { borrarCampaniaGs, guardarCampaniaGs } from "../acciones";

export const metadata: Metadata = { title: "Códigos de campaña en GS" };
export const dynamic = "force-dynamic";

function valor(fila: CampaniaGsRow | undefined, campo: keyof CampaniaGsRow): string {
  const v = fila?.[campo];
  return v == null || v instanceof Date ? "" : String(v);
}

export default async function PaginaCampaniasGs({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; nueva?: string; msg?: string; detalle?: string }>;
}) {
  const usuario = await requireRol(...ROLES_OPERACIONES);
  const puedeEditar = puedeEditarFacturacion(usuario.rol);
  const params = await searchParams;
  const filas = listarCampaniasGs();
  const [campanias, servicios] = await Promise.all([listadoCampanias(), listaServicios()]);
  const editando = puedeEditar && params.editar ? filas.find((f) => f.id === Number(params.editar)) : undefined;

  // Campañas que se facturan (su servicio o ellas tienen tarifa) y no tienen código
  const { porServicio, porCampania } = configuracionFacturacion();
  const conCodigo = new Set(filas.map((f) => f.campaignShortname));
  const sinCodigo = [
    ...new Set([
      ...servicios.filter((s) => porServicio.has(s.servicio)).flatMap((s) => s.campanias),
      ...porCampania.keys(),
    ]),
  ]
    .filter((c) => !esIvr(c) && !conCodigo.has(c))
    .sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Códigos de campaña en GS</h1>
          <p className="text-sm text-muted-foreground">
            El código de cada campaña de Altitude en GS. Es el que lleva cada fila de la factura por
            campaña y el fichero de albaranes.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<a href="/operaciones" />}>
          <ArrowLeft className="h-4 w-4" /> Operaciones
        </Button>
      </div>
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      {sinCodigo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campañas que se facturan sin código de GS ({sinCodigo.length})</CardTitle>
            <CardDescription>
              Sin código no pueden ir al albarán. Si alguna no se factura de verdad, no hace falta darle código.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {sinCodigo.map((c) =>
              puedeEditar ? (
                <Button key={c} variant="outline" size="xs" render={<a href={`/operaciones/campanias-gs?nueva=${encodeURIComponent(c)}`} />}>
                  {c}
                </Button>
              ) : (
                <span key={c} className="rounded border px-2 py-0.5 text-xs">
                  {c}
                </span>
              ),
            )}
          </CardContent>
        </Card>
      )}

      {puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editando ? `Editar ${editando.campaignShortname}` : "Nuevo código de GS"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={guardarCampaniaGs} key={editando?.id ?? params.nueva ?? "nuevo"} className="space-y-3">
              {editando && <input type="hidden" name="id" value={editando.id} />}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="campania">Campaña de Altitude</Label>
                  <Input
                    id="campania"
                    name="campania"
                    list="campanias"
                    required
                    defaultValue={editando ? editando.campaignShortname : (params.nueva ?? "")}
                  />
                  <datalist id="campanias">
                    {campanias.map((c) => (
                      <option key={c.shortname} value={c.shortname} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="codigoGs">Código en GS</Label>
                  <Input
                    id="codigoGs"
                    name="codigoGs"
                    required
                    pattern="\d{1,12}"
                    placeholder="0002330"
                    defaultValue={valor(editando, "codigoGs")}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="denominacion">Denominación</Label>
                  <Input id="denominacion" name="denominacion" defaultValue={valor(editando, "denominacion")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clienteGs">Cliente (GS)</Label>
                  <Input id="clienteGs" name="clienteGs" defaultValue={valor(editando, "clienteGs")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="presupuestoGs">Presupuesto (GS)</Label>
                  <Input id="presupuestoGs" name="presupuestoGs" defaultValue={valor(editando, "presupuestoGs")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechaInicio">Inicio</Label>
                  <Input id="fechaInicio" name="fechaInicio" type="date" defaultValue={valor(editando, "fechaInicio")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechaFin">Fin</Label>
                  <Input id="fechaFin" name="fechaFin" type="date" defaultValue={valor(editando, "fechaFin")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Input id="notas" name="notas" maxLength={500} defaultValue={valor(editando, "notas")} />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editando ? "Guardar cambios" : "Añadir"}</Button>
                {(editando || params.nueva) && (
                  <Button variant="outline" render={<a href="/operaciones/campanias-gs" />}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Códigos dados de alta ({filas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead>Código GS</TableHead>
                <TableHead>Denominación</TableHead>
                <TableHead>Cliente GS</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                {puedeEditar && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={puedeEditar ? 7 : 6} className="text-center text-muted-foreground">
                    Todavía no hay códigos de GS
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.campaignShortname}</TableCell>
                    <TableCell className="tabular-nums">{f.codigoGs}</TableCell>
                    <TableCell>{f.denominacion ?? ""}</TableCell>
                    <TableCell className="tabular-nums">{f.clienteGs ?? ""}</TableCell>
                    <TableCell className="tabular-nums">{f.fechaInicio ?? ""}</TableCell>
                    <TableCell className="tabular-nums">{f.fechaFin ?? ""}</TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1">
                          <Button variant="outline" size="xs" render={<a href={`/operaciones/campanias-gs?editar=${f.id}`} />}>
                            Editar
                          </Button>
                          <form action={borrarCampaniaGs}>
                            <input type="hidden" name="id" value={f.id} />
                            <Button variant="destructive" size="xs" type="submit">
                              Quitar
                            </Button>
                          </form>
                        </span>
                      </TableCell>
                    )}
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
