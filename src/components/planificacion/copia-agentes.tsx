import { FileDown, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuntoAyuda } from "./punto-ayuda";

/**
 * Descarga de la copia del plan PUBLICADO para las agentes (sin cliente):
 * PDF de una página para imprimir o mandar, y HTML para el móvil.
 */
export function CopiaAgentes({ mes, numero }: { mes: string; numero: number }) {
  const url = (formato: "pdf" | "html") => `/api/planificacion/horario?mes=${mes}&formato=${formato}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1">
      <span className="text-xs font-medium">Copia para las agentes (v{numero} publicada)</span>
      <PuntoAyuda id="copia-agentes" />
      <Button variant="outline" size="xs" render={<a href={url("pdf")} download />} title="Una página A4 apaisada con todas: para imprimir o mandar">
        <FileDown /> PDF
      </Button>
      <Button
        variant="outline"
        size="xs"
        render={<a href={url("html")} download />}
        title="Un archivo para abrir en el móvil: cada una elige su nombre y puede pasar sus turnos a su calendario"
      >
        <Smartphone /> Para el móvil
      </Button>
    </div>
  );
}
