import type { Metadata } from "next";
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
import { listarDdis, type DdiRow } from "@/lib/db/facturacion";
import { ESTADOS_DDI, type EstadoDdi } from "@/lib/db/schema";
import { activoEntre, mesesDelRango } from "@/lib/ddis";
import { hoyISO } from "@/lib/fechas";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { guardarDdi } from "../acciones";

export const metadata: Metadata = { title: "DDIs" };
export const dynamic = "force-dynamic";

const NOMBRE_ESTADO: Record<EstadoDdi, string> = {
  en_produccion: "En producción",
  baja: "Baja",
  deshabilitado: "Deshabilitado",
};

/** Campos descriptivos que no intervienen en la cuota (van en «Más datos»). */
const CAMPOS_EXTRA: { nombre: keyof DdiRow; etiqueta: string }[] = [
  { nombre: "versionAltitude", etiqueta: "Versión Altitude" },
  { nombre: "lineaIntermedia", etiqueta: "Línea intermedia VF" },
  { nombre: "departamento", etiqueta: "Departamento" },
  { nombre: "tipoUso", etiqueta: "Tipo de uso" },
  { nombre: "clienteGs", etiqueta: "Cliente (GS)" },
  { nombre: "nombreCampania", etiqueta: "Campaña (nombre)" },
  { nombre: "centro", etiqueta: "Centro" },
  { nombre: "campaniaGs", etiqueta: "Campaña en GS" },
  { nombre: "sentido", etiqueta: "Sentido de llamada" },
  { nombre: "unidadNegocio", etiqueta: "Unidad de negocio" },
  { nombre: "marca", etiqueta: "Marca" },
];

function valor(ddi: DdiRow | undefined, campo: keyof DdiRow): string {
  const v = ddi?.[campo];
  return v == null || v instanceof Date ? "" : String(v);
}

export default async function PaginaDdis({
  searchParams,
}: {
  searchParams: Promise<{ campania?: string; estado?: string; editar?: string; msg?: string; detalle?: string }>;
}) {
  const usuario = await requireRol(...ROLES_OPERACIONES);
  const puedeEditar = puedeEditarFacturacion(usuario.rol);
  const params = await searchParams;
  const todos = listarDdis();
  const campanias = await listadoCampanias();

  // Por defecto, los que están en producción; «todos» quita el filtro
  const estado: EstadoDdi | null =
    params.estado === "todos" ? null : (ESTADOS_DDI.find((e) => e === params.estado) ?? "en_produccion");
  const filtrados = todos.filter(
    (d) => (!estado || d.estado === estado) && (!params.campania || d.campaignShortname === params.campania),
  );
  const editando = puedeEditar && params.editar ? todos.find((d) => d.id === Number(params.editar)) : undefined;

  // Lo que se cobra este mes: activos algún día del mes en curso
  const { inicio, fin, mes } = mesesDelRango(hoyISO(), hoyISO())[0];
  const activosMes = todos.filter((d) => d.campaignShortname && activoEntre(d, inicio, fin)).length;
  const campaniasConDdi = [...new Set(todos.map((d) => d.campaignShortname).filter((c): c is string => !!c))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">DDIs</h1>
          <p className="text-sm text-muted-foreground">
            Inventario de números de TmSystem por campaña. Se cobra el mes entero por cada DDI activo algún
            día del mes: puesto en producción antes de que acabe y sin baja o con la baja después de que
            empiece. Este mes ({mes}) se cobran {activosMes.toLocaleString("es-ES")}.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<a href="/operaciones" />}>
          <ArrowLeft className="h-4 w-4" /> Operaciones
        </Button>
      </div>
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      {puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editando ? `Editar el DDI ${editando.numero}` : "Alta de DDI"}
            </CardTitle>
            <CardDescription>
              Para quitar un DDI no se borra: se pone en «Baja» con su fecha, y deja de cobrarse a partir del
              mes siguiente. Para pasar un número a otra campaña, da de baja la asignación que tiene y da de
              alta otra con la campaña nueva: así el histórico sigue cuadrando. Un DDI sin campaña no se
              cobra a nadie.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={guardarDdi} key={editando?.id ?? "nuevo"} className="space-y-3">
              {editando && <input type="hidden" name="id" value={editando.id} />}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" name="numero" required pattern="\d{3,15}" defaultValue={valor(editando, "numero")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campania">Campaña de Altitude</Label>
                  <Input id="campania" name="campania" list="campanias" defaultValue={valor(editando, "campaignShortname")} />
                  <datalist id="campanias">
                    {campanias.map((c) => (
                      <option key={c.shortname} value={c.shortname} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="estado">Estado</Label>
                  <SelectNativo id="estado" name="estado" defaultValue={editando?.estado ?? "en_produccion"}>
                    {ESTADOS_DDI.map((e) => (
                      <option key={e} value={e}>
                        {NOMBRE_ESTADO[e]}
                      </option>
                    ))}
                  </SelectNativo>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="huntGroup">Hunt group</Label>
                  <Input id="huntGroup" name="huntGroup" defaultValue={valor(editando, "huntGroup")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechaAlta">En producción desde</Label>
                  <Input id="fechaAlta" name="fechaAlta" type="date" defaultValue={valor(editando, "fechaAlta")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechaBaja">Fecha de baja</Label>
                  <Input id="fechaBaja" name="fechaBaja" type="date" defaultValue={valor(editando, "fechaBaja")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechaSolicitud">Fecha de solicitud</Label>
                  <Input id="fechaSolicitud" name="fechaSolicitud" type="date" defaultValue={valor(editando, "fechaSolicitud")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountCode">Account code</Label>
                  <Input id="accountCode" name="accountCode" defaultValue={valor(editando, "accountCode")} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="uso">Uso</Label>
                  <Input id="uso" name="uso" defaultValue={valor(editando, "uso")} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input id="empresa" name="empresa" defaultValue={valor(editando, "empresa")} />
                </div>
              </div>
              <details className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer text-sm">Más datos</summary>
                <div className="mt-2 grid gap-3 md:grid-cols-4">
                  {CAMPOS_EXTRA.map((c) => (
                    <div key={c.nombre} className="space-y-1.5">
                      <Label htmlFor={c.nombre}>{c.etiqueta}</Label>
                      <Input id={c.nombre} name={c.nombre} defaultValue={valor(editando, c.nombre)} />
                    </div>
                  ))}
                </div>
              </details>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Input id="notas" name="notas" maxLength={500} defaultValue={valor(editando, "notas")} />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editando ? "Guardar cambios" : "Dar de alta"}</Button>
                {editando && (
                  <Button variant="outline" render={<a href="/operaciones/ddis" />}>
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
          <CardTitle className="text-base">
            {filtrados.length.toLocaleString("es-ES")} DDIs
            {estado ? ` · ${NOMBRE_ESTADO[estado].toLowerCase()}` : ""}
            {params.campania ? ` · ${params.campania}` : ""}
          </CardTitle>
          <form className="flex flex-wrap items-end gap-2 pt-2">
            <div className="space-y-1">
              <Label htmlFor="f-campania" className="text-xs">Campaña</Label>
              <SelectNativo id="f-campania" name="campania" defaultValue={params.campania ?? ""}>
                <option value="">Todas</option>
                {campaniasConDdi.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-estado" className="text-xs">Estado</Label>
              <SelectNativo id="f-estado" name="estado" defaultValue={estado ?? "todos"}>
                {ESTADOS_DDI.map((e) => (
                  <option key={e} value={e}>
                    {NOMBRE_ESTADO[e]}
                  </option>
                ))}
                <option value="todos">Todos</option>
              </SelectNativo>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Producción</TableHead>
                <TableHead>Baja</TableHead>
                <TableHead>Hunt group</TableHead>
                <TableHead>Account code</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Empresa</TableHead>
                {puedeEditar && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={puedeEditar ? 10 : 9} className="text-center text-muted-foreground">
                    Ningún DDI con ese filtro
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium tabular-nums">{d.numero}</TableCell>
                    <TableCell>{d.campaignShortname ?? <span className="text-muted-foreground">sin campaña</span>}</TableCell>
                    <TableCell>
                      <Badge variant={d.estado === "en_produccion" ? "default" : "secondary"} className="text-[10px]">
                        {NOMBRE_ESTADO[d.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{d.fechaAlta ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{d.fechaBaja ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{d.huntGroup ?? ""}</TableCell>
                    <TableCell className="tabular-nums">{d.accountCode ?? ""}</TableCell>
                    <TableCell className="max-w-48 truncate" title={d.uso ?? undefined}>{d.uso ?? ""}</TableCell>
                    <TableCell className="max-w-48 truncate" title={d.empresa ?? undefined}>{d.empresa ?? ""}</TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          render={
                            <a
                              href={`/operaciones/ddis?editar=${d.id}${params.campania ? `&campania=${encodeURIComponent(params.campania)}` : ""}${params.estado ? `&estado=${encodeURIComponent(params.estado)}` : ""}`}
                            />
                          }
                        >
                          Editar
                        </Button>
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
