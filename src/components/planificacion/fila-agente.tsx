"use client";

import { memo } from "react";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { horasTexto, type AusenciaMotor, type Tramo } from "@/lib/planificacion/motor";
import { posicionPct, type BloqueTablero } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { BandaAusencia, Bloque, type ClienteVista } from "./bloque";

/** Día que se pinta como columna. */
export interface DiaColumna {
  fecha: string;
  diaSemana: number;
  laborable: boolean;
  /** Festivo en el calendario del equipo. */
  festivo: boolean;
}

/** Lo común a todas las celdas del tablero (estable entre renders: va memoizado). */
export interface ContextoCeldas {
  clientes: ReadonlyMap<string, ClienteVista>;
  clienteBase: string;
  inicioDiaMin: number;
  finDiaMin: number;
  nFranjas: number;
  tiposAusencia: Record<string, { nombre: string; color: string }>;
}

const CLIENTE_DESCONOCIDO = (codigo: string): ClienteVista => ({
  codigo,
  nombre: codigo,
  color: "#E5E5E5",
  texto: "#000000",
});

/** Rejilla de horas (una línea por franja) y, en festivo, rayado gris. */
export function fondoDia(nFranjas: number, festivo: boolean): React.CSSProperties {
  const lineas = "linear-gradient(to right, var(--border) 1px, transparent 1px)";
  return festivo
    ? {
        backgroundImage: `repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px), ${lineas}`,
        backgroundSize: `auto, ${100 / nFranjas}% 100%`,
      }
    : { backgroundImage: lineas, backgroundSize: `${100 / nFranjas}% 100%` };
}

/**
 * Un agente en un día: su turno en gris claro de fondo (lo que queda gris es
 * turno sin bloque), las ausencias rayadas y los bloques encima.
 */
export const CeldaDia = memo(function CeldaDia({
  dia,
  nombreAgente,
  bloques,
  turno,
  ausencias,
  ctx,
  alto = "h-10",
}: {
  dia: DiaColumna;
  nombreAgente: string;
  bloques: readonly BloqueTablero[];
  turno: readonly Tramo[];
  ausencias: readonly AusenciaMotor[];
  ctx: ContextoCeldas;
  alto?: string;
}) {
  return (
    <div className={cn("relative border-t border-l", alto)} style={fondoDia(ctx.nFranjas, dia.festivo)}>
      {turno.map((t) => {
        const { left, width } = posicionPct(t.inicioMin, t.finMin, ctx.inicioDiaMin, ctx.finDiaMin);
        return (
          <div
            key={`t${t.inicioMin}`}
            className="absolute inset-y-1.5 rounded-sm bg-muted-foreground/15"
            style={{ left: `${left}%`, width: `${width}%` }}
            aria-hidden
          />
        );
      })}
      {ausencias.map((a) => (
        <BandaAusencia
          key={`a${a.inicioMin}-${a.tipo}`}
          ausencia={a}
          tipo={ctx.tiposAusencia[a.tipo]}
          inicioDiaMin={ctx.inicioDiaMin}
          finDiaMin={ctx.finDiaMin}
        />
      ))}
      {bloques.map((b) => (
        <Bloque
          key={b.id}
          bloque={b}
          cliente={ctx.clientes.get(b.clienteCodigo) ?? CLIENTE_DESCONOCIDO(b.clienteCodigo)}
          clienteBase={ctx.clienteBase}
          inicioDiaMin={ctx.inicioDiaMin}
          finDiaMin={ctx.finDiaMin}
          nombreAgente={nombreAgente}
        />
      ))}
    </div>
  );
});

export interface FilaAgenteDatos {
  numero: string;
  nombre: string;
  contratoSemanalH: number | null;
  /** Horas planificadas en la semana que se ve y en el mes. */
  horasSemana: number;
  horasMes: number;
  /** fecha → bloques / turno / ausencias de ese día (solo los días visibles). */
  bloques: Record<string, BloqueTablero[]>;
  turnos: Record<string, Tramo[]>;
  ausencias: Record<string, AusenciaMotor[]>;
  /** Incidencias de validación del agente esa semana. */
  duras: number;
  blandas: number;
}

const VACIO: never[] = [];

/** Fila de un agente en la vista semanal: su nombre y horas, y una celda por día. */
export const FilaAgente = memo(function FilaAgente({
  fila,
  dias,
  ctx,
  resaltado,
  alto,
}: {
  fila: FilaAgenteDatos;
  dias: readonly DiaColumna[];
  ctx: ContextoCeldas;
  resaltado: boolean;
  /** Altura de las celdas (la vista de día las hace más altas). */
  alto?: string;
}) {
  const etiqueta = `${fila.numero} ${fila.nombre}`.trim();
  return (
    <>
      <div
        id={`fila-${fila.numero}`}
        className={cn(
          "sticky left-0 z-10 flex min-w-0 flex-col justify-center border-t border-r bg-card px-2 py-1",
          resaltado && "bg-accent ring-2 ring-primary ring-inset",
        )}
      >
        <div className="flex items-center gap-1 text-sm leading-tight font-medium">
          <span className="truncate" title={etiqueta}>
            {etiqueta}
          </span>
          {fila.duras > 0 ? (
            <OctagonAlert className="size-3.5 shrink-0 text-destructive" aria-label={`${fila.duras} incidencias duras`} />
          ) : fila.blandas > 0 ? (
            <TriangleAlert className="size-3.5 shrink-0 text-amber-600" aria-label={`${fila.blandas} avisos`} />
          ) : null}
        </div>
        <div
          className="text-[11px] leading-tight text-muted-foreground tabular-nums"
          title={`${horasTexto(fila.horasMes)} en el mes`}
        >
          {horasTexto(fila.horasSemana)}
          {fila.contratoSemanalH != null ? ` · contrato ${fila.contratoSemanalH} h` : ""}
        </div>
      </div>
      {dias.map((d) => (
        <CeldaDia
          key={d.fecha}
          dia={d}
          nombreAgente={etiqueta}
          bloques={fila.bloques[d.fecha] ?? VACIO}
          turno={fila.turnos[d.fecha] ?? VACIO}
          ausencias={fila.ausencias[d.fecha] ?? VACIO}
          ctx={ctx}
          alto={alto}
        />
      ))}
    </>
  );
});
