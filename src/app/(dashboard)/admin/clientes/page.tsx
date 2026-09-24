import type { Metadata } from "next";
import Link from "next/link";
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
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { requireRol } from "@/lib/auth/rbac";
import { campaniasDeCliente, listarClientes } from "@/lib/db/clientes";
import { alternarActivoCliente, crearCliente } from "../acciones";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function PaginaClientesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { msg } = await searchParams;
  const clientes = listarClientes();

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo cliente</CardTitle>
          <CardDescription>
            Después de crearlo, asígnale campañas y crea sus usuarios con rol Cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={crearCliente} className="flex max-w-md items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="nombre">Nombre del cliente</Label>
              <Input id="nombre" name="nombre" placeholder="ej. Avolo" required />
            </div>
            <Button type="submit">Crear</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes ({clientes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Campañas asignadas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin clientes todavía
                  </TableCell>
                </TableRow>
              ) : (
                clientes.map((c) => {
                  const campanias = campaniasDeCliente(c.id);
                  return (
                    <TableRow key={c.id} className={!c.activo ? "opacity-50" : undefined}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        {campanias.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Ninguna</span>
                        ) : (
                          <div className="flex max-w-md flex-wrap gap-1">
                            {campanias.map((nombre) => (
                              <Badge key={nombre} variant="secondary" className="text-[10px]">
                                {nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.activo ? (
                          <Badge className="bg-emerald-100 text-emerald-800">Activo</Badge>
                        ) : (
                          <Badge variant="outline">Inactivo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="xs"
                            render={<Link href={`/admin/clientes/${c.id}`} />}
                          >
                            Campañas
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            render={<Link href={`/clientes?cliente=${c.id}`} />}
                          >
                            Ver portal
                          </Button>
                          <form action={alternarActivoCliente}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button variant="outline" size="xs" type="submit">
                              {c.activo ? "Desactivar" : "Activar"}
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
