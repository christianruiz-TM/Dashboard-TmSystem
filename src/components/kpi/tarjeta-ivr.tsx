import { PhoneForwarded } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MetricasIvr } from "@/lib/rdb/types";

/**
 * Un dato suelto de la tarjeta. Declarado A NIVEL DE MÓDULO a propósito: si se
 * define dentro de TarjetaIvr, React lo trata como un componente distinto en
 * cada render y descarta su estado y su DOM (regla react-hooks/static-components).
 */
function Dato({
  valor,
  etiqueta,
  color,
}: {
  valor: string;
  etiqueta: string;
  color?: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${color ?? ""}`}>{valor}</div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

/**
 * Tarjeta de la métrica de IVR. De las llamadas entrantes que pasan por un IVR:
 * cuántas atiende un agente y cuántas no, separando las no atendidas que entran
 * EN HORARIO DE PRODUCCIÓN (había agentes logados) — las accionables — de las de
 * fuera de horario. Independiente del check "incluir IVR".
 */
export function TarjetaIvr({ ivr }: { ivr: MetricasIvr }) {
  const fueraHorario = Math.max(0, ivr.noAtendidas - ivr.noAtendidasEnHorario);
  const pct = (n: number) =>
    ivr.llamadas > 0 ? `${((n / ivr.llamadas) * 100).toFixed(1)} %` : "—";

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <PhoneForwarded className="h-4 w-4" />
          IVR · enrutado de entrantes
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Dato valor={ivr.llamadas.toLocaleString("es-ES")} etiqueta="Llamadas IVR" />
          <Dato
            valor={pct(ivr.atendidasAgente)}
            etiqueta={`Atendidas por agente (${ivr.atendidasAgente.toLocaleString("es-ES")})`}
            color="text-emerald-700"
          />
          <Dato
            valor={pct(ivr.noAtendidas)}
            etiqueta={`No atendidas (${ivr.noAtendidas.toLocaleString("es-ES")})`}
            color="text-muted-foreground"
          />
          <Dato
            valor={ivr.noAtendidasEnHorario.toLocaleString("es-ES")}
            etiqueta={`No atendidas en horario · fuera: ${fueraHorario.toLocaleString("es-ES")}`}
            color="text-red-600"
          />
        </div>
      </CardContent>
    </Card>
  );
}
