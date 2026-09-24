import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { requireRol } from "@/lib/auth/rbac";
import { campaniasDeCliente, obtenerCliente } from "@/lib/db/clientes";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { guardarMapeoCliente } from "../../acciones";

export const metadata: Metadata = { title: "Campañas del cliente" };
export const dynamic = "force-dynamic";

export default async function PaginaMapeoCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { id } = await params;
  const { msg } = await searchParams;
  const cliente = obtenerCliente(Number(id));
  if (!cliente) notFound();

  const [todas, asignadas] = await Promise.all([
    listadoCampanias(),
    Promise.resolve(campaniasDeCliente(cliente.id)),
  ]);
  const asignadasSet = new Set(asignadas);

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campañas de {cliente.nombre}</CardTitle>
          <CardDescription>
            Marca las campañas de Altitude que pertenecen a este cliente. Sus usuarios
            solo verán datos de las campañas marcadas (el filtro se aplica en el SQL).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarMapeoCliente} className="space-y-4">
            <input type="hidden" name="id" value={cliente.id} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {todas.map((campania) => (
                <label
                  key={campania.shortname}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    name="campanias"
                    value={campania.shortname}
                    defaultChecked={asignadasSet.has(campania.shortname)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-medium">{campania.shortname}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{campania.tipo}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="submit">Guardar campañas</Button>
              <Button variant="outline" render={<Link href="/admin/clientes" />}>
                Volver
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
