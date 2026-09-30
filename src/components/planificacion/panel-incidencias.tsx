"use client";

import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Aviso, Gravedad } from "@/lib/planificacion/motor";
import { TITULOS_AVISO } from "@/lib/planificacion/tablero";

const GRAVEDADES: { gravedad: Gravedad; titulo: string; icono: React.ReactNode; texto: string }[] = [
  {
    gravedad: "dura",
    titulo: "Duras",
    icono: <OctagonAlert className="size-4 text-destructive" />,
    texto: "Impiden guardar y publicar.",
  },
  {
    gravedad: "blanda",
    titulo: "Blandas",
    icono: <TriangleAlert className="size-4 text-amber-600" />,
    texto: "Se puede publicar aceptándolas con un motivo.",
  },
  {
    gravedad: "info",
    titulo: "Informativas",
    icono: <Info className="size-4 text-muted-foreground" />,
    texto: "Contexto de los datos con que se generó.",
  },
];

const MAX_POR_GRUPO = 60;

/**
 * Incidencias del plan: las validaciones (recalculadas en el navegador sobre
 * los bloques y los datos vivos) y los avisos guardados al generar. Cada una
 * con agente o fecha lleva al sitio del tablero donde ocurre.
 */
export function PanelIncidencias({
  incidencias,
  avisosGeneracion,
  nombres,
  onIr,
}: {
  incidencias: readonly Aviso[];
  avisosGeneracion: readonly Aviso[];
  nombres: Record<string, string>;
  onIr: (aviso: Aviso) => void;
}) {
  const todos = [...incidencias, ...avisosGeneracion];
  return (
    <Card id="incidencias">
      <CardHeader>
        <CardTitle className="text-base">Incidencias y avisos</CardTitle>
        <CardDescription>
          Las validaciones se recalculan sobre el plan y los datos de hoy (una ausencia nueva ya cuenta); el resto son
          avisos del momento de generar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {todos.length === 0 ? <p className="text-muted-foreground">Sin incidencias.</p> : null}
        {GRAVEDADES.map(({ gravedad, titulo, icono, texto }) => {
          const deEsta = todos.filter((a) => a.gravedad === gravedad);
          if (deEsta.length === 0) return null;
          const grupos = new Map<string, Aviso[]>();
          for (const a of deEsta) grupos.set(a.codigo, [...(grupos.get(a.codigo) ?? []), a]);
          return (
            <section key={gravedad} className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 font-medium">
                {icono} {titulo} ({deEsta.length})
                <span className="text-xs font-normal text-muted-foreground">· {texto}</span>
              </h3>
              {[...grupos.entries()].map(([codigo, lista]) => (
                <details key={codigo} className="rounded-md border px-3 py-1.5" open={gravedad === "dura"}>
                  <summary className="cursor-pointer">
                    {TITULOS_AVISO[codigo] ?? codigo} <span className="text-muted-foreground">({lista.length})</span>
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {lista.slice(0, MAX_POR_GRUPO).map((a, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span>
                          {a.agente && nombres[a.agente] ? <span className="font-medium">{nombres[a.agente]}: </span> : null}
                          {a.mensaje}
                        </span>
                        {a.agente || a.fecha ? (
                          <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onIr(a)}>
                            Ver
                          </Button>
                        ) : null}
                      </li>
                    ))}
                    {lista.length > MAX_POR_GRUPO ? (
                      <li className="text-xs text-muted-foreground">… y {lista.length - MAX_POR_GRUPO} más</li>
                    ) : null}
                  </ul>
                </details>
              ))}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
