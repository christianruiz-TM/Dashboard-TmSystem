import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROLES_OPERACIONES, puedeEditarFacturacion, requireRol } from "@/lib/auth/rbac";
import { prefijosExcluidosReparto, quitarFichaIncompleta } from "@/lib/db/facturacion";
import { lineasHorasLogadas } from "@/lib/facturacion";
import { guardarFichaIncompleta, guardarPrefijosReparto } from "../acciones";

export const metadata: Metadata = { title: "Reparto de horas logadas" };
export const dynamic = "force-dynamic";

/**
 * Prefijos que no cuentan para repartir las horas logadas de cada cliente
 * por campaña: el segmentador «Pref_To_Entrat» del Excel de facturación de
 * operaciones, replicado el 15/10/2026. Solo para los clientes que facturan
 * por horas logadas. Y si se quitan las llamadas con la ficha a medias
 * (contacto sin perfil o al revés), en el reparto y en los minutos de línea,
 * como el Excel (GH, 18/11/2026).
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
          Ningún cliente factura por horas logadas (Operaciones → Artículos y tarifas).
        </p>
      )}
      {clientes.map((servicio) => {
        const prefijos = prefijosExcluidosReparto(servicio);
        const fichaFuera = quitarFichaIncompleta(servicio);
        return (
          <Card key={servicio}>
            <CardHeader>
              <CardTitle className="text-base">{servicio}</CardTitle>
              <CardDescription>
                {prefijos.length === 0
                  ? "Cuentan todas las llamadas con número."
                  : `No cuentan ${prefijos.length} prefijos: ${prefijos.join(", ")}.`}{" "}
                {fichaFuera
                  ? "Tampoco cuentan las llamadas con la ficha a medias, ni aquí ni en los minutos de línea."
                  : "Las llamadas con la ficha a medias cuentan."}
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
                <form action={guardarFichaIncompleta} className="mt-4 space-y-2 border-t pt-4">
                  <input type="hidden" name="servicio" value={servicio} />
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="quitar"
                      value="1"
                      defaultChecked={fichaFuera}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      Quitar las llamadas con la ficha a medias
                      <span className="block text-xs text-muted-foreground">
                        Llamadas del agente que tienen contacto pero no perfil, o perfil pero no contacto. Como
                        en el Excel de facturación, no cuentan ni para este reparto ni en los minutos a fijo y
                        a móvil. La encuesta que va detrás sí se cobra. Se aplica a todo lo que se calcule a
                        partir de ahora; los meses cerrados no cambian.
                      </span>
                    </span>
                  </label>
                  <Button type="submit" size="sm" variant="outline">
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
