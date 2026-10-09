import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Alerta } from "@/lib/planificacion/alertas";
import type { PendienteRevision } from "@/lib/planificacion/vistas";
import { cn } from "@/lib/utils";

/**
 * Alertas de planificación en Supervisión (las mismas de la vista «Hoy») y,
 * encima, los planes que ha preparado la tarea de la noche y esperan que
 * alguien los mire.
 */
export function TarjetaAlertasPlan({
  alertas,
  error,
  revisar = [],
}: {
  alertas: Alerta[];
  error: string | null;
  revisar?: PendienteRevision[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alertas de planificación</CardTitle>
        <CardDescription>
          Plan del día frente a quién está conectado y con qué usuario.{" "}
          <Link href="/planificacion/hoy" className="underline underline-offset-2">
            Ver el día
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {revisar.length > 0 ? (
          <ul className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            {revisar.map((p) => (
              <li key={`${p.mes}-${p.numero}`} className="flex gap-2">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  {p.texto}{" "}
                  <Link href={p.enlace.href} className="font-medium underline underline-offset-2">
                    {p.enlace.etiqueta}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive">No se pudieron calcular ({error}).</p>
        ) : alertas.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sin alertas ahora.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alertas.map((a, i) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.gravedad === "alta" ? "text-red-600" : "text-amber-600")} />
                <span>{a.mensaje}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
