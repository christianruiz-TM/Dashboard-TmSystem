"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Headset,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONOS: Record<string, LucideIcon> = {
  "/direccion": LayoutDashboard,
  "/operaciones": Building2,
  "/supervision": Headset,
  "/clientes": Users,
  "/admin": Settings,
};

export function NavLateral({
  items,
}: {
  items: { ruta: string; etiqueta: string }[];
}) {
  const rutaActual = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ ruta, etiqueta }) => {
        const Icono = ICONOS[ruta] ?? LayoutDashboard;
        const activa = rutaActual === ruta || rutaActual.startsWith(`${ruta}/`);
        return (
          <Link
            key={ruta}
            href={ruta}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activa
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icono className="h-4 w-4 shrink-0" />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
