"use client";

import { Fragment, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  METRICAS_COMPARACION,
  formatearMetrica,
  mejorDeDos,
  type FilaCampaniaDireccion,
} from "@/lib/direccion";
import { cn } from "@/lib/utils";

// ============================================================
// Comparador de dos campañas (Dirección, 19/10/2026): dos desplegables y
// todas las métricas de cada una, con la diferencia. Trabaja con las filas
// que la página ya ha cargado: elegir otra campaña no consulta nada.
// ============================================================

const CLASE_SELECT =
  "h-8 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-72";

function SelectorCampania({
  etiqueta,
  valor,
  grupos,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  grupos: [string, FilaCampaniaDireccion[]][];
  onChange: (v: string) => void;
}) {
  const opciones = (filas: FilaCampaniaDireccion[]) =>
    filas.map((f) => (
      <option key={f.campania} value={f.campania}>
        {f.campania}
      </option>
    ));
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <select className={CLASE_SELECT} value={valor} onChange={(e) => onChange(e.target.value)}>
        {grupos.length === 1
          ? opciones(grupos[0][1])
          : grupos.map(([servicio, filas]) => (
              <optgroup key={servicio} label={servicio}>
                {opciones(filas)}
              </optgroup>
            ))}
      </select>
    </label>
  );
}

export function ComparadorCampanias({ filas }: { filas: FilaCampaniaDireccion[] }) {
  const [a, setA] = useState(filas[0]?.campania ?? "");
  const [b, setB] = useState(filas[1]?.campania ?? filas[0]?.campania ?? "");
  if (filas.length < 2) return null;

  // Campañas por cliente, en orden alfabético dentro de cada uno
  const porServicio = new Map<string, FilaCampaniaDireccion[]>();
  for (const f of [...filas].sort((x, y) => x.campania.localeCompare(y.campania))) {
    const s = f.servicio ?? "Sin cliente";
    porServicio.set(s, [...(porServicio.get(s) ?? []), f]);
  }
  const grupos = [...porServicio].sort(([x], [y]) => x.localeCompare(y));
  const fa = filas.find((f) => f.campania === a);
  const fb = filas.find((f) => f.campania === b);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparar dos campañas</CardTitle>
        <CardDescription>
          Las mismas cifras del período para las dos campañas. En verde, la que sale mejor en las
          métricas donde hay mejor y peor (en volumen no lo hay). Diferencia = B − A.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectorCampania etiqueta="Campaña A" valor={a} grupos={grupos} onChange={setA} />
          <button
            type="button"
            onClick={() => {
              setA(b);
              setB(a);
            }}
            className="inline-flex h-8 w-fit items-center gap-1 rounded-lg border border-border px-2 text-sm text-muted-foreground hover:text-foreground"
            title="Intercambiar A y B"
          >
            <ArrowLeftRight className="h-4 w-4" /> Intercambiar
          </button>
          <SelectorCampania etiqueta="Campaña B" valor={b} grupos={grupos} onChange={setB} />
        </div>

        {fa && fb ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Métrica</th>
                  <th className="py-2 pr-4 text-right">A · {fa.campania}</th>
                  <th className="py-2 pr-4 text-right">B · {fb.campania}</th>
                  <th className="py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-4 text-muted-foreground">Cliente · tipo</td>
                  <td className="py-2 pr-4 text-right">
                    {fa.servicio ?? "Sin cliente"} · {fa.tipo ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {fb.servicio ?? "Sin cliente"} · {fb.tipo ?? "—"}
                  </td>
                  <td />
                </tr>
                {METRICAS_COMPARACION.map(({ seccion, metricas }) => (
                  <Fragment key={seccion}>
                    <tr>
                      <td
                        colSpan={4}
                        className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {seccion}
                      </td>
                    </tr>
                    {metricas.map((m) => {
                      const va = fa[m.clave];
                      const vb = fb[m.clave];
                      const gana = mejorDeDos(va, vb, m.mejor);
                      const dif = va != null && vb != null ? vb - va : null;
                      // En volumen, la diferencia relativa ayuda a leerla
                      const rel =
                        m.formato !== "pct" && dif != null && va != null && va !== 0 ? (dif / va) * 100 : null;
                      return (
                        <tr key={m.clave} className="border-b last:border-0">
                          <td className="py-1.5 pr-4">{m.titulo}</td>
                          <td
                            className={cn(
                              "py-1.5 pr-4 text-right tabular-nums",
                              gana === "a" && "font-semibold text-emerald-700",
                            )}
                          >
                            {formatearMetrica(va, m.formato)}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 pr-4 text-right tabular-nums",
                              gana === "b" && "font-semibold text-emerald-700",
                            )}
                          >
                            {formatearMetrica(vb, m.formato)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {formatearMetrica(dif, m.formato, true)}
                            {rel != null ? (
                              <span className="ml-1 text-xs">
                                ({rel > 0 ? "+" : ""}
                                {rel.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %)
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
