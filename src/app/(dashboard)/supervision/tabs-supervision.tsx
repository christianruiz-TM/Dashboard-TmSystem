import Link from "next/link";
import { BarChart3, ListChecks, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Vista = "tiempo-real" | "historico" | "resultados";

/**
 * Pestañas de Supervisión: «Tiempo real» (en vivo), «Histórico» (rango de
 * fechas) y «Resultados» (resultados de actividad, rango de fechas). Son
 * enlaces (server-rendered) con el estado en `?vista=`; conservan el filtro
 * de servicio y, entre las dos de rango, también las fechas. Al cambiar de
 * pestaña el server vuelve a consultar.
 */
export function TabsSupervision({
  vista,
  servicio,
  incluirIvr,
  desde,
  hasta,
}: {
  vista: Vista;
  servicio?: string;
  incluirIvr?: boolean;
  desde?: string;
  hasta?: string;
}) {
  function href(v: Vista) {
    const p = new URLSearchParams();
    if (v !== "tiempo-real") p.set("vista", v);
    if (servicio) p.set("servicio", servicio);
    if (incluirIvr) p.set("ivr", "1");
    // Las fechas solo tienen sentido en las pestañas de rango
    if (v !== "tiempo-real" && vista !== "tiempo-real" && desde && hasta) {
      p.set("desde", desde);
      p.set("hasta", hasta);
    }
    const qs = p.toString();
    return qs ? `/supervision?${qs}` : "/supervision";
  }

  const clase = (v: Vista) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      vista === v
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      <Link href={href("tiempo-real")} className={clase("tiempo-real")}>
        <Zap className="h-4 w-4" /> Tiempo real
      </Link>
      <Link href={href("historico")} className={clase("historico")}>
        <BarChart3 className="h-4 w-4" /> Histórico
      </Link>
      <Link href={href("resultados")} className={clase("resultados")}>
        <ListChecks className="h-4 w-4" /> Resultados
      </Link>
    </div>
  );
}
