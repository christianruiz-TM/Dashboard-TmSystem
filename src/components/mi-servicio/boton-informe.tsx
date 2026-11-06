"use client";

import { useState } from "react";
import { Download } from "lucide-react";
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
import { Label } from "@/components/ui/label";

const MAX_COMENTARIOS = 4000;

/** Nombre del fichero de la cabecera Content-Disposition (filename* UTF-8 primero). */
function nombreDeCabecera(cabecera: string | null): string {
  const utf8 = cabecera?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      /* sigue con el ASCII */
    }
  }
  return cabecera?.match(/filename="([^"]+)"/i)?.[1] ?? "Informe.html";
}

/**
 * «Descargar informe» de «Mi servicio» (06/11/2026): avisa de que el
 * informe lleva lo que hay en pantalla, deja escribir unos comentarios para
 * el cliente y baja el HTML (POST con JSON a /api/export/mi-servicio, que
 * vuelve a sacar los datos y deja la descarga en la auditoría).
 */
export function BotonInformeMiServicio({
  peticion,
  resumen,
}: {
  peticion: { servicio: string; desde: string; hasta: string; tipo: string | null; campania: string | null };
  /** Lo que se va a descargar, en palabras («GrupoHuertas · del 01/11 al 06/11 · Solo BBDD»). */
  resumen: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setDescargando(true);
    setError(null);
    try {
      const r = await fetch("/api/export/mi-servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio: peticion.servicio,
          desde: peticion.desde,
          hasta: peticion.hasta,
          tipo: peticion.tipo ?? undefined,
          campania: peticion.campania ?? undefined,
          comentarios: comentarios.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? `Error ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreDeCabecera(r.headers.get("Content-Disposition"));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setAbierto(false);
    } catch (e) {
      setError(`No se ha podido descargar el informe: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button />}>
        <Download /> Descargar informe
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Descargar el informe del cliente</DialogTitle>
          <DialogDescription>
            Se descarga solo lo que tienes ahora en pantalla: <strong className="text-foreground">{resumen}</strong>. Si
            quieres otro periodo, otro tipo o otra campaña, cámbialo antes de descargar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="ms-comentarios">Comentarios para el cliente (opcional)</Label>
          <textarea
            id="ms-comentarios"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            maxLength={MAX_COMENTARIOS}
            rows={5}
            placeholder="Por ejemplo, las conclusiones del mes o lo que cambió en la campaña."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            Salen al principio del informe y quedan guardados, con la descarga, en el registro de auditoría.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Es un solo fichero HTML que se abre sin conexión: se puede mandar por correo, filtrar por campaña y
          imprimir o guardar en PDF.
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={descargando}>
            Cancelar
          </Button>
          <Button onClick={descargar} disabled={descargando}>
            <Download /> {descargando ? "Preparando…" : "Descargar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
