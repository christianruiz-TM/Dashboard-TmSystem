"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { horasTexto, type SemanaResumen } from "@/lib/planificacion/motor";
import { fechaDiaMes, type BarraBolsa } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import type { ClienteVista } from "./bloque";

function diferencia(horas: number, referencia: number | null): { texto: string; aviso: boolean } | null {
  if (referencia == null) return null;
  const d = horas - referencia;
  if (Math.abs(d) < 0.005) return { texto: "cuadra", aviso: false };
  const signo = d > 0 ? "+" : "−";
  return {
    texto: `${signo}${horasTexto(Math.abs(d))}`,
    aviso: referencia > 0 ? Math.abs(d) / referencia > 0.01 : true,
  };
}

/**
 * Horas planificadas del mes por cliente frente a su bolsa u objetivo. GH va
 * con los que cuentan como GH (BD y LX), que comparten su bolsa; BD y LX
 * llevan además su barra contra su objetivo. El trazo vertical marca la
 * referencia.
 */
export function BarrasBolsa({
  barras,
  clientes,
  semanas,
  horasCliente,
}: {
  barras: readonly BarraBolsa[];
  clientes: ReadonlyMap<string, ClienteVista>;
  semanas: readonly SemanaResumen[];
  horasCliente: ReadonlyMap<string, { total: number; porSemana: Record<string, number> }>;
}) {
  return (
    <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      {barras.map((b) => {
        const c = clientes.get(b.cliente);
        const etiqueta =
          b.tipo === "grupo" && b.segmentos.length > 1 ? b.segmentos.map((s) => s.cliente).join(" + ") : b.cliente;
        const escala = Math.max(b.horas, b.referencia ?? 0) || 1;
        const dif = diferencia(b.horas, b.referencia);
        const referencia =
          b.tipoReferencia === "bolsa"
            ? `bolsa${b.origenBolsa === "prorrateo" ? " prorrateada" : ""}`
            : b.tipoReferencia === "objetivo"
              ? "objetivo"
              : "sin referencia";
        const porSemana = semanas.map((s) => ({
          lunes: s.lunes,
          horas: b.segmentos.reduce((a, seg) => a + (horasCliente.get(seg.cliente)?.porSemana[s.lunes] ?? 0), 0),
        }));
        return (
          <div key={`${b.cliente}-${b.tipo}`} className={cn("grid grid-cols-[9rem_1fr] items-center gap-2 text-xs", b.miembroDe && "pl-4")}>
            <div
              className="flex min-w-0 items-center gap-1.5 font-medium"
              title={b.segmentos.length > 1 ? `${etiqueta}: comparten la bolsa de ${b.cliente}` : c?.nombre}
            >
              <span
                className="inline-block size-3 shrink-0 rounded-[3px] border border-black/15"
                style={{ backgroundColor: c?.color }}
                aria-hidden
              />
              <span className="truncate">{etiqueta}</span>
            </div>
            {b.tipo === "a_demanda" ? (
              <div className="text-muted-foreground">
                A demanda: sin bloques planificados
                {b.referencia != null ? ` · bolsa ${horasTexto(b.referencia)} (informativa)` : ""}
              </div>
            ) : (
              <div className="min-w-0">
                <Tooltip>
                  <TooltipTrigger
                    className="block w-full rounded outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                    aria-label={`${etiqueta}: ${horasTexto(b.horas)} planificadas${b.referencia != null ? ` de ${horasTexto(b.referencia)} (${referencia})` : ""}`}
                  >
                    <span className="relative flex h-3.5 w-full overflow-hidden rounded bg-muted">
                      {b.segmentos.map((s) => (
                        <span
                          key={s.cliente}
                          className="block h-full border-r border-black/10 last:border-r-0"
                          style={{ width: `${(s.horas / escala) * 100}%`, backgroundColor: clientes.get(s.cliente)?.color }}
                        />
                      ))}
                      {b.referencia != null ? (
                        <span
                          className="absolute inset-y-0 block w-0.5 bg-foreground"
                          style={{ left: `calc(${(b.referencia / escala) * 100}% - 1px)` }}
                        />
                      ) : null}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="flex-col items-start gap-0.5">
                    {b.segmentos.length > 1 ? (
                      <div>{b.segmentos.map((s) => `${s.cliente} ${horasTexto(s.horas)}`).join(" · ")}</div>
                    ) : null}
                    <div>
                      Por semana:{" "}
                      {porSemana.map((s) => `${fechaDiaMes(s.lunes)} ${horasTexto(s.horas)}`).join(" · ")}
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className="mt-0.5 flex justify-between gap-2 text-muted-foreground tabular-nums">
                  <span>
                    {horasTexto(b.horas)} / {b.referencia != null ? horasTexto(b.referencia) : "—"} ({referencia})
                  </span>
                  {dif ? <span className={cn(dif.aviso && "font-medium text-amber-700")}>{dif.texto}</span> : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
