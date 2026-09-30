"use client";

import { useMemo } from "react";
import { horaCorta } from "@/lib/planificacion/motor";
import { posicionPct } from "@/lib/planificacion/tablero";
import { FilaAgente, type ContextoCeldas, type DiaColumna, type FilaAgenteDatos } from "./fila-agente";
import { MapaCoberturaDia } from "./mapa-cobertura";

/**
 * Vista de un día: una sola columna ancha, con una marca por franja (con
 * plan.pasoMin = 30 salen medias horas sin tocar nada) y el mínimo escrito
 * en el mapa de cobertura («hay/mín.»).
 */
export function VistaDia({
  dia,
  filas,
  franjas,
  pasoMin,
  clienteBase,
  cobertura,
  minimos,
  ctx,
  resaltado,
}: {
  dia: DiaColumna;
  filas: readonly FilaAgenteDatos[];
  franjas: readonly number[];
  pasoMin: number;
  clienteBase: string;
  cobertura: readonly number[] | undefined;
  minimos: readonly number[] | undefined;
  ctx: ContextoCeldas;
  resaltado: string | null;
}) {
  const columnas = { gridTemplateColumns: "12rem minmax(0, 1fr)" };
  const dias = useMemo(() => [dia], [dia]);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="grid min-w-[900px]" style={columnas}>
        <div className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Agente</div>
        <div className="relative h-6 border-l text-[10px] text-muted-foreground">
          {franjas.map((f) => (
            <span
              key={f}
              className="absolute top-1 pl-0.5"
              style={{ left: `${posicionPct(f, f + pasoMin, ctx.inicioDiaMin, ctx.finDiaMin).left}%` }}
            >
              {horaCorta(f)}
            </span>
          ))}
        </div>

        <div className="sticky left-0 z-10 flex items-center border-t border-r bg-card px-2 text-xs font-medium">
          {clienteBase} / mínimo
        </div>
        <MapaCoberturaDia
          fecha={dia.fecha}
          diaSemana={dia.diaSemana}
          franjas={franjas}
          pasoMin={pasoMin}
          cobertura={cobertura}
          minimos={minimos}
          clienteBase={clienteBase}
          conMinimo
          alto="h-7"
        />

        {filas.map((f) => (
          <FilaAgente key={f.numero} fila={f} dias={dias} ctx={ctx} resaltado={resaltado === f.numero} alto="h-12" />
        ))}
      </div>
    </div>
  );
}
