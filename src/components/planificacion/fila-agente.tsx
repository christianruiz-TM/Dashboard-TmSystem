"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { horasTexto, type AusenciaMotor, type Tramo } from "@/lib/planificacion/motor";
import { posicionPct, saldoTexto, type BloqueTablero, type SaldoPrevisto } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { BandaAusencia, Bloque, type AccionesBloque, type ClienteVista } from "./bloque";

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
  /** null = solo lectura (sin arrastre, menú ni teclado). */
  edicion: (AccionesBloque & { nuevoBloque: (agente: string, fecha: string, minuto: number) => void }) | null;
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

interface PropsCelda {
  agente: string;
  dia: DiaColumna;
  nombreAgente: string;
  bloques: readonly BloqueTablero[];
  turno: readonly Tramo[];
  ausencias: readonly AusenciaMotor[];
  ctx: ContextoCeldas;
  alto?: string;
}

/**
 * Un agente en un día: su turno en gris claro de fondo (lo que queda gris es
 * turno sin bloque), las ausencias rayadas y los bloques encima. Si se puede
 * editar, es además el sitio donde se suelta un bloque arrastrado.
 */
export const CeldaDia = memo(function CeldaDia(props: PropsCelda) {
  return props.ctx.edicion ? <CeldaSoltable {...props} /> : <Celda {...props} />;
});

function CeldaSoltable(props: PropsCelda) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${props.agente}|${props.dia.fecha}`,
    data: { agente: props.agente, fecha: props.dia.fecha },
  });
  return <Celda {...props} refCelda={setNodeRef} encima={isOver} />;
}

function Celda({
  agente,
  dia,
  nombreAgente,
  bloques,
  turno,
  ausencias,
  ctx,
  alto = "h-10",
  refCelda,
  encima = false,
}: PropsCelda & { refCelda?: (el: HTMLElement | null) => void; encima?: boolean }) {
  const edicion = ctx.edicion;
  return (
    <div
      ref={refCelda}
      data-celda=""
      data-agente={agente}
      data-fecha={dia.fecha}
      className={cn("relative border-t border-l", alto, encima && "bg-primary/10 ring-2 ring-primary ring-inset")}
      style={fondoDia(ctx.nFranjas, dia.festivo)}
      onDoubleClick={
        edicion
          ? (e) => {
              // Doble clic en un hueco (no sobre un bloque): añadir un bloque ahí
              if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.turno) return;
              const r = e.currentTarget.getBoundingClientRect();
              const minuto = ctx.inicioDiaMin + ((e.clientX - r.left) / r.width) * (ctx.finDiaMin - ctx.inicioDiaMin);
              edicion.nuevoBloque(agente, dia.fecha, minuto);
            }
          : undefined
      }
    >
      {turno.map((t) => {
        const { left, width } = posicionPct(t.inicioMin, t.finMin, ctx.inicioDiaMin, ctx.finDiaMin);
        return (
          <div
            key={`t${t.inicioMin}`}
            data-turno=""
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
          edicion={edicion}
        />
      ))}
    </div>
  );
}

export interface FilaAgenteDatos {
  numero: string;
  nombre: string;
  contratoSemanalH: number | null;
  /** Horas planificadas en la semana que se ve y en el mes. */
  horasSemana: number;
  horasMes: number;
  /** Saldo previsto de la semana que se ve y del mes (null = sin contrato). */
  saldoSemana: SaldoPrevisto | null;
  saldoMes: SaldoPrevisto | null;
  /** fecha → bloques / turno / ausencias de ese día (solo los días visibles). */
  bloques: Record<string, BloqueTablero[]>;
  turnos: Record<string, Tramo[]>;
  ausencias: Record<string, AusenciaMotor[]>;
  /** Incidencias de validación del agente esa semana. */
  duras: number;
  blandas: number;
}

const VACIO: never[] = [];

function textoSaldo(nombre: string, s: SaldoPrevisto): string {
  return `${nombre}: ${horasTexto(s.plan)} planificadas + ${horasTexto(s.justificadas)} justificadas − ${horasTexto(s.contrato)} de contrato = ${saldoTexto(s.saldo)}`;
}

/** Fila de un agente en la vista semanal: su nombre, horas y saldo previsto, y una celda por día. */
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
  const s = fila.saldoSemana;
  const detalle = [
    `${horasTexto(fila.horasMes)} planificadas en el mes`,
    s ? textoSaldo("Saldo previsto de la semana", s) : null,
    fila.saldoMes ? textoSaldo("Del mes", fila.saldoMes) : null,
  ]
    .filter(Boolean)
    .join("\n");
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
        <div className="text-[11px] leading-tight text-muted-foreground tabular-nums" title={detalle}>
          {horasTexto(fila.horasSemana)}
          {s ? (
            <>
              {" · "}
              <span
                className={cn(
                  Math.round(s.saldo * 100) > 0 && "text-sky-700 dark:text-sky-400",
                  Math.round(s.saldo * 100) < 0 && "text-amber-700 dark:text-amber-400",
                )}
              >
                saldo {saldoTexto(s.saldo)}
              </span>
            </>
          ) : fila.contratoSemanalH == null ? (
            " · sin contrato"
          ) : null}
        </div>
      </div>
      {dias.map((d) => (
        <CeldaDia
          key={d.fecha}
          agente={fila.numero}
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
