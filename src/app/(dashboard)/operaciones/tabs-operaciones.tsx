import Link from "next/link";
import { cn } from "@/lib/utils";

export const VISTAS_OPERACIONES = ["facturacion", "cerrados", "listas", "pausas"] as const;
export type VistaOperaciones = (typeof VISTAS_OPERACIONES)[number];

const NOMBRE: Record<VistaOperaciones, string> = {
  facturacion: "Facturación",
  cerrados: "Meses cerrados",
  listas: "Listas outbound",
  pausas: "Pausas (Not Ready)",
};

/**
 * Pestañas de Operaciones como enlaces con `?vista=` (como Supervisión): cada
 * pestaña consulta solo lo suyo, así que abrir Facturación no espera a las
 * pausas ni a las listas (las consultas más pesadas). Conservan el cliente,
 * las fechas y el check de IVR.
 */
export function TabsOperaciones({
  vista,
  params,
}: {
  vista: VistaOperaciones;
  params: { servicio?: string; desde: string; hasta: string; ivr?: boolean };
}) {
  function href(v: VistaOperaciones) {
    const p = new URLSearchParams();
    if (v !== "facturacion") p.set("vista", v);
    if (params.servicio) p.set("servicio", params.servicio);
    p.set("desde", params.desde);
    p.set("hasta", params.hasta);
    if (params.ivr) p.set("ivr", "1");
    return `/operaciones?${p.toString()}`;
  }
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {VISTAS_OPERACIONES.map((v) => (
        <Link
          key={v}
          href={href(v)}
          className={cn(
            "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            vista === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {NOMBRE[v]}
        </Link>
      ))}
    </div>
  );
}
