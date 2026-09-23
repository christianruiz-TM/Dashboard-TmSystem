import Link from "next/link";
import { BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pestañas de Supervisión: «Tiempo real» (en vivo) e «Histórico» (rango de
 * fechas). Son enlaces (server-rendered) con el estado en `?vista=`; conservan
 * el filtro de servicio. Al cambiar de pestaña el server vuelve a consultar.
 */
export function TabsSupervision({
  vista,
  servicio,
  incluirIvr,
}: {
  vista: "tiempo-real" | "historico";
  servicio?: string;
  incluirIvr?: boolean;
}) {
  function href(v: "tiempo-real" | "historico") {
    const p = new URLSearchParams();
    if (v === "historico") p.set("vista", "historico");
    if (servicio) p.set("servicio", servicio);
    if (incluirIvr) p.set("ivr", "1");
    const qs = p.toString();
    return qs ? `/supervision?${qs}` : "/supervision";
  }

  const clase = (v: "tiempo-real" | "historico") =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      vista === v
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
      <Link href={href("tiempo-real")} className={clase("tiempo-real")}>
        <Zap className="h-4 w-4" /> Tiempo real
      </Link>
      <Link href={href("historico")} className={clase("historico")}>
        <BarChart3 className="h-4 w-4" /> Histórico
      </Link>
    </div>
  );
}
