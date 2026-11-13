"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { avisarNavegacion } from "@/lib/navegacion";

const CLASE_SELECT =
  "h-8 max-w-64 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Filtros de «Mi servicio»: tipo de campaña del cliente (?tipo=, como en
 * Resultados) y una campaña (?campania=). Cambiar de tipo quita la campaña.
 */
export function FiltrosMiServicio({
  opcionesTipo,
  tipo,
  campanias,
  campania,
}: {
  opcionesTipo: { valor: string; etiqueta: string }[];
  tipo: string;
  campanias: string[];
  campania: string | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  function aplicar(cambios: Record<string, string | null>) {
    const siguientes = new URLSearchParams(params.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
    }
    const destino = `${ruta}?${siguientes.toString()}`;
    // La capa de «Cargando» (layout/carga-navegacion.tsx)
    avisarNavegacion(destino);
    router.push(destino);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {opcionesTipo.length > 0 ? (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Tipo:</span>
          <select
            className={CLASE_SELECT}
            value={tipo}
            onChange={(e) => aplicar({ tipo: e.target.value === "todas" ? null : e.target.value, campania: null })}
          >
            {opcionesTipo.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Campaña:</span>
        <select className={CLASE_SELECT} value={campania ?? ""} onChange={(e) => aplicar({ campania: e.target.value || null })}>
          <option value="">Todas ({campanias.length})</option>
          {campanias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
