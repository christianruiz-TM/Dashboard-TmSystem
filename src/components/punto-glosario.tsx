"use client";

import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { GLOSARIO } from "@/lib/glosario";
import { cn } from "@/lib/utils";

/**
 * «?» junto a una parte de la pantalla con la definición de un término del
 * glosario único (lib/glosario.ts): al pulsarlo (o con el teclado) abre un
 * globo. Es el mismo texto que sale en el glosario del pie del panel, así
 * que no se pueden contradecir. Para Planificación hay otro con sus propios
 * textos (planificacion/punto-ayuda.tsx).
 */
export function PuntoGlosario({ clave, className }: { clave: string; className?: string }) {
  const d = GLOSARIO[clave];
  if (!d) return null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Qué es: ${d.termino}`}
            className={cn(
              "ml-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-muted-foreground/50 align-middle text-[10px] leading-none font-semibold text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className,
            )}
          />
        }
      >
        ?
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw]">
        <PopoverTitle>{d.termino}</PopoverTitle>
        <PopoverDescription>{d.definicion}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
