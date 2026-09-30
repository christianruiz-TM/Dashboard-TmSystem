"use client";

import { useMemo, useState } from "react";
import { rangoCorto } from "@/lib/planificacion/motor";
import { agentesEnFranja, diaCorto, fechaDiaMes, type BloqueTablero } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import type { ClienteVista } from "./bloque";
import type { DiaColumna } from "./fila-agente";
import { MapaCoberturaDia } from "./mapa-cobertura";

interface Seleccion {
  cliente: string;
  fecha: string;
  franja: number;
}

/**
 * Vista por cliente: una fila por cliente y, en cada día, cuántos agentes
 * tiene en cada franja. Al pulsar una celda se ve quiénes son. Arriba, el
 * mapa de cobertura del cliente base frente a su mínimo.
 */
export function VistaCliente({
  clientes,
  dias,
  franjas,
  pasoMin,
  clienteBase,
  bloques,
  cobertura,
  minimos,
  nombres,
}: {
  clientes: readonly (ClienteVista & { modo: string })[];
  dias: readonly DiaColumna[];
  franjas: readonly number[];
  pasoMin: number;
  clienteBase: string;
  bloques: readonly BloqueTablero[];
  cobertura: Record<string, number[]>;
  minimos: Record<string, number[]>;
  nombres: Record<string, string>;
}) {
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const fechas = useMemo(() => new Set(dias.map((d) => d.fecha)), [dias]);

  // `${cliente}|${fecha}` → agentes por franja (solo los días visibles)
  const conteos = useMemo(() => {
    const mapa = new Map<string, number[]>();
    for (const b of bloques) {
      if (!fechas.has(b.fecha)) continue;
      const k = `${b.clienteCodigo}|${b.fecha}`;
      const fila = mapa.get(k) ?? new Array(franjas.length).fill(0);
      franjas.forEach((f, i) => {
        if (b.inicioMin <= f && f + pasoMin <= b.finMin) fila[i]++;
      });
      mapa.set(k, fila);
    }
    return mapa;
  }, [bloques, fechas, franjas, pasoMin]);

  const detalle = useMemo(() => {
    if (!seleccion) return null;
    const agentes = agentesEnFranja(bloques, new Set([seleccion.cliente]), seleccion.fecha, seleccion.franja, pasoMin);
    return agentes.map((numero) => {
      const b = bloques.find(
        (x) =>
          x.agenteNumero === numero &&
          x.fecha === seleccion.fecha &&
          x.clienteCodigo === seleccion.cliente &&
          x.inicioMin <= seleccion.franja &&
          seleccion.franja + pasoMin <= x.finMin,
      );
      return { numero, nombre: nombres[numero] ?? "", rango: b ? rangoCorto(b.inicioMin, b.finMin) : "" };
    });
  }, [seleccion, bloques, pasoMin, nombres]);

  const columnas = { gridTemplateColumns: `11rem repeat(${dias.length}, minmax(0, 1fr))` };
  const diaSel = dias.find((d) => d.fecha === seleccion?.fecha);
  const clienteSel = clientes.find((c) => c.codigo === seleccion?.cliente);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="grid min-w-[900px]" style={columnas}>
          <div className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Cliente</div>
          {dias.map((d) => (
            <div key={d.fecha} className="border-l px-1 py-1 text-xs font-medium">
              {diaCorto(d.diaSemana)} {fechaDiaMes(d.fecha)}
              {d.festivo ? <span className="ml-1 font-normal text-muted-foreground">· festivo</span> : null}
            </div>
          ))}

          <div className="sticky left-0 z-10 flex items-center border-t border-r bg-card px-2 text-xs font-medium">
            {clienteBase} / mínimo
          </div>
          {dias.map((d) => (
            <MapaCoberturaDia
              key={d.fecha}
              fecha={d.fecha}
              diaSemana={d.diaSemana}
              franjas={franjas}
              pasoMin={pasoMin}
              cobertura={cobertura[d.fecha]}
              minimos={minimos[d.fecha]}
              clienteBase={clienteBase}
            />
          ))}

          {clientes.map((c) => (
            <FilaCliente
              key={c.codigo}
              cliente={c}
              dias={dias}
              franjas={franjas}
              pasoMin={pasoMin}
              conteos={conteos}
              seleccion={seleccion}
              onSeleccionar={setSeleccion}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 text-sm" aria-live="polite">
        {seleccion && diaSel && clienteSel && detalle ? (
          <>
            <div className="font-medium">
              {clienteSel.nombre} · {diaCorto(diaSel.diaSemana)} {fechaDiaMes(diaSel.fecha)} ·{" "}
              {rangoCorto(seleccion.franja, seleccion.franja + pasoMin)} h: {detalle.length}{" "}
              {detalle.length === 1 ? "agente" : "agentes"}
            </div>
            {detalle.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {detalle.map((a) => (
                  <li key={a.numero}>
                    <span className="font-medium text-foreground">
                      {a.numero} {a.nombre}
                    </span>{" "}
                    ({clienteSel.codigo} {a.rango})
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">Pulsa una celda para ver qué agentes están en ese cliente a esa hora.</span>
        )}
      </div>
    </div>
  );
}

function FilaCliente({
  cliente,
  dias,
  franjas,
  pasoMin,
  conteos,
  seleccion,
  onSeleccionar,
}: {
  cliente: ClienteVista & { modo: string };
  dias: readonly DiaColumna[];
  franjas: readonly number[];
  pasoMin: number;
  conteos: ReadonlyMap<string, number[]>;
  seleccion: Seleccion | null;
  onSeleccionar: (s: Seleccion) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-1.5 border-t border-r bg-card px-2 py-1">
        <span
          className="inline-block size-3 shrink-0 rounded-[3px] border border-black/15"
          style={{ backgroundColor: cliente.color }}
          aria-hidden
        />
        <span className="truncate text-sm font-medium" title={cliente.nombre}>
          {cliente.codigo}
        </span>
        {cliente.modo === "a_demanda" ? <span className="text-[10px] text-muted-foreground">a demanda</span> : null}
      </div>
      {dias.map((d) => {
        const fila = conteos.get(`${cliente.codigo}|${d.fecha}`);
        return (
          <div key={d.fecha} className="flex h-8 gap-px border-t border-l px-px py-0.5">
            {franjas.map((f, i) => {
              const n = fila?.[i] ?? 0;
              const elegida = seleccion?.cliente === cliente.codigo && seleccion.fecha === d.fecha && seleccion.franja === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSeleccionar({ cliente: cliente.codigo, fecha: d.fecha, franja: f })}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center rounded-[2px] text-[10px] font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                    n === 0 && "hover:bg-muted",
                    elegida && "ring-2 ring-foreground",
                  )}
                  style={n > 0 ? { backgroundColor: cliente.color, color: cliente.texto } : undefined}
                  aria-label={`${cliente.codigo}, ${diaCorto(d.diaSemana)} ${fechaDiaMes(d.fecha)} de ${rangoCorto(f, f + pasoMin)} h: ${n} agentes`}
                  aria-pressed={elegida}
                >
                  {n > 0 ? n : ""}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
