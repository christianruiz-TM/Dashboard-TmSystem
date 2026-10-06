"use client";

import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PUNTOS_AYUDA, type IdPuntoAyuda } from "./ayuda-contenido";

/**
 * «?» junto a una parte de la pantalla: al pulsarlo (o con el teclado) abre
 * un globo con dos o tres frases. Los textos están en ayuda-contenido.ts.
 */
export function PuntoAyuda({ id, className }: { id: IdPuntoAyuda; className?: string }) {
  const { titulo, texto } = PUNTOS_AYUDA[id];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Qué es: ${titulo}`}
            className={cn(
              "ml-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-muted-foreground/50 align-middle text-[10px] leading-none font-semibold text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className,
            )}
          />
        }
      >
        ?
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>{titulo}</PopoverTitle>
        <PopoverDescription>{texto}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
