"use client";

import { memo } from "react";
import { Pin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { explicarBloque, horasTexto, rangoCorto, type AusenciaMotor, type Regla } from "@/lib/planificacion/motor";
import { posicionPct, type BloqueTablero } from "@/lib/planificacion/tablero";

/** Cliente tal como lo pinta el tablero (color vivo de configuración y su texto por contraste). */
export interface ClienteVista {
  codigo: string;
  nombre: string;
  color: string;
  texto: string;
}

/**
 * Un bloque del plan, posicionado en % dentro del día (el día va de
 * plan.inicioDiaMin a plan.finDiaMin). Es un botón: se enfoca con el teclado
 * y el tooltip explica por qué está ahí (regla + datos del motor). En F3
 * llevará además el menú de edición.
 */
export const Bloque = memo(function Bloque({
  bloque,
  cliente,
  clienteBase,
  inicioDiaMin,
  finDiaMin,
  nombreAgente,
}: {
  bloque: BloqueTablero;
  cliente: ClienteVista;
  clienteBase: string;
  inicioDiaMin: number;
  finDiaMin: number;
  nombreAgente: string;
}) {
  const { left, width } = posicionPct(bloque.inicioMin, bloque.finMin, inicioDiaMin, finDiaMin);
  const rango = rangoCorto(bloque.inicioMin, bloque.finMin);
  const explicacion = explicarBloque({ ...bloque, regla: bloque.regla as Regla }, clienteBase);
  return (
    <Tooltip>
      <TooltipTrigger
        className="@container absolute inset-y-1 flex items-center overflow-hidden rounded-sm border border-black/15 px-1 text-[10px] leading-none font-medium whitespace-nowrap outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-foreground"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: cliente.color, color: cliente.texto }}
        aria-label={`${nombreAgente}, ${cliente.nombre} de ${rango}. ${explicacion}`}
      >
        {bloque.fijado ? <Pin className="mr-0.5 size-2.5 shrink-0" aria-hidden /> : null}
        {/* Solo lo que cabe: nada en bloques muy estrechos, el código, y el horario si hay sitio */}
        <span className="hidden truncate @[1.9rem]:inline">
          {bloque.clienteCodigo}
          <span className="hidden @[4.5rem]:inline"> {rango}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm flex-col items-start gap-1">
        <div className="font-semibold">
          {nombreAgente} · {cliente.nombre} · {rango} ({horasTexto((bloque.finMin - bloque.inicioMin) / 60)})
        </div>
        <div>{explicacion}</div>
        {bloque.fijado && bloque.regla !== "fijado" ? (
          <div className="opacity-80">Fijado: el motor no lo toca al regenerar.</div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
});

/** Ausencia (vacaciones, permiso...) en rayado con el color de su tipo. */
export function BandaAusencia({
  ausencia,
  tipo,
  inicioDiaMin,
  finDiaMin,
}: {
  ausencia: AusenciaMotor;
  tipo: { nombre: string; color: string } | undefined;
  inicioDiaMin: number;
  finDiaMin: number;
}) {
  const { left, width } = posicionPct(ausencia.inicioMin, ausencia.finMin, inicioDiaMin, finDiaMin);
  if (width === 0) return null;
  const color = tipo?.color ?? "#BFBFBF";
  const completa = ausencia.inicioMin <= inicioDiaMin && ausencia.finMin >= finDiaMin;
  const texto = `${tipo?.nombre ?? ausencia.tipo} · ${completa ? "todo el día" : rangoCorto(ausencia.inicioMin, ausencia.finMin)}`;
  return (
    <Tooltip>
      <TooltipTrigger
        className="absolute inset-y-0.5 flex items-center overflow-hidden rounded-sm border border-dashed px-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          borderColor: color,
          backgroundImage: `repeating-linear-gradient(135deg, ${color}66 0 5px, transparent 5px 10px)`,
        }}
        aria-label={`Ausencia: ${texto}`}
      >
        <span className="truncate">{ausencia.tipo}</span>
      </TooltipTrigger>
      <TooltipContent>{texto}</TooltipContent>
    </Tooltip>
  );
}
