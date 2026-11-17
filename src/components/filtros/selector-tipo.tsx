"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { avisarNavegacion } from "@/lib/navegacion";
import type { SeleccionTipo } from "@/lib/resultados-actividad";
import { cn } from "@/lib/utils";

/**
 * Selector de tipo de campaña (17/11/2026, lib/tipo-panel.ts): «Todas · Sin
 * BBDD · Solo BBDD». Cambia solo `?tipo=` y deja el resto de la URL (fechas,
 * IVR, sección, dato del contacto…). Lo de por defecto no va en la URL. Sin
 * opciones no pinta nada.
 */
export function SelectorTipo({
  opciones,
  valor,
  defecto,
}: {
  opciones: { valor: SeleccionTipo; etiqueta: string }[];
  valor: SeleccionTipo;
  defecto: SeleccionTipo;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  if (opciones.length === 0) return null;

  function elegir(t: SeleccionTipo) {
    if (t === valor) return;
    const siguientes = new URLSearchParams(params.toString());
    if (t === defecto) siguientes.delete("tipo");
    else siguientes.set("tipo", t);
    const qs = siguientes.toString();
    const destino = qs ? `${ruta}?${qs}` : ruta;
    // La capa de «Cargando» (layout/carga-navegacion.tsx)
    avisarNavegacion(destino);
    router.push(destino);
  }

  return (
    <div className="flex items-center gap-2 text-sm" role="group" aria-label="Tipo de campaña">
      <span className="text-muted-foreground">Tipo:</span>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => elegir(o.valor)}
            aria-pressed={o.valor === valor}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              o.valor === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
