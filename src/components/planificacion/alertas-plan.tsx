import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Alerta } from "@/lib/planificacion/alertas";
import { cn } from "@/lib/utils";

/** Alertas de planificación en Supervisión (las mismas de la vista «Hoy»). */
export function TarjetaAlertasPlan({ alertas, error }: { alertas: Alerta[]; error: string | null }) {
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
      <CardContent>
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
