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

/** Lo que «respetar mis cambios» conserva de una versión. */
export interface CambiosVersion {
  numero: number;
  /** Bloques fijados o editados a mano. */
  conservables: number;
  /** Semanas cambiadas A↔B en el tablero. */
  semanasAlternas: number;
}

/** «Los 3 bloques fijados o editados a mano y 1 semana cambiada A↔B se quedan tal cual». */
function textoConservar(v: CambiosVersion): string {
  const partes: string[] = [];
  if (v.conservables > 0) {
    partes.push(v.conservables === 1 ? "el bloque fijado o editado a mano" : `los ${v.conservables} bloques fijados o editados a mano`);
  }
  if (v.semanasAlternas > 0) {
    partes.push(v.semanasAlternas === 1 ? "la semana cambiada A↔B" : `las ${v.semanasAlternas} semanas cambiadas A↔B`);
  }
  if (partes.length === 0) {
    return `La v${v.numero} no tiene bloques fijados ni editados a mano: saldrá lo mismo que empezando de cero.`;
  }
  const lista = partes.join(" y ");
  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)} de la v${v.numero} se ${v.conservables + v.semanasAlternas === 1 ? "queda" : "quedan"} tal cual; el motor reparte el resto.`;
}

/**
 * «Generar borrador» (supervisión). Si el mes ya tiene borrador, pregunta
 * entre regenerarlo respetando los bloques fijados o editados a mano (y las
 * semanas cambiadas A↔B), o empezar de cero; el anterior queda como
 * «descartada». Si solo tiene la publicada, pregunta lo mismo sobre los
 * cambios de la publicada (16/11/2026), que no se toca.
 * La acción llega como prop desde el servidor, que es quien comprueba el rol.
 */
export function BotonGenerar({
  mes,
  nombreMes,
  borrador,
  publicada = null,
  accion,
  tamano = "default",
}: {
  mes: string;
  nombreMes: string;
  borrador: CambiosVersion | null;
  publicada?: CambiosVersion | null;
  accion: AccionGenerar;
  tamano?: "default" | "sm";
}) {
  const [estado, enviar] = useActionState(accion, { error: null });
  const error = estado.error ? (
    <Alert variant="destructive">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  ) : null;

  if (!borrador && !publicada) {
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

  const base = (borrador ?? publicada)!;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size={tamano} />}>
        {borrador ? (
          <>
            <RefreshCw /> Regenerar borrador
          </>
        ) : (
          <>
            <Sparkles /> Generar borrador
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {borrador ? "Regenerar" : "Generar"} el borrador de {nombreMes}
          </DialogTitle>
          <DialogDescription>
            {borrador
              ? `Ya hay un borrador (v${borrador.numero}). Se creará uno nuevo con los datos de hoy y el actual quedará como «descartada».`
              : `${nombreMes} ya tiene la v${publicada!.numero} publicada. Se creará un borrador nuevo con los datos de hoy; la publicada sigue igual hasta que publiques el borrador.`}
          </DialogDescription>
        </DialogHeader>
        <form action={enviar} className="grid gap-3">
          <input type="hidden" name="mes" value={mes} />
          <div className="grid gap-1">
            <Enviar modo="respetar">{borrador ? "Regenerar respetando mis cambios" : `Generar respetando los cambios de la v${base.numero}`}</Enviar>
            <p className="text-xs text-muted-foreground">{textoConservar(base)}</p>
          </div>
          <div className="grid gap-1">
            <Enviar modo="cero" variant="outline">
              Empezar de cero
            </Enviar>
            <p className="text-xs text-muted-foreground">
              El motor lo recalcula todo, también lo cambiado a mano y las semanas cambiadas A↔B.
            </p>
          </div>
          {!borrador ? (
            <p className="text-xs text-muted-foreground">
              Para una copia exacta de la publicada, sin recalcular nada, usa «Nuevo borrador desde la v{base.numero}» en el
              tablero.
            </p>
          ) : null}
          {error}
        </form>
      </DialogContent>
    </Dialog>
  );
}
