"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { ruta: "/planificacion/configuracion/clientes", etiqueta: "Clientes y prefijos" },
  { ruta: "/planificacion/configuracion/agentes", etiqueta: "Agentes" },
  { ruta: "/planificacion/configuracion/patrones", etiqueta: "Patrones y turnos" },
  { ruta: "/planificacion/configuracion/parametros", etiqueta: "Parámetros" },
  { ruta: "/planificacion/configuracion/ausencias", etiqueta: "Tipos de ausencia" },
];

/** Pestañas de la configuración de planificación (marca la sección actual). */
export function NavConfiguracion() {
  const ruta = usePathname();
  return (
    <nav className="mt-2 flex flex-wrap gap-1 border-b">
      {SECCIONES.map((s) => (
        <Link
          key={s.ruta}
          href={s.ruta}
          aria-current={ruta === s.ruta ? "page" : undefined}
          className={cn(
            "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium",
            ruta === s.ruta
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
