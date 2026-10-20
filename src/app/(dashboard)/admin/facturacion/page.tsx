import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { requireRol } from "@/lib/auth/rbac";
import { umbralSlaSeg } from "@/lib/db/settings";
import { guardarUmbralSla } from "../acciones";

export const metadata: Metadata = { title: "Facturación y SLA" };
export const dynamic = "force-dynamic";

export default async function PaginaFacturacionAdmin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { msg } = await searchParams;

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarifas de facturación</CardTitle>
          <CardDescription>
            Desde el 19/10/2026 las tarifas (qué artículos de GS factura cada cliente y a qué precio) las mantiene
            Operaciones, en Operaciones → Artículos y tarifas. Un administrador también puede editarlas allí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" render={<a href="/operaciones/articulos" />}>
            Ir a Artículos y tarifas
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Umbral de SLA</CardTitle>
          <CardDescription>
            Segundos máximos de cola para contar una llamada dentro de SLA (vista
            Supervisión). Por defecto 20 s (estándar 80/20).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarUmbralSla} className="flex max-w-xs items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="umbral">Umbral (segundos)</Label>
              <Input
                id="umbral"
                name="umbral"
                type="number"
                min="1"
                max="600"
                defaultValue={umbralSlaSeg()}
                required
              />
            </div>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
