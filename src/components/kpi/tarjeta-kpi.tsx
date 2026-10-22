import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de KPI estándar del dashboard.
 * `variacionPct`: cambio respecto al período anterior (positivo = sube).
 * `invertirColor`: para métricas donde subir es malo (abandono, AHT).
 * `extra`: algo más bajo la cifra (p. ej. el semáforo contra el objetivo).
 * `ayuda`: globo de ayuda («?» junto al título) con la definición del
 * glosario (`ayudaDe(clave)` de lib/glosario.ts), 22/10/2026.
 */
export function TarjetaKpi({
  titulo,
  valor,
  sub,
  variacionPct,
  invertirColor = false,
  extra,
  reloj,
  ayuda,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  /** El valor en reloj («3 min 12 s»), en pequeño debajo (tiempos de Supervisión). */
  reloj?: string | null;
  variacionPct?: number | null;
  invertirColor?: boolean;
  extra?: ReactNode;
  ayuda?: string;
}) {
  const tieneVariacion = variacionPct != null && Number.isFinite(variacionPct);
  const positiva = (variacionPct ?? 0) >= 0;
  const buena = invertirColor ? !positiva : positiva;

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>{titulo}</span>
          {ayuda ? (
            <span
              tabIndex={0}
              title={ayuda}
              aria-label={`Qué es «${titulo}»: ${ayuda}`}
              className="shrink-0 cursor-help rounded-full text-muted-foreground/70 normal-case hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <CircleHelp className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold whitespace-nowrap tabular-nums">{valor}</span>
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
        {reloj ? <div className="text-[11px] leading-tight text-muted-foreground tabular-nums">{reloj}</div> : null}
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
        {extra ? <div className="mt-1">{extra}</div> : null}
      </CardContent>
    </Card>
  );
}
