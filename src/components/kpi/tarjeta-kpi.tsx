import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de KPI estándar del dashboard.
 * `variacionPct`: cambio respecto al período anterior (positivo = sube).
 * `invertirColor`: para métricas donde subir es malo (abandono, AHT).
 */
export function TarjetaKpi({
  titulo,
  valor,
  sub,
  variacionPct,
  invertirColor = false,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  variacionPct?: number | null;
  invertirColor?: boolean;
}) {
  const tieneVariacion = variacionPct != null && Number.isFinite(variacionPct);
  const positiva = (variacionPct ?? 0) >= 0;
  const buena = invertirColor ? !positiva : positiva;

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{valor}</span>
          {tieneVariacion ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                buena ? "text-emerald-600" : "text-red-600",
              )}
            >
              {positiva ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(variacionPct!).toLocaleString("es-ES", { maximumFractionDigits: 1 })}%
            </span>
          ) : null}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
