"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Selector de rango de fechas compartido por las vistas. Sincroniza
 * `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` en la URL (el server component
 * vuelve a consultar con el nuevo rango).
 */
export function SelectorRango({
  desde,
  hasta,
  presets,
}: {
  desde: string;
  hasta: string;
  presets: { etiqueta: string; desde: string; hasta: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  function aplicar(nuevoDesde: string, nuevoHasta: string) {
    if (!nuevoDesde || !nuevoHasta) return;
    const siguientes = new URLSearchParams(params.toString());
    siguientes.set("desde", nuevoDesde);
    siguientes.set("hasta", nuevoHasta);
    router.push(`${ruta}?${siguientes.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const activo = p.desde === desde && p.hasta === hasta;
          return (
            <Button
              key={p.etiqueta}
              size="sm"
              variant={activo ? "default" : "outline"}
              onClick={() => aplicar(p.desde, p.hasta)}
            >
              {p.etiqueta}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="h-8 w-[150px]"
          value={desde}
          max={hasta}
          onChange={(e) => aplicar(e.target.value, hasta)}
        />
        <span className="text-sm text-muted-foreground">a</span>
        <Input
          type="date"
          className="h-8 w-[150px]"
          value={hasta}
          min={desde}
          onChange={(e) => aplicar(desde, e.target.value)}
        />
      </div>
    </div>
  );
}
