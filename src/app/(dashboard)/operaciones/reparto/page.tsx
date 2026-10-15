import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROLES_OPERACIONES, puedeEditarFacturacion, requireRol } from "@/lib/auth/rbac";
import { prefijosExcluidosReparto } from "@/lib/db/facturacion";
import { lineasHorasLogadas } from "@/lib/facturacion";
import { guardarPrefijosReparto } from "../acciones";

export const metadata: Metadata = { title: "Reparto de horas logadas" };
export const dynamic = "force-dynamic";

/**
 * Prefijos que no cuentan para repartir las horas logadas de cada cliente
 * por campaña: el segmentador «Pref_To_Entrat» del Excel de facturación de
 * operaciones, replicado el 15/10/2026. Solo para los clientes que facturan
 * por horas logadas.
 */
export default async function PaginaReparto({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  const usuario = await requireRol(...ROLES_OPERACIONES);
  const puedeEditar = puedeEditarFacturacion(usuario.rol);
  const params = await searchParams;
  const clientes = [...new Set(lineasHorasLogadas().map((l) => l.servicio))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reparto de horas logadas</h1>
          <p className="text-sm text-muted-foreground">
            Las horas logadas de un cliente se reparten entre sus campañas según el tiempo de los agentes en
            cada una. Aquí se dice qué llamadas NO cuentan para ese reparto, como el filtro de prefijos del
            Excel de facturación: el número marcado (o el hunt group, en las entrantes) empieza por uno de
            estos prefijos de 4 cifras. Las salientes sin número no cuentan nunca. No cambia el total de
            horas, solo a qué campaña va cada una.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<a href="/operaciones" />}>
          <ArrowLeft className="h-4 w-4" /> Operaciones
        </Button>
      </div>
      <AvisoMsg msg={params.msg} detalle={params.detalle} />

      {clientes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ningún cliente factura por horas logadas (Administración → Facturación).
        </p>
      )}
      {clientes.map((servicio) => {
        const prefijos = prefijosExcluidosReparto(servicio);
        return (
          <Card key={servicio}>
            <CardHeader>
              <CardTitle className="text-base">{servicio}</CardTitle>
              <CardDescription>
                {prefijos.length === 0
                  ? "Cuentan todas las llamadas con número."
                  : `No cuentan ${prefijos.length} prefijos: ${prefijos.join(", ")}.`}
              </CardDescription>
            </CardHeader>
            {puedeEditar && (
              <CardContent>
                <form action={guardarPrefijosReparto} className="space-y-2">
                  <input type="hidden" name="servicio" value={servicio} />
                  <Label htmlFor={`prefijos-${servicio}`}>Prefijos que no cuentan</Label>
                  <textarea
                    id={`prefijos-${servicio}`}
                    name="prefijos"
                    rows={3}
                    defaultValue={prefijos.join(", ")}
                    placeholder="p. ej. 0673, 1161, 8259"
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Números de hasta 4 cifras separados por comas o espacios. Se aplica a todo lo que se
                    calcule a partir de ahora; los meses cerrados no cambian.
                  </p>
                  <Button type="submit" size="sm">
                    Guardar
                  </Button>
                </form>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
