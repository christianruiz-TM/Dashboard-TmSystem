import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Barra fija de arriba de un panel (12/11/2026, pedida por Christian: con
 * tanto scroll se perdía qué cliente y qué fechas se estaban mirando).
 * Se queda pegada al bajar y lleva:
 *  - fila 1: las pestañas principales del panel (`pestanas`) y los filtros;
 *  - fila 2: las secciones del panel, subrayadas para que no se confundan con
 *    las pestañas de arriba, y a la derecha `estado` (hora del último
 *    refresco, botón de actualizar…).
 * Sin hooks: sirve en paneles de servidor y de cliente. Las secciones son
 * enlaces: cada una es una URL y solo consulta lo suyo.
 */
export function BarraPanel({
  pestanas,
  filtros,
  secciones,
  actual,
  estado,
}: {
  pestanas?: ReactNode;
  filtros?: ReactNode;
  secciones?: { valor: string; etiqueta: string; href: string }[];
  actual?: string;
  estado?: ReactNode;
}) {
  return (
    // Los márgenes negativos la llevan de borde a borde del <main> (que tiene padding)
    <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:-mx-6 md:-mt-6 md:px-6 lg:-mx-8 lg:-mt-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        {pestanas ? <div className="flex flex-wrap items-center gap-3">{pestanas}</div> : <span />}
        {filtros ? <div className="flex flex-wrap items-center gap-3">{filtros}</div> : null}
      </div>
      {secciones?.length || estado ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4">
          <nav aria-label="Secciones" className="-mb-px flex flex-wrap">
            {(secciones ?? []).map((s) => {
              const activa = s.valor === actual;
              return (
                <Link
                  key={s.valor}
                  href={s.href}
                  aria-current={activa ? "page" : undefined}
                  className={cn(
                    "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    activa
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                  )}
                >
                  {s.etiqueta}
                </Link>
              );
            })}
          </nav>
          {estado ? <div className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">{estado}</div> : null}
        </div>
      ) : (
        <div className="pb-1" />
      )}
    </div>
  );
}
