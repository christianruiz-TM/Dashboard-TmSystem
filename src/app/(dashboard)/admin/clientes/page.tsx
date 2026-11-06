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
import { listarClientes } from "@/lib/db/clientes";
import { listaServicios } from "@/lib/rdb/queries/servicios";
import { alternarActivoCliente, crearCliente, guardarServicioDeCliente } from "../acciones";

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
  // Servicios de Altitude (sin Test_*); si RDBv2 no responde, solo se ve el que ya tiene
  let servicios: string[] = [];
  try {
    servicios = (await listaServicios()).map((s) => s.servicio);
  } catch (e) {
    console.error("[admin] servicios para los clientes:", e);
  }
  const ocupados = new Map(clientes.filter((c) => c.serviceName).map((c) => [c.serviceName!, c.nombre]));

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo cliente</CardTitle>
          <CardDescription>
            Después de crearlo, elige su servicio de Altitude y crea sus usuarios con rol Cliente. Solo
            los servicios con un cliente activo salen en «Mi servicio».
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
          <CardDescription>
            Cada cliente ve todas las campañas de su servicio (sin las IVR ni las de pruebas). Un servicio
            solo puede ser de un cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio de Altitude</TableHead>
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
                  const opciones = c.serviceName && !servicios.includes(c.serviceName) ? [c.serviceName, ...servicios] : servicios;
                  return (
                    <TableRow key={c.id} className={!c.activo ? "opacity-50" : undefined}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        <form action={guardarServicioDeCliente} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={c.id} />
                          <select
                            name="servicio"
                            defaultValue={c.serviceName ?? ""}
                            aria-label={`Servicio de Altitude de ${c.nombre}`}
                            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                          >
                            <option value="">Sin servicio</option>
                            {opciones.map((s) => {
                              const de = ocupados.get(s);
                              return (
                                <option key={s} value={s} disabled={!!de && de !== c.nombre}>
                                  {s}
                                  {de && de !== c.nombre ? ` (de ${de})` : ""}
                                </option>
                              );
                            })}
                          </select>
                          <Button variant="outline" size="xs" type="submit">
                            Guardar
                          </Button>
                        </form>
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
                          {c.serviceName && c.activo ? (
                            <Button
                              variant="outline"
                              size="xs"
                              render={<Link href={`/clientes?servicio=${encodeURIComponent(c.serviceName)}`} />}
                            >
                              Ver «Mi servicio»
                            </Button>
                          ) : null}
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
