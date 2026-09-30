import type { Metadata } from "next";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Campo, Casilla, Muestra } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import * as repo from "@/lib/planificacion/repositorio";
import { guardarTipoAusenciaPlan } from "../acciones";

export const metadata: Metadata = { title: "Tipos de ausencia" };
export const dynamic = "force-dynamic";

export default async function PaginaTiposAusencia({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle, editar } = await searchParams;
  const tipos = repo.leerTiposAusencia().sort((a, b) => Number(b.activo) - Number(a.activo) || a.codigo.localeCompare(b.codigo));
  const enEdicion = editar ? tipos.find((t) => t.codigo === editar) : undefined;

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipos de ausencia</CardTitle>
          <CardDescription>
            Los que se marcan al dar de alta vacaciones y permisos (F3). «Cuenta como trabajada» decide si justifica horas
            en el saldo (F4): pendiente de confirmar qué es RTO.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cuenta como trabajada</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map((t) => (
                <TableRow key={t.codigo} className={!t.activo ? "opacity-50" : undefined}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Muestra color={t.color} /> {t.codigo}
                      {!t.activo ? <Badge variant="outline">inactivo</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell>{t.nombre}</TableCell>
                  <TableCell>{t.computaComoTrabajada ? "sí" : "no"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" render={<a href={`?editar=${t.codigo}`} />}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{enEdicion ? `Editar ${enEdicion.codigo}` : "Nuevo tipo de ausencia"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={guardarTipoAusenciaPlan}
            key={enEdicion?.codigo ?? "nuevo"}
            className="grid items-end gap-3 md:grid-cols-[1fr_2fr_1fr_auto_auto_auto]"
          >
            <input type="hidden" name="crear" value={enEdicion ? "0" : "1"} />
            {enEdicion ? <input type="hidden" name="codigo" value={enEdicion.codigo} /> : null}
            <Campo etiqueta="Código" htmlFor="codigo-tipo">
              <Input
                id="codigo-tipo"
                name={enEdicion ? undefined : "codigo"}
                defaultValue={enEdicion?.codigo}
                disabled={!!enEdicion}
                placeholder="p. ej. BAJA"
                required={!enEdicion}
              />
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="nombre-tipo">
              <Input id="nombre-tipo" name="nombre" defaultValue={enEdicion?.nombre} required />
            </Campo>
            <Campo etiqueta="Color" htmlFor="color-tipo">
              <Input id="color-tipo" name="color" type="color" defaultValue={enEdicion?.color ?? "#BFBFBF"} className="h-8 p-1" />
            </Campo>
            <div className="flex flex-col gap-1 pb-1">
              <Casilla etiqueta="Cuenta como trabajada" name="computaComoTrabajada" defaultChecked={enEdicion?.computaComoTrabajada ?? false} />
              <Casilla etiqueta="Activo" name="activo" defaultChecked={enEdicion?.activo ?? true} />
            </div>
            <Button type="submit">{enEdicion ? "Guardar" : "Crear"}</Button>
            {enEdicion ? (
              <Button variant="outline" render={<a href="?" />}>
                Cancelar
              </Button>
            ) : (
              <span />
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
