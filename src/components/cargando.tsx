import { cn } from "@/lib/utils";

// ============================================================
// Animación de «Cargando» (12/11/2026), la MISMA en todo el panel: la capa
// borrosa al cambiar de página o de filtro (layout/carga-navegacion.tsx) y
// el hueco de cada sección mientras llegan sus consultas (<Suspense>).
// Sin hooks ni JS: es CSS, sirve en componentes de servidor y de cliente.
// ============================================================

/** Rueda con el amarillo de la marca. */
export function Rueda({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary",
        className,
      )}
    />
  );
}

/** Tarjeta de «Cargando…» con la rueda: el texto dice qué se está calculando. */
export function AvisoCargando({ texto = "Cargando…", className }: { texto?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm shadow-lg", className)}
    >
      <Rueda className="size-6" />
      <span className="font-medium">{texto}</span>
    </div>
  );
}

/**
 * Hueco de una sección mientras carga (fallback de <Suspense>): el sitio que
 * ocupará, con un fondo que respira, y el aviso en el centro.
 */
export function SeccionCargando({ texto, alto = "h-48" }: { texto: string; alto?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-muted/30", alto)}>
      <div className="absolute inset-0 animate-pulse bg-muted/40" />
      <div className="absolute inset-0 flex items-center justify-center">
        <AvisoCargando texto={texto} className="shadow-sm" />
      </div>
    </div>
  );
}
