"use client";

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { rangoCorto } from "@/lib/planificacion/motor";
import { diaCorto, estadoFranja, fechaDiaMes, type EstadoFranja } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";

const COLOR: Record<EstadoFranja, string> = {
  bajo: "bg-red-500 text-white",
  justo: "bg-amber-300 text-amber-950",
  holgado: "bg-emerald-200 text-emerald-950",
  sin_minimo: "bg-muted text-muted-foreground",
};

/**
 * Cobertura del cliente base (GH y los que cuentan como GH) frente a su
 * mínimo de Erlang, franja a franja de un día: rojo por debajo, ámbar justo,
 * verde con holgura. Gris = sin mínimo (fuera del horario del servicio).
 */
export const MapaCoberturaDia = memo(function MapaCoberturaDia({
  fecha,
  diaSemana,
  franjas,
  pasoMin,
  cobertura,
  minimos,
  clienteBase,
  conMinimo = false,
  alto = "h-6",
}: {
  fecha: string;
  diaSemana: number;
  franjas: readonly number[];
  pasoMin: number;
  cobertura: readonly number[] | undefined;
  minimos: readonly number[] | undefined;
  clienteBase: string;
  /** Escribir «hay/mín.» en la celda (vista de día, hay sitio). */
  conMinimo?: boolean;
  alto?: string;
}) {
  return (
    <div className={cn("flex gap-px border-t border-l px-px py-0.5", alto)}>
      {franjas.map((f, i) => {
        const hay = cobertura?.[i] ?? 0;
        const minimo = minimos?.[i] ?? 0;
        const estado = estadoFranja(hay, minimo);
        const texto =
          `${diaCorto(diaSemana)} ${fechaDiaMes(fecha)}, ${rangoCorto(f, f + pasoMin)} h: ${hay} en ${clienteBase}` +
          (minimo > 0 ? ` para un mínimo de ${minimo}` : " (sin mínimo: fuera del horario del servicio)");
        return (
          <Tooltip key={f}>
            <TooltipTrigger
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center rounded-[2px] text-[10px] leading-none font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                COLOR[estado],
              )}
              aria-label={texto}
            >
              {estado === "sin_minimo" ? "" : conMinimo ? `${hay}/${minimo}` : hay}
            </TooltipTrigger>
            <TooltipContent>{texto}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});

export function LeyendaCobertura({ clienteBase }: { clienteBase: string }) {
  const muestra = (estado: EstadoFranja, texto: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block size-3 rounded-[2px]", COLOR[estado])} aria-hidden />
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Agentes en {clienteBase} por franja:</span>
      {muestra("bajo", "por debajo del mínimo")}
      {muestra("justo", "justo en el mínimo")}
      {muestra("holgado", "con holgura")}
      {muestra("sin_minimo", "sin mínimo")}
    </div>
  );
}
