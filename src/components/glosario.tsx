import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GLOSARIO } from "@/lib/glosario";

/**
 * Leyenda desplegable con la explicación de cada campo del panel. Usa
 * `<details>` nativo (no necesita JS). Recibe la lista de claves del GLOSARIO
 * a mostrar; así cada vista enseña solo los términos que le aplican. El
 * `titulo` (nombre de la vista) deja claro que la leyenda es la de ESTA
 * pantalla, y se indica cuántos campos describe.
 */
export function Glosario({ claves, titulo }: { claves: string[]; titulo?: string }) {
  const items = claves.map((c) => GLOSARIO[c]).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span>
            Glosario{titulo ? ` · ${titulo}` : ""} — qué significa cada campo
            <span className="ml-1 font-normal text-muted-foreground">({items.length} campos)</span>
          </span>
          <span className="ml-auto text-xs text-muted-foreground transition-transform group-open:rotate-90">
            ▶
          </span>
        </summary>
        <dl className="grid gap-x-8 gap-y-3 border-t px-4 py-4 text-sm sm:grid-cols-2">
          {items.map((d) => (
            <div key={d.termino}>
              <dt className="font-medium">{d.termino}</dt>
              <dd className="text-muted-foreground">{d.definicion}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}
