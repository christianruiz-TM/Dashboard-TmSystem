"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";

/**
 * Selector de Cliente/Servicio. Sincroniza `?servicio=<nombre>` en la URL
 * (vacío = todos). En esta instalación cada cliente tiene un servicio, así
 * que filtrar por servicio equivale a filtrar por cliente. El server component
 * resuelve el servicio a sus campañas y re-consulta con ese ámbito.
 * `obligatorio`: sin la opción «Todos» (vistas que solo se consultan por
 * cliente, como Supervisión → Resultados).
 */
export function SelectorServicio({
  servicios,
  valor,
  obligatorio = false,
}: {
  servicios: string[];
  valor?: string;
  obligatorio?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  function aplicar(servicio: string) {
    const siguientes = new URLSearchParams(params.toString());
    if (servicio) siguientes.set("servicio", servicio);
    else siguientes.delete("servicio");
    router.push(`${ruta}?${siguientes.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Users className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Cliente / Servicio:</span>
      <select
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={valor ?? ""}
        onChange={(e) => aplicar(e.target.value)}
      >
        {obligatorio ? (
          <option value="" disabled>
            Elige un cliente…
          </option>
        ) : (
          <option value="">Todos</option>
        )}
        {servicios.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
