import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/admin/select-nativo";
import { NOMBRE_CORTO_UNIDAD, type LineaCierreAjustada } from "@/lib/facturacion-campania";
import { cantidadLegible, euros } from "./tabla-factura";

/**
 * Ajustes manuales de un mes cerrado: las decisiones puntuales de dirección
 * (quitar una línea o cambiarle el precio, siempre con motivo). Server
 * component; las acciones llegan del page (Server Actions de Operaciones).
 */
export function AjustesCierre({
  cierreId,
  servicio,
  mes,
  lineas,
  puedeEditar,
  ajustar,
  deshacer,
}: {
  cierreId: number;
  servicio: string;
  mes: string;
  lineas: LineaCierreAjustada[];
  puedeEditar: boolean;
  ajustar: (formData: FormData) => Promise<void>;
  deshacer: (formData: FormData) => Promise<void>;
}) {
  const ajustadas = lineas.filter((l) => l.ajuste);
  const campanias = [...new Set(lineas.map((l) => l.campania))].sort();
  const etiqueta = (l: LineaCierreAjustada) =>
    `${l.campania} · ${NOMBRE_CORTO_UNIDAD[l.unidad]} · ${cantidadLegible(l.unidad, l.cantidad)} × ${euros(l.ajuste?.precioOriginal ?? l.precioUnitario)}`;

  return (
    <details className="rounded-md border px-3 py-2" open={ajustadas.length > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        Ajustes manuales del cierre ({ajustadas.length})
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        Para las decisiones puntuales de dirección: quitar algo que no se factura ese mes o cobrarlo a otro
        precio. Lo cerrado no se borra: el ajuste queda con su motivo y se puede deshacer. La factura, el
        histórico, el Excel y el fichero de GS salen con los ajustes.
      </p>

      {ajustadas.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {ajustadas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
              <span>
                <strong>{l.campania}</strong> · {NOMBRE_CORTO_UNIDAD[l.unidad]}:{" "}
                {l.quitada
                  ? `quitada (eran ${euros(l.ajuste!.importeOriginal)})`
                  : `precio ${euros(l.ajuste!.precioOriginal)} → ${euros(l.precioUnitario)} (${euros(l.ajuste!.importeOriginal)} → ${euros(l.importe)})`}
                <span className="text-muted-foreground">
                  {" "}
                  · «{l.ajuste!.motivo}» · {l.ajuste!.autor}
                </span>
              </span>
              {puedeEditar && (
                <form action={deshacer}>
                  <input type="hidden" name="ajusteId" value={l.ajuste!.id} />
                  <input type="hidden" name="servicio" value={servicio} />
                  <input type="hidden" name="mes" value={mes} />
                  <Button variant="outline" size="xs" type="submit">
                    Deshacer
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <form action={ajustar} className="mt-3 grid items-end gap-2 md:grid-cols-[2fr_1fr_110px_2fr_auto]">
          <input type="hidden" name="cierreId" value={cierreId} />
          <input type="hidden" name="servicio" value={servicio} />
          <input type="hidden" name="mes" value={mes} />
          <div className="space-y-1">
            <Label htmlFor="objetivo" className="text-xs">Qué</Label>
            <SelectNativo id="objetivo" name="objetivo" required defaultValue="">
              <option value="" disabled>
                Elige una línea o una campaña entera
              </option>
              <optgroup label="Una campaña entera (todas sus líneas)">
                {campanias.map((c) => (
                  <option key={`c:${c}`} value={`campania:${c}`}>
                    {c} (todas)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Una línea">
                {lineas.map((l) => (
                  <option key={l.id} value={`linea:${l.id}`}>
                    {etiqueta(l)}
                  </option>
                ))}
              </optgroup>
            </SelectNativo>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tipo" className="text-xs">Ajuste</Label>
            <SelectNativo id="tipo" name="tipo" defaultValue="quitar">
              <option value="quitar">No se factura</option>
              <option value="precio">Otro precio</option>
            </SelectNativo>
          </div>
          <div className="space-y-1">
            <Label htmlFor="precio" className="text-xs">€/unidad</Label>
            <Input id="precio" name="precio" inputMode="decimal" placeholder="solo si cambia" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="motivo" className="text-xs">Motivo (obligatorio)</Label>
            <Input id="motivo" name="motivo" required minLength={5} maxLength={300} placeholder="p. ej. decisión de dirección: sin tanda" />
          </div>
          <Button type="submit" size="sm">
            Ajustar
          </Button>
        </form>
      )}
    </details>
  );
}
