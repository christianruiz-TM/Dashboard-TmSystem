import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Campos de los formularios de configuración de planificación (server-rendered,
// sin JS de cliente), con el mismo aspecto que los inputs de shadcn.

export function Campo({
  etiqueta,
  htmlFor,
  ayuda,
  className,
  children,
}: {
  etiqueta: string;
  htmlFor?: string;
  ayuda?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{etiqueta}</Label>
      {children}
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  );
}

export function AreaTexto({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs",
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export function Casilla({ etiqueta, ...props }: { etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-foreground" {...props} />
      {etiqueta}
    </label>
  );
}

/** Muestra de color de un cliente o tipo de ausencia. */
export function Muestra({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-3.5 shrink-0 rounded-[3px] border border-black/15 align-middle", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
