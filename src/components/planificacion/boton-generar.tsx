"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type EstadoGenerar = { error: string | null };
type AccionGenerar = (previo: EstadoGenerar, formData: FormData) => Promise<EstadoGenerar>;

function Enviar({ modo, children, variant = "default", tamano = "default" }: {
  modo: "nuevo" | "respetar" | "cero";
  children: React.ReactNode;
  variant?: "default" | "outline";
  tamano?: "default" | "sm";
}) {
  const { pending, data } = useFormStatus();
  const este = pending && data?.get("modo") === modo;
  return (
    <Button type="submit" name="modo" value={modo} variant={variant} size={tamano} disabled={pending}>
      {este ? "Generando… (unos segundos)" : children}
    </Button>
  );
}

/**
 * «Generar borrador» (supervisión). Si el mes ya tiene borrador, pregunta
 * entre regenerarlo respetando los bloques fijados o editados a mano, o
 * empezar de cero; en los dos casos el anterior queda como «descartada».
 * La acción llega como prop desde el servidor, que es quien comprueba el rol.
 */
export function BotonGenerar({
  mes,
  nombreMes,
  borrador,
  accion,
  tamano = "default",
}: {
  mes: string;
  nombreMes: string;
  borrador: { numero: number; conservables: number } | null;
  accion: AccionGenerar;
  tamano?: "default" | "sm";
}) {
  const [estado, enviar] = useActionState(accion, { error: null });
  const error = estado.error ? (
    <Alert variant="destructive">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  ) : null;

  if (!borrador) {
    return (
      <form action={enviar} className="inline-flex max-w-md flex-col items-end gap-2">
        <input type="hidden" name="mes" value={mes} />
        <Enviar modo="nuevo" tamano={tamano}>
          <Sparkles /> Generar borrador
        </Enviar>
        {error}
      </form>
    );
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size={tamano} />}>
        <RefreshCw /> Regenerar borrador
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regenerar el borrador de {nombreMes}</DialogTitle>
          <DialogDescription>
            Ya hay un borrador (v{borrador.numero}). Se creará uno nuevo con los datos de hoy y el actual
            quedará como «descartada».
          </DialogDescription>
        </DialogHeader>
        <form action={enviar} className="grid gap-3">
          <input type="hidden" name="mes" value={mes} />
          <div className="grid gap-1">
            <Enviar modo="respetar">Regenerar respetando mis cambios</Enviar>
            <p className="text-xs text-muted-foreground">
              {borrador.conservables === 0
                ? "Este borrador no tiene bloques fijados ni editados a mano: saldrá lo mismo que empezando de cero."
                : borrador.conservables === 1
                  ? "El bloque fijado o editado a mano se queda tal cual; el motor reparte el resto."
                  : `Los ${borrador.conservables} bloques fijados o editados a mano se quedan tal cual; el motor reparte el resto.`}
            </p>
          </div>
          <div className="grid gap-1">
            <Enviar modo="cero" variant="outline">
              Empezar de cero
            </Enviar>
            <p className="text-xs text-muted-foreground">El motor lo recalcula todo, también lo cambiado a mano.</p>
          </div>
          {error}
        </form>
      </DialogContent>
    </Dialog>
  );
}
