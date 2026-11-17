"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ============================================================
// Fila de tabla que se despliega (panel de RRHH, vista «Por agente»): la
// fila con sus cifras y, al pulsar la flecha (o la fila), otra debajo con el
// detalle. Lleva `data-orden` para que <FilasOrdenables> la mueva entera.
// Empieza cerrada; «abiertaInicial» la deja abierta (la fila de total).
// ============================================================

export function FilaDesplegable({
  primera,
  celdas,
  detalle,
  columnas,
  etiqueta,
  abiertaInicial = false,
  className,
  "data-orden": orden,
  "data-buscar": buscar,
}: {
  /** Contenido de la primera celda (va con la flecha delante). */
  primera: ReactNode;
  /** Las demás celdas (cada una, un <TableCell>). */
  celdas: ReactNode;
  detalle: ReactNode;
  /** Columnas de la tabla (para el colSpan del detalle). */
  columnas: number;
  /** Para lectores de pantalla: «Ver motivos de GH_0851». */
  etiqueta: string;
  abiertaInicial?: boolean;
  className?: string;
  "data-orden"?: string;
  "data-buscar"?: string;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  return (
    <>
      <TableRow data-orden={orden} data-buscar={buscar} className={cn("cursor-pointer", abierta && "bg-muted/50", className)} onClick={() => setAbierta((a) => !a)}>
        <TableCell className="whitespace-nowrap">
          <span className="inline-flex items-start gap-1.5">
            <button
              type="button"
              aria-expanded={abierta}
              aria-label={etiqueta}
              onClick={(e) => {
                e.stopPropagation();
                setAbierta((a) => !a);
              }}
              className="mt-0.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight className={cn("size-4 transition-transform", abierta && "rotate-90")} aria-hidden />
            </button>
            <span>{primera}</span>
          </span>
        </TableCell>
        {celdas}
      </TableRow>
      {abierta ? (
        <TableRow data-buscar={buscar} className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={columnas} className="p-4">
            {detalle}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
